import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { emit } from '@tauri-apps/api/event'
import { nanoid } from '../stores/utils'

const activePopouts = new Map()

export async function popOutTab(filePath, workspacePath) {
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

  const webview = new WebviewWindow(label, {
    url,
    title: `${fileName} — Shoulders`,
    width: 900,
    height: 700,
    resizable: true,
    center: true,
  })

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
