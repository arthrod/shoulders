// @shoulders/workflow SDK
// Runs inside a Bun subprocess. Communicates with the Shoulders app
// via stdin/stdout JSON lines.

import { createInterface } from 'node:readline'

// ============================================================
// Initialization — parse argv
// ============================================================

let _inputs = {}
let _config = {}

try {
  _inputs = JSON.parse(process.argv[2] || '{}')
  _config = JSON.parse(process.argv[3] || '{}')
} catch (e) {
  process.stderr.write(`Failed to parse arguments: ${e.message}\n`)
  process.exit(1)
}

// Custom tools registered by the current ai.generate() call.
// The app calls back to execute these via IPC.
let _customTools = {}

// ============================================================
// IPC Layer
// ============================================================

const rl = createInterface({ input: process.stdin, terminal: false })
const pending = new Map() // id -> { resolve, reject }
let idCounter = 1

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

function sendAndWait(msg) {
  const id = String(idCounter++)
  msg.id = id
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    send(msg)
  })
}

// Handle incoming messages from the app
rl.on('line', (line) => {
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    return // ignore malformed JSON
  }

  // Skip streaming chunk messages — the app uses them for UI, not the SDK
  if (msg.type?.endsWith('.chunk')) return

  // Custom tool callback — app asks us to execute a workflow-defined tool
  if (msg.type === 'custom_tool.execute') {
    _handleCustomToolCallback(msg)
    return
  }

  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    if (msg.error || msg.type?.endsWith('.error')) {
      reject(new Error(msg.error || 'Unknown error'))
    } else {
      resolve(msg)
    }
  }
})

// If stdin closes (app killed), reject all pending promises
rl.on('close', () => {
  for (const [, { reject }] of pending) {
    reject(new Error('Connection closed'))
  }
  pending.clear()
  process.exit(1)
})

// ============================================================
// Global error handlers
// ============================================================

process.on('uncaughtException', (err) => {
  send({ type: 'ui.error', message: `Uncaught error: ${err.message}` })
  setTimeout(() => process.exit(1), 50)
})

process.on('unhandledRejection', (err) => {
  send({ type: 'ui.error', message: `Unhandled rejection: ${err?.message || String(err)}` })
  setTimeout(() => process.exit(1), 50)
})

// ============================================================
// inputs — plain object from argv
// ============================================================

export const inputs = _inputs

// ============================================================
// ui — progress reporting + user interaction
// ============================================================

export const ui = {
  /** Set the current step name shown in the UI */
  step(name) {
    send({ type: 'ui.step', name })
  },

  /** Log a progress message */
  log(message) {
    send({ type: 'ui.log', message })
  },

  /** Mark the current step as complete with a summary */
  complete(summary) {
    send({ type: 'ui.complete', summary })
  },

  /** Finish the workflow successfully with final output (markdown) */
  finish(output) {
    send({ type: 'ui.finish', output })
    setTimeout(() => process.exit(0), 50)
  },

  /** Finish the workflow with an error */
  error(message) {
    send({ type: 'ui.error', message })
    setTimeout(() => process.exit(1), 50)
  },

  /** Ask the user a free-text question. Returns their response string. */
  async chat(prompt) {
    const res = await sendAndWait({ type: 'ui.chat', prompt })
    return res.text
  },

  /** Ask for yes/no confirmation. Returns boolean. */
  async confirm(message) {
    const res = await sendAndWait({ type: 'ui.confirm', message })
    return res.confirmed
  },

  /** Ask for approve/reject on an action. Returns 'approve' | 'reject'. */
  async approve({ title, details }) {
    const res = await sendAndWait({ type: 'ui.approve', title, details })
    return res.result
  },

  /** Show a form to the user. Returns an object of field values. */
  async form(schema) {
    const res = await sendAndWait({ type: 'ui.form', schema })
    return res.values
  },

  /** Let the user pick an AI model. Returns the model ID string. */
  async pickModel() {
    const res = await sendAndWait({ type: 'ui.pickModel' })
    return res.modelId
  },
}

