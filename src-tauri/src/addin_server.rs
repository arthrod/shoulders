use std::collections::HashMap;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use axum::{
    extract::{
        ws::{Message, WebSocket},
        State, WebSocketUpgrade,
    },
    response::{Html, IntoResponse, Json},
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use tauri::Emitter;
use tokio::sync::{mpsc, oneshot, Mutex, watch};
use tower_http::services::ServeDir;

use crate::addin_certs;

// ── Types ──────────────────────────────────────────────────────────

struct WordClient {
    path: String,
    metadata: serde_json::Value,
    tx: mpsc::UnboundedSender<String>,
}

pub struct AddinHub {
    word_clients: Mutex<HashMap<u64, WordClient>>,
    app_handle: tauri::AppHandle,
    pending_requests: Mutex<HashMap<String, oneshot::Sender<serde_json::Value>>>,
    next_id: AtomicU64,
    /// Path primed by the frontend before opening a file in Word.
    /// Consumed on next taskpane connect that has no path.
    expected_path: Mutex<Option<String>>,
}

impl AddinHub {
    fn new(app_handle: tauri::AppHandle) -> Self {
        Self {
            word_clients: Mutex::new(HashMap::new()),
            app_handle,
            pending_requests: Mutex::new(HashMap::new()),
            next_id: AtomicU64::new(1),
            expected_path: Mutex::new(None),
        }
    }

    pub async fn set_expected_path(&self, path: String) {
        *self.expected_path.lock().await = Some(path);
    }

    async fn take_expected_path(&self) -> Option<String> {
        self.expected_path.lock().await.take()
    }

    /// Send a command to a Word client and await response.
    pub async fn send_command_to_word(
        &self,
        path: &str,
        mut command: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        let clients = self.word_clients.lock().await;

        // Find the Word client by document path
        let client = clients
            .values()
            .find(|c| c.path == path)
            .ok_or_else(|| format!("No Word client connected for {}", path))?;

        // Generate requestId and inject into command
        let request_id = format!(
            "rust-{}-{}",
            self.next_id.fetch_add(1, Ordering::Relaxed),
            chrono::Utc::now().timestamp_millis()
        );

        if let Some(obj) = command.as_object_mut() {
            obj.insert("requestId".into(), serde_json::Value::String(request_id.clone()));
        }

        let tx = client.tx.clone();
        drop(clients); // Release lock before awaiting

        // Create oneshot for the response
        let (resp_tx, resp_rx) = oneshot::channel();
        self.pending_requests.lock().await.insert(request_id.clone(), resp_tx);

        // Send command via WebSocket
        tx.send(serde_json::to_string(&command).map_err(|e| e.to_string())?)
            .map_err(|_| "Word client disconnected".to_string())?;

        // Await response with 30s timeout
        match tokio::time::timeout(std::time::Duration::from_secs(30), resp_rx).await {
            Ok(Ok(result)) => Ok(result),
            Ok(Err(_)) => Err("Response channel closed".into()),
            Err(_) => {
                // Clean up timed-out request
                self.pending_requests.lock().await.remove(&request_id);
                Err("Request timed out after 30s".into())
            }
        }
    }

    /// Get status summary
    pub async fn get_status(&self) -> serde_json::Value {
        let clients = self.word_clients.lock().await;
        let word_connections: Vec<_> = clients
            .values()
            .map(|c| {
                serde_json::json!({
                    "path": c.path,
                    "metadata": c.metadata,
                })
            })
            .collect();

        serde_json::json!({
            "running": true,
            "wordConnections": word_connections,
        })
    }
}

// ── WebSocket handler ──────────────────────────────────────────────

type HubState = Arc<AddinHub>;

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(hub): State<HubState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, hub))
}

async fn root_handler() -> Html<&'static str> {
    Html("<html><body><h1>Shoulders Word Bridge</h1><p>Running</p></body></html>")
}

async fn handle_socket(socket: WebSocket, hub: HubState) {
    let (mut ws_tx, mut ws_rx) = socket.split();

    // Wait for handshake message
    let handshake = match ws_rx.next().await {
        Some(Ok(Message::Text(text))) => {
            match serde_json::from_str::<serde_json::Value>(&text) {
                Ok(v) => v,
                Err(_) => return,
            }
        }
        _ => return,
    };

    let client_type = handshake
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    match client_type {
        "word-connect" => {
            handle_word_client(handshake, ws_tx, ws_rx, hub).await;
        }
        "shoulders-connect" => {
            // Shoulders frontend no longer uses WebSocket — this is a no-op.
            // But keep it for any legacy connections: just send ack and close.
            let ack = serde_json::json!({ "type": "connected", "clientType": "shoulders" });
            let _ = ws_tx.send(Message::Text(serde_json::to_string(&ack).unwrap().into())).await;
        }
        _ => {
            let _ = ws_tx.close().await;
        }
    }
}

