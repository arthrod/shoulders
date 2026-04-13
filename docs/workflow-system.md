# Workflow System

Structured, repeatable AI pipelines with author-controlled logic. Unlike chat (AI decides what to do) or skills (prompt injection into chat), workflows are JavaScript scripts that orchestrate constrained AI sub-agents with deterministic step order. The key architectural decision: **Web Worker isolation with no external runtime** — no Bun, no Node, no subprocess. The SDK and user code run in a browser Worker, communicating with the Vue store via `postMessage`.

See **[workflow-sdk-guide.md](workflow-sdk-guide.md)** for the developer-facing guide (how to write workflows). This document covers internals.

---

## Key Files

| File | Role |
|---|---|
| **Store & runtime** | |
| `stores/workflows.js` | Pinia store: discovery, run lifecycle, Worker management, message dispatch, AI orchestration |
| `workflow-sdk/@shoulders/workflow/index.mjs` | SDK source — runs inside the Worker, provides `ai`, `ui`, `workspace`, `inputs` |
| `workflow-sdk/@shoulders/workflow/package.json` | SDK package metadata |
| **Vue components** | |
| `components/panel/SidebarWorkflow.vue` | Sidebar drill-in: back bar + start screen / execution view (based on `aiSidebar.activeWorkflowRunId`) |
| `components/workflows/WorkflowStartScreen.vue` | Pre-run: name, description, README, inputs form, Run button |
| `components/workflows/WorkflowExecution.vue` | Live execution: step groups, AI output (via `ChatMessage.vue`), interactions, completion actions |
| `components/workflows/WorkflowFormRenderer.vue` | Declarative form from `workflow.json` inputs schema (file, text, select) — reused for mid-run `ui.form()` |
| `components/workflows/WorkflowCustomUI.vue` | Tier 3 custom UI placeholder (not yet implemented) |
| **Supporting** | |
| `utils/fileTypes.js` | `isWorkflow()` / `getWorkflowId()` — detects `workflow:` pseudo-paths |
| `css/components.css` | `.workflow-step-active` pulsing dot animation |
| **Workflow format** | |
| `workflows/peer-review/workflow.json` | Example: metadata, tool whitelist, input schema |
| `workflows/peer-review/run.js` | Example: multi-step peer review with AI sub-agents |

---

## Architecture

```
┌─────────────────────────────────────┐     ┌──────────────────────────────────┐
│  Web Worker (Blob URL)              │     │  Vue Store (workflows.js)        │
│                                     │     │                                  │
│  SDK (index.mjs)                    │     │  _handleMessage() dispatcher     │
│    ├─ inputs, ui, workspace, ai     │     │    ├─ ui.* → run.messages[]     │
│    ├─ pending Map (id → promise)    │     │    ├─ ai.generate → streamText  │
│    └─ IPC: sendAndWait()            │     │    ├─ workspace.* → Rust invoke │
│                                     │ ←── │    └─ custom_tool.* → callbacks │
│  User code (run.js, import stripped)│     │                                  │
│    └─ calls ai.generate(), ui.*,    │     │  _workers Map (runId → Worker)  │
│       workspace.*, etc.             │     │  _customToolCallbacks Map        │
└─────────────────────────────────────┘     └──────────────────────────────────┘
         postMessage ←→ onmessage                    │
                                              ┌──────┴──────┐
                                              │  streamText  │  (AI SDK)
                                              │  + tauriFetch │
                                              │  + Rust proxy │
                                              └─────────────┘
```

The SDK source is imported into the store via Vite's `?raw` import:

```js
import sdkSource from '../../workflow-sdk/@shoulders/workflow/index.mjs?raw'
```

On run start, the store:
1. Reads the user's `run.js` from disk via Rust `read_file`
2. Strips the `import { ai, ui, workspace, inputs } from '@shoulders/workflow'` line
3. Concatenates: SDK source (an open async IIFE) + stripped user code + closing `})()`
4. Creates a `Blob` → `URL.createObjectURL` → `new Worker(blobUrl)`

The SDK's async IIFE structure means user code shares the closure and can reference `ai`, `ui`, `workspace`, `inputs` directly — no actual module resolution needed.

**`_workers`** and **`_customToolCallbacks`** are module-level `Map` instances outside Pinia (same pattern as `chatInstances` in `chat.js`). This avoids Vue reactivity overhead on Worker references and callback functions.

---

## IPC Protocol

All messages are plain objects sent via `postMessage`. Request-response pairs use an `id` field for correlation. The SDK's `sendAndWait()` creates a Promise keyed by `id`; the store's `_sendToWorker()` posts the response with the same `id`.

### Worker → Store

