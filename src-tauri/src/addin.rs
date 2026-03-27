use std::sync::Arc;
use tauri::{Emitter, Manager};
use tokio::sync::{Mutex, watch};

use crate::addin_server::AddinHub;

pub struct AddinState {
    hub: Mutex<Option<Arc<AddinHub>>>,
    shutdown_tx: Mutex<Option<watch::Sender<bool>>>,
    port: Mutex<u16>,
}

impl Default for AddinState {
    fn default() -> Self {
        Self {
            hub: Mutex::new(None),
            shutdown_tx: Mutex::new(None),
            port: Mutex::new(3001),
        }
    }
}

/// Start the Word Bridge server (in-process Rust/axum)
#[tauri::command]
pub async fn addin_start(
    app: tauri::AppHandle,
    state: tauri::State<'_, AddinState>,
    port: Option<u16>,
) -> Result<String, String> {
    // Already running?
    if state.hub.lock().await.is_some() {
        return Ok("Word Bridge is already running".into());
    }

    let actual_port = port.unwrap_or(3001);
    *state.port.lock().await = actual_port;

    let addin_dir = resolve_addin_dir(&app)?;
    let taskpane_dir = addin_dir.join("taskpane");
    let manifest_path = addin_dir.join("manifest.json");

    if !taskpane_dir.exists() {
        return Err(format!("Taskpane directory not found: {}", taskpane_dir.display()));
    }
    if !manifest_path.exists() {
        return Err("Add-in manifest not found".into());
    }

    let (hub, shutdown_tx) = crate::addin_server::start_server(
        app.clone(),
        actual_port,
        taskpane_dir,
        manifest_path,
    )
    .await?;

    *state.hub.lock().await = Some(hub);
    *state.shutdown_tx.lock().await = Some(shutdown_tx);

    let _ = app.emit(
        "addin-status",
        serde_json::json!({
            "running": true,
            "port": actual_port,
        }),
    );

    Ok(format!("Word Bridge started on port {}", actual_port))
}

/// Stop the Word Bridge server
#[tauri::command]
pub async fn addin_stop(
    app: tauri::AppHandle,
    state: tauri::State<'_, AddinState>,
) -> Result<String, String> {
    let shutdown_tx = state.shutdown_tx.lock().await.take();

    if let Some(tx) = shutdown_tx {
        let _ = tx.send(true);
        *state.hub.lock().await = None;

        let _ = app.emit(
            "addin-status",
            serde_json::json!({
                "running": false,
                "port": 0,
            }),
        );
        Ok("Word Bridge stopped".into())
    } else {
        Ok("Word Bridge was not running".into())
    }
}

/// Check bridge server status
#[tauri::command]
pub async fn addin_status(
    state: tauri::State<'_, AddinState>,
) -> Result<serde_json::Value, String> {
    let hub = state.hub.lock().await;
    let port = *state.port.lock().await;

    if let Some(ref h) = *hub {
        let mut status = h.get_status().await;
        if let Some(obj) = status.as_object_mut() {
            obj.insert("port".into(), serde_json::json!(port));
        }
        Ok(status)
    } else {
        Ok(serde_json::json!({
            "running": false,
            "port": port,
        }))
    }
}

/// Send a command to a Word client via the bridge
#[tauri::command]
pub async fn addin_send_command(
    state: tauri::State<'_, AddinState>,
    path: String,
    command: serde_json::Value,
) -> Result<serde_json::Value, String> {
    // Clone the Arc and drop the lock immediately — send_command_to_word
    // can take up to 30s and we must not hold the mutex across that await.
    let hub = state.hub.lock().await
        .as_ref()
        .ok_or("Word Bridge is not running")?
        .clone();

    let result = hub.send_command_to_word(&path, command).await?;

    // Check if the response contains an error field
    if let Some(err) = result.get("error") {
        return Err(err.as_str().unwrap_or("Unknown Word error").to_string());
    }

    Ok(result)
}

