# Edit Review System

This system lets Claude Code edit files while giving the user the ability to review and revert changes. Edits go through immediately (non-blocking) but are logged for review.

## Relevant Files

| File | Role |
|---|---|
| `.claude/settings.json` | Hook configuration: PreToolUse matcher for Edit\|Write |
| `.claude/hooks/intercept-edits.sh` | Shell script: logs edits to pending-edits.json |
| `.shoulders/pending-edits.json` | JSON array of pending edit records |
| `.shoulders/.direct-mode` | Flag file: presence disables edit logging |
| `src/stores/reviews.js` | Frontend state: load/save edits, accept/reject, direct mode |
| `src/editor/diffOverlay.js` | Inline (`unifiedMergeView`) + side-by-side (`MergeView`) diff rendering, undo support |
| `src/components/editor/ReviewBar.vue` | Change count, diff layout toggle (inline/side-by-side/collapsed), Keep All / Revert All with toast undo |
| `src/components/editor/TextEditor.vue` | Merge view lifecycle, view switching with state preservation |
| `src/components/layout/Footer.vue` | Direct/Review mode toggle |

## How It Works

### Hook Flow
```
Claude Code calls Edit/Write tool
    ↓
PreToolUse hook fires (.claude/settings.json)
    ↓
intercept-edits.sh runs
    ↓
Checks for .shoulders/.direct-mode → if present, exit 0 (skip logging)
    ↓
Captures tool input (file_path, old_string, new_string for Edit; file_path, content for Write)
    ↓
For Write: also captures the OLD file content before write (for revert)
    ↓
Appends edit record to .shoulders/pending-edits.json
    ↓
Exit 0 (edit goes through — non-blocking hook)
```

### Frontend Detection
```
pending-edits.json changes on disk
    ↓
notify watcher emits fs-change event
    ↓
reviews.startWatching() listener detects pending-edits.json in changed paths
    ↓
reviews.loadPendingEdits() re-reads the JSON file
    ↓
TextEditor.vue watches reviews.editsForFile(filePath)
    ↓
Dispatches setPendingEdits effect to diffOverlayField
    ↓
Diff decorations recompute and render
```

## Edit Record Format

### For Edit Tool
```json
{
  "id": "edit-1770518939-48800",
  "timestamp": "2026-02-08T02:48:59Z",
  "tool": "Edit",
  "file_path": "/absolute/path/to/file.md",
  "old_string": "original text",
  "new_string": "replacement text",
  "status": "pending"
}
```

### For Write Tool
```json
{
  "id": "edit-1770518940-48801",
  "timestamp": "2026-02-08T02:49:00Z",
  "tool": "Write",
  "file_path": "/absolute/path/to/file.md",
  "content": "full new file content",
  "old_content": "full old file content",
  "status": "pending"
}
```

Status values: `"pending"` → `"accepted"` or `"rejected"`

## Diff Overlay Extension (`diffOverlay.js`)

Uses `@codemirror/merge` for diff rendering in two view modes:

### Inline Mode (default)

`unifiedMergeView()` extension injected via a `Compartment` (`mergeViewCompartment`). `reconfigureMergeView(view, originalContent, onAllResolved)` configures or disables it. The original document is computed by `computeOriginalContent()` which uses `edit.old_content` from the earliest pending edit, falling back to reverse string replacement.

- Editor stays editable — user can type around diff chunks
- CM6 provides per-chunk accept/reject buttons (`mergeControls: true`)
- Accept updates the internal `originalDoc` field (no doc change); made undoable via `invertedEffects` that registers inverse `updateOriginalDoc` effects
- Reject replaces current text with original (real doc change, undoable via CM6 history)
- `chunkWatcherPlugin` detects when all chunks are resolved (count goes from >0 to 0) and fires `onAllResolved` callback

### Side-by-Side Mode

`MergeView` class creates two editors: A (original, left, non-editable) and B (modified, right, editable). Custom `renderRevertControl` provides per-chunk ✓ (accept: copies B→A) and ✗ (revert: copies A→B) buttons. Both editors have `history()` for undo support. A `keydown` listener on the MergeView container handles Cmd+Z/Cmd+Shift+Z (tries B then A).

`collapseUnchanged` is enabled in the "collapsed" sub-mode (third toggle state).

### View Switching

When switching between inline and side-by-side, partial accept/reject state is preserved:
- Inline → side-by-side: captures `getOriginalDoc(view.state)` (reflects partial accepts)
- Side-by-side → inline: captures A's doc and syncs B's content to the main editor

A `switchingLayout` guard prevents recursive calls when syncing content triggers watchers.

### Accept / Reject Actions

`reviews.acceptEdit(editId)`: Sets `edit.status = 'accepted'`, saves pending edits. No file change — the edit was already applied.

`reviews.rejectEdit(editId)`: For Edit tool: reads file, replaces `new_string` with `old_string`, writes file. For Write tool: restores `old_content`. Sets `edit.status = 'rejected'`.

### Undo

- Per-chunk accept/reject: undoable via Cmd+Z while the merge view is active (CM6 history + `invertedEffects` for accepts)
- Last chunk resolution + Keep All / Revert All: shows a 6-second toast with "Undo" button that restores the file content and pending edit statuses

### Comment Margin

The comment margin and panel are hidden when side-by-side diff is active (TextEditor emits `side-by-side-change`, EditorPane hides CommentMargin/CommentPanel). Comments are anchored to positions in the main editor, not the MergeView editors.

## Direct Mode

Toggle in the footer (`Footer.vue`) or programmatically via `reviews.toggleDirectMode()`.

- **ON**: Creates `.shoulders/.direct-mode` file. The shell hook checks for this file and exits early, skipping all edit logging. No diffs appear.
- **OFF**: Deletes the `.direct-mode` file. Normal interception resumes.

