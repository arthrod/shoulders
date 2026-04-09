use std::path::PathBuf;
use axum::Router;
use tokio::sync::{Mutex, watch};
use tower_http::services::ServeDir;
use tower_http::cors::CorsLayer;

// ── State ─────────────────────────────────────────────────────────

pub struct PreviewServerState {
    shutdown_tx: Mutex<Option<watch::Sender<bool>>>,
    port: Mutex<u16>,
}

impl Default for PreviewServerState {
    fn default() -> Self {
        Self {
            shutdown_tx: Mutex::new(None),
            port: Mutex::new(0),
        }
    }
}

// ── Server startup ────────────────────────────────────────────────

async fn start_preview_server(
    serve_root: PathBuf,
) -> Result<(u16, watch::Sender<bool>), String> {
    let router = Router::new()
        .fallback_service(
            ServeDir::new(&serve_root).append_index_html_on_directories(true),
        )
        .layer(CorsLayer::permissive());

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("Failed to bind preview server: {}", e))?;

    let port = listener
        .local_addr()
        .map_err(|e| format!("Failed to get local addr: {}", e))?
        .port();

    let (shutdown_tx, mut shutdown_rx) = watch::channel(false);

    tokio::spawn(async move {
        let server = axum::serve(listener, router);
        tokio::select! {
            result = server => {
                if let Err(e) = result {
                    eprintln!("[preview_server] Server error: {}", e);
                }
            }
            _ = shutdown_rx.changed() => {}
        }
    });

    eprintln!("[preview_server] Serving {} on http://127.0.0.1:{}", serve_root.display(), port);
    Ok((port, shutdown_tx))
}

// ── Tauri commands ────────────────────────────────────────────────

/// Start the preview server (idempotent — returns existing port if already running)
#[tauri::command]
pub async fn preview_start(
    state: tauri::State<'_, PreviewServerState>,
    workspace_path: String,
) -> Result<u16, String> {
    eprintln!("[preview_server] preview_start called with path: {}", workspace_path);
    // Already running?
    if state.shutdown_tx.lock().await.is_some() {
        return Ok(*state.port.lock().await);
    }

    let serve_root = PathBuf::from(&workspace_path);
    if !serve_root.is_dir() {
        return Err(format!("Workspace path is not a directory: {}", workspace_path));
    }

    let (port, shutdown_tx) = start_preview_server(serve_root).await?;

    *state.port.lock().await = port;
    *state.shutdown_tx.lock().await = Some(shutdown_tx);

    Ok(port)
}

/// Stop the preview server
#[tauri::command]
pub async fn preview_stop(
    state: tauri::State<'_, PreviewServerState>,
) -> Result<(), String> {
    let shutdown_tx = state.shutdown_tx.lock().await.take();
    if let Some(tx) = shutdown_tx {
        let _ = tx.send(true);
    }
    *state.port.lock().await = 0;
    Ok(())
}
