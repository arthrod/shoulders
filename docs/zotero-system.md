# Zotero Sync

Bidirectional sync with Zotero reference libraries. Pulls references into the local library, pushes new Shoulders-created references back to a chosen Zotero collection, and propagates deletes for items Shoulders pushed (mistake cleanup). Supports personal libraries and shared group libraries.

## Relevant Files

| File | Role |
|---|---|
| `src/services/zoteroSync.js` | API client, sync engine, CSL-to-Zotero mapper, keychain helpers, state singleton |
| `src/components/settings/SettingsZotero.vue` | Settings UI: connect/disconnect, collection picker, push target, sync controls |
| `src/components/settings/Settings.vue` | Registers Zotero section in nav |
| `src/stores/references.js` | Push-back flag in `addReference`, delete propagation in `removeReference` |
| `src/stores/workspace.js` | Zotero sync state bridge (`zoteroSyncStatus`, `zoteroSyncError`, `zoteroLastSyncTime`) |
| `src/components/layout/Footer.vue` | Zotero sync indicator (book icon with status colouring) |
| `src/App.vue` | Background `initZotero()` call on workspace open |
| `src-tauri/src/fs_commands.rs` | `proxy_api_call_full` — returns response headers (needed for version tracking) |
| `src-tauri/src/lib.rs` | `zotero-api-key` in keychain allowlist |
| `~/.shoulders/zotero.json` | Persisted config: userId, collections, push target, sync versions |

## Architecture

```
Settings UI (SettingsZotero.vue)
  └─ zoteroSync.js
       ├─ zoteroApi()  ──→  proxy_api_call_full  ──→  api.zotero.org
       ├─ Keychain (zotero-api-key)
       ├─ Config (~/.shoulders/zotero.json)
       └─ references store (merge, push-back, delete)

Footer.vue  ←──  workspace.zoteroSyncStatus  ←──  _applyZoteroSyncState()
App.vue  ──→  initZotero()  (background, 3s delay before auto-sync)
```

All Zotero API calls go through `proxy_api_call_full` in Rust (CORS-free, 60s timeout). This is a separate command from `proxy_api_call` because it returns response **headers** — Zotero's delta sync depends on `Last-Modified-Version`, `Total-Results`, `Backoff`, and `Retry-After` headers.

## Zotero API

Base URL: `https://api.zotero.org`. Auth via `Zotero-API-Key` header. Version `3`.

### Key Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/keys/current` | Validate API key, get userId + username |
| `GET` | `/users/{id}/groups` | List groups with permissions |
| `GET` | `/users/{id}/collections` | Personal library collections |
| `GET` | `/groups/{id}/collections` | Group library collections |
| `GET` | `/users/{id}/items?format=csljson` | Fetch items as CSL-JSON (paginated, max 100) |
| `GET` | `/groups/{id}/items?format=csljson` | Same for group libraries |
| `POST` | `/users/{id}/items` or `/groups/{id}/items` | Create items (Zotero JSON format, NOT CSL-JSON) |
| `DELETE` | `/users/{id}/items?itemKey={key}` | Delete item (requires `If-Unmodified-Since-Version`) |

### Delta Sync

Zotero supports version-based incremental sync:

1. Send `If-Modified-Since-Version: {lastKnownVersion}` header on item fetch
2. Response includes `Last-Modified-Version` header with the new version number
3. If nothing changed, returns `304 Not Modified` with no body
4. Version numbers are stored per-library in `~/.shoulders/zotero.json` → `lastSyncVersions`

This means subsequent syncs only transfer items changed since the last sync — typically 0-10 items instead of the full library.

### Rate Limiting

- `Backoff` header: the client must delay all requests by this many seconds
- `429 Too Many Requests` with `Retry-After` header: per-request retry
- The sync engine respects both, with max 3 retries per page

### Read Format vs. Write Format

**Critical asymmetry**: Zotero returns CSL-JSON for reads (`format=csljson`) but requires its own JSON schema for writes.

| | CSL-JSON (read) | Zotero JSON (write) |
|---|---|---|
| Item type | `article-journal` | `journalArticle` |
| Author | `{ family: "Smith", given: "J" }` | `{ creatorType: "author", lastName: "Smith", firstName: "J" }` |
| Date | `{ "date-parts": [[2024, 3]] }` | `"2024-03"` |
| Container | `container-title` | `publicationTitle` (or `bookTitle`, `proceedingsTitle`) |

