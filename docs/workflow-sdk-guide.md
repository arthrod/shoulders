# Building Workflows for Shoulders

Workflows are structured, repeatable AI pipelines that run inside the Shoulders desktop app. Unlike chat (where the AI decides what to do), workflows follow author-defined logic — you control the steps, the AI provides the intelligence within those constraints.

---

## Quick Start

A workflow is a folder with two required files:

```
.project/workflows/my-workflow/
  workflow.json     # metadata + tool whitelist
  run.js            # your script (runs in Bun)
```

**workflow.json** — declares what the workflow is and what tools it may use:

```json
{
  "name": "My Workflow",
  "version": "1.0.0",
  "description": "One-line summary shown in the launcher.",
  "category": "Analysis",
  "inputs": {
    "document": { "type": "file", "required": true, "accept": [".md", ".tex"], "label": "Document" },
    "focus": { "type": "text", "required": false, "placeholder": "Anything specific?" }
  },
  "tools": ["read_file", "write_file", "search_content", "search_references", "search_papers"]
}
```

**run.js** — your workflow logic, a plain Bun script:

```js
import { ai, ui, workspace, inputs } from '@shoulders/workflow'

const doc = await workspace.readFile(inputs.document)

ui.step('Structure Check')
const result = await ai.generate({
  prompt: `Review the structure of this document:\n\n${doc}`,
  tools: ['read_file'],
  system: 'You are reviewing the structure of an academic manuscript.',
})
ui.complete(`${result.output.length} chars of feedback`)

ui.finish(result.output)
```

The user selects the workflow in the app, fills in the inputs form, clicks **Run**, and sees the steps stream in real time.

---

## The SDK (`@shoulders/workflow`)

The SDK provides 4 exports. The app injects them automatically — just `import` and use.

### `inputs`

A plain object populated from the launch form. Keys match `workflow.json` `inputs` field names. File inputs are resolved to absolute paths.

```js
inputs.document   // "/Users/x/project/protocol.md"
inputs.focus      // "Check the methods" or undefined
```

### `ui` — Progress & Interaction

**Fire-and-forget** (renders immediately in the execution view):

| Method | Effect |
|--------|--------|
| `ui.step(name)` | Start a named step. Shows a header in the UI. Call this BEFORE `ai.generate()` so the user sees progress immediately. |
| `ui.log(message)` | Update status text (e.g. "Checking reference 7 of 23"). |
| `ui.complete(summary)` | Mark the current step done with a one-line summary. |
| `ui.finish(output)` | Workflow succeeded. `output` is a markdown string rendered as the final result. Exits the process. |
| `ui.error(message)` | Workflow failed. Shows the error, preserves partial output. Exits the process. |

**Interactive** (blocks until the user responds):

| Method | Returns |
|--------|---------|
| `await ui.chat(prompt)` | `string` — free-text response from the user |
| `await ui.confirm(message)` | `boolean` — yes/no |
| `await ui.approve({ title, details })` | `'approve'` or `'reject'` |
| `await ui.form(schema)` | `object` — field values (same schema format as `workflow.json` inputs) |
| `await ui.pickModel()` | `string` — model ID chosen by the user |

### `ai` — AI Generation

```js
const result = await ai.generate({
  prompt: 'Your prompt here',
  tools: ['read_file', 'search_papers'],        // built-in tools (must be in workflow.json whitelist)
  system: 'You are a statistics reviewer.',      // optional system prompt
  model: 'anthropic/claude-sonnet-4-5',          // optional, defaults to user's selected model
  customTools: {                                  // optional, author-defined tools
    lookup_code: {
      description: 'Look up an ICD-10 code',
      parameters: { type: 'object', properties: { condition: { type: 'string' } } },
      execute: async ({ condition }) => codeMap[condition] ?? 'NOT FOUND',
    },
  },
})

result.output      // string — the AI's final text response
result.summary     // first 200 chars of output
result.toolCalls   // array of { name, input, output, isError }
result.usage       // { inputTokens, outputTokens }
```

`ai.generate()` runs a full tool loop automatically: the AI calls tools, the SDK executes them (custom tools locally, built-in tools via the app), sends results back, and repeats until the AI produces a final text response. Max 20 iterations.

