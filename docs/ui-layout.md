# UI Layout & Components

## Overall Layout

Full-width Header (36px) and Footer (h-6) permanently frame the content area. The middle row contains left sidebar, main editor, and right AI sidebar. No conditional context bar — Header is always visible.

### Layout States

Two booleans define four states: left sidebar (open/closed) × right sidebar (open/closed).

**State 1: Left OPEN, Right OPEN**
```
┌─────────────────────────────────────────────────────────────┐
│ [≡][P▾][⚙] ── drag ──  [🔍 search]  ── drag ── [▦]        │  Header (36px)
├──────────┬──┬─────────────────────────┬──┬──────────────────┤
│          │R │  TabBar (h-[29px])      │R │                  │
│ Explorer │e │                         │e │   AI Chat        │
│          │s │    PaneContainer        │s │   Sidebar        │
│ Refs     │i │    (editor panes)       │i │                  │
│          │z │                         │z │                  │
│          │e │                         │e │                  │
│          │  │  BottomPanel            │  │                  │
├──────────┴──┴─────────────────────────┴──┴──────────────────┤
│ [>_] git sync │ Zotero │ Word │ edits │ [−]80%[+] │ wc │ $ │  Footer (h-6)
└─────────────────────────────────────────────────────────────┘
```

**State 3: Left CLOSED**
```
┌─────────────────────────────────────────────────────────────┐
│ [≡][P▾][⚙] ── drag ──  [🔍 search]  ── drag ── [▦]        │  Header (36px)
├─────────────────────────────────────────┬──┬────────────────┤
│  TabBar                                 │R │                │
│                                         │e │   AI Chat      │
│    PaneContainer                        │s │   Sidebar      │
│                                         │i │                │
│  BottomPanel                            │z │                │
│                                         │e │                │
├─────────────────────────────────────────┴──┴────────────────┤
│ [>_] git sync │ Zotero │ Word │ edits │ [−]80%[+] │ wc │ $ │  Footer (h-6)
└─────────────────────────────────────────────────────────────┘
```

Header is always visible regardless of sidebar state. Toggle buttons in the Header control both sidebars.

### Chrome Bar Height Model

Three tiers of chrome bars:

| Element | Class | Total (px) |
|---------|-------|-----------|
| **Header** | `h-[36px] border-b border-line bg-surface-secondary` | 40 |
| TabBar | `h-7 border-b border-line bg-surface-secondary` | 29 |
| ReviewBar | `h-7 border-b border-line bg-warning/[0.08]` | 29 |
| Right sidebar nav (SidebarHome) | `h-7 border-b border-line` | 29 |
| Right sidebar back bar (SidebarBackBar) | `h-7 border-b border-line` | 29 |
| **Footer** | `h-6 border-t border-line bg-surface-secondary` | 24 |

The Header sits above all content at 36px. Within the content row, tab bars and sidebar nav bars share `h-7` (29px). The Footer sits below all content at h-6 (24px).

### Structural Architecture (App.vue)

```
<div class="flex flex-col h-full">              ← top-level vertical flex (full window)
  │
  ├─ HEADER (h-[36px], border-b, bg-surface-secondary)
  │   ├─ Left: [macOS 78px spacer] [≡ sidebar toggle] [project ▾] [⚙ settings] [drag spacer]
  │   ├─ Center: [🔍 search trigger button] (320px, styled as input)
  │   └─ Right: [drag spacer] [▦ AI sidebar toggle] [w-2 spacer]
  │
  ├─ CONTENT ROW (flex flex-1 overflow-hidden)  ← horizontal flex
  │   ├─ Left sidebar (v-if sidebar OPEN)
  │   │   ├─ FileTree (topmost — no header row)
  │   │   └─ References
  │   ├─ ResizeHandle (vertical)
  │   ├─ Main panel (flex-1 flex-col)
  │   │   ├─ PaneContainer
  │   │   │   └─ EditorPane (per pane)
  │   │   │       ├─ TabBar                     ← h-7 + border-b = 29px
  │   │   │       ├─ ReviewBar (optional)       ← h-7 + border-b = 29px
  │   │   │       └─ Editor content (flex-1)
  │   │   ├─ ResizeHandle (horizontal)
  │   │   └─ BottomPanel
  │   ├─ ResizeHandle (vertical, v-if rightSidebarOpen)
  │   └─ RIGHT SIDEBAR (shrink-0)              ← inside content row
  │       └─ AISidebar
  │           ├─ SidebarHome (nav h-7 + border) ← 29px
  │           ├─ SidebarConversation (BackBar h-7)
  │           └─ SidebarWorkflow (BackBar h-7)
  │
  └─ FOOTER (h-6, border-t, bg-surface-secondary)
      ├─ Left: [>_ terminal toggle] [git sync] [Zotero] [Word Bridge] [pending changes]
      ├─ Center: [−] zoom% [+] (with preset popover)
      └─ Right: [word count] [char count] [billing display]
```