The mapper `cslToZoteroJson()` handles this conversion for the write path. It only covers item types Shoulders creates: `article-journal`, `book`, `chapter`, `paper-conference`, `report`, `thesis`, `webpage`, `dataset`.

## Sync Engine

### Sync Cycle (`syncNow()`)

Called on workspace open (auto-sync, 3s delay) and via "Sync Now" button. Order:

1. **Load credentials** — API key from keychain, config from `~/.shoulders/zotero.json`
2. **Determine libraries** — from `selectedCollections` config (or all: personal + every group)
3. **For each library**:
   a. Fetch items with `If-Modified-Since-Version` → only changed items transfer
   b. Paginate (100 items/page, `start` offset, `Total-Results` header)
   c. Tag items with `_zoteroLibrary` (e.g., `"user/12345"`, `"group/67890"`)
   d. Update `lastSyncVersions` with new `Last-Modified-Version`
4. **Merge** into local references store (see Merge Strategy below)
5. **Push-back** pending items to Zotero (see Push-Back below)
6. **Save config** with updated version numbers

### Merge Strategy

Zotero is source of truth for Zotero-sourced references. Three cases:

| Incoming Item | Existing Local Ref | Action |
|---|---|---|
| `_zoteroKey` match found | Has same `_zoteroKey` | **Update**: overwrite bibliographic fields, preserve `_key`, `_addedAt`, `_pdfFile`, `_textFile`, `_tags` |
| No `_zoteroKey` match | DOI or title match (via `findDuplicate`) | **Link**: set `_zoteroKey` on existing ref, don't overwrite content |
| No match at all | — | **Add**: new reference with `_source: 'zotero'`, `_importMethod: 'zotero-sync'` |

### Push-Back

When a user adds a reference in Shoulders (any method: DOI, PDF, AI, BibTeX) and a push target is configured:

1. `addReference()` sets `_shouldersPushPending: true` asynchronously (non-blocking, lazy import)
2. On next `syncNow()`, `pushPendingItems()` finds all refs with `_shouldersPushPending && !_zoteroKey`
3. Each is mapped via `cslToZoteroJson()` and POSTed to the push target
4. On success: `_zoteroKey` stored, `_pushedByShoulders: true`, `_shouldersPushPending` cleared
5. On failure: warning logged, `_shouldersPushPending` stays true for retry on next sync

### Delete Propagation

When `removeReference()` is called on a ref with `_pushedByShoulders && _zoteroKey`:

1. Fire-and-forget `deleteFromZotero(ref)` — non-blocking, does not affect local delete
2. Sends `DELETE /items?itemKey={key}` with `If-Unmodified-Since-Version`
3. `204` = success, `412` = version conflict (item modified in Zotero, acceptable)
4. Failure is logged but not surfaced — local delete always succeeds

**Scope rule**: Only refs with `_pushedByShoulders: true` propagate deletes. Refs that arrived *from* Zotero via sync are local-delete-only — they reappear on the next sync, which is correct (to truly remove them, delete in Zotero).

## Reference Fields Added by Zotero Sync

| Field | Type | Purpose |
|---|---|---|
| `_zoteroKey` | `string` | Zotero item key (e.g., `"AB12CD34"`) — used for dedup and updates |
| `_zoteroLibrary` | `string` | Source library (e.g., `"user/12345"`, `"group/67890"`) |
| `_source` | `string` | `'zotero'` for synced refs, unchanged for manual refs |
| `_shouldersPushPending` | `boolean` | Queued for push-back on next sync |
| `_pushedByShoulders` | `boolean` | Shoulders created and pushed this to Zotero |

These fields are inert if Zotero is disconnected — they don't affect local reference management.

## Config (`~/.shoulders/zotero.json`)

Global config, not per-workspace. Created on first connect.

```json
{
  "userId": "12345",
  "username": "jsmith",
  "selectedCollections": null,
  "pushTarget": {
    "libraryType": "group",
    "libraryId": "67890",
    "collectionKey": "ABCD1234"
  },
  "autoSync": true,
  "lastSyncVersions": {
    "user/12345": 1847,
    "group/67890": 542
  },
  "_groups": [
    { "id": "67890", "name": "Lab Group", "canWrite": true }
  ]
}
```

- `selectedCollections`: `null` = entire library (personal + all groups). Otherwise, array of `{ libraryType, libraryId, collectionKey }`.
- `pushTarget`: where new Shoulders-created refs go. `null` = don't push.
- `lastSyncVersions`: per-library Zotero version numbers for delta sync.
- `_groups`: cached group list (used by sync engine to know which groups exist).

