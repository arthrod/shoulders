# Word Bridge System

Connects Microsoft Word to Shoulders via a WebSocket bridge. The AI chat can read, edit, and comment on Word documents in real time while the user writes in Word.

---

## Architecture

```
Word Add-in (Office.js)  ──[WebSocket/TLS]──▶  Rust Bridge Server  ──[Tauri event]──▶  Vue Frontend
Vue Frontend             ──[Tauri invoke]───▶  Rust Bridge Server  ──[WebSocket/TLS]──▶  Word Add-in
```

Three layers, each in a different runtime:

| Layer | Runtime | Key Files | Role |
|---|---|---|---|
| **Word Add-in** | Office.js WebView inside Word | `addin/taskpane/taskpane.js`, `index.html`, `taskpane.css` | Executes Word.js API calls, sends events to Shoulders |
| **Rust Bridge** | Tokio async (in-process Axum server) | `src-tauri/src/addin_server.rs`, `addin.rs`, `addin_certs.rs` | HTTPS + WebSocket server on `localhost:3001`, routes messages both ways |
| **Vue Frontend** | Tauri webview | `src/services/wordBridge.js`, `src/stores/editor.js`, `src/services/chatTools.js` | Event handling, editor store integration, AI tool routing |

### Connection Lifecycle

1. App opens workspace → `App.vue` calls `addin_start` (Rust spawns Axum server on port 3001 with self-signed TLS)
2. User opens Shoulders add-in in Word → taskpane loads `https://localhost:3001/taskpane/index.html`
3. Taskpane connects WebSocket to `wss://localhost:3001/ws`, sends `word-connect` handshake with document path
4. Rust hub registers the client, emits Tauri event `word-bridge-event` with `{ type: "file-opened", path, metadata }`
5. `wordBridge.js` listener fires → `editorStore.reconnectWordBridge(path, metadata)` → tab appears in Shoulders
6. `EditorPane` renders `WordBridgePane` (status display, not an editor — the document is rendered in Word)

### Disconnect Behavior

When the user closes the Word taskpane:
- `window.beforeunload` sends `file-closed` → WebSocket closes
- `wordBridge.js` marks the entry as `connected: false` (does NOT delete it)
- Tab stays open showing "Word Bridge disconnected" with reconnection instructions
- When taskpane reopens, auto-reconnect (3s retry) re-establishes connection
- Tab flips back to "connected" state
- Only closing the tab in Shoulders fully removes the `wordBridgeFiles` entry

**Why not keep the connection alive?** Office.js has no background execution model. The taskpane IS the JavaScript context — closing it terminates all code. This is a fundamental platform limitation.

---

## File Map

### Rust Backend
| File | What |
|---|---|
| `src-tauri/src/addin_server.rs` | Axum HTTPS + WebSocket server, `AddinHub` (client registry, message routing), Tauri event emission. **Do not modify lightly** — async correctness is critical. |
| `src-tauri/src/addin.rs` | Tauri commands: `addin_start`, `addin_stop`, `addin_status`, `addin_send_command`, `addin_install_manifest`, `addin_setup`, `addin_is_setup` |
| `src-tauri/src/addin_certs.rs` | Self-signed CA + server cert generation (rcgen), `trust_ca_interactive()` for macOS admin prompt |

### Vue Frontend
| File | What |
|---|---|
| `src/services/wordBridge.js` | Tauri IPC client. `connect()`, `disconnect()`, `initWordBridge()`, public API (`readDocument`, `editText`, `insertComment`, `insertAtCursor`, etc.). Exports reactive `wordFiles` Map and `connected` ref. |
| `src/stores/editor.js` | `wordBridgeFiles` Map (path → `{ metadata, connectedAt, connected }`), `registerWordBridge()`, `disconnectWordBridge()`, `reconnectWordBridge()`, `isWordBridge()` getter. Cleanup in `closeTab()`. |
| `src/utils/fileTypes.js` | `getViewerType()` returns `'word-bridge'` when `isWordBridge(path)` is true |
| `src/components/editor/EditorPane.vue` | Routes to `WordBridgePane` when viewerType is `'word-bridge'` |
| `src/components/editor/WordBridgePane.vue` | Status display: connected state + "Ask AI" button, disconnected state + reconnection instructions |
| `src/services/chatTools.js` | `read_file`, `edit_file`, `add_comment` check `wordBridge.isConnected(path)` and route through bridge |
| `src/services/workspaceMeta.js` | Appends "(Word)" to files in workspace meta context |
| `src/components/layout/Footer.vue` | Shows Word icon + filename when connected files exist |
| `src/components/settings/SettingsEnvironment.vue` | Word Bridge setup section (cert trust, manifest install, status) |

### Word Add-in
| File | What |
|---|---|
| `addin/taskpane/taskpane.js` | Office.js logic: WebSocket connection, command execution, action feed, selection polling, comment event handler |
| `addin/taskpane/index.html` | Taskpane HTML: status display, activity feed |
| `addin/taskpane/taskpane.css` | Taskpane styles |
| `addin/manifest.xml` | Office XML manifest for macOS `wef` sideloading |

---

## Commands (Word → Shoulders → Word)

The bridge supports request-response commands from Shoulders to Word:

