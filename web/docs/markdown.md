---
id: markdown
title: Markdown
subtitle: Write in Markdown with formatting shortcuts, wiki links, preview, and PDF export.
group: Writing
order: 2
---

## Writing in Markdown

Markdown files (`.md`, `.rmd`, `.qmd`) open in a text editor with syntax highlighting, code folding, and search (<kbd>Cmd/Ctrl</kbd>+<kbd>F</kbd>). Formatting shortcuts let you apply common styles without typing the syntax by hand:

| Format | Shortcut | Syntax |
|---|---|---|
| Bold | <kbd>Cmd/Ctrl</kbd>+<kbd>B</kbd> | `**text**` |
| Italic | <kbd>Cmd/Ctrl</kbd>+<kbd>I</kbd> | `*text*` |
| Link | <kbd>Cmd/Ctrl</kbd>+<kbd>K</kbd> | `[text](url)` |
| Inline code | <kbd>Cmd/Ctrl</kbd>+<kbd>E</kbd> | `` `text` `` |

### Auto-save

Changes are written to disk one second after you stop typing. There is no "unsaved changes" dialog -- the file on disk always reflects what you see. Press <kbd>Cmd/Ctrl</kbd>+<kbd>S</kbd> to also create a version history checkpoint.

### Word count

The footer shows word count and character count for the active file. When text is selected, counts for the selection appear alongside the document totals. Cursor position (line:column) is also displayed.

## Wiki links

Link between files in your workspace using double-bracket syntax:

| Syntax | Result |
|---|---|
| `[[filename]]` | Links to a file by name |
| `[[filename\|display text]]` | Links with custom display text |
| `[[filename#heading]]` | Links to a specific heading within a file |

You do not need to include the file extension or path -- `[[my notes]]` finds `my notes.md` anywhere in the directory tree. Resolved links are styled in the accent color; broken links appear in red.

Type `[[` to trigger autocomplete from all workspace files. Click a link to open the target file. If the target does not exist, clicking creates it automatically.

The right sidebar has a **Backlinks** tab showing every file that links to the currently active file. When you rename a file, all wiki links pointing to it across the workspace are updated automatically.

## Preview

Click **Preview** in the tab bar to open a rendered HTML view in a split pane. The preview supports headings, lists, tables, code blocks with syntax highlighting, and math (KaTeX).

## Exporting to PDF

Shoulders converts Markdown to PDF locally using Typst, a modern typesetting engine. No internet connection required.

1. Open a Markdown file.
2. Click **Create PDF** in the tab bar. The PDF opens in a split pane next to your source.
3. The PDF regenerates automatically when you save. Edit on the left, see the result on the right.

### Templates

Five built-in templates control the PDF layout:

- **Article** -- standard academic article format.
- **Report** -- longer-form document with title page.
- **Essay** -- clean, minimal layout for prose.
- **Letter** -- formal letter format.
- **Plain** -- minimal formatting, maximum content density.

### PDF settings

Click the gear icon in the tab bar to configure per-file settings: template, font, font size, margins, line spacing, and citation style. Settings are saved per file.

`[@key]` citations are resolved against your reference library and formatted according to the selected style. A bibliography is automatically generated at the end of the document.

## Live preview

Shoulders has a live preview mode that hides Markdown syntax when your cursor is not on that line. Bold text appears bold, links show as clickable text, images render inline, and tables display as formatted HTML -- all without leaving the editor.

Toggle live preview in Settings (<kbd>Cmd/Ctrl</kbd>+<kbd>,</kbd>) -> Editor. It is enabled by default.

## Exporting to Word

You can also export Markdown files to `.docx` (Word) format. Click the **Export** button in the tab bar and choose **Word**. The document is generated locally -- no internet connection or external software required.

Per-file settings let you choose the font, font size, page size (A4, US Letter, A5), and margins. These settings are saved for each file so you do not need to reconfigure them on the next export. Citations are resolved and a bibliography is appended automatically, just like in PDF export.

## Tabs and split panes

Open multiple files in tabs within the same pane. Drag tabs to reorder. Close with <kbd>Cmd/Ctrl</kbd>+<kbd>W</kbd>. Switch tabs with <kbd>Cmd/Ctrl</kbd>+<kbd>Option/Alt</kbd>+<kbd>Left/Right</kbd>.

Split the editor vertically (<kbd>Cmd/Ctrl</kbd>+<kbd>\\</kbd>) or horizontally (<kbd>Cmd/Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>\\</kbd>). Drag the divider to adjust the ratio. Splits nest recursively.

:::tip
A common workflow: Markdown on the left, PDF preview or a reference PDF on the right.
:::

## Zoom

<kbd>Cmd/Ctrl</kbd>+<kbd>+</kbd> and <kbd>Cmd/Ctrl</kbd>+<kbd>-</kbd> adjust font sizes globally. Both the editor font and the UI font scale together.
