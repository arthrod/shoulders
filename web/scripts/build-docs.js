import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import matter from 'gray-matter'
import markdownIt from 'markdown-it'
import container from 'markdown-it-container'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DOCS_DIR = path.join(__dirname, '../docs')
const PUBLIC_DIR = path.join(__dirname, '../public')

// --- Markdown renderer ---

const md = markdownIt({ html: true, typographer: true })

for (const type of ['tip', 'note', 'warning']) {
  md.use(container, type, {
    render(tokens, idx) {
      if (tokens[idx].nesting === 1) return `<div class="docs-callout docs-callout-${type}">\n`
      return '</div>\n'
    }
  })
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// --- Build ---

function build() {
  const files = fs.readdirSync(DOCS_DIR).filter(f => f.endsWith('.md') && f !== 'index.md')
  const docs = files.map(file => {
    const raw = fs.readFileSync(path.join(DOCS_DIR, file), 'utf-8')
    const { data, content } = matter(raw)
    if (!data.id || !data.title) {
      console.warn(`  ⚠ Skipping ${file}: missing id or title in frontmatter`)
      return null
    }
    return {
      id: data.id,
      title: data.title,
      subtitle: data.subtitle || '',
      group: data.group || 'Uncategorized',
      order: data.order ?? 99,
      markdown: content.trim(),
      html: `<h1>${escapeHtml(data.title)}</h1>\n<p class="docs-subtitle">${escapeHtml(data.subtitle)}</p>\n${md.render(content)}`
    }
  }).filter(Boolean).sort((a, b) => a.order - b.order)

  console.log(`Parsed ${docs.length} docs sections`)

  // 1. docs-compiled.json — web rendering
  const compiled = docs.map(({ id, title, subtitle, group, order, html }) => ({
    id, title, subtitle, group, order, html
  }))
  fs.writeFileSync(path.join(PUBLIC_DIR, 'docs-compiled.json'), JSON.stringify(compiled))
  console.log('  → docs-compiled.json')

  // 2. search-index.json — fuse.js search
  const searchIndex = []
  for (const doc of docs) {
    const lines = doc.markdown.split('\n')
    let currentTitle = doc.title
    let currentContent = ''
    let blockIdx = 0
    let inCodeBlock = false

    const flush = () => {
      const text = currentContent.trim()
      if (text.length > 2) {
        searchIndex.push({
          id: `${doc.id}-${blockIdx++}`,
          section: doc.id,
          title: currentTitle,
          content: text,
          url: `/docs?section=${doc.id}`
        })
      }
      currentContent = ''
    }

    for (const line of lines) {
      if (/^```/.test(line)) { inCodeBlock = !inCodeBlock; continue }
      if (inCodeBlock) continue

      const heading = line.match(/^#{1,3}\s+(.+)/)
      if (heading) { flush(); currentTitle = heading[1]; continue }

      // Skip container markers, table separators, empty lines
      if (/^:::/.test(line) || /^\|[-:\s|]+\|$/.test(line) || !line.trim()) continue

      // Strip markdown to plain text
      const plain = line
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/<[^>]+>/g, '')
        .replace(/^\s*[-*+]\s+/, '')
        .replace(/^\s*\d+\.\s+/, '')
        .replace(/^\||\|$/g, '').replace(/\|/g, ' ')
        .trim()

      if (plain.length > 2) currentContent += ' ' + plain
    }
    flush()
  }
  fs.writeFileSync(path.join(PUBLIC_DIR, 'search-index.json'), JSON.stringify(searchIndex, null, 2))
  console.log(`  → search-index.json (${searchIndex.length} blocks)`)

  // 3. llms.txt — structured index for AI agents
  const PRODUCT = `# Shoulders

> An AI workspace for researchers. Writing, reference management, coding, and AI assistance — designed as one system. Local-first, open source, multi-format.

Shoulders is a desktop application that integrates text editing, reference management, code execution, and AI assistance for researchers. It handles Markdown (with PDF export via Typst), LaTeX (via Tectonic), Word documents (.docx), Jupyter notebooks, and code files in a single workspace. Built on Tauri v2 (Rust + Vue 3), all files remain on the researcher's machine.`

  let llmsTxt = PRODUCT + '\n\n## Docs\n\n'
  for (const doc of docs) {
    llmsTxt += `- [${doc.title}](https://shoulde.rs/docs/${doc.id}.md): ${doc.subtitle}\n`
  }
  llmsTxt += `
## Full documentation

- [Documentation index](https://shoulde.rs/docs/index.md): Table of contents with links to each section as markdown
- [Complete docs in plain text](https://shoulde.rs/llms-full.txt): All documentation in a single file, suitable for LLM context

## About

- [About Shoulders](https://shoulde.rs/about): Mission and philosophy — AI research tools built with intention, preserving researcher agency
- [Pricing](https://shoulde.rs/pricing): Free with own API keys. Shoulders accounts include free AI usage during research preview.
- [Download](https://shoulde.rs/download): Desktop application for macOS
- [Enterprise](https://shoulde.rs/enterprise): Managed deployment, data governance, site licenses
- [GitHub](https://github.com/shoulders-ai/shoulders): Source code

## Optional

- [Terms of Service](https://shoulde.rs/terms)
- [Privacy Policy](https://shoulde.rs/privacy-policy)
`
  fs.writeFileSync(path.join(PUBLIC_DIR, 'llms.txt'), llmsTxt.trimEnd() + '\n')
  console.log('  → llms.txt')

  // 4. llms-full.txt — complete docs for LLM context windows
  let llmsFull = PRODUCT + '\n\nThis document contains the complete Shoulders documentation.\n\n'
  for (const doc of docs) {
    llmsFull += `---\n\n# ${doc.title}\n\n*${doc.subtitle}*\n\n${doc.markdown}\n\n`
  }
  fs.writeFileSync(path.join(PUBLIC_DIR, 'llms-full.txt'), llmsFull.trimEnd() + '\n')
  console.log('  → llms-full.txt')

  // 5. docs/index.md — markdown entry point
  const GROUP_ORDER = ['Start', 'Writing', 'AI Assistant', 'Automation', 'Workspace']
  const groups = {}
  for (const doc of docs) {
    if (!groups[doc.group]) groups[doc.group] = []
    groups[doc.group].push(doc)
  }
  let indexBody = ''
  for (const group of GROUP_ORDER) {
    if (!groups[group]) continue
    indexBody += `## ${group}\n\n`
    for (const doc of groups[group]) {
      indexBody += `- [${doc.title}](${doc.id}.md) — ${doc.subtitle}\n`
    }
    indexBody += '\n'
  }
  indexBody += '---\n\nFor the complete documentation in a single file, see [llms-full.txt](https://shoulde.rs/llms-full.txt).\n'

  // docs/index.md — for the /docs/index.md server route
  fs.writeFileSync(path.join(DOCS_DIR, 'index.md'),
    '---\ntitle: Shoulders Documentation\nsubtitle: Complete reference for the Shoulders AI workspace.\n---\n\n' + indexBody)
  console.log('  → docs/index.md')

  console.log('Done.')
}

// --- Run ---

build()

if (process.argv.includes('--watch')) {
  console.log('\nWatching for changes in docs/...')
  let debounce = null
  fs.watch(DOCS_DIR, { recursive: true }, (event, filename) => {
    if (!filename?.endsWith('.md')) return
    clearTimeout(debounce)
    debounce = setTimeout(() => {
      console.log(`\n${filename} changed, rebuilding...`)
      build()
    }, 100)
  })
}
