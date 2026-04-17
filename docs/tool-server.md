# Tool Server

Local HTTP API that exposes Shoulders' domain-specific tools (references, paper search, comments, notebooks, canvas) to external CLI tools — primarily Claude Code running in the embedded terminal. One generic `POST` endpoint dispatches to the same `getAiTools()` execute functions used by the built-in AI chat. Zero tool code duplication.

---

## Architecture

```
Claude Code (in embedded terminal)
  → curl POST localhost:17532/api/tools/call
    → Rust Axum server (tool_server.rs)
      → Tauri event "tool-call-request" { id, tool, input }
        → JS listener (toolServer.js)
          → getAiTools(workspace)[tool].execute(input)
        → invoke("tool_call_response", { id, result })
      → Rust resolves oneshot channel → HTTP response
    ← JSON result
```

Three layers:

| Layer | Runtime | Key Files | Role |
|---|---|---|---|
| **HTTP Server** | Tokio async (Axum) | `src-tauri/src/tool_server.rs` | Accepts HTTP, auth check, event bridge, timeout |
| **Event Bridge** | Tauri IPC | `tool_server.rs` ↔ `toolServer.js` | Routes requests between Rust HTTP and JS tool execution |
| **Tool Dispatch** | Vue webview | `src/services/toolServer.js`, `src/services/chatTools.js` | Executes tools using the same code as the built-in AI chat |

The event bridge pattern is identical to the Word Bridge (`addin_server.rs`): Rust receives an external request, emits a Tauri event, the frontend handles it, and sends the result back via a Tauri command that resolves a `oneshot` channel.

---

## File Map

### Rust Backend
| File | What |
|---|---|
| `src-tauri/src/tool_server.rs` | Axum HTTP server on port 17532. `POST /api/tools/call` (tool dispatch), `GET /api/tools` (schema). Bearer token auth. Event bridge with pending request map (`HashMap<String, oneshot::Sender>`). 120s timeout. |
| `src-tauri/src/lib.rs` | Registers `ToolServerState`, 4 commands: `tool_server_start`, `tool_server_stop`, `tool_server_status`, `tool_call_response` |

### Vue Frontend
| File | What |
|---|---|
| `src/services/toolServer.js` | Tauri event listener for `tool-call-request`. Dispatches to `getAiTools(workspace)[tool].execute(input)`. Tool allowlist. Schema generation from zod. Doc generation (`writeToolDocs`). CLAUDE.md injection (`ensureClaudeMd`). |
| `src/services/chatTools.js` | Tool definitions — `getAiTools()` returns AI SDK `tool()` objects with zod schemas and execute functions. The tool server reuses these directly. |
| `src/App.vue` | Lifecycle: auto-starts tool server after Word Bridge init in `openWorkspace()`, stops in `closeWorkspace()` |
| `src/components/settings/SettingsEnvironment.vue` | Toggle switch under "Tool Server" heading. Persists to `localStorage('toolServerEnabled')`. |

### Generated Files (per workspace, in `.shoulders/`)
| File | What |
|---|---|
| `.shoulders/tool-api.md` | Auto-generated tool documentation. Regenerated on every workspace open. Lists all exposed tools with descriptions and parameter schemas. |
| `.shoulders/tool-server-token` | Random bearer token (UUID v4). Regenerated on every server start. |
| `.claude/CLAUDE.md` | Tool server section auto-injected (marked with `<!-- shoulders-tool-server -->` comment). Points Claude Code to `.shoulders/tool-api.md`. |

---

## API

### `POST /api/tools/call`

Execute a tool. Requires `Authorization: Bearer <token>` header.

```json
// Request
{ "tool": "search_references", "input": { "query": "attention mechanisms" } }

// Response (success)
{ "result": "Found 3 references:\n1. ..." }

// Response (error)
{ "error": "tool_error", "message": "Tool \"foo\" is not available via the tool server." }
```

### `GET /api/tools`

List all available tools with JSON Schemas. Same auth required.

```json
// Response
{
  "tools": [
    {
      "name": "search_references",
      "description": "Search local library",
      "category": "References",
      "input_schema": { "type": "object", "properties": { "query": { "type": "string" } }, "required": ["query"] }
    }
  ]
}
```

### Error Responses

| HTTP Status | Error | When |
|---|---|---|
| 401 | `unauthorized` | Missing or invalid bearer token |
| 400 | `tool_error` | Tool execution threw an error |
| 404 | N/A | Tool not in allowlist or disabled by user |
| 503 | `no_workspace` | No workspace currently open |
| 504 | `timeout` | Tool execution exceeded 120s |

---

## Tool Allowlist

Only domain-specific tools are exposed — tools that CLI tools like Claude Code cannot do natively. File operations, shell commands, and git are excluded (Claude Code has superior native equivalents).

**Exposed tools (~25):**

| Category | Tools |
|---|---|
| References | `search_references`, `get_reference`, `add_reference`, `cite_reference`, `edit_reference` |
| Web Research | `web_search`, `search_papers`, `fetch_url` |
| Feedback | `add_comment`, `reply_to_comment`, `resolve_comment`, `create_proposal` |
| Notebooks | `read_notebook`, `edit_cell`, `run_cell`, `run_all_cells`, `add_cell`, `delete_cell` |
| Canvas | `read_canvas`, `add_node`, `edit_node`, `delete_node`, `move_node`, `add_edge`, `remove_edge` |

