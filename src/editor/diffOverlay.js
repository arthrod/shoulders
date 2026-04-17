import { Compartment, Text, EditorState } from '@codemirror/state'
import { EditorView, ViewPlugin, lineNumbers } from '@codemirror/view'
import { unifiedMergeView, getChunks, getOriginalDoc, updateOriginalDoc, MergeView, mergeViewSiblings } from '@codemirror/merge'
import { history, undo, redo, invertedEffects } from '@codemirror/commands'
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
      // Make accept undoable: register inverse effects for updateOriginalDoc
      invertedEffects.of(tr => {
        const effects = []
        for (const e of tr.effects) {
          if (e.is(updateOriginalDoc)) {
            const prevOriginal = getOriginalDoc(tr.startState)
            effects.push(updateOriginalDoc.of({
              doc: prevOriginal,
              changes: e.value.changes.invert(prevOriginal),
            }))
          }
        }
        return effects
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

  // We create the MergeView first, then reference it in the accept handler via closure
  let mv

  mv = new MergeView({
    a: {
      doc: originalContent,
      extensions: [
        ...sharedExtensions,
        EditorView.editable.of(false),
        history(),
      ],
    },
    b: {
      doc: currentContent,
      extensions: [
        ...sharedExtensions,
        // B is editable — user can type, matching inline behavior
        history(),
        chunkWatcher,
      ],
    },
    parent,
    orientation: 'a-b',
    revertControls: 'a-to-b',
    renderRevertControl: () => {
      const wrap = document.createElement('div')
      wrap.className = 'cm-merge-chunk-buttons'

      // Accept button — copies B content into A so the chunk disappears
      const acceptBtn = document.createElement('button')
      acceptBtn.className = 'cm-merge-accept-btn'
      acceptBtn.textContent = '✓'
      acceptBtn.title = 'Accept this change'
      acceptBtn.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation() // prevent CM6's revert handler
        const chunkIdx = parseInt(wrap.dataset.chunk)
        if (isNaN(chunkIdx) || !mv) return
        const chunk = mv.chunks[chunkIdx]
        if (!chunk) return
        // Copy B's text into A at the chunk position
        let insert = mv.b.state.sliceDoc(chunk.fromB, Math.max(chunk.fromB, chunk.toB - 1))
        if (chunk.fromB !== chunk.toB && chunk.toA <= mv.a.state.doc.length)
          insert += mv.b.state.lineBreak
        mv.a.dispatch({
          changes: { from: chunk.fromA, to: Math.min(mv.a.state.doc.length, chunk.toA), insert },
        })
        // Fallback: check if all chunks resolved after layout settles
        requestAnimationFrame(() => {
          if (mv && mv.chunks.length === 0) {
            hadChunks = false
            setTimeout(() => onAllResolved?.(), 0)
          }
        })
      })

      // Revert button — CM6's built-in handler catches this via event bubbling
      // Add fallback chunk check after revert completes
      const revertBtn = document.createElement('button')
      revertBtn.className = 'cm-merge-revert-btn'
      revertBtn.textContent = '✗'
      revertBtn.title = 'Revert this change'
      revertBtn.addEventListener('mousedown', () => {
        // Don't preventDefault/stopPropagation — let CM6's handler run
        // Just schedule a fallback check after the revert processes
        requestAnimationFrame(() => {
          if (mv && mv.chunks.length === 0) {
            hadChunks = false
            setTimeout(() => onAllResolved?.(), 0)
          }
        })
      })

      wrap.appendChild(acceptBtn)
      wrap.appendChild(revertBtn)
      return wrap
    },
    highlightChanges: true,
    gutter: true,
    ...(collapse ? { collapseUnchanged: { margin: 3, minSize: 4 } } : {}),
  })

  // Cmd+Z / Cmd+Shift+Z on the MergeView container — try B (rejects) then A (accepts)
  mv.dom.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
      e.preventDefault()
      if (e.shiftKey) {
        redo(mv.b) || redo(mv.a)
      } else {
        undo(mv.b) || undo(mv.a)
      }
    }
  })
  // Make the container focusable so it receives keyboard events
  mv.dom.tabIndex = -1

  return mv
}

/**
 * Destroy a side-by-side MergeView instance.
 */
export function destroySideBySideMergeView(mergeView) {
  if (mergeView) mergeView.destroy()
}
