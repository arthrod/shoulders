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
import WorkflowFormRenderer from './WorkflowFormRenderer.vue'
import WorkflowCustomUI from './WorkflowCustomUI.vue'

const props = defineProps({
  workflow: { type: Object, default: null },
})

const emit = defineEmits(['run'])

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
  emit('run', { ...formValues })
}
</script>
