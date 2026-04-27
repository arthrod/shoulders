<template>
  <div class="flex flex-col h-full">
    <!-- Terminal container -->
    <div ref="terminalContainer" class="flex-1 overflow-hidden p-1 ui-text-sm"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useWorkspaceStore } from '../../stores/workspace'
import { terminalThemes } from '../../themes/terminal'
import { defaultShell, isMac } from '../../platform'

const props = defineProps({
  termId: { type: Number, default: 1 },
  spawnCmd: { type: String, default: null },
  spawnArgs: { type: Array, default: () => [] },
  language: { type: String, default: null },
  env: { type: Object, default: null },
})

const emit = defineEmits(['exit'])

const workspace = useWorkspaceStore()
const terminalContainer = ref(null)

let terminal = null
let fitAddon = null
let ptyId = null
let unlistenOutput = null
let unlistenExit = null
let resizeObserver = null
let fontSizeObserver = null

function getTerminalFontSize() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--ui-font-size').trim()
  const base = parseInt(raw) || 13
  return Math.max(8, base - 1)
}

async function initXterm() {
  const { Terminal } = await import('@xterm/xterm')
  const { FitAddon } = await import('@xterm/addon-fit')
  const { WebLinksAddon } = await import('@xterm/addon-web-links')
  const { Unicode11Addon } = await import('@xterm/addon-unicode11')
  await import('@xterm/xterm/css/xterm.css')

  terminal = new Terminal({
    theme: terminalThemes[workspace.theme] || terminalThemes.default,
    fontFamily: "'JetBrains Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace",
    fontSize: getTerminalFontSize(),
    lineHeight: 1,
    cursorBlink: true,
    scrollback: 10000,
    allowProposedApi: true,
  })

  fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)
  terminal.loadAddon(new WebLinksAddon())
  const unicode11 = new Unicode11Addon()
  terminal.loadAddon(unicode11)
  terminal.unicode.activeVersion = '11'

  terminal.open(terminalContainer.value)

  await nextTick()
  fitAddon.fit()

  resizeObserver = new ResizeObserver(() => {
    if (!fitAddon || !terminalContainer.value) return
    const { clientWidth, clientHeight } = terminalContainer.value
    if (clientWidth === 0 || clientHeight === 0) return // hidden terminal (v-show)
    fitAddon.fit()
    if (ptyId !== null && terminal && terminal.cols > 0 && terminal.rows > 0) {
      invoke('pty_resize', {
        id: ptyId,
        cols: terminal.cols,
        rows: terminal.rows,
      }).catch(() => {})
    }
  })
  resizeObserver.observe(terminalContainer.value)

  // Watch for zoom changes (--ui-font-size on <html> style attribute)
  let lastFontSize = terminal.options.fontSize
  fontSizeObserver = new MutationObserver(() => {
    if (!terminal) return
    const newSize = getTerminalFontSize()
    if (newSize !== lastFontSize) {
      lastFontSize = newSize
      terminal.options.fontSize = newSize
      fitAddon?.fit()
    }
  })
  fontSizeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })

  // Shift+Enter → insert literal newline (like Ghostty/Warp)
  // Wrapping in bracketed paste markers makes zsh/bash insert it literally
  // instead of executing the command. Skip for agent commands (spawnCmd) —
  // they handle Shift+Enter via CSI u / Kitty keyboard protocol natively.
  if (!props.spawnCmd) {
    terminal.attachCustomKeyEventHandler((ev) => {
      if (ev.type === 'keydown' && ev.key === 'Enter' && ev.shiftKey && !ev.ctrlKey && !ev.altKey && !ev.metaKey) {
        if (ptyId !== null) {
          invoke('pty_write', { id: ptyId, data: '\x1b[200~\n\x1b[201~' }).catch(console.error)
        }
        return false // prevent xterm from sending \r
      }
      return true
    })
  }

  terminal.onData((data) => {
    if (ptyId !== null) {
      invoke('pty_write', { id: ptyId, data }).catch(console.error)
    }
  })

  terminal.onResize(({ cols, rows }) => {
    if (ptyId !== null) {
      invoke('pty_resize', { id: ptyId, cols, rows }).catch(() => {})
    }
  })
}

