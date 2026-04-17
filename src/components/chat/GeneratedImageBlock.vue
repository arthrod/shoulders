<template>
  <div class="my-2">
    <img
      v-if="imageSrc"
      :src="imageSrc"
      class="rounded-lg max-w-full cursor-pointer"
      style="max-height: 512px; object-fit: contain;"
      @click="openInEditor"
    />
    <div v-else-if="error" class="ui-text-sm" style="color: rgb(var(--fg-muted));">
      Image file not found: {{ path }}
    </div>
    <div v-if="imageSrc" class="mt-1">
      <button
        class="ui-text-sm cursor-pointer bg-transparent border-none"
        style="color: rgb(var(--fg-muted));"
        @click="openInEditor">
        {{ path }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useEditorStore } from '../../stores/editor'

const props = defineProps({
  path: { type: String, required: true },
  workspacePath: { type: String, required: true },
})

const imageSrc = ref(null)
const error = ref(false)

onMounted(async () => {
  try {
    const fullPath = `${props.workspacePath}/${props.path}`
    const base64 = await invoke('read_file_base64', { path: fullPath })
    const ext = props.path.split('.').pop()?.toLowerCase()
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png'
    imageSrc.value = `data:${mime};base64,${base64}`
  } catch {
    error.value = true
  }
})

function openInEditor() {
  const editorStore = useEditorStore()
  editorStore.openFile(props.path)
}
</script>
