use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde_json;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use tauri::Emitter;

/// Find the byte index up to which `data` contains complete UTF-8 characters.
/// Any trailing incomplete multi-byte sequence is excluded so it can be
/// buffered and combined with the next read.
fn utf8_safe_split(data: &[u8]) -> usize {
    if data.is_empty() {
        return 0;
    }
    let len = data.len();
    // Scan backwards (up to 3 bytes) looking for an incomplete sequence
    for i in 1..=3.min(len) {
        let b = data[len - i];
        if b < 0x80 {
            // ASCII byte — everything up to here is complete
            return len;
        }
        if b >= 0xC0 {
            // UTF-8 start byte — check if the sequence has enough continuation bytes
            let expected = if b >= 0xF0 { 4 } else if b >= 0xE0 { 3 } else { 2 };
            if i < expected {
                // Incomplete sequence — split before this start byte
                return len - i;
            }
            return len;
        }
        // Continuation byte (0x80..0xBF) — keep scanning for start byte
    }
    // 4+ continuation bytes with no start byte — malformed, emit everything
    len
}

pub struct PtySession {
    writer: Box<dyn Write + Send>,
    master: Box<dyn portable_pty::MasterPty + Send>,
}

pub struct PtyState {
    sessions: Mutex<HashMap<u32, PtySession>>,
    next_id: Mutex<u32>,
}

impl Default for PtyState {
    fn default() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            next_id: Mutex::new(1),
        }
    }
}

#[tauri::command]
pub async fn pty_spawn(
    app: tauri::AppHandle,
    state: tauri::State<'_, PtyState>,
    cmd: String,
    args: Vec<String>,
    cwd: String,
    cols: u16,
    rows: u16,
) -> Result<u32, String> {
    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let mut cmd_builder = CommandBuilder::new(&cmd);
    for arg in &args {
        cmd_builder.arg(arg);
    }
    cmd_builder.cwd(&cwd);

    // Set environment variables
    cmd_builder.env("TERM", "xterm-256color");
    // PROMPT/PS1 set from Terminal.vue post-spawn (not here) to avoid
    // variable-width prompt flash before the override kicks in

    let _child = pair.slave.spawn_command(cmd_builder).map_err(|e| e.to_string())?;

    // Drop the slave - we only need the master
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let mut id_lock = state.next_id.lock().unwrap();
    let id = *id_lock;
    *id_lock += 1;
    drop(id_lock);

    // Store session
    {
        let mut sessions = state.sessions.lock().unwrap();
        sessions.insert(
            id,
            PtySession {
                writer,
                master: pair.master,
            },
        );
    }

    // Spawn reader thread
    let event_name = format!("pty-output-{}", id);
    let app_clone = app.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        let mut leftover: Vec<u8> = Vec::new();
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    leftover.extend_from_slice(&buf[..n]);
                    // Find where we can safely split without breaking a multi-byte UTF-8 char
                    let split = utf8_safe_split(&leftover);
                    if split > 0 {
                        let data = String::from_utf8_lossy(&leftover[..split]).to_string();
                        let _ = app_clone.emit(&event_name, serde_json::json!({ "data": data }));
                    }
                    if split < leftover.len() {
                        leftover = leftover[split..].to_vec();
                    } else {
                        leftover.clear();
                    }
                }
                Err(_) => break,
            }
        }
        // Flush any remaining leftover bytes
        if !leftover.is_empty() {
            let data = String::from_utf8_lossy(&leftover).to_string();
            let _ = app_clone.emit(&event_name, serde_json::json!({ "data": data }));
        }
        // PTY closed - notify frontend
        let _ = app_clone.emit(
            &format!("pty-exit-{}", id),
            serde_json::json!({ "id": id }),
        );
    });

    Ok(id)
}

#[tauri::command]
pub async fn pty_write(
    state: tauri::State<'_, PtyState>,
    id: u32,
    data: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    if let Some(session) = sessions.get_mut(&id) {
        session
            .writer
            .write_all(data.as_bytes())
            .map_err(|e| e.to_string())?;
        session.writer.flush().map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("PTY session not found".to_string())
    }
}

#[tauri::command]
pub async fn pty_resize(
    state: tauri::State<'_, PtyState>,
    id: u32,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    // Ignore zero-dimension resize (hidden terminal via v-show)
    if cols == 0 || rows == 0 {
        return Ok(());
    }
    let sessions = state.sessions.lock().unwrap();
    if let Some(session) = sessions.get(&id) {
        session
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("PTY session not found".to_string())
    }
}

#[tauri::command]
pub async fn pty_kill(state: tauri::State<'_, PtyState>, id: u32) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    sessions.remove(&id);
    Ok(())
}
