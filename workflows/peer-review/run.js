import { ai, ui, workspace, inputs } from '@shoulders/workflow'

// ── System Prompts ────────────────────────────────────────────

const TECHNICAL_SYSTEM_PROMPT = `You are a senior academic peer reviewer specializing in quantitative methods, statistical analysis, and research methodology. You are thorough, precise, and constructive.

Your role: Review the submitted research paper for statistical and methodological rigour.

Focus areas:
- Statistical methods: appropriateness, assumptions, implementation
- Effect sizes and confidence intervals: reported and interpreted correctly
- Sample size: justified, adequate for the analyses performed
- Multiple comparisons: controlled appropriately
- Missing data: handled and reported
- Study design: threats to internal/external validity
- Quantitative reporting: numbers, percentages, p-values reported accurately and consistently
- Reproducibility: methods described with sufficient detail

If the manuscript uses a specific methodology, apply relevant standards:
- RCTs: randomization, allocation concealment, blinding, ITT analysis
- Observational studies: confounding control, selection of covariates
- Meta-analyses: search strategy, heterogeneity assessment, publication bias
- Qualitative research: note that statistical criteria do not apply, and assess methodological rigour (sampling, saturation, reflexivity) instead

IMPORTANT: You MUST call the "submit_review" tool to submit your comments. Do not just write them as text. Call submit_review with your comments array.

Each comment must:
1. Quote an EXACT snippet from the paper (text_snippet) — must be a verbatim substring that appears in the document
2. Provide a specific, actionable comment
3. Rate severity: "major" (threatens validity), "minor" (should fix), "suggestion" (optional improvement)

If anchoring fails (snippets not found), the document may have been edited since you read it. Use read_file to re-read the current version and adjust your snippets. Only resubmit the failed comments.

If the manuscript has no quantitative methods (e.g., a theoretical paper), say so and focus on logical rigour instead. Do not fabricate issues.

Be thorough but fair. Aim for 8-20 comments. Focus on substance, not style.`

const EDITORIAL_SYSTEM_PROMPT = `You are a senior academic peer reviewer specializing in scientific writing, argumentation, and reporting standards. You are thorough, precise, and constructive.

Your role: Review the submitted research paper for clarity, logical structure, and adherence to reporting standards.

Focus areas:
- Argumentation: claims supported by evidence, logical flow, no overgeneralisation
- Abstract: complete, accurate summary of the paper
- Introduction: clear rationale, well-defined objectives/hypotheses
- Discussion: results interpreted (not restated), limitations acknowledged, conclusions proportionate to evidence
- Language and clarity: ambiguous phrasing, jargon without definition, grammatical issues that affect meaning
- Reporting standards: if applicable, check against CONSORT (RCTs), STROBE (observational), CHEERS (health economics), PRISMA (systematic reviews). Pick at most ONE relevant standard.
- Structure: logical section flow, appropriate use of headings
- Citations: claims that need references but lack them

IMPORTANT: You MUST call the "submit_review" tool to submit your comments. Do not just write them as text. Call submit_review with your comments array.

Each comment must:
1. Quote an EXACT snippet from the paper (text_snippet) — must be a verbatim substring that appears in the document
2. Provide a specific, actionable comment
3. Rate severity: "major" (fundamental issue), "minor" (should address), "suggestion" (optional improvement)

If anchoring fails (snippets not found), the document may have been edited since you read it. Use read_file to re-read the current version and adjust your snippets. Only resubmit the failed comments.

Be thorough but fair. Aim for 8-20 comments. Focus on substance.`