// ============================================================
// workspace — file operations + app automation
// ============================================================

export const workspace = {
  /** Read a file's contents. Returns the content string. */
  async readFile(path) {
    const res = await sendAndWait({ type: 'workspace.readFile', path })
    return res.content
  },

  /** Write content to a file (creates or overwrites). */
  async writeFile(path, content) {
    await sendAndWait({ type: 'workspace.writeFile', path, content })
  },

  /** List files in a directory. Defaults to the workflow directory. */
  async listFiles(dir) {
    const res = await sendAndWait({ type: 'workspace.listFiles', dir: dir || _config.workflowDir })
    return res.files
  },

  /** Search file contents for a query string. Returns array of matches. */
  async searchContent(query) {
    const res = await sendAndWait({ type: 'workspace.searchContent', query })
    return res.results
  },

  /** Read all references from the project library. Returns CSL-JSON array. */
  async readReferences() {
    const res = await sendAndWait({ type: 'workspace.readReferences' })
    return res.references
  },

  /** Open a file in the editor. Options: { split: boolean }. */
  async openFile(path, options = {}) {
    await sendAndWait({ type: 'workspace.openFile', path, options })
  },

  /** Add inline annotations/comments to a file. */
  async addComments(path, annotations) {
    await sendAndWait({ type: 'workspace.addComments', path, annotations })
  },

  /** Insert text at a position in a file. Position: { line, ch }. */
  async insertText(path, position, text) {
    await sendAndWait({ type: 'workspace.insertText', path, position, text })
  },

  /** Add a reference entry to the project library. Entry is CSL-JSON. */
  async addReference(entry) {
    await sendAndWait({ type: 'workspace.addReference', entry })
  },
}

// ============================================================
// ai — AI generation (tool loop runs app-side)
// ============================================================

async function _handleCustomToolCallback(msg) {
  const toolDef = _customTools[msg.name]
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

export const ai = {
  /**
   * Generate an AI response. The app handles the full tool loop —
   * built-in tools execute app-side, custom tools callback to this process.
   *
   * @param {object} options
   * @param {string} options.prompt - The user prompt
   * @param {string[]} [options.tools=[]] - Built-in tool names to enable
   * @param {string} [options.system] - System prompt override
   * @param {string} [options.model] - Model ID override
   * @param {object} [options.customTools={}] - Custom tool definitions
   *   Each key is a tool name, value is { description, parameters, execute(input) }
   *
   * @returns {{ output: string, summary: string, toolCalls: object[], usage: object }}
   */
  async generate({ prompt, tools = [], system, model, customTools = {} }) {
    // Validate tools against the whitelist from workflow config
    const allowedTools = _config.tools || []
    const invalidTools = tools.filter((t) => !allowedTools.includes(t))
    if (invalidTools.length > 0) {
      throw new Error(
        `Tools not in whitelist: ${invalidTools.join(', ')}. Allowed: ${allowedTools.join(', ')}`
      )
    }

    // Register custom tools so the IPC handler can execute them on callback
    _customTools = customTools

    // Build custom tool definitions (schema only — app creates execute wrappers)
    const customToolDefs = Object.entries(customTools).map(([name, def]) => ({
      name,
      description: def.description,
      parameters: def.parameters || { type: 'object', properties: {} },
    }))

    try {
      // Single request — app runs the full tool loop and returns final result
      const res = await sendAndWait({
        type: 'ai.generate',
        prompt,
        tools,
        customToolDefs: customToolDefs.length > 0 ? customToolDefs : undefined,
        system: system || undefined,
        model: model || undefined,
      })

      return {
        output: res.output || '',
        summary: (res.output || '').slice(0, 200),
        toolCalls: res.toolCalls || [],
        usage: res.usage || {},
      }
    } finally {
      _customTools = {}
    }
  },
}
