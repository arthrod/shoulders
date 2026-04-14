---
id: getting-started
title: Getting Started
subtitle: Download Shoulders, open a folder, and start writing.
group: Start
order: 1
---

## Install

Shoulders is a desktop application. Download the latest version from the [download page](/download) for macOS, Windows, or Linux. It installs as a single native binary -- no runtime dependencies.

On macOS, drag the app to your Applications folder and open it. On first launch, macOS may ask you to confirm since the app is downloaded from the internet. Right-click the app and select "Open" to bypass Gatekeeper.

## Open a workspace

A workspace in Shoulders is just a folder. There is no proprietary project format, no database, no import step. Open any folder on your filesystem, and that folder becomes your workspace.

1. Launch Shoulders. You will see the launcher screen with an **Open Folder** button.
2. Click it and select any folder -- an existing project, a new empty directory, whatever you like.
3. The folder opens as your workspace. Every file inside it appears in the sidebar.

:::tip
You can also clone an existing repository from the launcher screen. Shoulders tracks version history automatically when you open a workspace -- every change is versioned from the start.
:::

## The interface

The layout has three regions. All three are resizable and collapsible.

- **Left sidebar** -- file explorer and reference library. Toggle with <kbd>Cmd/Ctrl</kbd>+<kbd>B</kbd>.
- **Centre** -- the editor area. Supports multiple tabs and split panes.
- **Right sidebar** -- AI chat, terminals, comment threads, and backlinks. Toggle with <kbd>Cmd/Ctrl</kbd>+<kbd>J</kbd>.

The footer bar shows the current git branch, review/direct mode toggle, pending AI edit count, word and character counts, and cursor position. A zoom control sits in the centre. The header bar has a search field (<kbd>Cmd/Ctrl</kbd>+<kbd>P</kbd>) and a settings button.

## Create your first file

Click the **+** button at the top of the file tree, or right-click inside the sidebar and choose "New Document." Shoulders creates a Markdown (`.md`) file by default. Type a filename and press Enter.

Start typing. Changes are saved to disk automatically -- one second after you stop typing. Press <kbd>Cmd/Ctrl</kbd>+<kbd>S</kbd> to also create a version history checkpoint.

## Set up AI features

On first launch, a setup wizard walks you through connecting an AI provider and choosing a theme. You can skip it entirely and configure everything later in Settings (<kbd>Cmd/Ctrl</kbd>+<kbd>,</kbd>).

AI features (inline suggestions, chat, comment threads) need access to an AI provider. Two options:

- **Shoulders account** -- create a free account at [shoulde.rs](https://shoulde.rs) (includes $5.00 free). No API keys to manage.
- **Your own API keys** -- add keys for Anthropic, OpenAI, or Google in Settings (<kbd>Cmd/Ctrl</kbd>+<kbd>,</kbd>) -> Models.
- **Private or self-hosted models** -- connect to any OpenAI-compatible endpoint (local LLMs, institutional servers, private deployments) via custom URLs in `.shoulders/models.json`.

See [AI Setup](/docs?section=ai-setup) for detailed instructions.

## Keyboard essentials

Five shortcuts cover most navigation:

| Action | Shortcut |
|---|---|
| Quick open (files, content, references) | <kbd>Cmd/Ctrl</kbd>+<kbd>P</kbd> |
| Toggle left sidebar | <kbd>Cmd/Ctrl</kbd>+<kbd>B</kbd> |
| Toggle right sidebar | <kbd>Cmd/Ctrl</kbd>+<kbd>J</kbd> |
| Save and commit | <kbd>Cmd/Ctrl</kbd>+<kbd>S</kbd> |
| Open settings | <kbd>Cmd/Ctrl</kbd>+<kbd>,</kbd> |

See the [full keyboard shortcut reference](/docs?section=shortcuts) for everything else.
