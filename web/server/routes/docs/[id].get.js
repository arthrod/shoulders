import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import matter from 'gray-matter'

export default defineEventHandler((event) => {
  let id = getRouterParam(event, 'id')
  if (id.endsWith('.md')) id = id.slice(0, -3)

  const base = import.meta.dev ? process.cwd() : join(process.cwd(), 'web')
  const filePath = join(base, 'docs', `${id}.md`)
  if (!existsSync(filePath)) {
    throw createError({ statusCode: 404, message: 'Documentation section not found' })
  }

  const raw = readFileSync(filePath, 'utf-8')
  const { data, content } = matter(raw)

  setResponseHeader(event, 'Content-Type', 'text/markdown; charset=utf-8')
  return `# ${data.title}\n\n*${data.subtitle}*\n\n${content.trim()}\n`
})
