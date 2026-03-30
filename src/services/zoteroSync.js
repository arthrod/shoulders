// Zotero sync service
// Handles bidirectional sync: pull from Zotero, push new refs back, scoped delete propagation

import { invoke } from '@tauri-apps/api/core'

const ZOTERO_KEYCHAIN_KEY = 'zotero-api-key'
const ZOTERO_API_BASE = 'https://api.zotero.org'

// ── Sync state (read by Footer via workspace store bridge) ──

export const zoteroSyncState = {
  status: 'disconnected', // disconnected | idle | syncing | synced | error
  lastSyncTime: null,
  error: null,
  errorType: null, // auth | network | rate-limit | generic
  progress: null,  // { phase, current, total } during sync
}

// ── Error types ──

class ZoteroAuthError extends Error {
  constructor(msg) { super(msg); this.name = 'ZoteroAuthError' }
}

class ZoteroRateLimitError extends Error {
  constructor(retryAfter) {
    super(`Rate limited, retry after ${retryAfter}s`)
    this.name = 'ZoteroRateLimitError'
    this.retryAfter = retryAfter
  }
}

class ZoteroApiError extends Error {
  constructor(status, body) {
    super(`Zotero API error ${status}: ${body}`)
    this.name = 'ZoteroApiError'
    this.status = status
  }
}

function classifyError(err) {
  if (err instanceof ZoteroAuthError || err.message?.includes('403')) return 'auth'
  if (err instanceof ZoteroRateLimitError) return 'rate-limit'
  if (err.message?.includes('network') || err.message?.includes('resolve') ||
      err.message?.includes('timeout') || err.message?.includes('could not connect')) return 'network'
  return 'generic'
}

// ── Keychain helpers (same pattern as githubSync.js) ──

export async function storeZoteroApiKey(apiKey) {
  try {
    await invoke('keychain_set', { key: ZOTERO_KEYCHAIN_KEY, value: apiKey })
  } catch {
    console.warn('[security] OS keychain unavailable — Zotero API key stored in plaintext localStorage')
    localStorage.setItem('zoteroApiKey', apiKey)
  }
}

export async function loadZoteroApiKey() {
  try {
    const raw = await invoke('keychain_get', { key: ZOTERO_KEYCHAIN_KEY })
    if (raw) return raw
  } catch {}
  try {
    const raw = localStorage.getItem('zoteroApiKey')
    if (raw) {
      await storeZoteroApiKey(raw)
      localStorage.removeItem('zoteroApiKey')
      return raw
    }
  } catch {}
  return null
}

export async function clearZoteroApiKey() {
  try { await invoke('keychain_delete', { key: ZOTERO_KEYCHAIN_KEY }) } catch {}
  try { localStorage.removeItem('zoteroApiKey') } catch {}
}

// ── Config persistence (~/.shoulders/zotero.json) ──

let _globalConfigDir = null

async function getGlobalConfigDir() {
  if (!_globalConfigDir) {
    _globalConfigDir = await invoke('get_global_config_dir')
  }
  return _globalConfigDir
}

export async function loadZoteroConfig() {
  try {
    const dir = await getGlobalConfigDir()
    const content = await invoke('read_file', { path: `${dir}/zotero.json` })
    return JSON.parse(content)
  } catch {
    return null
  }
}

export async function saveZoteroConfig(config) {
  const dir = await getGlobalConfigDir()
  if (!config) {
    try { await invoke('delete_path', { path: `${dir}/zotero.json` }) } catch {}
    return
  }
  await invoke('write_file', {
    path: `${dir}/zotero.json`,
    content: JSON.stringify(config, null, 2),
  })
}

// ── API client layer ──

let _backoffUntil = 0

