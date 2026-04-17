import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let cache = null

export default defineEventHandler(() => {
  if (!cache || import.meta.dev) {
    const raw = readFileSync(join(process.cwd(), 'public', 'docs-compiled.json'), 'utf-8')
    cache = JSON.parse(raw)
  }
  return cache
})
