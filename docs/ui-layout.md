# UI Layout & Components

## Overall Layout

No global header or footer. The layout is chrome-minimal: sidebars bleed edge-to-edge, the main panel attaches directly, and a conditional context bar appears only when the left sidebar is hidden.

### Layout States

Two booleans define four states: left sidebar (open/closed) × right sidebar (open/closed).

**State 1: Left OPEN, Right OPEN**
```
┌──────────┬──┬─────────────────────────┬──┬──────────────┐
│ [≡][P▾][⚙]  │  │  3px shim (Mac, drag)     │  │ [▦] ACTIVE…  │
│          │R │  TabBar (h-[29px])        │R │              │
│ Explorer │e │                           │e │   AI Chat    │
│          │s │    PaneContainer          │s │   Sidebar    │
│ Refs     │i │    (editor panes)         │i │              │
│          │z │                           │z │              │
│          │e │                           │e │              │
│ git sync │  │  Terminal micro-bar       │  │              │
│          │  │  ─── or BottomPanel ───   │  │              │
└──────────┴──┴─────────────────────────┴──┴──────────────┘
```

**State 3: Left CLOSED (context bar appears)**
```
┌─────────────────────────────────────────┬──┬──────────────┐
│ [≡] project ▾ [⚙]  ── drag ── [🔍] [▦] │  │              │
├─────────────────────────────────────────┤  │              │
│  3px shim                               │R │   AI Chat    │
│  TabBar                                 │e │   Sidebar    │
│                                         │s │              │
│    PaneContainer                        │i │              │
│                                         │z │              │
│  Terminal micro-bar / BottomPanel        │e │              │
└─────────────────────────────────────────┴──┴──────────────┘
```

The context bar provides: expand toggle, project switcher, settings, search, and right sidebar toggle (when R is closed). It only renders when `!workspace.leftSidebarOpen`.

### Structural Architecture (App.vue)

```
<div class="flex h-full">                     ← top-level horizontal flex
  <!-- macOS placeholder dots (fixed) -->
  
  <div class="flex-1 flex-col min-w-0 pt-1"> ← left section (context bar + content)
    <header v-if="!leftSidebarOpen">          ← context bar (conditional)
    <div class="flex flex-1 overflow-hidden">  ← content row
      <template v-if="leftSidebarOpen">        ← sidebar + resize handle
      <div class="flex-1 flex-col">            ← main panel
        <div class="h-[3px]" (Mac shim)>
        <PaneContainer>
        <terminal micro-bar OR BottomPanel>
      </div>
    </div>
  </div>
  
  <ResizeHandle v-if="rightSidebarOpen">      ← right resize (top-level)
  <div v-show="rightSidebarOpen">             ← right sidebar (full window height)
</div>
```

Key design decisions:
- Right sidebar is a **top-level flex sibling** (full window height, independent of context bar)
- Left sidebar uses **v-if** (removed from DOM when closed — no rail, no 52px column)
- Right sidebar uses **v-show** (stays in DOM to preserve Chat/terminal state)
- Context bar only spans the left section, never over the right sidebar

