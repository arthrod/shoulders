---
id: navigation
title: "Navigation & Settings"
subtitle: "Quick Open, the file tree, version history, themes, and workspace configuration."
group: Workspace
order: 14
---

## Quick Open

<kbd>Cmd/Ctrl</kbd>+<kbd>P</kbd> is the fastest way to get anywhere. It opens a search bar in the header with three modes in one interface:

- **File names** — start typing a filename for instant fuzzy matching. Results are ranked by relevance.
- **File contents** — a full-text search runs across your entire workspace, showing filenames, line numbers, and matching text.
- **References** — citation keys, titles, and author names from your reference library appear in results. Selecting a reference inserts `[@key]` at the cursor.

## The file tree

The left sidebar shows a directory tree of your workspace. Click files to open them. Expand and collapse folders. The active file is highlighted.

Create new files with the **+** button at the top, or right-click for options (new document, new file with a custom name, new notebook, new folder). Rename a file by double-clicking it or pressing <kbd>Enter</kbd>. Drag files between folders to move them.

Press <kbd>Cmd/Ctrl</kbd>+<kbd>F</kbd> with the sidebar focused to filter the tree by name.

## Version history

Every workspace automatically gets local version history powered by Git. You do not need to install Git or know how to use it — Shoulders handles everything behind the scenes. Every change is versioned from the start.

- **Auto-commit** — every 5 minutes, all changes are committed silently in the background. This is an invisible safety net.
- **Named snapshots** — press <kbd>Cmd/Ctrl</kbd>+<kbd>S</kbd> to create a checkpoint immediately. A prompt appears in the footer for about 8 seconds, giving you the option to name the version (e.g., "Draft 2" or "Before rewrite"). If you skip it, the checkpoint is saved with a timestamp.

To browse or restore previous versions, right-click any file in the tree and select **Version History**. A panel shows every version that touched that file. Named snapshots are highlighted with a bookmark icon. Select a version to preview it, then click **Restore** to revert. Restoration is non-destructive — the current version remains in history.

:::tip
Auto-save (writing the file to disk) happens one second after you stop typing. <kbd>Cmd/Ctrl</kbd>+<kbd>S</kbd> does more: it also creates a named snapshot in your version history. You can always name it in the 8-second window that appears in the footer.
:::

## Backing up to GitHub

You can connect your workspace to a GitHub repository to back up your work and sync it across devices. This is entirely optional.

- **Connect** — go to Settings (<kbd>Cmd/Ctrl</kbd>+<kbd>,</kbd>) → GitHub to link your account and repository.
- **Automatic Sync** — once connected, Shoulders automatically synchronises your changes to GitHub in the background.
- **Sync Status** — a cloud icon in the footer shows your sync status. If there is a conflict (e.g., you edited the same file on two different computers), a dialog will help you choose which version to keep.

## Themes

Shoulders includes eight colour themes. The theme applies to the entire interface — editor, sidebars, terminal, modals.

- **Tokyo Night** (default) — dark with blue-purple accents.
- **Light** — light background with cadet blue accents.
- **Monokai** — classic dark with warm accents.
- **Nord** — polar night dark with frost blue.
- **Solarized** — Ethan Schoonover's dark solarised palette.
- **Humane** — warm-toned dark theme.
- **One Light** — Atom-inspired light theme.
- **Dracula** — dark with pink-purple accents.

Change the theme in Settings (<kbd>Cmd/Ctrl</kbd>+<kbd>,</kbd>) → Theme. The choice persists across sessions.

## External changes

If files in your workspace are modified outside of Shoulders — by another editor, a git operation, or a sync tool — the file tree refreshes and open editors reload automatically.
