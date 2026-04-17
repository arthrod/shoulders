//! Inject AutoShow webextension metadata into .docx files.
//!
//! A .docx file is an OpenXML ZIP archive. To make Word auto-open the
//! Shoulders taskpane when a document is opened, we inject/update three
//! XML parts and patch two existing ones:
//!
//! **Webextension parts:**
//! - `word/webextensions/webextension1.xml`  — add-in identity + AutoShow property
//! - `word/webextensions/taskpanes.xml`      — taskpane layout (docked right, 350px)
//! - `word/webextensions/_rels/taskpanes.xml.rels` — links taskpane → webextension
//!
//! **Patched parts:**
//! - `[Content_Types].xml`  — register the two new content types
//! - `_rels/.rels`          — add relationship to taskpanes.xml (root level!)
//!
//! **Key lessons from inspecting Word's own output:**
//! - The taskpanes relationship goes in `_rels/.rels`, NOT `word/_rels/document.xml.rels`
//! - `visibility="1"` means visible/auto-show (not "0")
//! - Word writes webextension parts when user activates add-in, but with empty
//!   `<we:properties/>` — no AutoShow. We must add the property ourselves.

use std::io::{Read, Write, Cursor};
use std::path::Path;

// ── XML templates ──────────────────────────────────────────────────

/// Must match <Id> in addin/manifest.xml
const ADDIN_ID: &str = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

fn webextension_xml() -> String {
    let instance_id = uuid::Uuid::new_v4();
    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<we:webextension xmlns:we="http://schemas.microsoft.com/office/webextensions/webextension/2010/11" id="{{{instance}}}"><we:reference id="{addin}" version="2.0.0.0" store="developer" storeType="Registry"/><we:alternateReferences/><we:properties><we:property name="Office.AutoShowTaskpaneWithDocument" value="true"/></we:properties><we:bindings/><we:snapshot xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></we:webextension>"#,
        instance = instance_id.to_string().to_uppercase(),
        addin = ADDIN_ID,
    )
}

const TASKPANES_XML: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<wetp:taskpanes xmlns:wetp="http://schemas.microsoft.com/office/webextensions/taskpanes/2010/11"><wetp:taskpane dockstate="right" visibility="1" width="350" row="0"><wetp:webextensionref xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId1"/></wetp:taskpane></wetp:taskpanes>"#;

const TASKPANES_RELS_XML: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.microsoft.com/office/2011/relationships/webextension" Target="webextension1.xml"/></Relationships>"#;

// ── Public API ─────────────────────────────────────────────────────

/// Tag a single .docx file with AutoShow webextension metadata.
///
/// Handles three cases:
/// 1. No webextension parts → inject everything fresh
/// 2. Webextension parts exist (Word added them) but no AutoShow → replace with ours
/// 3. AutoShow already set → skip (return false)
///
/// Returns `Ok(true)` if the file was modified, `Ok(false)` if already tagged.
pub fn tag_docx(path: &Path) -> Result<bool, String> {
    let data = std::fs::read(path)
        .map_err(|e| format!("Cannot read {}: {}", path.display(), e))?;

    let mut archive = zip::ZipArchive::new(Cursor::new(&data))
        .map_err(|e| format!("Not a valid ZIP/docx ({}): {}", path.display(), e))?;

    // Verify this looks like a real docx
    if archive.by_name("word/document.xml").is_err() {
        return Err(format!("Not a Word document (no word/document.xml): {}", path.display()));
    }

    // Check if AutoShow is already enabled
    if has_autoshow(&mut archive) {
        return Ok(false);
    }

    // Build new ZIP — raw-copy untouched entries (byte-for-byte, no re-encode),
    // only decompress/recompress the 2-3 XML parts we actually patch.
    let new_part_opts = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let mut patched_ct = false;
    let mut patched_root_rels = false;

    // Names of entries we need to modify or skip
    const SKIP: &[&str] = &[
        "word/webextensions/webextension1.xml",
        "word/webextensions/taskpanes.xml",
        "word/webextensions/_rels/taskpanes.xml.rels",
    ];
    const PATCH: &[&str] = &[
        "[Content_Types].xml",
        "_rels/.rels",
        "word/_rels/document.xml.rels",
    ];

    // Pass 1: write [Content_Types].xml first (OOXML spec requirement)
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        if entry.name() == "[Content_Types].xml" {
            let opts = opts_from_entry(&entry);
            let xml = read_entry_string(&mut entry)?;
            let modified = ensure_content_types(&xml);
            writer.start_file("[Content_Types].xml", opts).map_err(|e| e.to_string())?;
            writer.write_all(modified.as_bytes()).map_err(|e| e.to_string())?;
            patched_ct = true;
            break;
        }
    }

    // Pass 2: everything else in original order
    for i in 0..archive.len() {
        let entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().to_string();

        if name == "[Content_Types].xml" || SKIP.contains(&name.as_str()) {
            continue;
        }

        if PATCH.contains(&name.as_str()) {
            // These entries need XML patching — decompress, modify, recompress
            let mut entry = entry;
            let opts = opts_from_entry(&entry);
            let xml = read_entry_string(&mut entry)?;

            let modified = match name.as_str() {
                "_rels/.rels" => {
                    patched_root_rels = true;
                    ensure_root_rels(&xml)?
                }
                "word/_rels/document.xml.rels" => strip_taskpanes_rel(&xml),
                _ => xml,
            };
            writer.start_file(&name, opts).map_err(|e| e.to_string())?;
            writer.write_all(modified.as_bytes()).map_err(|e| e.to_string())?;
        } else {
            // Raw copy — preserves bytes, compression, timestamps, extra fields
            writer.raw_copy_file(entry).map_err(|e| e.to_string())?;
        }
    }

    if !patched_ct {
        return Err(format!("Invalid docx: missing [Content_Types].xml in {}", path.display()));
    }
    if !patched_root_rels {
        return Err(format!("Invalid docx: missing _rels/.rels in {}", path.display()));
    }

    // Write fresh webextension parts with AutoShow enabled
    writer.start_file("word/webextensions/webextension1.xml", new_part_opts).map_err(|e| e.to_string())?;
    writer.write_all(webextension_xml().as_bytes()).map_err(|e| e.to_string())?;

    writer.start_file("word/webextensions/taskpanes.xml", new_part_opts).map_err(|e| e.to_string())?;
    writer.write_all(TASKPANES_XML.as_bytes()).map_err(|e| e.to_string())?;

    writer.start_file("word/webextensions/_rels/taskpanes.xml.rels", new_part_opts).map_err(|e| e.to_string())?;
    writer.write_all(TASKPANES_RELS_XML.as_bytes()).map_err(|e| e.to_string())?;

    let result = writer.finish().map_err(|e| e.to_string())?;
    let new_data = result.into_inner();

    // Atomic write: temp file → rename
    let tmp = path.with_extension("docx.shoulders-tmp");
    std::fs::write(&tmp, &new_data).map_err(|e| format!("Failed to write temp file: {}", e))?;
    std::fs::rename(&tmp, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("Failed to rename temp file: {}", e)
    })?;

    Ok(true)
}

