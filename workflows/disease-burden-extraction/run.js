import { ai, ui, workspace, inputs } from '@shoulders/workflow'

// ── Model Configuration ─────────────────────────────────────
// Model IDs must match entries in ~/.shoulders/models.json

const MODEL_EXTRACTION = 'gemini-flash'  // reads PDF + extracts data (needs vision)
const MODEL_ANALYSIS = 'haiku'           // R script, report
const MODEL_VERIFICATION = 'haiku'       // independent reviewer (switch to 'opus' for production)

// ── Parameter Types ──────────────────────────────────────────

const ALL_PARAMETERS = ['incidence', 'prevalence', 'mortality', 'survival', 'hospitalisations', 'diagnosis']

const PARAMETER_DEFINITIONS = `
- **Incidence**: New cases per population per time (e.g. per person-year).
- **Prevalence**: Existing cases as proportion of population at a point in time.
- **Mortality**: Deaths from the disease per population per time.
- **Survival**: Probability of surviving a period after diagnosis (0-1 or %).
- **Hospitalisations**: Hospital admissions per population per time.
- **Diagnosis**: Rate or proportion of cases clinically diagnosed.
`

// ── System Prompts ───────────────────────────────────────────

const EXTRACTION_SYSTEM_PROMPT = `You are an epidemiological data extraction specialist. Your task: read a PDF using the read_file tool, then extract all disease burden parameters by calling submit_extraction.

## What to extract
${PARAMETER_DEFINITIONS}

## Rules
1. Extract values EXACTLY as reported. Same units, same age bands. Do NOT convert or interpolate.
2. Record where each value appears (e.g. "Table 2 row 3", "Results paragraph 2").
3. Scan the ENTIRE paper — abstract, results, tables, discussion, appendices.
4. Extract confidence intervals separately (ci_lower, ci_upper) if reported.
5. If a parameter is not in the paper, list it in the missing array with a reason.
6. Do NOT fabricate values. If only in a figure and unreadable, say so.

## Process
1. Call read_file on the PDF path provided.
2. Extract all matching parameters.
3. Call submit_extraction ONCE with all data.

Do not output any text before calling submit_extraction. Just read the PDF and submit.`

const PROCESSING_SYSTEM_PROMPT = `You are an R programmer specializing in epidemiological data processing. Write a base R script that transforms raw extracted data into a standardised format for a microsimulation model.

## Input
The script reads from \`raw.csv\` in the working directory. Columns: parameter, value, unit, sex, age_range, subtype, country, year, source_location, ci_lower, ci_upper.

## Target format
Each output file has columns: value, sex, age_min, age_max, category_or_stage
- value: numeric, rates per 1 person, probabilities as 0-1
- sex: "male" or "female" (lowercase)
- age_min/age_max: integers for 5-year bands (0-4, 5-9, ..., 80-84, 85-110)
- category_or_stage: disease subtype or "all"

## Cleaning rules (comment each with rule number)
1. Lowercase column names with underscores.
2. Lowercase sex. If "both", duplicate row for male and female.
3. Drop ci_lower and ci_upper columns.
4. Convert units: per 100,000 → ÷100,000; per 10,000 → ÷10,000; % → ÷100; per-1 or 0-1 → no change.
5. Standardise age bands to 5-year intervals. Split wide bands (repeat value). Cap age_max at 110.
6. Parameter-specific:
   - Survival: ensure 0-1; add survival_time_length if time horizon known.
   - Hospitalisations: two columns (disease_specific, other). Set other=0 if unavailable.
   - Diagnosis: single row if scalar, value as rate 0-1.

## Requirements
- Base R only. No external packages.
- Idempotent. Read from raw.csv, write one CSV per parameter type.
- Print summary at end.
- Output the complete script in a single \`\`\`r code block. Nothing else.`

const REPORT_SYSTEM_PROMPT = `Write a concise extraction audit report. Under 300 words.

# Extraction Report
## Source — reference, DOI, country, study design (2-3 lines)
## Extracted — parameter name, count, dimensions (bulleted, 1 line each)
## Not Found — parameter, reason (1 line each)
## Transformations — rule number, what, why (1 line each)
## Flags — anything needing human review (bulleted)

No filler. No methodology. Just facts.`

