import { ai, ui, workspace, inputs } from '@shoulders/workflow'

// ── Config ─────────────────────────────────────────────────────────

const question = inputs.research_question
if (!question) ui.error('No research question provided.')

const maxResults = parseInt(inputs.max_results || '100')
const slug = question.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50).replace(/-$/, '')
const outDir = `scoping-review/${slug}`
const searchDate = new Date().toISOString().split('T')[0]

// ── Helpers ────────────────────────────────────────────────────────

function csvEscape(val) {
  const s = String(val ?? '').replace(/\r?\n/g, ' ')
  return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// ── Step 1: PICO Analysis ──────────────────────────────────────────

ui.step('Analyzing question')

let pico = null

await ai.generate({
  system: `Medical librarian specializing in systematic reviews.

Analyze the research question using PICO (Population, Intervention, Comparator, Outcome). Then design a concise questionnaire to refine search scope.

Generate a form schema: keys are field names, values are { type: "select", label, options } or { type: "text", label, placeholder }. Prefer "select" where options are clear. 3-6 questions max. Keep labels short.

Call submit_analysis with your PICO breakdown, form schema, and one-sentence summary.`,
  prompt: question,
  customTools: {
    submit_analysis: {
      description: 'Submit PICO analysis and questionnaire schema.',
      parameters: {
        type: 'object',
        properties: {
          pico: {
            type: 'object',
            properties: {
              population: { type: 'string' },
              intervention: { type: 'string' },
              comparator: { type: 'string' },
              outcome: { type: 'string' },
            },
            required: ['population', 'intervention', 'comparator', 'outcome'],
          },
          form_schema: { type: 'object', additionalProperties: true },
          summary: { type: 'string' },
        },
        required: ['pico', 'form_schema', 'summary'],
      },
      execute: async (data) => { pico = data; return 'OK' },
    },
  },
})

if (!pico) ui.error('Failed to analyze research question.')
ui.complete(pico.summary)

// ── Step 2: Scope Refinement ───────────────────────────────────────

const answers = await ui.form(pico.form_schema)

// ── Step 3+4: Search Strategy Loop ─────────────────────────────────

let selectedStrategy = null
let refinement = null

while (!selectedStrategy) {
  ui.step(refinement ? 'Refining strategy' : 'Developing search strategies')

  let strategies = null

  await ai.generate({
    system: `Medical librarian building PubMed search strategies.

Use search_pubmed to test queries and see real hit counts. Try MeSH terms, keywords, boolean operators. Iterate at least 5 queries to explore the space before proposing.

Propose 2-4 strategies via propose_strategies, ranging from focused to comprehensive.`,
    prompt: `Research: "${question}"

PICO: Population: ${pico.pico.population} | Intervention: ${pico.pico.intervention} | Comparator: ${pico.pico.comparator} | Outcome: ${pico.pico.outcome}

User preferences: ${JSON.stringify(answers)}${refinement ? `\n\nRefinement: "${refinement}"` : ''}

Test queries with search_pubmed, then call propose_strategies.`,
    customTools: {
      search_pubmed: {
        description: 'Test a PubMed query. Returns hit count and sample titles.',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string', description: 'PubMed search query (boolean operators, MeSH, field tags)' } },
          required: ['query'],
        },
        execute: async ({ query }) => {
          ui.log(`Testing: ${query}`)
          try {
            const raw = await workspace.exec(`curl -s "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=5&retmode=json"`)
            const data = JSON.parse(raw)
            const count = parseInt(data.esearchresult?.count || '0')
            const pmids = data.esearchresult?.idlist || []
            ui.log(`→ ${count.toLocaleString()} results`)

            if (!pmids.length) return JSON.stringify({ total_count: count, sample: [] })

            const sRaw = await workspace.exec(`curl -s "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${pmids.join(',')}&retmode=json"`)
            const summary = JSON.parse(sRaw)
            return JSON.stringify({
              total_count: count,
              sample: pmids.map(id => ({ pmid: id, title: summary.result?.[id]?.title || '' })),
            })
          } catch (e) {
            return JSON.stringify({ error: String(e) })
          }
        },
      },
      propose_strategies: {
        description: 'Propose 2-4 final search strategies for user review.',
        parameters: {
          type: 'object',
          properties: {
            strategies: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Short name (e.g., "Focused", "Balanced", "Comprehensive")' },
                  query: { type: 'string', description: 'Exact PubMed query string' },
                  count: { type: 'integer', description: 'Hit count from search_pubmed' },
                  rationale: { type: 'string', description: 'One-line explanation' },
                },
                required: ['name', 'query', 'count', 'rationale'],
              },
            },
          },
          required: ['strategies'],
        },
        execute: async (data) => { strategies = data.strategies; return 'OK' },
      },
    },
  })

  if (!strategies?.length) ui.error('No search strategies developed.')

  for (const s of strategies) ui.log(`${s.name} (${s.count.toLocaleString()}): ${s.rationale}`)
  ui.complete(`${strategies.length} strategies`)

  const sel = await ui.form({
    strategy: { type: 'select', label: 'Search strategy', options: strategies.map(s => s.name), required: true },
    refinement: { type: 'text', label: 'Refinement notes', placeholder: 'Leave empty to proceed with selected strategy...' },
  })

  if (sel.refinement?.trim()) {
    refinement = sel.refinement.trim()
  } else {
    selectedStrategy = strategies.find(s => s.name === sel.strategy) || strategies[0]
  }
}

