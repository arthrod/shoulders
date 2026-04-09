import { Compartment, Text, EditorState } from '@codemirror/state'
import { EditorView, ViewPlugin, lineNumbers } from '@codemirror/view'
import { unifiedMergeView, getChunks, MergeView, mergeViewSiblings } from '@codemirror/merge'
import { shouldersTheme, shouldersHighlighting } from './theme'

// Compartment for dynamically toggling the merge view
export const mergeViewCompartment = new Compartment()

/**
 * Create the initial (empty) merge extension. Added at editor creation time.
 */
export function mergeViewExtension() {
  return mergeViewCompartment.of([])
}

/**
 * Reconfigure the merge view to show diffs against the original document.
 * Call with null to disable the merge view.
 */
export function reconfigureMergeView(view, originalContent, onAllResolved) {
  if (!originalContent) {
    view.dispatch({
      effects: mergeViewCompartment.reconfigure([]),
    })
    return
  }

  view.dispatch({
    effects: mergeViewCompartment.reconfigure([
      unifiedMergeView({
        original: Text.of(originalContent.split('\n')),
        gutter: true,
        highlightChanges: true,
        syntaxHighlightDeletions: false,
        mergeControls: true,
      }),
      // Plugin that detects when all chunks are resolved
      chunkWatcherPlugin(onAllResolved),
    ]),
  })
}

/**
 * ViewPlugin that watches for all chunks being resolved (accepted/rejected).
 * Calls the callback when no chunks remain.
 */
function chunkWatcherPlugin(onAllResolved) {
  let hadChunks = false

  return ViewPlugin.define((view) => {
    const chunks = getChunks(view.state)
    hadChunks = chunks ? chunks.chunks.length > 0 : false

    return {
      update(update) {
        const chunks = getChunks(update.state)
        const currentCount = chunks ? chunks.chunks.length : 0

        if (hadChunks && currentCount === 0) {
          // All chunks resolved - notify after a tick to avoid dispatch-in-dispatch
          hadChunks = false
          setTimeout(() => onAllResolved?.(), 0)
        } else {
          hadChunks = currentCount > 0
        }
      },
    }
  })
}

/**
 * Given the current document content and a list of pending edits,
 * compute what the document looked like BEFORE Claude's edits.
 *
 * Primary approach: use old_content from the earliest pending edit
 * (captured by the hook BEFORE the edit was applied).
 * Fallback: reverse edits via string replacement (in reverse order).
 */
export function computeOriginalContent(currentContent, edits) {
  if (edits.length === 0) return currentContent

  // Primary: use old_content from the earliest pending edit
  // (the hook captures full file content before each edit)
  const earliest = edits[0]
  if (earliest.old_content !== undefined && earliest.old_content !== null && earliest.old_content !== '') {
    return earliest.old_content
  }

  // Fallback: reverse edits in REVERSE order (last applied → first undone)
  let original = currentContent
  for (let i = edits.length - 1; i >= 0; i--) {
    const edit = edits[i]
    if (edit.tool === 'Edit' && edit.old_string) {
      if (edit.new_string) {
        // Non-empty replacement: reverse it
        original = original.replace(edit.new_string, edit.old_string)
      }
      // Skip deletions (empty new_string) — can't reliably determine insertion point
    } else if (edit.tool === 'Write' && edit.old_content !== undefined) {
      return edit.old_content || ''
    }
  }

  return original
}

/**
 * Create a side-by-side MergeView with original (left, read-only) and
 * modified (right, revert-only) editors.
 *
 * @param {Object} config
 * @param {HTMLElement} config.parent - DOM element to mount into
 * @param {string} config.originalContent - content before edits
 * @param {string} config.currentContent - content after edits
 * @param {Extension[]} config.extensions - extra extensions (language, soft wrap)
 * @param {boolean} config.collapse - whether to collapse unchanged regions
 * @param {Function} config.onAllResolved - callback when all chunks are resolved
 * @returns {MergeView}
 */
export function createSideBySideMergeView({ parent, originalContent, currentContent, extensions = [], collapse = false, onAllResolved }) {
  const sharedExtensions = [
    shouldersTheme,
    shouldersHighlighting,
    lineNumbers(),
    ...extensions,
  ]

  let hadChunks = false

  const chunkWatcher = ViewPlugin.define((view) => {
    const info = mergeViewSiblings(view)
    hadChunks = info ? info.chunks.length > 0 : false
    return {
      update(update) {
        const info = mergeViewSiblings(update.view)
        const count = info ? info.chunks.length : 0
        if (hadChunks && count === 0) {
          hadChunks = false
          setTimeout(() => onAllResolved?.(), 0)
        } else {
          hadChunks = count > 0
        }
      },
    }
  })

  const mv = new MergeView({
    a: {
      doc: originalContent,
      extensions: [
        ...sharedExtensions,
        EditorState.readOnly.of(true),
      ],
    },
    b: {
      doc: currentContent,
      extensions: [
        ...sharedExtensions,
        EditorView.editable.of(false),
        chunkWatcher,
      ],
    },
    parent,
    orientation: 'a-b',
    revertControls: 'a-to-b',
    highlightChanges: true,
    gutter: true,
    ...(collapse ? { collapseUnchanged: { margin: 3, minSize: 4 } } : {}),
  })

  return mv
}

/**
 * Destroy a side-by-side MergeView instance.
 */
export function destroySideBySideMergeView(mergeView) {
  if (mergeView) mergeView.destroy()
}
