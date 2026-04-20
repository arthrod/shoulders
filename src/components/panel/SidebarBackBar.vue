<template>
  <div class="flex items-center h-7 px-1.5 shrink-0 border-b border-line gap-1">
    <!-- Back button -->
    <button
      class="flex items-center gap-1.5 ui-text-base cursor-pointer text-content-secondary hover:text-content transition-colors"
      @click="$emit('back')"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 12H5M12 19l-7-7 7-7"/>
      </svg>
      <span>{{ label }}</span>
    </button>

    <div class="flex-1" />

    <!-- Right-side action slot -->
    <slot name="actions" />

    <!-- Close sidebar (outer/right edge — near window border) -->
    <SidebarToggleButton
      side="right"
      title="Close sidebar (⌘J)"
      @click="workspace.toggleRightSidebar()"
    />
  </div>
</template>

<script setup>
import { useWorkspaceStore } from '../../stores/workspace'
import SidebarToggleButton from '../shared/SidebarToggleButton.vue'

const workspace = useWorkspaceStore()

defineProps({
  label: { type: String, required: true },
})
defineEmits(['back'])
</script>
