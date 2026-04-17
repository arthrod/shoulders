<template>
  <div
    class="flex items-start gap-2 px-3 py-2 cursor-pointer group transition-colors duration-75"
    data-sidebar-item
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
    @click="$emit('click')"
  >
    <!-- Selection indicator -->
    <span
      class="w-3 shrink-0 leading-none select-none mt-0.5"
      style="font-size: 14px;"
      :style="{ color: selected ? 'rgb(var(--fg-muted))' : 'transparent' }"
    >›</span>

    <!-- Content -->
    <div class="flex-1 min-w-0">
      <span
        class="ui-text-base truncate block"
        :style="{ color: selected ? 'rgb(var(--fg-primary))' : 'rgb(var(--fg-secondary))' }"
      >{{ prompt.title }}</span>
      <span
        class="ui-text-sm truncate block mt-0.5"
        style="color: rgb(var(--fg-muted)); opacity: 0.7;"
      >{{ prompt.body }}</span>
    </div>

    <!-- Edit / Delete (user prompts only, on hover) -->
    <div v-if="editable && hovered" class="flex items-center gap-0.5 shrink-0 mt-0.5">
      <button
        class="p-0.5 rounded bg-transparent border-none cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
        style="color: rgb(var(--fg-muted));"
        title="Edit"
        @click.stop="$emit('edit')"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5z"/>
        </svg>
      </button>
      <button
        class="p-0.5 rounded bg-transparent border-none cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
        style="color: rgb(var(--fg-muted));"
        title="Delete"
        @click.stop="$emit('delete')"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

defineProps({
  prompt: { type: Object, required: true },
  selected: { type: Boolean, default: false },
  editable: { type: Boolean, default: false },
})

defineEmits(['click', 'edit', 'delete'])

const hovered = ref(false)
</script>
