<template>
  <div class="flex items-center h-[29px] shrink-0 relative"
    data-tab-bar
    data-tauri-drag-region
    :data-pane-id="paneId"
    style="background: rgb(var(--bg-secondary)); border-bottom: 1px solid rgb(var(--border));">
    <!-- Tabs -->
    <div ref="tabsContainer" class="flex-1 flex items-center h-full overflow-x-auto relative" data-tabs-area data-tauri-drag-region>
      <div
        v-for="(tab, idx) in tabs"
        :key="tab"
        :ref="el => tabEls[idx] = el"
        data-tab-el
        class="flex items-center h-full px-3 text-xs cursor-pointer shrink-0 border-r group"
        :style="{
          borderColor: 'rgb(var(--border))',
          background: tab === activeTab ? 'rgb(var(--bg-primary))' : 'transparent',
          color: tab === activeTab ? 'rgb(var(--fg-primary))' : 'rgb(var(--fg-muted))',
          borderTop: tab === activeTab ? '2px solid rgb(var(--accent))' : '2px solid transparent',
          opacity: dragIdx === idx ? 0.3 : 1,
          transition: 'opacity 0.15s',
        }"
        @mousedown="onMouseDown(idx, $event)"
        @mouseenter="onMouseEnter(idx)"
        @mousedown.middle.prevent="$emit('close-tab', tab)"
      >
        <!-- NewTab icon -->
        <!-- <svg v-if="isNewTab(tab)" class="shrink-0 mr-1" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" style="color: rgb(var(--fg-muted));">
          <line x1="8" y1="3" x2="8" y2="13"/>
          <line x1="3" y1="8" x2="13" y2="8"/>
        </svg> -->
        <!-- HTML preview tab icon (eye) -->
        <svg v-if="isHtmlPreviewTab(tab)" class="shrink-0 mr-1" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" style="color: rgb(var(--accent));">
          <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/>
        </svg>
        <span class="truncate max-w-[120px]">{{ fileName(tab) }}</span>

        <!-- Unsaved indicator -->
        <span v-if="dirtyFiles.has(tab)" class="ml-1.5 w-2 h-2 rounded-full shrink-0" style="background: rgb(var(--fg-muted));"></span>

        <!-- Close button -->
        <button
          class="ml-2 w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity"
          style="color: rgb(var(--fg-muted));"
          @click.stop="$emit('close-tab', tab)"
          @mousedown.stop
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M2 2l6 6M8 2l-6 6"/>
          </svg>
        </button>
      </div>

      <!-- Drop indicator line -->
      <div v-if="dropIndicatorLeft !== null" class="tab-drop-indicator" :style="{ left: dropIndicatorLeft + 'px' }"></div>

      <!-- New tab button -->
      <button
        class="flex items-center justify-center w-6 h-6 mx-0.5 shrink-0 rounded hover:bg-[rgb(var(--bg-hover))]"
        style="color: rgb(var(--fg-muted));"
        title="New Tab"
        @click="$emit('new-tab')"
        @mousedown.stop
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <line x1="8" y1="3" x2="8" y2="13"/>
          <line x1="3" y1="8" x2="13" y2="8"/>
        </svg>
      </button>
    </div>

    <!-- Run actions (for runnable files) -->
    <div v-if="showRunButtons" class="flex items-center gap-0.5 px-1 shrink-0 border-r" style="border-color: rgb(var(--border));">
      <!-- Run single line/selection — hidden for .qmd/.rmd (gutter buttons handle chunks) -->
      <button
        v-if="!activeTabIsQmd"
        class="h-6 px-2 flex items-center gap-1 rounded text-[11px] hover:bg-[rgb(var(--bg-hover))]"
        style="color: rgb(var(--success, #4ade80));"
        @click="$emit('run-code')"
        title="Run selection or line (Cmd+Enter)"
      >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4 2l10 6-10 6V2z"/>
        </svg>
        Run
      </button>
      <button
        class="h-6 px-2 flex items-center gap-1 rounded text-[11px] hover:bg-[rgb(var(--bg-hover))]"
        style="color: rgb(var(--success, #4ade80));"
        @click="$emit('run-file')"
        :title="activeTabIsQmd ? 'Run all chunks (Shift+Cmd+Enter)' : 'Run entire file (Shift+Cmd+Enter)'"
      >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
          <path d="M2 2l6 6-6 6V2z"/>
          <path d="M8 2l6 6-6 6V2z"/>
        </svg>
        Run All
      </button>
    </div>

    <!-- Preview (for .html files) -->
    <div v-if="showPreviewButton" class="flex items-center px-1.5 shrink-0 border-r" style="border-color: rgb(var(--border));">
      <button
        class="h-6 px-2 flex items-center gap-1 rounded text-[11px] hover:bg-[rgb(var(--bg-hover))]"
        style="color: rgb(var(--accent));"
        @click="$emit('preview-html')"
        title="Preview HTML"
      >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/>
          <circle cx="8" cy="8" r="2"/>
        </svg>
        Preview
      </button>
    </div>

    <!-- Export (for .md files) -->
    <div v-if="showMarkdownButtons" class="flex items-center px-1.5 shrink-0 border-r" style="border-color: rgb(var(--border));">
      <!-- Quarto render status -->
      <span v-if="quartoStatus === 'rendering'" class="flex items-center gap-1 text-[11px] mr-1" style="color: rgb(var(--fg-muted));">
        <span class="tex-spinner"></span>
        Rendering…
      </span>
      <span v-else-if="quartoStatus === 'done'" class="text-[11px] mr-1" style="color: rgb(var(--success, #4ade80));">
        ● {{ quartoDuration }}
      </span>
      <button v-else-if="quartoStatus === 'error'" ref="quartoErrorBadgeEl"
        class="h-6 px-1.5 flex items-center gap-1 rounded text-[11px] hover:bg-[rgb(var(--bg-hover))] cursor-pointer mr-1"
        style="color: rgb(var(--error, #f87171));"
        @click="quartoErrorPanelOpen = !quartoErrorPanelOpen"
      >
        ✕ {{ quartoErrorCount }} error{{ quartoErrorCount !== 1 ? 's' : '' }}
        <span v-if="quartoWarningCount > 0" class="ml-0.5" style="color: rgb(var(--warning, #fbbf24));">
          {{ quartoWarningCount }} warn
        </span>
      </button>

      <button
        ref="exportBtnEl"
        class="h-6 px-2 flex items-center gap-1 rounded text-[11px] hover:bg-[rgb(var(--bg-hover))]"
        style="color: rgb(var(--fg-muted));"
        @click="toggleExportPopover"
        :title="activeTabIsQmd ? 'Export document' : 'Export as Word or PDF'"
      >
        Export
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" class="ml-0.5"><path d="M1.5 3l2.5 2.5L6.5 3z"/></svg>
      </button>
      <ExportPopover
        :visible="exportPopoverOpen"
        :anchorRect="exportPopoverRect"
        :pdfSettings="pdfCurrentSettings"
        :wordSettings="docxCurrentSettings"
        :quartoAvailable="quartoStore.available"
        :quartoSettings="quartoCurrentSettings"
        :quartoTemplates="quartoTemplatesRef"
        :defaultEngine="defaultEngine"
        :fileIsQmd="activeTabIsQmd"
        @close="exportPopoverOpen = false"
        @export="onExportFromPopover"
      />
    </div>

    <!-- Quarto error panel (teleported to body to escape overflow) -->
    <Teleport to="body">
      <div v-if="quartoErrorPanelOpen && quartoAllIssues.length > 0" class="tex-error-panel"
           :style="quartoErrorPanelStyle" @mousedown.stop>
        <div v-for="(issue, i) in quartoAllIssues" :key="i"
             class="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-[rgb(var(--bg-hover))] cursor-pointer"
             @click="issue.line && jumpToLine(issue.line)">
          <span :style="{ color: issue.severity === 'error' ? 'rgb(var(--error, #f87171))' : 'rgb(var(--warning, #fbbf24))' }">
            {{ issue.severity === 'error' ? '✕' : '⚠' }}
          </span>
          <span v-if="issue.line" class="tabular-nums shrink-0" style="color: rgb(var(--fg-muted));">L{{ issue.line }}</span>
          <span class="flex-1 truncate" style="color: rgb(var(--fg-primary));">{{ issue.message }}</span>
          <button v-if="issue.severity === 'error'"
            class="shrink-0 px-1.5 py-0.5 rounded text-[10px] hover:bg-[rgb(var(--bg-tertiary))]"
            style="color: rgb(var(--accent)); border: 1px solid rgb(var(--border));"
            @click.stop="$emit('ask-ai-fix', issue)"
            title="Ask AI to fix">
            Ask AI ▸
          </button>
        </div>
      </div>
    </Teleport>

    <!-- LaTeX actions (for .tex files) -->
    <div v-if="showCompileButtons" class="flex items-center gap-1 px-1.5 shrink-0 border-r relative" style="border-color: rgb(var(--border));">
      <!-- Status indicator -->
      <span v-if="texStatus === 'compiling'" class="flex items-center gap-1 text-[11px]" style="color: rgb(var(--fg-muted));">
        <span class="tex-spinner"></span>
        Compiling…
      </span>
      <span v-else-if="texStatus === 'success'" class="text-[11px]" style="color: rgb(var(--success, #4ade80));">
        ● {{ texDuration }}
      </span>
      <button v-else-if="texStatus === 'error'" ref="errorBadgeEl"
        class="h-6 px-1.5 flex items-center gap-1 rounded text-[11px] hover:bg-[rgb(var(--bg-hover))] cursor-pointer"
        style="color: rgb(var(--error, #f87171));"
        @click="toggleErrorPanel"
      >
        ✕ {{ texErrorCount }} error{{ texErrorCount !== 1 ? 's' : '' }}
        <span v-if="texWarningCount > 0" class="ml-0.5" style="color: rgb(var(--warning, #fbbf24));">
          {{ texWarningCount }} warn
        </span>
      </button>

      <!-- Compile button -->
      <button
        class="h-6 px-2 flex items-center gap-1 rounded text-[11px] hover:bg-[rgb(var(--bg-hover))]"
        style="color: rgb(var(--success, #4ade80));"
        @click="$emit('compile-tex')"
        :disabled="texStatus === 'compiling'"
        title="Compile LaTeX"
      >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4 2l10 6-10 6V2z"/>
        </svg>
        Compile
      </button>

      <!-- Auto-compile toggle -->
      <button
        class="h-6 px-1.5 flex items-center gap-1 rounded text-[11px] hover:bg-[rgb(var(--bg-hover))]"
        :style="{ color: latexStore.autoCompile ? 'rgb(var(--success, #4ade80))' : 'rgb(var(--fg-muted))' }"
        @click="latexStore.autoCompile = !latexStore.autoCompile"
        :title="latexStore.autoCompile ? 'Auto-compile: ON (click to disable)' : 'Auto-compile: OFF (click to enable)'"
      >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M14 8A6 6 0 1 1 8 2" />
          <path d="M8 2v3l2.5-1.5" fill="none" />
        </svg>
        Auto
      </button>

      <!-- Forward sync button -->
      <button
        class="h-6 px-2 flex items-center gap-1 rounded text-[11px] hover:bg-[rgb(var(--bg-hover))]"
        style="color: rgb(var(--accent));"
        @click="$emit('sync-tex')"
        title="Sync to PDF position"
      >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M2 8h12M10 4l4 4-4 4"/>
        </svg>
        Sync
      </button>
    </div>

    <!-- LaTeX error panel (teleported to body to escape overflow) -->
    <Teleport to="body">
      <div v-if="texErrorPanelOpen && texAllIssues.length > 0" class="tex-error-panel"
           :style="texErrorPanelStyle" @mousedown.stop>
        <div v-for="(issue, i) in texAllIssues" :key="i"
             class="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-[rgb(var(--bg-hover))] cursor-pointer"
             @click="jumpToTexLine(issue.line)">
          <span :style="{ color: issue.severity === 'error' ? 'rgb(var(--error, #f87171))' : 'rgb(var(--warning, #fbbf24))' }">
            {{ issue.severity === 'error' ? '✕' : '⚠' }}
          </span>
          <span v-if="issue.line" class="tabular-nums shrink-0" style="color: rgb(var(--fg-muted));">L{{ issue.line }}</span>
          <span class="flex-1 truncate" style="color: rgb(var(--fg-primary));">{{ issue.message }}</span>
          <button v-if="isTectonicMissing(issue)"
            class="shrink-0 px-1.5 py-0.5 rounded text-[10px] hover:bg-[rgb(var(--bg-tertiary))]"
            style="color: rgb(var(--accent)); border: 1px solid rgb(var(--border));"
            @click.stop="openTectonicSettings"
            title="Open Settings to install Tectonic">
            Settings ▸
          </button>
          <button v-else-if="issue.severity === 'error'"
            class="shrink-0 px-1.5 py-0.5 rounded text-[10px] hover:bg-[rgb(var(--bg-tertiary))]"
            style="color: rgb(var(--accent)); border: 1px solid rgb(var(--border));"
            @click.stop="$emit('ask-ai-fix', issue)"
            title="Ask AI to fix">
            Ask AI ▸
          </button>
        </div>
      </div>
    </Teleport>

    <!-- Pane actions -->
    <div class="flex items-center gap-0.5 px-1 shrink-0">
      <!-- Comment margin toggle (for text files) -->
      <button
        v-if="showCommentToggle"
        class="w-6 h-6 flex items-center justify-center rounded hover:bg-[rgb(var(--bg-hover))] relative"
        :style="{ color: commentsStore.isMarginVisible(activeTab) ? 'rgb(var(--accent))' : 'rgb(var(--fg-muted))' }"
        @click="commentsStore.toggleMargin(activeTab)"
        title="Toggle comments"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M3 2.5h10a1.5 1.5 0 011.5 1.5v6a1.5 1.5 0 01-1.5 1.5H9.414l-2.707 2.707a.5.5 0 01-.854-.354V11.5H3A1.5 1.5 0 011.5 10V4A1.5 1.5 0 013 2.5z"/>
        </svg>
        <span
          v-if="commentBadgeCount > 0"
          class="absolute -top-0.5 -right-0.5 min-w-[12px] h-3 flex items-center justify-center rounded-full text-white"
          style="font-size: 8px; font-weight: 600; background: rgb(var(--accent)); padding: 0 2px;"
        >
          {{ commentBadgeCount > 9 ? '9+' : commentBadgeCount }}
        </span>
      </button>
      <button
        class="w-6 h-6 flex items-center justify-center rounded hover:bg-[rgb(var(--bg-hover))]"
        style="color: rgb(var(--fg-muted));"
        @click="$emit('split-vertical')"
        :title="`Split vertically (${modKey} + J)`"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="1" y="2" width="14" height="12" rx="1.5"/>
          <line x1="8" y1="2" x2="8" y2="14"/>
        </svg>
      </button>
      <button
        class="w-6 h-6 flex items-center justify-center rounded hover:bg-[rgb(var(--bg-hover))]"
        style="color: rgb(var(--fg-muted));"
        @click="$emit('split-horizontal')"
        title="Split horizontally"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="1" y="2" width="14" height="12" rx="1.5"/>
          <line x1="1" y1="8" x2="15" y2="8"/>
        </svg>
      </button>
      <button
        class="w-6 h-6 flex items-center justify-center rounded hover:bg-[rgb(var(--bg-hover))]"
        style="color: rgb(var(--fg-muted));"
        @click="$emit('close-pane')"
        title="Close pane"
      >
        <svg width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M2 2l6 6M8 2l-6 6"/>
        </svg>
      </button>
      <!-- Right sidebar toggle (only when R closed AND context bar not visible) -->
      <button
        v-if="!workspace.rightSidebarOpen && workspace.leftSidebarOpen"
        class="w-6 h-6 flex items-center justify-center rounded text-content-muted hover:text-content hover:bg-surface-hover"
        @click="workspace.toggleRightSidebar()"
        title="Open AI sidebar (⌘J)"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/></svg>
      </button>
    </div>

    <!-- Ghost tab (teleported to body during drag) -->
    <Teleport to="body">
      <div v-if="ghostVisible" class="tab-ghost" :style="{ left: ghostX + 'px', top: ghostY + 'px' }">
        {{ ghostLabel }}
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useEditorStore } from '../../stores/editor'
import { useReferencesStore } from '../../stores/references'
import { useLatexStore } from '../../stores/latex'
import { useWorkspaceStore } from '../../stores/workspace'
import { useTypstStore } from '../../stores/typst'
import { isReferencePath, referenceKeyFromPath, isRunnable, isRmdOrQmd, isLatex, isMarkdown, isHtml, isHtmlPreviewTab, getHtmlPreviewPath, isChatTab, getChatSessionId, isNewTab, isWorkflowTab, getWorkflowId, getViewerType } from '../../utils/fileTypes'
import { useWorkflowsStore } from '../../stores/workflows'
import { useCommentsStore } from '../../stores/comments'
import { useChatStore } from '../../stores/chat'
import ExportPopover from './ExportPopover.vue'
import { useDocxExportStore } from '../../stores/docxExport'
import { useQuartoStore } from '../../stores/quarto'
import { modKey } from '../../platform'