Key design decisions:
- App.vue is a **vertical flex column**: Header → content row → Footer
- Right sidebar is **inside the content row** (not a top-level flex sibling)
- Left sidebar uses **v-if** (removed from DOM when closed — no rail, no 52px column)
- Right sidebar uses **v-show** (stays in DOM to preserve Chat/terminal state)
- Header is always visible — no conditional context bar
- Header.vue is a Vue 3 fragment (two roots: `<header>` + `<WorkspaceSwitcher>`)
- All chrome button transitions use `duration-75` (was default 150ms)

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
| `src/App.vue` | Root layout, keyboard shortcuts, workspace init, launcher/editor toggle, macOS dots |
| `src/components/Launcher.vue` | Empty state: logo, Open Folder, Clone Repository, recent workspaces |
| `src/components/layout/SearchDialog.vue` | Command palette (Cmd+P): file/content/reference/chat search |
| `src/components/layout/WorkspaceSwitcher.vue` | Project switcher dropdown (from Header project button) |
| `src/components/layout/ResizeHandle.vue` | Sidebar resize dividers (1px border + 7px hit area) |
| `src/components/layout/SnapshotDialog.vue` | Named snapshot input dialog (Cmd+S → "Name this version") |
| `src/components/layout/ToastContainer.vue` | Fixed bottom-right toast stack |
| `src/components/layout/Header.vue` | Full-width header: sidebar toggles, project switcher, settings, centered search trigger, AI sidebar toggle, macOS dots, WorkspaceSwitcher |
| `src/components/layout/Footer.vue` | Full-width footer: terminal toggle, git sync, Zotero, Word Bridge, pending changes, zoom controls, word/char count, billing, SyncPopover, conflict dialog |
| **Shared chrome** | |
| `src/components/shared/ChromeIconButton.vue` | Standard icon button (w-7 h-7, or size="sm" for w-6 h-6). All icon buttons in chrome bars use this. |
| `src/components/shared/ProjectSwitcherButton.vue` | Project name + chevron dropdown trigger. Used in context bar and sidebar header. |
| `src/components/shared/SidebarToggleButton.vue` | Sidebar open/close button (side="left" or "right"). Wraps ChromeIconButton + Tabler icon. |
| **Left sidebar** | |
| `src/components/sidebar/LeftSidebar.vue` | Two collapsible panels (Explorer, References) — no header row, no footer |
| `src/components/sidebar/FileTree.vue` | Explorer panel content |
| `src/components/sidebar/FileTreeItem.vue` | Tree nodes |
| `src/components/sidebar/ContextMenu.vue` | Right-click menu |
| **Editor panes** | |
| `src/components/editor/PaneContainer.vue` | Recursive pane layout |
| `src/components/editor/EditorPane.vue` | Individual pane: TabBar + ReviewBar + viewer component routing |
| `src/components/editor/TabBar.vue` | Pane tab bar with drag reorder |
| `src/components/editor/EmptyPane.vue` | No-file state: Crimson Text wordmark + shortcut buttons |
| `src/components/editor/SplitHandle.vue` | Split pane divider |
| `src/components/editor/TextEditor.vue` | CodeMirror instance (all text files) |
| `src/components/editor/ReviewBar.vue` | Pending edits banner (text files) |
| **Right panel** | |
| `src/components/panel/RightPanel.vue` | Right sidebar: AI-only (wraps AISidebar) |
| `src/components/panel/AISidebar.vue` | AI sidebar view state machine (overview / conversation / workflow) |
| `src/components/panel/SidebarOverview.vue` | **DEPRECATED** — replaced by SidebarHome + SidebarNew |
| `src/components/panel/SidebarConversation.vue` | Chat drill-in: back bar + ChatSession |
| `src/components/panel/SidebarWorkflow.vue` | Workflow drill-in: back bar + start/execution |
| `src/components/panel/SidebarBackBar.vue` | Navigation header: "← Back (N working)" + action slot (no close toggle) |
| `src/components/layout/BottomPanel.vue` | Bottom panel: multi-tab terminals, language REPLs, chevron collapse pill |
| `src/components/layout/Terminal.vue` | Terminal instance (xterm.js) |
| **Modals** | |
| `src/components/VersionHistory.vue` | Git history modal |
| `src/components/settings/Settings.vue` | Settings modal shell (7 section components) |
| `src/components/SetupWizard.vue` | First-run wizard (AI provider setup + theme picker) |