// ── Step 5: Extraction ─────────────────────────────────────────────

ui.step('Extracting from PubMed')
await workspace.exec(`mkdir -p "${outDir}"`)

let papers = []
let totalFound = 0

function parseArticleXml(xml) {
  const parsed = []
  for (const block of xml.split(/<PubmedArticle>|<PubmedBookArticle>/)) {
    const pmidMatch = block.match(/<PMID[^>]*>(\d+)<\/PMID>/)
    if (!pmidMatch) continue

    const titleMatch = block.match(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/)
    const journalMatch = block.match(/<ISOAbbreviation>([\s\S]*?)<\/ISOAbbreviation>/)
      || block.match(/<MedlineTA>([\s\S]*?)<\/MedlineTA>/)
    const yearMatch = block.match(/<Year>(\d{4})<\/Year>/)
      || block.match(/<MedlineDate>(\d{4})/)
    const doiMatch = block.match(/<ArticleId IdType="doi">([\s\S]*?)<\/ArticleId>/)
      || block.match(/<ELocationID EIdType="doi"[^>]*>([\s\S]*?)<\/ELocationID>/)

    const authors = [...block.matchAll(/<Author[\s>][\s\S]*?<\/Author>/g)].map(m => {
      const last = m[0].match(/<LastName>([\s\S]*?)<\/LastName>/)
      const init = m[0].match(/<Initials>([\s\S]*?)<\/Initials>/)
      return last ? `${last[1]} ${init?.[1] || ''}`.trim() : ''
    }).filter(Boolean)

    const abstractParts = [...block.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g)]
      .map(m => m[1].replace(/<[^>]+>/g, '').trim())

    parsed.push({
      pmid: pmidMatch[1],
      title: (titleMatch?.[1] || '').replace(/<[^>]+>/g, ''),
      authors: authors.join('; '),
      year: yearMatch?.[1] || '',
      journal: (journalMatch?.[1] || '').replace(/<[^>]+>/g, ''),
      doi: doiMatch?.[1] || '',
      abstract: abstractParts.join(' '),
    })
  }
  return parsed
}

