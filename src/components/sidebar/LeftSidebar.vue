<template>
  <div ref="containerEl" class="flex flex-col h-full overflow-hidden bg-[rgb(var(--bg-secondary))]">
    <!-- Explorer section -->
    <div
      class="overflow-hidden"
      :style="explorerStyle"
    >
      <FileTree
        ref="fileTreeRef"
        :collapsed="explorerCollapsed"
        @toggle-collapse="toggleExplorer"
        @version-history="$emit('version-history', $event)"
      />
    </div>

    <!-- Resize handle: explorer ↔ refs (when both expanded) -->
    <div
      v-if="showHandleExplorerRefs"
      class="relative h-0.5 shrink-0 cursor-row-resize bg-transparent"
      @mousedown="startResizeRefs"
    >
      <div class="absolute left-0 right-0 top-0.5 -translate-y-1/2 h-4 w-full z-10"></div>
    </div>

    <!-- References section -->
    <div
      class="overflow-hidden relative border-t border-[rgb(var(--border))]"
      :style="refsStyle"
    >
      <ReferenceList
        :collapsed="refsCollapsed"
        @toggle-collapse="toggleRefs"
      />
    </div>

    <!-- Resize handle: refs ↔ outline (when both expanded) -->
    <div
      v-if="showHandleRefsOutline"
      class="relative h-0.5 shrink-0 cursor-row-resize bg-transparent"
      @mousedown="startResizeOutline"
    >
      <div class="absolute left-0 right-0 top-0.5 -translate-y-1/2 h-4 w-full z-10"></div>
    </div>

    <!-- Outline + Backlinks section -->
    <div
      class="overflow-hidden relative border-t border-[rgb(var(--border))]"
      :style="outlineStyle"
    >
      <OutlineBacklinksPanel
        :collapsed="outlineCollapsed"
        @toggle-collapse="toggleOutline"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useWorkspaceStore } from '../../stores/workspace'
import FileTree from './FileTree.vue'
import ReferenceList from './ReferenceList.vue'
import OutlineBacklinksPanel from './OutlineBacklinksPanel.vue'

const emit = defineEmits(['version-history'])

const workspace = useWorkspaceStore()
const containerEl = ref(null)
const fileTreeRef = ref(null)

// Collapse states
const explorerCollapsed = ref(false)
const refsCollapsed = ref(false)
const outlineCollapsed = ref(true) // collapsed by default — it's an extra

// Panel heights when expanded (resizable)
const refHeight = ref(250)
const outlineHeight = ref(200)

onMounted(() => {
  try {
    const rh = localStorage.getItem('referencesPanelHeight')
    if (rh) refHeight.value = parseInt(rh, 10) || 250
    const oh = localStorage.getItem('outlinePanelHeight')
    if (oh) outlineHeight.value = parseInt(oh, 10) || 200
    explorerCollapsed.value = localStorage.getItem('explorerCollapsed') === 'true'
    refsCollapsed.value = localStorage.getItem('refsCollapsed') === 'true'
    outlineCollapsed.value = localStorage.getItem('outlineCollapsed') !== 'false' // default true
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

function toggleOutline() {
  outlineCollapsed.value = !outlineCollapsed.value
  try { localStorage.setItem('outlineCollapsed', String(outlineCollapsed.value)) } catch {}
}

// Count expanded panels
const expandedCount = computed(() => {
  let n = 0
  if (!explorerCollapsed.value) n++
  if (!refsCollapsed.value) n++
  if (!outlineCollapsed.value) n++
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

const outlineStyle = computed(() => {
  if (outlineCollapsed.value) return { flex: '0 0 auto' }
  if (expandedCount.value === 1) return { flex: '1 1 0', minHeight: '28px' }
  return { flex: `0 0 ${outlineHeight.value}px` }
})

// --- Resize handle visibility ---

const showHandleExplorerRefs = computed(() =>
  !explorerCollapsed.value && !refsCollapsed.value
)

const showHandleRefsOutline = computed(() =>
  !refsCollapsed.value && !outlineCollapsed.value
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

function startResizeOutline(event) {
  const startY = event.clientY
  const startHeight = outlineHeight.value
  const container = containerEl.value

  const onMouseMove = (ev) => {
    const delta = startY - ev.clientY
    const containerHeight = container?.getBoundingClientRect().height || 600
    const maxHeight = containerHeight - 60 - 3
    const newHeight = Math.max(60, Math.min(maxHeight, startHeight + delta))
    outlineHeight.value = newHeight
  }

  const onMouseUp = () => {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    try { localStorage.setItem('outlinePanelHeight', String(outlineHeight.value)) } catch {}
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
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
