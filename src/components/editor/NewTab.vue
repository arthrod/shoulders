<template>
  <div class="flex flex-col h-full" style="background: var(--bg-primary);">
    <!-- Close pane button (non-root panes only) -->
    <div v-if="paneId !== 'pane-root'" class="flex items-center justify-end h-7 shrink-0 border-b px-1" style="border-color: var(--border);">
      <button
        class="p-1 rounded hover:opacity-80 cursor-pointer"
        style="color: var(--fg-muted);"
        title="Close pane"
        @click="editorStore.collapsePane(paneId)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>

    <!-- Scrollable content area -->
    <div class="flex-1 overflow-auto min-h-0">
      <div class="newtab-center">
        <div class="newtab-col">
          <!-- Wordmark -->
          <div class="newtab-brand">Shoulders</div>
          <div class="newtab-rule"></div>

          <!-- File creation links -->
          <div class="newtab-create-row">
            <button
              v-for="ft in fileTypes"
              :key="ft.ext"
              class="newtab-create-link"
              @click="createNewFile(ft.ext, ft.label)"
            >{{ ft.label }}</button>
          </div>

          <!-- Opened files -->
          <div v-if="recentFiles.length > 0" class="newtab-section">
            <div class="newtab-section-label">Opened</div>
            <button
              v-for="entry in filesExpanded ? allRecentFiles : recentFiles.slice(0, 3)"
              :key="entry.path"
              class="newtab-item"
              @click="openFile(entry.path)"
            >
              <span class="truncate">{{ fileName(entry.path) }}</span>
              <span class="newtab-time">{{ relativeTime(entry.openedAt) }}</span>
            </button>
            <button
              v-if="allRecentFiles.length > 3"
              class="newtab-see-more"
              @click="filesExpanded = !filesExpanded"
            >{{ filesExpanded ? 'See fewer' : 'See more' }}</button>
          </div>

          <!-- Conversations -->
          <div v-if="recentChats.length > 0" class="newtab-section">
            <div class="newtab-section-label">Conversations</div>
            <button
              v-for="sess in chatsExpanded ? allChats : recentChats.slice(0, 3)"
              :key="sess.id"
              class="newtab-item"
              @click="openChat(sess.id)"
            >
              <span class="truncate">{{ sess.label }}</span>
              <span class="newtab-time">{{ relativeTime(sess.updatedAt) }}</span>
            </button>
            <button
              v-if="allChats.length > 3"
              class="newtab-see-more"
              @click="toggleChats"
            >{{ chatsExpanded ? 'See fewer' : 'See more' }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ STICKY BOTTOM INPUT ═══ -->
    <div class="newtab-chat-area">
      <div class="newtab-input-wrap">
        <div class="newtab-input-box" :class="{ 'newtab-input-focused': chatFocused }">
          <RichTextInput
            ref="richInputRef"
            placeholder="Ask anything..."
            @submit="sendChat"
            @input="onRichInput"
            @focus="chatFocused = true"
            @blur="chatFocused = false"
          />
          <button
            class="newtab-send"
            :class="{ 'newtab-send-active': hasContent }"
            @mousedown.prevent
            @click="sendChat"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2.5 2.5l11 5.5-11 5.5V9.5L9 8l-6.5-1.5z"/>
            </svg>
          </button>
        </div>
        <!-- Model picker row -->
        <div class="newtab-input-footer">
          <button
            ref="modelBtnRef"
            class="newtab-model-btn"
            @click.stop="showModelPicker = !showModelPicker"
          >
            {{ selectedModelName }}
            <svg width="7" height="7" viewBox="0 0 10 10" fill="currentColor"><path d="M1 3l4 4 4-4z"/></svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Model dropdown (teleported to escape overflow) -->
    <Teleport to="body">
      <template v-if="showModelPicker">
        <div class="fixed inset-0 z-[90]" @click="showModelPicker = false"></div>
        <div
          class="fixed z-[100] rounded border min-w-[160px] py-1"
          :style="modelDropdownPos"
          style="background: var(--bg-secondary); border-color: var(--border); box-shadow: 0 4px 12px rgba(0,0,0,0.3);"
        >
          <template v-if="availableModels.length > 0">
            <div v-for="m in availableModels" :key="m.id"
              class="px-3 py-1.5 text-[13px] cursor-pointer flex items-center"
              style="color: var(--fg-secondary);"
              @mouseenter="$event.currentTarget.style.background = 'var(--bg-hover)'"
              @mouseleave="$event.currentTarget.style.background = 'transparent'"
              @click="selectModel(m)"
            >
              <span v-if="m.id === selectedModelId" class="mr-1.5" style="color: var(--accent);">&#x2713;</span>
              <span v-else style="width: 16px; display: inline-block;"></span>
              {{ m.name }}
            </div>
          </template>
          <div v-else class="px-3 py-2 text-[11px]" style="color: var(--fg-muted);">
            No models available. Add API keys in Settings.
          </div>
        </div>
      </template>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useEditorStore } from '../../stores/editor'
