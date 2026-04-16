/* global Office, Word */

const BRIDGE_URL = 'wss://localhost:3001/ws'
const RECONNECT_DELAY = 3000
const SELECTION_POLL_INTERVAL = 5000

let ws = null
let reconnectTimer = null
let selectionTimer = null
let currentPath = null
let lastSelectionText = ''

// ── UI helpers ──────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id)

function setConnectionState(state) {
  // Show/hide the three view states
  $('connectedView')?.classList.toggle('hidden', state !== 'connected')
  $('disconnectedView')?.classList.toggle('hidden', state !== '')
  $('connectingView')?.classList.toggle('hidden', state !== 'connecting')
}

function setFileName(name) {
  const el = $('fileName')
  if (el) el.textContent = name || '--'
}

// ── Action feed ─────────────────────────────────────────────────────

const MAX_ACTIONS = 20
const actions = []

function addAction(type, message, isError = false) {
  actions.unshift({ type, message, timestamp: Date.now(), isError })
  if (actions.length > MAX_ACTIONS) actions.length = MAX_ACTIONS
  renderActions()
}

function renderActions() {
  const container = $('actionFeed')
  if (!container) return
  container.innerHTML = actions.map(a => {
    const time = new Date(a.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const cls = a.isError ? 'action-item error' : 'action-item'
    return `<div class="${cls}"><span class="action-text">${escapeHtml(a.message)}</span><span class="action-time">${time}</span></div>`
  }).join('')
  $('actionSection')?.classList.toggle('hidden', actions.length === 0)
}

function escapeHtml(text) {
  const d = document.createElement('div')
  d.textContent = text
  return d.innerHTML
}

// ── Office initialization ───────────────────────────────────────────

Office.onReady((info) => {
  if (info.host !== Office.HostType.Word) {
    // Not in Word — nothing to do
    return
  }

  $('retryBtn').addEventListener('click', connect)
  $('clearActionsBtn')?.addEventListener('click', () => { actions.length = 0; renderActions() })

  // Get the document path and connect
  initDocument()
})

async function initDocument() {
  try {
    const metadata = await getDocumentMetadata()
    currentPath = metadata.path
    setFileName(metadata.path ? metadata.path.split('/').pop() : metadata.title || 'Untitled')
    connect()
  } catch (err) {
    console.error('[taskpane] Error reading document:', err.message)
    connect() // Still try to connect
  }
}

// ── WebSocket connection ────────────────────────────────────────────

function connect() {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return

  clearTimeout(reconnectTimer)
  setConnectionState('connecting')
  // UI state handled by setConnectionState

  try {
    ws = new WebSocket(BRIDGE_URL)
  } catch (err) {
    onClose()
    return
  }

  ws.onopen = () => {
    // Send handshake
    ws.send(JSON.stringify({
      type: 'word-connect',
      path: currentPath,
      metadata: { title: currentPath?.split('/').pop() || 'Untitled' },
    }))
  }

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)
      handleMessage(msg)
    } catch (err) {
      console.error('[taskpane] Bad message:', err)
    }
  }

  ws.onclose = onClose
  ws.onerror = () => {} // onclose will fire after
}

function onClose() {
  ws = null
  setConnectionState('')
  // UI state handled by setConnectionState
  clearInterval(selectionTimer)
  selectionTimer = null

  // Auto-reconnect
  reconnectTimer = setTimeout(connect, RECONNECT_DELAY)
}

function send(msg) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}

// ── Message handling ────────────────────────────────────────────────

function handleMessage(msg) {
  if (msg.type === 'connected') {
    setConnectionState('connected')
    // UI state handled by setConnectionState
    addAction('connect', 'Connected to Shoulders')
    startSelectionPolling()
    reportFileOpened()
    registerCommentHandler()
    return
  }

  // Commands from Shoulders → execute in Word
  if (msg.requestId) {
    executeCommand(msg)
  }
}

async function executeCommand(msg) {
  try {
    let result
    switch (msg.type) {
      case 'read-document':
        result = await readDocument()
        addAction('read', 'Document read by Shoulders')
        break
      case 'insert-comment':
        result = await insertComment(msg.anchorText, msg.commentText, msg.author)
        addAction('comment', `Comment added: "${msg.commentText.substring(0, 60)}..."`)
        break
      case 'reply-comment':
        result = await replyComment(msg.wordCommentId, msg.replyText)
        addAction('comment', 'Reply added to comment')
        break
      case 'resolve-comment':
        result = await resolveComment(msg.wordCommentId)
        addAction('comment', 'Comment resolved')
        break
      case 'edit-text':
        result = await editText(msg.oldText, msg.newText, msg.trackChanges)
        addAction('edit', `Text edited${msg.trackChanges ? ' (tracked)' : ''}`)
        break
      case 'get-selection':
        result = await getSelection()
        break
      case 'get-metadata':
        result = await getDocumentMetadata()
        break
      default:
        throw new Error(`Unknown command: ${msg.type}`)
    }
    send({ type: 'response', requestId: msg.requestId, result })
  } catch (err) {
    addAction('error', `Failed: ${msg.type} — ${err.message}`, true)
    send({ type: 'response', requestId: msg.requestId, error: err.message })
  }
}

