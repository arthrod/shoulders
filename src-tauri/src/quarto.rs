use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;
use std::time::Instant;

// ---------------------------------------------------------------------------
// Binary detection
// ---------------------------------------------------------------------------

/// Find quarto CLI binary. No sidecar bundling — Quarto is a 200MB+
/// distribution that users install separately.
fn find_quarto() -> Option<String> {
    // 1. Common system install locations (Unix)
    #[cfg(unix)]
    {
        let candidates = [
            "/opt/homebrew/bin/quarto",
            "/usr/local/bin/quarto",
            "/usr/bin/quarto",
        ];
        for path in &candidates {
            if Path::new(path).exists() {
                return Some(path.to_string());
            }
        }
        // ~/.local/bin (user-local installs)
        if let Ok(home) = std::env::var("HOME") {
            let local_path = format!("{home}/.local/bin/quarto");
            if Path::new(&local_path).exists() {
                return Some(local_path);
            }
        }
    }

    // 1. Common install locations (Windows)
    #[cfg(windows)]
    {
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            let path = Path::new(&local_app_data)
                .join("Programs")
                .join("Quarto")
                .join("bin")
                .join("quarto.exe");
            if path.exists() {
                return Some(path.to_string_lossy().to_string());
            }
        }
        if let Ok(profile) = std::env::var("USERPROFILE") {
            let path = Path::new(&profile)
                .join("AppData")
                .join("Local")
                .join("Programs")
                .join("Quarto")
                .join("bin")
                .join("quarto.exe");
            if path.exists() {
                return Some(path.to_string_lossy().to_string());
            }
        }
    }

    // 2. Shell lookup fallback
    #[cfg(unix)]
    {
        let output = Command::new("/bin/bash")
            .args(&["-lc", "which quarto"])
            .output()
            .ok()?;
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return Some(path);
            }
        }
    }
    #[cfg(windows)]
    {
        let output = Command::new("where")
            .arg("quarto")
            .output()
            .ok()?;
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()?
                .trim()
                .to_string();
            if !path.is_empty() {
                return Some(path);
            }
        }
    }

    None
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuartoIssue {
    pub line: Option<u32>,
    pub message: String,
    pub severity: String, // "error" or "warning"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuartoRenderResult {
    pub success: bool,
    pub output_path: Option<String>,
    pub errors: Vec<QuartoIssue>,
    pub warnings: Vec<QuartoIssue>,
    pub log: String,
    pub duration_ms: u64,
}

// ---------------------------------------------------------------------------
// Output parsing
// ---------------------------------------------------------------------------

fn parse_quarto_output(stdout: &str, stderr: &str) -> (Vec<QuartoIssue>, Vec<QuartoIssue>) {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let combined = format!("{}\n{}", stdout, stderr);

    for line in combined.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        // Quarto error patterns
        if trimmed.starts_with("ERROR:")
            || trimmed.starts_with("error:")
            || trimmed.contains("Rendering halted")
        {
            let msg = trimmed
                .trim_start_matches("ERROR:")
                .trim_start_matches("error:")
                .trim();
            if !msg.is_empty() {
                errors.push(QuartoIssue {
                    line: extract_line_number(trimmed),
                    message: msg.to_string(),
                    severity: "error".to_string(),
                });
            }
        } else if trimmed.starts_with("WARNING:")
            || trimmed.starts_with("warning:")
            || trimmed.starts_with("WARN:")
        {
            let msg = trimmed
                .trim_start_matches("WARNING:")
                .trim_start_matches("warning:")
                .trim_start_matches("WARN:")
                .trim();
            if !msg.is_empty() {
                warnings.push(QuartoIssue {
                    line: extract_line_number(trimmed),
                    message: msg.to_string(),
                    severity: "warning".to_string(),
                });
            }
        }
    }

    // If process failed but no errors were parsed, capture last meaningful lines
    if errors.is_empty() && !stderr.trim().is_empty() {
        let meaningful: Vec<&str> = stderr
            .lines()
            .filter(|l| {
                let t = l.trim();
                !t.is_empty() && !t.starts_with("  ") && !t.starts_with("pandoc")
            })
            .collect();
        // Only treat as error if the process actually failed (caller handles this)
        if !meaningful.is_empty() {
            // Don't auto-create errors here — let the caller decide based on exit code
        }
    }

    (errors, warnings)
}