import { useFilesStore } from '../../stores/files'
import { useChatStore } from '../../stores/chat'
import { useWorkspaceStore } from '../../stores/workspace'
import RichTextInput from '../right/RichTextInput.vue'

const props = defineProps({
  paneId: { type: String, required: true },
})

const editorStore = useEditorStore()
const filesStore  = useFilesStore()
const chatStore   = useChatStore()
const workspace   = useWorkspaceStore()

// ─── Internal state ────────────────────────────────────────────────
const chatFocused     = ref(false)
const hasContent      = ref(false)
const showModelPicker = ref(false)
const modelBtnRef     = ref(null)
const richInputRef    = ref(null)
const selectedModelId = ref(null)
const filesExpanded   = ref(false)
const chatsExpanded   = ref(false)

// ─── File creation types ───────────────────────────────────────────
const fileTypes = [
  { ext: '.md',    label: 'Markdown' },
  { ext: '.tex',   label: 'LaTeX' },
  { ext: '.docx',  label: 'Word Document' },
  { ext: '.ipynb', label: 'Notebook' },
  { ext: '.py',    label: 'Code' },
]

// ─── Computed data ─────────────────────────────────────────────────
const recentFiles = computed(() => editorStore.recentFilesForEmptyState)

const allRecentFiles = computed(() => {
  const flatPaths = new Set(filesStore.flatFiles.map(f => f.path))
  return editorStore.recentFiles.filter(entry => flatPaths.has(entry.path))
})

const recentChats = computed(() => chatStore.allSessionsMeta)

const allChats = computed(() =>
  [...chatStore.allSessionsMeta].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
)

// ─── Model picker ──────────────────────────────────────────────────
const availableModels = computed(() => {
  const config = workspace.modelsConfig
  if (!config?.models) return []
  return config.models.filter(m => {
    const providerConfig = config.providers?.[m.provider]
    const keyEnv = providerConfig?.apiKeyEnv
    const key = keyEnv ? workspace.apiKeys?.[keyEnv] : null
    const hasDirectKey = key && !key.includes('your-')
    const hasProxyAccess = !!workspace.shouldersAuth?.token
    return hasDirectKey || hasProxyAccess
  })
})

const selectedModelName = computed(() => {
  const config = workspace.modelsConfig
  if (!config?.models) return 'Sonnet'
  const id = selectedModelId.value || workspace.selectedModelId || config.models.find(m => m.default)?.id || 'sonnet'
  const model = config.models.find(m => m.id === id)
  return model?.name || 'Sonnet'
})

const modelDropdownPos = computed(() => {
  const el = modelBtnRef.value
  if (!el) return {}
  const rect = el.getBoundingClientRect()
  return {
    bottom: (window.innerHeight - rect.top + 4) + 'px',
    left: rect.left + 'px',
  }
})

// ─── Actions ───────────────────────────────────────────────────────

function onRichInput() {
  hasContent.value = richInputRef.value ? !richInputRef.value.isEmpty() : false
}

function fileName(path) {
  return path.split('/').pop() || path
}

