---
id: latex
title: LaTeX
subtitle: Write and compile LaTeX documents with live preview, error navigation, and AI assistance.
group: Writing
order: 4
---

## Getting started

LaTeX compilation is powered by [Tectonic](https://tectonic-typesetting.github.io/), a modern, self-contained TeX engine. It is not bundled with Shoulders but can be downloaded with one click from Settings.

1. Open Settings (<kbd>Cmd/Ctrl</kbd>+<kbd>,</kbd>) -> System and click **Download Tectonic** (~15 MB one-time download).
2. Open or create a `.tex` file. The editor provides syntax highlighting and autocomplete for common LaTeX commands.
3. The document compiles automatically. The first compile may take a moment as Tectonic downloads the required TeX packages.

:::tip
If Tectonic is already installed on your system (e.g. via Homebrew or Cargo), Shoulders will find it automatically -- no download needed.
:::

## Writing

The editor provides syntax highlighting for LaTeX and autocomplete for approximately 80 common commands -- document structure (`\section`, `\begin`), formatting (`\textbf`, `\emph`), math (`\frac`, `\sum`), and more. Autocomplete triggers as you type.

## Compiling

The document recompiles automatically about 5 seconds after the last edit. The compiled PDF opens in a split pane next to your source. Each recompilation updates the PDF in place -- you see changes as you write.

The tab bar above the editor shows compile controls:

- **Compile** -- trigger a manual compile at any time.
- **Auto** -- toggle auto-compilation on or off (on by default).
- **Status** -- shows compile time on success, or error count on failure.

## Navigating between source and PDF

SyncTeX links the source and PDF bidirectionally:

- **Forward sync** -- click the **Sync** button in the tab bar to jump the PDF to your current cursor position.
- **Backward sync** -- double-click in the PDF to jump back to the corresponding source line.

## Errors

Compilation errors and warnings appear in a panel below the editor. Click an error to jump to the source line. If a compile fails, the previous PDF stays visible so you can still reference it while fixing the issue.

The **Ask AI to fix** button sends the error to the AI chat, which can read the source file and suggest corrections.

## Citations

If you use the [reference library](/docs?section=references), LaTeX citation commands work with autocomplete and visual feedback:

- Type `\cite{` to trigger autocomplete from your reference library.
- Hover over a citation key to see the full reference details.
- Citation keys are color-coded -- valid keys in accent color, broken keys in red.
- A `references.bib` file is auto-generated from your library before each compile. You do not need to maintain a `.bib` file manually.

Standard variants (`\citep`, `\citet`, `\citeauthor`, etc.) are also supported.
