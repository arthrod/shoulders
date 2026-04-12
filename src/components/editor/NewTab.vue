<template>
  <div class="flex flex-col h-full" style="background: rgb(var(--bg-primary));">

    <!-- Close pane button (split panes only) -->
    <div v-if="paneId !== 'pane-root'"
      class="flex items-center justify-end h-7 shrink-0 border-b px-1"
      style="border-color: rgb(var(--border));">
      <button
        class="p-1 rounded cursor-pointer"
        style="color: rgb(var(--fg-muted));"
        title="Close pane"
        @click="editorStore.collapsePane(paneId)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>

    <!-- Single-view content -->
    <div class="flex-1 overflow-y-auto min-h-0" ref="itemListRef">
      <div class="w-full mx-auto pb-10" style="max-width: min(80ch, 90%); padding-top: clamp(1rem, 20vh, 8rem);">

        <!-- Recent files -->
        <template v-if="recentItems.length > 0">
          <div class="text-[9px] font-semibold tracking-[0.08em] uppercase pl-5 pb-0.5" style="color: rgb(var(--fg-muted));">Recent</div>
          <button
            v-for="(item, i) in recentItems"
            :key="'r-' + i"
            class="newtab-item flex items-center gap-2 w-full border-none bg-transparent text-left py-1 cursor-pointer transition-colors duration-75"
            :style="{ color: selectedIdx === i ? 'rgb(var(--fg-primary))' : 'rgb(var(--fg-secondary))' }"
            @click="activate(item)"
            @mouseenter="selectedIdx = i"
          >
            <span
              class="w-3 shrink-0 leading-none select-none"
              style="font-size: 14px;"
              :style="{ color: selectedIdx === i ? 'rgb(var(--fg-muted))' : 'transparent' }"
            >›</span>
            <span class="flex-1 text-[13px] truncate min-w-0">{{ item.label }}</span>
            <span class="text-[11px] shrink-0 whitespace-nowrap mx-4" style="color: rgb(var(--fg-muted));">{{ item.meta }}</span>
          </button>
        </template>

        <!-- Create -->
        <div
          class="text-[9px] font-semibold tracking-[0.08em] uppercase pl-5 pb-0.5"
          :class="recentItems.length > 0 ? 'mt-4' : ''"
          style="color: rgb(var(--fg-muted));"
        >Create</div>
        <button
          v-for="(item, i) in createItems"
          :key="'c-' + i"
          class="newtab-item flex items-center gap-2 w-full border-none bg-transparent text-left py-1 cursor-pointer transition-colors duration-75"
          :style="{ color: selectedIdx === recentItems.length + i ? 'rgb(var(--fg-primary))' : 'rgb(var(--fg-secondary))' }"
          @click="activate(item)"
          @mouseenter="selectedIdx = recentItems.length + i"
        >
          <span
            class="w-3 shrink-0 leading-none select-none"
            style="font-size: 14px;"
            :style="{ color: selectedIdx === recentItems.length + i ? 'rgb(var(--fg-muted))' : 'transparent' }"
          >›</span>
          <span class="flex-1 text-[13px] truncate min-w-0">{{ item.label }}</span>
          <span class="text-[11px] shrink-0 whitespace-nowrap mx-4" style="color: rgb(var(--fg-muted));">{{ item.meta }}</span>
        </button>

      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useEditorStore } from '../../stores/editor'
import { useFilesStore } from '../../stores/files'
import { useWorkspaceStore } from '../../stores/workspace'

const props = defineProps({
  paneId: { type: String, required: true },
})

const editorStore = useEditorStore()
const filesStore  = useFilesStore()
const workspace   = useWorkspaceStore()

const itemListRef  = ref(null)
const selectedIdx  = ref(0)

const MAX_RECENT = 5

const fileTypes = [
  { ext: '.md',    label: 'Markdown' },
  { ext: '.qmd',   label: 'Quarto' },
  { ext: '.tex',   label: 'LaTeX' },
  { ext: '.docx',  label: 'Word document' },
  { ext: '.ipynb', label: 'Jupyter notebook' },
  { ext: '.py',    label: 'Python' },
]

// ─── Data ─────────────────────────────────────────────────────────

const allRecentFiles = computed(() => {
  const flatPaths = new Set(filesStore.flatFiles.map(f => f.path))
  return editorStore.recentFiles.filter(entry => flatPaths.has(entry.path))
})

const recentItems = computed(() =>
  allRecentFiles.value.slice(0, MAX_RECENT).map(f => ({
    label: fileName(f.path),
    meta: relativeTime(f.openedAt),
    action: () => openFile(f.path),
  }))
)

const createItems = computed(() =>
  fileTypes.map(ft => ({
    label: ft.label,
    meta: ft.ext,
    action: () => createNewFile(ft.ext),
  }))
)

const allItems = computed(() => [...recentItems.value, ...createItems.value])

// ─── Keyboard navigation ──────────────────────────────────────────

function handleKeydown(e) {
  if (editorStore.activePaneId !== props.paneId) return
  const active = document.activeElement
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return

  switch (e.key) {
    case 'ArrowUp':    e.preventDefault(); moveSelection(-1); break
    case 'ArrowDown':  e.preventDefault(); moveSelection(1);  break
    case 'Enter':      e.preventDefault(); activateSelected(); break
  }
}

function moveSelection(delta) {
  const count = allItems.value.length
  if (count === 0) return
  const next = Math.max(0, Math.min(count - 1, selectedIdx.value + delta))
  selectedIdx.value = next
  nextTick(() => {
    const buttons = itemListRef.value?.querySelectorAll('button.newtab-item')
    buttons?.[next]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}

function activateSelected() {
  const item = allItems.value[selectedIdx.value]
  if (item) activate(item)
}

function activate(item) {
  item.action()
}

// ─── Helpers ──────────────────────────────────────────────────────

function fileName(path) {
  return path.split('/').pop() || path
}

function relativeTime(ts) {
  if (!ts) return ''
  const val = typeof ts === 'number' ? ts : new Date(ts).getTime()
  const diff = Date.now() - val
  const sec  = Math.floor(diff / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const days = Math.floor(hr / 24)
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

function openFile(path) {
  editorStore.setActivePane(props.paneId)
  editorStore.openFile(path)
}

async function createNewFile(ext) {
  if (!workspace.path) return
  const baseName = 'untitled'
  let name = `${baseName}${ext}`
  let counter = 2
  while (true) {
    const fullPath = `${workspace.path}/${name}`
    try {
      const exists = await invoke('path_exists', { path: fullPath })
      if (!exists) break
    } catch { break }
    name = `${baseName}-${counter}${ext}`
    counter++
  }
  const created = await filesStore.createFile(workspace.path, name)
  if (created) {
    editorStore.setActivePane(props.paneId)
    editorStore.openFile(created)
  }
}

// ─── Lifecycle ────────────────────────────────────────────────────

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  document.activeElement?.blur()
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>