| Type | Purpose | Key fields |
|---|---|---|
| `ui.step` | Start a named step | `name` |
| `ui.log` | Status text update | `message` |
| `ui.complete` | Mark current step done | `summary` |
| `ui.finish` | Workflow succeeded | `output` (markdown string) |
| `ui.error` | Workflow failed | `message` |
| `ai.generate` | Request AI generation | `id`, `prompt`, `tools`, `customToolDefs`, `system`, `model` |
| `workspace.readFile` | Read file | `id`, `path` |
| `workspace.writeFile` | Write file | `id`, `path`, `content` |
| `workspace.listFiles` | List directory | `id`, `dir` |
| `workspace.searchContent` | Content search | `id`, `query` |
| `workspace.readReferences` | Get reference library | `id` |
| `workspace.openFile` | Open file in editor | `id`, `path` |
| `workspace.addComments` | Add margin comments | `id`, `path`, `annotations` |
| `workspace.insertText` | Insert at position | `id`, `path`, `position`, `text` |
| `workspace.addReference` | Add to library | `id`, `entry` |
| `workspace.exec` | Run shell command | `id`, `command` |
| `ui.chat` | Request user text input | `id`, `prompt` |
| `ui.confirm` | Yes/no dialog | `id`, `message` |
| `ui.approve` | Approve/reject gate | `id`, `title`, `details` |
| `ui.form` | Structured form | `id`, `schema` |
| `ui.pickModel` | Model selector | `id` |
| `custom_tool.result` | Custom tool execution result | `id`, `output`, `isError` |

### Store → Worker

| Type | Purpose | Key fields |
|---|---|---|
| `init` | Bootstrap Worker with inputs and config | `inputs`, `config` (tools whitelist, workflowDir, workflowName, runId) |
| `{type}.done` | Success response to workspace/ui request | `id`, plus result fields |
| `{type}.error` | Error response | `id`, `error` |
| `ai.generate.done` | AI generation complete | `id`, `output`, `toolCalls`, `usage` |
| `ai.generate.error` | AI generation failed | `id`, `error` |
| `ai.generate.chunk` | Streaming text delta (UI display only — SDK ignores) | `id`, `text` |
| `custom_tool.execute` | Request Worker to run a custom tool | `id`, `name`, `input` |

The SDK explicitly ignores `.chunk` messages (`_handleIncoming` returns early). These exist only for the store to update `run.streamingText` for live UI rendering.

---

## Execution Flow

1. User selects a workflow in the right sidebar's WORKFLOWS mode and clicks **Run** (or fills inputs form first)
2. `SidebarWorkflow.vue` calls `workflowsStore.startRun(workflowId, inputs)` and sets `aiSidebar.activeWorkflowRunId` to the returned `runId`
3. Store finds the workflow definition, generates a `runId` via `nanoid(12)`
4. Store creates initial `RunState` with status `'running'` and a receipt message
5. Store reads `run.js` from disk, strips the SDK import line
6. Store concatenates `sdkSource + strippedCode + '\n})()'` into a Blob URL Worker
7. Worker starts — SDK waits for `init` message (`await new Promise(...)`)
8. Store posts `{ type: 'init', inputs, config }` — SDK resolves, installs real message handler
9. User code executes — calls to `ui.step()`, `ai.generate()`, `workspace.readFile()` etc. flow as postMessages
10. Store dispatches each message to the appropriate handler (`_handleMessage` switch)
11. AI calls go through `_handleAiGenerate` (see next section)
12. On `ui.finish` or `ui.error`: store updates run status, pushes final message, calls `_cleanupWorker` (terminates Worker, deletes from `_workers` Map)

Cancel: `cancelRun()` calls `worker.terminate()` directly — kills the Worker mid-execution. Run status set to `'cancelled'`.

---

## AI Call Path

`_handleAiGenerate` is the core of the system. It runs **in the store** (main thread), not in the Worker. The Worker sends `ai.generate` and blocks on the response; the store does all the real work.

The implementation uses the **same code path as chat** (`chatTransport.js`):

```js
const result = streamText({
  model,                          // createModel(access, tauriFetch) — same as chat
  messages: [{ role: 'user', content: msg.prompt }],
  tools,                          // getAiTools(workspace) — same tool objects as chat
  system: msg.system || undefined,
  stopWhen: stepCountIs(15),      // AI SDK v6 tool loop control
  providerOptions,                // buildProviderOptions(thinkingConfig, provider) — same as chat
  onStepFinish(event) { ... },    // usage tracking via useUsageStore().record()
})
```

Key details:

- **Model resolution**: `resolveApiAccess({ modelId })` — same as chat. Supports direct API keys and Shoulders proxy.
- **Tools**: `getAiTools(workspace)` returns the same tool objects with real `execute` functions that chat uses. Filtered to the intersection of `msg.tools` (what the workflow requested) and `workflow.json` whitelist.
- **Custom tools**: Defined inline with `defineTool()` from AI SDK. Their `execute` functions post `custom_tool.execute` to the Worker and return a Promise (see Custom Tool Callbacks below).
- **`stopWhen: stepCountIs(15)`**: AI SDK v6 replaced `maxSteps` with `stopWhen`. The default is `stepCountIs(1)` which means **no tool looping at all** — the model calls a tool and stops. This was a bug that cost hours to debug. Always pass `stopWhen: stepCountIs(N)` for tool loop behavior.
- **Streaming**: The store iterates `result.fullStream`, accumulating text deltas into `run.streamingText` and building `ai-output` message parts (text, tool-call, tool-result). The Worker doesn't see streaming — it gets the final `ai.generate.done` with the complete output.
- **Usage tracking**: `onStepFinish` records per-step usage via `useUsageStore().record()` with feature `'workflow'`.

