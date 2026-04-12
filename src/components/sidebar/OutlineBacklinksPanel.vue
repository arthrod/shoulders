<template>
  <div class="flex flex-col h-full" style="background: rgb(var(--bg-secondary));">
    <!-- Header -->
    <div
      class="flex items-center gap-1 px-3 h-7 shrink-0 cursor-pointer select-none"
      @click="$emit('toggle-collapse')"
    >
      <svg
        :class="collapsed ? '-rotate-90' : ''"
        class="shrink-0 transition-transform duration-100"
        width="10" height="10" viewBox="0 0 10 10" fill="none"
        stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
      >
        <path d="M3 2l4 3-4 3"/>
      </svg>
      <span class="text-[11px] font-medium uppercase tracking-wider" style="color: rgb(var(--fg-muted));">
        Outline
      </span>
    </div>

    <!-- Content (when expanded) -->
    <template v-if="!collapsed">
      <!-- Outline headings -->
      <div v-if="!hasOutlineSupport" class="px-3 py-2 ui-text-sm" style="color: rgb(var(--fg-muted));">
        Open a document to see its outline.
      </div>
      <div v-else-if="headings.length === 0" class="px-3 py-2 ui-text-sm" style="color: rgb(var(--fg-muted));">
        No headings
      </div>
      <div v-else class="overflow-y-auto" style="max-height: 50%;">
        <div
          v-for="(h, i) in headings"
          :key="'h-' + i"
          class="flex items-center py-0.5 px-2 cursor-pointer select-none rounded-sm hover:bg-[rgb(var(--bg-hover))]"
          :class="{ 'bg-[rgb(var(--bg-hover))]': i === activeHeadingIndex }"
          :style="{
            paddingLeft: (h.level - 1) * 12 + 8 + 'px',
            color: i === activeHeadingIndex ? 'rgb(var(--fg-primary))' : 'rgb(var(--fg-secondary))',
            fontSize: 'var(--ui-font-size)',
          }"
          @click="navigateToHeading(h)"
        >
          <span class="truncate">{{ h.text }}</span>
        </div>
      </div>

      <!-- Backlinks section -->
      <template v-if="backlinks.length > 0">
        <div class="flex items-center px-3 pt-3 pb-1 gap-2">
          <span class="text-[11px] font-medium uppercase tracking-wider" style="color: rgb(var(--fg-muted));">
            Backlinks ({{ backlinks.length }})
          </span>
          <div class="flex-1 h-px" style="background: rgb(var(--border));" />
        </div>
        <div class="overflow-y-auto flex-1">
          <div
            v-for="(link, idx) in backlinks"
            :key="'bl-' + idx"
            class="px-3 py-1.5 cursor-pointer hover:bg-[rgb(var(--bg-hover))]"
            @click="editorStore.openFile(link.sourcePath)"
          >
            <div class="flex items-center gap-1.5 ui-text-base">
              <span class="font-medium" style="color: rgb(var(--accent));">{{ link.sourceName }}</span>
              <span class="ui-text-sm" style="color: rgb(var(--fg-muted));">:{{ link.lineNumber }}</span>
            </div>
            <div class="mt-0.5 ui-text-sm truncate" style="color: rgb(var(--fg-muted));">
              {{ link.context }}
            </div>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup>
import { computed, watch, ref } from 'vue'
import { useEditorStore } from '../../stores/editor'
import { useFilesStore } from '../../stores/files'
import { useLinksStore } from '../../stores/links'

defineProps({
  collapsed: { type: Boolean, default: false },
})

defineEmits(['toggle-collapse'])

const editorStore = useEditorStore()
const filesStore = useFilesStore()
const linksStore = useLinksStore()

// Active file for outline/backlinks
const activeFile = computed(() => editorStore.activeTab)

// Outline support
const hasOutlineSupport = computed(() => {
  const f = activeFile.value
  if (!f) return false
  return f.endsWith('.md') || f.endsWith('.tex') || f.endsWith('.docx') || f.endsWith('.ipynb')
})

// Headings
const headings = computed(() => {
  const f = activeFile.value
  if (!f) return []

  // Markdown: from links store (structured headings) or parse from content
  if (f.endsWith('.md')) {
    const structured = linksStore.structuredHeadingsForFile?.(f)
    if (structured?.length) return structured
    const content = filesStore.fileContents[f]
    if (!content) return []
    return parseMarkdownHeadings(content)
  }

  // LaTeX
  if (f.endsWith('.tex')) {
    const content = filesStore.fileContents[f]
    if (!content) return []
    return parseLatexHeadings(content)
  }

  // Notebooks
  if (f.endsWith('.ipynb')) {
    const content = filesStore.fileContents[f]
    if (!content) return []
    return parseNotebookHeadings(content)
  }

  // DOCX — uses ProseMirror state, not implemented here (would need superdoc access)
  return []
})

// Active heading tracking
const activeHeadingIndex = ref(-1)

watch(() => editorStore.cursorOffset, (offset) => {
  if (!headings.value.length) { activeHeadingIndex.value = -1; return }
  let idx = -1
  for (let i = 0; i < headings.value.length; i++) {
    if (headings.value[i].from !== undefined && headings.value[i].from <= offset) idx = i
  }
  activeHeadingIndex.value = idx
})

// Backlinks
const backlinks = computed(() => {
  if (!activeFile.value) return []
  return linksStore.backlinksForFile(activeFile.value)
})

// Navigation
function navigateToHeading(h) {
  const f = activeFile.value
  if (!f || h.from === undefined) return
  const view = editorStore.getEditorView(editorStore.activePaneId, f)
  if (!view) return
  view.dispatch({
    selection: { anchor: h.from },
    scrollIntoView: true,
  })
}

// Heading parsers (simplified — same logic as OutlinePanel)
function parseMarkdownHeadings(content) {
  const lines = content.split('\n')
  const headings = []
  let offset = 0
  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)/)
    if (match) {
      headings.push({ level: match[1].length, text: match[2].trim(), from: offset })
    }
    offset += line.length + 1
  }
  return headings
}

function parseLatexHeadings(content) {
  const levels = { chapter: 1, section: 2, subsection: 3, subsubsection: 4 }
  const headings = []
  const regex = /\\(chapter|section|subsection|subsubsection)\{([^}]+)\}/g
  let match
  while ((match = regex.exec(content))) {
    headings.push({ level: levels[match[1]], text: match[2], from: match.index })
  }
  return headings
}

function parseNotebookHeadings(content) {
  try {
    const nb = JSON.parse(content)
    const headings = []
    for (const cell of nb.cells || []) {
      if (cell.cell_type !== 'markdown') continue
      const src = Array.isArray(cell.source) ? cell.source.join('') : cell.source
      for (const line of src.split('\n')) {
        const match = line.match(/^(#{1,6})\s+(.+)/)
        if (match) headings.push({ level: match[1].length, text: match[2].trim() })
      }
    }
    return headings
  } catch { return [] }
}
</script>