/// Scan a workspace directory and tag all .docx files.
pub fn tag_workspace(workspace_path: &Path) -> Vec<(String, Result<bool, String>)> {
    let mut results = Vec::new();
    walk_and_tag(workspace_path, &mut results);
    results
}

// ── Helpers ────────────────────────────────────────────────────────

fn opts_from_entry(entry: &zip::read::ZipFile) -> zip::write::SimpleFileOptions {
    let mut opts = zip::write::SimpleFileOptions::default()
        .compression_method(entry.compression());
    if let Some(t) = entry.last_modified() {
        opts = opts.last_modified_time(t);
    }
    if let Some(mode) = entry.unix_mode() {
        opts = opts.unix_permissions(mode);
    }
    opts
}

fn read_entry_string(entry: &mut zip::read::ZipFile) -> Result<String, String> {
    let mut buf = Vec::new();
    entry.read_to_end(&mut buf).map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

/// Check if a docx already has the AutoShow property set.
fn has_autoshow(archive: &mut zip::ZipArchive<Cursor<&Vec<u8>>>) -> bool {
    if let Ok(mut entry) = archive.by_name("word/webextensions/webextension1.xml") {
        let mut content = String::new();
        if entry.read_to_string(&mut content).is_ok() {
            return content.contains("AutoShowTaskpaneWithDocument");
        }
    }
    false
}

fn walk_and_tag(dir: &Path, results: &mut Vec<(String, Result<bool, String>)>) {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if path.is_dir() {
                if name.starts_with('.') || name == "node_modules" || name == "target" {
                    continue;
                }
                walk_and_tag(&path, results);
            } else if name.ends_with(".docx") && !name.starts_with("~$") {
                let display = path.to_string_lossy().to_string();
                let result = tag_docx(&path);
                results.push((display, result));
            }
        }
    }
}

/// Ensure webextension content types exist in [Content_Types].xml.
fn ensure_content_types(xml: &str) -> String {
    if xml.contains("webextensiontaskpanes") {
        return xml.to_string();
    }

    let insert = concat!(
        r#"<Override PartName="/word/webextensions/taskpanes.xml" ContentType="application/vnd.ms-office.webextensiontaskpanes+xml"/>"#,
        r#"<Override PartName="/word/webextensions/webextension1.xml" ContentType="application/vnd.ms-office.webextension+xml"/>"#,
    );

    xml.replacen("</Types>", &format!("{}</Types>", insert), 1)
}

/// Ensure taskpanes relationship exists in _rels/.rels (root rels).
/// This is where Word expects it — NOT in word/_rels/document.xml.rels.
fn ensure_root_rels(xml: &str) -> Result<String, String> {
    if xml.contains("webextensiontaskpanes") {
        return Ok(xml.to_string());
    }

    let re = regex_lite::Regex::new(r#"Id="rId(\d+)""#).unwrap();
    let max_id = re
        .captures_iter(xml)
        .filter_map(|c| c.get(1)?.as_str().parse::<u32>().ok())
        .max()
        .unwrap_or(0);

    let new_rel = format!(
        r#"<Relationship Id="rId{}" Type="http://schemas.microsoft.com/office/2011/relationships/webextensiontaskpanes" Target="word/webextensions/taskpanes.xml"/>"#,
        max_id + 1
    );

    Ok(xml.replacen("</Relationships>", &format!("{}</Relationships>", new_rel), 1))
}

/// Remove any taskpanes relationship from word/_rels/document.xml.rels.
/// Cleans up old incorrect injection that put the rel in the wrong file.
fn strip_taskpanes_rel(xml: &str) -> String {
    if !xml.contains("webextensiontaskpanes") {
        return xml.to_string();
    }
    let re = regex_lite::Regex::new(
        r#"<Relationship[^>]*Type="[^"]*webextensiontaskpanes[^"]*"[^>]*/>"#
    ).unwrap();
    re.replace_all(xml, "").to_string()
}
