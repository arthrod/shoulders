# State Management

Seventeen Pinia stores plus two helper modules. All stores are defined using the Options API pattern (`defineStore('name', { state, getters, actions })`) unless otherwise noted.

## Relevant Files

| File | Store Name | Purpose |
|---|---|---|
| `src/stores/workspace.js` | `workspace` | Root store: workspace path, API keys, models config, sidebar state |
| `src/stores/files.js` | `files` | File tree data, content cache |
| `src/stores/editor.js` | `editor` | Pane tree, tab management, editor views |
| `src/stores/chat.js` | `chat` | AI chat sessions, streaming, persistence |
| `src/stores/reviews.js` | `reviews` | Edit review queue |
| `src/stores/comments.js` | `comments` | Document comments |
| `src/stores/links.js` | `links` | Wiki link index, backlinks, rename propagation |
| `src/stores/references.js` | `references` | Reference library (CSL-JSON), citations, import/export |
| `src/stores/usage.js` | `usage` | AI usage tracking, cost aggregation, budgets |
| `src/stores/kernel.js` | `kernel` | Jupyter kernel lifecycle, cell execution |
| `src/stores/typst.js` | `typst` | Markdown-to-PDF export via Typst |
| `src/stores/latex.js` | `latex` | LaTeX compilation via Tectonic |
| `src/stores/environment.js` | `environment` | Language runtime and kernel detection |
| `src/stores/canvas.js` | `canvas` | Visual canvas/whiteboard with AI-powered nodes |
| `src/stores/toast.js` | `toast` | Toast notification queue |
| `src/stores/docxExport.js` | `docxExport` | Markdown-to-DOCX export |
| `src/stores/workflows.js` | `workflows` | Workflow discovery, subprocess runs, tool loops |
| `src/stores/prompts.js` | `prompts` | Prompt library: defaults + user CRUD, persistence |
| `src/stores/aiSidebar.js` | `aiSidebar` | Right sidebar view state, overview mode, active/history items |
| `src/stores/utils.js` | (not a store) | `nanoid()` helper |
| `src/stores/defaultSkillContent.js` | (not a store) | Default `SKILL.md` template string for new workspaces |

## Store: workspace

**Dependencies**: None