const props = defineProps({
  tabs: { type: Array, required: true },
  activeTab: { type: String, default: null },
  paneId: { type: String, default: '' },
})

const emit = defineEmits(['select-tab', 'close-tab', 'split-vertical', 'split-horizontal', 'close-pane', 'run-code', 'run-file', 'render-document', 'compile-tex', 'sync-tex', 'ask-ai-fix', 'export-pdf', 'export-docx', 'export-quarto', 'preview-html', 'new-tab'])

const workspace = useWorkspaceStore()
const typstStore = useTypstStore()
const docxExportStore = useDocxExportStore()
const quartoStore = useQuartoStore()
const chatStore = useChatStore()
const commentsStore = useCommentsStore()

// Comment margin toggle
const showCommentToggle = computed(() => {
  if (!props.activeTab) return false
  return getViewerType(props.activeTab) === 'text'
})

const commentBadgeCount = computed(() => {
  if (!props.activeTab) return 0
  return commentsStore.unresolvedCount(props.activeTab)
})

// Export popover
const exportPopoverOpen = ref(false)
const exportBtnEl = ref(null)
const exportPopoverRect = ref(null)

const pdfCurrentSettings = computed(() =>
  props.activeTab ? typstStore.getSettings(props.activeTab) : {}
)
const docxCurrentSettings = computed(() =>
  props.activeTab ? docxExportStore.getSettings(props.activeTab) : {}
)
const quartoCurrentSettings = computed(() =>
  props.activeTab ? quartoStore.getSettings(props.activeTab) : {}
)
const quartoTemplatesRef = ref([])
// Load templates when popover opens
watch(exportPopoverOpen, async (open) => {
  if (open && quartoStore.available) {
    quartoTemplatesRef.value = await quartoStore.listTemplates()
  }
})
// Default engine: .qmd → quarto, else → shoulders
const defaultEngine = computed(() => {
  if (!props.activeTab) return 'shoulders'
  const ext = (props.activeTab.split('/').pop() || '').split('.').pop()?.toLowerCase()
  return ext === 'qmd' ? 'quarto' : 'shoulders'
})

