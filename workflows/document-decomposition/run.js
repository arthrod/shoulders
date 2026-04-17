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

  const tableInstr = tableFormat === 'CSV'
    ? 'Replace each table with a placeholder like [TABLE 1. Title]. Write each table as a separate CSV file (table-1.csv, table-2.csv, etc.).'
    : tableFormat === 'Markdown'
      ? 'Render each table as a markdown table inline in the text. Do NOT create separate CSV files.'
      : 'Include markdown tables inline in the text AND write each table as a separate CSV file (table-1.csv, table-2.csv, etc.).'

  await ai.generate({
    model: 'gemini-flash',
    prompt: `Read the file "${filePath}" using read_file, then decompose it into files in "${outDir}/".

Create these files using write_file:

1. **main-text.md** — Full document text, faithfully reproduced. ${tableInstr}
   For figures, insert inline placeholders like:

   [ FIGURE N. Title of figure
     (Description of what the figure shows) ]

${tableFormat !== 'Markdown' ? '2. **table-N.csv** — One CSV per table. Include column headers.\n\n3.' : '2.'} **metadata.json** — \`{"title":"...","authors":[...],"year":"...","doi":"...","tables":N,"figures":N}\`

IMPORTANT: Extract content VERBATIM. Do not summarize, paraphrase, or omit any text. Preserve section headings, paragraph breaks, and document structure.`,
    tools: ['read_file', 'write_file'],
  })

  ui.complete('PDF decomposed')

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
import csv, json, os, sys

doc = Document(sys.argv[1])
out, fmt = sys.argv[2], sys.argv[3]
os.makedirs(out, exist_ok=True)

parts = []
tidx = 0
for child in doc.element.body:
    tag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
    if tag == 'p':
        texts = []
        for node in child.iter():
            ntag = node.tag.split('}')[-1] if '}' in node.tag else node.tag
            if ntag == 't' and node.text:
                texts.append(node.text)
        parts.append(''.join(texts))
    elif tag == 'tbl':
        tidx += 1
        tbl = doc.tables[tidx - 1]
        rows = [[c.text.strip() for c in r.cells] for r in tbl.rows]
        if fmt in ('CSV', 'Both'):
            with open(os.path.join(out, f'table-{tidx}.csv'), 'w', newline='') as f:
                csv.writer(f).writerows(rows)
        if fmt == 'CSV':
            parts.append(f'[TABLE {tidx}]')
        else:
            parts.append('')
            if rows:
                parts.append('| ' + ' | '.join(rows[0]) + ' |')
                parts.append('| ' + ' | '.join(['---']*len(rows[0])) + ' |')
                for r in rows[1:]:
                    r2 = r + [''] * (len(rows[0]) - len(r))
                    parts.append('| ' + ' | '.join(r2) + ' |')
            parts.append('')

with open(os.path.join(out, 'main-text.md'), 'w') as f:
    f.write('\\n'.join(parts))
json.dump({"tables": tidx, "source": os.path.basename(sys.argv[1])}, open(os.path.join(out, 'metadata.json'), 'w'), indent=2)
print(f'{tidx} tables')
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
