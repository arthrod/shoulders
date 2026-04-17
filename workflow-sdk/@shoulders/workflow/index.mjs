// @shoulders/workflow SDK — Web Worker runtime
// Runs inside a Web Worker in the Shoulders app.
// Communicates with the app via postMessage/onmessage.
//
// The store combines this file with the user's run.js into a single
// Worker blob. Everything runs inside an async IIFE so user code
// shares this closure and can reference ai, ui, workspace, inputs.

;(async () => { // <-- async IIFE: user code is appended after this

console.log('[workflow-sdk] IIFE started, setting up IPC...')

// ============================================================
// IPC Layer — postMessage transport
// ============================================================

const pending = new Map() // id -> { resolve, reject }
let idCounter = 1
const _customToolsByCall = new Map() // callId -> { toolName: { execute, ... } }

function send(msg) {
  self.postMessage(msg)
}

function sendAndWait(msg) {
  const id = String(idCounter++)
  msg.id = id
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    send(msg)
  })
}

// Incoming messages from the app
function _handleIncoming(msg) {
  // Skip streaming chunk messages — the app uses them for UI, not the SDK
  if (msg.type?.endsWith('.chunk')) return

  // Custom tool callback — app asks us to execute a workflow-defined tool
  if (msg.type === 'custom_tool.execute') {
    _handleCustomToolCallback(msg)
    return
  }

  // Response to a pending request
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    if (msg.error || msg.type?.endsWith('.error')) {
      reject(new Error(msg.error || 'Unknown error'))
    } else {
      resolve(msg)
    }
  }
}

async function _handleCustomToolCallback(msg) {
  // Look up tool by generateId (the ai.generate call that defined it)
  const callTools = msg.generateId ? _customToolsByCall.get(msg.generateId) : null
  const toolDef = callTools?.[msg.name]
  if (!toolDef?.execute) {
    send({ type: 'custom_tool.result', id: msg.id, output: `Unknown custom tool: ${msg.name}`, isError: true })
    return
  }
  try {
    let output = await toolDef.execute(msg.input)
    if (typeof output !== 'string') output = JSON.stringify(output)
    send({ type: 'custom_tool.result', id: msg.id, output })
  } catch (e) {
    send({ type: 'custom_tool.result', id: msg.id, output: `Error: ${e.message}`, isError: true })
  }
}

// ============================================================
// Global error handlers
// ============================================================

self.onerror = (event) => {
  const message = typeof event === 'string' ? event : event?.message || 'Unknown error'
  send({ type: 'ui.error', message: `Uncaught error: ${message}` })
  self.close()
}

self.onunhandledrejection = (event) => {
  const message = event?.reason?.message || String(event?.reason || 'Unknown rejection')
  send({ type: 'ui.error', message: `Unhandled rejection: ${message}` })
  self.close()
}

// ============================================================
// Wait for init message with inputs + config
// ============================================================

console.log('[workflow-sdk] Waiting for init message...')

const { inputs: _initInputs, config: _initConfig } = await new Promise((resolve) => {
  self.onmessage = (event) => {
    console.log('[workflow-sdk] Received message:', event.data?.type)
    if (event.data?.type === 'init') {
      resolve(event.data)
    }
  }
})

console.log('[workflow-sdk] Init received, config:', JSON.stringify(_initConfig).slice(0, 100))
const _config = _initConfig || {}

// Now install the real message handler
self.onmessage = (event) => _handleIncoming(event.data)

// ============================================================
// inputs — from init message
// ============================================================

const inputs = _initInputs || {}

// ============================================================
// ui — progress reporting + user interaction
// ============================================================

