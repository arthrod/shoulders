# Markdown System

Markdown (`.md`) is the primary file type in Shoulders. It gets two layers of enhancement: PDF export via Typst and DOCX export via the `docx` npm package. Editing is done in raw text mode with formatting shortcuts.

## Architecture Overview

```
Raw editing    — plain CodeMirror with syntax highlighting + formatting shortcuts
PDF Export     — pulldown_cmark → Typst markup → template → typst compile → PDF  (Rust)
DOCX Export    — marked lexer → token walking → docx npm → blob → write_file_base64  (JS)
```

## Export Architecture Note

Markdown files export to two formats via different pipelines:

- **PDF** (Rust): `pulldown_cmark` parses markdown in Rust, generates Typst markup, shells out to the bundled Typst binary for typesetting. Rust is required because Typst is a Rust binary invoked via `Command::new()`. Files: `typst_export.rs`, `stores/typst.js`.

- **DOCX** (JS): `marked` parses markdown in the frontend, walks the token tree to build a DOCX document via the `docx` npm package (5.6k stars, v9.6+), packs to a binary blob, sends to Rust for disk write via `write_file_base64`. JS is used because `docx` npm vastly outmatches any Rust DOCX library. DOCX generation is ZIP-of-XML assembly — no external binary, no sidecar, no git LFS. Files: `services/docxExport.js`, `stores/docxExport.js`.

Both pipelines read from `filesStore.fileContents`, resolve `[@key]` citations via `citationFormatter.js`, and write output adjacent to the source file (same directory, same name, different extension).

## Relevant Files

| File | Purpose |
|---|---|
| `src/editor/markdownShortcuts.js` | Keymap: Cmd+B bold, Cmd+I italic, Cmd+K link, etc. |
| `src-tauri/src/typst_export.rs` | Rust: markdown→Typst conversion + 5 templates + compile + binary discovery |
| `src/stores/typst.js` | Pinia store: per-file PDF settings, availability check, export action |
| `src/services/docxExport.js` | JS: markdown→DOCX conversion via `marked` lexer + `docx` npm package |
| `src/stores/docxExport.js` | Pinia store: DOCX settings persistence + export action |
| `src/components/editor/ExportPopover.vue` | Shared export popover for Word and PDF (`format` prop switches controls) |
| `src/components/editor/TabBar.vue` | Export buttons: `Export [Word ▾] [PDF ▾]` — both open ExportPopover |
| `src/components/editor/EditorPane.vue` | Export handlers for PDF and DOCX |
| `src/services/citationFormatter.js` | Shared citation formatting (APA, Chicago, IEEE, Harvard, Vancouver) |
| `src/stores/toast.js` | Toast notifications (export success/failure) |
| `src/components/layout/ToastContainer.vue` | Fixed bottom-right toast stack |

---

## Formatting Shortcuts

`markdownShortcuts.js` provides keymap bindings:

| Shortcut | Action | Toggle Logic |
|---|---|---|
| `Cmd+B` | Bold | Check 2 chars before/after selection for `**` |
| `Cmd+I` | Italic | Check 1 char before/after for `*` |
| `Cmd+Shift+X` | Strikethrough | Check 2 chars for `~~` |
| `Cmd+E` | Inline code | Check 1 char for backtick |
| `Cmd+K` | Link | Wrap as `[text](url)`, select `url` |
| `Cmd+Shift+.` | Blockquote | Toggle `> ` line prefix |
| `Cmd+Shift+7` | Ordered list | Toggle `1. ` prefix |
| `Cmd+Shift+8` | Bullet list | Toggle `- ` prefix |

Each function reads the selection, checks if the wrapper already exists, and dispatches an insert or delete transaction.

**Note:** `Cmd+B` is intercepted at the `App.vue` level for sidebar toggle. The handler returns early for `.md` and `.docx` files, letting the editor handle it.

---

## PDF Export via Typst

### Typst Overview

