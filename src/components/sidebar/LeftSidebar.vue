<template>
  <div ref="containerEl" class="flex flex-col h-full overflow-hidden bg-surface-secondary">
    <!-- Collapsed rail -->
    <template v-if="collapsed">
      <!-- Traffic light / drag area -->
      <div :style="{ height: trafficLightHeight + 'px' }" class="shrink-0" data-tauri-drag-region />

      <!-- Expand button -->
      <div class="flex flex-col items-center gap-1 pt-1">
        <button
          class="w-8 h-8 flex items-center justify-center rounded text-content-muted hover:text-content hover:bg-surface-hover"
          title="Expand sidebar"
          @click="workspace.toggleLeftSidebar()"
        >
          <!-- sidebar icon (hamburger-like) -->
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z" />
            <path d="M9 4v16" />
          </svg>
        </button>

        <!-- Search button -->
        <button
          class="w-8 h-8 flex items-center justify-center rounded text-content-muted hover:text-content hover:bg-surface-hover"
          title="Search files"
          @click="openSearch"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
            <path d="M21 21l-6 -6" />
          </svg>
        </button>
      </div>

      <!-- Spacer -->
      <div class="flex-1" />

      <!-- Settings button (bottom) -->
      <div class="flex flex-col items-center pb-3">
        <button
          class="w-8 h-8 flex items-center justify-center rounded text-content-muted hover:text-content hover:bg-surface-hover"
          title="Settings"
          @click="workspace.openSettings()"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.066 2.573c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.573 1.066c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.066 -2.573c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z" />
            <path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
          </svg>
        </button>
      </div>
    </template>

    <!-- Expanded mode -->
    <template v-else>
      <!-- Traffic light area + collapse toggle -->
      <div class="shrink-0 flex items-end justify-between px-2" :style="{ height: trafficLightHeight + 'px' }" data-tauri-drag-region>
        <div />
        <!-- Collapse sidebar button (next to traffic lights) -->
        <button
          class="w-6 h-6 flex items-center justify-center rounded text-content-muted hover:text-content hover:bg-surface-hover"
          title="Collapse sidebar"
          @click="workspace.toggleLeftSidebar()"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z" />
            <path d="M9 4v16" />
          </svg>
        </button>
      </div>

      <!-- Project heading -->
      <div
        ref="projectCardEl"
        class="px-3 pt-2 pb-1.5 cursor-pointer select-none rounded-md mx-1"
        :class="switcherOpen ? 'bg-surface-hover' : 'hover:bg-surface-hover'"
        @click="toggleSwitcher"
      >
        <div class="flex items-center gap-1.5 min-w-0">
          <!-- Name -->
          <span class="ui-text-lg font-medium text-content truncate flex-1">{{ projectName }}</span>
          <!-- Settings gear (always visible) -->
          <button
            class="shrink-0 w-5 h-5 flex items-center justify-center rounded text-content-muted hover:text-content"
            title="Settings"
            @click.stop="workspace.openSettings()"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.066 2.573c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.573 1.066c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.066 -2.573c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z" />
              <path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
            </svg>
          </button>
        </div>
        <!-- Path -->
        <div class="ui-text-sm text-content-muted truncate mt-0.5">{{ shortenedPath }}</div>
      </div>

      <!-- WorkspaceSwitcher dropdown -->
      <WorkspaceSwitcher
        :open="switcherOpen"
        :trigger-el="projectCardEl"
        @close="switcherOpen = false"
        @open-folder="doOpenFolder"
        @open-workspace="doOpenWorkspace"
        @open-settings="doSettings"
        @clone="doClone"
      />

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

      <!-- Spacer pushes git footer to bottom -->
      <div class="flex-1 min-h-0" />

      <!-- Git sync footer -->
      <div
        v-if="workspace.githubUser"
        class="shrink-0 flex items-center gap-1.5 px-3 py-1 select-none"
        style="height: 28px;"
      >
        <svg
          class="shrink-0"
          :class="syncIconClass"
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
        >
          <path d="M6.657 18c-2.572 0 -4.657 -2.007 -4.657 -4.483c0 -2.475 2.085 -4.482 4.657 -4.482c.393 -1.762 1.794 -3.2 3.675 -3.773c1.88 -.572 3.956 -.193 5.444 1c1.488 1.19 2.162 3.007 1.77 4.768h.99c1.913 0 3.464 1.56 3.464 3.486c0 1.927 -1.551 3.487 -3.465 3.487" />
          <path d="M12 13v9" v-if="syncStatus === 'syncing'" />
          <path d="M9 19l3 3l3 -3" v-if="syncStatus === 'syncing'" />
        </svg>
        <span class="ui-text-sm" :class="syncTextClass">{{ syncLabel }}</span>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { isMac } from '../../platform'
import FileTree from './FileTree.vue'
import ReferenceList from './ReferenceList.vue'
import WorkspaceSwitcher from '../layout/WorkspaceSwitcher.vue'

const emit = defineEmits(['version-history', 'open-folder', 'open-workspace', 'clone-repository'])

const workspace = useWorkspaceStore()
const containerEl = ref(null)
const fileTreeRef = ref(null)
const projectCardEl = ref(null)
const switcherOpen = ref(false)

// Platform-aware traffic light height
const trafficLightHeight = isMac ? 44 : 8

// Collapsed = rail mode
const collapsed = computed(() => !workspace.leftSidebarOpen)

// Project name from workspace path
const projectName = computed(() => {
  if (!workspace.path) return 'No Project'
  return workspace.path.split('/').pop()
})

// Shortened path (replace home dir with ~)
const shortenedPath = computed(() => {
  if (!workspace.path) return ''
  const home = workspace.path.match(/^\/Users\/[^/]+/)
  if (home) return workspace.path.replace(home[0], '~')
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
  if (syncStatus.value === 'syncing') return 'text-content-muted animate-pulse-icon'
  return 'text-content-muted'
})

const syncTextClass = computed(() => {
  if (syncStatus.value === 'error') return 'text-error'
  if (syncStatus.value === 'conflict') return 'text-warning'
  return 'text-content-muted'
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
    const maxHeight = containerHeight - 60 - 3
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

// --- Workspace Switcher ---
function toggleSwitcher() {
  switcherOpen.value = !switcherOpen.value
}

function doOpenFolder() {
  switcherOpen.value = false
  emit('open-folder')
}

function doOpenWorkspace(path) {
  switcherOpen.value = false
  emit('open-workspace', path)
}

function doSettings() {
  switcherOpen.value = false
  workspace.openSettings()
}

function doClone() {
  switcherOpen.value = false
  emit('clone-repository')
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
