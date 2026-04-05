<template>
  <div class="h-full flex flex-col bg-surface">
    <WorkflowExecution
      v-if="runId && run"
      :run="run"
      :runId="runId"
      @cancel="handleCancel"
      @rerun="handleRerun"
    />
    <WorkflowStartScreen
      v-else
      :workflow="workflow"
      @run="handleRun"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useWorkflowsStore } from '../../stores/workflows'
import { getWorkflowId } from '../../utils/fileTypes'
import WorkflowStartScreen from './WorkflowStartScreen.vue'
import WorkflowExecution from './WorkflowExecution.vue'

const props = defineProps({
  filePath: { type: String, required: true },
  paneId: { type: String, required: true },
})

const workflowsStore = useWorkflowsStore()

const workflowId = computed(() => getWorkflowId(props.filePath) || '')
const workflow = computed(() => workflowsStore.workflows.find(w => w.id === workflowId.value))

// Read runId from the store — survives component remounts
const runId = computed(() => workflowsStore.activeRunIds[workflowId.value] || null)
const run = computed(() => runId.value ? workflowsStore.getRun(runId.value) : null)

async function handleRun(inputs) {
  try {
    await workflowsStore.startRun(workflowId.value, inputs)
    // runId is now set in the store by startRun(), computed picks it up automatically
  } catch (e) {
    console.error('Failed to start workflow:', e)
  }
}

function handleCancel() {
  workflowsStore.cancelRun(runId.value)
}

function handleRerun() {
  workflowsStore.clearActiveRun(workflowId.value)
}
</script>
