/**
 * Tool Server — bridges the local HTTP API to the existing chatTools execute functions.
 *
 * Architecture:
 *   HTTP POST /api/tools/call → Rust Axum → Tauri event "tool-call-request"
 *     → this listener dispatches to getAiTools()[tool].execute(input)
 *     → invoke("tool_call_response", { id, result }) → Rust completes HTTP response
 */

import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { z } from 'zod'
import { getAiTools, TOOL_CATEGORIES } from './chatTools'

// ── Tool allowlist ────────────────────────────────────────────────
// Only expose domain-specific tools that CLI tools (Claude Code etc.)
// cannot do natively. File ops, shell, git are excluded.

const TOOL_SERVER_ALLOWLIST = new Set([
  // File reading (returns Shoulders comments + DOCX/notebook content that native reads miss)
  'read_file',
  // References
  'search_references', 'get_reference', 'add_reference', 'cite_reference', 'edit_reference',
  // Web research
  'web_search', 'search_papers', 'fetch_url',
  // Comments / feedback
  'add_comment', 'reply_to_comment', 'resolve_comment', 'create_proposal',
  // Notebooks
  'read_notebook', 'edit_cell', 'run_cell', 'run_all_cells', 'add_cell', 'delete_cell',
  // Canvas
  'read_canvas', 'add_node', 'edit_node', 'delete_node', 'move_node', 'add_edge', 'remove_edge',
])

let unlisten = null

/**
 * Start listening for tool-call-request events from the Rust tool server.
 * Must be called after the workspace is open.
 */
export function initToolServer(workspace) {
  if (unlisten) return // already listening

  listen('tool-call-request', async (event) => {
    const { id, tool, input } = event.payload

    // Special: schema request
    if (tool === '__schema__') {
      try {
        const schema = generateToolSchema(workspace)
        await invoke('tool_call_response', { id, result: schema, error: null })
      } catch (e) {
        await invoke('tool_call_response', { id, result: null, error: e.message || String(e) })
      }
      return
    }

    // Check allowlist
    if (!TOOL_SERVER_ALLOWLIST.has(tool)) {
      await invoke('tool_call_response', {
        id,
        result: null,
        error: `Tool "${tool}" is not available via the tool server. Only domain-specific tools are exposed.`,
      })
      return
    }

    // Check if workspace is open
    if (!workspace.path) {
      await invoke('tool_call_response', {
        id,
        result: null,
        error: 'No workspace is currently open in Shoulders.',
      })
      return
    }

    // Dispatch to the actual tool
    const tools = getAiTools(workspace)
    const t = tools[tool]
    if (!t) {
      await invoke('tool_call_response', {
        id,
        result: null,
        error: `Tool "${tool}" is disabled or does not exist.`,
      })
      return
    }

    try {
      const result = await t.execute(input || {})
      // Serialize — some tools return strings, some return objects
      const serialized = typeof result === 'string' ? result : result
      await invoke('tool_call_response', { id, result: serialized, error: null })
    } catch (e) {
      await invoke('tool_call_response', {
        id,
        result: null,
        error: e.message || String(e),
      })
    }
  }).then(fn => { unlisten = fn })
}

/**
 * Stop listening for tool server events.
 */
export function destroyToolServer() {
  if (unlisten) {
    unlisten()
    unlisten = null
  }
}

// ── Schema generation ─────────────────────────────────────────────

/**
 * Generate the tool schema list for GET /api/tools.
 * Returns an array of { name, description, category, input_schema }.
 */
function generateToolSchema(workspace) {
  const tools = getAiTools(workspace)
  const result = []

  for (const [name, t] of Object.entries(tools)) {
    if (!TOOL_SERVER_ALLOWLIST.has(name)) continue
    let inputSchema = { type: 'object', properties: {} }
    try {
      if (t.inputSchema) {
        inputSchema = z.toJSONSchema(t.inputSchema)
      }
    } catch { /* fallback to empty schema */ }

    // Find category from TOOL_CATEGORIES
    let category = ''
    for (const cat of TOOL_CATEGORIES) {
      const catTools = cat.tools || (cat.subgroups || []).flatMap(sg => sg.tools)
      if (catTools.some(ct => ct.name === name)) {
        category = cat.label
        break
      }
    }

    result.push({ name, description: t.description, category, input_schema: inputSchema })
  }

  return result
}

// ── Documentation generation ──────────────────────────────────────

/**
 * Generate tool-api.md and write it to .shoulders/tool-api.md.
 * Also writes the bearer token to .shoulders/tool-server-token.
 */
export async function writeToolDocs(workspace, port, token) {
  const tools = generateToolSchema(workspace)

  // Group by category
  const groups = {}
  for (const t of tools) {
    const cat = t.category || 'Other'
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(t)
  }

  let md = `# Shoulders Tool API

Local tool server at \`http://localhost:${port}\` — available when the Shoulders app is running.

## CLI Usage (preferred)

\`\`\`bash
shoulders --list                                    # list available tools
shoulders search_references --query "attention"     # call a tool
shoulders <tool> --help                             # show tool parameters
\`\`\`

## HTTP Usage

\`\`\`bash
# List all tools
curl -s http://localhost:${port}/api/tools \\
  -H "Authorization: Bearer $(cat .shoulders/tool-server-token)" | jq .

# Call a tool
curl -s -X POST http://localhost:${port}/api/tools/call \\
  -H "Authorization: Bearer $(cat .shoulders/tool-server-token)" \\
  -H "Content-Type: application/json" \\
  -d '{"tool": "search_references", "input": {"query": "attention mechanisms"}}'
\`\`\`

## Available Tools
`

  for (const [category, catTools] of Object.entries(groups)) {
    md += `\n### ${category}\n\n`
    for (const t of catTools) {
      md += `**${t.name}** — ${t.description}\n`
      // List input parameters
      const props = t.input_schema?.properties
      if (props && Object.keys(props).length > 0) {
        const required = new Set(t.input_schema.required || [])
        for (const [pName, pSchema] of Object.entries(props)) {
          const type = pSchema.type || 'any'
          const req = required.has(pName) ? '' : ', optional'
          const desc = pSchema.description || ''
          md += `- \`${pName}\` (${type}${req})${desc ? ': ' + desc : ''}\n`
        }
      }
      md += '\n'
    }
  }

  // Write docs and token
  const shouldersDir = workspace.path + '/.shoulders'
  try {
    await invoke('write_file', { path: shouldersDir + '/tool-api.md', content: md })
    await invoke('write_file', { path: shouldersDir + '/tool-server-token', content: token })
    await invoke('write_file', { path: shouldersDir + '/tool-server-port', content: String(port) })
  } catch (e) {
    console.warn('[toolServer] Failed to write docs:', e)
  }

}