### State
| Field | Type | Default | Purpose |
|---|---|---|---|
| `path` | `string \| null` | `null` | Absolute path to workspace folder |
| `settings` | `object` | `{}` | (currently unused - reserved) |
| `systemPrompt` | `string` | `''` | Content of `.shoulders/system.md` (internal base prompt) |
| `instructions` | `string` | `''` | Content of `_instructions.md` at workspace root (HTML comments stripped, hot-reloads) |
| `apiKey` | `string` | `''` | Anthropic API key (backwards-compat alias) |
| `apiKeys` | `object` | `{}` | All API keys from `~/.shoulders/keys.env` (`{ANTHROPIC_API_KEY, OPENAI_API_KEY, ...}`) |
| `modelsConfig` | `object\|null` | `null` | Parsed `~/.shoulders/models.json` (models + providers + `version`). On load, `MODELS_VERSION` migration upgrades stale model IDs in-place (see [ai-system.md](ai-system.md#adding-or-updating-models--checklist)) |
| `gitAutoCommitInterval` | `number` | `300000` | 5 minutes in ms |
| `gitAutoCommitTimer` | `number \| null` | `null` | `setInterval` handle |
| `leftSidebarOpen` | `boolean` | `true` | Left sidebar visibility |
| `rightSidebarOpen` | `boolean` | `false` | Right sidebar visibility |
| `leftSidebarWidth` | `number` | `240` | Pixels |
| `rightSidebarWidth` | `number` | `360` | Pixels |
| `bottomPanelOpen` | `boolean` | `false` | Bottom terminal panel visibility, persisted in localStorage |
| `bottomPanelHeight` | `number` | `250` | Bottom panel height in pixels, persisted in localStorage |
| `ghostEnabled` | `boolean` | `true` | Ghost suggestions (`++`) enabled, persisted in localStorage |
| `softWrap` | `boolean` | `true` | Editor line wrapping |
| `editorFontSize` | `number` | `14` | Editor font size (px), zoomable |
| `uiFontSize` | `number` | `13` | UI font size (px), zoomable |
| `theme` | `string` | `'default'` | Active theme name, persisted in localStorage |
| `disabledTools` | `array` | `[]` | Tool names disabled by user, persisted in `.shoulders/tools.json` |

### Getters
- `isOpen` - `!!path`
- `shouldersDir` - `${path}/.shoulders` or null
- `claudeDir` - `${path}/.claude` or null

### Key Actions
- `openWorkspace(path)` - Sets path, inits .shoulders/, loads settings, starts watcher + auto-commit, saves to localStorage
- `initShouldersDir()` - Creates `.shoulders/`, `notes/`, `system.md`, `.env`, `pending-edits.json`, `_instructions.md` (at root) if missing
- `loadSettings()` - Reads system.md, loads _instructions.md, parses ALL KEY=VALUE from .env into apiKeys, loads models.json, loads tool permissions
- `loadInstructions()` - Reads `_instructions.md` from workspace root, strips HTML comment lines, hot-reloads via file watcher
- `openInstructionsFile()` - Creates _instructions.md if missing, opens in editor (used by chat UI button)
- `autoCommit()` - Git add + commit (creates repo if needed)
- `setTheme(name)` - Switches theme: updates state, localStorage, toggles class on `<html>`
- `restoreTheme()` - Applies saved theme class on startup
- `zoomIn()` / `zoomOut()` / `resetZoom()` - Adjusts font sizes via CSS vars
- `loadToolPermissions()` - Reads `.shoulders/tools.json`, sets `disabledTools`
- `saveToolPermissions()` - Writes deny-list to `.shoulders/tools.json`
- `toggleTool(name)` - Adds/removes from `disabledTools`, saves immediately
- `toggleBottomPanel()` - Toggles bottom terminal panel, persists to localStorage
- `openBottomPanel()` - Opens bottom panel if not already open
- `setBottomPanelHeight(h)` - Sets bottom panel height, persists to localStorage
- `setGhostEnabled(val)` - Toggles ghost suggestions, persists to localStorage
- `cleanup()` - Stops auto-commit, does final commit, unwatches directory

## Store: files

**Dependencies**: workspace (for path)

### State
| Field | Type | Default | Purpose |
|---|---|---|---|
| `tree` | `FileEntry[]` | `[]` | Recursive file tree from Rust |
| `expandedDirs` | `Set<string>` | `new Set()` | Expanded directory paths |
| `activeFilePath` | `string \| null` | `null` | (legacy - mostly superseded by editor.activeTab) |
| `fileContents` | `object` | `{}` | Cache: absolute path → content string |
| `unlisten` | `function \| null` | `null` | fs-change event unsubscriber |

### Getters
- `flatFiles` - Flattened list of all non-directory entries (recursive walk of tree). Used by header search (SearchResults.vue) and @file popover.
- `flatDirs` - Flattened list of all directory entries (recursive walk of tree). Used by @folder popover.

### Key Actions
- `loadFileTree()` - Calls `read_dir_recursive` and stores result
- `startWatching()` - Listens for `fs-change`, debounces at 300ms, reloads tree + changed files
- `readFile(path)` - Reads via Rust, caches in `fileContents`
- `saveFile(path, content)` - Writes via Rust, updates cache
- `createFile(dirPath, name)` - Creates file with `# Title\n\n` header, reloads tree
- `createFolder(dirPath, name)` - Creates directory, reloads tree, auto-expands
- `renamePath(oldPath, newPath)` - Renames, reloads tree, updates activeFilePath/expandedDirs
- `deletePath(path)` - Deletes, reloads tree, clears cache/activeFilePath

## Store: editor

**Dependencies**: None (uses `nanoid` from utils.js)

### State
| Field | Type | Default | Purpose |
|---|---|---|---|
| `paneTree` | `object` | Root leaf node | Recursive pane tree (see [editor-system.md](editor-system.md)) |
| `activePaneId` | `string` | `'pane-root'` | Currently focused pane |
| `dirtyFiles` | `Set<string>` | `new Set()` | Files with unsaved changes |
| `editorViews` | `object` | `{}` | `"paneId:path"` → EditorView (non-reactive) |
| `cursorOffset` | `number` | `0` | Cursor byte offset in active editor (used by OutlinePanel for heading highlight) |


### Getters
- `activePane` - Finds the leaf node matching `activePaneId`
- `activeTab` - The active pane's activeTab
- `allOpenFiles` - Set of all file paths open in any tab in any pane

### Key Actions
- `findPane(node, id)` - Recursive tree search for leaf by ID
- `findParent(node, id)` - Find parent of a node by ID
- `findPaneWithTab(tabPath)` - Find the first leaf containing a specific tab path
- `_findLeaf(predicate)` - Generic tree walk returning first leaf matching a predicate
- `setActiveTab(paneId, path)` - Sets active tab
- `openFile(path)` - Opens file in active pane. Replaces active newtab tab if present.
- `openNewTab(paneId?)` - Creates a `newtab:{nanoid}` tab in the target pane (or reuses existing newtab in that pane)
- `moveTabToPane(fromPaneId, tabPath, toPaneId, insertIdx)` - Cross-pane tab move. Auto-saves chat sessions, collapses empty non-root source panes.
- `closeTab(paneId, path)` - Removes tab, selects adjacent
- `collapsePane(paneId)` - Replaces parent split with sibling
- `splitPane(direction)` - Splits active pane into two
- `reorderTabs(paneId, fromIdx, toIdx)` - Drag reorder within a pane
- `registerEditorView/unregisterEditorView/getEditorView` - EditorView instance management
- `saveEditorState()` - Debounced (500ms) save of pane tree to `.shoulders/editor-state.json`. Called automatically by all tree-mutating actions.
- `saveEditorStateImmediate()` - Immediate save (no debounce). Called by App.vue before workspace close.
- `restoreEditorState()` - Optimistic restore: applies tree instantly, validates tabs in parallel background. See [editor-system.md](editor-system.md#editor-state-persistence).

### Extracted Service
- `src/services/editorPersistence.js` — `saveState()`, `loadState()`, `findInvalidTabs()`. All disk I/O and validation logic lives here; store actions are thin wrappers.

## Store: chat

**Dependencies**: workspace (API keys, models config), and tool execution accesses files, reviews, editor stores via extracted services

### State
| Field | Type | Default | Purpose |
|---|---|---|---|
| `sessions` | `array` | `[]` | Active chat session objects (in-memory) |
| `activeSessionId` | `string\|null` | `null` | Currently displayed session |
| `allSessionsMeta` | `array` | `[]` | `[{id, label, updatedAt, messageCount}]` — index of ALL persisted sessions |

### Session Object
```javascript
{
  id: 'abc123',
  label: 'Chat 1',
  modelId: 'sonnet',
  messages: [/* Message objects */],
  status: 'idle' | 'streaming',
  createdAt: '2026-...',
  updatedAt: '2026-...',
  // Runtime-only (stripped on save):
  _unlistenChunk, _unlistenDone, _unlistenError, _sseBuffer, _currentToolInputJson
}
```

### Message Object
```javascript
{
  id: 'msg-xxx',
  role: 'user' | 'assistant',
  content: 'text',
  fileRefs: [{ path, content }],       // user: @-referenced files
  context: { file, selection, text },   // user: editor selection
  toolCalls: [{ id, name, input, output, status }],  // assistant: tool requests + results
  thinking: null | 'thinking text',           // concatenated thinking text (displayed in UI)
  _thinkingBlocks: [{ type, thinking, signature }],  // structured blocks (sent back to API)
  status: 'complete' | 'streaming' | 'error' | 'aborted',
  _isToolResult: bool,                  // synthetic user message with tool results
  _toolResults: [/* tool_result blocks */],
}
```

### Getters
- `activeSession` — find session by activeSessionId
- `streamingCount` — count of sessions with status `'streaming'`

### Key Actions
- `createSession(modelId?)` — creates with nanoid, sets active
- `closeSession(id)` — saves, removes from memory, keeps file on disk
- `deleteSession(id)` — removes from memory AND deletes file from disk
- `reopenSession(id)` — loads closed session from disk back into memory
- `sendMessage(sessionId, {text, fileRefs, context})` — creates user msg, calls `_streamResponse`
- `abortSession(sessionId)` — invokes `chat_abort` via Rust
- `loadSessions()` — clears sessions (prevents HMR duplication), scans `.shoulders/chats/`, loads all
- `saveSession(id)` — writes to `.shoulders/chats/{id}.json`, updates allSessionsMeta inline
- `loadAllSessionsMeta()` — full disk scan of chats dir for lightweight index

### Extracted Services (called by store)
- `chatTools.js` → `getToolDefinitions(workspace)` (filters disabled tools), `executeSingleTool(name, input, workspace)` (guards disabled), `TOOL_CATEGORIES`, `EXTERNAL_TOOLS`, `COMMENT_TOOL_NAMES`
- `chatTransport.js` → `createChatTransport(configFn)` — `ToolLoopAgent` + `DirectChatTransport` factory
- `aiSdk.js` → `createModel(access, customFetch)`, `buildProviderOptions()`, `convertSdkUsage()`
- `chatModels.js` → `getContextWindow(modelId, workspace)`, `getThinkingConfig()`
- `workspaceMeta.js` → `buildWorkspaceMeta(workspacePath)` (open tabs, git diff)
- `tokenEstimator.js` → `estimateConversationTokens()`, `truncateToFitBudget()`

## Store: reviews

**Dependencies**: workspace (for .shoulders path)

### State
| Field | Type | Default | Purpose |
|---|---|---|---|
| `pendingEdits` | `array` | `[]` | Edit records from pending-edits.json |
| `directMode` | `boolean` | `false` | Whether edit interception is bypassed |
| `unlisten` | `function \| null` | `null` | fs-change event unsubscriber |

### Getters
- `editsForFile(filePath)` - Filter pending edits for a specific file
- `pendingCount` - Count of edits with status `'pending'`
- `filesWithEdits` - Unique list of file paths with pending edits

### Key Actions
- `startWatching()` - Loads edits, watches for pending-edits.json changes via fs-change
- `loadPendingEdits()` - Reads and parses pending-edits.json
- `savePendingEdits()` - Writes pendingEdits array back to the JSON file
- `acceptEdit(editId)` - Marks as accepted, saves
- `rejectEdit(editId)` - Reverts the file change, marks as rejected, saves
- `acceptAll()` - Accepts all pending edits
- `toggleDirectMode()` - Creates/deletes `.shoulders/.direct-mode` flag file

## Store: comments

**Dependencies**: workspace (for .shoulders path), files (fileContents cache), editor (activeTab)

### State
| Field | Type | Default | Purpose |
|---|---|---|---|
| `comments` | `ref(array)` | `[]` | Comment objects (composition API) |

Pure data store — no Chat instances, no AI streaming. AI interaction happens through chat tools (`add_comment`, `reply_to_comment`, `resolve_comment` in `chatTools.js`).

### Key Actions
- `addComment(fileId, range, selectedText, text)` — Creates comment anchored to text range
- `replyToComment(commentId, text)` — Adds a reply to an existing comment
- `resolveComment(commentId)` — Marks comment as resolved
- `deleteComment(commentId)` — Removes comment permanently
- `updateRange(commentId, from, to)` — Updates anchor position (called by CM position mapping on doc changes)
- `commentsForFile(filePath)` — Filter comments for a specific file
- `submitToChat()` — Collects all unresolved comments, formats as structured context with file ref, sends to chat
- `loadComments()` — Reads `.shoulders/comments.json`
- `saveComments()` — Persists all comments to `.shoulders/comments.json`

## Store: links

**Dependencies**: workspace (for path), files (for flatFiles, fileContents, saveFile)

Full documentation: [wiki-links.md](wiki-links.md)

### State
| Field | Type | Default | Purpose |
|---|---|---|---|
| `forwardLinks` | `object` | `{}` | `path → link[]` — all wiki links found in each file |
| `backlinks` | `object` | `{}` | `path → backlink[]` — files that link TO each file |
| `nameMap` | `object` | `{}` | `normalizedName → path[]` — for link resolution |
| `headings` | `object` | `{}` | `path → {text, level, offset}[]` — structured headings per file |
| `initialized` | `boolean` | `false` | Whether fullScan has completed |

### Getters
- `backlinksForFile(filePath)` — backlinks for a specific file
- `headingsForFile(filePath)` — heading text strings (for wiki link autocomplete)
- `structuredHeadingsForFile(filePath)` — `[{text, level, offset}]` (for OutlinePanel)
- `allFileNames` — `[{name, path, normalized}]` for autocomplete

### Key Actions
- `fullScan()` — On workspace open, reads all .md files, builds all indices. Also caches content into `filesStore.fileContents` so citation detection (`references.citedIn`) works immediately.
- `updateFile(path)` — Incremental re-index after save or external change
- `handleRename(oldPath, newPath)` — Rewrites `[[oldName]]` → `[[newName]]` across all files
- `handleDelete(path)` — Removes from all indices
- `resolveLink(target, fromPath)` — Returns `{path, heading}` or `null`

## Store: references

**Dependencies**: workspace (for projectDir), files (fileContents for citation scanning)

Full documentation: [state-management.md section below], also referenced in CLAUDE.md under "Reference Management".

### State
| Field | Type | Default | Purpose |
|---|---|---|---|
| `library` | `array` | `[]` | CSL-JSON reference objects |
| `keyMap` | `object` | `{}` | `citeKey → index` in library for O(1) lookup |
| `initialized` | `boolean` | `false` | Whether library has been loaded |
| `loading` | `boolean` | `false` | Loading indicator |
| `activeKey` | `string\|null` | `null` | Currently selected reference key |
| `selectedKeys` | `Set<string>` | `new Set()` | Multi-select for bulk operations |
| `sortBy` | `string` | `'addedAt'` | Sort field: `'addedAt'`, `'author'`, `'year'`, `'title'` |
| `sortDir` | `string` | `'desc'` | Sort direction: `'asc'` or `'desc'` |
| `citationStyle` | `string` | `'apa'` | Active citation style ID |

### Getters
- `getByKey(key)` — O(1) reference lookup via `keyMap`
- `allKeys` — array of all cite keys
- `refCount` — library length
- `refsWithPdf` — references that have attached PDFs
- `sortedLibrary` — library sorted by current `sortBy`/`sortDir`
- `citedIn` — `{ key: [filePaths] }` scans `filesStore.fileContents` for Pandoc `[@key]` and LaTeX `\cite{key}` patterns
- `citedKeys` — Set of keys that appear in at least one file

### Key Actions
- `loadLibrary()` — reads `.project/references/library.json`, loads citation style from `.project/citation-style.json`, loads user CSL styles from `.project/styles/`
- `saveLibrary()` — debounced (500ms) write back to `library.json`
- `startWatching()` — watches `library.json` via `fs-change` for external edits, skips self-writes
- `addReference(cslJson)` — generates key, deduplicates (DOI exact match + title Jaccard > 0.85), saves, flags for Zotero push-back if configured
- `addReferences(cslArray)` — batch import, returns `{ added, duplicates, errors }`
- `updateReference(key, updates)` — merges updates, rebuilds keyMap if key changed
- `removeReference(key)` — deletes ref, cleans up associated PDF + fulltext files, propagates delete to Zotero if applicable
- `searchRefs(query)` — multi-token search across title, key, DOI, year, authors, tags, journal, abstract
- `generateKey(cslJson)` — `authorYear` with a/b/c suffix for uniqueness
- `storePdf(key, sourcePath)` — copies PDF to `.project/references/pdfs/`, extracts full text to `fulltext/`
- `setCitationStyle(style)` — persists to `.project/citation-style.json`
- `exportBibTeX(keys?)` — returns BibTeX string for selected or all references
- `exportRis(keys?)` — returns RIS string for selected or all references

### Persistence
- Library: `.project/references/library.json` (CSL-JSON)
- PDFs: `.project/references/pdfs/{key}.pdf`
- Full text: `.project/references/fulltext/{key}.txt`
- Citation style: `.project/citation-style.json`
- User CSL styles: `.project/styles/*.csl`

## Store: usage

**Dependencies**: workspace (for path), toast (budget threshold warnings)

Full documentation: [usage-system.md](usage-system.md)

### State
| Field | Type | Default | Purpose |
|---|---|---|---|
| `monthData` | `object\|null` | `null` | Aggregated month: `{ total_cost, calls, by_feature, by_model, shoulders_cost, direct_cost, ... }` |
| `selectedMonth` | `string` | current `YYYY-MM` | Month selector for the usage view |
| `trendData` | `array` | `[]` | 12-month trend: `[{ month, cost, calls, shoulders_cost }]` |
| `dailyData` | `array` | `[]` | Daily breakdown for selected month |
| `monthlyLimit` | `number` | `0` | Budget cap in USD (0 = no limit) |
| `showInFooter` | `boolean` | `true` | Whether to show cost in footer |
| `showCostEstimates` | `boolean` | `false` | Opt-in dollar estimates for direct API key usage |
| `sessionTotals` | `object` | `{}` | `{ sessionId: cost }` — live per-session cost accumulator |

### Getters
- `totalCost` / `formattedTotal` — current month total
- `isNearBudget` — direct cost >= 80% of `monthlyLimit`
- `isOverBudget` — direct cost >= `monthlyLimit`
- `byFeature` / `byModel` — breakdowns from `monthData`
- `sessionCost(id)` — cost for a specific chat session
- `shouldersCost` / `directCost` — split by payment method
- `isCurrentMonth` — whether viewing the current month
- `allTimeCost` / `allTimeCalls` — aggregated across all trend data

### Key Actions
- `record({ usage, feature, provider, modelId, sessionId })` — writes to SQLite via `usage_record` Rust command, accumulates session cost, refreshes current month data
- `loadMonth()` / `loadTrend()` / `loadDailyTrend()` — queries from SQLite via Rust commands
- `navigateMonth(delta)` / `goToCurrentMonth()` / `goToMonth(ym)` — month navigation
- `loadSettings()` — reads `monthly_limit`, `show_footer_cost`, `show_cost_estimates` from SQLite settings; auto-clears stale budget if user has no direct API keys
- `setMonthlyLimit(usd)` / `setShowInFooter(val)` / `setShowCostEstimates(val)` — persist settings via Rust
- `checkBudgetThresholds()` — shows toast warnings at 80% and 100% of budget
- `rebuildSessionTotals(sessions)` — reconstructs session costs from message usage data

### Persistence
- All usage data stored in `~/.shoulders/usage.db` (SQLite, managed by Rust `usage_db.rs`)
- Settings stored in the same database's settings table

## Store: kernel

**Dependencies**: None (standalone, communicates with Rust backend via `invoke`)

Full documentation: [notebook-system.md](notebook-system.md)

### State
| Field | Type | Default | Purpose |
|---|---|---|---|
| `kernelspecs` | `array` | `[]` | Discovered kernel specs: `[{ name, display_name, language, path }]` |
| `kernels` | `object` | `{}` | Active kernels: `{ kernelId: { specName, displayName, language, status } }` |
| `cellOutputs` | `object` | `{}` | Execution outputs: `{ "kernelId::msgId": [output, ...] }` |
| `cellStatus` | `object` | `{}` | Execution status: `{ "kernelId::msgId": 'running'\|'done'\|'error' }` |
| `_listeners` | `object` | `{}` | Tauri event unsubscribers per kernel (internal cleanup) |

### Getters
- `availableKernels` — alias for `kernelspecs`
- `activeKernels` — active kernels as `[{ id, specName, displayName, language, status }]`
- `isAnyBusy` — true if any kernel has `status === 'busy'`

### Key Actions
- `discover()` — calls `kernel_discover` Rust command to find installed Jupyter kernelspecs
- `launch(specName)` — spawns a kernel via `kernel_launch`, listens for `kernel-status-{id}` events
- `execute(kernelId, code)` — sends code, returns `Promise<{ msgId, outputs, success }>` with 5-min timeout
- `executeAsync(kernelId, code)` — fire-and-forget variant, returns `{ msgId, key }` immediately
- `interrupt(kernelId)` — sends interrupt signal to kernel
- `shutdown(kernelId)` — shuts down kernel, cleans up listeners
- `shutdownAll()` — shuts down all active kernels (called on app close)
- `complete(kernelId, code, cursorPos)` — code completions from kernel
- `getOutputs(kernelId, msgId)` / `getStatus(kernelId, msgId)` — lookup helpers
- `clearOutputs(kernelId)` — clears stored outputs for a kernel

### Persistence
- No disk persistence. Kernel state is ephemeral (processes destroyed on app close).

## Store: typst

**Dependencies**: workspace (for projectDir)

Full documentation: [markdown-system.md](markdown-system.md)

### State
| Field | Type | Default | Purpose |
|---|---|---|---|
| `available` | `boolean` | `false` | Whether Typst engine is available |
| `exporting` | `object` | `{}` | `{ [mdPath]: 'exporting'\|'done'\|'error' }` — per-file export status |
| `pdfSettings` | `object` | `{}` | `{ [relativePath]: PdfSettings }` — per-file PDF configuration |

### Key Actions
- `checkAvailability()` — queries Rust `is_typst_available`
- `getSettings(mdPath)` — returns merged defaults + per-file overrides (template, font, font_size, page_size, margins, spacing, bib_style)
- `setSettings(mdPath, settings)` — updates per-file settings, persists immediately
- `loadSettings()` — reads `.project/pdf-settings.json`
- `persistSettings()` — writes to `.project/pdf-settings.json`
- `exportToPdf(mdPath, bibPath, settings)` — calls Rust `export_md_to_pdf`, tracks export status

### Persistence
- Per-file PDF settings: `.project/pdf-settings.json`
- Defaults: template=`clean`, font=`STIX Two Text`, font_size=11, page_size=`a4`, margins=`normal`, spacing=`normal`

## Store: latex

**Dependencies**: None (standalone, communicates with Rust backend)

Full documentation: [tex-system.md](tex-system.md)

### State
| Field | Type | Default | Purpose |
|---|---|---|---|
| `compileState` | `object` | `{}` | `{ [texPath]: { status, errors, warnings, pdfPath, synctexPath, log, durationMs, lastCompiled } }` |
| `tectonicEnabled` | `boolean` | `true` | Global toggle for LaTeX compilation |
| `autoCompile` | `boolean` | `true` | Whether auto-compile on save is enabled |
| `_timers` | `object` | `{}` | Debounce timers per file (internal) |
| `_recompileNeeded` | `object` | `{}` | Recompile flags for files edited during compilation (internal) |
| `tectonicInstalled` | `boolean` | `false` | Whether Tectonic binary is available |
| `tectonicPath` | `string\|null` | `null` | Path to Tectonic binary |
| `downloading` | `boolean` | `false` | Whether Tectonic download is in progress |
| `downloadProgress` | `number` | `0` | Download progress percentage |
| `downloadError` | `string\|null` | `null` | Download error message |

### Getters
- `stateForFile(texPath)` — compile state for a specific file
- `isCompiling(texPath)` — whether a file is currently compiling
- `errorsForFile(texPath)` / `warningsForFile(texPath)` — diagnostics

### Key Actions
- `scheduleAutoCompile(texPath)` — 4s debounce (total ~5s from keystroke including auto-save)
- `compile(texPath)` — runs `compile_latex` via Rust. Generates `.bib` first via `ensureBibFile()`. Queues recompile if called while already compiling.
- `setTectonicEnabled(enabled)` / `loadTectonicEnabled()` — toggle and persist via Rust
- `checkTectonic()` — checks if Tectonic binary exists
- `downloadTectonic()` — downloads Tectonic, listens for `tectonic-download-progress` events
- `cancelAutoCompile(texPath)` / `clearState(texPath)` / `cleanup()` — resource cleanup

### Persistence
- Tectonic enabled state persisted via Rust commands
- Compile results are ephemeral (not saved to disk)

## Store: environment

**Dependencies**: None (standalone, uses Rust `run_shell_command`)

### State
| Field | Type | Default | Purpose |
|---|---|---|---|
| `languages` | `object` | `{ python, r, julia }` | Per-language detection: `{ found, path, version, hasKernel, kernelName }` |
| `jupyter` | `object` | `{ found, path, version }` | Jupyter installation info |
| `detected` | `boolean` | `false` | Whether detection has completed |
| `detecting` | `boolean` | `false` | Detection in progress |
| `installing` | `string\|null` | `null` | Language currently being installed (`'python'`, `'r'`, `'julia'`, or null) |
| `installOutput` | `string` | `''` | Output from install command |
| `installError` | `string` | `''` | Error from install command |

### Getters
- `capability(lang)` — returns `'jupyter'` if kernel available, `'none'` otherwise
- `statusLabel(lang)` — human-readable status (e.g., `"Python 3.11.2"`, `"R found — no Jupyter kernel"`, `"Julia not found"`)

### Key Actions
- `detect()` — parallel detection of Python/R/Julia binaries, Jupyter, and installed kernelspecs. Matches kernels to languages via `jupyter kernelspec list`.
- `installKernel(language)` — installs `ipykernel` (Python), `IRkernel` (R), or `IJulia` (Julia), then re-detects
- `installHint(language)` — platform-aware install instructions string
- `installCommand(language)` — one-click install command for each language

### Persistence
- No disk persistence. Environment is re-detected on each app launch.

## Store: canvas

**Dependencies**: workspace (API keys, models config)

### State
| Field | Type | Default | Purpose |
|---|---|---|---|
| `filePath` | `string\|null` | `null` | Path to the currently loaded canvas file |
| `aiState` | `object` | `{ messages: {} }` | `{ messages: { nodeId: { role, content } } }` — AI conversation history per node |
| `undoStack` | `array` | `[]` | Undo snapshots (max 50) of `{ nodes, edges }` |
| `redoStack` | `array` | `[]` | Redo snapshots |
| `streamingNodeId` | `string\|null` | `null` | Node currently receiving AI streaming output |
| `contextHighlightIds` | `array` | `[]` | Node IDs highlighted as DAG context for a prompt |
| `_editor` | `object\|null` | `null` | Editor bridge methods (internal, non-reactive) |
| `_abortController` | `AbortController\|null` | `null` | Abort handle for active AI stream |

### Key Actions
- `load(filePath, data)` / `unload()` — lifecycle: loads canvas data including AI state, resets undo/redo
- `setEditorMethods(methods)` — wires up bridge to canvas editor component (`getNodes`, `getEdges`, `addTextNode`, `updateNodeData`, `scheduleSave`)
- `pushSnapshot(nodes, edges)` — records undo snapshot
- `undo()` / `redo()` — restores previous/next canvas state, returns snapshot for editor to apply
- `sendPrompt(promptNodeId)` — core AI action: collects DAG path from prompt node, builds API messages, creates response text node, streams AI output with `<node-content>` / `<node-title>` tag parsing
- `regenerateNode(nodeId)` — re-runs AI generation for an existing response node
- `abortStreaming()` — cancels active AI stream
- `highlightContext(promptNodeId)` / `clearContextHighlight()` — visualizes which nodes contribute to a prompt's context

### Persistence
- Canvas data (nodes, edges, viewport, aiState) is saved to the `.canvas` file by the editor component via `scheduleSave()`. The store itself does not handle disk I/O.

## Store: toast

**Dependencies**: None (standalone)

### State
| Field | Type | Default | Purpose |
|---|---|---|---|
| `toasts` | `array` | `[]` | Active toast objects: `{ id, message, type, action }` |
| `_recentKeys` | `object` | `{}` | Dedup map: `{ key: timestamp }` for `showOnce()` cooldowns |

### Key Actions
- `show(message, { type, duration, action })` — pushes a toast, auto-dismisses after `duration` ms (default 5000). `type` is `'success'`, `'error'`, `'warning'`, or `'info'`. `action` is optional `{ label, callback }`.
- `update(id, message, { type, action, duration })` — updates an existing toast in-place (no re-animation)
- `showOnce(key, message, options, cooldown)` — shows at most once per `cooldown` ms for the given key. Used for auto-save errors to avoid toasting on every keystroke.
- `dismiss(id)` — removes a toast

### Persistence
- No disk persistence. Toasts are ephemeral.

## Store: docxExport

**Dependencies**: workspace (for projectDir)

### State
| Field | Type | Default | Purpose |
|---|---|---|---|
| `exporting` | `object` | `{}` | `{ [mdPath]: 'exporting'\|'done'\|'error' }` — per-file export status |
| `docxSettings` | `object` | `{}` | `{ [relativePath]: DocxSettings }` — per-file DOCX configuration |

### Key Actions
- `getSettings(mdPath)` — returns merged defaults + per-file overrides (font, font_size, page_size, margins)
- `setSettings(mdPath, settings)` — updates per-file settings, persists immediately
- `loadSettings()` — reads `.project/docx-settings.json`
- `persistSettings()` — writes to `.project/docx-settings.json`
- `exportToDocx(mdPath, content, options)` — converts Markdown to DOCX blob via `docxExport` service, writes via `write_file_base64` Rust command. Returns `{ success, docxPath, duration_ms }`.

### Persistence
- Per-file DOCX settings: `.project/docx-settings.json`
- Defaults: font=`Calibri`, font_size=11, page_size=`a4`, margins=`normal`

## Store: workflows

**Dependencies**: workspace (for path, API access, models config), references (for `workspace.readReferences` op), editor (for `workspace.openFile` op)

### State
| Field | Type | Default | Purpose |
|---|---|---|---|
| `workflows` | `array` | `[]` | Discovered `WorkflowDefinition` objects |
| `runs` | `object` | `{}` | `{ [runId]: RunState }` — all runs keyed by ID (multiple runs of same workflow can coexist) |
| `_listeners` | `object` | `{}` | Tauri event unsubscribers per run (internal cleanup) |

### Getters
- `getRun(runId)` — lookup a run by ID
- `workflowsByCategory` — groups workflows into `{ category: [workflow, ...] }`
- `availableWorkflows` — filters out drafts

### Key Actions
- `discoverWorkflows()` — scans `.project/workflows/` and `~/.shoulders/workflows/` for `workflow.json` manifests
- `startRun(workflowId, userInputs)` — spawns subprocess via `workflow_spawn` Rust command, sets up event listeners, returns `runId`
- `cancelRun(runId)` — kills subprocess, marks run as cancelled
- `respondToInteraction(runId, response)` — sends user response to subprocess for `ui.chat`, `ui.confirm`, `ui.approve`, `ui.form`, `ui.pickModel` interactions
- `_handleMessage(runId, msg)` — dispatches workflow messages: UI progress (`ui.step`, `ui.log`, `ui.complete`, `ui.finish`, `ui.error`), AI generation (`ai.generate` — runs full tool loop in-process), workspace operations (`workspace.readFile`, `workspace.writeFile`, etc.), custom tool callbacks, user interactions
- `_handleAiGenerate(runId, msg)` — runs AI tool loop using the same `streamText` + tool infrastructure as chat. Supports both built-in tools and custom tools defined by the workflow.
- `cleanup()` — kills all running workflows, cleans up listeners

### Run State Object
```javascript
{
  id, workflowId, workflow,
  status: 'running' | 'completed' | 'failed' | 'cancelled',
  inputs, messages: [/* step/log/finish/error/interaction/ai-output */],
  currentStep, streamingText,
  startedAt, completedAt, error,
  pendingInteraction: null | { type, id, prompt, details, schema },
}
```

### Persistence
- Workflow definitions discovered from disk but not cached.
- Run state is ephemeral (not persisted across app restarts).
- Custom tool callbacks stored in a `Map` outside Pinia (`_customToolCallbacks`), same pattern as chat instances.

## Store: prompts

**File:** `src/stores/prompts.js` — Composition API  
**Persistence:** `.shoulders/prompts.json`

| Field | Type | Default | Description |
|---|---|---|---|
| `userPrompts` | `Prompt[]` | `[]` | User-created prompts loaded from disk |
| `editingId` | `string\|null` | `null` | Currently editing prompt id, or `'new'` |
| `builtinsCollapsed` | `boolean` | `false` | Collapse state of built-in section (localStorage) |

**Getters:**
- `allPrompts` — `[...userPrompts, ...DEFAULT_PROMPTS]`

**Actions:**
- `loadPrompts()` — read from `.shoulders/prompts.json`
- `addPrompt({ title, body })` — create with nanoid, persist
- `updatePrompt(id, { title, body })` — update, persist
- `removePrompt(id)` — delete, persist
- `usePrompt(promptId)` — set `chatStore.pendingPrefill`, switch sidebar to ACTIVE
- `startEditing(id)` / `cancelEditing()` — toggle inline editor

**Built-in defaults:** 6 research prompts (proofread, critique, summarise, find related work, tighten prose, explain code). Hardcoded, not deletable.

## Store: aiSidebar

**File:** `src/stores/aiSidebar.js` — Composition API  
**No persistence** (session-only state, resets on app restart).

| Field | Type | Default | Description |
|---|---|---|---|
| `viewState` | `string` | `'overview'` | `'overview'` \| `'conversation'` \| `'workflow'` |
| `activeSessionId` | `string\|null` | `null` | Chat session drilled into |
| `activeWorkflowId` | `string\|null` | `null` | Workflow definition being viewed |
| `activeWorkflowRunId` | `string\|null` | `null` | Specific workflow run being viewed |
| `overviewMode` | `string` | `'active'` | `'active'` \| `'workflows'` \| `'prompts'` \| `'history'` |
| `historyQuery` | `string` | `''` | Search filter for HISTORY mode |
| `archivedSessionIds` | `Set` | `new Set()` | Soft-archived chat sessions |
| `archivedWorkflowRunIds` | `Set` | `new Set()` | Soft-archived workflow runs |
| `panelMode` | `string` | `'ai'` | `'ai'` \| `'document'` (localStorage) |

**Key getters:** `activeSessions`, `activeItems`, `activeItemsByDate`, `historyItems`, `backButtonLabel`, `streamingCount`  
**Key actions:** `drillIntoChat`, `drillIntoWorkflow`, `drillIntoWorkflowRun`, `goBack`, `archiveSession`, `archiveWorkflowRun`, `createChatAndDrillIn`, `focusSidebarChat`, `openSidebar`

## Cross-Store Interactions

1. **App.vue** uses all stores. Orchestrates startup (incl. `chatStore.loadSessions()`, `comments.loadComments()`), keyboard shortcuts (`Cmd+Shift+L` → add comment).
2. **TextEditor.vue** uses files (content), editor (view registration), workspace (softWrap), reviews (pending edits → merge view), comments (commentsForFile → CM sync, updateRange), links (wiki link extension), latex (scheduleAutoCompile for `.tex` files).
3. **FileTree.vue** uses files (tree), editor (openFile), workspace (path).
4. **FileTreeItem.vue** uses files (expand), editor (activeTab), reviews (filesWithEdits badge).
5. **Footer.vue** uses workspace (softWrap toggle), reviews (pending count, direct mode toggle), usage (cost display, budget warnings).
6. **RightPanel.vue** uses links (backlink count), editor (activeTab), workspace (rightSidebarOpen).
7. **ChatInput.vue** uses workspace (modelsConfig, apiKeys), editor (activePane selection context).
8. **chatTools.js** (service) uses reviews (directMode, pendingEdits), files (fileContents cache), editor (openFile), comments (addComment, replyToComment, resolveComment), references (search, add, cite). Critical: updates `filesStore.fileContents` before recording pending edits.
9. **files.js** calls into links store: `saveFile()` → `updateFile()`, `renamePath()` → `handleRename()`.
10. **references.js** reads `filesStore.fileContents` in the `citedIn` getter to scan for citations across all open files.
11. **usage.js** is called by chat, canvas, and workflows stores after each AI response via `record()`. Uses toast store for budget warnings.
12. **workflows.js** dynamically imports references, editor, and chatTools during run execution for workspace operations and AI tool loops.
13. **OutlinePanel.vue** uses links (`structuredHeadingsForFile`), editor (`activeTab`, `cursorOffset`, `getEditorView`, `getAnySuperdoc`), files (`fileContents`).
14. **NotebookEditor.vue** uses kernel (launch, execute, shutdown), environment (capability check), editor (view registration).
15. **canvas.js** uses workspace (API keys, models config) and records usage via dynamic import of usage store.
