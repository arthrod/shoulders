---
id: workflows
title: Workflows
subtitle: Structured AI pipelines that run inside Shoulders.
group: Automation
order: 11
---

## What are workflows?

A workflow is a pre-built pipeline that runs a specific task: review a manuscript,
audit citations, extract data from a set of papers, check statistical reporting.
Each workflow defines its own sequence of steps and uses AI to do the heavy lifting
within those steps.

Unlike the AI chat -- which is an open-ended conversation where the AI decides what
to do -- workflows follow a fixed structure defined by the workflow author. You fill
in a form, click Run, and watch the results stream in step by step. The workflow
controls the logic; the AI provides the intelligence.

Workflows run entirely inside the app using your configured AI provider. No external
services, no setup, no dependencies beyond Shoulders itself.

## Running a workflow

1. Open a new tab (<kbd>Cmd/Ctrl</kbd>+<kbd>T</kbd>) and select the **Workflows** tab.
2. Choose a workflow from the list. Workflows are grouped by category.
3. Fill in the inputs -- select a file, add optional notes, or choose from a set of
   options. Each workflow defines its own form.
4. Click **Run** and watch the steps complete. AI output streams in
   real time under each step header.
5. When the workflow finishes, use the action buttons: **Save as file**,
   **Copy**, **Discuss in chat**, or **Re-run**.

## What happens during a run

When a workflow starts, you see a receipt block summarising what was configured --
the workflow name, your inputs, and a description of what it will do.

Each step appears as a header with a status indicator. A pulsing dot means the step
is working; a checkmark means it completed. AI output streams in real time under each
step. If the AI uses tools (e.g. "Search papers", "Read file"), those calls are shown
with their results. The final report renders as markdown.

Steps are collapsible. Click a step header to expand or collapse it. Completed steps
collapse automatically as the next step starts, so you can follow the progress without
scrolling.

## After a workflow completes

The action bar at the bottom of the results offers four options:

- **Save as file** -- exports the final report as a markdown file in
  your workspace.
- **Copy** -- copies the report text to your clipboard.
- **Discuss in chat** -- opens a new chat session with the workflow
  results as context, so you can ask follow-up questions or request changes.
- **Re-run** -- starts the workflow again with the same or different
  inputs.

Results persist while the tab is open. Switching to another tab and back preserves
the output.

## Writing workflows

:::note
This section is for technical users who want to create custom workflows for their team.
:::

A workflow is a folder containing two files: `workflow.json` (metadata and
configuration) and `run.js` (the logic). The app discovers workflow folders
automatically.

### Folder structure

```
.project/workflows/my-workflow/
  workflow.json     # metadata, inputs, tool whitelist
  run.js            # workflow logic
```

### workflow.json

Declares the workflow's name, description, input form, and which built-in tools it
may use.

```json
{
  "name": "Manuscript Review",
  "version": "1.0.0",
  "description": "Reviews structure, citations, and statistical reporting.",
  "category": "Quality Control",
  "inputs": {
    "document": {
      "type": "file",
      "required": true,
      "accept": [".md", ".tex"],
      "label": "Manuscript"
    },
    "focus": {
      "type": "text",
      "required": false,
      "placeholder": "Anything specific to check?"
    }
  },
  "tools": ["read_file", "search_content", "search_references", "search_papers"]
}
```

### run.js

The workflow script. Import the SDK, read inputs, call AI, report progress.

```js
import { ai, ui, workspace, inputs } from '@shoulders/workflow'

const doc = await workspace.readFile(inputs.document)

ui.step('Structure Check')
const structure = await ai.generate({
  prompt: `Review the structure of this document:\n\n${doc}`,
  tools: ['read_file'],
  system: 'You are reviewing the structure of an academic manuscript.',
})
ui.complete(structure.summary)

ui.step('Citation Audit')
const citations = await ai.generate({
  prompt: `Check citation coverage:\n\n${doc}`,
  tools: ['search_references', 'search_papers'],
})
ui.complete(citations.summary)

ui.finish(structure.output + '\n\n---\n\n' + citations.output)
```

### The SDK

The `@shoulders/workflow` SDK provides four objects:

- **inputs** -- the values from the launch form. File inputs are
  resolved to absolute paths.
- **ai** -- call `ai.generate()` with a prompt, optional
  tools, and an optional system message. Runs a full tool loop automatically.
- **ui** -- report progress with `ui.step()`,
  `ui.complete()`, `ui.log()`, and `ui.finish()`.
  Interactive methods like `ui.confirm()` and `ui.chat()`
  pause execution and wait for the user to respond.
- **workspace** -- read and write files, search content, open files
  in the editor, manage references, and run shell commands via
  `workspace.exec()`.

Workflows can call Python, R, or any CLI tool via `workspace.exec()`.
The AI can use built-in tools like `search_papers`, `read_file`,
and `run_command` -- but only those listed in `workflow.json`'s
`tools` array.

See the
[Workflow SDK Guide](https://github.com/anthropics/shoulders/blob/main/docs/workflow-sdk-guide.md)
for the complete API reference.

## Where to place workflows

Workflow folders are discovered from two locations:

- **`.project/workflows/`** -- shared with your team. This
  directory lives inside your workspace and syncs via git.
- **`~/.shoulders/workflows/`** -- personal workflows,
  available across all your workspaces.

The app scans both locations on startup and when you open the Workflows tab.

## Limitations

- **Single-file scripts** -- workflow logic lives in one
  `run.js` file. Multi-file imports are not supported.
- **No npm packages** -- external dependencies are not available in
  the workflow runtime. Use `workspace.exec()` to call Python, R, or CLI
  tools instead.
- **No direct network access** -- workflows run inside the app and
  cannot make HTTP requests directly. Use AI tools (`fetch_url`,
  `search_papers`) or `workspace.exec('curl ...')` for
  network requests.
