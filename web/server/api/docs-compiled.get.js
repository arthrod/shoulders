import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let cache = null

export default defineEventHandler(() => {
  if (!cache || import.meta.dev) {
    const base = import.meta.dev ? process.cwd() : join(process.cwd(), 'web', '.output')
    const raw = readFileSync(join(base, 'public', 'docs-compiled.json'), 'utf-8')
    cache = JSON.parse(raw)
  }
  return cache
})
