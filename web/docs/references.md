---
id: references
title: "References & Citations"
subtitle: "Import references, cite them in your documents, and export bibliographies."
group: Writing
order: 5
---

## The reference library

References are stored in a standard format compatible with Pandoc, Zotero, Mendeley, and most citation tools (CSL-JSON). The library lives in `.project/references/library.json` — a plain, portable JSON file.

The reference panel appears in the left sidebar below the file explorer. Both panels are independently collapsible. The reference list supports search, sort (by date added, author, year, or title), and filter (All, Cited, Not Cited).

## Importing references

There are several ways to add references. In all cases, click the import button in the reference panel and paste or drop your input.

### DOI

Paste a DOI (e.g., `10.1038/s41586-024-07386-0`). Metadata is fetched from CrossRef automatically. A citation key is generated in `authorYear` format. You can also paste multiple DOIs, one per line — each is looked up individually.

### Paste any text

Paste a reference in any format — a title, a citation from a bibliography, an incomplete reference string. Shoulders searches CrossRef by title to find a match. If that fails, the text is sent to a fast AI model to extract author, title, year, and DOI, then verified against CrossRef. This is the most flexible import method: paste whatever you have and Shoulders handles the rest.

### BibTeX, RIS, or CSL-JSON

Paste structured reference data in any of these standard formats. BibTeX entries (`@article{...}`) are the easiest way to import from Zotero or other reference managers. RIS is available from most academic databases (Web of Science, Scopus, PubMed). The parser is resilient — one malformed entry does not break the batch.

### PDF drag-and-drop

Drag a PDF file onto the reference panel. Shoulders extracts metadata automatically: first by scanning the PDF for a DOI, then (if none is found) by using AI to extract title, authors, and year from the first pages. Results are verified against CrossRef. The PDF is stored alongside the reference and its full text is indexed for search.

### Duplicate detection

During import, Shoulders checks for duplicates by DOI and by title similarity. Duplicates are flagged — you see a count and can choose to skip them.

## Citing in documents

Shoulders uses Pandoc-compatible citation syntax:

| Syntax | Renders as |
|--------|------------|
| `[@smith2020]` | Single citation |
| `[@smith2020; @jones2021; @lee2019]` | Citation group |
| `[see @smith2020, p. 42]` | Citation with prefix and locator |

This syntax works natively with Pandoc, Quarto, R Markdown, Hugo, Jekyll, and many other Markdown processors. No conversion needed.

### Autocomplete

Type `@` inside square brackets to trigger citation autocomplete. The dropdown shows matching references by author, year, and title. Press Enter to insert. Type `;` to add more references to a group.

### Visual feedback

Citation keys in the editor are colour-coded: valid keys appear in the accent colour, broken keys (not in library) appear in red. Hover over any citation to see a tooltip with the full reference. Click a citation to open a popover for editing: add or remove keys, add locators (e.g., "p. 42"), and search your library.

### LaTeX citations

In `.tex` files, `\cite{key}` syntax (and variants like `\citep`, `\citet`) is supported with the same autocomplete, hover tooltips, and colour-coding. A `references.bib` file is auto-generated before each LaTeX compile.

## Citation styles

Shoulders includes 30 built-in citation styles covering most academic disciplines:

- **Author-date** — APA 7th, APA 6th, Chicago Author-Date, Harvard, Elsevier Harvard, ASA, DIN 1505-2, GB/T 7714.
- **Numeric** — IEEE, Vancouver, Nature, Science, Cell, PLOS ONE, ACS, AMA, AIP, AMS, BMJ, The Lancet, PNAS, Springer LNCS, Annual Reviews, Royal Society of Chemistry, Elsevier.
- **Note** — Chicago Notes & Bibliography, MLA 9th, OSCOLA, Bluebook, MHRA.

Select the style in the PDF settings popover (gear icon in the tab bar).

You can also import custom CSL styles. Click "Add custom style" in the reference panel or drag a `.csl` file onto it. Custom styles are stored in `.project/styles/` and appear alongside the built-in options. CSL files are available from the [Zotero Style Repository](https://www.zotero.org/styles), which hosts thousands of journal-specific styles.

## Quick Open

<kbd>Cmd/Ctrl</kbd>+<kbd>P</kbd> includes a References section in the results. Selecting a reference inserts `[@key]` at the cursor position.

## Zotero sync

Connect your [Zotero](https://www.zotero.org) account to keep your Shoulders library in sync with your Zotero library. This works with both personal libraries and shared group libraries — ideal for teams that manage a collective reference collection.

### What syncs

- **Pull** — references from Zotero appear in your Shoulders library automatically, with all metadata intact.
- **Push** — references you add in Shoulders (by DOI, PDF, BibTeX, or any other method) are sent back to a Zotero collection of your choice, so your teammates see them too.
- **Delete cleanup** — if you delete a reference you just added by mistake, it is removed from Zotero as well. References that came *from* Zotero are only removed locally — to delete them permanently, remove them in Zotero.

### Connecting

Open Settings (<kbd>Cmd/Ctrl</kbd>+<kbd>,</kbd>) and go to the **Zotero** section. You need two things from your Zotero account:

1. Go to [zotero.org/settings/keys](https://www.zotero.org/settings/keys). Your **User ID** is shown at the top of the page.
2. Click **Create new private key**. Give it a name (e.g., "Shoulders"), enable **library read** and **library write** access, then save. Copy the key that appears.
3. Back in Shoulders, paste your User ID and API key, then click **Connect to Zotero**. Shoulders validates the key and shows your username.

:::tip
Your API key is stored securely in your operating system's keychain (Keychain on macOS, Credential Manager on Windows) — not in a plain file.
:::

### Choosing what to sync

After connecting, you can choose to sync your **entire library** (personal library plus all group libraries you belong to) or **selected collections**. The collection picker shows a tree of your personal folders and each group library with its folders. Read-only groups are marked with a lock icon.

### Pushing references back

Choose a **push target** — the Zotero library or collection where new references should appear. This can be your personal library, a specific folder, or a shared group collection. Only libraries you have write access to are shown.

When you add a reference in Shoulders, it is queued and pushed to Zotero on the next sync. Your teammates see it in their Zotero client immediately after sync.

### How sync runs

Sync happens automatically when you open a workspace (if auto-sync is enabled) and whenever you click **Sync Now** in Settings. After the first full sync, only references that changed since the last sync are transferred — this makes daily syncs nearly instant, even for large libraries.

A small book icon appears in the footer while Zotero is connected. During sync, it pulses gently. If something goes wrong (expired API key, network issue), the icon turns red and a message appears in Settings.

## Exporting

Right-click a reference to copy its BibTeX entry or citation key. Bulk export (all references, cited only, or filtered) is available as BibTeX or RIS.

## AI integration

The AI chat can interact with your reference library:

- **Search references** — search by title, author, key, or DOI.
- **Get reference** — retrieve full metadata for a key.
- **Add reference** — add a new reference by DOI.
- **Insert citation** — insert a citation at the cursor.
- **Read attached PDFs** — the AI can read the full text of PDFs stored in your reference library, making it possible to ask questions about specific papers, compare findings across sources, or summarise key arguments.
- **Search papers** — search OpenAlex (450M+ academic works) for papers by topic. Returns titles, authors, citation counts, DOIs, and open access links. Falls back to Exa and CrossRef if needed. External tool — can be disabled in Settings → Tools.