The footer shows "DIRECT" in warning color when active, "REVIEW" in muted when inactive.

## ReviewBar Component

`ReviewBar.vue` is a 28px bar above the editor when there are pending changes:
- Change count label
- Diff layout toggle (inline / side-by-side / side-by-side collapsed) — persisted in `workspace.diffLayout` via localStorage
- "Keep All" (accept) and "Revert All" (reject) buttons with toast undo

## File Tree Integration

`FileTreeItem.vue` shows a small yellow dot (`hasPendingEdits` badge) next to files that have pending edits, using `reviews.filesWithEdits`.

## Built-in Chat Integration

The AI chat's `edit_file` and `write_file` tools also record edits through the same review system. Unlike the Claude Code hook (which writes to `pending-edits.json` on disk), the chat tools push directly to `reviews.pendingEdits` in memory and then call `savePendingEdits()`.

**Critical timing for merge view:** The chat tools update `filesStore.fileContents[path]` with the new content BEFORE recording the pending edit. This is required because:
1. The `TextEditor` watcher on `reviews.editsForFile` fires when the edit is recorded
2. `showMergeViewIfNeeded()` compares editor content against `edit.old_content`
3. If the editor still has old content (file watcher has 300ms debounce), `original === current` and the merge view is suppressed
4. Updating the files store cache first triggers the editor content watcher synchronously, ensuring the editor has new content when the merge view check runs

Edit IDs from chat use the format `chat-{timestamp}-{nanoid6}` (vs `edit-{timestamp}-{pid}` from the hook).

## Comment-Driven Edits

When the AI processes submitted comments and makes file edits, those edits go through the same review system as any other AI edit. The chat tools (`edit_file`, `write_file`) record pending edits identically regardless of whether the request originated from direct chat or from submitted comments.

## Notebook Cell Review

Notebook edits from the AI chat tools (`edit_cell`, `add_cell`, `delete_cell`) also go through the review system when direct mode is off.

### Edit Record Formats

```json
// edit_cell
{
  "id": "nb-edit-1770518939-a1b2",
  "tool": "NotebookEditCell",
  "file_path": "/path/to/notebook.ipynb",
  "cell_id": "abc123",
  "cell_index": 2,
  "old_source": "original code",
  "new_source": "replacement code",
  "status": "pending"
}

// add_cell
{
  "id": "nb-add-1770518940-c3d4",
  "tool": "NotebookAddCell",
  "file_path": "/path/to/notebook.ipynb",
  "cell_id": "def456",
  "cell_index": 3,
  "cell_type": "code",
  "cell_source": "new cell content",
  "status": "pending"
}

// delete_cell
{
  "id": "nb-del-1770518941-e5f6",
  "tool": "NotebookDeleteCell",
  "file_path": "/path/to/notebook.ipynb",
  "cell_id": "ghi789",
  "cell_index": 1,
  "cell_source": "cell content for display",
  "cell_type": "code",
  "status": "pending"
}
```

### Visual States

- **edit_cell**: Yellow border on the cell, inline merge view (CodeMirror `unifiedMergeView`) showing old vs new source, accept/reject buttons
- **add_cell**: Green border, phantom cell injected into the display list at the correct position. Accept writes to disk, reject removes phantom.
- **delete_cell**: Red border, cell dimmed (opacity). Accept deletes from disk, reject un-dims.

### Key Components

| File | Role |
|---|---|
| `src/stores/reviews.js` | `notebookEditsForFile()`, `notebookEditForCell()` getters; `acceptNotebookEdit()`, `rejectNotebookEdit()` actions |
| `src/components/editor/NotebookReviewBar.vue` | "N cell changes" bar with Accept All / Reject All |
| `src/components/editor/NotebookCell.vue` | `pendingEdit`/`pendingDelete`/`pendingAdd` props, visual states, review action bar, merge view |
| `src/components/editor/NotebookEditor.vue` | `displayCells` computed merges real cells + phantoms, annotates pending states |
| `src/services/chatTools.js` | `edit_cell`/`add_cell`/`delete_cell` check `directMode`, record pending edits |

### Accept Flow (notebook)

`acceptNotebookEdit(editId)`:
1. Reads the `.ipynb` from disk
2. Applies the edit (source replace / cell insert / cell remove)
3. Serializes and writes back to disk
4. Updates `filesStore.fileContents` so the editor reloads
5. Dispatches `notebook-review-resolved` event

### Reject Flow (notebook)

`rejectNotebookEdit(editId)`:
1. Marks the edit as rejected (no disk changes — the edit was never written)
2. Dispatches `notebook-review-resolved` event
3. `NotebookEditor` reloads from disk, restoring original state

### Auto-Save Guard

`NotebookEditor.saveNotebook()` is skipped when `pendingNotebookEdits.length > 0` to prevent user edits from overwriting the on-disk state that the review system reads during accept.

### Edge Cases

- Multiple edits to same cell while pending: the second edit is rejected with an error ("already has a pending edit")
- Cell index drift: tools read from disk (unchanged), so indices are stable; phantoms only exist in the display layer
- Notebook closed during review: pending edits persist in `pending-edits.json`, `displayCells` recomputes on reopen

## Important Notes

1. The hook script requires `jq` to be installed (used for JSON parsing in bash).
2. The hook is **non-blocking** - it always exits 0. The edit goes through immediately. The review is post-facto (accept or revert).
3. Edit IDs are generated from Unix timestamp + PID: `edit-$(date +%s)-$$`.
4. The `old_string` location in the diff overlay is found via `indexOf()`, so if the same string appears multiple times in a document, only the first occurrence gets the decoration.