**NOT exposed** (Claude Code has native equivalents): `read_file`, `write_file`, `edit_file`, `list_files`, `search_content`, `run_command`, `rename_file`, `move_file`, `duplicate_file`, `delete_file`.

The allowlist is defined as `TOOL_SERVER_ALLOWLIST` in `toolServer.js`. To expose a new tool, add its name to this Set.

---

## Lifecycle

### Startup (in `App.vue:openWorkspace()`)

1. Check `localStorage('toolServerEnabled')` — defaults to `true` (key absent = enabled)
2. Dynamic import `toolServer.js`
3. `initToolServer(workspace)` — registers Tauri event listener for `tool-call-request`
4. `invoke('tool_server_start')` — Rust starts Axum on port 17532, generates bearer token, returns `{ port, token }`
5. `writeToolDocs(workspace, port, token)` — writes `.shoulders/tool-api.md`, `.shoulders/tool-server-token`, updates `.claude/CLAUDE.md`

### Shutdown (in `App.vue:closeWorkspace()`)

1. `destroyToolServer()` — removes Tauri event listener
2. `invoke('tool_server_stop')` — Rust sends shutdown signal via `watch::channel`, Axum exits gracefully

### Settings Toggle

`SettingsEnvironment.vue` toggle calls `tool_server_start` / `tool_server_stop` directly. Persists preference to `localStorage`. Takes effect immediately without app restart.

---

## Security

- **Localhost only** — Axum binds to `127.0.0.1`, not `0.0.0.0`
- **Bearer token** — random UUID v4 generated on each server start, written to `.shoulders/tool-server-token`. Requests without valid token get 401.
- **No CORS** — no browser access needed (curl from terminal)
- **Path security** — all tool execute functions use `_resolvePath()` which prevents directory traversal (canonicalizes path, verifies it starts with `workspace.path`)
- **Allowlist** — only domain-specific tools exposed, no `run_command` or file write tools

---

## Event Bridge Detail

The bridge follows the same request/response pattern as the Word Bridge (`addin_server.rs`):

1. HTTP request arrives at Rust Axum handler
2. Generate UUID request ID
3. Create `oneshot::channel()`, store `Sender` in `pending: HashMap<String, Sender>`
4. `app.emit("tool-call-request", { id, tool, input })` — Tauri event to frontend
5. Frontend `listen("tool-call-request")` fires, dispatches to tool execute function
6. Frontend calls `invoke("tool_call_response", { id, result, error })` — Tauri command
7. Rust command looks up `id` in `pending` map, sends result through `oneshot::Sender`
8. Original Axum handler's `rx.await` resolves, returns HTTP response

Timeout: 120 seconds. If the frontend doesn't respond (e.g., webview reloaded during HMR), the pending request is cleaned up and the HTTP client gets a 504.

---

## Adding a New Tool to the Server

1. Define the tool in `src/services/chatTools.js` inside `getAiTools()` (with zod schema + execute function) — this is the same as adding any new AI chat tool
2. Add the tool name to `TOOL_SERVER_ALLOWLIST` in `src/services/toolServer.js`
3. That's it. The tool is now callable via HTTP and appears in the generated docs.

Metadata for the Settings UI (`TOOL_CATEGORIES` in `chatTools.js`) is separate and optional — it only affects the tool toggle grid in Settings.

---

## Claude Code Integration

When the app opens a workspace, it:
1. Writes `.shoulders/tool-api.md` with full tool documentation
2. Writes `.shoulders/tool-server-token` with the bearer token
3. Injects a `## Shoulders Tool API` section into `.claude/CLAUDE.md` (or creates the file)

Claude Code reads `CLAUDE.md` on startup, discovers the tool server, reads `tool-api.md` for the tool list, and uses `curl` with the bearer token from `tool-server-token`. This works for any workspace — the files are generated on every open.

The injected CLAUDE.md section is marked with `<!-- shoulders-tool-server -->` so it can be updated in place on subsequent opens without clobbering user content.

---

## Interaction with Other Systems

| System | Interaction |
|---|---|
| **Built-in AI chat** | Same `getAiTools()` execute functions. No duplication. |
| **Disabled tools** | Respected — `getAiTools(workspace)` filters by `workspace.disabledTools`. If a user disables `web_search` in Settings, it's disabled for both chat and tool server. |
| **Comments** | `add_comment` via tool server updates `useCommentsStore()` — comment appears in editor margin in real-time. |
| **References** | `add_reference` updates `useReferencesStore()` — reference appears in panel in real-time. |
| **Word Bridge** | DOCX tools chain through Word Bridge WebSocket. Two async bridges in sequence (HTTP → event bridge → Word Bridge). 120s HTTP timeout is the outer envelope. |
| **Jupyter** | Notebook tools go through `invoke('kernel_execute')`. Cell execution timeouts are handled internally (60s per cell, 300s for run_all). |
| **Usage tracking** | External API calls (Exa, OpenAlex) are tracked inside execute functions via `useUsageStore()`. Automatic — no additional work. |
| **Edit review** | Not a concern — `edit_file`/`write_file` are NOT exposed via the tool server. Claude Code uses its own native tools for file editing, which are intercepted by the `.claude/hooks/intercept-edits.sh` hook. |
