use std::collections::HashMap;
use std::sync::Arc;

use axum::{
    extract::State,
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Json},
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tokio::sync::{oneshot, Mutex, watch};

// ── State ─────────────────────────────────────────────────────────

pub struct ToolServerState {
    shutdown_tx: Mutex<Option<watch::Sender<bool>>>,
    port: Mutex<u16>,
    token: Mutex<String>,
    hub: Mutex<Option<Arc<ToolHub>>>,
}

impl Default for ToolServerState {
    fn default() -> Self {
        Self {
            shutdown_tx: Mutex::new(None),
            port: Mutex::new(0),
            token: Mutex::new(String::new()),
            hub: Mutex::new(None),
        }
    }
}

struct ToolHub {
    app_handle: tauri::AppHandle,
    pending: Mutex<HashMap<String, oneshot::Sender<ToolResponse>>>,
}

#[derive(Serialize)]
struct ToolRequest {
    id: String,
    tool: String,
    input: serde_json::Value,
}

#[derive(Deserialize, Clone)]
pub struct ToolResponse {
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
}

#[derive(Deserialize)]
struct CallBody {
    tool: String,
    input: Option<serde_json::Value>,
}

#[derive(Clone)]
struct AppState {
    hub: Arc<ToolHub>,
    token: String,
}

// ── Auth middleware (simple bearer check) ──────────────────────────

fn check_auth(headers: &HeaderMap, expected: &str) -> Result<(), (StatusCode, Json<serde_json::Value>)> {
    let auth = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if let Some(token) = auth.strip_prefix("Bearer ") {
        if token == expected {
            return Ok(());
        }
    }

    Err((
        StatusCode::UNAUTHORIZED,
        Json(serde_json::json!({ "error": "unauthorized", "message": "Missing or invalid Bearer token. Read .shoulders/tool-server-token for the token." })),
    ))
}

// ── Route handlers ────────────────────────────────────────────────

async fn handle_call(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CallBody>,
) -> impl IntoResponse {
    if let Err(e) = check_auth(&headers, &state.token) {
        return e.into_response();
    }

    let id = uuid::Uuid::new_v4().to_string();
    let (tx, rx) = oneshot::channel();
    state.hub.pending.lock().await.insert(id.clone(), tx);

    let request = ToolRequest {
        id: id.clone(),
        tool: body.tool.clone(),
        input: body.input.unwrap_or(serde_json::json!({})),
    };

    if let Err(e) = state.hub.app_handle.emit("tool-call-request", &request) {
        state.hub.pending.lock().await.remove(&id);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "emit_failed", "message": e.to_string() })),
        ).into_response();
    }

    // Await response with 120s timeout
    match tokio::time::timeout(std::time::Duration::from_secs(120), rx).await {
        Ok(Ok(resp)) => {
            if let Some(err) = resp.error {
                (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "tool_error", "message": err }))).into_response()
            } else {
                Json(serde_json::json!({ "result": resp.result })).into_response()
            }
        }
        Ok(Err(_)) => {
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": "channel_closed" }))).into_response()
        }
        Err(_) => {
            state.hub.pending.lock().await.remove(&id);
            (StatusCode::GATEWAY_TIMEOUT, Json(serde_json::json!({ "error": "timeout", "message": "Tool execution timed out after 120s" }))).into_response()
        }
    }
}

async fn handle_schema(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    if let Err(e) = check_auth(&headers, &state.token) {
        return e.into_response();
    }

    let id = uuid::Uuid::new_v4().to_string();
    let (tx, rx) = oneshot::channel();
    state.hub.pending.lock().await.insert(id.clone(), tx);

    let request = ToolRequest {
        id: id.clone(),
        tool: "__schema__".to_string(),
        input: serde_json::json!({}),
    };

    if let Err(e) = state.hub.app_handle.emit("tool-call-request", &request) {
        state.hub.pending.lock().await.remove(&id);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "emit_failed", "message": e.to_string() })),
        ).into_response();
    }

    match tokio::time::timeout(std::time::Duration::from_secs(10), rx).await {
        Ok(Ok(resp)) => Json(serde_json::json!({ "tools": resp.result })).into_response(),
        Ok(Err(_)) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": "channel_closed" }))).into_response(),
        Err(_) => {
            state.hub.pending.lock().await.remove(&id);
            (StatusCode::GATEWAY_TIMEOUT, Json(serde_json::json!({ "error": "timeout" }))).into_response()
        }
    }
}

