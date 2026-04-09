# Architecture

## App Shell

Tauri v2 desktop app. Rust backend serves as a bridge between the Vue 3 webview and the operating system. The frontend never touches the filesystem or network directly - all I/O goes through Tauri `invoke()` calls to Rust `#[tauri::command]` functions.

```
┌──────────────────────────────────────────────────────┐
│                    Tauri Window                       │
│  ┌────────────────────────────────────────────────┐  │
│  │              Vue 3 Webview                      │  │
│  │  Pinia Stores ←→ Vue Components                 │  │
│  │       ↕              ↕                          │  │
│  │  Services         Editor Extensions             │  │
│  │       ↕                                         │  │
│  │  invoke() ─────────────────────────────────┐    │  │
│  └────────────────────────────────────────────│────┘  │
│                                               ↓       │
│  ┌────────────────────────────────────────────────┐  │
│  │              Rust Backend                       │  │
│  │  fs_commands.rs  │  pty.rs  │  chat.rs          │  │
│  │  (files, git,    │  (PTY    │  (AI chat         │  │
│  │   watch, API     │   terms) │   streaming)      │  │
│  │   proxy, search) │          │                   │  │
│  │  preview_server.rs (HTML preview: local Axum)   │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

## Data Flow Patterns

### Pattern 1: Frontend → Rust → OS
Most operations follow this pattern. Example: reading a file.
```
Vue component → store action → invoke('read_file', {path}) → Rust fs::read_to_string → result
```

### Pattern 2: Rust → Frontend Events
File watching and PTY output use Tauri events. Rust emits; frontend listens.
```
Rust notify watcher → app.emit("fs-change", payload) → frontend listen("fs-change") → store update
Rust PTY reader thread → app.emit("pty-output-{id}") → Terminal.vue listen → xterm.write()
```

### Pattern 3: Frontend → Rust → External API → Frontend
AI features proxy through Rust to avoid CORS. Two variants:

**Non-streaming (ghost suggestions, reference AI):**
```
ai.js → invoke('proxy_api_call', {url, headers, body}) → Rust reqwest → API → response text → JSON.parse
```

**Streaming (AI chat):**
```
chat.js → invoke('chat_stream', {sessionId, request}) → Rust tokio::spawn → reqwest bytes_stream
  → app.emit('chat-chunk-{id}') per SSE chunk → frontend listen() → parseSSEChunk → reactive update
```

### Pattern 4: External Tool → File → File Watcher → Frontend
Claude Code edit interception uses the filesystem as an IPC mechanism.
```
Claude Code Edit tool → PreToolUse hook → intercept-edits.sh → writes pending-edits.json → notify watcher → fs-change event → reviews store reloads JSON → diff overlays update
```

## Component Hierarchy

```
App.vue
├── Header.vue
├── ResizeHandle.vue (left sidebar)
├── LeftSidebar.vue
│   ├── FileTree.vue
│   │   ├── FileTreeItem.vue (recursive)
│   │   └── ContextMenu.vue
│   └── ReferenceList.vue
├── PaneContainer.vue (recursive)
│   ├── EditorPane.vue (leaf nodes, routes by file type)
│   │   ├── TabBar.vue
│   │   ├── TextEditor.vue (CodeMirror, all text files)
│   │   ├── ChatPanel.vue (chat sessions as editor tabs, `chat:*` paths)
│   │   ├── PdfViewer.vue (Firefox PDF.js viewer app, same-origin iframe)
│   │   ├── CsvEditor.vue (Handsontable)
│   │   ├── ImageViewer.vue (base64 via Rust)
│   │   ├── DocxEditor.vue (SuperDoc)
│   │   ├── NotebookEditor.vue (Jupyter notebooks)
│   │   └── HtmlPreview.vue (local HTTP server, `htmlpreview:` prefix)
│   └── SplitHandle.vue (split nodes)
├── BottomPanel.vue (primary terminal panel, below editor area)
│   └── Terminal.vue (multiple, v-show toggled)
├── ResizeHandle.vue (right sidebar)
├── RightPanel.vue
│   ├── OutlinePanel.vue
│   ├── (Comments live in editor margin, not right panel)
│   ├── Terminal.vue (multiple, v-show toggled)
│   └── Backlinks.vue
├── Footer.vue
└── VersionHistory.vue (modal, teleported)
```

## State Architecture

Pinia stores, with clear dependency direction:

```
workspace ← files ← editor
    ↑          ↑
    ├── reviews (watches pending-edits.json via fs-change events)
    ├── comments (pure data store, uses workspace for .shoulders path)
    └── chat (uses workspace for API keys/models, files for content cache, reviews for edit recording, comments for tool access)