function toggleExportPopover() {
  if (exportPopoverOpen.value) {
    exportPopoverOpen.value = false
    return
  }
  if (exportBtnEl.value) {
    exportPopoverRect.value = exportBtnEl.value.getBoundingClientRect()
  }
  exportPopoverOpen.value = true
}

function onExportFromPopover(payload) {
  const { format, engine, ...settings } = payload
  if (props.activeTab) {
    if (engine === 'quarto') {
      quartoStore.setSettings(props.activeTab, { format, ...settings })
    } else if (format === 'pdf') {
      typstStore.setSettings(props.activeTab, settings)
    } else {
      docxExportStore.setSettings(props.activeTab, settings)
    }
  }
  exportPopoverOpen.value = false
  if (engine === 'quarto') {
    emit('export-quarto', { format, ...settings })
  } else {
    emit(format === 'pdf' ? 'export-pdf' : 'export-docx', settings)
  }
}

const activeTabIsQmd = computed(() => props.activeTab ? isRmdOrQmd(props.activeTab) : false)
const showRunButtons = computed(() => props.activeTab && isRunnable(props.activeTab))
const showPreviewButton = computed(() => props.activeTab && isHtml(props.activeTab))
const showMarkdownButtons = computed(() => props.activeTab && isMarkdown(props.activeTab))