try {
  // Search with PubMed history server (usehistory=y avoids passing PMID lists)
  const searchRaw = await workspace.exec(
    `curl -s "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(selectedStrategy.query)}&retmax=0&usehistory=y&retmode=json"`
  )
  const searchData = JSON.parse(searchRaw)

  if (searchData.esearchresult?.ERROR) {
    ui.log(`PubMed error: ${searchData.esearchresult.ERROR}`)
  }

  const webenv = searchData.esearchresult?.webenv
  const queryKey = searchData.esearchresult?.querykey
  totalFound = parseInt(searchData.esearchresult?.count || '0')
  const fetchCount = Math.min(totalFound, maxResults)

  if (!webenv || !queryKey || !fetchCount) {
    ui.error(`No results for query: ${selectedStrategy.query}`)
  }

  ui.log(`${totalFound.toLocaleString()} total, extracting ${fetchCount}`)

  // Fetch records in batches — write to file to avoid stdout truncation (efetch XML can be 2MB+)
  for (let start = 0; start < fetchCount; start += 100) {
    const batchSize = Math.min(100, fetchCount - start)
    ui.log(`Fetching ${start + 1}–${start + batchSize}...`)

    const tmpFile = `${outDir}/_batch.xml`
    await workspace.exec(
      `curl -s -o "${tmpFile}" "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&query_key=${queryKey}&WebEnv=${webenv}&retstart=${start}&retmax=${batchSize}&rettype=xml"`
    )
    const xml = await workspace.readFile(tmpFile)
    await workspace.exec(`rm -f "${tmpFile}"`)

    papers.push(...parseArticleXml(xml))
    ui.log(`${papers.length} records so far`)

    if (start + 100 < fetchCount) await workspace.exec('sleep 0.3')
  }
} catch (e) {
  ui.log(`Extraction error: ${e}`)
}

if (!papers.length) ui.error('Failed to extract any records from PubMed.')
ui.log(`${totalFound.toLocaleString()} total, extracted ${papers.length}`)
ui.complete(`${papers.length} records`)

// ── Step 6: Relevance Screening ────────────────────────────────────

ui.step('Screening papers')

const BATCH_SIZE = 20
const batches = chunk(papers, BATCH_SIZE)
const allScores = []
let scored = 0

ui.log(`${papers.length} papers, ${batches.length} parallel batches`)

const screeningSystem = `Relevance screener for a scoping literature review.

Research criteria:
- Population: ${pico.pico.population}
- Intervention: ${pico.pico.intervention}
- Comparator: ${pico.pico.comparator}
- Outcome: ${pico.pico.outcome}

Score each paper 0-5:
5 = Directly addresses the research question
4 = Addresses key aspects
3 = Possibly relevant, warrants full-text review
2 = Weakly related
1 = Not relevant
0 = Off-topic

One-sentence rationale per score. Call submit_scores with all assessments.`

const screenPromises = batches.map(batch =>
  ai.generate({
    model: 'haiku',
    system: screeningSystem,
    prompt: batch.map(p =>
      `PMID: ${p.pmid}\nTitle: ${p.title}\nAbstract: ${p.abstract ? p.abstract.slice(0, 1500) : '(no abstract)'}`
    ).join('\n\n---\n\n'),
    customTools: {
      submit_scores: {
        description: 'Submit relevance scores for this batch.',
        parameters: {
          type: 'object',
          properties: {
            scores: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  pmid: { type: 'string' },
                  score: { type: 'integer' },
                  rationale: { type: 'string' },
                },
                required: ['pmid', 'score', 'rationale'],
              },
            },
          },
          required: ['scores'],
        },
        execute: async (data) => {
          allScores.push(...data.scores)
          scored += data.scores.length
          ui.log(`${scored}/${papers.length} scored`)
          return 'OK'
        },
      },
    },
  })
)

const screenResults = await Promise.allSettled(screenPromises)
const failed = screenResults.filter(r => r.status === 'rejected').length
ui.complete(`${allScores.length} scored${failed ? `, ${failed} batches failed` : ''}`)

// ── Step 7: Results ────────────────────────────────────────────────

ui.step('Writing results')

