/**
 * SuperDoc extension: reset heading style to Normal on Enter.
 *
 * When the cursor is at the end of a Heading paragraph and the user presses
 * Enter, SuperDoc (like Word) continues the heading style on the new line.
 * This extension intercepts Enter in that situation: it lets SuperDoc split
 * the block normally, then immediately changes the NEW paragraph's styleId
 * from "HeadingN" to "Normal" in the next transaction.
 */
import { Extensions } from 'superdoc/super-editor'

const { Extension, Plugin, PluginKey } = Extensions

const headingNormalizeKey = new PluginKey('docxHeadingNormalize')

export function createHeadingNormalizeExtension() {
  return Extension.create({
    name: 'docxHeadingNormalize',

    addPmPlugins() {
      return [
        new Plugin({
          key: headingNormalizeKey,

          // Track: "the last Enter was pressed at the end of a heading"
          state: {
            init: () => false,
            apply(tr, prev) {
              const meta = tr.getMeta(headingNormalizeKey)
              if (meta === 'reset-next') return true
              // Clear after one transaction (the split has happened)
              if (prev) return false
              return false
            },
          },

          view() {
            return {
              update(view) {
                const shouldReset = headingNormalizeKey.getState(view.state)
                if (!shouldReset) return

                // The split has happened — the cursor is now in a new paragraph
                // that inherited the heading style. Change it to Normal.
                const { from } = view.state.selection
                const $pos = view.state.doc.resolve(from)

                // Walk up to find the paragraph node
                for (let depth = $pos.depth; depth >= 0; depth--) {
                  const node = $pos.node(depth)
                  if (node.type.name !== 'paragraph') continue

                  const styleId = node.attrs?.paragraphProperties?.styleId || ''
                  if (!styleId.match(/^Heading\d+$/i)) break

                  // Reset this paragraph to Normal
                  const pos = $pos.before(depth)
                  const tr = view.state.tr.setNodeMarkup(pos, null, {
                    ...node.attrs,
                    paragraphProperties: {
                      ...node.attrs.paragraphProperties,
                      styleId: 'Normal',
                    },
                  })
                  tr.setMeta('addToHistory', false)
                  view.dispatch(tr)
                  break
                }
              },
            }
          },

          props: {
            handleKeyDown(view, event) {
              if (event.key !== 'Enter' || event.shiftKey || event.metaKey || event.ctrlKey) return false

              const { from, empty } = view.state.selection
              if (!empty) return false // only for collapsed cursor

              const $pos = view.state.doc.resolve(from)
              const para = $pos.parent

              if (para.type.name !== 'paragraph') return false

              const styleId = para.attrs?.paragraphProperties?.styleId || ''
              if (!styleId.match(/^Heading\d+$/i)) return false

              // Check if cursor is at the end of the paragraph's text content.
              // $pos.parentOffset is the offset within the parent node.
              // For "at end", it should equal the parent's content size.
              if ($pos.parentOffset < para.content.size) return false

              // Mark that the next transaction (the split) should trigger a style reset
              const tr = view.state.tr.setMeta(headingNormalizeKey, 'reset-next')
              tr.setMeta('addToHistory', false)
              view.dispatch(tr)

              // Don't consume the event — let SuperDoc handle the actual Enter/split
              return false
            },
          },
        }),
      ]
    },
  })
}