// LaTeX compile buttons
const latexStore = useLatexStore()
const showCompileButtons = computed(() => props.activeTab && isLatex(props.activeTab))
const texState = computed(() => props.activeTab ? latexStore.stateForFile(props.activeTab) : null)
const texStatus = computed(() => texState.value?.status || null)
const texErrors = computed(() => texState.value?.errors || [])
const texWarnings = computed(() => texState.value?.warnings || [])
const texErrorCount = computed(() => texErrors.value.length)
const texWarningCount = computed(() => texWarnings.value.length)
const texAllIssues = computed(() => [...texErrors.value, ...texWarnings.value])
const texDuration = computed(() => {
  const ms = texState.value?.durationMs
  if (!ms) return 'Compiled'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
})

// Error panel dropdown
const texErrorPanelOpen = ref(false)
const errorBadgeEl = ref(null)
const texErrorPanelStyle = computed(() => {
  if (!errorBadgeEl.value) return { display: 'none' }
  const rect = errorBadgeEl.value.getBoundingClientRect()
  return {
    position: 'fixed',
    top: (rect.bottom + 4) + 'px',
    left: Math.max(4, rect.left - 100) + 'px',
    zIndex: 9999,
  }
})

function toggleErrorPanel() {
  texErrorPanelOpen.value = !texErrorPanelOpen.value
}

