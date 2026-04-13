<template>
  <div
    ref="rootRef"
    class="flex flex-col h-full outline-none"
    tabindex="-1"
    @keydown="handleKeydown"
  >
    <!-- Mode tabs -->
    <div class="flex gap-5 px-3 pt-2 pb-1.5 shrink-0">
      <button
        v-for="tab in TABS"
        :key="tab.id"
        class="text-[9px] font-semibold tracking-[0.08em] uppercase bg-transparent border-none cursor-pointer pb-0.5 transition-colors duration-75"
        :style="{
          color: sidebar.overviewMode === tab.id ? 'rgb(var(--fg-primary))' : 'rgb(var(--fg-muted))',
          borderBottom: sidebar.overviewMode === tab.id ? '1px solid rgb(var(--fg-primary))' : '1px solid transparent',
        }"
        @click="setMode(tab.id)"
      >{{ tab.label }}</button>
    </div>

    <!-- ═══ ACTIVE mode ═══ -->
    <template v-if="sidebar.overviewMode === 'active'">
      <div ref="itemListRef" class="flex-1 overflow-y-auto min-h-0">
        <!-- Date-grouped active items -->
        <template v-if="sidebar.activeItemsByDate.length > 0">
          <div v-for="group in sidebar.activeItemsByDate" :key="group.label" class="group">
            <!-- Date divider -->
            <div class="flex items-center px-3 pt-3 pb-1 gap-2">
              <span class="text-[9px] font-semibold tracking-[0.08em] uppercase" style="color: rgb(var(--fg-muted));">{{ group.label }}</span>
              <div class="flex-1 h-px" style="background: rgb(var(--border));" />
              <button
                class="ui-text-sm cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity bg-transparent border-none"
                style="color: rgb(var(--fg-muted));"
                @click="sidebar.archiveGroup(group.label)"
              >archive all</button>
            </div>

            <!-- Items -->
            <SessionRow
              v-for="(item, flatIdx) in group.items"
              :key="item.type + ':' + item.id"
              :item="item"
              :compact="false"
              :selected="selectedIdx === flatIndex(group, flatIdx)"
              @click="handleItemClick(item)"
              @archive="handleArchive(item)"
              @mouseenter="selectedIdx = flatIndex(group, flatIdx)"
            />
          </div>
        </template>

        <!-- Empty state: suggestion chips -->
        <div v-else class="px-3 pt-4">
          <template v-if="suggestions.length > 0">
            <div class="text-[9px] font-semibold tracking-[0.08em] uppercase pb-2 pl-2" style="color: rgb(var(--fg-muted));">
              Try asking about {{ suggestionFileName }}
            </div>
            <button
              v-for="(s, i) in suggestions"
              :key="i"
              data-sidebar-item
              class="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded bg-transparent border-none cursor-pointer transition-colors duration-75 ui-text-base"
              :style="{ color: selectedIdx === i ? 'rgb(var(--fg-secondary))' : 'rgb(var(--fg-muted))' }"
              @mouseenter="selectedIdx = i"
              @click="sendSuggestion(s)"
            >
              <span
                class="w-3 shrink-0 leading-none select-none"
                style="font-size: 14px;"
                :style="{ color: selectedIdx === i ? 'rgb(var(--fg-muted))' : 'transparent' }"
              >›</span>
              <span class="flex-1 truncate min-w-0">{{ s.label }}</span>
            </button>
          </template>
        </div>
      </div>

      <!-- ChatInput (pinned bottom, ACTIVE only) -->
      <div class="shrink-0 border-t" style="border-color: rgb(var(--border));">
        <ChatInput
          ref="chatInputRef"
          :isStreaming="false"
          :modelId="workspace.selectedModelId"
          @send="handleSend"
          @update-model="handleModelChange"
        />
      </div>
    </template>

    <!-- ═══ WORKFLOWS mode ═══ -->
    <template v-else-if="sidebar.overviewMode === 'workflows'">
      <div ref="itemListRef" class="flex-1 overflow-y-auto min-h-0">
        <template v-if="Object.keys(groupedWorkflows).length > 0">
          <div v-for="(workflows, category) in groupedWorkflows" :key="category">
            <div class="flex items-center px-3 pt-3 pb-1 gap-2">
              <span class="text-[9px] font-semibold tracking-[0.08em] uppercase" style="color: rgb(var(--fg-muted));">{{ category }}</span>
              <div class="flex-1 h-px" style="background: rgb(var(--border));" />
            </div>
            <WorkflowRow
              v-for="w in workflows"
              :key="w.id"
              :workflow="w"
              @click="sidebar.drillIntoWorkflow(w.id)"
            />
          </div>
        </template>
      </div>
    </template>

    <!-- ═══ HISTORY mode ═══ -->
    <template v-else>
      <!-- Search bar -->
      <div class="px-3 pt-1 pb-1 shrink-0">
        <input
          ref="historySearchRef"
          v-model="sidebar.historyQuery"
          type="text"
          placeholder="Search past conversations..."
          class="w-full px-2.5 py-1.5 rounded ui-text-base border-none outline-none"
          style="background: rgb(var(--bg-primary)); color: rgb(var(--fg-primary));"
          @keydown.escape="sidebar.historyQuery = ''"
        />
      </div>

      <div ref="itemListRef" class="flex-1 overflow-y-auto min-h-0">
        <template v-if="sidebar.historyItems.length > 0">
          <SessionRow
            v-for="(item, i) in sidebar.historyItems"
            :key="item.id"
            :item="item"
            :compact="true"
            :showArchive="false"
            :selected="selectedIdx === i"
            @click="handleItemClick(item)"
            @mouseenter="selectedIdx = i"
          />
        </template>
        <div v-else class="px-3 py-6 text-center ui-text-base" style="color: rgb(var(--fg-muted));">
          {{ sidebar.historyQuery ? 'No matching conversations' : 'No past conversations' }}
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useAISidebarStore } from '../../stores/aiSidebar'
import { useWorkflowsStore } from '../../stores/workflows'
import { useWorkspaceStore } from '../../stores/workspace'
import { useEditorStore } from '../../stores/editor'
import { isMarkdown } from '../../utils/fileTypes'
import SessionRow from './SessionRow.vue'
import WorkflowRow from './WorkflowRow.vue'
import ChatInput from '../chat/ChatInput.vue'