async function spawnTerminal() {
  if (!workspace.path || !terminal) return

  try {
    const shell = props.spawnCmd ? null : defaultShell(workspace.terminalShell || undefined)
    const cmd = props.spawnCmd || shell.cmd
    const args = props.spawnCmd ? props.spawnArgs : shell.args
    ptyId = await invoke('pty_spawn', {
      cmd,
      args,
      cwd: workspace.path,
      cols: terminal.cols,
      rows: terminal.rows,
      env: props.env || null,
    })

    unlistenOutput = await listen(`pty-output-${ptyId}`, (event) => {
      if (terminal && event.payload?.data) {
        terminal.write(event.payload.data)
      }
    })

    unlistenExit = await listen(`pty-exit-${ptyId}`, () => {
      ptyId = null
      if (terminal) {
        terminal.write('\r\n\x1b[90m[Process exited]\x1b[0m\r\n')
      }
      emit('exit')
    })
    // Set a minimal fixed-width prompt for default shells (not language REPLs).
    // Leading space avoids adding to shell history (zsh HIST_IGNORE_SPACE).
    if (!props.spawnCmd && ptyId !== null) {
      setTimeout(async () => {
        if (ptyId === null) return
        const shellName = cmd.split('/').pop()
        let promptCmd = null
        if (shellName === 'zsh') {
          promptCmd = " PROMPT='%# '; clear\n"
        } else if (shellName === 'bash' || shellName === 'sh') {
          promptCmd = " PS1='\\$ '; clear\n"
        }
        // fish, nushell, etc. manage their own prompts — just clear
        if (!promptCmd) promptCmd = ' clear\n'
        await invoke('pty_write', { id: ptyId, data: promptCmd }).catch(() => {})
      }, 200)
    }
  } catch (e) {
    console.error('Failed to spawn terminal:', e)
    if (terminal) terminal.write(`\r\nError: ${e}\r\n`)
  }
}

async function killTerminal() {
  if (ptyId !== null) {
    try {
      await invoke('pty_kill', { id: ptyId })
    } catch (e) {
      console.error('Failed to kill PTY:', e)
    }
    ptyId = null
  }
}

onMounted(async () => {
  await nextTick()
  if (terminalContainer.value) {
    await initXterm()
    if (workspace.path) {
      await spawnTerminal()
    }
  }
})

// Update terminal theme when app theme changes
watch(() => workspace.theme, (theme) => {
  if (terminal) {
    terminal.options.theme = terminalThemes[theme] || terminalThemes.default
  }
})

defineExpose({
  focus() {
    if (terminal) terminal.focus()
  },
  refitTerminal() {
    if (fitAddon) fitAddon.fit()
  },
  async writeToPty(data) {
    if (ptyId === null) return

    // Small payloads (< 2KB): send directly (well under 4KB PTY buffer)
    if (data.length < 2048) {
      await invoke('pty_write', { id: ptyId, data }).catch(console.error)
      return
    }

    // Large payloads: send in ~2KB chunks with brief pauses to avoid PTY buffer overflow
    const CHUNK_SIZE = 2048
    for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
      let end = Math.min(offset + CHUNK_SIZE, data.length)
      // Try to break at a newline boundary to avoid splitting mid-line
      if (end < data.length) {
        const nl = data.lastIndexOf('\n', end)
        if (nl > offset) end = nl + 1
      }
      await invoke('pty_write', { id: ptyId, data: data.slice(offset, end) }).catch(console.error)
      if (end < data.length) {
        await new Promise(r => setTimeout(r, 10))
      }
    }
  },
})

onUnmounted(() => {
  if (unlistenOutput) unlistenOutput()
  if (unlistenExit) unlistenExit()
  if (resizeObserver) resizeObserver.disconnect()
  if (fontSizeObserver) fontSizeObserver.disconnect()
  if (terminal) terminal.dispose()
  killTerminal()
})
</script>
