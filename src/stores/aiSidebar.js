import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useChatStore } from './chat'
import { useWorkflowsStore } from './workflows'
import { useWorkspaceStore } from './workspace'

/**
 * AI Sidebar store — owns the sidebar's view state machine and
 * the merged session list. See docs/plan-chat-ui-v3.md.
 *
 * View states: 'home' | 'new' | 'conversation' | 'workflow' | 'terminal'
 */
export const useAISidebarStore = defineStore('aiSidebar', () => {
  // ─── State ──────────────────────────────────────────────────────

  const viewState = ref('home') // 'home' | 'new' | 'conversation' | 'workflow' | 'terminal'
  const activeSessionId = ref(null) // chat session drilled into
  const activeWorkflowId = ref(null) // workflow being viewed (start screen)
  const activeWorkflowRunId = ref(null) // specific run being viewed (execution)
  const activeTerminalSessionId = ref(null) // agent terminal session
  const panelMode = ref(localStorage.getItem('sidebarPanelMode') || 'ai') // 'ai' | 'document'
  const returnTo = ref('home') // where goBack() returns to
  const homeSearchQuery = ref('')
  const homeLoadedCount = ref(20) // how many older items to show

  // ─── Getters ────────────────────────────────────────────────────

  /** In-memory sessions (active — currently loaded) */
  const activeSessions = computed(() => {
    const chatStore = useChatStore()
    return chatStore.sessions
  })

  /** Count of sessions/workflows with AI actively responding */
  const streamingCount = computed(() => {
    const chatStore = useChatStore()
    let count = 0
    for (const s of activeSessions.value) {
      const chat = chatStore.getChatInstance(s.id)
      if (chat) {
        const status = chat.state.statusRef.value
        if (status === 'submitted' || status === 'streaming') count++
      }
    }
    const workflowsStore = useWorkflowsStore()
    for (const run of Object.values(workflowsStore.runs)) {
      if (run?.status === 'running') count++
    }
    return count
  })

  /** Active items: chats + running workflows, sorted by recency */
  const activeItems = computed(() => {
    const workflowsStore = useWorkflowsStore()
    const items = []

    for (const s of activeSessions.value) {
      items.push({
        type: 'chat',
        id: s.id,
        label: s.label || 'New chat',
        updatedAt: s.updatedAt || s.createdAt,
        isStreaming: _isSessionStreaming(s.id),
      })
    }

    for (const [runId, run] of Object.entries(workflowsStore.runs)) {
      if (!run) continue
      items.push({
        type: 'workflow',
        id: runId,
        runId,
        workflowId: run.workflowId,
        label: run.workflow?.name || run.workflowId,
        updatedAt: run.startedAt?.toISOString?.() || new Date().toISOString(),
        isStreaming: run.status === 'running',
        isWaiting: !!run.pendingInteraction,
        status: run.status,
      })
    }

    items.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    return items
  })

  /** Older items from disk (not currently in memory) */
  const olderItems = computed(() => {
    const chatStore = useChatStore()
    const workflowsStore = useWorkflowsStore()
    const activeChatIds = new Set(activeSessions.value.map(s => s.id))
    const activeRunIds = new Set(Object.keys(workflowsStore.runs))
    const q = homeSearchQuery.value.trim().toLowerCase()

    let chatMeta = chatStore.allSessionsMeta.filter(meta => !activeChatIds.has(meta.id))
    let runMeta = workflowsStore.allRunsMeta.filter(meta => !activeRunIds.has(meta.id))

    if (q) {
      chatMeta = chatMeta.filter(meta => {
        const matchLabel = meta.label?.toLowerCase().includes(q)
        const matchKeywords = meta._keywords?.some(k => k.toLowerCase().includes(q))
        return matchLabel || matchKeywords
      })
      runMeta = runMeta.filter(meta =>
        meta.workflowName?.toLowerCase().includes(q)
      )
    }

    const items = [
      ...chatMeta.map(meta => ({
        type: 'archived-chat',
        id: meta.id,
        label: meta.label || 'Untitled',
        updatedAt: meta.updatedAt,
        messageCount: meta.messageCount,
      })),
      ...runMeta.map(meta => ({
        type: 'archived-workflow',
        id: meta.id,
        runId: meta.id,
        workflowId: meta.workflowId,
        label: meta.workflowName || meta.workflowId,
        updatedAt: meta.completedAt || meta.startedAt,
        status: meta.status,
      })),
    ]

    items.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    return items
  })

  /** Older items, limited by homeLoadedCount */
  const visibleOlderItems = computed(() => {
    return olderItems.value.slice(0, homeLoadedCount.value)
  })

  /** Whether there are more older items to load */
  const hasMoreOlderItems = computed(() => {
    return olderItems.value.length > homeLoadedCount.value
  })

  /**
   * Counts of OTHER sessions (excluding the one currently drilled into)
   * that are working or waiting. These power the back button label.
   */
  const othersWorkingCount = computed(() => {
    const chatStore = useChatStore()
    const workflowsStore = useWorkflowsStore()
    let count = 0
    for (const s of activeSessions.value) {
      if (s.id === activeSessionId.value) continue
      const chat = chatStore.getChatInstance(s.id)
      if (chat) {
        const status = chat.state.statusRef.value
        if (status === 'submitted' || status === 'streaming') count++
      }
    }
    for (const [runId, run] of Object.entries(workflowsStore.runs)) {
      if (runId === activeWorkflowRunId.value) continue
      if (run?.status === 'running' && !run.pendingInteraction) count++
    }
    return count
  })

  const othersWaitingCount = computed(() => {
    const workflowsStore = useWorkflowsStore()
    let count = 0
    for (const [runId, run] of Object.entries(workflowsStore.runs)) {
      if (runId === activeWorkflowRunId.value) continue
      if (run?.pendingInteraction) count++
    }
    return count
  })

  /** Back button label: "Back" + status of OTHER sessions only */
  const backButtonLabel = computed(() => {
    const working = othersWorkingCount.value
    const waiting = othersWaitingCount.value
    const parts = []
    if (working > 0) parts.push(`${working} working`)
    if (waiting > 0) parts.push(`${waiting} waiting`)
    if (parts.length > 0) {
      return `Back (${parts.join(', ')})`
    }
    return 'Back'
  })

  /** Whether Home has zero items (active + older) — triggers empty state */
  const isHomeEmpty = computed(() => {
    return activeItems.value.length === 0 && olderItems.value.length === 0
  })

  // ─── Actions ────────────────────────────────────────────────────

  /** Navigate to the New screen */
  function goToNew() {
    returnTo.value = 'home'
    viewState.value = 'new'
  }

  /** Drill into a chat conversation (always returns to Home — New's job is done) */
  function drillIntoChat(sessionId) {
    const chatStore = useChatStore()
    returnTo.value = 'home'
    viewState.value = 'conversation'
    activeSessionId.value = sessionId
    activeWorkflowId.value = null
    activeWorkflowRunId.value = null
    activeTerminalSessionId.value = null
    chatStore.activeSessionId = sessionId
  }

  /** Drill into a workflow start screen (returns to wherever we came from) */
  function drillIntoWorkflow(workflowId) {
    returnTo.value = viewState.value
    viewState.value = 'workflow'
    activeWorkflowId.value = workflowId
    activeWorkflowRunId.value = null
    activeSessionId.value = null
    activeTerminalSessionId.value = null
  }

  /** Drill into a specific workflow run (returns to wherever we came from) */
  function drillIntoWorkflowRun(workflowId, runId) {
    returnTo.value = viewState.value
    viewState.value = 'workflow'
    activeWorkflowId.value = workflowId
    activeWorkflowRunId.value = runId
    activeSessionId.value = null
    activeTerminalSessionId.value = null
  }

  /** Drill into a terminal session (returns to wherever we came from) */
  function drillIntoTerminal(terminalSessionId) {
    returnTo.value = viewState.value
    viewState.value = 'terminal'
    activeTerminalSessionId.value = terminalSessionId
    activeSessionId.value = null
    activeWorkflowId.value = null
    activeWorkflowRunId.value = null
  }

  /** Return to previous screen */
  function goBack() {
    viewState.value = returnTo.value
    returnTo.value = 'home'
  }

  /** Archive a chat session (save to disk, remove from memory) */
  async function archiveSession(sessionId) {
    const chatStore = useChatStore()

    await chatStore.saveSession(sessionId)

    if (viewState.value === 'conversation' && activeSessionId.value === sessionId) {
      goBack()
    }

    chatStore._removeFromSessions?.(sessionId)
  }

  /** Archive a workflow run (save to disk, remove from memory) */
  async function archiveWorkflowRun(runId) {
    const workflowsStore = useWorkflowsStore()

    await workflowsStore.saveRun(runId)

    if (viewState.value === 'workflow' && activeWorkflowRunId.value === runId) {
      goBack()
    }

    workflowsStore._removeRunFromMemory(runId)
  }

  /** Load more older items on Home */
  function loadMore() {
    homeLoadedCount.value += 20
  }

  /** Create a new chat and drill into it. Optionally send a message. */
  async function createChatAndDrillIn(payload = {}) {
    const chatStore = useChatStore()
    const workspace = useWorkspaceStore()

    workspace.rightSidebarOpen = true
    localStorage.setItem('rightSidebarOpen', 'true')
    panelMode.value = 'ai'
    localStorage.setItem('sidebarPanelMode', 'ai')

    const sessionId = chatStore.createSession(payload.modelId)
    drillIntoChat(sessionId)

    if (payload.text || payload.prefill) {
      const { nextTick } = await import('vue')
      await nextTick()
      await nextTick()
      chatStore.sendMessage(sessionId, {
        text: payload.text || payload.prefill,
        fileRefs: payload.fileRefs,
        context: payload.context,
        richHtml: payload.richHtml,
      })
    }

    return sessionId
  }

  /** Open sidebar in AI mode, go to Home */
  function openSidebar() {
    const workspace = useWorkspaceStore()
    workspace.rightSidebarOpen = true
    localStorage.setItem('rightSidebarOpen', 'true')
    panelMode.value = 'ai'
    localStorage.setItem('sidebarPanelMode', 'ai')
  }

  /**
   * Focus sidebar for a chat session — replacement for editorStore.openChatBeside().
   * Opens sidebar, creates or reuses session, drills in, optionally sends prefill.
   */
  async function focusSidebarChat(sessionId, opts = {}) {
    const chatStore = useChatStore()
    const workspace = useWorkspaceStore()

    workspace.rightSidebarOpen = true
    localStorage.setItem('rightSidebarOpen', 'true')
    panelMode.value = 'ai'
    localStorage.setItem('sidebarPanelMode', 'ai')

    if (sessionId) {
      const existing = chatStore.sessions.find(s => s.id === sessionId)
      if (!existing) {
        await chatStore.reopenSession(sessionId, { skipArchive: true })
      }
      drillIntoChat(sessionId)
    } else if (opts.prefill || opts.text || opts.context) {
      await createChatAndDrillIn({
        text: opts.text || opts.prefill,
        fileRefs: opts.fileRefs,
        context: opts.context,
        richHtml: opts.richHtml,
        modelId: opts.modelId,
      })
    } else {
      openSidebar()
    }
  }

  /** Reset sidebar state (called on workspace open) */
  function reset() {
    viewState.value = 'home'
    returnTo.value = 'home'
    activeSessionId.value = null
    activeWorkflowId.value = null
    activeWorkflowRunId.value = null
    activeTerminalSessionId.value = null
    homeSearchQuery.value = ''
    homeLoadedCount.value = 20
  }

  // ─── Helpers ────────────────────────────────────────────────────

  function _isSessionStreaming(sessionId) {
    const chatStore = useChatStore()
    const chat = chatStore.getChatInstance(sessionId)
    if (!chat) return false
    const status = chat.state.statusRef.value
    return status === 'submitted' || status === 'streaming'
  }

  // ─── Public API ─────────────────────────────────────────────────

  return {
    // State
    viewState,
    activeSessionId,
    activeWorkflowId,
    activeWorkflowRunId,
    activeTerminalSessionId,
    panelMode,
    homeSearchQuery,
    homeLoadedCount,

    // Getters
    activeSessions,
    streamingCount,
    othersWorkingCount,
    othersWaitingCount,
    activeItems,
    olderItems,
    visibleOlderItems,
    hasMoreOlderItems,
    backButtonLabel,
    isHomeEmpty,

    // Actions
    goToNew,
    drillIntoChat,
    drillIntoWorkflow,
    drillIntoWorkflowRun,
    drillIntoTerminal,
    goBack,
    archiveSession,
    archiveWorkflowRun,
    loadMore,
    createChatAndDrillIn,
    openSidebar,
    focusSidebarChat,
    reset,
  }
})
