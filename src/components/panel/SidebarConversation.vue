<template>
  <div class="flex flex-col h-full outline-none" tabindex="-1">
    <!-- Back bar -->
    <SidebarBackBar :label="sidebar.backButtonLabel" @back="sidebar.goBack()">
      <template #actions>
        <button
          v-if="session && !isStreaming"
          class="ui-text-sm px-2 py-0.5 rounded cursor-pointer transition-colors"
          style="color: rgb(var(--fg-muted));"
          @click="handleArchive"
        >Archive</button>
      </template>
    </SidebarBackBar>

    <!-- Chat session (flex-1 min-h-0 so it takes remaining space after back bar) -->
    <div class="flex-1 min-h-0">
      <ChatSession
        v-if="session"
        ref="chatSessionRef"
        :key="sidebar.activeSessionId"
        :session="session"
      />
      <div v-else class="h-full flex items-center justify-center ui-text-base" style="color: rgb(var(--fg-muted));">
        Loading...
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useAISidebarStore } from '../../stores/aiSidebar'
import { useChatStore } from '../../stores/chat'
import SidebarBackBar from './SidebarBackBar.vue'
import ChatSession from '../chat/ChatSession.vue'

const sidebar = useAISidebarStore()
const chatStore = useChatStore()

const chatSessionRef = ref(null)

const session = computed(() =>
  chatStore.sessions.find(s => s.id === sidebar.activeSessionId) || null
)

const isStreaming = computed(() => {
  if (!session.value) return false
  const chat = chatStore.getChatInstance(session.value.id)
  if (!chat) return false
  const status = chat.state.statusRef.value
  return status === 'submitted' || status === 'streaming'
})

onMounted(async () => {
  const sid = sidebar.activeSessionId
  if (!sid) return

  const exists = chatStore.sessions.find(s => s.id === sid)
  if (!exists) {
    await chatStore.reopenSession(sid, { skipArchive: true })
  }
  chatStore.activeSessionId = sid
})

// Focus input when this view becomes visible
watch(() => sidebar.viewState, (state) => {
  if (state === 'conversation') {
    chatSessionRef.value?.focus()
  }
})

function handleArchive() {
  sidebar.archiveSession(sidebar.activeSessionId)
}

function focus() {
  chatSessionRef.value?.focus()
}

defineExpose({ focus })
</script>
