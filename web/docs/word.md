---
id: word
title: Word Documents
subtitle: Open and edit .docx files natively, with tracked changes and AI support.
group: Writing
order: 3
---

## Opening Word files

Shoulders opens `.docx` files directly -- no conversion to another format, no import step. The file you see is the file on disk. When you save, it writes back to the same `.docx` file.

Open a `.docx` file from the file tree, from <kbd>Cmd/Ctrl</kbd>+<kbd>P</kbd> (Quick Open), or by dragging it into the workspace folder.

## Formatting

A toolbar above the document provides formatting controls:

- **Text styles** -- bold, italic, underline.
- **Headings** -- heading level selector (Heading 1 through 6, or paragraph).
- **Lists** -- bulleted and numbered lists.
- **Tables** -- insert and edit tables.
- **Paragraph styles** -- alignment, indentation.

Standard keyboard shortcuts work inside Word documents: <kbd>Cmd/Ctrl</kbd>+<kbd>B</kbd> for bold, <kbd>Cmd/Ctrl</kbd>+<kbd>I</kbd> for italic, <kbd>Cmd/Ctrl</kbd>+<kbd>U</kbd> for underline.

## Tracked changes

If the document contains tracked changes from Microsoft Word, they are preserved. A review bar appears above the document showing the number of pending changes, with options to accept or reject them individually or all at once.

## AI features in Word documents

AI features work inside `.docx` files the same way they work in Markdown:

- **Inline suggestions** -- type `++` to trigger ghost text completions. Accept with <kbd>Tab</kbd>, cycle with <kbd>Up</kbd>/<kbd>Down</kbd>, dismiss with <kbd>Esc</kbd>.
- **Comment threads** -- select text and press <kbd>Cmd/Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd> to start an AI-powered comment thread on the selection.
- **AI chat** -- the chat can read Word document content and propose edits.

## Saving

Changes auto-save to disk. <kbd>Cmd/Ctrl</kbd>+<kbd>S</kbd> triggers an immediate save and creates a version history checkpoint. The `.docx` format is preserved -- you can open the file in Microsoft Word, Google Docs, or any other application that reads `.docx` at any time.

## Page zoom

The Word document toolbar includes a separate zoom control for the page view. This is independent of the global font zoom (<kbd>Cmd/Ctrl</kbd>+<kbd>+/-</kbd>), which adjusts the rest of the interface.