// ── Office.js operations ────────────────────────────────────────────

async function readDocument() {
  return Word.run(async (context) => {
    const body = context.document.body
    const paragraphs = body.paragraphs
    paragraphs.load('items/text,items/style,items/isListItem')

    const tables = body.tables
    tables.load('items/rowCount,items/values')

    const properties = context.document.properties
    properties.load('title,author')

    await context.sync()

    const paraList = []
    for (let i = 0; i < paragraphs.items.length; i++) {
      const p = paragraphs.items[i]
      paraList.push({ text: p.text, style: p.style, isListItem: p.isListItem })
    }

    const tableList = []
    for (let i = 0; i < tables.items.length; i++) {
      const t = tables.items[i]
      tableList.push({ rowCount: t.rowCount, rows: t.values })
    }

    const fullText = paraList.map(p => p.text).join('\n')
    const wordCount = fullText.split(/\s+/).filter(Boolean).length

    // Read comments from Word document
    let commentList = []
    try {
      const comments = body.getComments()
      comments.load('items')
      await context.sync()

      // Load details + anchor range for each comment
      const ranges = []
      for (const c of comments.items) {
        c.load('id,content,authorName,createdDate,resolved')
        const range = c.contentRange
        range.load('text')
        ranges.push(range)
      }
      await context.sync()

      commentList = comments.items.map((c, i) => ({
        id: c.id,
        content: c.content,
        author: c.authorName,
        date: c.createdDate,
        resolved: c.resolved,
        anchorText: ranges[i].text,
      }))
    } catch {
      // Comment API may not be available in older Word versions
    }

    return {
      text: fullText,
      metadata: {
        title: properties.title,
        author: properties.author,
        wordCount,
        path: currentPath,
      },
      paragraphs: paraList,
      tables: tableList,
      comments: commentList,
    }
  })
}

async function insertComment(anchorText, commentText, author) {
  return Word.run(async (context) => {
    const results = context.document.body.search(anchorText, { matchCase: false, matchWholeWord: false })
    results.load('items')
    await context.sync()

    if (results.items.length === 0) {
      throw new Error(`Anchor text not found: "${anchorText.substring(0, 80)}". Use raw document text, not formatted markers.`)
    }

    const range = results.items[0]
    const comment = range.insertComment(commentText)
    comment.load('id')
    await context.sync()

    return { success: true, wordCommentId: comment.id }
  })
}

async function replyComment(wordCommentId, replyText) {
  return Word.run(async (context) => {
    const comments = context.document.body.getComments()
    comments.load('items/id')
    await context.sync()

    const comment = comments.items.find(c => c.id === wordCommentId)
    if (!comment) throw new Error(`Comment ${wordCommentId} not found`)

    comment.reply(replyText)
    await context.sync()

    return { success: true }
  })
}

async function resolveComment(wordCommentId) {
  return Word.run(async (context) => {
    const comments = context.document.body.getComments()
    comments.load('items/id')
    await context.sync()

    const comment = comments.items.find(c => c.id === wordCommentId)
    if (!comment) throw new Error(`Comment ${wordCommentId} not found`)

    comment.resolve()
    await context.sync()

    return { success: true }
  })
}

async function editText(oldText, newText, trackChanges = true) {
  const SEARCH_LIMIT = 255

  return Word.run(async (context) => {
    if (trackChanges) {
      context.document.changeTrackingMode = Word.ChangeTrackingMode.trackAll
    }

    // Short strings: direct Body.search() — fast path
    if (oldText.length <= SEARCH_LIMIT) {
      const results = context.document.body.search(oldText, {
        matchCase: false, matchWholeWord: false,
      })
      results.load('items')
      await context.sync()

      if (results.items.length === 0) {
        throw new Error(`Text not found: "${oldText.substring(0, 80)}..."`)
      }

      results.items[0].insertText(newText, Word.InsertLocation.replace)
      await context.sync()
      return { success: true, matchCount: results.items.length }
    }

    // Long strings (>255 chars): paragraph iteration + two-anchor bracket.
    // Word.js search() has a hard 255-char limit. We bypass it by:
    // 1. Finding the paragraph via JS string matching (no limit)
    // 2. Searching for a short prefix and suffix to get two Range objects
    // 3. Combining them with expandTo() to cover the full text
    const paragraphs = context.document.body.paragraphs
    paragraphs.load('items/text')
    await context.sync()

    let matchPara = null
    for (const para of paragraphs.items) {
      if (para.text.includes(oldText)) {
        matchPara = para
        break
      }
    }
    if (!matchPara) {
      throw new Error(
        'Text not found in any single paragraph. ' +
        'If the text spans multiple paragraphs, break it into smaller edits.'
      )
    }

    // Two-anchor bracket: short prefix search + short suffix search
    const prefixLen = Math.min(200, oldText.length)
    const suffixLen = Math.min(200, oldText.length)
    const prefix = oldText.substring(0, prefixLen)
    const suffix = oldText.substring(oldText.length - suffixLen)

    const prefixResults = matchPara.search(prefix, {
      matchCase: false, matchWholeWord: false,
    })
    const suffixResults = matchPara.search(suffix, {
      matchCase: false, matchWholeWord: false,
    })
    prefixResults.load('items')
    suffixResults.load('items')
    await context.sync()

    if (prefixResults.items.length === 0 || suffixResults.items.length === 0) {
      throw new Error('Could not locate text boundaries within paragraph.')
    }

    // Combine: start of prefix range → end of suffix range
    const startRange = prefixResults.items[0]
    const endRange = suffixResults.items[suffixResults.items.length - 1]
    const fullRange = startRange.expandTo(endRange)

    fullRange.insertText(newText, Word.InsertLocation.replace)
    await context.sync()

    return { success: true, matchCount: 1 }
  })
}

