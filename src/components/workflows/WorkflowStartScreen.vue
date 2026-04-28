<template>
  <div class="h-full overflow-y-auto">
    <div class="w-full mx-auto pb-10" style="max-width: min(600px, 90%); padding-top: clamp(1rem, 12vh, 6rem);">

      <!-- Workflow name -->
      <h2 class="text-content font-medium ui-text-xl mb-1">{{ workflow?.name || 'Workflow' }}</h2>

      <!-- Description -->
      <p v-if="workflow?.description" class="text-content-secondary ui-text-base mb-6">
        {{ workflow.description }}
      </p>

      <!-- README content -->
      <div
        v-if="readmeHtml"
        class="chat-md ui-text-base text-content-secondary mb-6 pb-6 border-b border-line"
        v-html="readmeHtml"
      ></div>

      <!-- Custom UI placeholder (Tier 3) -->
      <WorkflowCustomUI v-if="workflow?.hasCustomUI" class="mb-6" />

      <!-- Inputs form (Tier 2) -->
      <WorkflowFormRenderer
        v-else-if="hasInputs"
        :schema="workflow.inputs"
        :modelValue="formValues"
        @update:modelValue="val => Object.assign(formValues, val)"
        class="mb-6"
      />

      <!-- Model selector -->
      <div v-if="models.length" class="mb-6">
        <label class="block ui-text-sm text-content-secondary font-medium mb-1.5">Model</label>
        <select
          v-model="selectedModel"
          class="w-full bg-surface-secondary border border-line rounded px-2.5 py-1.5 ui-text-base text-content outline-none focus:border-accent appearance-none bg-no-repeat"
          style="background-image: url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22><path d=%22M6 9l6 6 6-6%22/></svg>'); background-position: right 8px center;"
        >
          <option v-for="m in models" :key="m.id" :value="m.id">{{ m.name || m.id }}</option>
        </select>
      </div>

      <!-- Run button -->
      <button
        class="px-4 py-2 rounded font-medium ui-text-base transition-colors"
        :class="canRun
          ? 'bg-accent text-white hover:bg-accent/85 cursor-pointer'
          : 'bg-surface-tertiary text-content-muted cursor-not-allowed'"
        :disabled="!canRun"
        @click="handleRun"
      >
        Run{{ workflow?.name ? ' ' + workflow.name : '' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { renderMarkdown } from '../../utils/chatMarkdown'
import { useWorkspaceStore } from '../../stores/workspace'
import WorkflowFormRenderer from './WorkflowFormRenderer.vue'
import WorkflowCustomUI from './WorkflowCustomUI.vue'

const props = defineProps({
  workflow: { type: Object, default: null },
})

const emit = defineEmits(['run'])

const workspace = useWorkspaceStore()

const models = computed(() => {
  const config = workspace.modelsConfig
  if (!config?.models) return []
  return config.models.filter(m => {
    const keyEnv = config.providers?.[m.provider]?.apiKeyEnv
    const key = keyEnv ? workspace.apiKeys?.[keyEnv] : null
    const hasDirectKey = key && !key.includes('your-')
    const hasProxyAccess = !!workspace.shouldersAuth?.token
    return hasDirectKey || hasProxyAccess
  })
})
const selectedModel = ref(workspace.selectedModelId || '')

// ─── README loading ──────────────────────────────────────────────

const readmeHtml = ref('')

onMounted(async () => {
  if (props.workflow?.hasReadme && props.workflow?.dir) {
    try {
      const content = await invoke('read_file', { path: `${props.workflow.dir}/README.md` })
      readmeHtml.value = renderMarkdown(content)
    } catch (e) {
      console.warn('Failed to load workflow README:', e)
    }
  }
})

// ─── Form state ──────────────────────────────────────────────────

const hasInputs = computed(() => {
  return props.workflow?.inputs && Object.keys(props.workflow.inputs).length > 0
})

// Initialize form values from defaults
const formValues = reactive(buildDefaults())

function buildDefaults() {
  const defaults = {}
  if (props.workflow?.inputs) {
    for (const [key, field] of Object.entries(props.workflow.inputs)) {
      defaults[key] = field.default || ''
    }
  }
  return defaults
}

// ─── Validation ──────────────────────────────────────────────────

const canRun = computed(() => {
  if (!props.workflow) return false
  if (!hasInputs.value) return true
  // Check all required fields have values
  for (const [key, field] of Object.entries(props.workflow.inputs)) {
    if (field.required && !formValues[key]) return false
  }
  return true
})

// ─── Run ─────────────────────────────────────────────────────────

function handleRun() {
  if (!canRun.value) return
  if (selectedModel.value) {
    workspace.selectedModelId = selectedModel.value
    localStorage.setItem('lastModelId', selectedModel.value)
  }
  emit('run', { ...formValues })
}
</script>