const REFERENCE_SYSTEM_PROMPT = `You are a meticulous academic reference and citation auditor.

OBJECTIVE: Verify the accuracy of bibliography entries and audit citation coverage in the submitted paper. Use the search_papers tool to look up references in academic databases, then use your judgment to assess what you find.

TOOLS:
- search_papers: Searches academic databases (OpenAlex, Crossref). Use it to verify individual references by title, author, or DOI. You can call this tool multiple times.
- submit_citation_report: Submit your findings when done. Summary is required, comments are optional — only include them for genuine issues.

GUIDANCE:
- For each reference, compare what the paper claims vs what the databases return. Are they the SAME paper? Check title, authors, year, journal — not just keywords.
- If the tool returns nothing, the reference could not be verified externally. Books, reports, and non-indexed sources won't appear — that's normal. But journal articles and conference papers should.
- Scan the full text for citation coverage: every in-text citation [N] should have a bibliography entry, and every entry should be cited.
- Year ±1 is normal (preprint vs published). Minor author name spelling variations are normal. Don't flag these.
- DO flag: wrong journal, wrong year (>1 off), wrong title, fabricated-looking references, phantom citations, uncited bibliography entries.

Each comment must quote an EXACT snippet from the paper (text_snippet) as a verbatim substring.

If anchoring fails (snippets not found), the document may have been edited since you read it. Use read_file to re-read the current version and adjust your snippets. Only resubmit the failed comments.

You MUST call submit_citation_report to complete your review.`

const REPORT_SYSTEM_PROMPT = `You are a senior academic peer reviewer writing a summary report. The reader will also see every inline comment anchored in the document — your summary orients them, it does not repeat the comments.

Scale your summary to the paper: a short letter needs a short summary; a long methods paper needs more. The summary must always fit on one page (≤400 words). For minor papers or few comments, a single paragraph may suffice.

Use this structure, but skip or compress sections that have nothing substantive to say:

## Peer Review Summary

### General Impression
What the paper does and how well it does it.

### Strengths
Only if there are genuine, specific strengths worth highlighting.

### Key Issues
The most important problems, grouped by theme. Reference inline comment numbers in brackets (e.g. [3, 7]). Do not explain what the comments already say — just identify the theme and point to them.

### Bibliography & Citations
Only if citation issues were flagged.

### Overall Assessment
A concluding sentence or two. Specific and qualitative — no numerical scores.

Be direct. No filler, no hedging, no restating the inline comments.`

// ── Anchor Validation ────────────────────────────────────────

function validateAnchors(comments, plainText) {
  const valid = []
  const invalid = []

  for (const comment of comments) {
    if (!comment.text_snippet) {
      invalid.push({ ...comment, reason: 'Missing text_snippet' })
      continue
    }

    const snippet = comment.text_snippet.trim()
    if (snippet.length < 5) {
      invalid.push({ ...comment, reason: 'Snippet too short (< 5 chars)' })
      continue
    }

    if (plainText.includes(snippet)) {
      valid.push(comment)
    } else {
      const normalizedText = plainText.replace(/\s+/g, ' ')
      const normalizedSnippet = snippet.replace(/\s+/g, ' ')
      if (normalizedText.includes(normalizedSnippet)) {
        valid.push({ ...comment, text_snippet: normalizedSnippet })
      } else {
        invalid.push({ ...comment, reason: 'Snippet not found in document' })
      }
    }
  }

  return { valid, invalid }
}

// ── Shared State ─────────────────────────────────────────────

const allInserted = []
let citationSummary = null

// ── Submit Review Handler ────────────────────────────────────

async function handleSubmitReview(comments, reviewer) {
  // Re-read CURRENT document (handles real-time user edits)
  const currentDoc = await workspace.readFile(inputs.document)
  const { valid, invalid } = validateAnchors(comments, currentDoc)

  // Deduplicate against already-inserted comments
  const newComments = valid.filter(c => {
    const normSnippet = (c.text_snippet || '').trim().replace(/\s+/g, ' ')
    return !allInserted.some(existing =>
      existing.normSnippet === normSnippet || existing.content?.trim() === c.content?.trim()
    )
  })

  // Insert immediately into document
  if (newComments.length > 0) {
    const annotations = newComments.map(c => ({
      anchor_text: c.text_snippet,
      content: `[${reviewer}] ${c.content}`,
      severity: c.severity,
      author: 'ai',
    }))
    await workspace.addComments(inputs.document, annotations)

    // Track for dedup + report numbering
    allInserted.push(...newComments.map(c => ({
      ...c,
      reviewer,
      normSnippet: (c.text_snippet || '').trim().replace(/\s+/g, ' '),
    })))
  }

  if (invalid.length === 0) {
    return JSON.stringify({ success: true, accepted: newComments.length, total: allInserted.length })
  }

  return JSON.stringify({
    success: false,
    accepted: newComments.length,
    total: allInserted.length,
    failed: invalid.map(c => ({
      text_snippet: c.text_snippet,
      reason: c.reason,
      content: c.content,
      severity: c.severity,
    })),
    instruction: `${newComments.length} comments accepted and inserted into the document. ${invalid.length} failed — snippets not found in the current document. The user may have edited the document. You can use read_file to re-read the current document. Fix each text_snippet to be an exact verbatim quote from the CURRENT document, then call submit_review again with ONLY the corrected comments.`,
  })
}

