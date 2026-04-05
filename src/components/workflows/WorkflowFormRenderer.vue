<template>
  <div class="flex flex-col gap-4">
    <div v-for="(field, key) in schema" :key="key" class="flex flex-col gap-1">
      <label class="ui-text-sm text-content-secondary font-medium">
        {{ field.label || key }}
        <span v-if="field.required" class="text-error">*</span>
      </label>

      <!-- File input -->
      <div v-if="field.type === 'file'" class="flex gap-2">
        <input
          type="text"
          :value="localValues[key] || ''"
          :placeholder="field.placeholder || 'File path...'"
          class="flex-1 bg-surface-secondary border border-line rounded px-2.5 py-1.5 ui-text-base text-content placeholder:text-content-muted outline-none focus:border-accent"
          @input="update(key, $event.target.value)"
        />
        <button
          class="shrink-0 px-2.5 py-1.5 bg-surface-secondary border border-line rounded ui-text-sm text-content-secondary hover:bg-surface-tertiary hover:text-content"
          @click="browseFile(key, field.accept)"
        >
          Browse
        </button>
      </div>

      <!-- Text input (short) -->
      <input
        v-else-if="field.type === 'text' && !field.multiline"
        type="text"
        :value="localValues[key] || ''"
        :placeholder="field.placeholder || ''"
        class="bg-surface-secondary border border-line rounded px-2.5 py-1.5 ui-text-base text-content placeholder:text-content-muted outline-none focus:border-accent"
        @input="update(key, $event.target.value)"
      />

      <!-- Textarea (multiline) -->
      <textarea
        v-else-if="field.type === 'text' && field.multiline"
        :value="localValues[key] || ''"
        :placeholder="field.placeholder || ''"
        rows="3"
        class="bg-surface-secondary border border-line rounded px-2.5 py-1.5 ui-text-base text-content placeholder:text-content-muted outline-none focus:border-accent resize-y"
        @input="update(key, $event.target.value)"
      />

      <!-- Select -->
      <select
        v-else-if="field.type === 'select'"
        :value="localValues[key] || ''"
        class="bg-surface-secondary border border-line rounded px-2.5 py-1.5 ui-text-base text-content outline-none focus:border-accent"
        @change="update(key, $event.target.value)"
      >
        <option value="" disabled>Select...</option>
        <option v-for="opt in field.options" :key="opt" :value="opt">{{ opt }}</option>
      </select>

      <!-- Fallback: plain text -->
      <input
        v-else
        type="text"
        :value="localValues[key] || ''"
        :placeholder="field.placeholder || ''"
        class="bg-surface-secondary border border-line rounded px-2.5 py-1.5 ui-text-base text-content placeholder:text-content-muted outline-none focus:border-accent"
        @input="update(key, $event.target.value)"
      />
    </div>
  </div>
</template>

<script setup>
import { reactive, watch } from 'vue'

const props = defineProps({
  schema: { type: Object, required: true },
  modelValue: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['update:modelValue'])

// Local reactive copy — initialized from modelValue
const localValues = reactive({ ...props.modelValue })

// Sync incoming model changes
watch(() => props.modelValue, (val) => {
  Object.assign(localValues, val)
}, { deep: true })

function update(key, value) {
  localValues[key] = value
  emit('update:modelValue', { ...localValues })
}

async function browseFile(key, accept) {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const filters = []
    if (accept?.length) {
      filters.push({
        name: 'Accepted files',
        extensions: accept.map(ext => ext.replace(/^\./, '')),
      })
    }
    const selected = await open({
      multiple: false,
      filters: filters.length ? filters : undefined,
    })
    if (selected) {
      update(key, selected)
    }
  } catch (e) {
    console.warn('File browse failed:', e)
  }
}
</script>
