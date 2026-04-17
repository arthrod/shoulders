# Document Decomposition

Breaks a PDF, Excel, or Word document into a folder of clean, separate files.

## What it does

- **PDF** → AI reads the document and writes: `main-text.md` (with figure placeholders), one CSV per table, `metadata.json`
- **Excel** → One CSV per sheet + `metadata.json` (programmatic, no AI)
- **Word (.docx)** → `main-text.md` + one CSV per table + `metadata.json` (programmatic, no AI)

## Inputs

| Input | Required | Description |
|---|---|---|
| Source document | Yes | PDF, .xlsx, .xls, or .docx file |
| Output folder name | No | Defaults to slugified filename |
| Table output format | No | CSV (default), Markdown, or Both |

## Output structure

```
decomposed/{name}/
  main-text.md          ← full text with figure placeholders
  table-1.csv           ← one per table
  table-2.csv
  metadata.json         ← title, authors, table/figure counts
```

For Excel files:
```
decomposed/{name}/
  sheet-{name}.csv      ← one per sheet
  metadata.json
```

## Figure placeholders

Figures are described inline in `main-text.md`:

```
[ FIGURE 3. Prevalence by age group
  (Bar chart showing rates across 5 age bands) ]
```

## Requirements

- **PDF**: Requires a Gemini API key (uses Gemini Flash for vision)
- **Excel**: Python + openpyxl preferred; falls back to built-in parser
- **Word**: Python + python-docx preferred; falls back to mammoth (built-in)
