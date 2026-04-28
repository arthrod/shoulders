import { invoke } from '@tauri-apps/api/core'

const AGENTS = [
  // Tier 1
  {
    id: 'claude-code',
    name: 'Claude Code',
    badge: 'CC',
    binary: 'claude',
    command: 'claude',
    installUrl: 'https://docs.anthropic.com/en/docs/claude-code/overview',
    installCmd: 'npm i -g @anthropic-ai/claude-code',
    tier: 1,
  },
  {
    id: 'codex',
    name: 'Codex',
    badge: 'CX',
    binary: 'codex',
    command: 'codex',
    installUrl: 'https://github.com/openai/codex',
    installCmd: 'npm i -g @openai/codex',
    tier: 1,
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    badge: 'G',
    binary: 'gemini',
    command: 'gemini',
    installUrl: 'https://github.com/google/gemini-cli',
    installCmd: 'npm i -g @google/gemini-cli',
    tier: 1,
  },
  // Tier 2
  {
    id: 'crush',
    name: 'Crush',
    badge: 'CR',
    binary: 'crush',
    command: 'crush',
    installUrl: 'https://github.com/charmbracelet/crush',
    installCmd: 'brew install charmbracelet/tap/crush',
    tier: 2,
  },
  {
    id: 'aider',
    name: 'Aider',
    badge: 'AI',
    binary: 'aider',
    command: 'aider',
    installUrl: 'https://aider.chat',
    installCmd: 'pip install aider-chat',
    tier: 2,
  },
  {
    id: 'goose',
    name: 'Goose',
    badge: 'GO',
    binary: 'goose',
    command: 'goose',
    installUrl: 'https://github.com/block/goose',
    installCmd: 'brew install block-goose-cli',
    tier: 2,
  },
]

let _cache = null
let _cacheTime = 0
const CACHE_TTL = 60_000

/**
 * Detect installed agents by running `which <binary>` for each.
 * Results are cached for 60 seconds.
 */
export async function detectAgents() {
  const now = Date.now()
  if (_cache && (now - _cacheTime) < CACHE_TTL) return _cache

  const results = []

  for (const agent of AGENTS) {
    let installed = false
    let path = null
    try {
      const result = await invoke('run_shell_command', {
        command: `which ${agent.binary}`,
        cwd: '/tmp',
      })
      if (result && result.trim() && !result.includes('not found')) {
        installed = true
        path = result.trim()
      }
    } catch {
      // not found
    }
    results.push({ ...agent, installed, path })
  }

  _cache = results
  _cacheTime = now
  return results
}

export function invalidateCache() {
  _cache = null
  _cacheTime = 0
}

export function getTier1Agents(agents) {
  return agents.filter(a => a.tier === 1)
}

export function getTier2Agents(agents) {
  return agents.filter(a => a.tier === 2)
}

/**
 * Map agent ID → config file path (relative to workspace root).
 * Claude Code reads .claude/CLAUDE.md; most others read AGENTS.md;
 * Gemini CLI reads GEMINI.md.
 */
const AGENT_CONFIG_FILES = {
  'claude-code': 'CLAUDE.md',
  'codex': 'AGENTS.md',
  'gemini-cli': 'GEMINI.md',
  'crush': 'AGENTS.md',
  'aider': 'AGENTS.md',
  'goose': 'AGENTS.md',
}

/**
 * Build the context document content for an external agent.
 * Includes workspace orientation, CLI tool info, and user's project instructions.
 */
function buildAgentContext(workspace) {
  const instructions = workspace.instructions || ''

  let md = `# Shoulders Workspace

Research workspace with integrated reference management,
multi-format documents (Markdown, LaTeX, DOCX, Jupyter),
and version control.

Workspace: ${workspace.path}

## Tools

Shoulders exposes workspace-specific tools via the \`shoulders\`
CLI — reference search, citations, academic paper search,
document comments, notebooks, and more.

    shoulders --list                           # all tools
    shoulders search_references --query "..."  # local library
    shoulders cite_reference --key smith2024   # insert citation
    shoulders read_file --path "paper.docx"    # with comments
    shoulders search_papers --query "..."      # academic papers
    shoulders <tool> --help                    # parameters

Use \`shoulders read_file\` over native file reading for .docx
and document comments. Check the local reference library before
searching externally. Full catalog: .shoulders/tool-api.md
Shoulders documentation: https://shoulde.rs/docs
`

  if (instructions.trim()) {
    md += `\n## Project Instructions\n\n${instructions.trim()}\n`
  }

  return md
}

/**
 * Ensure the agent config file exists for the given agent.
 * Generated once — if the file already exists, it's left untouched
 * (the user may have edited it).
 */
export async function ensureAgentConfig(agentId, workspace) {
  const relativePath = AGENT_CONFIG_FILES[agentId]
  if (!relativePath || !workspace.path) return

  const fullPath = `${workspace.path}/${relativePath}`

  try {
    const exists = await invoke('path_exists', { path: fullPath })
    if (exists) return

    const content = buildAgentContext(workspace)
    await invoke('write_file', { path: fullPath, content })
  } catch (e) {
    console.warn(`[agentRegistry] Failed to write ${relativePath}:`, e)
  }
}

export { AGENTS }