// ── Submit Review Tool Schema ────────────────────────────────

const SUBMIT_REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    comments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text_snippet: { type: 'string', description: 'Exact verbatim quote from the paper' },
          content: { type: 'string', description: 'Your review comment' },
          severity: { type: 'string', enum: ['major', 'minor', 'suggestion'] },
        },
        required: ['text_snippet', 'content', 'severity'],
      },
    },
  },
  required: ['comments'],
}

// ── Agent Runners ────────────────────────────────────────────

async function runTechnicalAgent(doc, focusNote) {
  return ai.generate({
    prompt: `Review the following manuscript for technical and methodological quality.${focusNote}\n\n<manuscript>\n${doc}\n</manuscript>`,
    system: TECHNICAL_SYSTEM_PROMPT,
    tools: ['read_file', 'search_papers'],
    customTools: {
      submit_review: {
        description: 'Submit your review comments. Each text_snippet must be an exact verbatim quote from the paper. You MUST call this tool to complete your review.',
        parameters: SUBMIT_REVIEW_SCHEMA,
        execute: (input) => handleSubmitReview(input.comments || [], 'Technical'),
      },
    },
  })
}

async function runEditorialAgent(doc, focusNote) {
  return ai.generate({
    prompt: `Review the following manuscript for structure, argumentation, and clarity.${focusNote}\n\n<manuscript>\n${doc}\n</manuscript>`,
    system: EDITORIAL_SYSTEM_PROMPT,
    tools: ['read_file', 'search_papers'],
    customTools: {
      submit_review: {
        description: 'Submit your review comments. Each text_snippet must be an exact verbatim quote from the paper. You MUST call this tool to complete your review.',
        parameters: SUBMIT_REVIEW_SCHEMA,
        execute: (input) => handleSubmitReview(input.comments || [], 'Editorial'),
      },
    },
  })
}

async function runReferenceAgent(doc) {
  // Early exit if no bibliography section
  if (!/\b(references|bibliography|works cited|literature cited)\b/i.test(doc)) {
    ui.log('Reference check: no bibliography section found, skipping.')
    return { output: '', skipped: true }
  }

  return ai.generate({
    prompt: `Check the references and citations in this paper:\n\n<manuscript>\n${doc}\n</manuscript>`,
    system: REFERENCE_SYSTEM_PROMPT,
    tools: ['read_file', 'search_papers'],
    customTools: {
      submit_citation_report: {
        description: 'Submit your citation and reference check report. Summary is required (1-3 sentences). Comments are optional — only include them for genuine issues.',
        parameters: {
          type: 'object',
          properties: {
            summary: { type: 'string', description: '1-3 sentence summary of the reference check' },
            comments: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  text_snippet: { type: 'string', description: 'Exact verbatim quote from the paper' },
                  content: { type: 'string', description: 'Description of the issue' },
                  severity: { type: 'string', enum: ['major', 'minor', 'suggestion'] },
                },
                required: ['text_snippet', 'content', 'severity'],
              },
            },
          },
          required: ['summary'],
        },
        execute: async (input) => {
          citationSummary = input.summary
          if (!input.comments?.length) {
            return JSON.stringify({ success: true, accepted: 0 })
          }
          return handleSubmitReview(input.comments, 'References')
        },
      },
    },
  })
}

// ── Read Document ─────────────────────────────────────────────

ui.step('Reading document')

const doc = await workspace.readFile(inputs.document)

