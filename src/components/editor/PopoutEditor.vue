<template>
  <div class="h-screen w-screen overflow-hidden bg-surface flex flex-col">
    <div class="flex-1 overflow-hidden" style="background: rgb(var(--bg-primary));">
      <div v-if="viewerType === 'text'" class="h-full">
        <TextEditor :filePath="filePath" :paneId="paneId" />
      </div>
      <PdfViewer v-else-if="viewerType === 'pdf'" :filePath="filePath" :paneId="paneId" />
      <CsvEditor v-else-if="viewerType === 'csv'" :filePath="filePath" :paneId="paneId" />
      <ImageViewer v-else-if="viewerType === 'image'" :filePath="filePath" :paneId="paneId" />
      <NotebookEditor v-else-if="viewerType === 'notebook'" :filePath="filePath" :paneId="paneId" />
      <DocxEditor v-else-if="viewerType === 'docx'" :filePath="filePath" :paneId="paneId" />
      <div v-else class="h-full flex items-center justify-center text-content-muted text-sm">
        Cannot preview this file type
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, defineAsyncComponent } from 'vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { useFilesStore } from '../../stores/files'
import { getViewerType } from '../../utils/fileTypes'
import { isMod } from '../../platform'

import TextEditor from './TextEditor.vue'
import PdfViewer from './PdfViewer.vue'
import ImageViewer from './ImageViewer.vue'
const CsvEditor = defineAsyncComponent(() => import('./CsvEditor.vue'))
const DocxEditor = defineAsyncComponent(() => import('./DocxEditor.vue'))
const NotebookEditor = defineAsyncComponent(() => import('./NotebookEditor.vue'))

const props = defineProps({
  filePath: { type: String, required: true },
  workspacePath: { type: String, required: true },
})

const paneId = 'popout'
const workspace = useWorkspaceStore()
const filesStore = useFilesStore()

workspace.path = props.workspacePath

const viewerType = computed(() => getViewerType(props.filePath))

onMounted(() => {
  workspace.restoreTheme()
  workspace.applyFontSizes()
  if (workspace.restoreProseFont) workspace.restoreProseFont()
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})

function handleKeydown(e) {
  if (isMod(e) && e.key === 's') {
    e.preventDefault()
    const content = filesStore.fileContents[props.filePath]
    if (content !== undefined) {
      filesStore.saveFile(props.filePath, content)
    }
  }
}
</script>
