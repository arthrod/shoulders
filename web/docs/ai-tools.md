---
id: ai-tools
title: Tools & Review
subtitle: What the AI can do in your workspace, and how to review its changes.
group: AI Assistant
order: 10
---

## What the AI can do

The AI chat has access to 29 tools, organised in six categories. Each tool can be
individually enabled or disabled in Settings → Tools.

| Category | Tools |
|----------|-------|
| Workspace | Read files, write files, edit files, search content, list files, create/rename/move/duplicate/delete files, run commands |
| References | Search references, get reference details, add reference (DOI lookup), insert citation, edit reference |
| Feedback | Add comment, reply to comment, resolve comment, create proposal |
| Notebooks | Read notebook, edit cell, run cell, run all cells, add cell, delete cell |
| Web research | Web search, academic paper search, fetch URL content |
| Creation | Generate images from text prompts |

:::note
Web research and image generation tools transmit data to third-party services beyond your AI provider. They are clearly labelled as external in Settings. A single "Disable all external tools" toggle removes them all at once.
:::

## Image generation

Ask the AI to generate an image and it will use Gemini 3.1 Flash Image (Nano Banana 2) to create it. The image appears inline in the chat and is automatically saved to your workspace root as `generated-{timestamp}.png`.

Supported aspect ratios: 1:1, 3:4, 4:3, 9:16, 16:9. Click the image in chat to open it in the editor.

Image generation requires either a Google API key (Settings > Models) or a Shoulders account (Settings > Account). Output pricing is ~$0.067 per 1K image (~$60/MTok output tokens).

## Reviewing AI changes

When the AI modifies a file -- through the chat, a comment-driven revision, or an external
tool like Claude Code -- the change is applied to disk immediately but also recorded for
review. The change appears as an inline diff in the editor:

- **Text edits** -- the old text has a red strikethrough, the new text
  appears in green next to it. Accept (checkmark) and reject (X) buttons are inline.
- **Full file writes** -- a merge view shows the old and new content
  side by side.

A review bar above the editor shows the total count of pending changes for the active file,
with "Keep All" and "Revert All" buttons.

- **Accept** -- acknowledges the change. The diff decoration is removed.
  The file stays as-is (the change was already applied).
- **Reject** -- reverts the file to its pre-edit content. The change is
  undone on disk.

## Direct mode

By default, Shoulders runs in **Review mode** -- all AI edits are shown as
inline diffs for you to accept or reject. If you prefer to let edits go through without
review, toggle to **Direct mode** in the footer bar.

Direct mode is useful for rapid iteration when you trust the AI's changes and want to
skip the review step. You can switch between modes at any time.

## Notebook cell review

AI edits to notebook cells also go through the review system:

- **Edit cell** -- yellow border, inline view of old vs. new source.
- **Add cell** -- green border, phantom cell appears at the insertion point.
- **Delete cell** -- red border, cell is dimmed.

Accept writes the change. Reject restores the previous state.

## Managing tool permissions

Go to Settings (<kbd>Cmd/Ctrl</kbd>+<kbd>,</kbd>) → Tools to see all 29 tools with their
descriptions. Toggle individual tools on or off. Disabled tools are removed from the AI's
definitions entirely -- it cannot see or use them.

See [Setup → Privacy controls](/docs?section=ai-setup) for more on controlling
what the AI can access.

## Claude Code integration

If you use [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
(Anthropic's command-line AI agent) in the same workspace, Shoulders can intercept its file
edits and route them through the review system. The intercept hook is auto-installed in your
workspace when you open it -- no manual configuration needed.

Claude Code edits go through immediately (the agent does not wait for your review), but
they appear as inline diffs in the editor. You can accept or reject them at any time.