async function getSelection() {
  return Word.run(async (context) => {
    const selection = context.document.getSelection()
    selection.load('text')

    // Also get the surrounding paragraph for context
    const para = selection.paragraphs.getFirst()
    para.load('text')
    await context.sync()

    return {
      selectedText: selection.text,
      paragraphContext: para.text,
    }
  })
}

async function getDocumentMetadata() {
  return Word.run(async (context) => {
    const properties = context.document.properties
    properties.load('title,author')
    await context.sync()

    // Try to get the file path from the document URL
    let path = null
    try {
      path = Office.context.document.url || null
      // Convert file:// URLs to paths
      if (path?.startsWith('file:///')) {
        path = decodeURIComponent(path.slice(7))
      } else if (path?.startsWith('file://')) {
        path = decodeURIComponent(path.slice(5))
      }
    } catch { /* not available */ }

    return {
      title: properties.title,
      author: properties.author,
      path,
    }
  })
}

// ── Event reporting ─────────────────────────────────────────────────

async function reportFileOpened() {
  try {
    const metadata = await getDocumentMetadata()
    currentPath = metadata.path || currentPath
    send({
      type: 'file-opened',
      path: currentPath,
      metadata,
    })
    setFileName(currentPath ? currentPath.split('/').pop() : metadata.title || 'Untitled')
  } catch (err) {
    console.error('[taskpane] Error reporting file:', err)
  }
}

// Note: AutoShow is handled by Rust ZIP injection (docx_tag.rs), not Office.js.
// Office.context.document.settings.set() stores custom properties, NOT
// webextension properties — it does NOT enable AutoShow.

function startSelectionPolling() {
  if (selectionTimer) return
  selectionTimer = setInterval(async () => {
    try {
      const sel = await getSelection()
      if (sel.selectedText && sel.selectedText !== lastSelectionText) {
        lastSelectionText = sel.selectedText
        send({
          type: 'selection-changed',
          path: currentPath,
          selectedText: sel.selectedText,
          paragraphContext: sel.paragraphContext,
        })
      }
    } catch { /* selection read failed, ignore */ }
  }, SELECTION_POLL_INTERVAL)
}

let commentHandlerRegistered = false

function registerCommentHandler() {
  if (commentHandlerRegistered) return
  commentHandlerRegistered = true

  // Poll for new comments with @ai prefix
  // Office.js onCommentAdded requires WordApi 1.4+
  try {
    Word.run(async (context) => {
      // Check if comment events are supported
      if (!context.document.body.onCommentAdded) {
        console.log('[taskpane] Comment events not supported in this Word version')
        return
      }

      context.document.body.onCommentAdded.add(async (event) => {
        try {
          await Word.run(async (ctx) => {
            const comments = ctx.document.body.getComments()
            comments.load('items/id,items/content,items/contentRange')
            await ctx.sync()

            // Check the most recently added comment for @ai prefix
            for (const comment of comments.items) {
              if (comment.content.startsWith('@ai') || comment.content.startsWith('@shoulders')) {
                // Get the anchor text
                const range = comment.contentRange
                range.load('text')
                await ctx.sync()

                send({
                  type: 'ai-comment',
                  commentId: comment.id,
                  anchorText: range.text,
                  commentText: comment.content,
                  path: currentPath,
                })
              }
            }
          })
        } catch (err) {
          console.error('[taskpane] Error handling comment event:', err)
        }
      })

      await context.sync()
    }).catch(() => {
      console.log('[taskpane] Could not register comment handler')
    })
  } catch {
    console.log('[taskpane] Comment events not available')
  }
}

// ── Lifecycle ───────────────────────────────────────────────────────

window.addEventListener('beforeunload', () => {
  if (ws?.readyState === WebSocket.OPEN) {
    send({ type: 'file-closed', path: currentPath })
  }
  clearInterval(selectionTimer)
  clearTimeout(reconnectTimer)
  ws?.close()
})