function jumpToTexLine(line) {
  if (!line) return
  window.dispatchEvent(new CustomEvent('latex-backward-sync', {
    detail: { file: props.activeTab, line },
  }))
  texErrorPanelOpen.value = false
}

function isTectonicMissing(issue) {
  if (!issue || issue.severity !== 'error') return false
  const msg = String(issue.message || '').toLowerCase()
  return msg.includes('tectonic not found') || msg.includes('tectonic is disabled')
}

function openTectonicSettings() {
  texErrorPanelOpen.value = false
  workspace.openSettings('system')
}

// Auto-open error panel when compile fails
watch(texStatus, (status, prev) => {
  if (status === 'error' && prev !== 'error') {
    texErrorPanelOpen.value = true
  } else if (status === 'success') {
    texErrorPanelOpen.value = false
  }
})

// ── Quarto status & error panel ──────────────────────────────
const quartoResult = computed(() => props.activeTab ? quartoStore.lastResult[props.activeTab] : null)
const quartoStatus = computed(() => props.activeTab ? quartoStore.rendering[props.activeTab] || null : null)
const quartoErrors = computed(() => quartoResult.value?.errors || [])
const quartoWarnings = computed(() => quartoResult.value?.warnings || [])
const quartoErrorCount = computed(() => quartoErrors.value.length)
const quartoWarningCount = computed(() => quartoWarnings.value.length)
const quartoAllIssues = computed(() => [...quartoErrors.value, ...quartoWarnings.value])
const quartoDuration = computed(() => {
  const ms = quartoResult.value?.duration_ms
  if (!ms) return 'Rendered'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
})

