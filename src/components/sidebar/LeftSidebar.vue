<template>
  <div ref="containerEl" class="flex flex-col h-full overflow-hidden bg-surface-secondary">
    <!-- Header: [OS spacer] [≡] [project ▾] [⚙] — drag — (same order as context bar) -->
    <div class="shrink-0 flex items-center h-8" :class="isMac ? 'pl-[78px]' : 'pl-1.5'" data-tauri-drag-region>
      <button
        class="w-7 h-7 flex items-center justify-center rounded text-content-muted hover:text-content hover:bg-surface-hover"
        title="Collapse sidebar (⌘B)"
        @click="workspace.toggleLeftSidebar()"
      >
        <IconLayoutSidebar :size="16" :stroke-width="1.5" />
      </button>
      <div class="w-2 shrink-0" />
      <button
        ref="projectBtnRef"
        class="flex items-center gap-1.5 px-2 py-1 rounded text-content-secondary hover:text-content hover:bg-surface-hover transition-colors ui-text-sm font-medium min-w-0"
        @click="openSwitcher"
      >
        <span class="truncate">{{ projectName }}</span>
        <IconChevronDown :size="10" :stroke-width="1.5" class="shrink-0 text-content-muted" />
      </button>
      <div class="w-1 shrink-0" />
      <button
        class="shrink-0 w-7 h-7 flex items-center justify-center rounded text-content-muted hover:text-content hover:bg-surface-hover"
        title="Settings (⌘,)"
        @click="workspace.openSettings()"
      >
        <IconSettings :size="16" :stroke-width="1.5" />
      </button>
      <div class="flex-1 h-full" data-tauri-drag-region />
    </div>

    <!-- Panel area: explorer + refs fill remaining space -->
    <div class="flex-1 flex flex-col min-h-0 overflow-hidden">
      <!-- Explorer section -->
      <div
        class="overflow-hidden"
        :style="explorerStyle"
      >
        <FileTree
          ref="fileTreeRef"
          :collapsed="explorerCollapsed"
          @toggle-collapse="toggleExplorer"
          @open-search="openSearch"
          @version-history="$emit('version-history', $event)"
        />
      </div>

      <!-- Resize handle: explorer <-> refs (when both expanded) -->
      <div
        v-if="showHandleExplorerRefs"
        class="relative h-0.5 shrink-0 cursor-row-resize bg-transparent"
        @mousedown="startResizeRefs"
      >
        <div class="absolute left-0 right-0 top-0.5 -translate-y-1/2 h-4 w-full z-10"></div>
      </div>

      <!-- References section -->
      <div
        class="overflow-hidden relative border-t border-line"
        :style="refsStyle"
      >
        <ReferenceList
          :collapsed="refsCollapsed"
          @toggle-collapse="toggleRefs"
        />
      </div>
    </div>

    <!-- Git sync footer (pinned at bottom) -->
    <div
      v-if="workspace.githubUser"
      class="shrink-0 flex items-center gap-1.5 px-3 select-none text-content-muted"
      style="height: 22px;"
    >
      <svg
        class="shrink-0"
        :class="syncIconClass"
        width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
      >
        <path d="M6.657 18c-2.572 0 -4.657 -2.007 -4.657 -4.483c0 -2.475 2.085 -4.482 4.657 -4.482c.393 -1.762 1.794 -3.2 3.675 -3.773c1.88 -.572 3.956 -.193 5.444 1c1.488 1.19 2.162 3.007 1.77 4.768h.99c1.913 0 3.464 1.56 3.464 3.486c0 1.927 -1.551 3.487 -3.465 3.487" />
        <path v-if="syncStatus === 'syncing'" d="M12 13v9" />
        <path v-if="syncStatus === 'syncing'" d="M9 19l3 3l3 -3" />
      </svg>
      <span class="ui-text-xs" :class="syncTextClass">{{ syncLabel }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { IconLayoutSidebar, IconChevronDown, IconSettings } from '@tabler/icons-vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { isMac } from '../../platform'
import FileTree from './FileTree.vue'
import ReferenceList from './ReferenceList.vue'

const emit = defineEmits(['version-history'])

const workspace = useWorkspaceStore()
const containerEl = ref(null)
const fileTreeRef = ref(null)
const projectBtnRef = ref(null)

// Project name from workspace path
const projectName = computed(() => {
  if (!workspace.path) return 'Workspace'
  return workspace.path.split('/').pop()
})

// Shortened path (replace home dir with ~)
const projectPath = computed(() => {
  if (!workspace.path) return ''
  const parts = workspace.path.split('/')
  if (parts.length >= 3 && (parts[1] === 'Users' || parts[1] === 'home')) {
    return '~/' + parts.slice(3).join('/')
  }
  return workspace.path
})

// Sync status
const syncStatus = computed(() => workspace.syncStatus)

const syncLabel = computed(() => {
  switch (syncStatus.value) {
    case 'syncing': return 'Saving...'
    case 'error': return 'Sync error'
    case 'conflict': return 'Conflict'
    default: return 'Synced'
  }
})

const syncIconClass = computed(() => {
  if (syncStatus.value === 'error') return 'text-error'
  if (syncStatus.value === 'conflict') return 'text-warning'
  if (syncStatus.value === 'syncing') return 'animate-pulse-icon'
  return ''
})

const syncTextClass = computed(() => {
  if (syncStatus.value === 'error') return 'text-error'
  if (syncStatus.value === 'conflict') return 'text-warning'
  return ''
})

// --- Collapse states ---
const explorerCollapsed = ref(false)
const refsCollapsed = ref(false)

// Panel heights when expanded (resizable)
const refHeight = ref(250)

onMounted(() => {
  try {
    const rh = localStorage.getItem('referencesPanelHeight')
    if (rh) refHeight.value = parseInt(rh, 10) || 250
    explorerCollapsed.value = localStorage.getItem('explorerCollapsed') === 'true'
    refsCollapsed.value = localStorage.getItem('refsCollapsed') === 'true'
  } catch { /* ignore */ }
})

function toggleExplorer() {
  explorerCollapsed.value = !explorerCollapsed.value
  try { localStorage.setItem('explorerCollapsed', String(explorerCollapsed.value)) } catch {}
}

function toggleRefs() {
  refsCollapsed.value = !refsCollapsed.value
  try { localStorage.setItem('refsCollapsed', String(refsCollapsed.value)) } catch {}
}

// Count expanded panels
const expandedCount = computed(() => {
  let n = 0
  if (!explorerCollapsed.value) n++
  if (!refsCollapsed.value) n++
  return n
})

// --- Layout styles ---
const explorerStyle = computed(() => {
  if (explorerCollapsed.value) return { flex: '0 0 auto' }
  return { flex: '1 1 0', minHeight: expandedCount.value > 1 ? '60px' : '28px' }
})

const refsStyle = computed(() => {
  if (refsCollapsed.value) return { flex: '0 0 auto' }
  if (expandedCount.value === 1) return { flex: '1 1 0', minHeight: '28px' }
  return { flex: `0 0 ${refHeight.value}px` }
})

// --- Resize handle visibility ---
const showHandleExplorerRefs = computed(() =>
  !explorerCollapsed.value && !refsCollapsed.value
)

// --- Resize logic ---
function startResizeRefs(event) {
  const startY = event.clientY
  const startHeight = refHeight.value
  const container = containerEl.value

  const onMouseMove = (ev) => {
    const delta = startY - ev.clientY
    const containerHeight = container?.getBoundingClientRect().height || 600
    const maxHeight = containerHeight - 120
    const newHeight = Math.max(60, Math.min(maxHeight, startHeight + delta))
    refHeight.value = newHeight
    workspace.referencesPanelHeight = newHeight
  }

  const onMouseUp = () => {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    try { localStorage.setItem('referencesPanelHeight', String(refHeight.value)) } catch {}
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

// --- Search ---
function openSearch() {
  window.dispatchEvent(new CustomEvent('app:focus-search'))
}

// --- Workspace switcher ---
function openSwitcher() {
  window.dispatchEvent(new CustomEvent('app:open-switcher', { detail: { triggerEl: projectBtnRef.value } }))
}

// Expose FileTree methods for App.vue
defineExpose({
  createNewFile(ext = '.md') {
    fileTreeRef.value?.createNewFile(ext)
  },
  activateFilter() {
    fileTreeRef.value?.activateFilter()
  },
})
</script>

<style scoped>
@keyframes pulse-icon {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.animate-pulse-icon {
  animation: pulse-icon 1.5s ease-in-out infinite;
}
</style>