if (!doc || doc.trim().length < 100) {
  ui.error('The document is empty or too short to review (fewer than 100 characters). Please select a manuscript with substantive content.')
}

const fileName = inputs.document.split('/').pop()
const wordCount = doc.split(/\s+/).filter(Boolean).length
const focusNote = inputs.focus
  ? `\n\nThe author specifically asked you to focus on: ${inputs.focus}. Give extra attention to this area, but do not neglect other issues you find.`
  : ''

ui.complete(`${fileName} — ${wordCount.toLocaleString()} words`)

// ── Guard: very short documents ───────────────────────────────

if (wordCount < 200) {
  ui.step('Writing Report')
  const shortReport = await ai.generate({
    prompt: `The following document is very short (${wordCount} words). Provide brief feedback on what is present and what would be needed for a full review.\n\n<manuscript>\n${doc}\n</manuscript>`,
    system: 'You are an academic peer reviewer. The document is too short for a full structured review. Provide constructive feedback on what is present and identify what major sections or content are missing. Keep your response under 200 words.',
  })
  ui.finish(shortReport.output)
  await new Promise(() => {}) // halt — ui.finish closes the Worker
}

// ── Parallel Review ──────────────────────────────────────────

ui.step('Reviewing manuscript')
ui.log('Starting technical, editorial, and reference review agents in parallel...')

const [techResult, editResult, refResult] = await Promise.allSettled([
  runTechnicalAgent(doc, focusNote),
  runEditorialAgent(doc, focusNote),
  runReferenceAgent(doc),
])

// Log results
const agentResults = [
  { name: 'Technical', result: techResult },
  { name: 'Editorial', result: editResult },
  { name: 'References', result: refResult },
]

let completedCount = 0
for (const { name, result } of agentResults) {
  if (result.status === 'fulfilled') {
    if (result.value?.skipped) {
      ui.log(`${name}: skipped (no bibliography section)`)
    } else {
      completedCount++
      const agentComments = allInserted.filter(c => c.reviewer === name)
      ui.log(`${name}: ${agentComments.length} comments inserted`)
    }
  } else {
    ui.log(`${name}: failed — ${result.reason?.message || 'Unknown error'}`)
  }
}

if (completedCount === 0 && !refResult.value?.skipped) {
  ui.error('All review agents failed. Please try again.')
  await new Promise(() => {})
}

ui.complete(`${allInserted.length} comments from ${completedCount} reviewers`)

// ── Report ────────────────────────────────────────────────────

ui.step('Writing report')

const commentsSummary = allInserted.map((c, i) =>
  `[${i + 1}] (${c.reviewer}, ${c.severity}) "${c.text_snippet?.slice(0, 80)}..." → ${c.content}`
).join('\n')

let reportPrompt = `Paper: "${fileName}" (~${wordCount.toLocaleString()} words), ${allInserted.length} inline comments.\n\n`
reportPrompt += `Inline reviewer comments:\n\n${commentsSummary}`
if (citationSummary) {
  reportPrompt += `\n\n---\n\nCitation & Reference check:\n${citationSummary}`
}
reportPrompt += '\n\nWrite the peer review summary.'

const report = await ai.generate({
  prompt: reportPrompt,
  system: REPORT_SYSTEM_PROMPT,
})

// ── Output ────────────────────────────────────────────────────

const summaryLines = []
if (allInserted.length > 0) {
  const majors = allInserted.filter(c => c.severity === 'major').length
  const minors = allInserted.filter(c => c.severity === 'minor').length
  const suggestions = allInserted.filter(c => c.severity === 'suggestion').length
  const parts = []
  if (majors > 0) parts.push(`${majors} major`)
  if (minors > 0) parts.push(`${minors} minor`)
  if (suggestions > 0) parts.push(`${suggestions} suggestion${suggestions > 1 ? 's' : ''}`)
  summaryLines.push(`**${allInserted.length} inline comments** inserted (${parts.join(', ')}). Open the document to review them in the margin.`)
}
if (citationSummary) {
  summaryLines.push(`**Citations:** ${citationSummary}`)
}

const finalOutput = `${summaryLines.join('\n\n')}\n\n---\n\n${report.output}`

ui.finish(finalOutput)
