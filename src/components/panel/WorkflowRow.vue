<template>
  <div
    class="flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors duration-75"
    data-sidebar-item
    @click="$emit('click')"
  >
    <!-- Selection indicator -->
    <span
      class="w-3 shrink-0 leading-none select-none"
      style="font-size: 14px;"
      :style="{ color: selected ? 'rgb(var(--fg-muted))' : 'transparent' }"
    >›</span>

    <!-- Workflow icon -->
    <svg class="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: rgb(var(--fg-muted));">
      <circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="18" r="2"/>
      <path d="M5 8v2a4 4 0 004 4h2M19 8v2a4 4 0 01-4 4h-2"/>
    </svg>

    <!-- Name + description -->
    <div class="flex-1 min-w-0">
      <span
        class="ui-text-base truncate block"
        :style="{ color: selected ? 'rgb(var(--fg-primary))' : 'rgb(var(--fg-secondary))' }"
      >{{ workflow.name }}</span>
      <span
        v-if="workflow.description"
        class="ui-text-sm block"
        style="color: rgb(var(--fg-muted)); margin-top: 1px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;"
      >{{ workflow.description }}</span>
    </div>

    <!-- Chevron -->
    <svg class="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: rgb(var(--fg-muted));">
      <path d="M9 18l6-6-6-6"/>
    </svg>
  </div>
</template>

<script setup>
defineProps({
  workflow: { type: Object, required: true },
  selected: { type: Boolean, default: false },
})
defineEmits(['click'])
</script>
