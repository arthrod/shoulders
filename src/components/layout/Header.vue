<template>
  <header class="grid items-center select-none shrink-0 relative"
    data-tauri-drag-region
    :style="{
      gridTemplateColumns: '1fr auto 1fr',
      background: 'rgb(var(--bg-secondary))',
      borderBottom: '1px solid rgb(var(--border))',
      paddingLeft: isMac ? '78px' : '12px',
      paddingRight: '8px',
      height: '38px',
    }"
  >
    <!-- Left: project switcher -->
    <div class="flex items-center" data-tauri-drag-region>
      <button
        ref="switcherBtnRef"
        class="flex items-center gap-2 max-w-[220px] px-2 py-1 rounded-md border-none cursor-pointer ml-1.5"
        :class="switcherOpen ? 'bg-surface-hover' : 'bg-transparent hover:bg-surface-hover'"
        @click="toggleSwitcher"
      >
        <IconFolder :size="16" :stroke-width="1.5" class="shrink-0 text-content-muted" />
        <span
          class="font-medium truncate"
          style="font-size: 12px;"
          :class="workspace.isOpen ? 'text-content-secondary' : 'text-content-muted'"
        >
          {{ workspace.isOpen ? projectName : 'Open Project' }}
        </span>
        <svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor" class="shrink-0 text-content-muted">
          <path d="M1 3l4 4 4-4z"/>
        </svg>
      </button>
    </div>

    <WorkspaceSwitcher
      :open="switcherOpen"
      :trigger-el="switcherBtnRef"
      @close="switcherOpen = false"
      @open-folder="doOpenFolder"
      @open-workspace="doOpenWorkspace"
      @open-settings="doSettings"
      @clone="doClone"
    />

    <!-- Center: search input -->
    <div class="relative">
      <div class="flex items-center rounded-md"
        :style="{
          background: 'rgb(var(--bg-primary))',
          border: '1px solid ' + (searchFocused ? 'rgb(var(--fg-muted))' : 'rgb(var(--border))'),
          width: '320px',
          height: '26px',
          transition: 'border-color 150ms',
        }"
      >
        <IconSearch :size="13" :stroke-width="1.5"
          class="shrink-0 ml-2"
          :style="{ color: searchFocused ? 'rgb(var(--fg-secondary))' : 'rgb(var(--fg-muted))' }" />
        <input
          ref="searchInputRef"
          v-model="query"
          class="flex-1 bg-transparent border-none outline-none px-2"
          :style="{
            color: 'rgb(var(--fg-primary))',
            fontSize: '12px',
            fontFamily: 'inherit',
            height: '24px',
          }"
          :placeholder="searchPlaceholder"
          autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
          @focus="onFocus"
          @blur="onBlur"
          @keydown="onSearchKeydown"
        />
        <kbd v-if="!searchFocused && !query"
          class="mr-2 shrink-0"
          style="font-size: 9px; padding: 0px 4px; line-height: 16px;">
          {{ modKey }}+P
        </kbd>
      </div>

      <!-- Search results dropdown -->
      <SearchResults
        v-if="showResults"
        ref="searchResultsRef"
        :query="query"
        @select-file="onSelectFile"
        @select-citation="onSelectCitation"
        @select-chat="onSelectChat"
        @mousedown.prevent
      />
    </div>

    <!-- Right: sidebar toggles + settings -->
    <div class="flex items-center gap-0.5 justify-self-end" data-tauri-drag-region>
      <button
        class="w-7 h-7 flex items-center justify-center rounded-md border-none bg-transparent cursor-pointer transition-colors"
        :style="{ color: workspace.leftSidebarOpen ? 'rgb(var(--fg-primary))' : 'rgb(var(--fg-muted))' }"
        @click="workspace.toggleLeftSidebar()"
        :title="`Toggle sidebar (${modKey}+B)`"
        @mouseover="$event.currentTarget.style.background='rgb(var(--bg-hover))'"
        @mouseout="$event.currentTarget.style.background='transparent'"
      >
        <component
          :is="workspace.leftSidebarOpen ? IconLayoutSidebarFilled : IconLayoutSidebar"
          :size="16" :stroke-width="1.5"
        />
      </button>
      <button
        class="w-7 h-7 flex items-center justify-center rounded-md border-none bg-transparent cursor-pointer transition-colors"
        :style="{ color: workspace.rightSidebarOpen ? 'rgb(var(--fg-primary))' : 'rgb(var(--fg-muted))' }"
        @click="workspace.toggleRightSidebar()"
        :title="`Toggle right panel (${modKey}+J)`"
        @mouseover="$event.currentTarget.style.background='rgb(var(--bg-hover))'"
        @mouseout="$event.currentTarget.style.background='transparent'"
      >
        <component
          :is="workspace.rightSidebarOpen ? IconLayoutSidebarRightFilled : IconLayoutSidebarRight"
          :size="16" :stroke-width="1.5"
        />
      </button>
      <button
        class="w-7 h-7 flex items-center justify-center rounded-md border-none bg-transparent cursor-pointer transition-colors"
        :style="{ color: workspace.bottomPanelOpen ? 'rgb(var(--fg-primary))' : 'rgb(var(--fg-muted))' }"
        @click="workspace.toggleBottomPanel()"
        :title="`Toggle terminal (${modKey}+\`)`"
        @mouseover="$event.currentTarget.style.background='rgb(var(--bg-hover))'"
        @mouseout="$event.currentTarget.style.background='transparent'"
      >
        <IconTerminal2 :size="16" :stroke-width="1.5" />
      </button>
      <button
        class="w-7 h-7 flex items-center justify-center rounded-md border-none bg-transparent cursor-pointer transition-colors"
        style="color: rgb(var(--fg-muted));"
        @click="$emit('open-settings')"
        :title="`Settings (${modKey}+,)`"
        @mouseover="$event.currentTarget.style.background='rgb(var(--bg-hover))';$event.currentTarget.style.color='rgb(var(--fg-primary))'"
        @mouseout="$event.currentTarget.style.background='transparent';$event.currentTarget.style.color='rgb(var(--fg-muted))'"
      >
        <IconSettings :size="16" :stroke-width="1.5" />
      </button>
    </div>
  </header>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { useEditorStore } from '../../stores/editor'
