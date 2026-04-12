<template>
  <div>
    <h1>Workflows</h1>
    <p class="docs-subtitle">Structured AI pipelines that run inside Shoulders.</p>

    <h2>What are workflows?</h2>
    <p>
      A workflow is a pre-built pipeline that runs a specific task: review a manuscript,
      audit citations, extract data from a set of papers, check statistical reporting.
      Each workflow defines its own sequence of steps and uses AI to do the heavy lifting
      within those steps.
    </p>
    <p>
      Unlike the AI chat — which is an open-ended conversation where the AI decides what
      to do — workflows follow a fixed structure defined by the workflow author. You fill
      in a form, click Run, and watch the results stream in step by step. The workflow
      controls the logic; the AI provides the intelligence.
    </p>
    <p>
      Workflows run entirely inside the app using your configured AI provider. No external
      services, no setup, no dependencies beyond Shoulders itself.
    </p>

    <h2>Running a workflow</h2>
    <div class="docs-steps">
      <div class="docs-step">
        <span class="docs-step-number">1</span>
        <div class="docs-step-content">
          Open a new tab (<kbd>Cmd/Ctrl</kbd>+<kbd>T</kbd>) and select the <strong>Workflows</strong> tab.
        </div>
      </div>
      <div class="docs-step">
        <span class="docs-step-number">2</span>
        <div class="docs-step-content">
          Choose a workflow from the list. Workflows are grouped by category.
        </div>
      </div>
      <div class="docs-step">
        <span class="docs-step-number">3</span>
        <div class="docs-step-content">
          Fill in the inputs — select a file, add optional notes, or choose from a set of
          options. Each workflow defines its own form.
        </div>
      </div>
      <div class="docs-step">
        <span class="docs-step-number">4</span>
        <div class="docs-step-content">
          Click <strong>Run</strong> and watch the steps complete. AI output streams in
          real time under each step header.
        </div>
      </div>
      <div class="docs-step">
        <span class="docs-step-number">5</span>
        <div class="docs-step-content">
          When the workflow finishes, use the action buttons: <strong>Save as file</strong>,
          <strong>Copy</strong>, <strong>Discuss in chat</strong>, or <strong>Re-run</strong>.
        </div>
      </div>
    </div>

    <h2>What happens during a run</h2>
    <p>
      When a workflow starts, you see a receipt block summarising what was configured —
      the workflow name, your inputs, and a description of what it will do.
    </p>
    <p>
      Each step appears as a header with a status indicator. A pulsing dot means the step
      is working; a checkmark means it completed. AI output streams in real time under each
      step. If the AI uses tools (e.g. "Search papers", "Read file"), those calls are shown
      with their results. The final report renders as markdown.
    </p>
    <p>
      Steps are collapsible. Click a step header to expand or collapse it. Completed steps
      collapse automatically as the next step starts, so you can follow the progress without
      scrolling.
    </p>

    <h2>After a workflow completes</h2>
    <p>
      The action bar at the bottom of the results offers four options:
    </p>
    <ul>
      <li><strong>Save as file</strong> — exports the final report as a markdown file in
        your workspace.</li>
      <li><strong>Copy</strong> — copies the report text to your clipboard.</li>
      <li><strong>Discuss in chat</strong> — opens a new chat session with the workflow
        results as context, so you can ask follow-up questions or request changes.</li>
      <li><strong>Re-run</strong> — starts the workflow again with the same or different
        inputs.</li>
    </ul>
    <p>
      Results persist while the tab is open. Switching to another tab and back preserves
      the output.
    </p>

    <h2>Writing workflows</h2>

    <DocsCallout type="note">
      This section is for technical users who want to create custom workflows for their team.
    </DocsCallout>

    <p>
      A workflow is a folder containing two files: <code>workflow.json</code> (metadata and
      configuration) and <code>run.js</code> (the logic). The app discovers workflow folders
      automatically.
    </p>

    <h3>Folder structure</h3>
    <pre><code>.project/workflows/my-workflow/
  workflow.json     # metadata, inputs, tool whitelist
  run.js            # workflow logic</code></pre>

    <h3>workflow.json</h3>
    <p>
      Declares the workflow's name, description, input form, and which built-in tools it
      may use.
    </p>
    <pre><code>{
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
}</code></pre>

    <h3>run.js</h3>
    <p>
      The workflow script. Import the SDK, read inputs, call AI, report progress.
    </p>
    <pre><code>import { ai, ui, workspace, inputs } from '@shoulders/workflow'

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

ui.finish(structure.output + '\n\n---\n\n' + citations.output)</code></pre>

    <h3>The SDK</h3>
    <p>
      The <code>@shoulders/workflow</code> SDK provides four objects:
    </p>
    <ul>
      <li><strong>inputs</strong> — the values from the launch form. File inputs are
        resolved to absolute paths.</li>
      <li><strong>ai</strong> — call <code>ai.generate()</code> with a prompt, optional
        tools, and an optional system message. Runs a full tool loop automatically.</li>
      <li><strong>ui</strong> — report progress with <code>ui.step()</code>,
        <code>ui.complete()</code>, <code>ui.log()</code>, and <code>ui.finish()</code>.
        Interactive methods like <code>ui.confirm()</code> and <code>ui.chat()</code>
        pause execution and wait for the user to respond.</li>
      <li><strong>workspace</strong> — read and write files, search content, open files
        in the editor, manage references, and run shell commands via
        <code>workspace.exec()</code>.</li>
    </ul>
    <p>
      Workflows can call Python, R, or any CLI tool via <code>workspace.exec()</code>.
      The AI can use built-in tools like <code>search_papers</code>, <code>read_file</code>,
      and <code>run_command</code> — but only those listed in <code>workflow.json</code>'s
      <code>tools</code> array.
    </p>
    <p>
      See the
      <a href="https://github.com/anthropics/shoulders/blob/main/docs/workflow-sdk-guide.md"
         target="_blank" rel="noopener">Workflow SDK Guide</a>
      for the complete API reference.
    </p>

    <h2>Where to place workflows</h2>
    <p>
      Workflow folders are discovered from two locations:
    </p>
    <ul>
      <li><strong><code>.project/workflows/</code></strong> — shared with your team. This
        directory lives inside your workspace and syncs via git.</li>
      <li><strong><code>~/.shoulders/workflows/</code></strong> — personal workflows,
        available across all your workspaces.</li>
    </ul>
    <p>
      The app scans both locations on startup and when you open the Workflows tab.
    </p>

    <h2>Limitations</h2>
    <ul>
      <li><strong>Single-file scripts</strong> — workflow logic lives in one
        <code>run.js</code> file. Multi-file imports are not supported.</li>
      <li><strong>No npm packages</strong> — external dependencies are not available in
        the workflow runtime. Use <code>workspace.exec()</code> to call Python, R, or CLI
        tools instead.</li>
      <li><strong>No direct network access</strong> — workflows run inside the app and
        cannot make HTTP requests directly. Use AI tools (<code>fetch_url</code>,
        <code>search_papers</code>) or <code>workspace.exec('curl ...')</code> for
        network requests.</li>
    </ul>
  </div>
</template>