## State & UI

### Sync State Singleton

`zoteroSyncState` (exported from `zoteroSync.js`):

| Field | Values | Purpose |
|---|---|---|
| `status` | `disconnected`, `idle`, `syncing`, `synced`, `error` | Drives footer indicator and settings UI |
| `lastSyncTime` | `Date` or `null` | Shown in settings as relative time |
| `error` | `string` or `null` | Error message |
| `errorType` | `auth`, `network`, `rate-limit`, `generic`, `null` | Guides error handling UI |
| `progress` | `{ phase, current, total }` or `null` | Drives progress bar in settings |

State is bridged to the workspace store via `_applyZoteroSyncState()` — same pattern as GitHub sync.

### Footer Indicator

Book icon in the footer left section, between GitHub sync and Word Bridge. Only visible when Zotero is configured (not `disconnected`).

| Status | Colour | Animation | Label |
|---|---|---|---|
| `idle` / `synced` | `--fg-muted` | None | None |
| `syncing` | `--fg-muted` | Pulse | "Zotero..." |
| `error` | `--error` | None | "Zotero issue" |

### Settings Panel

`SettingsZotero.vue` — registered as "Zotero" section between GitHub and System.

**Disconnected state**: User ID + API Key inputs, "Connect" button. Validates via `GET /keys/current`.

**Connected state**: Username card, sync scope (radio: entire/selected with collection tree), push target dropdown, auto-sync toggle, sync status, progress bar, "Sync Now" button.

## Rust Infrastructure

### `proxy_api_call_full`

New command alongside the existing `proxy_api_call`. Returns `{ status, body, headers }` instead of just the body string. Does NOT error on non-2xx — returns the status code so JS can handle `304`, `412`, `429` as meaningful responses.

```rust
#[derive(Serialize)]
pub struct ApiProxyResponse {
    pub status: u16,
    pub body: String,
    pub headers: HashMap<String, String>,
}
```

60-second timeout (vs 30s for regular `proxy_api_call`). Supports GET, POST, PUT, DELETE, PATCH.

### Host Allowlist

`api.zotero.org` added to `ALLOWED_HOSTS` in `fs_commands.rs`.

### Keychain

`zotero-api-key` added to `ALLOWED_KEYCHAIN_KEYS` in `lib.rs`. API key stored as a plain string (not JSON — unlike GitHub which stores a token object).

## Error Handling

| Error | Detection | Behaviour |
|---|---|---|
| Invalid API key | 403 from any endpoint | Status → `error`, type → `auth`. Toast: "Zotero API key is invalid." |
| Network error | Timeout, DNS, connection refused | Status → `error`, type → `network`. Silent on auto-sync, toast on manual. |
| Rate limit | 429 response | Sleep for `Retry-After` seconds, retry (max 3 per page) |
| Backoff header | `Backoff` response header | Global delay on all requests until backoff expires |
| Push-back failure | POST returns non-200 | Warning logged, `_shouldersPushPending` kept for retry on next sync |
| Delete version conflict | 412 on DELETE | Non-fatal. Item was modified in Zotero since last sync — left alone. |

## Important Notes

1. **Zotero returns CSL-JSON natively for reads.** No mapping needed on the pull path. The mapper (`cslToZoteroJson`) is only used for the write path (push-back).
2. **Config is global, not per-workspace.** `~/.shoulders/zotero.json` is shared across all workspaces — one Zotero connection for the whole app, just like API keys.
3. **The `_zoteroKey` extracted from CSL-JSON `id` field.** Zotero puts a URI in the `id` field (e.g., `http://zotero.org/users/12345/items/AB12CD34`). The sync engine extracts the trailing key.
4. **Push-back is async and non-blocking.** The `_shouldersPushPending` flag is set in a `then()` callback after `addReference` returns. If sync is currently running, the ref gets pushed on the next cycle.
5. **Circular dependency avoided via lazy imports.** `references.js` imports from `zoteroSync.js` using dynamic `import()` to prevent circular module resolution.
6. **Group write permissions.** The Settings UI shows a lock icon on read-only groups and hides them from the push target dropdown. The `canWrite` flag comes from the groups API response.
7. **First sync on a large library (10,000+ refs) takes ~50 seconds.** The progress indicator in Settings shows real-time counts. Subsequent delta syncs are near-instant (typically 0-10 items).