const VERIFICATION_SYSTEM_PROMPT = `You are an independent data auditor. Check whether the extraction and processing are correct. Be ultra-concise.

Read the source PDF with read_file. Spot-check 5+ values from raw.csv against the paper. Scan the R script for logical errors. Check arithmetic on 2-3 processed values.

Output ONLY this format (no preamble, no methodology section, no spot-check tables):

## Verdict
**PASS** or **ISSUES FOUND**

## Issues
One line per issue. Only genuine errors — wrong numbers, misclassified data, broken logic.
- [CRITICAL] 36.4% male "survival" is actually OHCA proportion (Table X)
- [WARNING] CI bounds 216.66–229.01 do not match paper (217.0–228.7)

## Suggestions
One or two lines only, if relevant. Omit if nothing to add.

Total output: under 15 lines. If everything checks out, just write PASS and stop.`

// ── Helpers ──────────────────────────────────────────────────

function parseRBlock(text) {
  const match = text.match(/```r\n([\s\S]*?)\n```/)
  if (!match) {
    const plainMatch = text.match(/```\n([\s\S]*?)\n```/)
    return plainMatch ? plainMatch[1].trim() : null
  }
  return match[1].trim()
}

function extractSection(text, heading) {
  const regex = new RegExp(`##\\s*${heading}\\s*\\n([\\s\\S]*?)(?:\\n##\\s|$)`)
  const match = text.match(regex)
  return match ? match[1].trim() : ''
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
}

function parseParameters(input) {
  if (!input || !input.trim()) return ALL_PARAMETERS
  return input.toLowerCase().split(/[,;\s]+/).filter(p => ALL_PARAMETERS.includes(p.trim()))
}

