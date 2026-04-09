<template>
  <div
    v-if="fileEdits.length > 0"
    class="flex items-center justify-between px-2 shrink-0"
    style="background: rgba(224, 175, 104, 0.08); border-bottom: 1px solid rgb(var(--border)); height: 28px;"
  >
    <span class="text-xs" style="color: rgb(var(--warning));">
      {{ fileEdits.length }} change{{ fileEdits.length !== 1 ? 's' : '' }}
    </span>
    <div class="flex items-center gap-1.5">
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
        @click="reviews.acceptAllForFile(filePath)"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 8.5l3.5 3.5 6.5-8"/></svg>
        Keep All
      </button>
      <button
        class="review-bar-btn review-bar-reject"
        @click="reviews.rejectAllForFile(filePath)"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 2l6 6M8 2l-6 6"/></svg>
        Revert All
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useReviewsStore } from '../../stores/reviews'
import { useWorkspaceStore } from '../../stores/workspace'

const props = defineProps({
  filePath: { type: String, default: null },
})

const reviews = useReviewsStore()
const workspace = useWorkspaceStore()

const fileEdits = computed(() => {
  if (!props.filePath) return []
  return reviews.editsForFile(props.filePath)
})

const isSideBySide = computed(() =>
  workspace.diffLayout === 'side-by-side' || workspace.diffLayout === 'side-by-side-collapsed'
)

function cycleSideBySide() {
  if (workspace.diffLayout === 'inline') {
    workspace.setDiffLayout('side-by-side')
  } else if (workspace.diffLayout === 'side-by-side') {
    workspace.setDiffLayout('side-by-side-collapsed')
  } else {
    workspace.setDiffLayout('side-by-side')
  }
}
</script>
