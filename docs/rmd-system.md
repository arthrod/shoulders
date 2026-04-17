# R Markdown / Quarto System

.Rmd and .qmd files get inline code chunk execution via Jupyter kernels, Quarto CLI rendering (Word/PDF/HTML), and PDF export via Typst.

## File Map

| File | Role |
|---|---|
| `src/editor/codeChunks.js` | CM6 StateField: parses chunk fences, gutter play buttons, background highlighting, language badges |
| `src/editor/chunkOutputs.js` | CM6 StateField + block widget for inline outputs below chunks. `CellOutput.vue` mounted per widget |
| `src/components/editor/CellOutput.vue` | Vue component for rendering chunk outputs (stream, images, HTML, errors) |
| `src/services/chunkKernelBridge.js` | Lifecycle bridge: Jupyter kernels for R/Python/Julia, shell fallback for bash/sh |
| `src/services/rmdKnit.js` | Knits full .Rmd/.qmd content — executes all chunks, returns clean markdown with outputs embedded |
| `src-tauri/src/quarto.rs` | Rust: `find_quarto()` binary detection, `quarto_render` command |
| `src/stores/quarto.js` | Pinia store: availability check, per-file sidecar settings, render action, error state |
| `src/components/editor/ExportPopover.vue` | Export dialog: format (Word/PDF/HTML), engine selection, Quarto-specific controls |
| `src/components/editor/TextEditor.vue` | Wires chunk execution: `Cmd+Enter` (single chunk), `Shift+Cmd+Enter` (run all), gutter events |
| `src/components/editor/EditorPane.vue` | Export handlers: Quarto render + Typst PDF + JS DOCX. Auto-opens output in split pane |
| `src/components/editor/TabBar.vue` | Tab bar buttons: Run All + Export for .qmd, status badge + error panel |

## Chunk Execution

### Supported Languages

| Language | Gutter button | Inline execution | Method |
|---|---|---|---|
| R | Play | Yes | Jupyter (IRkernel) |
| Python | Play | Yes | Jupyter (ipykernel) |
| Julia | Play | Yes | Jupyter (IJulia) |
| bash/sh | Play | Yes | Shell (`run_shell_command`) — no kernel needed |
| SQL, SAS, Stata, OJS, Mermaid | Grayed | No | Display only — handled by Quarto at render time |

