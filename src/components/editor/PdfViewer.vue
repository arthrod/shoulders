<template>
  <div class="h-full flex flex-col overflow-hidden">
    <div v-if="loading" class="flex items-center justify-center h-full text-sm"
         style="color: var(--fg-muted);">
      Loading PDF...
    </div>
    <div v-else-if="error" class="flex items-center justify-center h-full text-sm"
         style="color: var(--fg-muted);">
      Could not load PDF
    </div>
    <iframe
      v-else-if="blobUrl"
      :src="blobUrl"
      class="w-full flex-1 border-0"
      style="display: block;"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'

const props = defineProps({
  filePath: { type: String, required: true },
  paneId:   { type: String, required: true },
})

const blobUrl  = ref(null)
const loading  = ref(true)
const error    = ref(null)

async function loadPdf() {
  loading.value = true
  error.value   = null
  if (blobUrl.value) { URL.revokeObjectURL(blobUrl.value); blobUrl.value = null }

  try {
    const base64  = await invoke('read_file_base64', { path: props.filePath })
    const bytes   = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
    blobUrl.value = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  } catch (e) {
    error.value = e.toString()
  } finally {
    loading.value = false
  }
}

function handlePdfUpdated(e) {
  if (e.detail?.path === props.filePath) loadPdf()
}

onMounted(() => {
  window.addEventListener('pdf-updated', handlePdfUpdated)
  loadPdf()
})

onUnmounted(() => {
  window.removeEventListener('pdf-updated', handlePdfUpdated)
  if (blobUrl.value) URL.revokeObjectURL(blobUrl.value)
})

watch(() => props.filePath, loadPdf)
</script>
