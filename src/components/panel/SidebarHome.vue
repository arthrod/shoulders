<template>
  <div
    ref="rootRef"
    class="flex flex-col h-full outline-none"
    tabindex="-1"
    @keydown="handleKeydown"
  >
    <!-- Header -->
    <div class="flex items-center h-7 px-1.5 shrink-0 border-b border-line gap-1">
      <span class="ui-text-lg font-medium px-1.5 text-content-secondary truncate">Shoulders AI</span>
      <div class="flex-1" />
      <!-- + New button -->
      <button
        class="flex items-center gap-1 h-6 px-2 rounded ui-text-sm font-medium cursor-pointer transition-colors duration-75 text-accent hover:text-accent/80"
        title="New conversation (⌘N)"
        @click="sidebar.goToNew()"
      >
        <IconPlus :size="12" :stroke-width="1.5" />
        New
      </button>
    </div>

    <!-- Session list -->
    <div ref="itemListRef" class="flex-1 overflow-y-auto min-h-0">
      <div class="max-w-[80ch] mx-auto w-full">

        <!-- ═══ Active section (always visible when history exists) ═══ -->
        <template v-if="sidebar.activeItems.length > 0 || sidebar.visibleOlderItems.length > 0">
          <!-- Active section header -->
          <div class="flex items-center gap-2 px-3 pt-2 pb-1">
            <span class="text-[9px] font-semibold tracking-[0.08em] uppercase text-content-muted">Active{{ sidebar.activeItems.length > 0 ? ` (${sidebar.activeItems.length})` : '' }}</span>
            <div class="flex-1 h-px bg-line/30" />
          </div>

          <!-- Active items -->
          <template v-if="sidebar.activeItems.length > 0">
            <div class="bg-surface/30 rounded mx-1">
              <SessionRow
                v-for="(item, i) in sidebar.activeItems"
                :key="item.type + ':' + item.id"
                :item="item"
                :selected="selectedIdx === i"
                @click="handleItemClick(item)"
                @archive="handleArchive(item)"
                @mouseenter="selectedIdx = i"
              />
            </div>
          </template>

          <!-- Empty active state — styled as a session row CTA -->
          <button
            v-else
            data-sidebar-item
            class="flex items-start gap-2 px-3 py-3 w-full text-left cursor-pointer group"
            @click="sidebar.goToNew()"
            @mouseenter="selectedIdx = 0"
          >
            <span
              class="w-3 shrink-0 leading-none select-none mt-0.5 transition-colors duration-75"
              style="font-size: 14px;"
              :style="{ color: selectedIdx === 0 && showEmptyCta ? 'rgb(var(--accent))' : 'rgb(var(--accent) / 0.5)' }"
            >&#x203a;</span>
            <div class="flex-1 min-w-0">
              <span class="ui-text-lg font-medium text-accent/80 group-hover:text-accent transition-colors duration-75">New conversation</span>
              <div class="mt-0.5 ui-text-base text-content-muted/50">Ask a question, start a task, or launch a workflow</div>
            </div>
          </button>
        </template>

        <!-- ═══ Recent section ═══ -->
        <template v-if="sidebar.visibleOlderItems.length > 0">
          <!-- Recent section header -->
          <div class="flex items-center gap-2 px-3 pt-6 pb-2">
            <span class="text-[9px] font-semibold tracking-[0.08em] uppercase text-content-muted/60">Recent</span>
            <div class="flex-1 h-px bg-line/30" />
          </div>

          <!-- Older items (compact) -->
          <SessionRow
            v-for="(item, i) in sidebar.visibleOlderItems"
            :key="'older:' + item.id"
            :item="item"
            :showArchive="false"
            variant="compact"
            :selected="selectedIdx === olderStartIdx + i"
            @click="handleItemClick(item)"
            @mouseenter="selectedIdx = olderStartIdx + i"
          />
        </template>

        <!-- Load more / Search -->
        <div
          v-if="sidebar.hasMoreOlderItems || sidebar.activeItems.length > 0 || sidebar.visibleOlderItems.length > 0"
          class="flex items-center gap-3 px-3 py-2"
        >
          <button
            v-if="sidebar.hasMoreOlderItems"
            class="ui-text-sm text-content-muted hover:text-content-secondary bg-transparent border-none cursor-pointer p-0 transition-colors duration-75"
            @click="sidebar.loadMore()"
          >Load more</button>
          <span v-if="sidebar.hasMoreOlderItems && !isSearching" class="ui-text-sm text-content-muted/40">&middot;</span>
          <button
            v-if="!isSearching"
            class="ui-text-sm text-content-muted hover:text-content-secondary bg-transparent border-none cursor-pointer p-0 transition-colors duration-75"
            @click="startSearch"
          >Search</button>
        </div>

        <!-- Inline search (when active) -->
        <div v-if="isSearching" class="px-3 pb-2">
          <div class="flex items-center gap-1.5">
            <input
              ref="searchInputRef"
              v-model="sidebar.homeSearchQuery"
              type="text"
              placeholder="Search past conversations..."
              class="flex-1 px-2.5 py-1.5 rounded ui-text-lg border-none outline-none bg-surface text-content"
              @keydown.escape="stopSearch"
            />
            <button
              class="shrink-0 p-1 rounded text-content-muted hover:text-content transition-colors duration-75"
              @click="stopSearch"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 3L3 9M3 3l6 6"/></svg>
            </button>
          </div>
        </div>

        <!-- ═══ Empty state: no sessions at all ═══ -->
        <div
          v-if="sidebar.activeItems.length === 0 && sidebar.visibleOlderItems.length === 0 && !isSearching"
          class="px-3 pt-4"
        >
          <template v-if="suggestions.length > 0">
            <div class="text-[9px] font-semibold tracking-[0.08em] uppercase pb-2 pl-2 text-content-muted">
              Try asking about {{ suggestionFileName }}
            </div>
            <button
              v-for="(s, i) in suggestions"
              :key="i"
              data-sidebar-item
              class="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded bg-transparent border-none cursor-pointer transition-colors duration-75 ui-text-lg"
              :class="selectedIdx === i ? 'text-content-secondary bg-surface-hover' : 'text-content-muted'"
              @mouseenter="selectedIdx = i"
              @click="sendSuggestion(s)"
            >
              <span class="flex-1 truncate min-w-0">{{ s.label }}</span>
            </button>
          </template>
          <template v-else>
            <div class="flex flex-col items-center justify-center py-8 text-content-muted">
              <span class="ui-text-lg">Start a conversation</span>
              <button
                class="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded ui-text-sm font-medium cursor-pointer transition-colors duration-75 text-accent hover:text-accent/80"
                @click="sidebar.goToNew()"
              >
                <IconPlus :size="12" :stroke-width="1.5" />
                New
              </button>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { IconPlus } from '@tabler/icons-vue'