Chunk regex: `/^```\{(r|python|julia|bash|sh|sql|sas|stata|ojs|mermaid)(?:[,\s].*?)?\}\s*$/i`

Non-executable languages show a grayed play button with tooltip "Run via Quarto render."

### Execution Flow

1. **Single chunk**: gutter play or `Cmd+Enter` → `executeChunk()` → spinner widget → kernel/shell execute → `CellOutput.vue` widget
2. **Run All**: `Shift+Cmd+Enter` or tab bar "Run All" → sequential loop, re-reads chunk positions on each iteration
3. **Cold start**: first execution triggers environment detection → kernel discovery → kernel launch (3-5s). Spinner shows during this time

### Chunk Identity

`chunkKey(chunk, doc)` → `"language::headerLine::first80chars"`. Inserting lines above a chunk orphans its output (acceptable — re-run recreates it).

### Chunk Visuals

- **Background**: theme-aware neutral tint (`--bg-secondary` blend), same for header and content lines
- **Left border**: 2px accent-colored border on content lines and output widgets
- **Language badge**: small uppercase label ("R", "Python", "Bash") at end of header line (CM6 widget decoration)
- **Play button**: accent-colored, grayed for non-executable languages
- **Output widget**: compact layout, monospace font, absolute-positioned dismiss button

## Quarto CLI Rendering

### Binary Detection (`quarto.rs`)

`find_quarto()` checks (in order):
1. System paths: `/opt/homebrew/bin/quarto`, `/usr/local/bin/quarto`, `~/.local/bin/quarto`
2. Windows: `%LOCALAPPDATA%\Programs\Quarto\bin\quarto.exe`
3. Shell lookup: `which quarto` / `where quarto`

Two Tauri commands: `is_quarto_available` (bool) and `quarto_render` (full render with metadata flags).

### Render Pipeline

```
User clicks Export → ExportPopover emits { format, engine, settings }
→ TabBar routes to EditorPane.handleExportQuarto()
→ quartoStore.render(filePath, settings)
→ Rust quarto_render: quarto render <path> --to <format> --metadata key:value ...
→ Result: { success, output_path, errors, warnings, duration_ms }
→ Auto-open output in split pane (.html opens as HTML preview)
```

### Sidecar Settings

Settings stored in `.project/quarto-settings.json` (NOT in YAML frontmatter). Per-file, keyed by relative path. Includes:
- `format`: `'word'` | `'pdf'` | `'html'`
- `font`, `font_size`, `page_size`, `margins`
- `toc`, `number_sections`
- `reference_doc`: path to .docx template in `.project/templates/`

Settings are converted to `--metadata` CLI flags at render time. The user's file stays clean.

### Export Popover UX

**For .qmd/.rmd files:**
- Engine toggle hidden (always Quarto)
- Format: Word | PDF | HTML
- Font/size/margins hidden for HTML (irrelevant)
- Reference document picker for Word templates
- TOC and section numbering toggles
- "Quarto not installed" warning if missing

**For .md files:**
- Engine toggle shown (Shoulders | Quarto)
- Format: Word | PDF (no HTML)
- Full settings for both engines

### Tab Bar for .qmd/.rmd

```
[Run All] [status badge] [Export ▾]
```

- **Run All**: executes all chunks sequentially via Jupyter kernels
- **Status badge**: rendering spinner → green duration → red error count with error panel
- **Export**: opens popover, routes through Quarto CLI
- **Run** (single line to REPL) and **Render** (terminal dispatch) are hidden — gutter buttons handle chunk execution

### Error Panel

LaTeX-style error panel (teleported to body). Shows per-error: severity icon, line number, message, "Ask AI" button. Auto-opens on failure, auto-closes on success.

### Settings Detection

`SettingsEnvironment.vue` shows Quarto card: version + path when installed, install instructions when not found.

## Knitting Pipeline (`rmdKnit.js`)

Used only by the **Shoulders engine** (Typst PDF path). When Quarto engine is selected, this is skipped entirely — Quarto handles all chunk execution internally.

`knitRmd(content, workspacePath, { imageDir })` creates its own `ChunkKernelBridge`, executes every chunk with a kernel (R/Python/Julia only), and formats outputs as markdown. Non-executable languages are passed through as-is.

Two modes controlled by `imageDir`:

| | Preview (no `imageDir`) | PDF export (`imageDir` set) |
|---|---|---|
| PNG/JPEG | `<img src="data:base64,...">` | `![output](file.png)` (saved to disk) |
| SVG | Inline `<svg>` | Saved as `.svg` file → `![output](file.svg)` |
| HTML tables | Raw `<table>` HTML | Downgraded to `text/plain` (fenced code block) |
| stderr/errors | `<pre>` with error styling | Fenced code block |

## Key Decisions

- **Jupyter-only for inline execution, no subprocess fallback.** Except bash/sh which use `run_shell_command` directly (no kernel needed).
- **Each consumer creates its own `ChunkKernelBridge`.** The editor's bridge is separate from `knitRmd`'s bridge. They may share kernel processes but have independent lifecycle.
- **Block widgets must come from a StateField**, not a ViewPlugin. CM6 throws `"Block decorations may not be specified via plugins"`.
- **Quarto settings in sidecar, not YAML.** Non-technical users never see frontmatter. `--metadata` flags override at render time.
- **.qmd always uses Quarto engine.** No engine toggle — Quarto is the only option. .md files can choose.
