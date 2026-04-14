# Disease Burden Extraction

Extracts epidemiological parameters from a research PDF and produces template-ready data for microsimulation models.

## What it does

1. **Reads** the PDF using AI vision (tables, figures, inline text)
2. **Extracts** disease burden parameters exactly as reported in the paper
3. **Processes** the data: unit conversion, age band standardisation, cleaning
4. **Verifies** everything independently using a separate AI agent (Opus)

Two human review checkpoints let you approve or correct the extracted and processed data before finalizing.

## Parameters extracted

Incidence, prevalence, mortality, survival, hospitalisations, diagnosis rates — broken down by sex, age band, and disease subtype where available.

## Output

A folder with:
- `raw.csv` — data exactly as reported (no transformations)
- `process.R` — commented R script for all transformations
- `{parameter}.csv` — processed, template-ready files
- `report.md` — extraction audit trail with source metadata
- `verification.md` — independent verification results

## Prerequisites

- **R** must be installed (`Rscript` available in PATH)
- An API key for Anthropic (Opus, for verification) or Google (Gemini, for PDF reading)

## Tips

- Leave the parameters field empty to extract all six parameter types
- Specify the condition and country for more focused extraction
- The verification step uses Opus and costs more — disable it for draft runs
- Re-running with a different PDF creates a separate output folder
