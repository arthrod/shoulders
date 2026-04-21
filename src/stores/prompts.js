import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { nanoid } from './utils'
import { useWorkspaceStore } from './workspace'
import { useChatStore } from './chat'
import { useAISidebarStore } from './aiSidebar'

const DEFAULT_PROMPTS = [
  {
    id: 'default-proofread',
    title: 'Proofread this document',
    body: 'Proofread this document for clarity, grammar, and academic tone. Flag awkward phrasing and suggest specific alternatives.',
  },
  {
    id: 'default-critique',
    title: 'Critique the arguments',
    body: 'Identify logical gaps, unsupported claims, circular reasoning, or missing evidence. Be specific about which claims need strengthening.',
  },
  {
    id: 'default-summarise',
    title: 'Summarise this document',
    body: 'Summarise the key arguments, methods, and contributions in 200-300 words. Suitable for an abstract or executive summary.',
  },
  {
    id: 'default-related',
    title: 'Find related work',
    body: 'Search for recent papers related to the current document or selection. Focus on the last 3 years. Include seminal older works if foundational.',
  },
  {
    id: 'default-tighten',
    title: 'Tighten prose',
    body: 'Rewrite the selected text to be 30% shorter without losing meaning or nuance.',
  },
  {
    id: 'default-explain',
    title: 'Explain this code',
    body: 'Explain what this code does, why it\'s structured this way, and any potential issues.',
  },
]

export const usePromptsStore = defineStore('prompts', () => {
  const userPrompts = ref([])
  const editingId = ref(null) // prompt id being edited, or 'new'
  const builtinsCollapsed = ref(localStorage.getItem('promptsBuiltinsCollapsed') === 'true')

  // ─── Getters ──────────────────────────────────────────────────

  const allPrompts = computed(() => [
    ...userPrompts.value,
    ...DEFAULT_PROMPTS,
  ])

  // ─── Persistence ──────────────────────────────────────────────

  async function loadPrompts() {
    const workspace = useWorkspaceStore()
    if (!workspace.shouldersDir) return

    const path = `${workspace.shouldersDir}/prompts.json`
    try {
      const exists = await invoke('path_exists', { path })
      if (!exists) return
      const raw = await invoke('read_file', { path })
      const data = JSON.parse(raw)
      userPrompts.value = Array.isArray(data.prompts) ? data.prompts : []
    } catch (e) {
      console.warn('[prompts] Failed to load:', e)
    }
  }

  async function _save() {
    const workspace = useWorkspaceStore()
    if (!workspace.shouldersDir) return

    try {
      await invoke('write_file', {
        path: `${workspace.shouldersDir}/prompts.json`,
        content: JSON.stringify({ prompts: userPrompts.value }, null, 2),
      })
    } catch (e) {
      console.warn('[prompts] Failed to save:', e)
    }
  }

  // ─── CRUD ─────────────────────────────────────────────────────

  function addPrompt({ title, body }) {
    const now = new Date().toISOString()
    userPrompts.value.push({
      id: nanoid(10),
      title: title.trim(),
      body: body.trim(),
      createdAt: now,
      updatedAt: now,
    })
    editingId.value = null
    _save()
  }

  function updatePrompt(id, { title, body }) {
    const prompt = userPrompts.value.find(p => p.id === id)
    if (!prompt) return
    prompt.title = title.trim()
    prompt.body = body.trim()
    prompt.updatedAt = new Date().toISOString()
    editingId.value = null
    _save()
  }

  function removePrompt(id) {
    const idx = userPrompts.value.findIndex(p => p.id === id)
    if (idx >= 0) {
      userPrompts.value.splice(idx, 1)
      if (editingId.value === id) editingId.value = null
      _save()
    }
  }

  // ─── Use a prompt ─────────────────────────────────────────────

  function usePrompt(promptId) {
    const prompt = allPrompts.value.find(p => p.id === promptId)
    if (!prompt) return

    const chatStore = useChatStore()
    const sidebar = useAISidebarStore()

    chatStore.pendingPrefill = prompt.body
    sidebar.goToNew()
  }

  // ─── Editing state ────────────────────────────────────────────

  function startEditing(id) {
    editingId.value = id // prompt id or 'new'
  }

  function cancelEditing() {
    editingId.value = null
  }

  function toggleBuiltinsCollapsed() {
    builtinsCollapsed.value = !builtinsCollapsed.value
    localStorage.setItem('promptsBuiltinsCollapsed', builtinsCollapsed.value)
  }

  return {
    userPrompts,
    editingId,
    builtinsCollapsed,
    allPrompts,
    DEFAULT_PROMPTS,
    loadPrompts,
    addPrompt,
    updatePrompt,
    removePrompt,
    usePrompt,
    startEditing,
    cancelEditing,
    toggleBuiltinsCollapsed,
  }
})