fn extract_line_number(line: &str) -> Option<u32> {
    // Try to find patterns like "line 42" or ":42:" in error messages
    if let Some(pos) = line.find("line ") {
        let after = &line[pos + 5..];
        let num_str: String = after.chars().take_while(|c| c.is_ascii_digit()).collect();
        if let Ok(n) = num_str.parse::<u32>() {
            return Some(n);
        }
    }
    // Try :N: pattern
    for part in line.split(':') {
        if let Ok(n) = part.trim().parse::<u32>() {
            if n > 0 && n < 100_000 {
                return Some(n);
            }
        }
    }
    None
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn is_quarto_available() -> bool {
    find_quarto().is_some()
}

#[derive(Debug, Deserialize)]
pub struct QuartoRenderRequest {
    pub path: String,
    pub format: String,                       // "docx", "pdf", "html"
    pub metadata: Vec<(String, String)>,      // key-value pairs for --metadata
    pub output_dir: Option<String>,           // optional --output-dir
}

#[tauri::command]
pub async fn quarto_render(request: QuartoRenderRequest) -> Result<QuartoRenderResult, String> {
    let quarto_bin = find_quarto().ok_or_else(|| {
        "Quarto not found. Install it from https://quarto.org/docs/get-started/".to_string()
    })?;

    let start = Instant::now();

    // Build command
    let mut cmd = Command::new(&quarto_bin);
    cmd.arg("render").arg(&request.path);
    cmd.arg("--to").arg(&request.format);

    // Add metadata flags
    for (key, value) in &request.metadata {
        cmd.arg("--metadata").arg(format!("{}:{}", key, value));
    }

    // Output directory
    if let Some(ref out_dir) = request.output_dir {
        cmd.arg("--output-dir").arg(out_dir);
    }

    // Set working directory to the file's parent
    if let Some(parent) = Path::new(&request.path).parent() {
        cmd.current_dir(parent);
    }

    // Run
    let output = cmd.output().map_err(|e| format!("Failed to run quarto: {}", e))?;
    let duration_ms = start.elapsed().as_millis() as u64;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let log = format!("{}\n{}", stdout, stderr);
    let success = output.status.success();

    let (mut errors, warnings) = parse_quarto_output(&stdout, &stderr);

    // If process failed but we found no structured errors, add stderr as a generic error
    if !success && errors.is_empty() {
        let stderr_trimmed = stderr.trim();
        if !stderr_trimmed.is_empty() {
            errors.push(QuartoIssue {
                line: None,
                message: stderr_trimmed.to_string(),
                severity: "error".to_string(),
            });
        } else {
            errors.push(QuartoIssue {
                line: None,
                message: format!(
                    "Quarto render failed with exit code {}",
                    output.status.code().unwrap_or(-1)
                ),
                severity: "error".to_string(),
            });
        }
    }

    // Derive output path: Quarto puts output alongside input with the format extension
    let output_path = if success {
        let ext = match request.format.as_str() {
            "docx" => "docx",
            "pdf" => "pdf",
            "html" => "html",
            other => other,
        };
        let input_path = Path::new(&request.path);
        let output_file = input_path.with_extension(ext);

        // If output-dir was specified, check there instead
        let final_path = if let Some(ref out_dir) = request.output_dir {
            let file_name = output_file
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            Path::new(out_dir).join(file_name)
        } else {
            output_file
        };

        if final_path.exists() {
            Some(final_path.to_string_lossy().to_string())
        } else {
            // Quarto may have created it — try to find from stdout
            // "Output created: path/to/file.docx"
            stdout
                .lines()
                .find(|l| l.starts_with("Output created:"))
                .and_then(|l| {
                    let path_str = l.trim_start_matches("Output created:").trim();
                    let p = if Path::new(path_str).is_absolute() {
                        Path::new(path_str).to_path_buf()
                    } else if let Some(parent) = input_path.parent() {
                        parent.join(path_str)
                    } else {
                        Path::new(path_str).to_path_buf()
                    };
                    if p.exists() {
                        Some(p.to_string_lossy().to_string())
                    } else {
                        None
                    }
                })
        }
    } else {
        None
    };

    Ok(QuartoRenderResult {
        success,
        output_path,
        errors,
        warnings,
        log,
        duration_ms,
    })
}