```

- **workspace** depends on nothing. Owns workspace path, API keys (multi-provider), models config.
- **files** depends on workspace (for the path). Owns file tree and content cache.
- **editor** depends on nothing at runtime. Owns pane tree and tab state.
- **reviews** depends on workspace (for .shoulders path). Owns pending edit data.
- **comments** depends on workspace (for .shoulders path). Pure CRUD data store for document comments.
- **chat** depends on workspace (API keys, models), and its tool execution accesses files, reviews, comments, and editor stores.

No circular dependencies. Services are stateless: `chatTools.js`, `chatTransport.js`, `chatModels.js`, `aiSdk.js` are extracted from the chat store for readability.

## Managed State in Rust

Eight state objects registered with `app.manage()`:

1. **`AddinState`** (`addin.rs`): Add-in management state.
2. **`PtyState`** (`pty.rs`): Holds a `Mutex<HashMap<u32, PtySession>>` (session map) and `Mutex<u32>` (next ID counter). Multiple concurrent PTY sessions supported.
3. **`WatcherState`** (`fs_commands.rs`): Holds a `Mutex<Option<RecommendedWatcher>>`. Only one directory watcher active at a time.
4. **`ChatState`** (`chat.rs`): Holds a `Mutex<HashMap<String, ChatSession>>`. Each session has a `cancel_tx` for abort. Multiple concurrent chat streams supported.
5. **`KernelState`** (`kernel.rs`): Jupyter kernel session management (ZeroMQ connections).
6. **`LatexState`** (`latex.rs`): LaTeX compilation state (Tectonic engine).
7. **`UsageDbState`** (`usage_db.rs`): SQLite connection for usage tracking (`~/.shoulders/usage.db`).
8. **`WorkflowState`** (`workflows.rs`): Workflow execution state.

## Startup Sequence

1. `main.rs` → `lib.rs:run()` → Tauri builder sets up plugins, state, commands, starts app
2. Tauri loads webview → `index.html` → `main.js` → Vue app mounts
3. `App.vue:onMounted()`:
   a. Check `localStorage` for last workspace path
   b. If found and exists → `openWorkspace(path)`
   c. Otherwise → native folder picker dialog
4. `openWorkspace(path)`:
   a. Resolve global config directory (`~/.shoulders/`)
   b. Restore auth from localStorage (`initAuth()`)
   c. `initShouldersDir()` → create `.shoulders/` private AI state directory
   d. `initProjectDir()` → create `.project/` public project data directory
   e. `installEditHooks()` → install Claude Code edit interception hooks
   f. `loadSettings()` → load models.json, multi-key .env, skills manifest, instructions
   g. Start file watcher (`watch_directory`)
   h. Load usage data (usage store)
   i. `startAutoCommit()` → begin git auto-commit timer
   j. `initGitHub()` → initialize GitHub sync
   k. Persist last workspace + add to recents
   Then (called from `App.vue` after `openWorkspace`):
   l. `files.loadFileTree()` → Rust reads directory recursively
   m. `files.startWatching()` → listen for fs-change events
   n. `reviews.startWatching()` → load + watch pending-edits.json
   o. `chatStore.loadSessions()` → scan `.shoulders/chats/`, restore sessions, build meta index

## Key Architectural Constraints

1. **Single workspace at a time.** The app opens one folder. No multi-root workspaces.
2. **macOS-only assumptions.** Terminal spawns `/bin/zsh -l`. Titlebar uses macOS overlay style. Keyboard shortcuts use `Cmd`.
3. **No authentication or networking** (other than the Anthropic API proxy). No user accounts, no sync.
4. **No database.** All state is either in-memory (Pinia stores), on disk (files in the workspace), or in `localStorage` (last workspace path only).
5. **Eight themes.** Tokyo Night (default), Light, Solarized, One Light, Humane, Monokai, Nord, Dracula. Switchable via Settings modal.