### No Workspace (Launcher)
```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│                    [S] Shoulders                         │
│           Writing, references, and AI...                │
│                                                         │
│            [Open Folder] [Clone Repository]             │
│                                                         │
│                    RECENT                                │
│                    📁 thesis  ~/Documents/...            │
│                    📁 paper   ~/Desktop/...              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

No sidebars, no chrome. Full-window launcher.

## Relevant Files

| File | Role |
|---|---|
| **Root layout** | |
| `src/App.vue` | Root layout, keyboard shortcuts, workspace init, launcher/editor toggle, context bar, terminal micro-bar, macOS dots |
| `src/components/Launcher.vue` | Empty state: logo, Open Folder, Clone Repository, recent workspaces |
| `src/components/layout/SearchDialog.vue` | Command palette (Cmd+P): file/content/reference/chat search |
| `src/components/layout/WorkspaceSwitcher.vue` | Project switcher dropdown (from context bar or sidebar header) |
| `src/components/layout/ResizeHandle.vue` | Sidebar resize dividers (1px border + 7px hit area) |
| `src/components/layout/SnapshotDialog.vue` | Named snapshot input dialog (Cmd+S → "Name this version") |
| `src/components/layout/ToastContainer.vue` | Fixed bottom-right toast stack |
| `src/components/layout/ZoomHUD.vue` | Transient zoom percentage pill (Cmd+=/−) |
| **Left sidebar** | |
| `src/components/sidebar/LeftSidebar.vue` | Single-row header + two collapsible panels (Explorer, References) + git footer |
| `src/components/sidebar/FileTree.vue` | Explorer panel content |
| `src/components/sidebar/FileTreeItem.vue` | Tree nodes |
| `src/components/sidebar/ContextMenu.vue` | Right-click menu |
| **Editor panes** | |
| `src/components/editor/PaneContainer.vue` | Recursive pane layout |
| `src/components/editor/EditorPane.vue` | Individual pane: TabBar + ReviewBar + viewer component routing |
| `src/components/editor/TabBar.vue` | Pane tab bar with drag reorder, right sidebar toggle |
| `src/components/editor/EmptyPane.vue` | No-file state: Crimson Text wordmark + shortcut buttons + fallback [▦] toggle |
| `src/components/editor/SplitHandle.vue` | Split pane divider |
| `src/components/editor/TextEditor.vue` | CodeMirror instance (all text files) |
| `src/components/editor/ReviewBar.vue` | Pending edits banner (text files) |
| **Right panel** | |
| `src/components/panel/RightPanel.vue` | Right sidebar: AI-only (wraps AISidebar) |
| `src/components/panel/AISidebar.vue` | AI sidebar view state machine (overview / conversation / workflow) |
| `src/components/panel/SidebarOverview.vue` | Overview: close toggle + centered ACTIVE/WORKFLOWS/PROMPTS/HISTORY tabs, ChatInput |
| `src/components/panel/SidebarConversation.vue` | Chat drill-in: back bar + ChatSession |
| `src/components/panel/SidebarWorkflow.vue` | Workflow drill-in: back bar + start/execution |
| `src/components/panel/SidebarBackBar.vue` | Navigation header: "← Back (N working)" + actions |
| `src/components/layout/BottomPanel.vue` | Bottom panel: multi-tab terminals, language REPLs, chevron collapse pill |
| `src/components/layout/Terminal.vue` | Terminal instance (xterm.js) |
| **Modals** | |
| `src/components/VersionHistory.vue` | Git history modal |
| `src/components/settings/Settings.vue` | Settings modal shell (7 section components) |
| `src/components/SetupWizard.vue` | First-run wizard (AI provider setup + theme picker) |

## Context Bar

Renders only when left sidebar is closed (`v-if="!workspace.leftSidebarOpen"`). Height: h-7 (28px). Background: `bg-surface-secondary`, border-bottom.

Layout: `[OS 78px] [≡ expand] [project ▾] [⚙] ── drag ── [🔍] [▦ when R closed]`

- All icon buttons: `w-7 h-7`, Tabler icons at `:size="16" :stroke-width="1.5"`
- Project button: `ui-text-sm font-medium`, truncated, `IconChevronDown` size 10
- Drag region: `flex-1 h-full data-tauri-drag-region`
- Right sidebar toggle: only when `!workspace.rightSidebarOpen`
- macOS 78px spacer also has `data-tauri-drag-region`

Icons used: `IconLayoutSidebar`, `IconChevronDown`, `IconSettings`, `IconSearch`, `IconLayoutSidebarRight`

## Left Sidebar (`LeftSidebar.vue`)

Single-row header + two collapsible panels + git sync footer. Only rendered when open (v-if in App.vue).

### Header Row (h-8, 32px)

Layout: `[OS 78px on Mac] [≡ collapse] [project ▾] [⚙] ── drag ──`

Same icon order, same icons, same styling as the context bar. When sidebar toggles, the icon group appears identical — just in a different container.

- `data-tauri-drag-region` on the row and the flex-1 spacer
- On macOS: `pl-[78px]` reserves space for traffic lights
- On other platforms: `pl-1.5`

### Collapsible Panels

Two panels share a flex container (`flex-1 flex-col min-h-0`):
- **Explorer** (FileTree): `flex: 1 1 0` when expanded, `flex: 0 0 auto` when collapsed
- **References** (ReferenceList): fixed height when both expanded (`flex: 0 0 ${refHeight}px`), fills when alone (`flex: 1 1 0`)
- Resize handle between them (only when both expanded)
- Collapse states persisted in localStorage (`explorerCollapsed`, `refsCollapsed`)

### Git Sync Footer

Pinned at bottom, 22px height. Shows sync status icon + label (Synced/Saving.../Sync error/Conflict). Only visible when `workspace.githubUser` is set.

## Main Panel

The center column. Contains:
1. **3px macOS shim** — `bg-surface-secondary`, `data-tauri-drag-region`. Provides breathing room between traffic lights and TabBar. Mac only.
2. **PaneContainer** — recursive pane tree (flex-1)
3. **Terminal micro-bar** OR **BottomPanel** (mutually exclusive via v-if)

### Terminal Micro-Bar

Visible when `!workspace.bottomPanelOpen`. Height: h-5 (20px). Click anywhere to open terminal.

Layout: `[>_ icon] [Terminal text] ── spacer ── [▲ chevron]`

- `border-t border-line` separates from editor
- `text-content-muted hover:text-content-secondary`
- Up-chevron: `IconChevronUp` (Tabler, size 14)
- Keyboard shortcut: `Ctrl+\`` (added in App.vue handleKeydown)

