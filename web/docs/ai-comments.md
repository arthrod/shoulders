---
id: ai-comments
title: Document Comments
subtitle: Annotate your documents with comments, then submit them to the AI for revision.
group: AI Assistant
order: 9
---

## Adding a comment

Select text in the editor and press <kbd>Cmd/Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd>.
A comment input appears in the margin next to the selected text. Type your annotation or
instruction -- for example, "Make this shorter," "Clarify this claim," or "Rewrite for a
general audience."

- **Enter** -- saves the comment without submitting to the AI.
- **Cmd/Ctrl+Enter** -- saves the comment and immediately submits it to the
  AI chat for processing.

## Comment margin

A 200px side panel appears alongside the editor, showing compact cards for each comment
anchored to its position in the document. The margin is toggled via the comment icon in the
tab bar. Each card shows the anchored text snippet and your annotation.

When you have unresolved comments, a "Submit N" button appears at the top of the margin.
Clicking it sends all unresolved comments to the AI chat as structured context.

## Batch workflow

The batch workflow is the recommended approach for substantive revision:

1. Read through your document, leaving comments wherever you want changes.
2. When you're done annotating, click "Submit N" in the comment margin.
3. The AI receives all comments together and addresses them coherently in a single pass,
   making edits that are consistent with each other.

This is more effective than processing comments one at a time, because the AI can see all
requested changes at once and avoid contradictions.

## AI replies

The AI can reply to your comments using the `reply_to_comment` tool. Replies
appear nested under the original comment in the margin. When the AI proposes an edit in
response to a comment, the change goes through the standard review system -- appearing as
an inline diff that you can accept or reject.

## Resolving and deleting

When a comment has been addressed, mark it as resolved. Resolved comments are hidden by
default but can be shown with the "Show resolved" toggle. To remove a comment permanently,
use the "..." menu on the comment card and select Delete.

## AI as reviewer

The AI can proactively add comments to your document using the `add_comment`
tool. Ask it to "review this section" or "leave comments on my draft" and it will create
margin annotations just like a human reviewer would. You can then address its feedback
manually or ask it to implement its own suggestions.

## Severity labels

Comments can have a severity level: **major**, **minor**, or **suggestion**. When present,
a colored badge appears next to the author label on the comment card:

- **Major** (red) -- a significant issue that should be addressed
- **Minor** (amber) -- worth fixing but not critical
- **Suggestion** (blue) -- optional improvement

Severity is set automatically by AI workflows (like Peer Review) and tools. Manual comments
do not have severity by default.

## Persistence

All comments are saved to `.shoulders/comments.json` and persist across
app restarts.
