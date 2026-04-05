use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::Emitter;

pub struct WorkflowInstance {
    child: Child,
    stdin: std::process::ChildStdin,
}

pub struct WorkflowState {
    pub instances: Mutex<HashMap<String, WorkflowInstance>>,
}

impl Default for WorkflowState {
    fn default() -> Self {
        Self {
            instances: Mutex::new(HashMap::new()),
        }
    }
}

#[tauri::command]
pub async fn workflow_spawn(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkflowState>,
    run_id: String,
    workflow_dir: String,
    sdk_path: String,
    inputs_json: String,
    config_json: String,
) -> Result<(), String> {
    let mut child = Command::new("bun")
        .arg("run")
        .arg("run.js")
        .arg(&inputs_json)
        .arg(&config_json)
        .current_dir(&workflow_dir)
        .env("NODE_PATH", &sdk_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn workflow: {}", e))?;

    let stdin = child.stdin.take().ok_or("Failed to get stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to get stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to get stderr")?;

    // Store instance
    {
        let mut instances = state.instances.lock().unwrap();
        instances.insert(run_id.clone(), WorkflowInstance { child, stdin });
    }

    // Spawn stdout reader thread
    let app_stdout = app.clone();
    let run_id_stdout = run_id.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        let event_name = format!("workflow-message-{}", run_id_stdout);
        for line in reader.lines() {
            match line {
                Ok(data) => {
                    let _ = app_stdout
                        .emit(&event_name, serde_json::json!({ "data": data }));
                }
                Err(_) => break,
            }
        }
        // EOF or error — try to get exit code
        // The child is in the state map; we can't easily wait() on it from here
        // since we'd need &mut Child. Emit exit with null code; the frontend
        // or workflow_kill handles cleanup.
        let _ = app_stdout.emit(
            &format!("workflow-exit-{}", run_id_stdout),
            serde_json::json!({ "code": null }),
        );
    });

    // Spawn stderr reader thread
    let app_stderr = app.clone();
    let run_id_stderr = run_id.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        let event_name = format!("workflow-stderr-{}", run_id_stderr);
        for line in reader.lines() {
            match line {
                Ok(data) => {
                    let _ = app_stderr
                        .emit(&event_name, serde_json::json!({ "data": data }));
                }
                Err(_) => break,
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub fn workflow_respond(
    state: tauri::State<'_, WorkflowState>,
    run_id: String,
    message: String,
) -> Result<(), String> {
    let mut instances = state.instances.lock().unwrap();
    if let Some(instance) = instances.get_mut(&run_id) {
        let line = format!("{}\n", message);
        instance
            .stdin
            .write_all(line.as_bytes())
            .map_err(|e| format!("Failed to write to stdin: {}", e))?;
        instance
            .stdin
            .flush()
            .map_err(|e| format!("Failed to flush stdin: {}", e))?;
        Ok(())
    } else {
        Err(format!("Workflow instance not found: {}", run_id))
    }
}

#[tauri::command]
pub fn workflow_kill(
    state: tauri::State<'_, WorkflowState>,
    run_id: String,
) -> Result<(), String> {
    let mut instances = state.instances.lock().unwrap();
    if let Some(mut instance) = instances.remove(&run_id) {
        // Drop stdin to close the pipe (subprocess sees EOF)
        drop(instance.stdin);
        // Kill the child process
        let _ = instance.child.kill();
        Ok(())
    } else {
        // Already removed or never existed — not an error
        Ok(())
    }
}

#[tauri::command]
pub fn workflow_sdk_path() -> Result<String, String> {
    // Dev: resolve relative to Cargo.toml location (src-tauri/../workflow-sdk)
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    if let Some(repo_root) = manifest_dir.parent() {
        let sdk = repo_root.join("workflow-sdk");
        if sdk.exists() {
            return Ok(sdk.to_string_lossy().to_string());
        }
    }
    Err("workflow-sdk not found".to_string())
}

#[tauri::command]
pub fn workflow_check_bun() -> Result<String, String> {
    let output = Command::new("bun")
        .arg("--version")
        .output()
        .map_err(|e| format!("Bun not found: {}", e))?;

    if output.status.success() {
        let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(version)
    } else {
        Err("Bun returned non-zero exit code".to_string())
    }
}