async fn handle_word_client(
    handshake: serde_json::Value,
    mut ws_tx: futures_util::stream::SplitSink<WebSocket, Message>,
    mut ws_rx: futures_util::stream::SplitStream<WebSocket>,
    hub: HubState,
) {
    let handshake_path = handshake
        .get("path")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    // Resolve path: prefer what the taskpane sent, fall back to expected_path
    let path = if handshake_path.is_empty() {
        let expected = hub.take_expected_path().await;
        if let Some(ref p) = expected {
            eprintln!("[addin_server] Taskpane sent no path, using expected: {}", p);
        } else {
            eprintln!("[addin_server] Taskpane sent no path and no expected_path set");
        }
        expected.unwrap_or_default()
    } else {
        handshake_path
    };

    let metadata = handshake
        .get("metadata")
        .cloned()
        .unwrap_or(serde_json::Value::Null);

    // Send connected ack — include resolved path so taskpane can update
    let ack = serde_json::json!({
        "type": "connected",
        "clientType": "word",
        "resolvedPath": if path.is_empty() { serde_json::Value::Null } else { serde_json::Value::String(path.clone()) },
    });
    if ws_tx.send(Message::Text(serde_json::to_string(&ack).unwrap().into())).await.is_err() {
        return;
    }

    // Create channel for sending messages to this client
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();

    let client_id = hub.next_id.fetch_add(1, Ordering::Relaxed);
    hub.word_clients.lock().await.insert(
        client_id,
        WordClient {
            path: path.clone(),
            metadata: metadata.clone(),
            tx,
        },
    );

    // Emit file-opened event to Tauri frontend
    let _ = hub.app_handle.emit(
        "word-bridge-event",
        serde_json::json!({
            "type": "file-opened",
            "path": path,
            "metadata": metadata,
        }),
    );

    // Spawn task to forward messages from channel → WebSocket
    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_tx.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    });

    // Read messages from WebSocket
    while let Some(msg_result) = ws_rx.next().await {
        match msg_result {
            Ok(Message::Text(text)) => {
                if let Ok(msg) = serde_json::from_str::<serde_json::Value>(&text) {
                    handle_word_message(&hub, client_id, msg).await;
                }
            }
            Ok(Message::Close(_)) => break,
            Err(_) => break,
            _ => {}
        }
    }

    // ── Cleanup on disconnect ──────────────────────────────────────

    send_task.abort();

    let removed = hub.word_clients.lock().await.remove(&client_id);
    if let Some(client) = removed {
        let _ = hub.app_handle.emit(
            "word-bridge-event",
            serde_json::json!({
                "type": "file-closed",
                "path": client.path,
            }),
        );
    }
}

async fn handle_word_message(hub: &AddinHub, client_id: u64, msg: serde_json::Value) {
    let msg_type = msg.get("type").and_then(|v| v.as_str()).unwrap_or("");

    if msg_type == "response" {
        // Complete a pending request
        if let Some(request_id) = msg.get("requestId").and_then(|v| v.as_str()) {
            if let Some(tx) = hub.pending_requests.lock().await.remove(request_id) {
                // Send the full response — caller extracts result/error
                let result = if let Some(err) = msg.get("error") {
                    serde_json::json!({ "error": err })
                } else {
                    msg.get("result").cloned().unwrap_or(serde_json::Value::Null)
                };
                let _ = tx.send(result);
            }
        }
        return;
    }

    // Update client path on file-opened
    if msg_type == "file-opened" {
        if let Some(new_path) = msg.get("path").and_then(|v| v.as_str()) {
            let mut clients = hub.word_clients.lock().await;
            if let Some(client) = clients.get_mut(&client_id) {
                client.path = new_path.to_string();
                if let Some(meta) = msg.get("metadata") {
                    client.metadata = meta.clone();
                }
            }
        }
    }

    // Forward all Word events to Tauri frontend
    let _ = hub.app_handle.emit("word-bridge-event", &msg);
}

// ── HTTP routes ────────────────────────────────────────────────────

async fn status_handler(State(hub): State<HubState>) -> Json<serde_json::Value> {
    Json(hub.get_status().await)
}

// ── Server startup ─────────────────────────────────────────────────

pub async fn start_server(
    app: tauri::AppHandle,
    port: u16,
    taskpane_dir: PathBuf,
    manifest_path: PathBuf,
) -> Result<(Arc<AddinHub>, watch::Sender<bool>), String> {
    // Load TLS certs
    let cert_paths = addin_certs::ensure_certs()?;

    let acceptor = axum_server::tls_rustls::RustlsConfig::from_pem_file(
        &cert_paths.server_cert,
        &cert_paths.server_key,
    )
    .await
    .map_err(|e| format!("TLS config error: {}", e))?;

    let hub = Arc::new(AddinHub::new(app));

    // Build manifest route — serve the file directly
    let manifest_bytes = std::fs::read(&manifest_path)
        .map_err(|e| format!("Failed to read manifest: {}", e))?;

    let router = Router::new()
        .route("/ws", get(ws_handler))
        .route("/", get(root_handler))
        .route("/api/status", get(status_handler))
        .route(
            "/manifest.xml",
            get(move || {
                let bytes = manifest_bytes.clone();
                async move {
                    (
                        [(axum::http::header::CONTENT_TYPE, "application/xml")],
                        bytes,
                    )
                }
            }),
        )
        .nest_service("/taskpane", ServeDir::new(taskpane_dir))
        .with_state(hub.clone());

    let addr = SocketAddr::from(([127, 0, 0, 1], port));

    let (shutdown_tx, mut shutdown_rx) = watch::channel(false);

    // Spawn the server in a background task
    tokio::spawn(async move {
        let server = axum_server::bind_rustls(addr, acceptor)
            .serve(router.into_make_service());

        tokio::select! {
            result = server => {
                if let Err(e) = result {
                    eprintln!("[addin_server] Server error: {}", e);
                }
            }
            _ = shutdown_rx.changed() => {
                // Shutdown signal received
            }
        }
    });

    // Wait briefly for server to start (or fail)
    // Give it a moment to bind
    tokio::time::sleep(std::time::Duration::from_millis(200)).await;

    // Check that the port is actually listening
    match tokio::net::TcpStream::connect(addr).await {
        Ok(_) => {
            eprintln!("[addin_server] Server listening on https://localhost:{}", port);
        }
        Err(e) => {
            return Err(format!("Server failed to start on port {}: {}", port, e));
        }
    }

    Ok((hub, shutdown_tx))
}