function relativeTime(ts) {
  if (!ts) return ''
  const val = typeof ts === 'number' ? ts : new Date(ts).getTime()
  const diff = Date.now() - val
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const days = Math.floor(hr / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

function openFile(path) {
  editorStore.setActivePane(props.paneId)
  editorStore.openFile(path)
}

function openChat(sessionId) {
  editorStore.setActivePane(props.paneId)
  chatStore.reopenSession(sessionId, { skipArchive: true })
  nextTick(() => {
    editorStore.openChat({ sessionId, paneId: props.paneId })
  })
}

function toggleChats() {
  if (!chatsExpanded.value) chatStore.loadAllSessionsMeta()
  chatsExpanded.value = !chatsExpanded.value
}

function selectModel(m) {
  selectedModelId.value = m.id
  workspace.setSelectedModelId(m.id)
  showModelPicker.value = false
}

async function sendChat() {
  if (!richInputRef.value) return
  const { text, fileRefs, context } = richInputRef.value.extractPayload()
  if (!text && fileRefs.length === 0) return

  editorStore.setActivePane(props.paneId)

  const modelId = selectedModelId.value || workspace.selectedModelId
  const sessionId = chatStore.createSession()

  if (modelId) {
    const session = chatStore.sessions.find(s => s.id === sessionId)
    if (session) session.modelId = modelId
  }

  richInputRef.value.clear()
  hasContent.value = false
  editorStore.openChat({ sessionId, paneId: props.paneId })

  await nextTick()
  chatStore.sendMessage(sessionId, { text, fileRefs, context })
}

async function createNewFile(ext, label) {
  if (!workspace.path) return

  const baseName = 'untitled'
  let name = `${baseName}${ext}`
  let counter = 2

  while (true) {
    const fullPath = `${workspace.path}/${name}`
    try {
      const exists = await invoke('path_exists', { path: fullPath })
      if (!exists) break
    } catch {
      break
    }
    name = `${baseName}-${counter}${ext}`
    counter++
  }

  const created = await filesStore.createFile(workspace.path, name)
  if (created) {
    editorStore.setActivePane(props.paneId)
    editorStore.openFile(created)
  }
}

// ─── Lifecycle ─────────────────────────────────────────────────────
onMounted(() => {
  chatStore.loadAllSessionsMeta()
})
</script>

<style scoped>
/* ── Center layout (Home) ── */
.newtab-center {
  display: flex;
  justify-content: center;
  padding: clamp(32px, 10vh, 100px) 24px clamp(24px, 6vh, 60px);
  user-select: none;
  -webkit-user-select: none;
}

.newtab-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 440px;
  max-width: calc(100% - 48px);
}

/* ── Wordmark ── */
.newtab-brand {
  font-family: 'Lora', ui-serif, Georgia, serif;
  font-style: italic;
  font-weight: 400;
  font-size: 2rem;
  color: var(--fg-primary);
  opacity: 0.2;
  letter-spacing: -0.02em;
}

.newtab-rule {
  width: 28px;
  height: 1px;
  background: var(--fg-muted);
  opacity: 0.15;
  margin: 14px 0 20px;
}

/* ── File creation row ── */
.newtab-create-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px 12px;
  margin-bottom: 20px;
  width: 100%;
}

.newtab-create-link {
  border: none;
  background: transparent;
  color: var(--fg-muted);
  font-size: 12px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 3px;
  transition: color 0.15s;
}

.newtab-create-link:hover {
  color: var(--accent);
}

/* ── Sections ── */
.newtab-section {
  width: 100%;
  margin-top: 4px;
}

.newtab-section + .newtab-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.newtab-section-label {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--fg-muted);
  opacity: 0.5;
  padding: 0 10px 4px;
  user-select: none;
}

.newtab-see-more {
  display: block;
  font-size: 11px;
  border: none;
  background: transparent;
  color: var(--fg-muted);
  cursor: pointer;
  padding: 3px 10px 0;
  opacity: 0.5;
  text-align: left;
}

.newtab-see-more:hover {
  opacity: 1;
  color: var(--fg-secondary);
}

/* ── List items (files / chats) ── */
.newtab-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 4px 10px;
  border: none;
  background: transparent;
  color: var(--fg-secondary);
  font-size: 13px;
  line-height: 1.5;
  cursor: pointer;
  text-align: left;
  gap: 12px;
}

.newtab-item:hover {
  color: var(--fg-primary);
}

.newtab-time {
  font-size: 11px;
  color: var(--fg-muted);
  flex-shrink: 0;
  white-space: nowrap;
}

/* ── Chat input area (sticky bottom, no separator line) ── */
.newtab-chat-area {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  padding: 20px 24px 18px;
}

.newtab-input-wrap {
  width: 100%;
  max-width: 440px;
}

.newtab-input-box {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-secondary);
  padding: 9px 8px 9px 12px;
  transition: border-color 0.15s;
}

.newtab-input-focused {
  border-color: var(--accent);
}

.newtab-send {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  border: none;
  border-radius: 5px;
  background: var(--bg-tertiary);
  color: var(--fg-muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.newtab-send-active {
  background: var(--accent);
  color: var(--bg-primary);
}

.newtab-input-footer {
  display: flex;
  align-items: center;
  padding: 4px 2px 0;
}

.newtab-model-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--fg-muted);
  font-size: 11px;
  cursor: pointer;
  transition: color 0.15s;
}

.newtab-model-btn:hover {
  color: var(--fg-secondary);
}

.newtab-empty {
  padding: 16px 10px;
  font-size: 13px;
  color: var(--fg-muted);
}

.truncate {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
