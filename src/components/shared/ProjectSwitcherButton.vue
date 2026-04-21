<template>
  <button
    class="flex items-center gap-1.5 px-2 py-1 rounded text-content-secondary
           hover:text-content hover:bg-surface-hover transition-colors duration-75
           ui-text-lg font-medium min-w-0"
    @click="$emit('click', $event)"
  >
    <span class="truncate min-w-[60px]">{{ name }}</span>
    <IconChevronDown :size="10" :stroke-width="1.5" class="shrink-0 text-content-muted" />
  </button>
</template>

<script setup>
import { IconChevronDown } from '@tabler/icons-vue'

defineProps({
  name: { type: String, required: true },
})
defineEmits(['click'])
</script>
