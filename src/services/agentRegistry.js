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

export { AGENTS }
