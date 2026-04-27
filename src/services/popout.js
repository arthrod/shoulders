import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { emit } from '@tauri-apps/api/event'
import { nanoid } from '../stores/utils'

const activePopouts = new Map()

export async function popOutTab(filePath, workspacePath, coords) {
  if (activePopouts.has(filePath)) {
    const label = activePopouts.get(filePath)
    const existing = WebviewWindow.getByLabel(label)
    if (existing) {
      try {
        await existing.setFocus()
        return null
      } catch {
        // Window may be closing — fall through to create new
      }
    }
    activePopouts.delete(filePath)
  }

  const label = `popout-${nanoid()}`
  const fileName = filePath.split('/').pop() || 'Untitled'
  const url = `index.html?popout=${encodeURIComponent(filePath)}&workspace=${encodeURIComponent(workspacePath)}`

  const width = 900
  const height = 700
  const opts = { url, title: `${fileName} — Shoulders`, width, height, resizable: true }

  if (coords?.screenX != null) {
    opts.x = Math.max(0, coords.screenX - Math.round(width / 2))
    opts.y = Math.max(0, coords.screenY + 20)
  } else {
    opts.center = true
  }

  const webview = new WebviewWindow(label, opts)

  activePopouts.set(filePath, label)

  webview.once('tauri://destroyed', () => {
    activePopouts.delete(filePath)
    emit('popout-closed', { filePath }).catch(() => {})
  })

  return label
}

export function clearPopout(filePath) {
  activePopouts.delete(filePath)
}
