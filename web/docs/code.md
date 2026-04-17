---
id: code
title: "Code & Notebooks"
subtitle: "Run R, Python, and Julia code alongside your writing. Edit Jupyter notebooks natively."
group: Workspace
order: 13
---

## Running code from files

If you write code as part of your research — R scripts, Python analysis, Julia models — you can run it directly inside Shoulders without switching to another application.

| Action | Shortcut |
|--------|----------|
| Run selection (or current line) | <kbd>Cmd/Ctrl</kbd>+<kbd>Enter</kbd> |
| Run entire file | <kbd>Shift</kbd>+<kbd>Cmd/Ctrl</kbd>+<kbd>Enter</kbd> |

The first time you run code in a file, Shoulders automatically creates a language session in the terminal panel: an interactive R session, a Python interpreter, or a Julia REPL. Subsequent executions reuse the same session.

When running a selection, the cursor advances to the next line — you can step through a file line by line by pressing <kbd>Cmd/Ctrl</kbd>+<kbd>Enter</kbd> repeatedly.

## Jupyter notebooks

Shoulders opens `.ipynb` files natively. It reads and writes the standard Jupyter Notebook format — the same format used by JupyterLab, VS Code, and Google Colab.

Notebooks contain code cells (with syntax highlighting), markdown cells (with live preview), and raw cells. Use the cell toolbar or notebook toolbar to add, delete, and reorder cells.

Cell outputs render inline: text, HTML, images, and error tracebacks with colour support. The notebook toolbar provides: run cell, run all, restart kernel, interrupt, and clear outputs. A kernel status indicator shows whether the kernel is idle, running, or has encountered an error.

Inline suggestions (`++`) and comment threads also work inside individual notebook cells.

## What you need installed

R, Python, or Julia must be installed on your system. Shoulders does not bundle these languages — it connects to whatever you already have.

- **For R** — install R from [cran.r-project.org](https://cran.r-project.org). If you use RStudio, R is likely already installed.
- **For Python** — install Python from [python.org](https://python.org) or via conda/miniconda.
- **For Julia** — install Julia from [julialang.org](https://julialang.org).

:::note
For Jupyter notebooks, you also need `ipykernel` installed in your Python environment: `pip install ipykernel`. Shoulders discovers installed Jupyter kernels automatically.
:::

## Code chunks in R Markdown and Quarto

In `.rmd` and `.qmd` files, fenced code blocks with language tags (e.g., `` ```{r} ``, `` ```{python} ``) are recognised as executable code chunks. A green play button appears in the margin for each chunk — click it to send the code to the appropriate language session.

## The terminal

Shoulders includes a built-in terminal in the right sidebar. It runs a full shell session — the same as your system terminal, with the same configuration and installed programs.

- Create multiple terminal tabs with the **+** button.
- Terminal processes persist when you switch between sidebar tabs (chat, comments, etc.).
- Language sessions created by <kbd>Cmd/Ctrl</kbd>+<kbd>Enter</kbd> appear as labelled terminal tabs (e.g., "Python", "R").
- Clickable URLs, auto-resize, and theme-aware colours.

## AI and code

The AI chat includes tools for working with notebooks: it can read notebook contents, edit individual cells, run cells, add new cells, and delete cells. Cell edits from the AI go through the same review system as file edits — they appear as inline diffs within the cell, with accept and reject controls.