const ui = {
  step(name) { send({ type: 'ui.step', name }) },
  log(message) { send({ type: 'ui.log', message }) },
  complete(summary) { send({ type: 'ui.complete', summary }) },

  finish(output) {
    send({ type: 'ui.finish', output })
    self.close()
  },

  error(message) {
    send({ type: 'ui.error', message })
    self.close()
  },

  async chat(prompt) {
    const res = await sendAndWait({ type: 'ui.chat', prompt })
    return res.text
  },
  async confirm(message) {
    const res = await sendAndWait({ type: 'ui.confirm', message })
    return res.confirmed
  },
  async approve({ title, details }) {
    const res = await sendAndWait({ type: 'ui.approve', title, details })
    return res.result
  },
  async form(schema) {
    const res = await sendAndWait({ type: 'ui.form', schema })
    return res.values
  },
  async pickModel() {
    const res = await sendAndWait({ type: 'ui.pickModel' })
    return res.modelId
  },
}

// ============================================================
// workspace — file operations + app automation
// ============================================================

const workspace = {
  async readFile(path) {
    const res = await sendAndWait({ type: 'workspace.readFile', path })
    return res.content
  },
  async writeFile(path, content) {
    await sendAndWait({ type: 'workspace.writeFile', path, content })
  },
  async listFiles(dir) {
    const res = await sendAndWait({ type: 'workspace.listFiles', dir: dir || _config.workflowDir })
    return res.files
  },
  async searchContent(query) {
    const res = await sendAndWait({ type: 'workspace.searchContent', query })
    return res.results
  },
  async readReferences() {
    const res = await sendAndWait({ type: 'workspace.readReferences' })
    return res.references
  },
  async openFile(path, options = {}) {
    await sendAndWait({ type: 'workspace.openFile', path, options })
  },
  async addComments(path, annotations) {
    await sendAndWait({ type: 'workspace.addComments', path, annotations })
  },
  async insertText(path, position, text) {
    await sendAndWait({ type: 'workspace.insertText', path, position, text })
  },
  async addReference(entry) {
    await sendAndWait({ type: 'workspace.addReference', entry })
  },
  async exec(command) {
    const res = await sendAndWait({ type: 'workspace.exec', command })
    return res.output
  },
  async parseExcel(path) {
    const res = await sendAndWait({ type: 'workspace.parseExcel', path })
    return { sheets: res.sheets || [] }
  },
  async parseDocx(path) {
    const res = await sendAndWait({ type: 'workspace.parseDocx', path })
    return { markdown: res.markdown || '', tables: res.tables || [] }
  },
}

// ============================================================
// ai — AI generation (tool loop runs app-side)
// ============================================================

const ai = {
  async generate({ prompt, tools = [], system, model, customTools = {}, files = [] }) {
    const allowedTools = _config.tools || []
    const invalidTools = tools.filter((t) => !allowedTools.includes(t))
    if (invalidTools.length > 0) {
      throw new Error(
        `Tools not in whitelist: ${invalidTools.join(', ')}. Allowed: ${allowedTools.join(', ')}`
      )
    }

    // Per-call custom tool registration (supports parallel ai.generate calls)
    const callId = String(idCounter++)
    _customToolsByCall.set(callId, customTools)

    const customToolDefs = Object.entries(customTools).map(([name, def]) => ({
      name,
      description: def.description,
      parameters: def.parameters || { type: 'object', properties: {} },
    }))

    try {
      const msg = {
        type: 'ai.generate',
        prompt,
        tools,
        customToolDefs: customToolDefs.length > 0 ? customToolDefs : undefined,
        files: files.length > 0 ? files : undefined,
        system: system || undefined,
        model: model || undefined,
      }
      msg.id = callId

      const res = await new Promise((resolve, reject) => {
        pending.set(callId, { resolve, reject })
        send(msg)
      })

      return {
        output: res.output || '',
        summary: (res.output || '').slice(0, 200),
        toolCalls: res.toolCalls || [],
        usage: res.usage || {},
      }
    } finally {
      _customToolsByCall.delete(callId)
    }
  },
}

// ============================================================
// User code follows (appended by the store, import line stripped)
// ============================================================

console.log('[workflow-sdk] SDK ready, running user code...')

