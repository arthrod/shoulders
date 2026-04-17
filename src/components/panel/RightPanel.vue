<template>
  <div class="flex flex-col h-full" style="background: rgb(var(--bg-secondary));">
    <AISidebar ref="aiSidebarRef" />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import AISidebar from './AISidebar.vue'

const aiSidebarRef = ref(null)

/** Focus the AI sidebar's ChatInput (called by Cmd+J via App.vue) */
function focusAI() {
  aiSidebarRef.value?.focus()
}

defineExpose({ focusAI })
</script>