### BottomPanel Collapse

When terminal IS open, the BottomPanel tab bar has a matching down-chevron pill (`IconChevronDown`, size 12, `bg-surface-tertiary` container, 20×14px) at the right end to collapse.

## TabBar (`TabBar.vue`)

Per-pane tab navigation. Height: h-[29px]. Combined with the 3px Mac shim = 32px total (aligns with sidebar h-8).

Features:
- `data-tauri-drag-region` on root and tabs container (empty space is window-draggable)
- Draggable tab reorder (within pane + cross-pane)
- File-type action buttons (Run, Export, Compile — contextual)
- Right sidebar toggle: `v-if="!workspace.rightSidebarOpen && workspace.leftSidebarOpen"` (hidden when context bar provides it)
- Pane actions: split vertical, split horizontal, close pane

### Right Sidebar Toggle Logic

| State | Context bar has [▦] | TabBar has [▦] | EmptyPane has [▦] |
|---|---|---|---|
| L open, R open | — | — | — |
| L open, R closed | — | ✓ | — |
| L closed, R open | — | — | — |
| L closed, R closed | ✓ | — | ✓ (no-tab fallback) |

## Right Sidebar (`RightPanel.vue` → `AISidebar.vue`)

Full window height (top-level flex sibling). Uses `v-show` to preserve state when hidden.

### Navigation Row (h-8, `SidebarOverview.vue`)

Layout: `[▦ close] [── centered: ACTIVE | WORKFLOWS | PROMPTS | HISTORY ──] [drag w-8]`

- Close toggle at LEFT (inner edge, near resize handle) — mirrors left sidebar collapse position
- Tabs centered via `flex-1 flex justify-center gap-0.5`
- Active tab: `bg-surface text-content`, inactive: `bg-transparent text-content-muted`
- `w-8` drag region at right end (`data-tauri-drag-region`)
- No billing/cost display in nav row

### Sidebar Content

All tab content gets `max-w-[80ch] mx-auto w-full` for readable line lengths at wide widths. ChatInput pinned at bottom in ACTIVE mode.

## macOS Traffic Lights

### Configuration

`src-tauri/tauri.macos.conf.json`:
```json
{
  "titleBarStyle": "Overlay",
  "hiddenTitle": true,
  "trafficLightPosition": { "x": 14, "y": 12 }
}
```

### Placeholder Dots

When the window loses focus, macOS hides the native traffic lights (standard overlay titlebar behavior). Custom placeholder dots render at the exact same position:

