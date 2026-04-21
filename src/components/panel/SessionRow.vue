<template>
  <div
    data-sidebar-item
    :class="[
      'flex items-start gap-2 px-3 cursor-pointer group transition-colors duration-75',
      variant === 'compact' ? 'py-1.5' : 'py-3',
    ]"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
    @click="$emit('click')"
  >
    <!-- Selection chevron (NewTab pattern) -->
    <span
      class="w-3 shrink-0 leading-none select-none"
      :class="variant === 'compact' ? 'mt-0' : 'mt-0.5'"
      style="font-size: 14px;"
      :style="{ color: selected ? 'rgb(var(--fg-muted))' : 'transparent' }"
    >&#x203a;</span>

    <!-- Status indicator (only for full variant, overlays chevron area conceptually) -->
    <span v-if="variant !== 'compact' && (item.isStreaming || item.isWaiting)" class="shrink-0 flex items-center justify-center mt-1.5 -ml-5 mr-0">
      <span v-if="item.isStreaming" class="w-2 h-2 rounded-full shrink-0 chat-streaming-dot"></span>
      <span v-else-if="item.isWaiting" class="w-2 h-2 rounded-full shrink-0 bg-warning"></span>
    </span>

    <!-- Content -->
    <div class="flex-1 min-w-0">
      <!-- Title + timestamp + archive row -->
      <div class="flex items-center gap-1.5">
        <!-- Provider badge (external agents) -->
        <span
          v-if="item.providerBadge"
          class="shrink-0 px-1 py-px rounded text-[9px] font-semibold uppercase tracking-wide bg-surface-tertiary text-content-muted"
        >{{ item.providerBadge }}</span>
        <span
          :class="[
            'truncate flex-1 min-w-0 transition-colors duration-75',
            variant === 'compact'
              ? 'ui-text-base text-content-muted'
              : 'ui-text-lg font-medium ' + (selected ? 'text-content' : (isOlder ? 'text-content-muted' : 'text-content-secondary')),
          ]"
        >{{ item.label }}</span>
        <span v-if="timeAgo" :class="['whitespace-nowrap shrink-0 text-content-muted', variant === 'compact' ? 'ui-text-sm' : 'ui-text-base']">{{ timeAgo }}</span>
        <!-- Archive button (always in flow, visible on hover) -->
        <button
          v-if="showArchive"
          class="shrink-0 p-0.5 rounded transition-opacity duration-75 text-content-muted"
          :class="hovered ? 'opacity-60 hover:opacity-100' : 'opacity-0'"
          title="Archive"
          @click.stop="$emit('archive')"
        >
          <IconX :size="14" :stroke-width="2" />
        </button>
      </div>
      <!-- Live message preview (full variant only) -->
      <div
        v-if="previewText && variant !== 'compact'"
        class="mt-0.5 ui-text-base text-content-secondary line-clamp-2"
      >{{ previewText }}</div>
      <!-- Status + meta line (full variant only) -->
      <div v-if="statusMetaLine && variant !== 'compact'" class="mt-0.5 flex items-center gap-1">
        <span class="ui-text-base whitespace-nowrap text-content-secondary/70">{{ statusMetaLine }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { IconX } from '@tabler/icons-vue'
import { useChatStore, extractTextFromParts } from '../../stores/chat'

const props = defineProps({
  item: { type: Object, required: true },
  showArchive: { type: Boolean, default: true },
  selected: { type: Boolean, default: false },
  variant: { type: String, default: 'full' },
})

defineEmits(['click', 'archive'])

const chatStore = useChatStore()
const hovered = ref(false)

const isOlder = computed(() =>
  props.item.type === 'archived-chat' || props.item.type === 'archived-workflow'
)

const isDone = computed(() => {
  if (isOlder.value) return false
  return !props.item.isStreaming && !props.item.isWaiting &&
    (props.item.status === 'completed' || props.item.status === 'failed' || props.item.status === 'cancelled')
})

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

const messageCount = computed(() => {
  if (props.item.type === 'chat') {
    const chat = chatStore.getChatInstance(props.item.id)
    if (chat) return chat.state.messagesRef.value?.length || 0
  }
  return props.item.messageCount || 0
})

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
  if (props.item.status === 'running') return 'running'
  if (props.item.status === 'exited') return 'exited'
  if (props.item.status === 'completed') return 'completed'
  if (props.item.status === 'failed') return 'failed'
  if (props.item.status === 'cancelled') return 'cancelled'
  return null
})

const previewText = computed(() => {
  if (props.item.type !== 'chat') return null

  const chat = chatStore.getChatInstance(props.item.id)
  if (!chat) return null

  const messages = chat.state.messagesRef.value
  if (!messages?.length) return null

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
