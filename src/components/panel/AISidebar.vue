<template>
  <div ref="rootRef" class="flex flex-col h-full outline-none bg-surface-secondary" tabindex="-1">
    <!-- Home (always mounted, shown/hidden — preserves scroll, search state) -->
    <div v-show="sidebar.viewState === 'home'" class="flex-1 min-h-0">
      <SidebarHome ref="homeRef" />
    </div>

    <!-- New (fresh mount each time — stateless launcher) -->
    <div v-if="sidebar.viewState === 'new'" class="flex-1 min-h-0">
      <SidebarNew ref="newRef" />
    </div>

    <!-- Conversation (v-show — keeps Chat instance alive during overview visits) -->
    <div v-show="sidebar.viewState === 'conversation'" class="flex-1 min-h-0">
      <SidebarConversation v-if="hasConversation" ref="conversationRef" />
    </div>

    <!-- Workflow (v-if — mounts fresh each time) -->
    <div v-if="sidebar.viewState === 'workflow'" class="flex-1 min-h-0">
      <SidebarWorkflow />
    </div>

    <!-- Terminal sessions — v-show keeps xterm + PTY alive across navigation -->
    <template v-for="ts in sidebar.terminalSessions" :key="ts.id">
      <div
        v-show="sidebar.viewState === 'terminal' && sidebar.activeTerminalSessionId === ts.id"
        class="flex-1 min-h-0"
      >
        <SidebarTerminal :session="ts" @exited="sidebar.setTerminalExited(ts.id)" />
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useAISidebarStore } from '../../stores/aiSidebar'
import { useWorkspaceStore } from '../../stores/workspace'
import SidebarHome from './SidebarHome.vue'
import SidebarNew from './SidebarNew.vue'
import SidebarConversation from './SidebarConversation.vue'
import SidebarWorkflow from './SidebarWorkflow.vue'
import SidebarTerminal from './SidebarTerminal.vue'

const sidebar = useAISidebarStore()
const workspace = useWorkspaceStore()

const rootRef = ref(null)
const homeRef = ref(null)
const newRef = ref(null)
const conversationRef = ref(null)

const hasConversation = computed(() => sidebar.activeSessionId !== null)

watch(() => sidebar.viewState, async (state) => {
  await nextTick()
  if (state === 'home') {
    homeRef.value?.focus()
  } else if (state === 'new') {
    newRef.value?.focus()
  } else if (state === 'conversation') {
    conversationRef.value?.focus()
  }
})

// ─── ESC handler ──────────────────────────────────────────────────
function handleEscape(e) {
  if (e.key !== 'Escape') return
  if (!workspace.rightSidebarOpen) return
  if (sidebar.viewState === 'home') return

  const active = document.activeElement
  const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)

  if (isInput) {
    active.blur()
    nextTick(() => rootRef.value?.focus())
    return
  }

  e.preventDefault()
  sidebar.goBack()
}

onMounted(() => window.addEventListener('keydown', handleEscape))
onUnmounted(() => window.removeEventListener('keydown', handleEscape))

/** Focus the current view (whatever it is) */
function focus() {
  if (sidebar.viewState === 'home') {
    homeRef.value?.focus()
  } else if (sidebar.viewState === 'new') {
    newRef.value?.focus()
  } else if (sidebar.viewState === 'conversation') {
    conversationRef.value?.focus()
  }
}

defineExpose({ focus })
</script>
