// Platform detection — single source of truth for OS-specific behavior

export const isMac = /Mac|iPhone|iPad/.test(navigator.platform)

// Check the platform's primary modifier key (Cmd on macOS, Ctrl on Windows/Linux)
export function isMod(e) {
  return isMac ? e.metaKey : e.ctrlKey
}

// Display strings
export const modKey = isMac ? 'Cmd' : 'Ctrl'
export const altKey = isMac ? 'Option' : 'Alt'

// Default shell per platform, with optional user override
export function defaultShell(override) {
  if (override) {
    const name = override.split('/').pop()
    const loginShells = ['bash', 'zsh', 'sh']
    const args = loginShells.includes(name) ? ['-l'] : []
    return { cmd: override, args }
  }
  if (isMac) return { cmd: '/bin/zsh', args: ['-l'] }
  if (/Win/.test(navigator.platform)) return { cmd: 'cmd.exe', args: [] }
  return { cmd: '/bin/bash', args: ['-l'] }
}
