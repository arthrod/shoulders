<template>
  <div
    class="flex items-start gap-2 px-3 py-3 cursor-pointer group transition-colors duration-75"
    data-sidebar-item
    style="background: transparent;"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
    @click="$emit('click')"
  >
    <!-- Selection indicator -->
    <span
      class="w-3 shrink-0 leading-none select-none mt-0.5"
      style="font-size: 14px;"
      :style="{ color: selected ? 'rgb(var(--fg-muted))' : 'transparent' }"
    >&#x203a;</span>

    <!-- Content -->
    <div class="flex-1 min-w-0">
      <!-- Title + timestamp row -->
      <div class="flex items-center gap-1.5">
        <span
          class="ui-text-base font-medium truncate flex-1 min-w-0"
          :class="selected ? 'text-content' : ((item.type === 'archived-chat' || item.type === 'archived-workflow') ? 'text-content-muted' : 'text-content-secondary')"
        >{{ item.label }}</span>
        <!-- Status indicators -->
        <span v-if="item.isStreaming" class="w-2 h-2 rounded-full shrink-0 chat-streaming-dot"></span>
        <span v-else-if="item.isWaiting" class="w-2 h-2 rounded-full shrink-0 bg-warning"></span>
        <span v-if="timeAgo" class="ui-text-sm whitespace-nowrap shrink-0 text-content-muted">{{ timeAgo }}</span>
      </div>
      <!-- Live message preview (expanded mode only) -->
      <div
        v-if="!compact && previewText"
        class="mt-0.5 ui-text-sm text-content-muted line-clamp-2"
        style="opacity: 0.7;"
      >{{ previewText }}</div>
      <!-- Status + meta line -->
      <div v-if="statusMetaLine" class="mt-0.5 flex items-center gap-1">
        <span class="ui-text-sm whitespace-nowrap text-content-muted">{{ statusMetaLine }}</span>
      </div>
    </div>

    <!-- Archive button (hover) -->
    <button
      v-if="showArchive && hovered"
      class="shrink-0 mt-0.5 p-0.5 rounded opacity-60 hover:opacity-100 transition-opacity text-content-muted"
      title="Archive"
      @click.stop="$emit('archive')"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 6L6 18M6 6l12 12"/>
      </svg>
    </button>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useChatStore, extractTextFromParts } from '../../stores/chat'

const props = defineProps({
  item: { type: Object, required: true },
  showArchive: { type: Boolean, default: true },
  compact: { type: Boolean, default: true },
  selected: { type: Boolean, default: false },
})

defineEmits(['click', 'archive'])

const chatStore = useChatStore()
const hovered = ref(false)

const timeAgo = computed(() => {
  if (!props.item.updatedAt) return null
  const date = new Date(props.item.updatedAt)
  const now = new Date()
  const diffMs = now - date
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay < 7) return `${diffDay}d ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
})

/** Message count — live from chat instance, or from saved metadata */
const messageCount = computed(() => {
  if (props.item.type === 'chat') {
    const chat = chatStore.getChatInstance(props.item.id)
    if (chat) return chat.state.messagesRef.value?.length || 0
  }
  return props.item.messageCount || 0
})

/** Tool call count — live from chat instance parts (active chats only) */
const toolCallCount = computed(() => {
  if (props.item.type !== 'chat') return 0
  const chat = chatStore.getChatInstance(props.item.id)
  if (!chat) return 0
  const messages = chat.state.messagesRef.value
  if (!messages?.length) return 0
  let count = 0
  for (const msg of messages) {
    if (!msg.parts) continue
    for (const part of msg.parts) {
      if (part.type?.startsWith('tool-') || part.type === 'dynamic-tool') count++
    }
  }
  return count
})

/** Status + meta line for bottom row: "IDLE · 8 msgs · 2 tools · Sonnet" */
const statusMetaLine = computed(() => {
  const parts = []
  if (statusLabel.value) parts.push(statusLabel.value.toUpperCase())
  const isChat = props.item.type === 'chat' || props.item.type === 'archived-chat'
  if (isChat) {
    const mc = messageCount.value
    if (mc > 0) parts.push(`${mc} msgs`)
    const tc = toolCallCount.value
    if (tc > 0) parts.push(`${tc} tools`)
  }
  if (props.item.modelLabel) parts.push(props.item.modelLabel)
  return parts.length > 0 ? parts.join(' \u00b7 ') : null
})

const statusLabel = computed(() => {
  if (props.item.isStreaming) return 'working'
  if (props.item.isWaiting) return 'waiting'
  if (props.item.status === 'completed') return 'completed'
  if (props.item.status === 'failed') return 'failed'
  if (props.item.status === 'cancelled') return 'cancelled'
  return null
})

/** Live preview of last message — reactive, updates during streaming */
const previewText = computed(() => {
  if (props.compact) return null
  if (props.item.type !== 'chat') return null

  const chat = chatStore.getChatInstance(props.item.id)
  if (!chat) return null

  const messages = chat.state.messagesRef.value
  if (!messages?.length) return null

  // Find last message (skip tool-result-only messages)
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg._isToolResult) continue
    const text = extractTextFromParts(msg.parts || [])
    if (text) return text
  }
  return null
})
</script>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
