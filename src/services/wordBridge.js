/**
 * Word Bridge — Tauri IPC client.
 * Communicates with the in-process Rust bridge server via invoke + listen.
 * Word events arrive as Tauri events; commands go through invoke.
 */

import { ref, reactive } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

// ── State ───────────────────────────────────────────────────────────

/** Unlisten function for Tauri event listener */
let unlisten = null

/** Reactive connection state */
export const connected = ref(false)

/** Connected Word files: path → { metadata, connectedAt } */
export const wordFiles = reactive(new Map())

/** Comment ID map: shouldersId ↔ wordCommentId */
const commentIdMap = new Map() // shouldersId → wordCommentId
const reverseCommentIdMap = new Map() // wordCommentId → shouldersId

/** Event listeners: eventType → Set<callback> */
const listeners = {}

// ── Connection management ───────────────────────────────────────────

export async function connect() {
  // Clean up any previous listener
  if (unlisten) {
    unlisten()
    unlisten = null
  }

  // Listen for Word events forwarded by Rust bridge
  unlisten = await listen('word-bridge-event', (event) => {
    handleMessage(event.payload)
  })

  // Check if bridge is actually running
  try {
    const status = await invoke('addin_status')
    connected.value = status.running
    if (status.running) {
      emit('connected')
    }
  } catch {
    connected.value = false
  }
}

export function disconnect() {
  if (unlisten) {
    unlisten()
    unlisten = null
  }
  connected.value = false
  // Mark all as disconnected (don't clear — tabs stay alive)
  for (const entry of wordFiles.values()) {
    entry.connected = false
  }
}

// ── Message handling ────────────────────────────────────────────────

function handleMessage(msg) {
  switch (msg.type) {
    case 'connected':
      connected.value = true
      emit('connected')
      break

    case 'file-opened': {
      const existing = wordFiles.get(msg.path)
      if (existing) {
        existing.connected = true
        existing.metadata = msg.metadata
      } else {
        wordFiles.set(msg.path, {
          metadata: msg.metadata,
          connectedAt: Date.now(),
          connected: true,
        })
      }
      emit('file-opened', { path: msg.path, metadata: msg.metadata })
      break
    }

    case 'file-closed': {
      const entry = wordFiles.get(msg.path)
      if (entry) entry.connected = false
      emit('file-closed', { path: msg.path })
      break
    }

    case 'ai-comment':
      emit('ai-comment', {
        commentId: msg.commentId,
        anchorText: msg.anchorText,
        commentText: msg.commentText,
        path: msg.path,
      })
      break

    case 'selection-changed':
      emit('selection-changed', {
        path: msg.path,
        selectedText: msg.selectedText,
        paragraphContext: msg.paragraphContext,
      })
      break

    case 'document-modified':
      emit('document-modified', { path: msg.path })
      break
  }
}

// ── Command sending ─────────────────────────────────────────────────

async function sendCommand(path, command) {
  return invoke('addin_send_command', { path, command })
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Check if a file path is connected via Word Bridge
 */
export function isConnected(path) {
  const entry = wordFiles.get(path)
  return entry?.connected === true
}

/**
 * Read document content via Word Bridge
 * @returns {{ text, metadata, paragraphs, tables }}
 */
export function readDocument(path) {
  return sendCommand(path, { type: 'read-document' })
}

/**
 * Insert a comment anchored to specific text
 * @returns {{ success, wordCommentId }}
 */
export async function insertComment(path, anchorText, commentText, author = 'Shoulders AI') {
  const result = await sendCommand(path, {
    type: 'insert-comment',
    anchorText,
    commentText,
    author,
  })
  return result
}

/**
 * Reply to an existing comment by Word comment ID
 */
export function replyComment(path, wordCommentId, replyText) {
  return sendCommand(path, {
    type: 'reply-comment',
    wordCommentId,
    replyText,
  })
}

/**
 * Resolve a comment by Word comment ID
 */
export function resolveComment(path, wordCommentId) {
  return sendCommand(path, {
    type: 'resolve-comment',
    wordCommentId,
  })
}

/**
 * Edit text in the Word document (search & replace)
 * @param {boolean} trackChanges - If true, insert as tracked change
 * @returns {{ success, matchCount }}
 */
export function editText(path, oldText, newText, trackChanges = true) {
  return sendCommand(path, {
    type: 'edit-text',
    oldText,
    newText,
    trackChanges,
  })
}

/**
 * Get current selection in Word
 * @returns {{ selectedText, paragraphContext }}
 */
export function getSelection(path) {
  return sendCommand(path, { type: 'get-selection' })
}

/**
 * Get document metadata
 * @returns {{ title, author, wordCount, path }}
 */
export function getMetadata(path) {
  return sendCommand(path, { type: 'get-metadata' })
}

// ── Comment ID mapping ──────────────────────────────────────────────

export function mapCommentId(shouldersId, wordCommentId) {
  commentIdMap.set(shouldersId, wordCommentId)
  reverseCommentIdMap.set(wordCommentId, shouldersId)
}

export function getWordCommentId(shouldersId) {
  return commentIdMap.get(shouldersId)
}

export function getShouldersCommentId(wordCommentId) {
  return reverseCommentIdMap.get(wordCommentId)
}

// ── Initialization (call once after stores are ready) ────────────────

let initialized = false

/**
 * Initialize Word Bridge event handlers.
 * Wires up file-opened/closed → editorStore, @ai comments → chat.
 */
export function initWordBridge() {
  if (initialized) return
  initialized = true

  on('file-opened', async ({ path, metadata }) => {
    const { useEditorStore } = await import('../stores/editor')
    const editorStore = useEditorStore()
    editorStore.reconnectWordBridge(path, metadata)
  })

  on('file-closed', async ({ path }) => {
    const { useEditorStore } = await import('../stores/editor')
    const editorStore = useEditorStore()
    editorStore.disconnectWordBridge(path)
  })

  on('ai-comment', async ({ commentId, anchorText, commentText, path }) => {
    // Strip @ai/@shoulders prefix
    const text = commentText.replace(/^@(ai|shoulders)\s*/i, '').trim()
    if (!text) return

    // Build context message and route to chat
    const { useEditorStore } = await import('../stores/editor')
    const editorStore = useEditorStore()

    // Create a new chat session or use active one
    const fileName = path.split('/').pop()
    const contextMsg = `The user wrote a comment in Word on "${fileName}" anchored to the text: "${anchorText}"\n\nTheir comment: ${text}\n\nPlease respond to their comment. When done, use reply_to_comment to post your response back.`

    // Map the Word comment ID for future replies
    const shouldersId = `wb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    mapCommentId(shouldersId, commentId)

    // Open chat beside and send the message
    editorStore.openChatBeside({ prefill: contextMsg })
  })
}

// ── Event system ────────────────────────────────────────────────────

export function on(event, callback) {
  if (!listeners[event]) listeners[event] = new Set()
  listeners[event].add(callback)
  return () => listeners[event]?.delete(callback)
}

export function off(event, callback) {
  listeners[event]?.delete(callback)
}

function emit(event, data) {
  listeners[event]?.forEach(cb => {
    try { cb(data) } catch (err) { console.error(`[wordBridge] Event handler error (${event}):`, err) }
  })
}
