import { ai, ui, workspace, inputs } from '@shoulders/workflow'

// ── Config ──────────────────────────────────────────────────────────

const filePath = inputs.source_file
if (!filePath) ui.error('No source file provided')

const ext = filePath.split('.').pop().toLowerCase()
const fileName = filePath.split('/').pop().replace(/\.[^.]+$/, '')
const baseName = (inputs.output_name || fileName).toLowerCase().replace(/[^a-z0-9]+/g, '-')
const outDir = `decomposed/${baseName}`
const tableFormat = inputs.table_format || 'CSV'

// ── Helpers ─────────────────────────────────────────────────────────

function toCsv(rows) {
  return rows.map(row => row.map(cell => {
    const s = String(cell ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }).join(',')).join('\n')
}

function toMdTable(rows) {
  if (!rows.length) return ''
  const hdr = rows[0].map(c => String(c ?? ''))
  const sep = hdr.map(() => '---')
  const body = rows.slice(1).map(r => r.map(c => String(c ?? '')))
  return [hdr, sep, ...body].map(r => '| ' + r.join(' | ') + ' |').join('\n')
}

// ── Step 1: Prepare ─────────────────────────────────────────────────

ui.step('Preparing')
await workspace.exec(`mkdir -p "${outDir}"`)
ui.log(`${fileName}.${ext} → ${outDir}/`)
ui.complete(`${ext.toUpperCase()} detected`)

// ── Step 2: Extract ─────────────────────────────────────────────────

if (ext === 'pdf') {

  ui.step('Extracting from PDF')

  const SYSTEM = `Document parser for academic manuscripts. Given a PDF, extract all content verbatim into structured data via the submit_decomposition tool.

Extraction specification:
- Reproduce all text exactly as printed, preserving section headings (as markdown #/##/###), paragraph breaks, lists, footnotes, and in-text citations.
- Mark table locations as [TABLE N] in the text flow. Extract each table's column headers and cell values exactly as they appear.
- Mark figure locations as [FIGURE N] in the text flow. Record the verbatim caption and describe the visual content (chart type, axes, data patterns, key numerical values).
- Extract metadata: title, authors, year, DOI, journal name, abstract.
- Include the full reference/bibliography list if present.
- Cover the entire document including appendices, acknowledgements, and supplementary material.
- Call submit_decomposition exactly once with the complete extraction.`

  let decomposition = null

  await ai.generate({
    model: 'gemini-flash',
    system: SYSTEM,
    prompt: 'Extract the complete contents of the attached document. Call submit_decomposition with all text, tables, figures, and metadata.',
    files: [filePath],
    customTools: {
      submit_decomposition: {
        description: 'Submit the complete verbatim extraction of the document.',
        parameters: {
          type: 'object',
          properties: {
            main_text: { type: 'string', description: 'Full document text as markdown. Use # for headings. Use [TABLE N] and [FIGURE N] as placeholders where they appear in the text flow.' },
            tables: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  number: { type: 'integer' },
                  caption: { type: 'string' },
                  headers: { type: 'array', items: { type: 'string' } },
                  rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
                  footnotes: { type: 'string' },
                },
                required: ['number', 'headers', 'rows'],
              },
            },
            figures: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  number: { type: 'integer' },
                  caption: { type: 'string' },
                  description: { type: 'string' },
                },
                required: ['number', 'caption', 'description'],
              },
            },
            metadata: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                authors: { type: 'array', items: { type: 'string' } },
                year: { type: 'string' },
                doi: { type: 'string' },
                journal: { type: 'string' },
                abstract: { type: 'string' },
              },
              required: ['title'],
            },
            references: { type: 'array', items: { type: 'string' } },
          },
          required: ['main_text', 'tables', 'figures', 'metadata'],
        },
        execute: async (data) => {
          decomposition = data
          return `Received: ${data.tables?.length || 0} tables, ${data.figures?.length || 0} figures.`
        },
      },
    },
  })

  if (!decomposition) {
    ui.error('Extraction failed — model did not return structured data.')
  }

  // ── Write files deterministically from structured data ──

  ui.step('Writing files')

  // 1. Main text
  let mainText = decomposition.main_text || ''

  // Expand figure placeholders
  for (const fig of (decomposition.figures || [])) {
    mainText = mainText.replace(
      `[FIGURE ${fig.number}]`,
      `[ FIGURE ${fig.number}. ${fig.caption}\n  (${fig.description}) ]`
    )
  }

  // Expand table placeholders to markdown if requested
  if (tableFormat === 'Markdown' || tableFormat === 'Both') {
    for (const tbl of (decomposition.tables || [])) {
      const md = toMdTable([tbl.headers, ...(tbl.rows || [])])
      const caption = tbl.caption ? `**${tbl.caption}**\n\n` : ''
      const notes = tbl.footnotes ? `\n\n_${tbl.footnotes}_` : ''
      mainText = mainText.replace(`[TABLE ${tbl.number}]`, `${caption}${md}${notes}`)
    }
  }

  await workspace.writeFile(`${outDir}/main-text.md`, mainText)

  // 2. Table CSVs
  if (tableFormat === 'CSV' || tableFormat === 'Both') {
    for (const tbl of (decomposition.tables || [])) {
      await workspace.writeFile(`${outDir}/table-${tbl.number}.csv`, toCsv([tbl.headers, ...(tbl.rows || [])]))
    }
  }

  // 3. Metadata
  const meta = {
    ...(decomposition.metadata || {}),
    tables: (decomposition.tables || []).length,
    figures: (decomposition.figures || []).length,
  }
  await workspace.writeFile(`${outDir}/metadata.json`, JSON.stringify(meta, null, 2))

  // 4. References
  if (decomposition.references?.length) {
    await workspace.writeFile(`${outDir}/references.md`, decomposition.references.map((r, i) => `${i + 1}. ${r}`).join('\n'))
  }

  ui.complete(`${(decomposition.tables || []).length} tables, ${(decomposition.figures || []).length} figures`)

} else if (ext === 'xlsx' || ext === 'xls') {

  ui.step('Extracting sheets')

  let sheets = null
  let usedPython = false

  // Try Python + openpyxl
  try {
    await workspace.exec('python3 -c "import openpyxl"')
    const pyScript = `import openpyxl, csv, json, os, sys
src, out, fmt = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(out, exist_ok=True)
wb = openpyxl.load_workbook(src, data_only=True)
for name in wb.sheetnames:
    ws = wb[name]
    slug = ''.join(c if c.isalnum() else '-' for c in name.lower()).strip('-')
    rows = [[str(v) if v is not None else '' for v in row] for row in ws.iter_rows(values_only=True)]
    if fmt in ('CSV', 'Both'):
        with open(os.path.join(out, f'sheet-{slug}.csv'), 'w', newline='') as f:
            csv.writer(f).writerows(rows)
    if fmt in ('Markdown', 'Both') and rows:
        hdr = rows[0]
        lines = ['| ' + ' | '.join(hdr) + ' |', '| ' + ' | '.join(['---']*len(hdr)) + ' |']
        for r in rows[1:]:
            r2 = r + [''] * (len(hdr) - len(r))
            lines.append('| ' + ' | '.join(r2) + ' |')
        with open(os.path.join(out, f'sheet-{slug}.md'), 'w') as f:
            f.write('\\n'.join(lines))
json.dump({"sheets": wb.sheetnames, "totalSheets": len(wb.sheetnames), "source": os.path.basename(src)}, open(os.path.join(out, 'metadata.json'), 'w'), indent=2)
print(f'{len(wb.sheetnames)} sheets')
`
    await workspace.writeFile(`${outDir}/_extract.py`, pyScript)
    const output = await workspace.exec(`python3 "${outDir}/_extract.py" "${filePath}" "${outDir}" "${tableFormat}"`)
    await workspace.exec(`rm "${outDir}/_extract.py"`)
    ui.log(output.trim())
    usedPython = true
  } catch {
    // Python unavailable — use built-in parser
  }

  if (!usedPython) {
    ui.log('Using built-in parser (no Python/openpyxl)')
    const parsed = await workspace.parseExcel(filePath)
    sheets = parsed.sheets

    for (const sheet of sheets) {
      const slug = sheet.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      if (tableFormat === 'CSV' || tableFormat === 'Both') {
        await workspace.writeFile(`${outDir}/sheet-${slug}.csv`, toCsv(sheet.rows))
      }
      if (tableFormat === 'Markdown' || tableFormat === 'Both') {
        await workspace.writeFile(`${outDir}/sheet-${slug}.md`, toMdTable(sheet.rows))
      }
    }

    await workspace.writeFile(`${outDir}/metadata.json`, JSON.stringify({
      sheets: sheets.map(s => s.name),
      totalSheets: sheets.length,
      source: filePath.split('/').pop(),
    }, null, 2))
  }

  ui.complete('Sheets extracted')

} else if (ext === 'docx') {

  ui.step('Extracting from Word document')

  let usedPython = false

  // Try Python + python-docx
  try {
    await workspace.exec('python3 -c "from docx import Document"')
    const pyScript = `from docx import Document
from docx.opc.constants import RELATIONSHIP_TYPE as RT
import csv, json, os, sys, re

doc = Document(sys.argv[1])
out, fmt = sys.argv[2], sys.argv[3]
os.makedirs(out, exist_ok=True)

# Build a set of table element IDs for body-order interleaving
tbl_elements = set()
for tbl in doc.tables:
    tbl_elements.add(id(tbl._tbl))

# Walk body in document order: paragraphs, tables, images
parts = []
tidx = 0
fidx = 0
tbl_queue = list(doc.tables)
tbl_qi = 0

for child in doc.element.body:
    tag = child.tag.split('}')[-1] if '}' in child.tag else child.tag

    if tag == 'p':
        # Check for images (drawings/pictures) in this paragraph
        drawings = child.findall('.//' + '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}drawing')
        if not drawings:
            drawings = child.findall('.//' + '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}pict')
        has_image = len(drawings) > 0 or len(child.findall('.//{http://schemas.openxmlformats.org/drawingml/2006/main}blip')) > 0

        # Extract text
        texts = []
        for node in child.iter():
            ntag = node.tag.split('}')[-1] if '}' in node.tag else node.tag
            if ntag == 't' and node.text:
                texts.append(node.text)
        line = ''.join(texts)

        if has_image:
            fidx += 1
            # Try to get alt text / description from drawing
            desc = ''
            for dp in child.iter():
                dtag = dp.tag.split('}')[-1] if '}' in dp.tag else dp.tag
                if dtag == 'docPr':
                    desc = dp.get('descr', '') or dp.get('name', '')
                    break
            parts.append(f'[ FIGURE {fidx}. {desc or "Image"} ]')
            if line.strip():
                parts.append(line)
        else:
            parts.append(line)

    elif tag == 'tbl' and tbl_qi < len(tbl_queue):
        tidx += 1
        tbl = tbl_queue[tbl_qi]
        tbl_qi += 1
        rows = [[c.text.strip() for c in r.cells] for r in tbl.rows]
        if not rows:
            continue
        if fmt in ('CSV', 'Both'):
            with open(os.path.join(out, f'table-{tidx}.csv'), 'w', newline='') as f:
                csv.writer(f).writerows(rows)
        if fmt == 'CSV':
            parts.append(f'[TABLE {tidx}]')
        else:
            parts.append('')
            hdr = rows[0]
            parts.append('| ' + ' | '.join(hdr) + ' |')
            parts.append('| ' + ' | '.join(['---']*len(hdr)) + ' |')
            for r in rows[1:]:
                r2 = r + [''] * (len(hdr) - len(r))
                parts.append('| ' + ' | '.join(r2) + ' |')
            parts.append('')

with open(os.path.join(out, 'main-text.md'), 'w') as f:
    f.write('\\n'.join(parts))
json.dump({"tables": tidx, "figures": fidx, "source": os.path.basename(sys.argv[1])}, open(os.path.join(out, 'metadata.json'), 'w'), indent=2)
print(f'{tidx} tables, {fidx} figures')
`
    await workspace.writeFile(`${outDir}/_extract.py`, pyScript)
    const output = await workspace.exec(`python3 "${outDir}/_extract.py" "${filePath}" "${outDir}" "${tableFormat}"`)
    await workspace.exec(`rm "${outDir}/_extract.py"`)
    ui.log(output.trim())
    usedPython = true
  } catch {
    // Python unavailable
  }

  if (!usedPython) {
    ui.log('Using built-in parser (no Python/python-docx)')
    const parsed = await workspace.parseDocx(filePath)

    // Write main text — replace table placeholders with markdown tables if requested
    let mainText = parsed.markdown
    if (tableFormat === 'Markdown' || tableFormat === 'Both') {
      for (let i = 0; i < parsed.tables.length; i++) {
        mainText = mainText.replace(`[TABLE ${i + 1}]`, '\n' + toMdTable(parsed.tables[i].rows) + '\n')
      }
    }
    await workspace.writeFile(`${outDir}/main-text.md`, mainText)

    // Write table CSVs
    if (tableFormat === 'CSV' || tableFormat === 'Both') {
      for (let i = 0; i < parsed.tables.length; i++) {
        await workspace.writeFile(`${outDir}/table-${i + 1}.csv`, toCsv(parsed.tables[i].rows))
      }
    }

    await workspace.writeFile(`${outDir}/metadata.json`, JSON.stringify({
      tables: parsed.tables.length,
      source: filePath.split('/').pop(),
    }, null, 2))
  }

  ui.complete('Document extracted')

} else {
  ui.error(`Unsupported file type: .${ext}. Supported: PDF (.pdf), Excel (.xlsx/.xls), Word (.docx)`)
}

// ── Finish ──────────────────────────────────────────────────────────

const allFiles = await workspace.listFiles(outDir)
const fileList = allFiles
  .filter(f => !f.split('/').pop().startsWith('_'))
  .map(f => `- \`${f}\``)
  .join('\n')

ui.finish(`## Decomposition complete

**${allFiles.length} files** in \`${outDir}/\`:

${fileList}`)