const scoreMap = Object.fromEntries(allScores.map(s => [s.pmid, s]))
const results = papers.map(p => ({
  ...p,
  score: scoreMap[p.pmid]?.score ?? -1,
  rationale: scoreMap[p.pmid]?.rationale ?? 'Not screened',
})).sort((a, b) => b.score - a.score)

// CSV
const header = 'PMID,Title,Authors,Year,Journal,DOI,Abstract,Relevance Score,Rationale'
const rows = results.map(p =>
  [p.pmid, p.title, p.authors, p.year, p.journal, p.doi, p.abstract, p.score >= 0 ? p.score : '', p.rationale]
    .map(csvEscape).join(',')
)
await workspace.writeFile(`${outDir}/results.csv`, [header, ...rows].join('\n'))

// Score distribution
const dist = Array(6).fill(0)
for (const p of results) if (p.score >= 0 && p.score <= 5) dist[p.score]++
const high = dist[4] + dist[5]
const maybe = dist[3]
const low = dist[0] + dist[1] + dist[2]

// Search strategy doc
await workspace.writeFile(`${outDir}/search-strategy.md`, `# Search Strategy

**Research question:** ${question}
**Date:** ${searchDate}
**Database:** PubMed

## PICO

| | |
|---|---|
| Population | ${pico.pico.population} |
| Intervention | ${pico.pico.intervention} |
| Comparator | ${pico.pico.comparator} |
| Outcome | ${pico.pico.outcome} |

## Query

\`\`\`
${selectedStrategy.query}
\`\`\`

**Strategy:** ${selectedStrategy.name} | **Rationale:** ${selectedStrategy.rationale}
**Total PubMed results:** ${totalFound.toLocaleString()} | **Extracted:** ${papers.length}
`)

// Summary
const top = results.filter(p => p.score >= 4).slice(0, 10)
await workspace.writeFile(`${outDir}/summary.md`, `# Scoping Review Summary

**${question}**
${searchDate} | PubMed

## Flow

| Stage | Count |
|---|---|
| Records identified | ${totalFound.toLocaleString()} |
| Records extracted | ${papers.length} |
| Records screened | ${allScores.length} |
| Highly relevant (4-5) | ${high} |
| Possibly relevant (3) | ${maybe} |
| Unlikely relevant (0-2) | ${low} |

## Score Distribution

| Score | Count | % |
|---|---|---|
| 5 — Highly relevant | ${dist[5]} | ${papers.length ? Math.round(dist[5] / papers.length * 100) : 0}% |
| 4 — Relevant | ${dist[4]} | ${papers.length ? Math.round(dist[4] / papers.length * 100) : 0}% |
| 3 — Possibly relevant | ${dist[3]} | ${papers.length ? Math.round(dist[3] / papers.length * 100) : 0}% |
| 2 — Weakly related | ${dist[2]} | ${papers.length ? Math.round(dist[2] / papers.length * 100) : 0}% |
| 1 — Not relevant | ${dist[1]} | ${papers.length ? Math.round(dist[1] / papers.length * 100) : 0}% |
| 0 — Off-topic | ${dist[0]} | ${papers.length ? Math.round(dist[0] / papers.length * 100) : 0}% |

## Top Papers

${top.length ? top.map((p, i) => `${i + 1}. **${p.title}** (${p.year})\n   Score: ${p.score} — ${p.rationale}`).join('\n\n') : 'No papers scored 4 or above.'}
`)

await workspace.openFile(`${outDir}/results.csv`)
ui.complete('Done')

// ── Finish ─────────────────────────────────────────────────────────

ui.finish(`## Scoping Review Complete

**${totalFound.toLocaleString()}** records found | **${papers.length}** extracted | **${allScores.length}** screened

### Relevance
- **Highly relevant (4-5):** ${high} papers
- **Possibly relevant (3):** ${maybe} papers
- **Unlikely (0-2):** ${low} papers

### Output
- \`${outDir}/results.csv\`
- \`${outDir}/summary.md\`
- \`${outDir}/search-strategy.md\``)