import { useAISidebarStore } from '../../stores/aiSidebar'
import {
  IconLayoutSidebar, IconLayoutSidebarFilled,
  IconLayoutSidebarRight, IconLayoutSidebarRightFilled,
  IconSettings, IconSearch, IconFolder, IconTerminal2,
} from '@tabler/icons-vue'
import { isMac, modKey } from '../../platform'

import SearchResults from '../SearchResults.vue'
import WorkspaceSwitcher from './WorkspaceSwitcher.vue'

const emit = defineEmits(['open-settings', 'open-folder', 'open-workspace', 'clone-repository'])

const workspace = useWorkspaceStore()
const editorStore = useEditorStore()

// Project switcher
const switcherBtnRef = ref(null)
const switcherOpen = ref(false)
const projectName = computed(() => workspace.path?.split('/').pop() || '')

function toggleSwitcher() { switcherOpen.value = !switcherOpen.value }
function doOpenFolder() { switcherOpen.value = false; emit('open-folder') }
function doOpenWorkspace(path) { switcherOpen.value = false; emit('open-workspace', path) }
function doSettings() { switcherOpen.value = false; emit('open-settings') }
function doClone() { switcherOpen.value = false; emit('clone-repository') }

// Search
const searchInputRef = ref(null)
const searchResultsRef = ref(null)
const query = ref('')
const searchFocused = ref(false)

const showResults = computed(() => searchFocused.value || query.value.length > 0)

const searchPlaceholder = computed(() => 'Go to file...')

function onFocus() {
  searchFocused.value = true
}

function onBlur() {
  // Small delay so click events on results can fire before we close
  setTimeout(() => {
    searchFocused.value = false
    // If no query, results will hide via showResults computed
  }, 150)
}

function onSearchKeydown(e) {
  if (e.key === 'Escape') {
    query.value = ''
    searchInputRef.value?.blur()
    e.preventDefault()
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    searchResultsRef.value?.moveSelection(1)
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    searchResultsRef.value?.moveSelection(-1)
    return
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    searchResultsRef.value?.confirmSelection()
    return
  }
}

function onSelectFile(path) {
  editorStore.openFile(path)
  query.value = ''
  searchInputRef.value?.blur()
}

function onSelectCitation(key) {
  const pane = editorStore.activePane
  if (pane?.activeTab) {
    const view = editorStore.getEditorView(pane.id, pane.activeTab)
    if (view) {
      const cite = `[@${key}]`
      const pos = view.state.selection.main.head
      view.dispatch({
        changes: { from: pos, to: pos, insert: cite },
        selection: { anchor: pos + cite.length },
      })
      view.focus()
    }
  }
  query.value = ''
  searchInputRef.value?.blur()
}

function onSelectChat(sessionId) {
  const aiSidebar = useAISidebarStore()
  aiSidebar.focusSidebarChat(sessionId)
  query.value = ''
  searchInputRef.value?.blur()
}

function focusSearch() {
  searchInputRef.value?.focus()
  nextTick(() => {
    searchInputRef.value?.select()
  })
}

defineExpose({ focusSearch })
</script>
