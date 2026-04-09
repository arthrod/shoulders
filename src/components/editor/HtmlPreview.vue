<template>
  <div class="flex flex-col h-full" style="background: rgb(var(--bg-primary));">
    <!-- Toolbar -->
    <div class="flex items-center h-7 px-2 shrink-0 border-b" style="border-color: rgb(var(--border));">
      <span class="text-[11px] truncate flex-1" style="color: rgb(var(--fg-muted));">
        {{ fileName }} — Preview
      </span>
      <button
        class="w-6 h-6 flex items-center justify-center rounded hover:bg-[rgb(var(--bg-hover))]"
        style="color: rgb(var(--fg-muted));"
        @click="openSource"
        title="Open source file"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="16 18 22 12 16 6"/>
          <polyline points="8 6 2 12 8 18"/>
        </svg>
      </button>
      <button
        class="w-6 h-6 flex items-center justify-center rounded hover:bg-[rgb(var(--bg-hover))]"
        style="color: rgb(var(--fg-muted));"
        @click="refresh"
        title="Refresh preview"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <path d="M2 8a6 6 0 0111.5-2.5M14 8a6 6 0 01-11.5 2.5"/>
          <path d="M2 3v3.5h3.5M14 13v-3.5h-3.5"/>
        </svg>
      </button>
    </div>
    <!-- Iframe -->
    <div class="flex-1 overflow-hidden relative">
      <div v-if="loading" class="flex items-center justify-center h-full text-xs" style="color: rgb(var(--fg-muted));">
        Starting preview server...
      </div>
      <div v-else-if="error" class="flex items-center justify-center h-full text-xs px-4 text-center" style="color: rgb(var(--error));">
        {{ error }}
      </div>
      <template v-else>
        <iframe
          ref="iframeRef"
          :src="iframeSrc"
          class="border-0 origin-top-left"
          :style="iframeStyle"
        />
        <!-- Transparent overlay to capture keyboard when iframe has focus -->
        <div
          v-if="iframeFocused"
          class="absolute inset-0"
          style="z-index: 1;"
          @mousedown="dismissOverlay"
          @keydown="forwardKey"
          tabindex="0"
          ref="overlayRef"
        />
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useWorkspaceStore } from '../../stores/workspace'
import { useEditorStore } from '../../stores/editor'
import { getHtmlPreviewPath } from '../../utils/fileTypes'

const props = defineProps({
  filePath: { type: String, required: true },
  paneId: { type: String, default: null },
})

const workspace = useWorkspaceStore()
const editorStore = useEditorStore()

const iframeRef = ref(null)
const overlayRef = ref(null)
const port = ref(0)
const loading = ref(true)
const error = ref(null)
const cacheBuster = ref(Date.now())
const iframeFocused = ref(false)

const actualPath = computed(() => getHtmlPreviewPath(props.filePath) || props.filePath)
const fileName = computed(() => actualPath.value.split('/').pop() || 'Preview')

const relPath = computed(() => {
  const wsRoot = workspace.path
  if (!wsRoot || !actualPath.value.startsWith(wsRoot)) return '/' + actualPath.value
  return actualPath.value.slice(wsRoot.length)
})

const iframeSrc = computed(() => {
  if (!port.value) return ''
  return `http://127.0.0.1:${port.value}${encodeURI(relPath.value)}?_t=${cacheBuster.value}`
})

// Zoom: scale iframe based on workspace zoom ratio (default font size is 14)
const zoomScale = computed(() => workspace.editorFontSize / 14)

const iframeStyle = computed(() => ({
  width: `${100 / zoomScale.value}%`,
  height: `${100 / zoomScale.value}%`,
  transform: `scale(${zoomScale.value})`,
  background: 'white',
}))

async function startServer() {
  loading.value = true
  error.value = null
  try {
    const p = await invoke('preview_start', { workspacePath: workspace.path })
    port.value = p
  } catch (e) {
    error.value = `Failed to start preview server: ${e}`
  } finally {
    loading.value = false
  }
}

function refresh() {
  cacheBuster.value = Date.now()
}

function openSource() {
  editorStore.openFile(actualPath.value)
}

// ── Cmd+W fix for cross-origin iframe ──────────────────────────────
// When the iframe gets focus, window.blur fires. We show a transparent overlay
// that captures the NEXT keyboard event. If it's Cmd+W (or other app shortcuts),
// we forward it. Then the overlay dismisses and re-focuses the iframe for
// normal interaction.

function onWindowBlur() {
  // Check if blur was caused by iframe getting focus
  // Small delay to let activeElement update
  setTimeout(() => {
    if (document.activeElement === iframeRef.value) {
      iframeFocused.value = true
      nextTick(() => overlayRef.value?.focus())
    }
  }, 0)
}

function dismissOverlay() {
  iframeFocused.value = false
  // Clicking the overlay = user wants to interact with iframe
  // Focus goes back to iframe naturally via the click-through
}

function forwardKey(e) {
  const isMod = e.metaKey || e.ctrlKey
  // Forward app-level shortcuts to the main document
  if (isMod && (e.key === 'w' || e.key === '=' || e.key === '-' || e.key === '0')) {
    e.preventDefault()
    e.stopPropagation()
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: e.key, code: e.code,
      metaKey: e.metaKey, ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey, altKey: e.altKey,
      bubbles: true, cancelable: true,
    }))
    // Keep overlay for continued shortcut use
    return
  }
  // Non-shortcut key: dismiss overlay, let iframe handle interaction
  iframeFocused.value = false
}

onMounted(() => {
  startServer()
  window.addEventListener('blur', onWindowBlur)
})

onUnmounted(() => {
  window.removeEventListener('blur', onWindowBlur)
})

watch(() => props.filePath, () => {
  cacheBuster.value = Date.now()
})
</script>
