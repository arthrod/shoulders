<template>
  <div class="flex flex-col h-full" style="background: var(--bg-primary);">

    <!-- Close pane button (split panes only) -->
    <div v-if="paneId !== 'pane-root'" class="flex items-center justify-end h-7 shrink-0 border-b px-1" style="border-color: var(--border);">
      <button
        class="p-1 rounded cursor-pointer"
        style="color: var(--fg-muted);"
        title="Close pane"
        @click="editorStore.collapsePane(paneId)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>

    <!-- Scrollable content -->
    <div class="flex-1 overflow-auto min-h-0">
      <div class="newtab-scroll-area">
        <div class="newtab-content">

          <!-- RECENT -->
          <div v-if="allRecentFiles.length > 0" class="newtab-section">
            <div class="newtab-label">Recent</div>
            <button
              v-for="entry in allRecentFiles.slice(0, filesVisible)"
              :key="entry.path"
              class="newtab-item"
              @click="openFile(entry.path)"
            >
              <span class="newtab-filename">{{ fileName(entry.path) }}</span>
              <span class="newtab-time">{{ relativeTime(entry.openedAt) }}</span>
            </button>
            <button
              v-if="allRecentFiles.length > filesVisible"
              class="newtab-see-more"
              @click="filesVisible = allRecentFiles.length"
            >See {{ allRecentFiles.length - filesVisible }} more</button>
          </div>

          <!-- NEW DOCUMENT -->
          <div class="newtab-section">
            <div class="newtab-label">New document</div>
            <button
              v-for="ft in fileTypes"
              :key="ft.ext"
              class="newtab-create-item"
              @click="createNewFile(ft.ext)"
            >{{ ft.label }}</button>
          </div>

          <!-- AI zone: only render separator + below if there's something to show -->
          <template v-if="allChats.length > 0 || quickActions.length > 0">
            <hr class="newtab-zone-sep" />

            <!-- CONVERSATIONS -->
            <div v-if="allChats.length > 0" class="newtab-section">
              <div class="newtab-label">Conversations</div>
              <button
                v-for="sess in allChats.slice(0, chatsVisible)"
                :key="sess.id"
                class="newtab-item"
                @click="openChat(sess.id)"
              >
                <span class="newtab-filename">{{ sess.label }}</span>
                <span class="newtab-time">{{ relativeTime(sess.updatedAt) }}</span>
              </button>
              <button
                v-if="allChats.length > chatsVisible"
                class="newtab-see-more"
                @click="loadMoreChats"
              >See more</button>
            </div>

            <!-- QUICK ACTIONS -->
            <div v-if="quickActions.length > 0" class="newtab-actions">
              <div class="newtab-label">Suggested</div>
              <button
                v-for="action in quickActions"
                :key="action.label"
                class="newtab-action"
                @click="sendQuickAction(action)"
              >{{ action.label }} →</button>
            </div>
          </template>

        </div>
      </div>
    </div>

    <!-- Sticky bottom: ChatInput -->
    <div class="newtab-bottom">
      <div class="newtab-bottom-inner">
        <ChatInput
          ref="chatInputRef"
          :isStreaming="false"
          :modelId="selectedModelId"
          :estimatedTokens="null"
          @send="sendChat"
          @update-model="selectModel"
        />
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useEditorStore } from '../../stores/editor'
import { useFilesStore } from '../../stores/files'
import { useChatStore } from '../../stores/chat'
import { useWorkspaceStore } from '../../stores/workspace'
import { isMarkdown } from '../../utils/fileTypes'
import ChatInput from '../chat/ChatInput.vue'

const props = defineProps({
  paneId: { type: String, required: true },
})

const editorStore = useEditorStore()
const filesStore  = useFilesStore()
const chatStore   = useChatStore()
const workspace   = useWorkspaceStore()

// ─── State ─────────────────────────────────────────────────────────
const chatInputRef    = ref(null)
const selectedModelId = ref(workspace.selectedModelId || null)
const filesVisible    = ref(5)
const chatsVisible    = ref(3)

// ─── File types ────────────────────────────────────────────────────
const fileTypes = [
  { ext: '.md',    label: 'Markdown document' },
  { ext: '.tex',   label: 'LaTeX document' },
  { ext: '.docx',  label: 'Word document' },
  { ext: '.ipynb', label: 'Jupyter notebook' },
  { ext: '.py',    label: 'Code' },
]

// ─── Computed ──────────────────────────────────────────────────────
const allRecentFiles = computed(() => {
  const flatPaths = new Set(filesStore.flatFiles.map(f => f.path))
  return editorStore.recentFiles.filter(entry => flatPaths.has(entry.path))
})

const allChats = computed(() =>
  [...chatStore.allSessionsMeta].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
)

