# Scoping Review

AI-powered PubMed scoping literature review with search strategy development and relevance screening.

## What it does

1. **Analyzes** your research question using the PICO framework
2. **Generates** a tailored questionnaire to refine your search scope
3. **Develops** PubMed search strategies with MeSH terms and boolean operators — testing each with real hit counts
4. **Extracts** results (titles, abstracts, metadata) to CSV
5. **Screens** every paper for relevance using parallel AI agents (0-5 scale)

## Inputs

| Input | Required | Description |
|---|---|---|
| Research question | Yes | Your research question in natural language |
| Maximum results | No | Papers to extract: 50, 100 (default), 250, or 500 |

## Output

```
scoping-review/{topic}/
  results.csv           ← all papers with relevance scores, sorted
  summary.md            ← PRISMA-style flow + score distribution + top papers
  search-strategy.md    ← PICO, query, date, methodology
```

## Requirements

- Internet access (PubMed E-utilities API — no authentication required)
