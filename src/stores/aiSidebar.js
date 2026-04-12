import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useChatStore } from './chat'
import { useWorkflowsStore } from './workflows'
import { useWorkspaceStore } from './workspace'

/**
 * AI Sidebar store — owns the sidebar's view state machine and
 * the merged active-items list. See docs/plan-right-sidebar.md.
 *
 * View states: 'overview' | 'conversation' | 'workflow'
 */
export const useAISidebarStore = defineStore('aiSidebar', () => {
  // ─── State ──────────────────────────────────────────────────────

  const viewState = ref('overview') // 'overview' | 'conversation' | 'workflow'
  const activeSessionId = ref(null) // chat session drilled into
  const activeWorkflowId = ref(null) // workflow being viewed
  const overviewMode = ref('active') // 'active' | 'workflows' | 'history'
  const historyQuery = ref('') // search query for HISTORY mode
  const archivedSessionIds = ref(new Set()) // soft-archived (session-only, not persisted)
  const panelMode = ref(localStorage.getItem('sidebarPanelMode') || 'ai') // 'ai' | 'document'

  // ─── Getters ────────────────────────────────────────────────────

  /** Non-archived sessions that are in memory (active) */
  const activeSessions = computed(() => {
    const chatStore = useChatStore()
    return chatStore.sessions.filter(s => !archivedSessionIds.value.has(s.id))
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
    for (const runId of Object.values(workflowsStore.activeRunIds)) {
      const run = workflowsStore.runs[runId]
      if (run?.status === 'running') count++
    }
    return count
  })

  /** Active items for overview: chats + running workflows, sorted by recency */
  const activeItems = computed(() => {
    const workflowsStore = useWorkflowsStore()
    const items = []

    // Chat sessions
    for (const s of activeSessions.value) {
      items.push({
        type: 'chat',
        id: s.id,
        label: s.label || 'New chat',
        updatedAt: s.updatedAt || s.createdAt,
        isStreaming: _isSessionStreaming(s.id),
      })
    }

    // Running workflows
    for (const [workflowId, runId] of Object.entries(workflowsStore.activeRunIds)) {
      const run = workflowsStore.runs[runId]
      if (!run) continue
      items.push({
        type: 'workflow',
        id: workflowId,
        runId,
        label: run.workflow?.name || workflowId,
        updatedAt: run.startedAt?.toISOString?.() || new Date().toISOString(),
        isStreaming: run.status === 'running',
        status: run.status,
      })
    }

    // Sort by recency
    items.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    return items
  })

  /** Active items grouped by date for the overview */
  const activeItemsByDate = computed(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
    const thisWeekStart = new Date(today); thisWeekStart.setDate(today.getDate() - today.getDay())
    const lastWeekStart = new Date(thisWeekStart); lastWeekStart.setDate(thisWeekStart.getDate() - 7)

    const groups = []
    const used = new Set()

    function addGroup(label, filterFn) {
      const items = activeItems.value.filter(i => {
        if (used.has(i.id + i.type)) return false
        return filterFn(new Date(i.updatedAt))
      })
      if (items.length > 0) {
        items.forEach(i => used.add(i.id + i.type))
        groups.push({ label, items })
      }
    }

    addGroup('Today', d => d >= today)
    addGroup('Yesterday', d => d >= yesterday && d < today)
    addGroup('This week', d => d >= thisWeekStart && d < yesterday)
    addGroup('Last week', d => d >= lastWeekStart && d < thisWeekStart)
    addGroup('Older', () => true) // catches remaining

    return groups
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
      if (s.id === activeSessionId.value) continue // exclude current
      const chat = chatStore.getChatInstance(s.id)
      if (chat) {
        const status = chat.state.statusRef.value
        if (status === 'submitted' || status === 'streaming') count++
      }
    }
    for (const [workflowId, runId] of Object.entries(workflowsStore.activeRunIds)) {
      if (workflowId === activeWorkflowId.value) continue // exclude current
      const run = workflowsStore.runs[runId]
      if (run?.status === 'running' && !run.pendingInteraction) count++
    }
    return count
  })

  const othersWaitingCount = computed(() => {
    // Placeholder — will be wired when "awaiting reply" state is implemented
    const workflowsStore = useWorkflowsStore()
    let count = 0
    for (const [workflowId, runId] of Object.entries(workflowsStore.activeRunIds)) {
      if (workflowId === activeWorkflowId.value) continue
      const run = workflowsStore.runs[runId]
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

  /** History items for HISTORY mode. Searches allSessionsMeta by historyQuery. */
  const historyItems = computed(() => {
    const chatStore = useChatStore()
    const q = historyQuery.value.trim().toLowerCase()
    const activeIds = new Set(activeSessions.value.map(s => s.id))

    let items = chatStore.allSessionsMeta.filter(meta => !activeIds.has(meta.id))

    if (q) {
      items = items.filter(meta => {
        const matchLabel = meta.label?.toLowerCase().includes(q)
        const matchKeywords = meta._keywords?.some(k => k.toLowerCase().includes(q))
        return matchLabel || matchKeywords
      })
    }

    return items.map(meta => ({
      type: 'archived-chat',
      id: meta.id,
      label: meta.label || 'Untitled',
      updatedAt: meta.updatedAt,
      messageCount: meta.messageCount,
    }))
  })

  // ─── Actions ────────────────────────────────────────────────────

  /** Drill into a chat conversation */
  function drillIntoChat(sessionId) {
    const chatStore = useChatStore()
    viewState.value = 'conversation'
    activeSessionId.value = sessionId
    activeWorkflowId.value = null
    chatStore.activeSessionId = sessionId
  }

  /** Drill into a workflow (start screen or execution) */
  function drillIntoWorkflow(workflowId) {
    viewState.value = 'workflow'
    activeWorkflowId.value = workflowId
    activeSessionId.value = null
  }

  /** Return to overview */
  function goBack() {
    viewState.value = 'overview'
    // Don't clear activeSessionId — v-show conversation keeps alive
  }

  /** Archive a chat session (soft remove from active list) */
  async function archiveSession(sessionId) {
    const chatStore = useChatStore()

    // Save before archiving
    await chatStore.saveSession(sessionId)

    // Add to archived set
    const newSet = new Set(archivedSessionIds.value)
    newSet.add(sessionId)
    archivedSessionIds.value = newSet

    // If we're drilled into this session, go back
    if (viewState.value === 'conversation' && activeSessionId.value === sessionId) {
      goBack()
    }

    // Remove from in-memory sessions to free resources
    // (it's still on disk, accessible via filter/history)
    chatStore._removeFromSessions?.(sessionId)
  }

  /** Archive all sessions in a date group */
  async function archiveGroup(groupLabel) {
    const group = activeItemsByDate.value.find(g => g.label === groupLabel)
    if (!group) return
    for (const item of group.items) {
      if (item.type === 'chat') {
        await archiveSession(item.id)
      }
    }
  }

  /** Create a new chat and drill into it. Optionally send a message. */
  async function createChatAndDrillIn(payload = {}) {
    const chatStore = useChatStore()
    const workspace = useWorkspaceStore()

    // Ensure sidebar is open
    workspace.rightSidebarOpen = true
    localStorage.setItem('rightSidebarOpen', 'true')
    panelMode.value = 'ai'
    localStorage.setItem('sidebarPanelMode', 'ai')

    const sessionId = chatStore.createSession(payload.modelId)
    drillIntoChat(sessionId)

    // Send message if provided
    if (payload.text || payload.prefill) {
      // Use nextTick to let ChatSession mount
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

  /** Open sidebar in AI mode, switch to ACTIVE overview, focus ChatInput */
  function openSidebar() {
    const workspace = useWorkspaceStore()
    workspace.rightSidebarOpen = true
    localStorage.setItem('rightSidebarOpen', 'true')
    panelMode.value = 'ai'
    localStorage.setItem('sidebarPanelMode', 'ai')
    overviewMode.value = 'active'
    // Don't change viewState — stay where user was (overview or conversation)
  }

  /**
   * Focus sidebar for a chat session — replacement for editorStore.openChatBeside().
   * Opens sidebar, creates or reuses session, drills in, optionally sends prefill.
   */
  async function focusSidebarChat(sessionId, opts = {}) {
    const chatStore = useChatStore()
    const workspace = useWorkspaceStore()

    // Ensure sidebar is open in AI mode
    workspace.rightSidebarOpen = true
    localStorage.setItem('rightSidebarOpen', 'true')
    panelMode.value = 'ai'
    localStorage.setItem('sidebarPanelMode', 'ai')

    if (sessionId) {
      // Reopen existing session
      const existing = chatStore.sessions.find(s => s.id === sessionId)
      if (!existing) {
        await chatStore.reopenSession(sessionId, { skipArchive: true })
      }
      // Un-archive if it was archived
      if (archivedSessionIds.value.has(sessionId)) {
        const newSet = new Set(archivedSessionIds.value)
        newSet.delete(sessionId)
        archivedSessionIds.value = newSet
      }
      drillIntoChat(sessionId)
    } else if (opts.prefill || opts.text || opts.context) {
      // Create new session and send
      await createChatAndDrillIn({
        text: opts.text || opts.prefill,
        fileRefs: opts.fileRefs,
        context: opts.context,
        richHtml: opts.richHtml,
        modelId: opts.modelId,
      })
    } else {
      // Just open sidebar, show overview
      openSidebar()
    }
  }

  /** Reset sidebar state (called on workspace open) */
  function reset() {
    viewState.value = 'overview'
    activeSessionId.value = null
    activeWorkflowId.value = null
    overviewMode.value = 'active'
    historyQuery.value = ''
    archivedSessionIds.value = new Set()
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
    overviewMode,
    historyQuery,
    archivedSessionIds,
    panelMode,

    // Getters
    activeSessions,
    streamingCount,
    othersWorkingCount,
    othersWaitingCount,
    activeItems,
    activeItemsByDate,
    backButtonLabel,
    historyItems,

    // Actions
    drillIntoChat,
    drillIntoWorkflow,
    goBack,
    archiveSession,
    archiveGroup,
    createChatAndDrillIn,
    openSidebar,
    focusSidebarChat,
    reset,
  }
})