async function zoteroApi(path, { method = 'GET', body = null, headers = {}, apiKey } = {}) {
  // Respect backoff
  const now = Date.now()
  if (_backoffUntil > now) {
    await sleep(_backoffUntil - now)
  }

  const reqHeaders = {
    'Zotero-API-Key': apiKey,
    'Zotero-API-Version': '3',
    'User-Agent': 'Shoulders-Desktop/1.0',
    ...headers,
  }
  if (body) reqHeaders['Content-Type'] = 'application/json'

  const result = await invoke('proxy_api_call_full', {
    request: {
      url: `${ZOTERO_API_BASE}${path}`,
      method,
      headers: reqHeaders,
      body: body ? JSON.stringify(body) : '',
    },
  })

  // Respect Backoff header for future requests
  if (result.headers['backoff']) {
    _backoffUntil = Date.now() + parseInt(result.headers['backoff']) * 1000
  }

  if (result.status === 429) {
    const retryAfter = parseInt(result.headers['retry-after'] || '10')
    throw new ZoteroRateLimitError(retryAfter)
  }
  if (result.status === 403) throw new ZoteroAuthError('API key invalid or expired')

  return {
    data: result.body ? JSON.parse(result.body) : null,
    headers: result.headers,
    status: result.status,
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── API methods ──

export async function validateApiKey(apiKey) {
  const { data } = await zoteroApi('/keys/current', { apiKey })
  return { userID: String(data.userID), username: data.username }
}

export async function fetchUserGroups(apiKey, userId) {
  const { data } = await zoteroApi(`/users/${userId}/groups`, { apiKey })
  return data.map(g => ({
    id: String(g.id),
    name: g.data.name,
    type: g.data.type,
    owner: String(g.data.owner),
    libraryEditing: g.meta?.libraryEditing || g.data.libraryEditing || 'members',
    canWrite: g.meta?.library?.libraryEditing !== 'admins' || String(g.data.owner) === userId,
  }))
}

export async function fetchCollections(apiKey, libraryType, libraryId) {
  const prefix = libraryType === 'group' ? `/groups/${libraryId}` : `/users/${libraryId}`
  const { data } = await zoteroApi(`${prefix}/collections`, { apiKey })
  return data.map(c => ({
    key: c.key,
    name: c.data.name,
    parentCollection: c.data.parentCollection || null,
  }))
}

export function buildCollectionTree(collections) {
  const byKey = new Map()
  const roots = []
  for (const c of collections) {
    byKey.set(c.key, { ...c, children: [] })
  }
  for (const c of collections) {
    const node = byKey.get(c.key)
    if (c.parentCollection) {
      const parent = byKey.get(c.parentCollection)
      if (parent) parent.children.push(node)
      else roots.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

async function fetchItemsPage(apiKey, libraryType, libraryId, { start = 0, limit = 100, since = 0 } = {}) {
  const prefix = libraryType === 'group' ? `/groups/${libraryId}` : `/users/${libraryId}`
  const headers = {}
  if (since > 0) headers['If-Modified-Since-Version'] = String(since)

  const { data, headers: respHeaders, status } = await zoteroApi(
    `${prefix}/items?format=csljson&limit=${limit}&start=${start}&itemType=-attachment%20||%20note`,
    { apiKey, headers }
  )

  // 304 = no changes since this version
  if (status === 304) {
    return { items: [], totalResults: 0, lastVersion: since }
  }

  const totalResults = parseInt(respHeaders['total-results'] || '0')
  const lastVersion = parseInt(respHeaders['last-modified-version'] || '0')

  return {
    items: data?.items || [],
    totalResults,
    lastVersion,
  }
}

export async function fetchAllItems(apiKey, libraryType, libraryId, sinceVersion = 0, onProgress) {
  let start = 0
  const limit = 100
  let allItems = []
  let lastVersion = sinceVersion
  let totalResults = 0

  // First page to get total
  const first = await fetchItemsPage(apiKey, libraryType, libraryId, { start, limit, since: sinceVersion })
  if (first.items.length === 0 && first.totalResults === 0) {
    return { items: [], lastVersion: first.lastVersion || sinceVersion }
  }

  allItems = first.items
  totalResults = first.totalResults
  lastVersion = first.lastVersion
  start += limit

  if (onProgress) onProgress({ current: allItems.length, total: totalResults })

  // Remaining pages
  while (start < totalResults) {
    let retries = 0
    while (retries < 3) {
      try {
        const page = await fetchItemsPage(apiKey, libraryType, libraryId, { start, limit, since: sinceVersion })
        allItems.push(...page.items)
        if (onProgress) onProgress({ current: allItems.length, total: totalResults })
        break
      } catch (e) {
        if (e instanceof ZoteroRateLimitError && retries < 2) {
          await sleep(e.retryAfter * 1000)
          retries++
        } else {
          throw e
        }
      }
    }
    start += limit
  }

  return { items: allItems, lastVersion }
}

// ── Write: push item to Zotero ──

export async function pushItem(apiKey, libraryType, libraryId, zoteroJson) {
  const prefix = libraryType === 'group' ? `/groups/${libraryId}` : `/users/${libraryId}`
  const { data, status } = await zoteroApi(`${prefix}/items`, {
    method: 'POST',
    body: [zoteroJson],
    apiKey,
  })

  if (status !== 200) {
    throw new ZoteroApiError(status, JSON.stringify(data))
  }

  // Response: { successful: { "0": { key, data, ... } }, failed: {}, unchanged: {} }
  const successKeys = Object.keys(data.successful || {})
  if (successKeys.length === 0) {
    const failKeys = Object.keys(data.failed || {})
    const failMsg = failKeys.length > 0 ? JSON.stringify(data.failed[failKeys[0]]) : 'Unknown error'
    throw new ZoteroApiError(status, failMsg)
  }

  return data.successful[successKeys[0]]
}

// ── Write: delete item from Zotero ──

export async function deleteItem(apiKey, libraryType, libraryId, itemKey, lastVersion) {
  const prefix = libraryType === 'group' ? `/groups/${libraryId}` : `/users/${libraryId}`
  const { status } = await zoteroApi(`${prefix}/items?itemKey=${itemKey}`, {
    method: 'DELETE',
    headers: { 'If-Unmodified-Since-Version': String(lastVersion) },
    apiKey,
  })

  // 204 = success, 412 = version conflict (item modified in Zotero — acceptable)
  if (status !== 204 && status !== 412) {
    throw new ZoteroApiError(status, `Delete failed for ${itemKey}`)
  }
}

// ── CSL-JSON → Zotero JSON mapper (write path only) ──

const CSL_TO_ZOTERO_TYPE = {
  'article-journal': 'journalArticle',
  'article': 'journalArticle',
  'book': 'book',
  'chapter': 'bookSection',
  'paper-conference': 'conferencePaper',
  'report': 'report',
  'thesis': 'thesis',
  'webpage': 'webpage',
  'dataset': 'document',
}

function formatZoteroDate(issued) {
  if (!issued?.['date-parts']?.[0]) return ''
  const parts = issued['date-parts'][0]
  if (parts.length === 3) return `${parts[0]}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')}`
  if (parts.length === 2) return `${parts[0]}-${String(parts[1]).padStart(2, '0')}`
  return String(parts[0])
}

export function cslToZoteroJson(cslItem) {
  const itemType = CSL_TO_ZOTERO_TYPE[cslItem.type] || 'document'

  const creators = []
  for (const author of (cslItem.author || [])) {
    creators.push({ creatorType: 'author', firstName: author.given || '', lastName: author.family || '' })
  }
  for (const editor of (cslItem.editor || [])) {
    creators.push({ creatorType: 'editor', firstName: editor.given || '', lastName: editor.family || '' })
  }

  const item = {
    itemType,
    title: cslItem.title || '',
    creators,
    date: formatZoteroDate(cslItem.issued),
    DOI: cslItem.DOI || '',
    url: cslItem.URL || '',
    abstractNote: cslItem.abstract || '',
    volume: cslItem.volume || '',
    issue: cslItem.issue || '',
    pages: cslItem.page || '',
    publisher: cslItem.publisher || '',
    ISBN: cslItem.ISBN || '',
    ISSN: cslItem.ISSN || '',
    language: cslItem.language || '',
  }

  // Type-specific container field
  if (itemType === 'bookSection') {
    item.bookTitle = cslItem['container-title'] || ''
  } else if (itemType === 'conferencePaper') {
    item.proceedingsTitle = cslItem['container-title'] || ''
    item.conferenceName = cslItem.event || ''
  } else if (itemType === 'thesis') {
    item.university = cslItem.publisher || ''
    item.thesisType = cslItem.genre || ''
    delete item.publisher
  } else {
    item.publicationTitle = cslItem['container-title'] || ''
  }

  // Clean out empty/null values
  return Object.fromEntries(
    Object.entries(item).filter(([, v]) =>
      v !== '' && v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0)
    )
  )
}

// ── Sync engine ──

function getLibrariesToSync(config) {
  if (!config.selectedCollections) {
    // Entire library = user library + all groups
    const libraries = [{ type: 'user', id: config.userId }]
    if (config._groups) {
      for (const g of config._groups) {
        libraries.push({ type: 'group', id: g.id })
      }
    }
    return libraries
  }
  // Deduplicate by library
  const seen = new Set()
  const libraries = []
  for (const sel of config.selectedCollections) {
    const key = `${sel.libraryType}/${sel.libraryId}`
    if (!seen.has(key)) {
      seen.add(key)
      libraries.push({ type: sel.libraryType, id: sel.libraryId })
    }
  }
  return libraries
}

function mergeZoteroItems(items, referencesStore) {
  const report = { added: 0, updated: 0, skipped: 0 }

  for (const item of items) {
    // Zotero CSL-JSON uses 'id' as the item URI, extract key from it
    // Format: "http://zotero.org/users/12345/items/AB12CD34" or just "AB12CD34"
    const zoteroKey = typeof item.id === 'string' && item.id.includes('/')
      ? item.id.split('/').pop()
      : String(item.id || '')

    if (!zoteroKey) { report.skipped++; continue }

    // Check if we already track this Zotero item
    const existing = referencesStore.library.find(r => r._zoteroKey === zoteroKey)

    if (existing) {
      // Update: Zotero is source of truth — preserve our custom fields
      const preserved = {
        _key: existing._key,
        id: existing._key,
        _addedAt: existing._addedAt,
        _pdfFile: existing._pdfFile,
        _textFile: existing._textFile,
        _tags: existing._tags,
        _zoteroKey: zoteroKey,
        _zoteroLibrary: item._zoteroLibrary,
        _source: 'zotero',
        _pushedByShoulders: existing._pushedByShoulders || false,
      }
      // Strip Zotero's URI id before merging
      const cleaned = { ...item }
      delete cleaned.id
      delete cleaned._zoteroLibrary
      referencesStore.updateReference(existing._key, { ...cleaned, ...preserved })
      report.updated++
    } else {
      // Check for duplicate by DOI/title (might be a manual ref)
      const dupKey = referencesStore.findDuplicate(item)
      if (dupKey) {
        const existingRef = referencesStore.getByKey(dupKey)
        if (!existingRef._zoteroKey) {
          referencesStore.updateReference(dupKey, {
            _zoteroKey: zoteroKey,
            _zoteroLibrary: item._zoteroLibrary,
          })
        }
        report.skipped++
      } else {
        // New reference from Zotero
        const newRef = { ...item }
        delete newRef.id // let addReference generate our key
        newRef._zoteroKey = zoteroKey
        newRef._zoteroLibrary = item._zoteroLibrary
        newRef._source = 'zotero'
        newRef._importMethod = 'zotero-sync'
        newRef._key = undefined
        referencesStore.addReference(newRef)
        report.added++
      }
    }
  }

  return report
}

async function pushPendingItems(apiKey, config, referencesStore) {
  if (!config.pushTarget) return { pushed: 0 }

  const pending = referencesStore.library.filter(r =>
    r._shouldersPushPending && !r._zoteroKey
  )

  if (pending.length === 0) return { pushed: 0 }

  zoteroSyncState.progress = { phase: 'pushing', current: 0, total: pending.length }

  let pushed = 0
  for (let i = 0; i < pending.length; i++) {
    const ref = pending[i]
    try {
      const zoteroItem = cslToZoteroJson(ref)

      // Add to specific collection if configured
      if (config.pushTarget.collectionKey) {
        zoteroItem.collections = [config.pushTarget.collectionKey]
      }

      const result = await pushItem(
        apiKey,
        config.pushTarget.libraryType,
        config.pushTarget.libraryId,
        zoteroItem,
      )

      referencesStore.updateReference(ref._key, {
        _zoteroKey: result.key,
        _zoteroLibrary: `${config.pushTarget.libraryType}/${config.pushTarget.libraryId}`,
        _shouldersPushPending: false,
        _pushedByShoulders: true,
      })
      pushed++
    } catch (e) {
      console.warn(`[zotero] Push failed for ${ref._key}:`, e)
      // Keep _shouldersPushPending for retry on next sync
    }

    zoteroSyncState.progress = { phase: 'pushing', current: i + 1, total: pending.length }
  }

  return { pushed }
}

export async function syncNow(onProgress) {
  const apiKey = await loadZoteroApiKey()
  if (!apiKey) return null
  const config = await loadZoteroConfig()
  if (!config?.userId) return null

  zoteroSyncState.status = 'syncing'
  zoteroSyncState.progress = { phase: 'fetching-items', current: 0, total: 0 }
  zoteroSyncState.error = null

  // Apply state to workspace store
  _applyState()

  try {
    const libraries = getLibrariesToSync(config)
    if (!config.lastSyncVersions) config.lastSyncVersions = {}

    const allNewItems = []

    // Fetch items from each library
    for (const lib of libraries) {
      const versionKey = `${lib.type}/${lib.id}`
      const sinceVersion = config.lastSyncVersions[versionKey] || 0

      const { items, lastVersion } = await fetchAllItems(
        apiKey, lib.type, lib.id, sinceVersion,
        (p) => {
          zoteroSyncState.progress = { phase: 'fetching-items', ...p }
          _applyState()
          if (onProgress) onProgress(zoteroSyncState.progress)
        }
      )

      // Tag items with their source library
      for (const item of items) {
        item._zoteroLibrary = versionKey
      }
      allNewItems.push(...items)

      if (lastVersion > sinceVersion) {
        config.lastSyncVersions[versionKey] = lastVersion
      }
    }

    // Merge into local library
    let mergeReport = { added: 0, updated: 0, skipped: 0 }
    if (allNewItems.length > 0) {
      zoteroSyncState.progress = { phase: 'merging', current: 0, total: allNewItems.length }
      _applyState()

      // Lazy import to avoid circular dependency
      const { useReferencesStore } = await import('../stores/references')
      const referencesStore = useReferencesStore()
      mergeReport = mergeZoteroItems(allNewItems, referencesStore)
    }

    // Push pending items back to Zotero
    const { useReferencesStore } = await import('../stores/references')
    const referencesStore = useReferencesStore()
    const pushReport = await pushPendingItems(apiKey, config, referencesStore)

    // Save updated version numbers
    await saveZoteroConfig(config)

    zoteroSyncState.status = 'synced'
    zoteroSyncState.lastSyncTime = new Date()
    zoteroSyncState.error = null
    zoteroSyncState.progress = null
    _applyState()

    return { ...mergeReport, pushed: pushReport.pushed }
  } catch (e) {
    zoteroSyncState.status = 'error'
    zoteroSyncState.error = e.message
    zoteroSyncState.errorType = classifyError(e)
    zoteroSyncState.progress = null
    _applyState()
    throw e
  }
}

// ── Delete propagation (called from references store) ──

export async function deleteFromZotero(ref) {
  if (!ref._pushedByShoulders || !ref._zoteroKey) return

  const apiKey = await loadZoteroApiKey()
  const config = await loadZoteroConfig()
  if (!apiKey || !config) return

  try {
    const [libType, libId] = (ref._zoteroLibrary || '').split('/')
    if (!libType || !libId) return

    const versionKey = ref._zoteroLibrary
    const version = config.lastSyncVersions?.[versionKey] || 0

    await deleteItem(apiKey, libType, libId, ref._zoteroKey, version)
  } catch (e) {
    console.warn(`[zotero] Delete propagation failed for ${ref._zoteroKey}:`, e)
  }
}

// ── Init + auto-sync ──

export async function initZotero() {
  const apiKey = await loadZoteroApiKey()
  if (!apiKey) {
    zoteroSyncState.status = 'disconnected'
    _applyState()
    return
  }

  const config = await loadZoteroConfig()
  if (!config?.userId) {
    zoteroSyncState.status = 'disconnected'
    _applyState()
    return
  }

  // Validate key still works
  try {
    await validateApiKey(apiKey)
    zoteroSyncState.status = 'idle'
    _applyState()
  } catch {
    zoteroSyncState.status = 'error'
    zoteroSyncState.errorType = 'auth'
    zoteroSyncState.error = 'Zotero API key is invalid. Update it in Settings.'
    _applyState()
    return
  }

  // Auto-sync if enabled (delay to avoid competing with workspace loading)
  if (config.autoSync !== false) {
    setTimeout(() => syncNow().catch(() => {}), 3000)
  }
}

export async function disconnectZotero() {
  await clearZoteroApiKey()
  await saveZoteroConfig(null)
  zoteroSyncState.status = 'disconnected'
  zoteroSyncState.error = null
  zoteroSyncState.lastSyncTime = null
  zoteroSyncState.progress = null
  _applyState()
}

// ── State bridge to workspace store ──

let _workspaceStoreRef = null

export function setWorkspaceStore(store) {
  _workspaceStoreRef = store
}

function _applyState() {
  try {
    if (!_workspaceStoreRef) {
      // Lazy resolve — only works after Pinia is active
      import('../stores/workspace').then(({ useWorkspaceStore }) => {
        _workspaceStoreRef = useWorkspaceStore()
        _workspaceStoreRef._applyZoteroSyncState(zoteroSyncState)
      }).catch(() => {})
      return
    }
    _workspaceStoreRef._applyZoteroSyncState(zoteroSyncState)
  } catch {
    // Store not ready yet — no-op
  }
}