**Built-in tools** are the same tools available in the Shoulders chat: `read_file`, `write_file`, `edit_file`, `search_content`, `list_files`, `run_command`, `search_references`, `search_papers`, `web_search`, `fetch_url`, etc. Only tools listed in `workflow.json` `tools` are available.

**Custom tools** execute in your process — use them for domain-specific logic (lookup tables, API calls, validation) that the AI can invoke during generation.

### `workspace` — File Operations & App Automation

```js
await workspace.readFile(path)                         // returns file content string
await workspace.writeFile(path, content)               // create or overwrite
await workspace.listFiles(dir?)                        // array of file paths
await workspace.searchContent(query)                   // search across workspace
await workspace.readReferences()                       // project's CSL-JSON library

await workspace.openFile(path, { split: true })        // open in editor pane
await workspace.addComments(path, annotations)         // add margin comments
await workspace.insertText(path, { line, ch }, text)   // insert at position
await workspace.addReference(cslJsonEntry)             // add to reference library
```

The workspace methods let your workflow **drive the application** — open files, add comments anchored to passages, insert text. This is what makes workflows feel integrated rather than just producing text output.

---

## Patterns

### Multi-step with branching

```js
ui.step('Citation Audit')
const citations = await ai.generate({
  prompt: `Check citation coverage:\n\n${doc}`,
  tools: ['search_references'],
})
ui.complete(citations.summary)

if (citations.output.includes('missing')) {
  ui.step('Reference Search')
  await ai.generate({
    prompt: `Find papers to fill gaps: ${citations.output}`,
    tools: ['search_papers'],
  })
}
```

### Parallel agents

```js
ui.step('Review')
const [technical, editorial] = await Promise.all([
  ai.generate({ prompt: techPrompt, system: 'You review statistics and methods.' }),
  ai.generate({ prompt: editPrompt, system: 'You review argumentation and structure.' }),
])
ui.complete(`${technical.toolCalls.length + editorial.toolCalls.length} tool calls`)
```

### Mid-run user input

```js
const confirmed = await ui.confirm('Found 3 issues. Proceed with auto-fix?')
if (confirmed) {
  ui.step('Applying fixes')
  // ...
}
```

### Opening results in the app

```js
await workspace.writeFile(`${inputs.document.replace('.md', '-review.md')}`, report)
await workspace.openFile(reportPath, { split: true })
```

---

## Testing

1. Create your workflow folder in `.project/workflows/your-name/`
2. Add `workflow.json` and `run.js`
3. Open the workspace in Shoulders
4. Press **Cmd+T** → select the **Workflows** tab
5. Click your workflow → fill in inputs → click **Run**
6. Watch step headers stream in, AI output renders in real time
7. On completion, use **Save as file** / **Copy** / **Re-run**

If `bun` is not installed, workflows will fail to start. Install from [bun.sh](https://bun.sh).

---

## Reference: `workflow.json` Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | Display name in the launcher |
| `version` | no | Semver for change tracking |
| `description` | yes | One-line summary |
| `category` | no | Grouping label ("Quality Control", "Writing", etc.) |
| `draft` | no | If `true`, hidden from non-admin users in team workspaces |
| `inputs` | no | Object of input field definitions (generates launch form) |
| `tools` | yes | Array of built-in tool names the workflow may use |
| `minAppVersion` | no | Minimum Shoulders version (warns if incompatible) |

### Input field types

```json
{ "type": "file", "required": true, "accept": [".md", ".tex"], "label": "Manuscript" }
{ "type": "text", "required": false, "placeholder": "Notes...", "multiline": true }
{ "type": "select", "required": true, "options": ["Option A", "Option B"], "label": "Choose" }
```

---

## How It Works (under the hood)

Your `run.js` executes as a **Bun subprocess** spawned by the Shoulders Rust backend. The SDK communicates with the app via JSON lines over stdin/stdout:

```
run.js (SDK)  ↔  Rust (message router)  ↔  Vue frontend (orchestrator)
```

- `ui.step()` → sends JSON to stdout → Rust emits Tauri event → Vue renders step header
- `ai.generate()` → sends request → Vue calls the AI provider using the user's configured keys → streams chunks back → SDK runs tool loop → Vue shows streaming output
- `workspace.readFile()` → sends request → Vue calls existing Rust file commands → returns content

You never handle credentials, streaming, or UI rendering. The SDK and app handle all of that. You just write the logic.
