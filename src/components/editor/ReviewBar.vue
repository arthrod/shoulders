<template>
  <div
    v-if="fileEdits.length > 0"
    class="flex items-center justify-between px-2 shrink-0 h-7 border-b border-line bg-warning/[0.08]"
  >
    <span class="text-xs whitespace-nowrap overflow-hidden text-ellipsis max-w-[50px] text-warning">
      {{ fileEdits.length }} change{{ fileEdits.length !== 1 ? 's' : '' }}
    </span>
    <div class="flex items-center gap-1.5">
      <!-- Chunk navigation -->
      <div v-if="chunkCount > 0" class="flex items-center gap-0.5 mr-1">
        <button class="review-bar-nav" @click="goToPrevChunk" title="Previous change">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 10l4-4 4 4"/>
          </svg>
        </button>
        <span class="text-[10px] text-warning tabular-nums min-w-[28px] text-center select-none">
          {{ currentChunkIndex >= 0 ? currentChunkIndex + 1 : '-' }}/{{ chunkCount }}
        </span>
        <button class="review-bar-nav" @click="goToNextChunk" title="Next change">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 6l4 4 4-4"/>
          </svg>
        </button>
      </div>

      <!-- Diff layout toggle -->
      <div class="review-bar-toggle">
        <button
          :class="{ active: workspace.diffLayout === 'inline' }"
          @click="workspace.setDiffLayout('inline')"
          title="Inline diff"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <line x1="3" y1="4" x2="13" y2="4"/>
            <line x1="3" y1="8" x2="13" y2="8"/>
            <line x1="3" y1="12" x2="13" y2="12"/>
          </svg>
        </button>
        <button
          :class="{ active: isSideBySide }"
          @click="cycleSideBySide"
          :title="isSideBySide && workspace.diffLayout === 'side-by-side' ? 'Click again to collapse unchanged lines' : 'Side-by-side diff'"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <rect x="2" y="2" width="5" height="12" rx="1"/>
            <rect x="9" y="2" width="5" height="12" rx="1"/>
            <line v-if="workspace.diffLayout === 'side-by-side-collapsed'" x1="4" y1="8" x2="6" y2="8" opacity="0.6"/>
            <line v-if="workspace.diffLayout === 'side-by-side-collapsed'" x1="11" y1="8" x2="13" y2="8" opacity="0.6"/>
          </svg>
        </button>
      </div>

      <button
        class="review-bar-btn review-bar-accept"
        @click="handleKeepAll"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 8.5l3.5 3.5 6.5-8"/></svg>
        Keep All
      </button>
      <button
        class="review-bar-btn review-bar-reject"
        @click="handleRevertAll"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 2l6 6M8 2l-6 6"/></svg>
        Revert All
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useReviewsStore } from '../../stores/reviews'
import { useWorkspaceStore } from '../../stores/workspace'
import { useFilesStore } from '../../stores/files'
import { useToastStore } from '../../stores/toast'

const props = defineProps({
  filePath: { type: String, default: null },
  chunkCount: { type: Number, default: 0 },
})

const emit = defineEmits(['navigate-chunk'])

const reviews = useReviewsStore()
const workspace = useWorkspaceStore()
const files = useFilesStore()
const toastStore = useToastStore()

const fileEdits = computed(() => {
  if (!props.filePath) return []
  return reviews.editsForFile(props.filePath)
})

const isSideBySide = computed(() =>
  workspace.diffLayout === 'side-by-side' || workspace.diffLayout === 'side-by-side-collapsed'
)

const currentChunkIndex = ref(-1)

watch(() => props.chunkCount, (count) => {
  if (count === 0) {
    currentChunkIndex.value = -1
  } else if (currentChunkIndex.value >= count) {
    currentChunkIndex.value = count - 1
  }
})

watch(() => props.filePath, () => {
  currentChunkIndex.value = -1
})

function goToNextChunk() {
  if (props.chunkCount === 0) return
  if (currentChunkIndex.value < 0) {
    currentChunkIndex.value = 0
  } else {
    currentChunkIndex.value = (currentChunkIndex.value + 1) % props.chunkCount
  }
  emit('navigate-chunk', currentChunkIndex.value)
}

function goToPrevChunk() {
  if (props.chunkCount === 0) return
  if (currentChunkIndex.value <= 0) {
    currentChunkIndex.value = props.chunkCount - 1
  } else {
    currentChunkIndex.value = currentChunkIndex.value - 1
  }
  emit('navigate-chunk', currentChunkIndex.value)
}

function cycleSideBySide() {
  if (workspace.diffLayout === 'inline') {
    workspace.setDiffLayout('side-by-side')
  } else if (workspace.diffLayout === 'side-by-side') {
    workspace.setDiffLayout('side-by-side-collapsed')
  } else {
    workspace.setDiffLayout('side-by-side')
  }
  currentChunkIndex.value = -1
}

async function handleKeepAll() {
  if (!props.filePath) return
  // Snapshot current file content before accepting (for undo)
  const edits = [...reviews.editsForFile(props.filePath)]
  const snapshotContent = files.fileContents[props.filePath]

  await reviews.acceptAllForFile(props.filePath)

  if (edits.length > 0) {
    toastStore.show(`${edits.length} change${edits.length !== 1 ? 's' : ''} accepted`, {
      duration: 6000,
      action: {
        label: 'Undo',
        onClick: async () => {
          // Restore pending edits and file content
          for (const edit of edits) {
            edit.status = 'pending'
            if (!reviews.pendingEdits.find(e => e.id === edit.id)) {
              reviews.pendingEdits.push(edit)
            } else {
              const existing = reviews.pendingEdits.find(e => e.id === edit.id)
              if (existing) existing.status = 'pending'
            }
          }
          await reviews.savePendingEdits()
        },
      },
    })
  }
}

async function handleRevertAll() {
  if (!props.filePath) return
  // Snapshot: save edits + current file content before reverting
  const edits = [...reviews.editsForFile(props.filePath)]
  const snapshotContent = files.fileContents[props.filePath]

  await reviews.rejectAllForFile(props.filePath)

  if (edits.length > 0) {
    toastStore.show(`${edits.length} change${edits.length !== 1 ? 's' : ''} reverted`, {
      duration: 6000,
      action: {
        label: 'Undo',
        onClick: async () => {
          // Restore file content to post-edit state
          if (snapshotContent != null) {
            await invoke('write_file', { path: props.filePath, content: snapshotContent })
            files.fileContents[props.filePath] = snapshotContent
          }
          // Restore pending edits
          for (const edit of edits) {
            edit.status = 'pending'
            if (!reviews.pendingEdits.find(e => e.id === edit.id)) {
              reviews.pendingEdits.push(edit)
            } else {
              const existing = reviews.pendingEdits.find(e => e.id === edit.id)
              if (existing) existing.status = 'pending'
            }
          }
          await reviews.savePendingEdits()
        },
      },
    })
  }
}
</script>