// ── Server startup ────────────────────────────────────────────────

async fn start_server(
    app: tauri::AppHandle,
    port: u16,
    token: String,
) -> Result<(Arc<ToolHub>, watch::Sender<bool>), String> {
    let hub = Arc::new(ToolHub {
        app_handle: app,
        pending: Mutex::new(HashMap::new()),
    });

    let state = AppState {
        hub: hub.clone(),
        token,
    };

    let router = Router::new()
        .route("/api/tools/call", post(handle_call))
        .route("/api/tools", get(handle_schema))
        .with_state(state);

    let addr: std::net::SocketAddr = ([127, 0, 0, 1], port).into();
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| format!("Failed to bind tool server on port {}: {}", port, e))?;

    let bound_port = listener
        .local_addr()
        .map_err(|e| format!("Failed to get local addr: {}", e))?
        .port();

    let (shutdown_tx, mut shutdown_rx) = watch::channel(false);

    tokio::spawn(async move {
        let server = axum::serve(listener, router);
        tokio::select! {
            result = server => {
                if let Err(e) = result {
                    eprintln!("[tool_server] Server error: {}", e);
                }
            }
            _ = shutdown_rx.changed() => {}
        }
    });

    eprintln!("[tool_server] Running on http://127.0.0.1:{}", bound_port);
    Ok((hub, shutdown_tx))
}

// ── Tauri commands ────────────────────────────────────────────────

const DEFAULT_PORT: u16 = 17532;

#[tauri::command]
pub async fn tool_server_start(
    app: tauri::AppHandle,
    state: tauri::State<'_, ToolServerState>,
    port: Option<u16>,
) -> Result<serde_json::Value, String> {
    // Already running?
    if state.shutdown_tx.lock().await.is_some() {
        let p = *state.port.lock().await;
        let t = state.token.lock().await.clone();
        return Ok(serde_json::json!({ "port": p, "token": t }));
    }

    let port = port.unwrap_or(DEFAULT_PORT);
    let token = uuid::Uuid::new_v4().to_string();

    let (hub, shutdown_tx) = start_server(app, port, token.clone()).await?;

    *state.hub.lock().await = Some(hub);
    *state.shutdown_tx.lock().await = Some(shutdown_tx);
    *state.port.lock().await = port;
    *state.token.lock().await = token.clone();

    Ok(serde_json::json!({ "port": port, "token": token }))
}

#[tauri::command]
pub async fn tool_server_stop(
    state: tauri::State<'_, ToolServerState>,
) -> Result<(), String> {
    let shutdown_tx = state.shutdown_tx.lock().await.take();
    if let Some(tx) = shutdown_tx {
        let _ = tx.send(true);
    }
    *state.hub.lock().await = None;
    *state.port.lock().await = 0;
    *state.token.lock().await = String::new();
    Ok(())
}

#[tauri::command]
pub async fn tool_server_status(
    state: tauri::State<'_, ToolServerState>,
) -> Result<serde_json::Value, String> {
    let running = state.shutdown_tx.lock().await.is_some();
    let port = *state.port.lock().await;
    Ok(serde_json::json!({ "running": running, "port": port }))
}

/// Called by the frontend to complete a pending tool call
#[tauri::command]
pub async fn tool_call_response(
    state: tauri::State<'_, ToolServerState>,
    id: String,
    result: Option<serde_json::Value>,
    error: Option<String>,
) -> Result<(), String> {
    let hub = state.hub.lock().await;
    if let Some(hub) = hub.as_ref() {
        if let Some(tx) = hub.pending.lock().await.remove(&id) {
            let _ = tx.send(ToolResponse { result, error });
        }
    }
    Ok(())
}