const quartoErrorPanelOpen = ref(false)
const quartoErrorBadgeEl = ref(null)
const quartoErrorPanelStyle = computed(() => {
  if (!quartoErrorBadgeEl.value) return { display: 'none' }
  const rect = quartoErrorBadgeEl.value.getBoundingClientRect()
  return {
    position: 'fixed',
    top: (rect.bottom + 4) + 'px',
    left: Math.max(4, rect.left - 100) + 'px',
    zIndex: 9999,
  }
})

function jumpToLine(line) {
  if (!line || !props.activeTab) return
  window.dispatchEvent(new CustomEvent('editor-goto-line', {
    detail: { file: props.activeTab, line },
  }))
}

// Auto-open quarto error panel on failure, close on success
watch(quartoStatus, (status, prev) => {
  if (status === 'error' && prev !== 'error') {
    quartoErrorPanelOpen.value = true
  } else if (status === 'done') {
    quartoErrorPanelOpen.value = false
  }
})

// Close error panel on outside click
function onDocClick(e) {
  if (texErrorPanelOpen.value && errorBadgeEl.value && !errorBadgeEl.value.contains(e.target)) {
    const panel = document.querySelector('.tex-error-panel')
    if (panel && !panel.contains(e.target)) {
      texErrorPanelOpen.value = false
    }
  }
}
onMounted(() => document.addEventListener('mousedown', onDocClick))
onUnmounted(() => document.removeEventListener('mousedown', onDocClick))

const editorStore = useEditorStore()
const referencesStore = useReferencesStore()
const workflowsStore = useWorkflowsStore()
const dirtyFiles = editorStore.dirtyFiles

const tabsContainer = ref(null)
const tabEls = reactive({})

function scrollActiveTabIntoView() {
  const idx = props.tabs.indexOf(props.activeTab)
  if (idx === -1) return
  const el = tabEls[idx]
  if (!el) return
  el.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' })
}

watch(() => props.activeTab, (tab) => {
  if (!tab) return
  nextTick(scrollActiveTabIntoView)
})
const dragIdx = ref(-1)
const dragOverIdx = ref(-1)
const dropIndicatorLeft = ref(null)

// Ghost tab state
const ghostVisible = ref(false)
const ghostX = ref(0)
const ghostY = ref(0)
const ghostLabel = ref('')

function fileName(path) {
  if (isNewTab(path)) return 'New Tab'
  if (isHtmlPreviewTab(path)) {
    const fp = getHtmlPreviewPath(path)
    return (fp?.split('/').pop() || 'Preview') + ' (Preview)'
  }
  if (isReferencePath(path)) {
    const key = referenceKeyFromPath(path)
    const r = referencesStore.getByKey(key)
    if (r?.title) {
      return r.title.length > 30 ? r.title.slice(0, 28) + '...' : r.title
    }
    return `@${key}`
  }
  return path?.split('/').pop() || 'Untitled'
}

// Mouse-based drag reorder with ghost tab + cross-pane support
let mouseDownStart = null
let isDragging = false
let crossPaneTarget = null      // { paneId, tabBarEl }
let crossPaneInsertIdx = -1
let remoteIndicatorEl = null     // injected drop indicator in remote TabBar
let dragStartPaneId = null       // capture at drag start (pane may be destroyed)

