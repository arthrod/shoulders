---
id: inline-suggestions
title: "Inline Suggestions"
subtitle: "AI-powered text completions that appear as ghost text at your cursor."
group: AI Assistant
order: 7
---

## How it works

Type `++` (two plus signs quickly) anywhere in your document. The trigger characters are consumed — they do not appear in your text. A small loading animation appears at the cursor while the AI generates a completion.

The completion appears as gray ghost text extending from your cursor position. It continues your sentence, paragraph, or code based on what surrounds the cursor.

## Accepting and dismissing

The AI generates several alternative completions. The first one appears immediately. A small badge (e.g., "2/4") shows which alternative you are viewing.

| Action | Keys |
|--------|------|
| Accept the suggestion | <kbd>Tab</kbd>, <kbd>Enter</kbd>, or <kbd>Right</kbd> |
| Next alternative | <kbd>Down</kbd> |
| Previous alternative | <kbd>Up</kbd> |
| Dismiss | <kbd>Esc</kbd>, <kbd>Left</kbd>, or click elsewhere |

## What the AI sees

The model receives up to 5,000 characters before your cursor and 1,000 characters after, with smart word-boundary truncation. It also receives your system prompt and project instructions (`_instructions.md`) if they exist. This context is sufficient for the AI to continue your writing in a way that fits the surrounding text.

## Where it works

Inline suggestions are available in:

- Markdown files
- Code files (Python, R, JavaScript, etc.)
- Word documents (`.docx`)
- Individual cells within Jupyter notebooks

## Turning suggestions off

If you prefer not to use inline suggestions, you can disable them in Settings (<kbd>Cmd/Ctrl</kbd>+<kbd>,</kbd>) → Environment.