import { useAISidebarStore } from '../../stores/aiSidebar'
import { useWorkflowsStore } from '../../stores/workflows'
import { useEditorStore } from '../../stores/editor'
import { isMarkdown } from '../../utils/fileTypes'
import SessionRow from './SessionRow.vue'

const sidebar = useAISidebarStore()
const workflowsStore = useWorkflowsStore()
const editorStore = useEditorStore()

const rootRef = ref(null)
const itemListRef = ref(null)
const searchInputRef = ref(null)
const selectedIdx = ref(0)
const isSearching = ref(false)

const showEmptyCta = computed(() =>
  sidebar.activeItems.length === 0 && sidebar.visibleOlderItems.length > 0
)

const olderStartIdx = computed(() =>
  showEmptyCta.value ? 1 : sidebar.activeItems.length
)

// ─── Search ────────────────────────────────────────────────────────

function startSearch() {
  isSearching.value = true
  nextTick(() => searchInputRef.value?.focus())
}

function stopSearch() {
  isSearching.value = false
  sidebar.homeSearchQuery = ''
}

// ─── Suggestion chips (empty state) ───────────────────────────────

const suggestionFileName = computed(() => {
  const tab = editorStore.activeTab
  if (!tab) return ''
  return tab.split('/').pop() || tab
})

const suggestions = computed(() => {
  if (sidebar.activeItems.length > 0) return []

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

// ─── Item actions ──────────────────────────────────────────────────

function handleItemClick(item) {
  if (item.type === 'chat') {
    sidebar.drillIntoChat(item.id)
  } else if (item.type === 'workflow') {
    sidebar.drillIntoWorkflowRun(item.workflowId, item.runId)
  } else if (item.type === 'archived-chat') {
    sidebar.focusSidebarChat(item.id)
  } else if (item.type === 'archived-workflow') {
    workflowsStore.reopenRun(item.runId).then(() => {
      sidebar.drillIntoWorkflowRun(item.workflowId, item.runId)
    })
  }
}

function handleArchive(item) {
  if (item.type === 'chat') {
    sidebar.archiveSession(item.id)
  } else if (item.type === 'workflow') {
    sidebar.archiveWorkflowRun(item.runId)
  }
}

async function sendSuggestion(action) {
  let content = null
  try { content = await invoke('read_file', { path: action.file }) } catch {}

  sidebar.createChatAndDrillIn({
    text: action.prompt,
    fileRefs: [{ path: action.file, content }],
  })
}

// ─── Keyboard navigation ──────────────────────────────────────────

function handleKeydown(e) {
  const active = document.activeElement
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return

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
  if (e.key === 'Enter') {
    e.preventDefault()
    activateSelected()
    return
  }
}

function moveSelection(delta) {
  const count = totalItemCount.value
  if (count === 0) return
  const next = Math.max(0, Math.min(count - 1, selectedIdx.value + delta))
  selectedIdx.value = next
  nextTick(() => {
    const items = itemListRef.value?.querySelectorAll('[data-sidebar-item]')
    items?.[next]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}

function activateSelected() {
  // CTA row at index 0 when empty active
  if (showEmptyCta.value && selectedIdx.value === 0) {
    sidebar.goToNew()
    return
  }

  // Active + older items
  const activeCount = sidebar.activeItems.length
  const olderOffset = olderStartIdx.value
  const idx = selectedIdx.value

  if (idx < olderOffset) {
    const item = sidebar.activeItems[idx]
    if (item) handleItemClick(item)
  } else {
    const item = sidebar.visibleOlderItems[idx - olderOffset]
    if (item) handleItemClick(item)
  }

  // Suggestion chips (fully empty state)
  if (sidebar.activeItems.length === 0 && sidebar.visibleOlderItems.length === 0) {
    const s = suggestions.value[selectedIdx.value]
    if (s) sendSuggestion(s)
  }
}

const totalItemCount = computed(() => {
  const ctaCount = showEmptyCta.value ? 1 : 0
  const itemCount = sidebar.activeItems.length + ctaCount + sidebar.visibleOlderItems.length
  return itemCount > 0 ? itemCount : suggestions.value.length
})

// ─── Focus management ──────────────────────────────────────────────

function focus() {
  rootRef.value?.focus()
}

defineExpose({ focus })
</script>