const quickActions = computed(() => {
  const file = allRecentFiles.value[0]
  if (!file) return []
  const name = fileName(file.path)
  const path = file.path

  if (isMarkdown(path) || path.endsWith('.tex') || path.endsWith('.docx')) {
    return [
      { label: `Proofread ${name}`,                  prompt: 'Proofread this document',                     file: path },
      { label: `Summarise key arguments in ${name}`, prompt: 'Summarise the key arguments in this document', file: path },
    ]
  }
  if (path.endsWith('.ipynb') || path.endsWith('.py') || path.endsWith('.r') || path.endsWith('.R') || path.endsWith('.jl')) {
    return [
      { label: `Explain ${name}`, prompt: 'Explain this code',  file: path },
      { label: `Debug ${name}`,   prompt: 'Help me debug this', file: path },
    ]
  }
  return []
})

// ─── Helpers ───────────────────────────────────────────────────────
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

// ─── Navigation ────────────────────────────────────────────────────
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

function loadMoreChats() {
  chatStore.loadAllSessionsMeta()
  chatsVisible.value += 8
}

// ─── Send ──────────────────────────────────────────────────────────
async function sendChat({ text, fileRefs, context }) {
  if (!text && !fileRefs?.length) return
  editorStore.setActivePane(props.paneId)
  const sessionId = chatStore.createSession()
  const session = chatStore.sessions.find(s => s.id === sessionId)
  if (session && selectedModelId.value) session.modelId = selectedModelId.value
  editorStore.openChat({ sessionId, paneId: props.paneId })
  await nextTick()
  chatStore.sendMessage(sessionId, { text, fileRefs, context })
}

async function sendQuickAction(action) {
  editorStore.setActivePane(props.paneId)
  const sessionId = chatStore.createSession()
  const session = chatStore.sessions.find(s => s.id === sessionId)
  if (session && selectedModelId.value) session.modelId = selectedModelId.value
  editorStore.openChat({ sessionId, paneId: props.paneId })
  await nextTick()

  let content = null
  try { content = await invoke('read_file', { path: action.file }) } catch {}

  chatStore.sendMessage(sessionId, {
    text: action.prompt,
    fileRefs: [{ path: action.file, content }],
  })
}

function selectModel(modelId) {
  selectedModelId.value = modelId
  workspace.setSelectedModelId(modelId)
}

// ─── File creation ─────────────────────────────────────────────────
async function createNewFile(ext) {
  if (!workspace.path) return
  const baseName = 'untitled'
  let name = `${baseName}${ext}`
  let counter = 2
  while (true) {
    const fullPath = `${workspace.path}/${name}`
    try {
      const exists = await invoke('path_exists', { path: fullPath })
      if (!exists) break
    } catch { break }
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
  nextTick(() => chatInputRef.value?.focus())
})
</script>

<style scoped>
.newtab-scroll-area {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100%;
  padding: 24px;
  box-sizing: border-box;
}

.newtab-content {
  width: 100%;
  max-width: 80ch;
}

.newtab-section {
  margin-top: 22px;
}

.newtab-section:first-child {
  margin-top: 0;
}

/* Section labels */
.newtab-label {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.10em;
  color: var(--fg-muted);
  opacity: 0.45;
  margin-bottom: 5px;
  user-select: none;
}

/* File / conversation items */
.newtab-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 3px 0;
  border: none;
  background: transparent;
  color: var(--fg-secondary);
  font-size: 13px;
  line-height: 1.5;
  cursor: pointer;
  text-align: left;
  gap: 16px;
  transition: color 0.1s;
}

.newtab-item:hover {
  color: var(--fg-primary);
}

.newtab-filename {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.newtab-time {
  font-size: 11px;
  color: var(--fg-muted);
  flex-shrink: 0;
  white-space: nowrap;
}

/* "See more" link */
.newtab-see-more {
  display: block;
  padding: 2px 0;
  border: none;
  background: transparent;
  font-size: 11px;
  color: var(--fg-muted);
  opacity: 0.45;
  cursor: pointer;
  text-align: left;
  transition: opacity 0.1s, color 0.1s;
}

.newtab-see-more:hover {
  opacity: 0.8;
  color: var(--fg-secondary);
}

/* New document items */
.newtab-create-item {
  display: block;
  width: 100%;
  padding: 3px 0;
  border: none;
  background: transparent;
  font-size: 12px;
  color: var(--fg-muted);
  cursor: pointer;
  text-align: left;
  transition: color 0.1s;
}

.newtab-create-item:hover {
  color: var(--fg-primary);
}

/* Zone separator — between file zone and AI zone */
.newtab-zone-sep {
  border: none;
  border-top: 1px solid var(--border);
  margin: 22px 0;
  opacity: 0.5;
}

/* Quick actions */
.newtab-actions {
  margin-top: 12px;
}

.newtab-action {
  display: block;
  padding: 3px 0;
  border: none;
  background: transparent;
  font-size: 12px;
  color: var(--fg-muted);
  cursor: pointer;
  text-align: left;
  transition: color 0.1s;
}

.newtab-action:hover {
  color: var(--fg-secondary);
}

/* Sticky bottom */
.newtab-bottom {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
}

.newtab-bottom-inner {
  width: 100%;
  max-width: 80ch;
}

</style>
