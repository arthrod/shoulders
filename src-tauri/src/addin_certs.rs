use std::fs;
use std::path::PathBuf;
use std::process::Command;

use rcgen::{
    CertificateParams, DnType, IsCa, BasicConstraints, KeyPair,
    KeyUsagePurpose, SanType,
};

/// Paths to the PEM files stored in ~/.shoulders/addin-certs/
pub struct CertPaths {
    pub ca_cert: PathBuf,
    pub server_key: PathBuf,
    pub server_cert: PathBuf,
}

fn cert_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    Ok(home.join(".shoulders").join("addin-certs"))
}

/// Ensure self-signed TLS certs exist for the bridge server.
/// Generates CA + server cert on first run, returns paths to PEM files.
pub fn ensure_certs() -> Result<CertPaths, String> {
    let dir = cert_dir()?;
    let paths = CertPaths {
        ca_cert: dir.join("ca-cert.pem"),
        server_key: dir.join("server-key.pem"),
        server_cert: dir.join("server-cert.pem"),
    };

    // Return cached certs if they already exist
    if paths.server_key.exists() && paths.server_cert.exists() && paths.ca_cert.exists() {
        return Ok(paths);
    }

    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create cert dir: {}", e))?;

    // ── Generate CA ────────────────────────────────────────────────

    let ca_key_pair = KeyPair::generate().map_err(|e| format!("CA key generation failed: {}", e))?;

    let mut ca_params = CertificateParams::default();
    ca_params.is_ca = IsCa::Ca(BasicConstraints::Unconstrained);
    ca_params.distinguished_name.push(DnType::CommonName, "Shoulders Word Bridge CA");
    ca_params.key_usages.push(KeyUsagePurpose::KeyCertSign);
    ca_params.key_usages.push(KeyUsagePurpose::CrlSign);
    // 10 years
    ca_params.not_before = time::OffsetDateTime::now_utc();
    ca_params.not_after = time::OffsetDateTime::now_utc() + time::Duration::days(3650);

    let ca_cert = ca_params
        .self_signed(&ca_key_pair)
        .map_err(|e| format!("CA cert generation failed: {}", e))?;

    fs::write(&paths.ca_cert, ca_cert.pem())
        .map_err(|e| format!("Failed to write CA cert: {}", e))?;

    let ca_key_path = dir.join("ca-key.pem");
    fs::write(&ca_key_path, ca_key_pair.serialize_pem())
        .map_err(|e| format!("Failed to write CA key: {}", e))?;

    // ── Generate server cert signed by CA ───────────────────────────

    let server_key_pair = KeyPair::generate().map_err(|e| format!("Server key generation failed: {}", e))?;

    let mut server_params = CertificateParams::default();
    server_params.is_ca = IsCa::NoCa;
    server_params.distinguished_name.push(DnType::CommonName, "localhost");
    server_params.subject_alt_names = vec![
        SanType::DnsName("localhost".try_into().map_err(|e| format!("SAN error: {}", e))?),
        SanType::IpAddress(std::net::IpAddr::V4(std::net::Ipv4Addr::new(127, 0, 0, 1))),
    ];
    server_params.not_before = time::OffsetDateTime::now_utc();
    server_params.not_after = time::OffsetDateTime::now_utc() + time::Duration::days(3650);

    let server_cert = server_params
        .signed_by(&server_key_pair, &ca_cert, &ca_key_pair)
        .map_err(|e| format!("Server cert signing failed: {}", e))?;

    fs::write(&paths.server_key, server_key_pair.serialize_pem())
        .map_err(|e| format!("Failed to write server key: {}", e))?;
    fs::write(&paths.server_cert, server_cert.pem())
        .map_err(|e| format!("Failed to write server cert: {}", e))?;

    Ok(paths)
}

/// Trust the CA certificate via native OS admin dialog.
/// On macOS: uses osascript to show the admin password prompt.
/// Must be called from spawn_blocking — this blocks waiting for user input.
pub fn trust_ca_interactive(ca_cert_path: &std::path::Path) -> Result<(), String> {
    let ca_str = ca_cert_path.to_str().ok_or("Invalid cert path")?;

    #[cfg(target_os = "macos")]
    {
        // Check if the CA cert is already trusted in the system keychain
        let check = Command::new("security")
            .current_dir("/tmp")
            .args(["find-certificate", "-c", "Shoulders Word Bridge CA", "/Library/Keychains/System.keychain"])
            .output();

        if let Ok(ref out) = check {
            if out.status.success() {
                eprintln!("[addin_certs] CA already trusted in system keychain, skipping");
                return Ok(());
            }
        }
        eprintln!("[addin_certs] CA not yet trusted, showing admin prompt...");

        let output = Command::new("osascript")
            .current_dir("/tmp")
            .args(["-e", &format!(
                r#"do shell script "security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain '{}'" with administrator privileges"#,
                ca_str
            )])
            .output()
            .map_err(|e| format!("Failed to run trust command: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if stderr.contains("canceled") || stderr.contains("User canceled") {
                return Err("Setup canceled by user".into());
            }
            return Err(format!("Failed to trust certificate: {}", stderr));
        }
    }

    #[cfg(target_os = "windows")]
    {
        let output = Command::new("certutil")
            .args(["-addstore", "-user", "Root", ca_str])
            .output()
            .map_err(|e| format!("Failed to run certutil: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("certutil failed: {}", stderr));
        }
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = ca_str;
        return Err("Auto-trust not supported on this platform".into());
    }

    #[allow(unreachable_code)]
    Ok(())
}
