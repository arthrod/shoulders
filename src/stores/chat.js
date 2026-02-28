import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { Chat } from '@ai-sdk/vue'
import { lastAssistantMessageIsCompleteWithToolCalls } from 'ai'
import { nanoid } from './utils'
import { useWorkspaceStore } from './workspace'
import { resolveApiAccess } from '../services/apiClient'
import { getContextWindow, getThinkingConfig } from '../services/chatModels'
import { buildBaseSystemPrompt } from '../services/systemPrompt'
import { calculateCost } from '../services/tokenUsage'
import { cleanPartsForStorage } from '../services/aiSdk'
import { createChatTransport } from '../services/chatTransport'
import { buildWorkspaceMeta } from '../services/workspaceMeta'
import { noApiKeyMessage, formatChatApiError } from '../utils/errorMessages'

// Chat instances live OUTSIDE Pinia (non-reactive container).
// Each Chat's internal messages/status use Vue ref() — reactive when accessed.
const chatInstances = new Map() // sessionId → Chat

export const useChatStore = defineStore('chat', () => {
  // ─── State ────────────────────────────────────────────────────────
  const sessions = ref([])
  const activeSessionId = ref(null)
  const allSessionsMeta = ref([]) // [{ id, label, updatedAt, messageCount }]
  const _chatVersion = ref(0) // Reactive trigger — increment when Chat instances are created/destroyed

  // ─── Getters ──────────────────────────────────────────────────────
  const activeSession = computed(() =>
    sessions.value.find(s => s.id === activeSessionId.value) || null
  )

  const streamingCount = computed(() => {
    let count = 0
    for (const [id, chat] of chatInstances) {
      const session = sessions.value.find(s => s.id === id)
      if (session?._background) {
        const status = chat.state.statusRef.value
        if (status === 'submitted' || status === 'streaming') count++
      }
    }
    return count
  })

  // ─── Chat Instance Management ───────────────────────────────────

  function getOrCreateChat(session) {
    if (chatInstances.has(session.id)) return chatInstances.get(session.id)

    console.log('[chat] Creating Chat instance for session:', session.id)

    const chat = new Chat({
      id: session.id,
      messages: session._savedMessages || [],
      transport: createChatTransport(() => _buildConfig(session)),
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,

      onToolCall: async ({ toolCall }) => {
        // Client-side tool handling if needed
        // The ToolLoopAgent in the transport handles server-side tools
      },

      onError: (err) => {
        console.error(`[chat] Error in session ${session.id}:`, err)
        session.updatedAt = new Date().toISOString()
      },
    })

    chatInstances.set(session.id, chat)
    _chatVersion.value++ // Trigger reactivity for getChatInstance consumers

    // Watch for status transitions to save on completion
    watch(
      () => chat.state.statusRef.value,
      (newStatus, oldStatus) => {
        console.log(`[chat] Session ${session.id} status: ${oldStatus} → ${newStatus}`)
        if (newStatus === 'ready' && (oldStatus === 'streaming' || oldStatus === 'submitted')) {
          session.updatedAt = new Date().toISOString()
          saveSession(session.id)

          // Auto-cleanup background sessions
          if (session._background) {
            _removeFromSessions(session.id)
          }
        }
      },
    )

    return chat
  }

  function getChatInstance(sessionId) {
    void _chatVersion.value // reactive dependency — re-evaluate when Chat instances change
    return chatInstances.get(sessionId) || null
  }

  async function _buildConfig(session) {
    const workspace = useWorkspaceStore()
    const access = await resolveApiAccess({ modelId: session.modelId }, workspace)

    if (!access) throw new Error(noApiKeyMessage(session.modelId))

    const provider = access.providerHint || access.provider
    const modelEntry = workspace.modelsConfig?.models?.find(m => m.id === session.modelId)
    const thinkingConfig = getThinkingConfig(access.model, provider, modelEntry?.thinking)

    // Build system prompt (includes workspace meta for context)
    let systemPrompt = buildBaseSystemPrompt(workspace)
    if (workspace.systemPrompt) systemPrompt += '\n\n' + workspace.systemPrompt
    if (workspace.instructions) systemPrompt += '\n\n' + workspace.instructions

    // Add workspace meta to system prompt (not user message — keeps UI clean)
    try {
      const meta = await buildWorkspaceMeta(workspace.path)
      if (meta) systemPrompt += '\n\n' + meta
    } catch {}

    console.log('[chat] _buildConfig:', { provider, model: access.model, isShoulders: access.provider === 'shoulders', systemLen: systemPrompt.length })

    return {
      access,
      workspace,
      systemPrompt,
      thinkingConfig,
      provider,
      onUsage: (normalized, modelId) => {
        normalized.cost = calculateCost(normalized, modelId)
        import('./usage').then(({ useUsageStore }) => {
          useUsageStore().record({
            usage: normalized,
            feature: 'chat',
            provider,
            modelId,
            sessionId: session.id,
          })
        })
        // Refresh Shoulders balance
        if (access.provider === 'shoulders') {
          workspace.refreshShouldersBalance()
        }
      },
    }
  }

  // ─── Session Management ─────────────────────────────────────────

  function createSession(modelId) {
    const workspace = useWorkspaceStore()
    const configDefault = workspace.modelsConfig?.models?.find(m => m.default)?.id || 'sonnet'
    const defaultModel = workspace.selectedModelId || configDefault
    const id = nanoid(12)
    const session = {
      id,
      label: `Chat ${sessions.value.length + 1}`,
      modelId: modelId || defaultModel,
      messages: [], // For UI display — overridden by Chat instance once created
      status: 'idle',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    sessions.value.push(session)
    activeSessionId.value = id

    // Pre-create Chat instance so messages are immediately reactive
    getOrCreateChat(session)

    return id
  }

  function deleteSession(id) {
    const session = sessions.value.find(s => s.id === id)
    if (!session) return

    // Stop Chat instance
    const chat = chatInstances.get(id)
    if (chat) {
      try { chat.stop() } catch {}
      chatInstances.delete(id)
      _chatVersion.value++
    }

    const idx = sessions.value.indexOf(session)
    sessions.value.splice(idx, 1)

    // Delete persisted file
    const workspace = useWorkspaceStore()
    if (workspace.shouldersDir) {
      invoke('delete_path', { path: `${workspace.shouldersDir}/chats/${id}.json` }).catch(() => {})
    }

    if (activeSessionId.value === id) {
      activeSessionId.value = sessions.value.length > 0 ? sessions.value[sessions.value.length - 1].id : null
    }
  }

  async function reopenSession(id) {
    const existing = sessions.value.find(s => s.id === id)
    if (existing) {
      if (existing._background) existing._background = false
      activeSessionId.value = id
      return
    }

    await _archiveCurrent()

    const workspace = useWorkspaceStore()
    if (!workspace.shouldersDir) return

    try {
      const content = await invoke('read_file', { path: `${workspace.shouldersDir}/chats/${id}.json` })
      const data = JSON.parse(content)

      const messages = data.messages || []

      const session = {
        id: data.id,
        label: data.label,
        modelId: data.modelId,
        messages: [], // Will be populated by Chat instance
        status: 'idle',
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        _savedMessages: messages, // Passed to Chat constructor
      }

      sessions.value.push(session)
      activeSessionId.value = id

      // Pre-create Chat so messages are immediately available
      getOrCreateChat(session)
    } catch (e) {
      console.warn('Failed to reopen session:', e)
    }
  }

  async function loadAllSessionsMeta() {
    const workspace = useWorkspaceStore()
    if (!workspace.shouldersDir) return

    const chatsDir = `${workspace.shouldersDir}/chats`
    try {
      const exists = await invoke('path_exists', { path: chatsDir })
      if (!exists) return

      const entries = await invoke('read_dir_recursive', { path: chatsDir })
      const jsonFiles = entries.filter(e => !e.is_dir && e.name.endsWith('.json'))

      const meta = []
      for (const file of jsonFiles) {
        try {
          const content = await invoke('read_file', { path: file.path })
          const data = JSON.parse(content)
          meta.push({
            id: data.id,
            label: data.label || 'Untitled',
            updatedAt: data.updatedAt || data.createdAt,
            messageCount: data.messages?.length || 0,
          })
        } catch {}
      }

      meta.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      allSessionsMeta.value = meta
    } catch (e) {
      console.warn('Failed to load session meta:', e)
    }
  }

  function setActiveSession(id) {
    activeSessionId.value = id
  }

  async function archiveAndNewChat() {
    if (!activeSession.value) return

    // Check if Chat has any messages
    const chat = chatInstances.get(activeSession.value.id)
    const hasMessages = chat
      ? chat.state.messagesRef.value.length > 0
      : activeSession.value.messages.length > 0

    if (!hasMessages) return

    await _archiveCurrent()
    createSession()
  }

  async function _archiveCurrent() {
    if (!activeSession.value) return

    const chat = chatInstances.get(activeSession.value.id)
    const hasMessages = chat
      ? chat.state.messagesRef.value.length > 0
      : activeSession.value.messages.length > 0

    if (!hasMessages) return

    const isStreaming = chat && ['submitted', 'streaming'].includes(chat.state.statusRef.value)

    if (isStreaming) {
      activeSession.value._background = true
    } else {
      await saveSession(activeSession.value.id)
      _removeFromSessions(activeSession.value.id)
    }
  }

  function _removeFromSessions(id) {
    const session = sessions.value.find(s => s.id === id)
    if (!session) return

    const chat = chatInstances.get(id)
    if (chat) {
      try { chat.stop() } catch {}
      chatInstances.delete(id)
      _chatVersion.value++
    }

    const idx = sessions.value.indexOf(session)
    sessions.value.splice(idx, 1)
  }

  // ─── Messaging ──────────────────────────────────────────────────

  async function sendMessage(sessionId, { text, fileRefs, context }) {
    const session = sessions.value.find(s => s.id === sessionId)
    if (!session) {
      console.warn('[chat] sendMessage: session not found:', sessionId)
      return
    }

    const chat = getOrCreateChat(session)

    // Check streaming state
    const status = chat.state.statusRef.value
    if (status === 'submitted' || status === 'streaming') {
      console.warn('[chat] sendMessage: already streaming, ignoring')
      return
    }

    // Budget gate
    const { useUsageStore } = await import('./usage')
    if (useUsageStore().isOverBudget) {
      console.warn('[chat] Budget exceeded')
      return
    }

    // Auto-label on first message
    const isFirst = chat.state.messagesRef.value.length === 0
    if (isFirst && text) {
      session.label = text.slice(0, 40).replace(/\n/g, ' ').trim()
    }

    // Build message text with workspace meta + file refs + context
    const messageText = await _buildMessageText({ text, fileRefs, context })

    console.log('[chat] Sending message:', { sessionId, textLen: messageText.length, msgCount: chat.state.messagesRef.value.length })
    chat.sendMessage({ text: messageText })
  }

  async function abortSession(sessionId) {
    const chat = chatInstances.get(sessionId)
    if (!chat) return
    chat.stop()
  }

  async function _buildMessageText({ text, fileRefs, context }) {
    const parts = []

    // File references
    if (fileRefs?.length) {
      for (const ref of fileRefs) {
        if (ref.content) {
          parts.push(`<file-ref path="${ref.path}">\n${ref.content}\n</file-ref>`)
        }
      }
    }

    // Context (selection, active file)
    if (context?.text) {
      let ctx = `<context file="${context.file || ''}">`
      if (context.contextBefore) ctx += `\n...${context.contextBefore}`
      ctx += `\n<selection>\n${context.text}\n</selection>`
      if (context.contextAfter) ctx += `\n${context.contextAfter}...`
      ctx += '\n</context>'
      parts.push(ctx)
    }

    // User text
    if (text) parts.push(text)

    return parts.join('\n\n')
  }

  // ─── Persistence ────────────────────────────────────────────────

  async function loadSessions() {
    const workspace = useWorkspaceStore()
    if (!workspace.shouldersDir) return

    // Cleanup existing Chat instances
    for (const [id, chat] of chatInstances) {
      try { chat.stop() } catch {}
    }
    chatInstances.clear()
    _chatVersion.value++

    sessions.value = []
    activeSessionId.value = null
    allSessionsMeta.value = []

    const chatsDir = `${workspace.shouldersDir}/chats`
    const exists = await invoke('path_exists', { path: chatsDir })
    if (!exists) {
      await invoke('create_dir', { path: chatsDir })
    }

    createSession()
    await loadAllSessionsMeta()
  }

  async function saveSession(id) {
    const workspace = useWorkspaceStore()
    if (!workspace.shouldersDir) return

    const session = sessions.value.find(s => s.id === id)
    if (!session) return

    // Get messages from Chat instance
    const chat = chatInstances.get(id)
    const messages = chat
      ? chat.state.messagesRef.value.map(m => ({
          ...m,
          parts: cleanPartsForStorage(m.parts),
        }))
      : session.messages || []

    const chatsDir = `${workspace.shouldersDir}/chats`
    const exists = await invoke('path_exists', { path: chatsDir })
    if (!exists) {
      await invoke('create_dir', { path: chatsDir })
    }

    const data = {
      id: session.id,
      label: session.label,
      modelId: session.modelId,
      messages,
      status: 'idle',
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    }

    try {
      await invoke('write_file', {
        path: `${chatsDir}/${id}.json`,
        content: JSON.stringify(data, null, 2),
      })

      const existingIdx = allSessionsMeta.value.findIndex(m => m.id === id)
      const meta = {
        id: session.id,
        label: session.label,
        updatedAt: session.updatedAt || session.createdAt,
        messageCount: messages.length,
      }
      if (existingIdx >= 0) {
        allSessionsMeta.value[existingIdx] = meta
      } else {
        allSessionsMeta.value.push(meta)
      }
    } catch (e) {
      console.warn('Failed to save chat session:', e)
    }
  }

  // ─── Public API ─────────────────────────────────────────────────

  return {
    // State
    sessions,
    activeSessionId,
    allSessionsMeta,

    // Getters
    activeSession,
    streamingCount,

    // Chat instance management
    getOrCreateChat,
    getChatInstance,

    // Session management
    createSession,
    deleteSession,
    reopenSession,
    loadAllSessionsMeta,
    setActiveSession,
    archiveAndNewChat,

    // Messaging
    sendMessage,
    abortSession,

    // Persistence
    loadSessions,
    saveSession,
  }
})


