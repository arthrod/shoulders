// Default SKILL.md content for the workflow-builder skill.
// Auto-generated into .project/skills/workflow-builder/SKILL.md for new workspaces.

export default `# Workflow Builder — Skill Reference

> **For the AI agent.** Help the user create custom Shoulders workflows. Read the full SDK guide at \`docs/workflow-sdk-guide.md\` before creating any files.

---

## What is a Workflow?

A workflow is a structured, repeatable AI pipeline that runs inside the Shoulders app. Unlike chat (where the AI decides what to do), workflows follow author-defined logic — you control the steps, the AI provides the intelligence within those constraints.

## File Structure

A workflow is a folder with two required files:

\`\`\`
~/.shoulders/workflows/my-workflow/    # global (available in all workspaces)
# or
.project/workflows/my-workflow/        # project-specific (git-synced)

  workflow.json     # metadata, inputs schema, tool whitelist
  run.js            # script (runs inside the app, no external deps)
  README.md         # optional: shown on the start screen
\`\`\`

## workflow.json

\`\`\`json
{
  "name": "My Workflow",
  "version": "1.0.0",
  "description": "One-line summary shown in the workflow list.",
  "category": "Analysis",
  "inputs": {
    "document": { "type": "file", "required": true, "accept": [".md", ".tex"], "label": "Document" },
    "focus": { "type": "text", "required": false, "placeholder": "Anything specific?" }
  },
  "tools": ["read_file", "write_file", "search_content", "search_references", "search_papers"]
}
\`\`\`

**Input types**: \`file\` (with \`accept\` filter), \`text\`, \`select\` (with \`options\` array)

**Available tools**: \`read_file\`, \`write_file\`, \`list_files\`, \`search_content\`, \`search_references\`, \`search_papers\`, \`run_command\`, \`add_comment\`

## run.js

\`\`\`js
import { ai, ui, workspace, inputs } from '@shoulders/workflow'

// Read a file
const doc = await workspace.readFile(inputs.document)

// Show progress
ui.step('Analyzing')
ui.log('Reading document...')

// Call AI with tools
const result = await ai.generate({
  prompt: \\\`Analyze this document:\\n\\n\\\${doc}\\\`,
  system: 'You are an expert reviewer.',
  tools: ['read_file'],           // must be in workflow.json whitelist
  customTools: {                   // define inline tools
    submit_analysis: {
      description: 'Submit your analysis',
      parameters: {
        type: 'object',
        properties: {
          findings: { type: 'array', items: { type: 'string' } }
        },
        required: ['findings']
      },
      execute: (input) => {
        // runs in the workflow, not the AI
        return JSON.stringify({ received: input.findings.length })
      }
    }
  }
})

ui.complete('Done')

// User interaction
const confirmed = await ui.confirm('Save results?')
if (confirmed) {
  await workspace.writeFile('results.md', result.output)
}

// Finish (required — ends the workflow)
ui.finish(result.output)
\`\`\`

## SDK API Summary

**\`ui\`**: \`step(name)\`, \`log(message)\`, \`complete(summary)\`, \`finish(output)\`, \`error(message)\`, \`chat(prompt)\`, \`confirm(message)\`, \`approve({title, details})\`, \`form(schema)\`, \`pickModel()\`

**\`workspace\`**: \`readFile(path)\`, \`writeFile(path, content)\`, \`listFiles(dir)\`, \`searchContent(query)\`, \`readReferences()\`, \`openFile(path)\`, \`addComments(path, annotations)\`, \`insertText(path, position, text)\`, \`addReference(entry)\`, \`exec(command)\`

**\`ai.generate()\`**: \`{ prompt, tools, system, model, customTools }\` → \`{ output, toolCalls, usage }\`

**\`inputs\`**: Object with values from the launch form. File inputs are absolute paths.

## Key Patterns

- **Parallel agents**: Use \`Promise.allSettled([ai.generate(...), ai.generate(...)])\` for concurrent AI calls
- **Custom tools for structured output**: Define \`customTools\` with JSON schema parameters so the AI returns structured data
- **Anchor validation**: When adding comments, validate that \`text_snippet\` exists in the document before inserting
- **User gates**: Use \`ui.confirm()\` or \`ui.approve()\` for human-in-the-loop checkpoints
- **Error handling**: \`ui.error(message)\` to fail gracefully

## Instructions for the AI Agent

1. **Read the full SDK guide first**: \`docs/workflow-sdk-guide.md\` has complete documentation
2. **Ask the user** what the workflow should do, what inputs it needs, and where to put it (global vs project)
3. **Create the directory** and both files (\`workflow.json\` + \`run.js\`)
4. **Test by running**: Tell the user to open the WORKFLOWS tab in the right sidebar to find and run the new workflow
5. **Iterate**: If the user wants changes, edit the files directly
`