## Header (`Header.vue`)

Always visible. Height: 36px (`h-[36px]`). Background: `bg-surface-secondary`, `border-b border-line`.

Layout (CSS grid, 3 columns):
- **Left**: `[macOS 78px spacer] [≡ sidebar toggle] [project ▾ switcher] [⚙ settings] [drag spacer]`
- **Center**: search button (styled as input, 320px max-width, opens `SearchDialog` on click)
- **Right**: `[drag spacer] [▦ AI sidebar toggle] [w-2 spacer]`

- Header.vue is a Vue 3 fragment (two root elements: `<header>` + `<WorkspaceSwitcher>`)
- Uses shared components: `SidebarToggleButton`, `ProjectSwitcherButton`, `ChromeIconButton`
- All icon buttons: `w-7 h-7` via `ChromeIconButton`, Tabler icons at `:size="16" :stroke-width="1.5"`
- All button transitions: `duration-75`
- Project button: `ui-text-lg font-medium`, truncated, via `ProjectSwitcherButton`
- Drag regions: left and right spacers have `data-tauri-drag-region`
- macOS 78px spacer also has `data-tauri-drag-region`
- macOS placeholder dots: fixed-positioned within the header, shown when window unfocused

## Left Sidebar (`LeftSidebar.vue`)

Two collapsible panels, no header row, no footer. FileTree is the topmost element. Only rendered when open (v-if in App.vue). The sidebar toggle, project switcher, and settings button are now in the Header. Git sync status is now in the Footer.

### Collapsible Panels

Two panels share a flex container (`flex-1 flex-col min-h-0`):
- **Explorer** (FileTree): `flex: 1 1 0` when expanded, `flex: 0 0 auto` when collapsed
- **References** (ReferenceList): fixed height when both expanded (`flex: 0 0 ${refHeight}px`), fills when alone (`flex: 1 1 0`)
- Resize handle between them (only when both expanded)
- Collapse states persisted in localStorage (`explorerCollapsed`, `refsCollapsed`)

## Main Panel

The center column. Contains:
1. **PaneContainer** — recursive pane tree (flex-1)
2. **BottomPanel** (terminal, toggled via Footer terminal button or `Ctrl+\``)

### BottomPanel Collapse

When terminal IS open, the BottomPanel tab bar has a matching down-chevron pill (`IconChevronDown`, size 12, `bg-surface-tertiary` container, 20x14px) at the right end to collapse. The terminal micro-bar has been removed — the Footer terminal toggle replaces it.

## TabBar (`TabBar.vue`)

Per-pane tab navigation. Height: h-7 (28px + 1px border = 29px total). Aligns with all other chrome bars.

Features:
- `data-tauri-drag-region` on root and tabs container (empty space is window-draggable)
- Draggable tab reorder (within pane + cross-pane)
- File-type action buttons (Run, Export, Compile — contextual)
- Pane actions: split vertical, split horizontal, close pane
- No right sidebar toggle — that is now exclusively in the Header

## Right Sidebar (`RightPanel.vue` → `AISidebar.vue`)

Inside the content row (not a top-level flex sibling). Uses `v-show` to preserve state when hidden. No close toggles — the Header [▦] button controls visibility.

### Sidebar Content

All tab content gets `max-w-[80ch] mx-auto w-full` for readable line lengths at wide widths. ChatInput pinned at bottom in ACTIVE mode.

## macOS Traffic Lights

### Configuration

`src-tauri/tauri.macos.conf.json`:
```json
{
  "titleBarStyle": "Overlay",
  "hiddenTitle": true,
  "trafficLightPosition": { "x": 14, "y": 17 }
}
```

### Placeholder Dots

When the window loses focus, macOS hides the native traffic lights (standard overlay titlebar behavior). Custom placeholder dots render at the exact same position (fixed-positioned in Header.vue):

