<template>
  <div class="flex flex-col h-full">
    <!-- Back bar -->
    <SidebarBackBar :label="sidebar.backButtonLabel" @back="sidebar.goBack()">
      <template #actions>
        <span v-if="workflow" class="ui-text-sm truncate" style="color: rgb(var(--fg-muted));">{{ workflow.name }}</span>
      </template>
    </SidebarBackBar>

    <!-- Workflow: execution or start screen -->
    <div class="flex-1 overflow-hidden">
      <WorkflowExecution
        v-if="runId && run"
        :run="run"
        :runId="runId"
        @cancel="handleCancel"
        @rerun="handleRerun"
      />
      <WorkflowStartScreen
        v-else-if="workflow"
        :workflow="workflow"
        @run="handleRun"
      />
      <div v-else class="flex-1 flex items-center justify-center ui-text-base" style="color: rgb(var(--fg-muted));">
        Workflow not found
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useAISidebarStore } from '../../stores/aiSidebar'
import { useWorkflowsStore } from '../../stores/workflows'
import SidebarBackBar from './SidebarBackBar.vue'
import WorkflowStartScreen from '../workflows/WorkflowStartScreen.vue'
import WorkflowExecution from '../workflows/WorkflowExecution.vue'

const sidebar = useAISidebarStore()
const workflowsStore = useWorkflowsStore()

const workflow = computed(() =>
  workflowsStore.workflows.find(w => w.id === sidebar.activeWorkflowId)
)

const runId = computed(() =>
  workflowsStore.activeRunIds[sidebar.activeWorkflowId] || null
)

const run = computed(() =>
  runId.value ? workflowsStore.getRun(runId.value) : null
)

async function handleRun(inputs) {
  try {
    await workflowsStore.startRun(sidebar.activeWorkflowId, inputs)
  } catch (e) {
    console.error('Failed to start workflow:', e)
  }
}

function handleCancel() {
  if (runId.value) workflowsStore.cancelRun(runId.value)
}

function handleRerun() {
  if (sidebar.activeWorkflowId) workflowsStore.clearActiveRun(sidebar.activeWorkflowId)
}
</script>
