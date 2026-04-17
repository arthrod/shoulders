---
id: ai-chat
title: "AI Chat"
subtitle: "A conversation with an AI that can read, search, and edit your workspace."
group: AI Assistant
order: 8
---

## Opening the chat

The chat lives in the right sidebar. Two shortcuts to reach it:

- <kbd>Cmd/Ctrl</kbd>+<kbd>J</kbd> — toggles the right sidebar.
- <kbd>Cmd/Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> — opens the sidebar and focuses the chat input. If you have text selected in the editor, it is sent to the chat as context.

## Conversations

You can have multiple chat sessions open as tabs. Each session has its own independent conversation history. Close a session tab to archive it — the conversation is saved to disk and can be reopened later from the history dropdown (clock icon in the tab bar).

## Context

The AI automatically receives context about your workspace at the start of each conversation: which files are open, which file is active, the current git branch, and a summary of recent changes. This means the AI is aware of what you are working on without you needing to explain it.

### Attaching files

Type `@` in the chat input to search for files in your workspace. Select a file to attach it to your message. The file's content is included in the conversation (truncated at 50KB for large files). PDFs are text-extracted before sending. You can attach multiple files.

### Attaching folders

Type `@` followed by a folder name to attach an entire folder as context. Shoulders builds a recursive listing of the folder's contents (file names and directory structure, up to three levels deep) and sends it to the AI. This is useful for questions like "what's in my data folder?" or "help me reorganise these files."

### Sending a selection

Select text in the editor and press <kbd>Cmd/Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd>. The selected text appears as a quoted chip in the chat input, along with surrounding context so the AI knows where the selection sits within the file.

### Project instructions

If you have created an `_instructions.md` file in your workspace root, its contents are included in every conversation. See [Setup](/docs?section=ai-setup) for details.

## Switching models

The model picker in the chat input lets you choose which AI model to use. You can switch models mid-conversation. Available models depend on which API keys you have configured (see [Setup](/docs?section=ai-setup)).

## Token budget

A token count appears next to the model picker (e.g., "2.1k / 45.3k"). It turns red when approaching the model's context limit. When a conversation exceeds the budget, older messages are automatically trimmed while preserving the beginning of the conversation (which contains workspace context) and recent messages.

## Session persistence

Conversations are saved to disk as JSON files in `.shoulders/chats/`. They persist across app restarts. Close a tab to archive a session. Reopen archived sessions from the history dropdown (clock icon, sorted by last update).

## Prompts

The **PROMPTS** tab in the right sidebar is a personal prompt library. It ships with built-in prompts for common research tasks (proofreading, argument critique, summarisation, finding related work, prose tightening, code explanation) and lets you create your own.

### Using a prompt

Click any prompt in the list. Its text is placed into the chat input so you can review or edit it before sending. Press <kbd>Enter</kbd> to send.

### Creating a custom prompt

Click **+ New prompt** at the bottom of the PROMPTS tab. Fill in a title and the prompt text, then click **Save** (or press <kbd>Cmd/Ctrl</kbd>+<kbd>Enter</kbd>). Your prompt appears under "Your prompts" above the built-in ones.

### Editing and deleting

Hover over a custom prompt to reveal the edit (pencil) and delete (X) buttons. Built-in prompts cannot be edited or deleted.

### Storage

Custom prompts are saved to `.shoulders/prompts.json` (per workspace, not synced via git).