const sidebar = useAISidebarStore()
const workflowsStore = useWorkflowsStore()
const workspace = useWorkspaceStore()
const editorStore = useEditorStore()

const rootRef = ref(null)
const chatInputRef = ref(null)
const historySearchRef = ref(null)
const itemListRef = ref(null)
const selectedIdx = ref(0)

const TABS = [
  { id: 'active', label: 'ACTIVE' },
  { id: 'workflows', label: 'WORKFLOWS' },
  { id: 'history', label: 'HISTORY' },
]

// Reset selection when switching modes + discover workflows lazily
watch(() => sidebar.overviewMode, (mode) => {
  selectedIdx.value = 0
  if (mode === 'workflows') {
    workflowsStore.discoverWorkflows()
  }
})


// ─── Workflows by category (available only, no drafts) ──────────────

const groupedWorkflows = computed(() => {
  const groups = {}
  for (const w of workflowsStore.availableWorkflows) {
    const cat = w.category || 'Other'
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(w)
  }
  return groups
})

// ─── Suggestion chips (ACTIVE empty state) ──────────────────────────

const suggestionFileName = computed(() => {
  const tab = editorStore.activeTab
  if (!tab) return ''
  return tab.split('/').pop() || tab
})

const suggestions = computed(() => {
  if (sidebar.activeItemsByDate.length > 0) return []

  const tab = editorStore.activeTab
  if (!tab) return []

  const name = suggestionFileName.value

  if (isMarkdown(tab) || tab.endsWith('.tex') || tab.endsWith('.docx')) {
    return [
      { label: `Proofread ${name}`, prompt: 'Proofread this document for clarity, grammar, and academic tone.', file: tab },
      { label: `Find argument gaps in ${name}`, prompt: 'Identify logical gaps, unsupported claims, or missing evidence in this document.', file: tab },
      { label: `Peer review ${name}`, prompt: 'Conduct a thorough peer review: assess originality, methodology, clarity, and impact.', file: tab },
      { label: `Summarise ${name}`, prompt: 'Summarise the key arguments and contributions in this document.', file: tab },
      { label: `Check citation coverage`, prompt: 'Are all major claims backed by citations? Identify where references are missing or weak.', file: tab },
      { label: `Shorten and tighten ${name}`, prompt: 'Trim redundancy and tighten prose while preserving the meaning and academic register.', file: tab },
    ]
  }
  if (tab.endsWith('.ipynb') || tab.endsWith('.py') || tab.endsWith('.r') || tab.endsWith('.R') || tab.endsWith('.jl')) {
    return [
      { label: `Explain ${name}`, prompt: 'Explain what this code does and why — for someone new to this project.', file: tab },
      { label: `Debug ${name}`, prompt: 'Help me debug this code. Identify errors and suggest fixes.', file: tab },
      { label: `Review code quality in ${name}`, prompt: 'Review code quality: clarity, style, error handling, and maintainability.', file: tab },
      { label: `Check reproducibility`, prompt: 'Is this notebook reproducible? Identify missing data, dependencies, or unclear instructions.', file: tab },
      { label: `Interpret results`, prompt: 'What do the outputs and plots show? Suggest visualisations or next steps.', file: tab },
    ]
  }
  if (tab.endsWith('.csv') || tab.endsWith('.tsv')) {
    return [
      { label: `Describe ${name}`, prompt: 'Describe this dataset: variables, types, missing values, and sample size.', file: tab },
      { label: `Find patterns in ${name}`, prompt: 'What are the key patterns, correlations, or outliers in this data?', file: tab },
      { label: `Data quality check`, prompt: 'Are there missing values, duplicates, or data type issues I should fix?', file: tab },
      { label: `Suggest visualisations`, prompt: 'What charts or plots would best communicate the key findings in this data?', file: tab },
    ]
  }
  return []
})

