<template>
  <div>
    <!-- Grouped workflows -->
    <template v-if="Object.keys(groupedWorkflows).length > 0">
      <div v-for="(workflows, category) in groupedWorkflows" :key="category">
        <div class="flex items-center pt-2 pb-1 gap-2">
          <span class="text-[9px] font-semibold tracking-[0.08em] uppercase text-content-muted">{{ category }}</span>
          <div class="flex-1 h-px bg-line" />
        </div>
        <WorkflowRow
          v-for="w in workflows"
          :key="w.id"
          :workflow="w"
          @click="sidebar.drillIntoWorkflow(w.id)"
        />
      </div>
    </template>
    <div v-else class="py-3 ui-text-sm text-content-muted">
      No workflows found
    </div>

    <!-- Manage sources -->
    <div class="pt-2 border-t border-line mt-2">
      <button
        class="flex items-center gap-1.5 ui-text-sm bg-transparent border-none cursor-pointer p-0 text-content-muted"
        @click="showSources = !showSources"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.32 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
        Manage sources...
      </button>

      <div v-if="showSources" class="mt-2 rounded border border-line p-3 bg-surface">
        <div class="text-[9px] font-semibold tracking-[0.08em] uppercase mb-2 text-content-muted">External directories</div>
        <div v-if="workflowsStore.extraWorkflowPaths.length > 0" class="flex flex-col gap-1 mb-2">
          <div
            v-for="(p, i) in workflowsStore.extraWorkflowPaths"
            :key="i"
            class="flex items-center gap-1.5 group"
          >
            <span class="ui-text-sm truncate flex-1 text-content-secondary">{{ shortenPath(p) }}</span>
            <button
              class="w-5 h-5 flex items-center justify-center rounded bg-transparent border-none cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-75 text-content-muted"
              title="Remove"
              @click="workflowsStore.removeWorkflowPath(p)"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 2l6 6M8 2l-6 6"/></svg>
            </button>
          </div>
        </div>
        <div v-else class="ui-text-sm mb-2 text-content-muted">None added</div>

        <button
          class="flex items-center gap-1.5 ui-text-sm bg-transparent border-none cursor-pointer p-0 mb-3 text-accent"
          @click="handleAddExternalDir"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 1v8M1 5h8"/></svg>
          Add folder...
        </button>

        <div class="h-px mb-3 bg-line" />

        <button
          class="flex items-center gap-1.5 ui-text-sm bg-transparent border-none cursor-pointer p-0 text-content-secondary"
          @click="handleImportWorkflow"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          Import workflow folder...
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAISidebarStore } from '../../stores/aiSidebar'
import { useWorkflowsStore } from '../../stores/workflows'
import { useWorkspaceStore } from '../../stores/workspace'
import WorkflowRow from './WorkflowRow.vue'

const sidebar = useAISidebarStore()
const workflowsStore = useWorkflowsStore()
const workspace = useWorkspaceStore()

const showSources = ref(false)

onMounted(() => {
  workflowsStore.discoverWorkflows()
})

const groupedWorkflows = computed(() => {
  const groups = {}
  for (const w of workflowsStore.availableWorkflows) {
    const cat = w.category || 'Other'
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(w)
  }
  return groups
})

function shortenPath(p) {
  const home = workspace.path?.split('/').slice(0, 3).join('/') || ''
  return home && p.startsWith(home) ? '~' + p.slice(home.length) : p
}

async function handleAddExternalDir() {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selected = await open({ directory: true, multiple: false, title: 'Select workflow directory' })
    if (selected) {
      await workflowsStore.addWorkflowPath(selected)
    }
  } catch (e) {
    console.warn('Failed to add workflow directory:', e)
  }
}

async function handleImportWorkflow() {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selected = await open({ directory: true, multiple: false, title: 'Select workflow folder to import' })
    if (!selected) return

    const { useToastStore } = await import('../../stores/toast')
    const toast = useToastStore()
    try {
      const name = await workflowsStore.importWorkflow(selected)
      toast.show(`Imported workflow "${name}"`, 'success')
    } catch (e) {
      toast.show(e.message || 'Failed to import workflow', 'error')
    }
  } catch (e) {
    console.warn('Failed to import workflow:', e)
  }
}
</script>