[Typst](https://typst.app/) is a modern typesetting system — like LaTeX but with much faster compilation and simpler syntax. Shoulders uses it as a backend to convert markdown to publication-quality PDFs.

### Conversion Pipeline

```
.md file → pulldown-cmark parser → Typst markup → template wrapper → typst compile → .pdf
```

### Markdown → Typst Conversion

`typst_export.rs:markdown_to_typst()` uses pulldown-cmark to parse markdown events and emit Typst syntax:

| Markdown | Typst |
|---|---|
| `# Heading` | `= Heading` |
| `**bold**` | `*bold*` |
| `*italic*` | `_italic_` |
| `` `code` `` | `` `code` `` |
| `[text](url)` | `#link("url")[text]` |
| `![alt](path)` | `#image("path")` |
| `> quote` | `#quote[...]` |
| Code fences | ` ```lang ... ``` ` |
| `$math$` | `$math$` (same!) |
| `[@key]` | `@key` (Typst native citations) |
| Tables | `#table()` function |
| `~~strike~~` | `#strike[...]` |
| `---` | `#line(length: 100%)` |

### Templates & PDF Settings

`wrap_in_template()` accepts a `PdfSettings` struct and generates the Typst preamble accordingly. No special syntax is needed in the markdown — the template is purely a rendering concern injected at export time.

#### Available Templates

| Template | Description | Key Typst Rules |
|---|---|---|
| **Clean** (default) | Minimal, no numbering | `heading(numbering: none)`, justified |
| **Academic** | Papers and essays | `heading(numbering: "1.1")`, first-line indent, tighter leading |
| **Report** | Formal reports | `heading(numbering: "1.1")`, page numbers, chapter page breaks |
| **Letter** | Correspondence | Left-aligned (no justify), no numbering |
| **Compact** | Reference sheets | Two-column, 9pt font, narrow margins |

#### Configurable Settings

| Setting | Options | Default |
|---|---|---|
| Font | STIX Two Text, Lora, Times New Roman, Inter, Arial | STIX Two Text |
| Font size | 9–14pt | 11pt |
| Page size | A4, US Letter, A5 | A4 |
| Margins | Narrow (1.5cm), Normal (2.5cm), Wide (3.5cm) | Normal |
| Spacing | Compact (0.8em), Normal (1.8em), Relaxed (2.4em) | Normal |

STIX Two Text, Lora, and Inter are bundled as Tauri resources (`bundle.resources` in `tauri.conf.json`). Typst finds them via `--font-path` pointing to the resolved font directory (`find_font_dir()`). Times New Roman and Arial are system fonts — `--font-path` is additive, so they still work. If a saved font is no longer in the list (e.g., after upgrading from the old 9-font list), the popover resets to the first font.

#### Settings Storage

Per-file settings stored in `.project/pdf-settings.json`, keyed by relative path. Loaded at workspace open via `typstStore.loadSettings()`. If a source file is renamed/deleted, orphaned entries are harmless — next export uses defaults.

#### Settings UI

Both "Word" and "PDF" buttons in the TabBar open `ExportPopover.vue` (shared component, Teleported, fixed position). A `format` prop (`'word'` or `'pdf'`) controls which settings are shown. Shared controls: font, font size, page size, margins. PDF adds: template, spacing. The export button at the bottom saves settings and triggers the export. DOCX settings stored in `.project/docx-settings.json` (same pattern).

### Binary Discovery

`find_typst()` uses a 5-tier search (same pattern as `find_tectonic` for LaTeX). Uses `typst_binary_name()` / `typst_binary_ext()` helpers to append `.exe` on Windows:

1. **Bundled sidecar** — next to executable (production builds)
2. **Resource dir** — Tauri v2 bundled resources
3. **Dev binaries** — `src-tauri/binaries/typst-{triple}{ext}`
4. **System paths** — Unix: `/opt/homebrew/bin/typst`, `/usr/local/bin/typst`, `~/.cargo/bin/typst`; Windows: `%LOCALAPPDATA%\typst\typst.exe`, `%USERPROFILE%\.cargo\bin\typst.exe`
5. **Shell lookup** — `which typst` (Unix) / `where typst` (Windows)

If all tiers fail, a platform-specific error message is shown as a toast notification (macOS: `brew install typst`, Windows: `winget install Typst.Typst`, Linux: GitHub releases link).

### Sidecar Bundling (Production)

Typst binaries are placed in `src-tauri/binaries/` with target-triple suffixes:
- `typst-aarch64-apple-darwin` (Apple Silicon macOS)
- `typst-x86_64-apple-darwin` (Intel macOS)
- `typst-x86_64-pc-windows-msvc.exe` (Windows)
- `typst-x86_64-unknown-linux-gnu` (Linux x86_64)
- `typst-aarch64-unknown-linux-gnu` (Linux ARM64)

Binaries are tracked via **Git LFS** (`src-tauri/binaries/*` in `.gitattributes`). CI workflow uses `lfs: true` on checkout. In production builds, Tauri includes the correct binary automatically. Users never need to install anything — the PDF button just works on all platforms.

### Tauri Commands

| Command | Signature | Purpose |
|---|---|---|
| `export_md_to_pdf` | `(md_path, bib_path?, settings?) → ExportResult` | Convert + compile with template/font/margins, returns `{success, pdf_path, errors, warnings, duration_ms}` |
| `is_typst_available` | `() → bool` | Check if Typst binary exists |

### Bibliography

Bibliography inclusion is **citation-gated**: the Rust exporter checks whether the markdown source contains any `[@key]` citations before including a `#bibliography()` directive. If the document has no citations, no bibliography section is rendered — even if the reference library has entries and a `.bib` file is provided.

The check chain:
1. `handleExportPdf()` calls `ensureBibFile()` which exports the full reference library to `references.bib`
2. Rust reads the markdown and checks for `[@` (Pandoc citation syntax)
3. If no citations found → `effective_bib = None` → no bibliography in output
4. If citations found → Rust also verifies the `.bib` has `@type{}` entries (not just comments)

### Frontend Flow

1. User clicks "Export" in TabBar → selects PDF in the export popover → clicks "Export PDF"
2. `handleExportPdf()` resolves settings from the popover (or falls back to saved per-file defaults)
3. Checks if the PDF already exists on disk (`path_exists`)
4. Calls `typstStore.exportToPdf(activeTab, bibPath, settings)`
5. On success:
   - **First creation**: toast notification ("Created filename.pdf in Xms")
   - **Subsequent updates**: no toast (silent re-export)
   - PDF opens in split pane via `ensurePdfOpen()` — reopens if user closed it
6. On Typst errors: error message sent to AI chat via `chat-prefill` event
   - On other failures (e.g., binary not found): toast notification with error message

### Split Pane Reliability

`ensureFileOpenBeside()` uses `editorStore.activePaneId` (always a leaf node) rather than the component's `props.paneId` to determine which pane to split. This avoids a bug where `props.paneId` could point to a split node after a previous split operation mutated the tree — `splitPaneWith` would then silently fail because `findPane` matched the split parent, not the leaf. Both PDF and DOCX exports use this to auto-open the generated file in a split pane.

### bun Dependencies

| Package | Purpose |
|---|---|
| `marked` | Markdown parser (for DOCX export + chat rendering) |
| `marked-katex-extension` | KaTeX math rendering |
| `marked-highlight` | Code block syntax highlighting |
| `marked-footnote` | Footnote support |
| `katex` | Math rendering engine |
| `dompurify` | HTML sanitization |
| `highlight.js` | Syntax highlighting (selective imports) |

### Rust Dependencies

| Crate | Purpose |
|---|---|
| `pulldown-cmark` | Markdown → event stream parser (for Typst conversion) |

---

## File Export UX

Export files are created alongside the `.md` file (e.g., `notes.md` → `notes.pdf` or `notes.docx`). The "Export" button in the TabBar opens a popover with a Word/PDF format toggle, per-file settings (font, page size, margins + PDF-only template/spacing), and an export action button. The exported file auto-opens in a split pane.

Since the workspace is a regular folder on the user's filesystem, all files are always accessible via Finder/Explorer.

### Markdown Editing Philosophy

Markdown is edited in **raw text mode** — no semi-WYSIWYG decorations. Users write markdown directly and export to PDF or Word when ready. Export is a deliberate action, not a continuous preview.

### PDF Auto-Reload

When the user clicks "Create PDF" again after the first export, the open PdfViewer automatically reloads. `handleExportPdf` dispatches a `pdf-updated` custom event with the path; `PdfViewer.vue` listens for it, revokes the old blob URL, re-reads the file via `read_file_base64`, creates a new blob URL, and updates `viewerSrc` — the iframe reloads with the fresh PDF.

### Typst Character Escaping

Typst has 14 characters with special meaning in markup mode (`\`, `#`, `$`, `@`, `~`, `*`, `_`, `` ` ``, `[`, `]`, `{`, `}`, `<`, `>`). All of these are escaped with a backslash prefix in `Event::Text` content via `escape_typst_markup()` in `typst_export.rs`. This prevents compilation errors and silent output corruption for users who write plain Markdown with no knowledge of Typst (e.g., "issue #3", "~5 items", "the set {a, b, c}", "name@university.edu").

Code blocks, inline code, and math expressions are unaffected — they are routed through separate pulldown-cmark events that bypass text escaping. Structural Typst commands generated by the converter (`#quote[`, `#table(`, `*bold*`, `_italic_`, etc.) are also unaffected since they come from event handlers, not `Event::Text`.

Pandoc citations (`[@key]`) are preserved via a placeholder mechanism: `preprocess_citations()` uses a control character (`\x01`) instead of `@`, which survives escaping and is restored to `@` at the end of conversion. This allows `@` to be safely escaped in all other contexts while intentional citations still resolve as Typst references.