// ─── Flat index helpers (for active mode date groups) ───────────────

/** Compute the flat index of an item within date-grouped active items */
function flatIndex(group, idxInGroup) {
  let offset = 0
  for (const g of sidebar.activeItemsByDate) {
    if (g === group) return offset + idxInGroup
    offset += g.items.length
  }
  return offset + idxInGroup
}

// ─── Item actions ───────────────────────────────────────────────────

function handleItemClick(item) {
  if (item.type === 'chat') {
    sidebar.drillIntoChat(item.id)
  } else if (item.type === 'workflow') {
    // Running workflow in ACTIVE tab — drill into its specific run
    sidebar.drillIntoWorkflowRun(item.workflowId, item.runId)
  } else if (item.type === 'archived-chat') {
    sidebar.focusSidebarChat(item.id)
  }
}

function handleArchive(item) {
  if (item.type === 'chat') {
    sidebar.archiveSession(item.id)
  }
}

async function handleSend(payload) {
  await sidebar.createChatAndDrillIn({
    text: payload.text,
    fileRefs: payload.fileRefs,
    context: payload.context,
    richHtml: payload.richHtml,
  })
}

function handleModelChange(modelId) {
  workspace.setSelectedModelId(modelId)
}

async function sendSuggestion(action) {
  let content = null
  try { content = await invoke('read_file', { path: action.file }) } catch {}

  sidebar.createChatAndDrillIn({
    text: action.prompt,
    fileRefs: [{ path: action.file, content }],
  })
}

function setMode(id) {
  sidebar.overviewMode = id
}

// ─── Keyboard navigation ────────────────────────────────────────────
// Handler on root div (tabindex=-1), only fires when sidebar has focus.

function handleKeydown(e) {
  // Don't intercept when a text input has focus
  const active = document.activeElement
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return

  // Left/Right arrows: switch mode tabs (same pattern as NewTab)
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    switchMode(-1)
    return
  }
  if (e.key === 'ArrowRight') {
    e.preventDefault()
    switchMode(1)
    return
  }

  // Up/Down arrows: navigate items
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    moveSelection(-1)
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    moveSelection(1)
    return
  }

  // Enter: activate selected item
  if (e.key === 'Enter') {
    e.preventDefault()
    activateSelected()
    return
  }

  // Printable character: focus ChatInput (ACTIVE mode only)
  if (sidebar.overviewMode === 'active' && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
    chatInputRef.value?.focus()
    // Don't prevent default — let the keystroke land in the input
  }
}

function switchMode(delta) {
  const ids = TABS.map(t => t.id)
  const idx = ids.indexOf(sidebar.overviewMode)
  const next = (idx + delta + ids.length) % ids.length
  sidebar.overviewMode = ids[next]
}

function moveSelection(delta) {
  const count = currentItemCount.value
  if (count === 0) return
  const next = Math.max(0, Math.min(count - 1, selectedIdx.value + delta))
  selectedIdx.value = next
  nextTick(() => {
    const items = itemListRef.value?.querySelectorAll('[data-sidebar-item]')
    items?.[next]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}

function activateSelected() {
  if (sidebar.overviewMode === 'active') {
    const allItems = sidebar.activeItemsByDate.flatMap(g => g.items)
    if (allItems.length > 0) {
      const item = allItems[selectedIdx.value]
      if (item) handleItemClick(item)
    } else {
      const s = suggestions.value[selectedIdx.value]
      if (s) sendSuggestion(s)
    }
  } else if (sidebar.overviewMode === 'workflows') {
    const allWorkflows = Object.values(groupedWorkflows.value).flat()
    const w = allWorkflows[selectedIdx.value]
    if (w) sidebar.drillIntoWorkflow(w.id)
  } else if (sidebar.overviewMode === 'history') {
    const item = sidebar.historyItems[selectedIdx.value]
    if (item) handleItemClick(item)
  }
}

const currentItemCount = computed(() => {
  if (sidebar.overviewMode === 'active') {
    const activeCount = sidebar.activeItemsByDate.reduce((n, g) => n + g.items.length, 0)
    return activeCount > 0 ? activeCount : suggestions.value.length
  }
  if (sidebar.overviewMode === 'workflows') {
    return Object.values(groupedWorkflows.value).reduce((n, ws) => n + ws.length, 0)
  }
  return sidebar.historyItems.length
})

// ─── Focus management ───────────────────────────────────────────────

/** Focus root for keyboard nav. Printable chars auto-redirect to ChatInput. */
function focus() {
  rootRef.value?.focus()
}

/** Focus ChatInput directly (for Cmd+J). */
function focusInput() {
  if (sidebar.overviewMode === 'active') {
    chatInputRef.value?.focus()
  } else if (sidebar.overviewMode === 'history') {
    historySearchRef.value?.focus()
  } else {
    rootRef.value?.focus()
  }
}

defineExpose({ focus, focusInput })
</script>
