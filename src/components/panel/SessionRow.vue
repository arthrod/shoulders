<template>
  <div
    class="flex items-start gap-2 px-3 py-2 cursor-pointer group transition-colors duration-75"
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
    >›</span>

    <!-- Icon -->
    <div class="shrink-0 mt-0.5" style="color: rgb(var(--fg-muted));">
      <!-- Chat icon -->
      <svg v-if="item.type === 'chat' || item.type === 'archived-chat'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: rgb(var(--accent));">
        <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275z"/>
      </svg>
      <!-- Workflow icon -->
      <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: rgb(var(--accent));">
        <circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="18" r="2"/>
        <path d="M5 8v2a4 4 0 004 4h2M19 8v2a4 4 0 01-4 4h-2"/>
      </svg>
    </div>

    <!-- Content -->
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-1.5">
        <span
          class="ui-text-base truncate"
          :style="{ color: selected ? 'rgb(var(--fg-primary))' : (item.type === 'archived-chat' ? 'rgb(var(--fg-muted))' : 'rgb(var(--fg-secondary))') }"
        >{{ item.label }}</span>
        <!-- Status indicators -->
        <span v-if="item.isStreaming" class="w-2 h-2 rounded-full shrink-0 chat-streaming-dot"></span>
        <span v-else-if="item.isWaiting" class="w-2 h-2 rounded-full shrink-0" style="background: rgb(var(--warning));"></span>
      </div>
      <div class="flex items-center gap-1.5">
        <span v-if="timeAgo" class="ui-text-sm" style="color: rgb(var(--fg-muted));">{{ timeAgo }}</span>
        <span v-if="item.isStreaming" class="ui-text-sm" style="color: rgb(var(--fg-muted));">working</span>
        <span v-else-if="item.isWaiting" class="ui-text-sm" style="color: rgb(var(--warning));">waiting</span>
      </div>
      <!-- Live message preview (expanded mode only) -->
      <div
        v-if="!compact && previewText"
        class="mt-0.5 ui-text-sm line-clamp-3"
        style="color: rgb(var(--fg-muted));"
      >{{ previewText }}</div>
    </div>

    <!-- Archive button (hover) -->
    <button
      v-if="showArchive && hovered"
      class="shrink-0 p-0.5 rounded opacity-60 hover:opacity-100 transition-opacity"
      style="color: rgb(var(--fg-muted));"
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
.line-clamp-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
