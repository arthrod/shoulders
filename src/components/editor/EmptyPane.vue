<template>
  <div class="flex items-center justify-center h-full bg-surface-backdrop">
    <div class="flex flex-col items-center gap-4">
      <span class="select-none cursor-default text-content-muted/60" style="font-family: 'Lora', serif; font-size: 22px; font-weight: 500;">Shoulders</span>
      <div class="flex flex-col gap-1.5 items-start">
        <span class="ui-text-base text-content-muted"><kbd class="ui-text-sm text-content-secondary font-medium">{{ mod }}P</kbd> <span class="ml-1">Open file</span></span>
        <span class="ui-text-base text-content-muted"><kbd class="ui-text-sm text-content-secondary font-medium">{{ mod }}T</kbd> <span class="ml-1">New tab</span></span>
        <span class="ui-text-base text-content-muted"><kbd class="ui-text-sm text-content-secondary font-medium">{{ mod }}J</kbd> <span class="ml-1">AI sidebar</span></span>
        <span class="ui-text-base text-content-muted"><kbd class="ui-text-sm text-content-secondary font-medium">{{ mod }}B</kbd> <span class="ml-1">Toggle sidebar</span></span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { isMac } from '../../platform'

defineProps({
  paneId: { type: String, required: true },
})

const mod = isMac ? '\u2318' : 'Ctrl+'
</script>