function jsonToCsv(rows) {
  const cols = ['parameter', 'value', 'unit', 'sex', 'age_range', 'subtype', 'country', 'year', 'source_location', 'ci_lower', 'ci_upper']
  const escape = (v) => {
    const s = String(v ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.join(','), ...rows.map(r => cols.map(c => escape(r[c])).join(','))].join('\n')
}

function csvPreview(csv, maxRows = 12) {
  const lines = csv.trim().split('\n')
  if (lines.length <= maxRows + 1) return csv
  return lines.slice(0, maxRows + 1).join('\n') + `\n... (${lines.length - 1} total rows)`
}

function dataPreview(data, max = 10) {
  const preview = data.slice(0, max).map(r =>
    `${r.parameter} | ${r.value} ${r.unit} | ${r.sex} | ${r.age_range} | ${r.source_location}`
  ).join('\n')
  return data.length > max ? preview + `\n... (${data.length} total)` : preview
}

// ── Step 1: Read PDF + Extract Data ──────────────────────────

ui.step('Extracting from PDF')

const pdfPath = inputs.source_pdf
const fileName = pdfPath.split('/').pop()
const targetParams = parseParameters(inputs.parameters)
const paramList = targetParams.length === ALL_PARAMETERS.length ? 'all parameters' : targetParams.join(', ')
const conditionNote = inputs.condition ? ` The condition is: ${inputs.condition}.` : ''
const countryNote = inputs.country ? ` The target country is: ${inputs.country}.` : ''

let extractedData = null

const extractionResult = await ai.generate({
  prompt: `Read the PDF at "${pdfPath}" using read_file, then extract all disease burden parameters (${paramList}).${conditionNote}${countryNote} Call submit_extraction with the results.`,
  tools: ['read_file'],
  system: EXTRACTION_SYSTEM_PROMPT,
  model: MODEL_EXTRACTION,
  customTools: {
    submit_extraction: {
      description: 'Submit all extracted disease burden parameters. Call exactly once after reading the PDF.',
      parameters: {
        type: 'object',
        properties: {
          paper_title: { type: 'string', description: 'Paper title' },
          paper_year: { type: 'string', description: 'Publication year' },
          data: {
            type: 'array',
            description: 'Extracted data points',
            items: {
              type: 'object',
              properties: {
                parameter: { type: 'string', description: 'incidence/prevalence/mortality/survival/hospitalisations/diagnosis' },
                value: { type: 'number', description: 'Numeric value as reported' },
                unit: { type: 'string', description: 'Unit as reported (e.g. per 100,000, %, proportion)' },
                sex: { type: 'string', description: 'male/female/both/not_specified' },
                age_range: { type: 'string', description: 'Age range as reported (e.g. 40-49, 65+, all ages)' },
                subtype: { type: 'string', description: 'Disease subtype or "all"' },
                country: { type: 'string', description: 'Country or region' },
                year: { type: 'string', description: 'Data year or range' },
                source_location: { type: 'string', description: 'Where in the paper (e.g. Table 2 row 3)' },
                ci_lower: { type: 'number', description: '95% CI lower bound (omit if not reported)' },
                ci_upper: { type: 'number', description: '95% CI upper bound (omit if not reported)' },
              },
              required: ['parameter', 'value', 'unit', 'sex', 'age_range', 'source_location'],
            },
          },
          missing: {
            type: 'array',
            description: 'Parameters not found in the paper',
            items: {
              type: 'object',
              properties: {
                parameter: { type: 'string' },
                reason: { type: 'string' },
              },
              required: ['parameter', 'reason'],
            },
          },
          notes: { type: 'string', description: 'Extraction caveats or flags for review' },
        },
        required: ['data', 'missing', 'paper_title'],
      },
      execute: async (input) => {
        extractedData = input
        return `Received ${input.data.length} data points for ${[...new Set(input.data.map(d => d.parameter))].join(', ')}.`
      },
    },
  },
})

if (!extractedData || !extractedData.data?.length) {
  ui.error('No data extracted from the paper. The AI did not call submit_extraction or returned empty data.')
}

const data = extractedData.data
const missing = extractedData.missing || []
const notes = extractedData.notes || ''
const paperTitle = extractedData.paper_title || fileName.replace('.pdf', '')
const paperSlug = slugify(paperTitle)
const foundParams = [...new Set(data.map(d => d.parameter))]
const missingText = missing.map(m => `- **${m.parameter}**: ${m.reason}`).join('\n')

// Convert to CSV
let rawCsv = jsonToCsv(data)

ui.complete(`${data.length} data points — ${foundParams.join(', ')}`)

// ── Human Gate 1: Raw Extraction Review ──────────────────────

let approvedData = data
let approvedCsv = rawCsv
let extractionApproved = false

while (!extractionApproved) {
  const result = await ui.approve({
    title: 'Raw Extracted Data',
    details: `**${approvedData.length} values** for: ${foundParams.join(', ')}\n\n` +
      (missingText ? `**Not found:**\n${missingText}\n\n` : '') +
      `### Preview\n\`\`\`\n${csvPreview(approvedCsv)}\n\`\`\`\n\n` +
      (notes ? `### Notes\n${notes}` : ''),
  })

  if (result === 'approve') {
    extractionApproved = true
  } else {
    const feedback = await ui.chat('What needs to be corrected?')
    ui.step('Re-extracting')
    extractedData = null
    await ai.generate({
      prompt: `The reviewer found issues. Feedback: ${feedback}\n\nPrevious extraction had ${approvedData.length} rows. Re-read the PDF at "${pdfPath}" and call submit_extraction with corrected data.`,
      tools: ['read_file'],
      system: EXTRACTION_SYSTEM_PROMPT,
      model: MODEL_EXTRACTION,
      customTools: {
        submit_extraction: {
          description: 'Submit corrected extraction. Call exactly once.',
          parameters: {
            type: 'object',
            properties: {
              data: { type: 'array', items: { type: 'object', properties: { parameter: { type: 'string' }, value: { type: 'number' }, unit: { type: 'string' }, sex: { type: 'string' }, age_range: { type: 'string' }, subtype: { type: 'string' }, country: { type: 'string' }, year: { type: 'string' }, source_location: { type: 'string' }, ci_lower: { type: 'number' }, ci_upper: { type: 'number' } }, required: ['parameter', 'value', 'unit', 'sex', 'age_range', 'source_location'] } },
              missing: { type: 'array', items: { type: 'object', properties: { parameter: { type: 'string' }, reason: { type: 'string' } } } },
              notes: { type: 'string' },
              paper_title: { type: 'string' },
            },
            required: ['data', 'missing'],
          },
          execute: async (input) => { extractedData = input; return `Received ${input.data.length} data points.` },
        },
      },
    })
    if (extractedData?.data?.length) {
      approvedData = extractedData.data
      approvedCsv = jsonToCsv(approvedData)
    }
    ui.complete(`Re-extracted: ${approvedData.length} data points`)
  }
}

// ── Write raw.csv ────────────────────────────────────────────

const outputDir = `extractions/${paperSlug}`
await workspace.exec(`mkdir -p "${outputDir}"`)
await workspace.writeFile(`${outputDir}/raw.csv`, approvedCsv)
ui.log(`Saved raw.csv (${approvedData.length} rows)`)

// ── Step 2: Generate and Run R Script ────────────────────────

ui.step('Processing data')

const rResult = await ai.generate({
  prompt: `Write an R processing script for the following raw extracted data.\n\n\`\`\`csv\n${approvedCsv}\n\`\`\`\n\nRead from "raw.csv", write one CSV per parameter type. Found parameters: ${foundParams.join(', ')}.`,
  system: PROCESSING_SYSTEM_PROMPT,
  model: MODEL_ANALYSIS,
})

let rScript = parseRBlock(rResult.output)
if (!rScript) {
  ui.error('Failed to generate R processing script.')
}

await workspace.writeFile(`${outputDir}/process.R`, rScript)

// Execute with auto-repair
let rSuccess = false
let rAttempts = 0

while (!rSuccess && rAttempts <= 2) {
  try {
    const rOutput = await workspace.exec(`cd "${outputDir}" && Rscript process.R 2>&1`)
    ui.log(rOutput)
    rSuccess = true
  } catch (e) {
    rAttempts++
    const errorMsg = e.message || String(e)
    if (rAttempts > 2) {
      const userFix = await ui.chat(`R script failed after 3 attempts:\n\`\`\`\n${errorMsg}\n\`\`\`\nDescribe what to fix, or type "skip".`)
      if (userFix.toLowerCase().trim() === 'skip') break
      const fixResult = await ai.generate({
        prompt: `R script error: ${errorMsg}\nUser: ${userFix}\nScript:\n\`\`\`r\n${rScript}\n\`\`\`\nRaw data:\n\`\`\`csv\n${approvedCsv}\n\`\`\`\nFix it. Output complete script in \`\`\`r block.`,
        system: PROCESSING_SYSTEM_PROMPT, model: MODEL_ANALYSIS,
      })
      rScript = parseRBlock(fixResult.output) || rScript
      await workspace.writeFile(`${outputDir}/process.R`, rScript)
    } else {
      ui.log(`R error (attempt ${rAttempts}/3), repairing...`)
      const fixResult = await ai.generate({
        prompt: `R error:\n${errorMsg}\nScript:\n\`\`\`r\n${rScript}\n\`\`\`\nFix it. Output complete script in \`\`\`r block.`,
        system: PROCESSING_SYSTEM_PROMPT, model: MODEL_ANALYSIS,
      })
      rScript = parseRBlock(fixResult.output) || rScript
      await workspace.writeFile(`${outputDir}/process.R`, rScript)
    }
  }
}

// List output files
let processedFiles = []
if (rSuccess) {
  const lsOutput = await workspace.exec(`ls "${outputDir}"/*.csv 2>/dev/null || true`)
  processedFiles = lsOutput.trim().split('\n').filter(f => f.endsWith('.csv') && !f.endsWith('raw.csv'))
}

ui.complete(rSuccess ? `Generated ${processedFiles.length} parameter files` : 'R processing skipped')

// ── Human Gate 2: Processed Data Review ──────────────────────

if (rSuccess && processedFiles.length > 0) {
  let processedApproved = false

  while (!processedApproved) {
    let previewDetails = `**${processedFiles.length} output files**\n\n`
    for (const filePath of processedFiles) {
      const name = filePath.split('/').pop()
      const content = await workspace.readFile(filePath)
      const rows = content.trim().split('\n').length - 1
      previewDetails += `### ${name} (${rows} rows)\n\`\`\`\n${csvPreview(content, 6)}\n\`\`\`\n\n`
    }

    const result = await ui.approve({ title: 'Processed Data', details: previewDetails })

    if (result === 'approve') {
      processedApproved = true
    } else {
      const feedback = await ui.chat('What needs to be corrected?')
      ui.step('Regenerating R script')
      const fixResult = await ai.generate({
        prompt: `Feedback: ${feedback}\nR script:\n\`\`\`r\n${rScript}\n\`\`\`\nRaw:\n\`\`\`csv\n${approvedCsv}\n\`\`\`\nRevise. Output complete script in \`\`\`r block.`,
        system: PROCESSING_SYSTEM_PROMPT, model: MODEL_ANALYSIS,
      })
      rScript = parseRBlock(fixResult.output) || rScript
      await workspace.writeFile(`${outputDir}/process.R`, rScript)
      try {
        await workspace.exec(`cd "${outputDir}" && Rscript process.R 2>&1`)
        const lsOutput = await workspace.exec(`ls "${outputDir}"/*.csv 2>/dev/null || true`)
        processedFiles = lsOutput.trim().split('\n').filter(f => f.endsWith('.csv') && !f.endsWith('raw.csv'))
      } catch (e) {
        ui.log(`R error: ${e.message || e}`)
      }
      ui.complete('R script revised')
    }
  }
}

// ── Step 3: Report ───────────────────────────────────────────

ui.step('Writing report')

let processedSummary = ''
for (const f of processedFiles) {
  const content = await workspace.readFile(f)
  processedSummary += `- ${f.split('/').pop()}: ${content.trim().split('\n').length - 1} rows\n`
}

const reportResult = await ai.generate({
  prompt: `Source paper title: ${paperTitle}\nRaw data:\n\`\`\`csv\n${approvedCsv}\n\`\`\`\nMissing:\n${missingText || 'None'}\nNotes: ${notes || 'None'}\nR script:\n\`\`\`r\n${rScript}\n\`\`\`\nProcessed: ${processedSummary || 'Skipped'}\n${inputs.condition ? `Condition: ${inputs.condition}` : ''}\n${inputs.country ? `Country: ${inputs.country}` : ''}`,
  system: REPORT_SYSTEM_PROMPT, model: MODEL_ANALYSIS,
})

await workspace.writeFile(`${outputDir}/report.md`, reportResult.output)
ui.complete('Report saved')

// ── Step 4: Verification (Optional) ──────────────────────────

let verificationOutput = null

if (inputs.verify !== 'No') {
  ui.step('Verification')

  let processedData = ''
  for (const f of processedFiles) {
    const content = await workspace.readFile(f)
    processedData += `### ${f.split('/').pop()}\n\`\`\`csv\n${content}\n\`\`\`\n\n`
  }

  const verifyResult = await ai.generate({
    prompt: `Verify this extraction. Read the source PDF "${pdfPath}" with read_file.\n\nRaw:\n\`\`\`csv\n${approvedCsv}\n\`\`\`\n\nR script:\n\`\`\`r\n${rScript}\n\`\`\`\n\nProcessed:\n${processedData || 'None'}`,
    tools: ['read_file'],
    system: VERIFICATION_SYSTEM_PROMPT,
    model: MODEL_VERIFICATION,
  })

  verificationOutput = verifyResult.output
  await workspace.writeFile(`${outputDir}/verification.md`, verificationOutput)

  const verdictMatch = verificationOutput.match(/\*\*(PASS|ISSUES FOUND)\*\*/)
  ui.complete(`Verification: ${verdictMatch ? verdictMatch[1] : 'Done'}`)
}

// ── Finish ───────────────────────────────────────────────────

const fileList = [
  `- \`raw.csv\` — ${approvedData.length} raw data points`,
  `- \`process.R\` — transformation script`,
  ...processedFiles.map(f => `- \`${f.split('/').pop()}\` — processed`),
  `- \`report.md\` — extraction report`,
  verificationOutput ? `- \`verification.md\` — verification` : null,
].filter(Boolean).join('\n')

const verdictSection = verificationOutput
  ? `\n### Verification\n${verificationOutput}\n`
  : ''

ui.finish(`## Extraction Complete

### ${paperTitle}
${inputs.condition ? `Condition: ${inputs.condition}` : ''}
${inputs.country ? `Country: ${inputs.country}` : ''}

### Files
\`${outputDir}/\`
${fileList}

### Parameters
- **Found:** ${foundParams.join(', ')} (${approvedData.length} values)
- **Missing:** ${missingText || 'None'}
${verdictSection}
---

<details>
<summary>Extraction Report</summary>

${reportResult.output}

</details>`)