function cleanupRemoteIndicator() {
  if (remoteIndicatorEl && remoteIndicatorEl.parentNode) {
    remoteIndicatorEl.parentNode.removeChild(remoteIndicatorEl)
  }
  remoteIndicatorEl = null
}

/**
 * Find which pane's TabBar (or empty EditorPane) the cursor is over.
 * Returns { paneId, tabBarEl, isEmptyPane } or null.
 */
function findTargetPane(clientX, clientY) {
  // Check all TabBars
  const tabBars = document.querySelectorAll('[data-tab-bar]')
  for (const bar of tabBars) {
    const rect = bar.getBoundingClientRect()
    if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
      return { paneId: bar.dataset.paneId, tabBarEl: bar, isEmptyPane: false }
    }
  }
  // Fallback: check EditorPane data-pane-id elements (for empty panes without TabBar)
  const panes = document.querySelectorAll('[data-pane-id]')
  for (const pane of panes) {
    if (pane.hasAttribute('data-tab-bar')) continue // already checked
    const rect = pane.getBoundingClientRect()
    if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
      return { paneId: pane.dataset.paneId, tabBarEl: null, isEmptyPane: true }
    }
  }
  return null
}

/**
 * Calculate insert index for a remote TabBar based on cursor X position.
 * Also positions the remote drop indicator.
 */
function updateRemoteDropIndicator(tabBarEl, mouseX) {
  const tabsArea = tabBarEl.querySelector('[data-tabs-area]')
  if (!tabsArea) return 0

  const remoteTabs = tabsArea.querySelectorAll('[data-tab-el]')
  const containerRect = tabsArea.getBoundingClientRect()

  let bestIdx = 0
  let bestDist = Infinity
  let bestEdgeX = containerRect.left

  for (let i = 0; i <= remoteTabs.length; i++) {
    let edgeX
    if (i === 0) {
      edgeX = remoteTabs[0]?.getBoundingClientRect().left ?? containerRect.left
    } else {
      edgeX = remoteTabs[i - 1]?.getBoundingClientRect().right ?? containerRect.left
    }
    const dist = Math.abs(mouseX - edgeX)
    if (dist < bestDist) {
      bestDist = dist
      bestIdx = i
      bestEdgeX = edgeX
    }
  }

  // Create or reposition remote indicator
  if (!remoteIndicatorEl) {
    remoteIndicatorEl = document.createElement('div')
    remoteIndicatorEl.className = 'tab-drop-indicator'
    remoteIndicatorEl.style.position = 'absolute'
    remoteIndicatorEl.style.zIndex = '100'
  }
  if (remoteIndicatorEl.parentNode !== tabsArea) {
    cleanupRemoteIndicator()
    remoteIndicatorEl = document.createElement('div')
    remoteIndicatorEl.className = 'tab-drop-indicator'
    remoteIndicatorEl.style.position = 'absolute'
    remoteIndicatorEl.style.zIndex = '100'
    tabsArea.appendChild(remoteIndicatorEl)
  }
  remoteIndicatorEl.style.left = (bestEdgeX - containerRect.left - 1) + 'px'

  return bestIdx
}

