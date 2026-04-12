<template>
  <div ref="rootRef" class="flex flex-col h-full outline-none" tabindex="-1" style="background: rgb(var(--bg-secondary));">
    <!-- Overview (always mounted, shown/hidden) -->
    <div v-show="sidebar.viewState === 'overview'" class="h-full">
      <SidebarOverview ref="overviewRef" />
    </div>

    <!-- Conversation (v-show — keeps Chat instance alive during overview visits) -->
    <div v-show="sidebar.viewState === 'conversation'" class="h-full">
      <SidebarConversation v-if="hasConversation" ref="conversationRef" />
    </div>

    <!-- Workflow (v-if — mounts fresh each time) -->
    <div v-if="sidebar.viewState === 'workflow'" class="h-full">
      <SidebarWorkflow />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useAISidebarStore } from '../../stores/aiSidebar'
import { useWorkspaceStore } from '../../stores/workspace'
import SidebarOverview from './SidebarOverview.vue'
import SidebarConversation from './SidebarConversation.vue'
import SidebarWorkflow from './SidebarWorkflow.vue'

const sidebar = useAISidebarStore()
const workspace = useWorkspaceStore()

const rootRef = ref(null)
const overviewRef = ref(null)
const conversationRef = ref(null)

// Only mount conversation component once a session has been drilled into
const hasConversation = computed(() => sidebar.activeSessionId !== null)

// Focus management when view changes
watch(() => sidebar.viewState, async (state) => {
  await nextTick()
  if (state === 'overview') {
    // Focus root for keyboard nav (not input — user is navigating back)
    overviewRef.value?.focus()
  } else if (state === 'conversation') {
    conversationRef.value?.focus()
  }
})

// ─── ESC handler (global) ─────────────────────────────────────────
// Global listener so ESC works regardless of focus location.
// Two-press: first ESC blurs input → second ESC goes back.

function handleEscape(e) {
  if (e.key !== 'Escape') return
  if (!workspace.rightSidebarOpen) return
  if (sidebar.viewState === 'overview') return

  const active = document.activeElement
  const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)

  if (isInput) {
    // First ESC: blur input, redirect focus to sidebar root so next ESC reaches us
    active.blur()
    nextTick(() => rootRef.value?.focus())
    return
  }

  // Second ESC (or first ESC when no input focused): go back
  e.preventDefault()
  sidebar.goBack()
}

onMounted(() => window.addEventListener('keydown', handleEscape))
onUnmounted(() => window.removeEventListener('keydown', handleEscape))

/** Focus for Cmd+J — routes to input for immediate typing */
function focus() {
  if (sidebar.viewState === 'overview') {
    overviewRef.value?.focusInput()
  } else if (sidebar.viewState === 'conversation') {
    conversationRef.value?.focus()
  }
}

defineExpose({ focus })
</script>