- Three 12px circles at fixed positions matching the Tauri config
- `bg-content-muted/20` (very subtle gray)
- `pointer-events: none`, `z-50`
- Shown when `isMac && !windowFocused` (tracked via window focus/blur events)

### Reserved Space

Both the context bar and sidebar header reserve 78px of left padding on macOS (`w-[78px]` spacer or `pl-[78px]`). Traffic lights extend to approximately x=66 (three 12px dots starting at x=14, spaced 20px center-to-center). The 78px provides 12px of margin after the last dot.

## Empty Pane (`EmptyPane.vue`)

Shown when a pane has no open tabs (TabBar is hidden via v-if). Provides:
- Crimson Text serif wordmark "Shoulders" (32px, muted)
- Clickable keyboard shortcut buttons (⌘P open file, ⌘T new tab, ⌘N new file, ⌘J split pane)
- Absolute top-right [▦] button when right sidebar is closed (fallback toggle since no TabBar is visible)

Background: `bg-surface-secondary` (matches sidebar bg, distinguishing from the editor's `bg-surface`).

## What Persists Across Restarts

Two storage mechanisms: **localStorage** for global UI preferences, **`.shoulders/` files** for per-workspace state.

### Persisted (survives restart)

| State | Storage | Key / Path |
|---|---|---|
| Pane tree (splits, tabs, active tab per pane) | `.shoulders/editor-state.json` | See [editor-system.md](editor-system.md#editor-state-persistence) |
| Active pane ID | `.shoulders/editor-state.json` | — |
| Left sidebar open/closed | localStorage | `leftSidebarOpen` |
| Right sidebar open/closed | localStorage | `rightSidebarOpen` |
| Left sidebar width | localStorage | `leftSidebarWidth` |
| Right sidebar width | localStorage | `rightSidebarWidth` |
| Bottom panel open/closed | localStorage | `bottomPanelOpen` |
| Bottom panel height | localStorage | `bottomPanelHeight` |
| Explorer/Refs collapse states | localStorage | `explorerCollapsed`, `refsCollapsed` |
| Theme | localStorage | `theme` |
| Font sizes (editor + UI) | localStorage | `editorFontSize`, `uiFontSize` |
| Soft wrap, spell check, wrap column | localStorage | `softWrap`, `spellcheck`, `wrapColumn` |
| Prose font (for .md files) | localStorage | `proseFont` |
| Ghost/live preview enabled | localStorage | `ghostEnabled`, `livePreviewEnabled` |
| Last model selections | localStorage | `lastModelId`, `ghostModelId` |
| Recent files (per workspace) | localStorage | `recentFiles:{workspacePath}` |
| Chat sessions | `.shoulders/chats/{id}.json` | Full message history |
| Document comments | `.shoulders/comments.json` | All comments + replies |
| Last workspace | localStorage | `lastWorkspace` |

### Not Persisted (session-only)

| State | Reason |
|---|---|
| Terminal processes | Cannot survive process exit |
| Editor view instances (CodeMirror, SuperDoc) | Recreated when components mount |
| Cursor positions | Marginal value for the complexity |
| Dirty files set | Transient; auto-save handles it |
| PDF viewer zoom/page | Session-only convenience state |

### Coordination: Where Layout State Lives

- **`workspace` store** — sidebar open/closed, sidebar widths, bottom panel state. Reads from localStorage on init.
- **`editor` store** — pane tree, active pane, recent files. Reads from `.shoulders/editor-state.json` on workspace open.
- **`aiSidebar` store** — right sidebar view state machine (overview/conversation/workflow), active session tracking.
- **`App.vue`** — orchestrates startup/shutdown, owns context bar state, keyboard shortcuts, workspace switcher, macOS dot visibility.
- **`LeftSidebar.vue`** — explorer/refs collapse states, panel heights. Reads from localStorage on mount.
- **`BottomPanel.vue`** — lazy-initialized on first open. Terminal processes preserved via `v-show`.

## Sidebar Resizing

### Left Sidebar
- `v-if` controlled (fully removed from DOM when closed)
- Width: `workspace.leftSidebarWidth` (default 240px, min 160px, max 500px)
- `ResizeHandle` emits `resize` events with `{x}` position
- `data-sidebar="left"` attribute for Cmd+F focus detection
- Double-click resize handle: toggles sidebar closed

### Right Panel (`RightPanel.vue`)
- `v-show` controlled (kept in DOM to preserve component state)
- Width: `workspace.rightSidebarWidth` (default 360px, min 200px, max 80% of window)
- Double-click resize handle: snaps to 50% window width (or back to previous width)
- `rightSidebarPreSnapWidth` remembers the width before snap for toggling back

### Bottom Panel (`BottomPanel.vue`)
- Sits below the PaneContainer in the main panel column
- Height: `workspace.bottomPanelHeight` (default varies, min 100px, max 600px)
- `v-if` + `v-show` controlled: `hasEverOpened` gates the initial mount (lazy), `workspace.bottomPanelOpen` toggles visibility
- **Multi-tab terminals**: drag-reorder, rename (double-click), close, language REPL support (R/Python/Julia)
- Terminal processes preserved via `v-show` (all terminals stay mounted, only active one visible)
- Toggle: terminal micro-bar click or `Ctrl+\``

## ResizeHandle Component

Generic draggable divider. Props: `direction` ('vertical' or 'horizontal'), `transparent` (boolean).

Default mode: 1px wide/tall line (`rgb(var(--border))`), accent on hover/drag, 7px hit area via ::before.
Transparent mode: 8px wide/tall, invisible until hover (2px accent line at 30% opacity).

## Search Dialog (`SearchDialog.vue`)

Command palette triggered by Cmd+P. Teleported to body, auto-focused.

### Three Search Modes
1. **Title matching** (instant): Fuzzy search across `files.flatFiles`
2. **Content matching** (debounced 200ms): Calls `invoke('search_file_contents')`
3. **Reference matching**: Searches reference library

## Project Switcher (`WorkspaceSwitcher.vue`)

Teleported dropdown, positioned below trigger button via `getBoundingClientRect()`. Triggered from:
- Context bar project button (when sidebar closed)
- Sidebar header project button (when sidebar open)

Both dispatch via `app:open-switcher` event or direct `ref` binding.

Features: filter input, recent projects list (up to 10), actions (Open Folder, Clone, Settings).

## Keyboard Shortcuts (Layout-Related)

| Shortcut | Action |
|---|---|
| `Cmd+B` | Toggle left sidebar (except in .md/.docx where it's bold) |
| `Cmd+J` | Open AI sidebar + focus chat |
| `Cmd+P` | Open search dialog |
| `Cmd+,` | Toggle settings |
| `Cmd+T` | New tab |
| `Cmd+N` | New file (opens sidebar if closed) |
| `Cmd+W` | Close tab or empty pane |
| `Ctrl+\`` | Toggle terminal |
| `Cmd+=/−/0` | Zoom in/out/reset |
| `Alt+Z` | Toggle soft wrap |

## Launcher (`Launcher.vue`)

Shown when `workspace.isOpen` is false. Replaces the entire content area — no sidebars, no chrome.

- **Hero**: "S" logo + "Shoulders" title + tagline
- **Actions**: "Open Folder" (primary) + "Clone Repository" (secondary, expands inline URL input)
- **Recent workspaces**: up to 10 entries with folder name + shortened path

## Chat System (Right Sidebar)

Chat sessions live in the right sidebar with overview/drill-in navigation.

- **Overview** (default): Active chats, available workflows, prompts library, history. ChatInput at bottom.
- **Conversation** (drill-in): Full ChatSession with back bar.
- **Workflow** (drill-in): WorkflowStartScreen or WorkflowExecution.
- **`Cmd+J`**: Opens right sidebar, focuses ChatInput.
- **Store**: `aiSidebar.js` owns view state machine. `chat.js` manages session data.

## File Tree Header

Section header in the Explorer panel. Contains:
- "Files" label (or collapsible section title)
- **+ New** button — dropdown with typed file creation options
- **Collapse All** — clears all expanded directories
- **Search** icon — opens inline filter (Cmd+F when tree focused)