function onMouseDown(idx, e) {
  if (e.button !== 0) return
  mouseDownStart = { idx, x: e.clientX, y: e.clientY }
  isDragging = false
  dragStartPaneId = props.paneId

  function onEscapeKey(ev) {
    if (ev.key === 'Escape') cancelDrag()
  }

  function cancelDrag() {
    dragIdx.value = -1
    dragOverIdx.value = -1
    dropIndicatorLeft.value = null
    ghostVisible.value = false
    mouseDownStart = null
    isDragging = false
    crossPaneTarget = null
    crossPaneInsertIdx = -1
    dragStartPaneId = null
    cleanupRemoteIndicator()
    document.body.classList.remove('tab-dragging')
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    document.removeEventListener('keydown', onEscapeKey)
  }

  function onMouseMove(ev) {
    if (!mouseDownStart) return
    const dx = Math.abs(ev.clientX - mouseDownStart.x)
    const dy = Math.abs(ev.clientY - mouseDownStart.y)
    if ((dx > 5 || dy > 5) && !isDragging) {
      isDragging = true
      dragIdx.value = mouseDownStart.idx
      ghostLabel.value = fileName(props.tabs[mouseDownStart.idx])
      ghostVisible.value = true
      document.body.classList.add('tab-dragging')
      document.addEventListener('keydown', onEscapeKey)
    }
    if (isDragging) {
      ghostX.value = ev.clientX
      ghostY.value = ev.clientY

      // Check if cursor is over a different pane
      const target = findTargetPane(ev.clientX, ev.clientY)

      if (target && target.paneId !== dragStartPaneId) {
        // Cross-pane: show indicator in remote TabBar
        crossPaneTarget = target
        dropIndicatorLeft.value = null // hide local indicator

        if (target.isEmptyPane) {
          crossPaneInsertIdx = 0
          cleanupRemoteIndicator()
        } else {
          crossPaneInsertIdx = updateRemoteDropIndicator(target.tabBarEl, ev.clientX)
        }
      } else {
        // Same pane or no target: revert to local indicator
        crossPaneTarget = null
        crossPaneInsertIdx = -1
        cleanupRemoteIndicator()
        updateDropIndicator(ev.clientX)
      }
    }
  }

  function onMouseUp() {
    document.removeEventListener('keydown', onEscapeKey)

    if (isDragging && dragIdx.value !== -1) {
      const tabPath = props.tabs[dragIdx.value]
      const originPaneId = dragStartPaneId

      if (crossPaneTarget && crossPaneTarget.paneId !== originPaneId) {
        // Cross-pane move
        editorStore.moveTabToPane(originPaneId, tabPath, crossPaneTarget.paneId, crossPaneInsertIdx >= 0 ? crossPaneInsertIdx : 0)
      } else if (dragOverIdx.value !== -1 && dragIdx.value !== dragOverIdx.value) {
        // Same-pane reorder
        editorStore.reorderTabs(originPaneId, dragIdx.value, dragOverIdx.value)
      }
    } else if (!isDragging && mouseDownStart) {
      emit('select-tab', props.tabs[mouseDownStart.idx])
    }

    dragIdx.value = -1
    dragOverIdx.value = -1
    dropIndicatorLeft.value = null
    ghostVisible.value = false
    mouseDownStart = null
    isDragging = false
    crossPaneTarget = null
    crossPaneInsertIdx = -1
    dragStartPaneId = null
    cleanupRemoteIndicator()
    document.body.classList.remove('tab-dragging')
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

function onMouseEnter(idx) {
  if (isDragging && dragIdx.value !== -1 && dragIdx.value !== idx) {
    dragOverIdx.value = idx
  }
}

function updateDropIndicator(mouseX) {
  if (!tabsContainer.value) return
  const containerRect = tabsContainer.value.getBoundingClientRect()

  // Find which tab gap the mouse is closest to
  let bestIdx = -1
  let bestDist = Infinity

  for (let i = 0; i <= props.tabs.length; i++) {
    let edgeX
    if (i === 0) {
      const el = tabEls[0]
      if (!el) continue
      edgeX = el.getBoundingClientRect().left
    } else {
      const el = tabEls[i - 1]
      if (!el) continue
      edgeX = el.getBoundingClientRect().right
    }
    const dist = Math.abs(mouseX - edgeX)
    if (dist < bestDist) {
      bestDist = dist
      bestIdx = i
    }
  }

  if (bestIdx !== -1 && bestIdx !== dragIdx.value && bestIdx !== dragIdx.value + 1) {
    // Calculate position relative to container
    let edgeX
    if (bestIdx === 0) {
      edgeX = tabEls[0]?.getBoundingClientRect().left || 0
    } else {
      edgeX = tabEls[bestIdx - 1]?.getBoundingClientRect().right || 0
    }
    dropIndicatorLeft.value = edgeX - containerRect.left - 1
    dragOverIdx.value = bestIdx > dragIdx.value ? bestIdx - 1 : bestIdx
  } else {
    dropIndicatorLeft.value = null
    dragOverIdx.value = -1
  }
}
</script>

<style scoped>
.chat-streaming-dot {
  background: rgb(var(--accent));
  animation: chat-pulse 1.5s ease-in-out infinite;
}
@keyframes chat-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
.tex-spinner {
  display: inline-block;
  width: 10px;
  height: 10px;
  border: 1.5px solid rgb(var(--fg-muted));
  border-top-color: rgb(var(--accent));
  border-radius: 50%;
  animation: tex-spin 0.8s linear infinite;
}
@keyframes tex-spin {
  to { transform: rotate(360deg); }
}
</style>

<style>
.tex-error-panel {
  background: rgb(var(--bg-secondary));
  border: 1px solid rgb(var(--border));
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  max-height: 240px;
  min-width: 320px;
  max-width: 520px;
  overflow-y: auto;
  padding: 4px 0;
}
</style>