| Command | Sent By | What It Does | Returns |
|---|---|---|---|
| `read-document` | chatTools `read_file` | Reads full document via Office.js | `{ text, paragraphs[], tables[], comments[], metadata }` |
| `edit-text` | chatTools `edit_file` | Search & replace with optional tracked changes | `{ success, matchCount }` |
| `insert-comment` | chatTools `add_comment` | Inserts comment anchored to text | `{ success, wordCommentId }` |
| `reply-comment` | chatTools `reply_to_comment` | Replies to existing comment | `{ success }` |
| `resolve-comment` | chatTools `resolve_comment` | Marks comment as resolved | `{ success }` |
| `get-selection` | selection polling | Returns current selection + paragraph context | `{ selectedText, paragraphContext }` |
| `get-metadata` | handshake | Document title, author, path | `{ title, author, path }` |
| `insert-at-cursor` | (future: cite_reference) | Inserts text at cursor position | `{ success }` |

### Command Flow

```
chatTools.js → wordBridge.editText(path, old, new)
  → invoke('addin_send_command', { path, command })
    → Rust hub injects requestId, sends to Word client via WebSocket
      → taskpane.js executeCommand() → Word.run(async (context) => { ... })
        → sends { type: 'response', requestId, result } back via WebSocket
          → Rust hub resolves oneshot channel
            → invoke returns result to chatTools
```

**Critical:** `addin_send_command` in Rust clones the `Arc<AddinHub>` and drops the Mutex lock before awaiting `send_command_to_word()`. The await can take up to 30 seconds — holding the lock would deadlock.

---

## Word.js API Constraints

### 255-Character Search Limit

`Body.search()`, `Paragraph.search()`, and `Range.search()` all reject strings longer than 255 characters with `SearchStringInvalidOrTooLong`.

**Solution — Two-Anchor Bracket Strategy** (in `editText()`, `taskpane.js`):

For strings ≤ 255 chars: direct `Body.search()`.

For strings > 255 chars:
1. Load all paragraphs into JS (`paragraphs.load('items/text')`)
2. Find which paragraph contains `oldText` via JS `String.includes()` (no limit)
3. Search the paragraph for the first ~200 chars of `oldText` → `startRange`
4. Search the paragraph for the last ~200 chars of `oldText` → `endRange`
5. `startRange.expandTo(endRange)` → combined range covering the full text
6. `combinedRange.insertText(newText, Word.InsertLocation.replace)`

Does NOT handle cross-paragraph matches — returns a clear error asking the AI to break the edit into smaller pieces.

### Comment Author Cannot Be Set

`Range.insertComment(text)` always attributes the comment to the signed-in Office user. There is no API to set the author to "Shoulders AI". The AI guidance in `chatTools.js` notes this limitation.

### Comments Require WordApi 1.4+

`Body.getComments()`, `Range.insertComment()`, and comment events (`onCommentAdded`) require WordApi 1.4 or later. The `readDocument()` comment extraction is wrapped in try-catch for older versions.

### Taskpane = Execution Context

Office.js has no service worker or background script model. Closing the taskpane terminates all JavaScript execution. No way to keep the bridge alive without the taskpane open.

---

## Setup Flow

One-click setup via Settings → Environment → Word Bridge:

1. `addin_setup` command in Rust:
   - `ensure_certs()` — generates CA + server cert if not already in `~/.shoulders/addin-certs/`
   - `trust_ca_interactive()` — runs `osascript` with `with administrator privileges` → native macOS admin password dialog
   - Copies `manifest.xml` to `~/Library/Containers/com.microsoft.Word/Data/Documents/wef/shoulders-word-bridge.xml`
   - Starts bridge server if not already running

2. User finds the add-in in Word: **Insert** tab → click the **▾ dropdown caret** next to "My Add-ins" (NOT the button itself — the tiny arrow) → "Shoulders" appears there.

### TLS Certificates

The bridge uses self-signed TLS because Office.js WebViews only connect to HTTPS endpoints. The CA cert must be trusted in the macOS System keychain for Word's WebView to accept the connection.

- Certs stored in `~/.shoulders/addin-certs/` (ca-cert.pem, server-cert.pem, server-key.pem)
- `ensure_certs()` returns cached certs if all 3 files exist
- Server binds TLS via `axum_server::tls_rustls::RustlsConfig::from_pem_file()`

---

## Events (Word → Shoulders)

Word sends these events to Shoulders via WebSocket → Rust → Tauri event:

| Event | When | Data |
|---|---|---|
| `file-opened` | Taskpane connects and identifies document | `{ path, metadata }` |
| `file-closed` | Taskpane closing (beforeunload) | `{ path }` |
| `selection-changed` | User selects text (polled every 5s) | `{ path, selectedText, paragraphContext }` |
| `ai-comment` | User writes `@ai` or `@shoulders` comment in Word | `{ commentId, anchorText, commentText, path }` |
| `document-modified` | Document content changed | `{ path }` |

---

## Taskpane Action Feed

The taskpane shows an activity log of bridge actions so the user gets visual confirmation when Shoulders operates on their document. Actions are logged for: document reads, comments (add/reply/resolve), text edits, errors, and connection events. The feed shows timestamp + description, with errors highlighted in red.

---

## What's NOT Built Yet

- **Inline suggestions in Word** — Options explored: tracked changes insertion (best UX), taskpane suggestion panel (easiest), content control placeholders (fragile). See conversation history for analysis.
- **Reference/citation insertion from taskpane** — Requires bidirectional message flow (Word → Shoulders request-response for searching refs). Architecture designed but not implemented. Chat-based `cite_reference` adaptation is simpler (uses `insert-at-cursor`).
- **Taskpane reference search UI** — Needs new Rust command `addin_send_to_client` and `requestId → clientId` tracking in the hub.