- Three 12px circles at fixed positions: left 15/34/54, top 11
- `bg-content-muted/20` (very subtle gray)
- `pointer-events: none`, `z-50`
- Shown when `isMac && !windowFocused` (tracked via window focus/blur events)

### Reserved Space

The Header reserves 78px of left padding on macOS (`w-[78px]` spacer). Traffic lights extend to approximately x=66 (three 12px dots starting at x=14, spaced 20px center-to-center). The 78px provides 12px of margin after the last dot.

## Empty Pane (`EmptyPane.vue`)

Shown when a pane has no open tabs (TabBar is hidden via v-if). Provides:
- Crimson Text serif wordmark "Shoulders" (32px, muted)
- Clickable keyboard shortcut buttons (open file, new tab, new file, split pane)

Background: `bg-surface-secondary` (matches sidebar bg, distinguishing from the editor's `bg-surface`). No sidebar toggle — that is now exclusively in the Header.

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
- **`App.vue`** — orchestrates startup/shutdown, keyboard shortcuts, macOS dot visibility.
- **`LeftSidebar.vue`** — explorer/refs collapse states, panel heights. Reads from localStorage on mount.
- **`BottomPanel.vue`** — lazy-initialized on first open. Terminal processes preserved via `v-show`.

## Sidebar Resizing

### Left Sidebar
- `v-if` controlled (fully removed from DOM when closed)
- Width: `workspace.leftSidebarWidth` (default 236px, min 160px, max 500px)
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
- Toggle: Footer terminal button or `Ctrl+\``

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

Teleported dropdown, positioned below trigger button via `getBoundingClientRect()`. Triggered from the Header's `ProjectSwitcherButton` (always visible). The trigger element is passed as `projectBtnRef.$el` for correct positioning.

Features: filter input, recent projects list (up to 10), actions (Open Folder, Clone, Settings).

## Keyboard Shortcuts (Layout-Related)

| Shortcut | Action |
|---|---|
| `Cmd+B` | Toggle left sidebar (except in .md/.docx where it's bold) |
| `Cmd+J` | Open AI sidebar; Home → New + focus input; Conversation → focus input |
| `Cmd+N` | Open AI sidebar → New screen → focus chat input |
| `Cmd+P` | Open search dialog |
| `Cmd+,` | Toggle settings |
| `Cmd+T` | New tab |
| `Cmd+W` | Close tab or empty pane |
| `Ctrl+\`` | Toggle terminal |
| `Cmd+=/−/0` | Zoom in/out/reset |
| `Alt+Z` | Toggle soft wrap |

## Launcher (`Launcher.vue`)

Shown when `workspace.isOpen` is false. Replaces the entire content area — no sidebars, no chrome.

- **Hero**: "S" logo + "Shoulders" title + tagline
- **Actions**: "Open Folder" (primary) + "Clone Repository" (secondary, expands inline URL input)
- **Recent workspaces**: up to 10 entries with folder name + shortened path

## Chat / AI Sidebar System (Right Sidebar)

The right sidebar is a unified work surface with five screens and no tabs. Navigation is always drill-in / back-out. Managed by `aiSidebar.js`: `home`, `new`, `conversation`, `workflow`, `terminal`.

### Screen Map

```
Home ──── [+ New] ────> New (launcher)
  |                       ├─ type + send ──> Conversation drill-in
  |                       ├─ Workflows ────> Workflow picker > Config > Execution
  |                       ├─ Claude Code ──> Terminal drill-in (row appears on Home)
  |                       └─ Codex / etc ──> Terminal drill-in
  |
  ├─ click session row ──> Conversation drill-in
  ├─ click workflow row ──> Workflow execution drill-in
  └─ click agent row ────> Terminal drill-in

All drill-ins: [← Back] returns to previous screen (returnTo navigation)
Conversations always return to Home. Workflows/terminals return to where launched (Home or New).
```

### Component Nesting

```
RightPanel.vue                              ← thin wrapper (bg-secondary, h-full)
└─ AISidebar.vue                            ← view state router (home | new | conversation | workflow | terminal)
   │
   ├─ [v-show] SidebarHome.vue             ← unified session list (active + older)
   │   ├─ Header (h-7, border-b)           ← "Shoulders AI" + [+ New] + [x] close
   │   └─ Session list (flex-1, overflow-y-auto)
   │       ├─ ACTIVE section header         ← always visible, shows count
   │       ├─ SessionRow[] (active, bg-surface/30) ← chevron + title + preview + archive
   │       │   └─ [empty] CTA row           ← "› New conversation" (accent, navigates to New)
   │       ├─ RECENT section header         ← muted label
   │       ├─ SessionRow[] (compact)        ← smaller padding, no preview, muted
   │       ├─ Load more · Search            ← bottom of list
   │       └─ [fully empty] Suggestion chips ← context-aware by active file type
   │
   ├─ [v-if] SidebarNew.vue                ← creation / launcher screen
   │   ├─ SidebarBackBar (h-7, border-b)   ← [← Back] + [x] close
   │   ├─ ChatInput (hero, pt-8 pb-6)      ← creates new session on send, 3-row min height
   │   ├─ WORKFLOWS section                 ← label + "Browse workflows" (expands WorkflowPicker)
   │   ├─ AGENTS section                    ← label + installed agents only
   │   │   └─ "More agents..."             ← expander for uninstalled (with Install links)
   │   └─ [⚙ Settings]
   │
   ├─ [v-show] SidebarConversation.vue      ← chat drill-in (stays alive)
   │   ├─ SidebarBackBar (h-7, border-b)   ← [← Back (N working)] + [Archive] + [x] close
   │   └─ ChatSession.vue (flex-1)          ← full conversation view
   │       ├─ Messages area (flex-1, overflow-y-auto)
   │       │   ├─ [empty] Suggestion chips
   │       │   └─ ChatMessage[]
   │       ├─ Scroll-to-bottom button
   │       └─ ChatInput (pinned bottom)     ← continues existing session on send
   │
   ├─ [v-if] SidebarWorkflow.vue            ← workflow drill-in (mounts fresh)
   │   ├─ SidebarBackBar (h-7, border-b)   ← [← Back] + workflow name
   │   └─ WorkflowExecution | WorkflowStartScreen
   │
   └─ [v-if] SidebarTerminal.vue            ← external agent terminal
       ├─ SidebarBackBar (h-7, border-b)   ← [← Back] + agent badge + name
       └─ Terminal.vue (xterm.js)           ← agent CLI process
```

### Key Architecture Decisions

- **Home uses `v-show`** — stays mounted during drill-in (preserves scroll position, search state)
- **New uses `v-if`** — mounts fresh each time (stateless launcher)
- **Conversation uses `v-show`** — Chat instance stays alive when user goes back (AI keeps streaming)
- **Workflow uses `v-if`** — mounts fresh each time (no background state to preserve)
- **Terminal uses `v-if`** — fresh mount per agent session
- **ChatInput appears in two contexts**: on New screen it creates a *new* session; inside ChatSession it continues the *active* session. Same component, different store wiring.
- **All scrollable content** constrained to `max-w-[80ch] mx-auto` for readable line lengths at wide sidebar widths
- **Model picker and @-mention popovers** use `<Teleport to="body">` to escape the right panel's `overflow-hidden`
- **External agents** detected via `agentRegistry.js` (`which` check, cached 60s). Tier 1: Claude Code, Codex, Gemini CLI. Tier 2: Crush, Aider, Goose.

### Store: `aiSidebar.js`

Owns the sidebar's view state machine and the unified session list.

| State | Type | Purpose |
|---|---|---|
| `viewState` | `'home' \| 'new' \| 'conversation' \| 'workflow' \| 'terminal'` | Current screen |
| `returnTo` | `string` | Where `goBack()` navigates (set by each drill function) |
| `activeSessionId` | `string \| null` | Chat session drilled into |
| `activeWorkflowId` | `string \| null` | Workflow being viewed |
| `activeWorkflowRunId` | `string \| null` | Specific run being viewed |
| `activeTerminalSessionId` | `string \| null` | Agent terminal session |
| `homeSearchQuery` | `string` | Inline search on Home |
| `homeLoadedCount` | `number` | How many older items to show (lazy load) |

Key computed: `activeItems` = in-memory chats + workflow runs sorted by recency. `olderItems` = disk sessions not in memory, filtered by search. `visibleOlderItems` = olderItems limited by homeLoadedCount. `backButtonLabel` shows count of *other* sessions still working. `isHomeEmpty` triggers empty state (suggestions or "Start a conversation").

## File Tree Header

Section header in the Explorer panel. Contains:
- "Files" label (or collapsible section title)
- **+ New** button — dropdown with typed file creation options
- **Collapse All** — clears all expanded directories
- **Search** icon — opens inline filter (Cmd+F when tree focused)