---

## Custom Tool Callbacks

When a workflow defines `customTools` in `ai.generate()`, the execute function runs **in the Worker** (the workflow author's code), but the AI model runs **in the store**. The callback pattern bridges this:

```
Store: streamText calls custom tool execute()
  → Store posts { type: 'custom_tool.execute', id, name, input } to Worker
  → Worker SDK runs _handleCustomToolCallback — calls author's execute function
  → Worker posts { type: 'custom_tool.result', id, output } back
  → Store resolves the Promise — streamText sees the tool result
```

Implementation:

```js
// In _handleAiGenerate, for each custom tool:
execute: async (input) => {
  const callId = nanoid(8)
  return new Promise((resolve, reject) => {
    _customToolCallbacks.set(callId, { resolve, reject })
    this._sendToWorker(runId, { type: 'custom_tool.execute', id: callId, name: def.name, input })
    setTimeout(() => {
      if (_customToolCallbacks.has(callId)) {
        _customToolCallbacks.delete(callId)
        reject(new Error(`Custom tool ${def.name} timed out (5 min)`))
      }
    }, 300000) // 5 minute timeout
  })
}
```

`_customToolCallbacks` is a module-level `Map` (outside Pinia). Each pending callback has a 5-minute timeout.

---

## UI Rendering

**`SidebarWorkflow.vue`** is the drill-in entry point for workflows in the right sidebar. It switches between `WorkflowStartScreen` (pre-run) and `WorkflowExecution` (during/after run) based on `aiSidebar.activeWorkflowRunId`. Multiple runs of the same workflow can coexist — each appears as a separate item in the ACTIVE overview. Clicking a workflow in the WORKFLOWS tab always shows the start screen; clicking a running workflow in the ACTIVE tab shows its execution.

**`WorkflowStartScreen.vue`**: Renders workflow name, description, optional README (loaded from disk, rendered as markdown), inputs form (`WorkflowFormRenderer`), and Run button. Validates required fields before enabling Run.

**`WorkflowExecution.vue`**: The `stepGroups` computed property groups `run.messages[]` into a structured view:

- **receipt** — workflow name, description, inputs summary
- **step** — step header (name, status indicator, summary, duration) + children (ai-output, log, interaction)
- **finish** — final markdown output
- **error** — error display
- **orphan** — messages outside any step

Step visibility: running steps are always expanded. Completed steps collapse to a one-line header (name + summary + duration). Click to expand. The `expandedSteps` reactive object tracks user toggles.

AI output within steps uses **`ChatMessage.vue`** — the same component as the chat sidebar. This means tool calls, streaming text, reasoning blocks all render identically.

**Interactions** (chat, confirm, approve, form) render inline in the execution stream. When `run.pendingInteraction` is set, the appropriate input control appears. On user response, `respondToInteraction()` posts the reply to the Worker and clears the pending state.

**Completion actions**: Save as file (Tauri dialog), Copy, Discuss in chat (creates a new chat session with `<workflow-output>` context), Re-run (clears active run, returns to start screen).

---

## Gotchas

- **`stopWhen: stepCountIs(N)` not `maxSteps`** (AI SDK v6). The default `stepCountIs(1)` means no tool looping. Always pass explicitly. This was a multi-hour debugging session.
- **`part.text` not `part.textDelta`** for `text-delta` stream parts in `fullStream`. The AI SDK uses `.text` (not `.textDelta`) as the field name on the part object, despite the part type being `text-delta`.
- **Blob URL Workers can't resolve relative imports** — the combined SDK+user code must be a single file. Workflows with multiple JS modules won't work. This is a fundamental Web Worker limitation with Blob URLs.
- **`self.close()` for Worker termination**, not `process.exit()`. The SDK calls `self.close()` in `ui.finish()` and `ui.error()`. The store also calls `worker.terminate()` as a safety net.
- **SDK source bundled via `?raw` Vite import** — changes to `workflow-sdk/@shoulders/workflow/index.mjs` require a Vite rebuild (HMR picks it up in dev).
- **`_workers` and `_customToolCallbacks` are module-level Maps** outside Pinia. Same pattern as `chatInstances` in `chat.js`. Never put Worker references in reactive state.
- **Tool whitelist enforced in the Worker**, not the store. The SDK's `ai.generate()` checks `_config.tools` and throws if requested tools aren't in the whitelist. The store trusts the Worker's request.
- **Streaming chunks are one-way**: `ai.generate.chunk` messages go store→Worker but the SDK's `_handleIncoming` ignores them (returns early on `.chunk` suffix). They only drive `run.streamingText` for the UI.

---

## Cross-references

- **[workflow-sdk-guide.md](workflow-sdk-guide.md)** — Developer guide: how to write workflows, SDK API, patterns
- **[ai-system.md](ai-system.md)** — AI infrastructure: `createModel`, `tauriFetch`, `streamText`, `getAiTools`, provider options
- **[plan-workflows.md](plan-workflows.md)** — Original design document with business context, security model, and deferred features
