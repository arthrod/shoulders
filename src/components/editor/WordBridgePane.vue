<template>
  <div class="flex flex-col items-center justify-center h-full gap-4 p-8 text-center"
       style="background: rgb(var(--bg-primary));">
    <!-- Word icon -->
    <div class="w-12 h-12 rounded-xl flex items-center justify-center"
         style="background: rgb(var(--surface-secondary));">
      <IconFileTypeDocx class="w-6 h-6" style="color: rgb(var(--accent));" />
    </div>

    <!-- File name -->
    <div class="text-sm font-medium" style="color: rgb(var(--content));">
      {{ fileName }}
    </div>

    <!-- Status message -->
    <div class="text-xs" style="color: rgb(var(--content-secondary));">
      <span v-if="isConnected" class="flex items-center gap-1.5 justify-center">
        <span class="w-2 h-2 rounded-full bg-success inline-block"></span>
        This file is open in Microsoft Word
      </span>
      <span v-else class="flex flex-col items-center gap-2">
        <span class="flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full inline-block" style="background: rgb(var(--content-muted));"></span>
          Word Bridge disconnected
        </span>
      </span>
    </div>

    <!-- Connected info -->
    <p v-if="isConnected" class="text-xs max-w-xs" style="color: rgb(var(--content-muted));">
      The document is rendered in Word. Use the Shoulders chat to read, edit, comment, and review.
    </p>

    <!-- Disconnected guidance -->
    <div v-else class="text-xs max-w-xs leading-relaxed" style="color: rgb(var(--content-muted));">
      <p class="mb-2">Reopen the Shoulders panel in Word to reconnect:</p>
      <p class="font-medium" style="color: rgb(var(--content-secondary));">
        Insert → ▾ next to Add-ins → Shoulders
      </p>
      <p class="mt-2">Or save in Word first, then close this tab to open it locally.</p>
    </div>

    <!-- Quick actions -->
    <div v-if="isConnected" class="flex gap-2 mt-2">
      <button
        class="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
        style="background: rgb(var(--surface-secondary)); color: rgb(var(--content));"
        @mouseenter="$event.target.style.background = 'rgb(var(--surface-hover))'"
        @mouseleave="$event.target.style.background = 'rgb(var(--surface-secondary))'"
        @click="askAiAbout"
      >
        Ask AI about this file
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { IconFileTypeDocx } from '@tabler/icons-vue'
import { isConnected as isBridgeConnected } from '../../services/wordBridge'
import { useEditorStore } from '../../stores/editor'
import { useAISidebarStore } from '../../stores/aiSidebar'

const props = defineProps({
  filePath: { type: String, required: true },
  paneId: { type: String, required: true },
})

const editorStore = useEditorStore()

const fileName = computed(() => {
  if (!props.filePath) return ''
  return props.filePath.split('/').pop()
})

const isConnected = computed(() => isBridgeConnected(props.filePath))

function askAiAbout() {
  const aiSidebar = useAISidebarStore()
  aiSidebar.focusSidebarChat(null, {
    prefill: `Read ${fileName.value} and give me a summary.`,
  })
}
</script>