/// Install the add-in manifest for Word sideloading
#[tauri::command]
pub async fn addin_install_manifest(
    app: tauri::AppHandle,
) -> Result<String, String> {
    let addin_dir = resolve_addin_dir(&app)?;
    // Word's wef sideloading requires the classic XML manifest format
    let manifest_src = addin_dir.join("manifest.xml");

    if !manifest_src.exists() {
        return Err("Add-in manifest.xml not found".into());
    }

    // macOS: ~/Library/Containers/com.microsoft.Word/Data/Documents/wef/
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").map_err(|e| e.to_string())?;
        let wef_dir = std::path::PathBuf::from(&home)
            .join("Library/Containers/com.microsoft.Word/Data/Documents/wef");

        std::fs::create_dir_all(&wef_dir)
            .map_err(|e| format!("Failed to create wef directory: {}", e))?;

        let dest = wef_dir.join("shoulders-word-bridge.xml");
        std::fs::copy(&manifest_src, &dest)
            .map_err(|e| format!("Failed to copy manifest: {}", e))?;

        Ok(format!("Manifest installed to {}", dest.display()))
    }

    #[cfg(target_os = "windows")]
    {
        let appdata = std::env::var("LOCALAPPDATA").map_err(|e| e.to_string())?;
        let wef_dir = std::path::PathBuf::from(&appdata)
            .join("Microsoft\\Office\\16.0\\Wef");

        std::fs::create_dir_all(&wef_dir)
            .map_err(|e| format!("Failed to create wef directory: {}", e))?;

        let dest = wef_dir.join("shoulders-word-bridge.xml");
        std::fs::copy(&manifest_src, &dest)
            .map_err(|e| format!("Failed to copy manifest: {}", e))?;

        Ok(format!("Manifest installed to {}", dest.display()))
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Err("Word add-in sideloading is only supported on macOS and Windows".into())
    }
}

/// One-click setup: generate certs, trust CA (with admin prompt), install manifest, start server
#[tauri::command]
pub async fn addin_setup(
    app: tauri::AppHandle,
    state: tauri::State<'_, AddinState>,
) -> Result<String, String> {
    // 1. Generate certs if needed
    let cert_paths = crate::addin_certs::ensure_certs()?;

    // 2. Trust CA cert — shows macOS admin dialog (blocking, needs spawn_blocking)
    let ca_path = cert_paths.ca_cert.clone();
    tokio::task::spawn_blocking(move || {
        crate::addin_certs::trust_ca_interactive(&ca_path)
    })
    .await
    .map_err(|e| format!("Trust task failed: {}", e))?
    ?;

    // 3. Install manifest
    let addin_dir = resolve_addin_dir(&app)?;
    let manifest_src = addin_dir.join("manifest.xml");
    if !manifest_src.exists() {
        return Err("Add-in manifest.xml not found".into());
    }

    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").map_err(|e| e.to_string())?;
        let wef_dir = std::path::PathBuf::from(&home)
            .join("Library/Containers/com.microsoft.Word/Data/Documents/wef");
        std::fs::create_dir_all(&wef_dir)
            .map_err(|e| format!("Failed to create wef directory: {}", e))?;
        let dest = wef_dir.join("shoulders-word-bridge.xml");
        std::fs::copy(&manifest_src, &dest)
            .map_err(|e| format!("Failed to copy manifest: {}", e))?;
    }

    // 4. Start server if not running
    if state.hub.lock().await.is_none() {
        let _ = addin_start(app, state, None).await;
    }

    Ok("Word Bridge setup complete".into())
}

/// Check whether the Word Bridge is set up (certs, manifest, server running)
#[tauri::command]
pub async fn addin_is_setup(
    state: tauri::State<'_, AddinState>,
) -> Result<serde_json::Value, String> {
    let home = dirs::home_dir().ok_or("Could not determine home dir")?;
    let cert_dir = home.join(".shoulders").join("addin-certs");
    let certs_exist = cert_dir.join("server-cert.pem").exists()
        && cert_dir.join("server-key.pem").exists()
        && cert_dir.join("ca-cert.pem").exists();

    #[cfg(target_os = "macos")]
    let manifest_installed = {
        let wef_path = home.join("Library/Containers/com.microsoft.Word/Data/Documents/wef/shoulders-word-bridge.xml");
        wef_path.exists()
    };
    #[cfg(not(target_os = "macos"))]
    let manifest_installed = false;

    let running = state.hub.lock().await.is_some();

    Ok(serde_json::json!({
        "certs_exist": certs_exist,
        "manifest_installed": manifest_installed,
        "running": running,
    }))
}

fn resolve_addin_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    // In development, the addin directory is at the project root
    let dev_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap_or(std::path::Path::new("."))
        .join("addin");

    if dev_path.exists() {
        return Ok(dev_path);
    }

    // In production, look relative to the app resource dir
    let resource_path = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {}", e))?
        .join("addin");

    if resource_path.exists() {
        return Ok(resource_path);
    }

    Err("Could not find addin directory".into())
}
