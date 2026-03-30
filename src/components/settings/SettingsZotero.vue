<template>
  <div>
    <h3 class="settings-section-title">Zotero</h3>

    <!-- Connected state -->
    <template v-if="connected">
      <div class="zt-connected">
        <span class="zt-status-dot good"></span>
        <div class="zt-user-info">
          <span class="zt-username">{{ config?.username || 'Connected' }}</span>
          <span class="zt-user-id">User ID: {{ config?.userId }}</span>
        </div>
        <button class="gh-disconnect-btn" @click="handleDisconnect" :disabled="loading">
          Disconnect
        </button>
      </div>

      <div v-if="error" class="zt-error">{{ error }}</div>

      <!-- Sync scope -->
      <div class="zt-section">
        <h4 class="zt-section-label">Sync scope</h4>

        <label class="zt-radio">
          <input type="radio" v-model="syncScope" value="all" @change="saveScopeConfig" />
          <span>Entire library</span>
        </label>
        <label class="zt-radio">
          <input type="radio" v-model="syncScope" value="selected" @change="saveScopeConfig" />
          <span>Selected collections</span>
        </label>

        <!-- Collection tree -->
        <div v-if="syncScope === 'selected'" class="zt-collection-tree">
          <div v-if="collectionsLoading" class="zt-loading">Loading collections...</div>
          <template v-else>
            <!-- Personal library -->
            <div class="zt-lib-group">
              <div class="zt-lib-header">My Library</div>
              <template v-if="flatUserCollectionsWithDepth.length > 0">
                <label
                  v-for="c in flatUserCollectionsWithDepth"
                  :key="c.key"
                  class="zt-collection-item"
                  :style="{ paddingLeft: (c.depth * 16) + 'px' }"
                >
                  <input
                    type="checkbox"
                    :checked="selectedCollectionKeys.has('user/' + config.userId + '/' + c.key)"
                    @change="toggleCollection('user', config.userId, c.key)"
                  />
                  <span>{{ c.name }}</span>
                </label>
              </template>
              <div v-else class="zt-empty">No collections</div>
            </div>

            <!-- Group libraries -->
            <div v-for="group in groups" :key="group.id" class="zt-lib-group">
              <div class="zt-lib-header">
                {{ group.name }}
                <span v-if="!group.canWrite" class="zt-lock" title="Read-only">🔒</span>
              </div>
              <template v-if="flatGroupCollectionsWithDepth(group.id).length > 0">
                <label
                  v-for="c in flatGroupCollectionsWithDepth(group.id)"
                  :key="c.key"
                  class="zt-collection-item"
                  :style="{ paddingLeft: (c.depth * 16) + 'px' }"
                >
                  <input
                    type="checkbox"
                    :checked="selectedCollectionKeys.has('group/' + group.id + '/' + c.key)"
                    @change="toggleCollection('group', group.id, c.key)"
                  />
                  <span>{{ c.name }}</span>
                </label>
              </template>
              <div v-else class="zt-empty">No collections</div>
            </div>
          </template>
        </div>
      </div>

      <!-- Push target -->
      <div class="zt-section">
        <h4 class="zt-section-label">Push new references to</h4>
        <select class="zt-select" v-model="pushTargetValue" @change="savePushTarget">
          <option value="">Don't push to Zotero</option>
          <option value="user">My Library</option>
          <option v-for="c in flatUserCollections" :key="'u-' + c.key" :value="'user/' + config.userId + '/' + c.key">
            My Library → {{ c.name }}
          </option>
          <template v-for="group in writableGroups" :key="group.id">
            <option :value="'group/' + group.id">{{ group.name }}</option>
            <option v-for="c in flatGroupCollections(group.id)" :key="'g-' + c.key" :value="'group/' + group.id + '/' + c.key">
              {{ group.name }} → {{ c.name }}
            </option>
          </template>
        </select>
        <p class="settings-hint" style="margin-top: 4px;">References you add in Shoulders will also appear in this Zotero collection.</p>
      </div>

      <!-- Sync controls -->
      <div class="zt-section">
        <h4 class="zt-section-label">Sync</h4>

        <label class="zt-toggle-row">
          <span>Auto-sync on workspace open</span>
          <button class="tool-toggle-switch" :class="{ on: autoSync }" @click="toggleAutoSync">
            <span class="tool-toggle-knob"></span>
          </button>
        </label>

        <div class="zt-sync-info">
          <span class="zt-sync-dot" :class="syncDotClass"></span>
          <span class="zt-sync-text">{{ syncStatusText }}</span>
        </div>

        <div v-if="pendingCount > 0" class="zt-pending">
          {{ pendingCount }} reference{{ pendingCount !== 1 ? 's' : '' }} pending push
        </div>

        <!-- Progress bar -->
        <div v-if="syncProgress" class="zt-progress-wrap">
          <div class="zt-progress-bar">
            <div class="zt-progress-fill" :style="{ width: progressPercent + '%' }"></div>
          </div>
          <span class="zt-progress-text">{{ progressLabel }}</span>
        </div>

        <div class="keys-actions">
          <button
            class="key-save-btn"
            :disabled="syncing"
            @click="handleSyncNow"
          >
            {{ syncing ? 'Syncing...' : 'Sync Now' }}
          </button>
        </div>
      </div>
    </template>

    <!-- Disconnected state -->
    <template v-else>
      <p class="settings-hint">Connect your Zotero account to sync your reference library.</p>

      <div v-if="error" class="zt-error">{{ error }}</div>

      <div class="zt-connect-form">
        <label class="zt-label">User ID</label>
        <input
          v-model="userId"
          class="key-input"
          placeholder="12345678"
          @keydown.enter="handleConnect"
        />
        <p class="settings-hint">
          Find this at
          <a class="settings-link" href="#" @click.prevent="openInBrowser('https://www.zotero.org/settings/keys')">zotero.org/settings/keys</a>
        </p>

        <label class="zt-label">API Key</label>
        <div class="key-input-row">
          <input
            v-model="apiKey"
            class="key-input"
            :type="showKey ? 'text' : 'password'"
            placeholder="xxxxxxxxxxxxxxxxxxxxxxxx"
            @keydown.enter="handleConnect"
          />
          <button class="zt-eye-btn" @click="showKey = !showKey" tabindex="-1">
            <svg v-if="showKey" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
            </svg>
            <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
              <line x1="1" y1="1" x2="23" y2="23"/>
            </svg>
          </button>
        </div>
        <p class="settings-hint">
          Create one at
          <a class="settings-link" href="#" @click.prevent="openInBrowser('https://www.zotero.org/settings/keys')">zotero.org/settings/keys</a>
          — enable read/write access.
        </p>
      </div>

      <div class="keys-actions">
        <button
          class="key-save-btn"
          :disabled="loading || !userId.trim() || !apiKey.trim()"
          @click="handleConnect"
        >
          {{ loading ? 'Connecting...' : 'Connect to Zotero' }}
        </button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { useReferencesStore } from '../../stores/references'
import {
  validateApiKey, fetchUserGroups, fetchCollections, buildCollectionTree,
  storeZoteroApiKey, loadZoteroApiKey, clearZoteroApiKey,
  loadZoteroConfig, saveZoteroConfig, syncNow, disconnectZotero,
  zoteroSyncState,
} from '../../services/zoteroSync'

const workspace = useWorkspaceStore()
const referencesStore = useReferencesStore()

const loading = ref(false)
const error = ref('')
const connected = ref(false)
const config = ref(null)

// Connect form
const userId = ref('')
const apiKey = ref('')
const showKey = ref(false)

// Connected state
const groups = ref([])
const userCollections = ref([])
const groupCollections = ref({}) // groupId → tree
const collectionsLoading = ref(false)
const syncScope = ref('all')
const selectedCollectionKeys = ref(new Set())
const pushTargetValue = ref('')
const autoSync = ref(true)

const syncing = computed(() => workspace.zoteroSyncStatus === 'syncing')
const syncProgress = computed(() => zoteroSyncState.progress)

const pendingCount = computed(() =>
  referencesStore.library.filter(r => r._shouldersPushPending && !r._zoteroKey).length
)

const progressPercent = computed(() => {
  const p = syncProgress.value
  if (!p || !p.total) return 0
  return Math.round((p.current / p.total) * 100)
})

const progressLabel = computed(() => {
  const p = syncProgress.value
  if (!p) return ''
  const phase = p.phase === 'fetching-items' ? 'Fetching' : p.phase === 'merging' ? 'Merging' : 'Pushing'
  return `${phase}: ${p.current.toLocaleString()} / ${p.total.toLocaleString()}`
})

const syncDotClass = computed(() => {
  switch (workspace.zoteroSyncStatus) {
    case 'synced': return 'good'
    case 'syncing': return 'warn'
    case 'error': return 'error'
    default: return 'none'
  }
})

const syncStatusText = computed(() => {
  switch (workspace.zoteroSyncStatus) {
    case 'synced':
      if (workspace.zoteroLastSyncTime) return `Synced ${formatRelative(workspace.zoteroLastSyncTime)}`
      return 'Synced'
    case 'syncing': return 'Syncing...'
    case 'error': return workspace.zoteroSyncError || 'Sync error'
    case 'idle': return 'Ready'
    default: return 'Not connected'
  }
})

const writableGroups = computed(() => groups.value.filter(g => g.canWrite))

function flattenCollections(tree, prefix = '') {
  const result = []
  for (const node of tree) {
    const name = prefix ? `${prefix} / ${node.name}` : node.name
    result.push({ key: node.key, name })
    if (node.children?.length) {
      result.push(...flattenCollections(node.children, name))
    }
  }
  return result
}

function flattenWithDepth(tree, depth = 1) {
  const result = []
  for (const node of tree) {
    result.push({ key: node.key, name: node.name, depth })
    if (node.children?.length) {
      result.push(...flattenWithDepth(node.children, depth + 1))
    }
  }
  return result
}

const flatUserCollections = computed(() => flattenCollections(userCollections.value))
const flatUserCollectionsWithDepth = computed(() => flattenWithDepth(userCollections.value))

function flatGroupCollections(groupId) {
  return flattenCollections(groupCollections.value[groupId] || [])
}

function flatGroupCollectionsWithDepth(groupId) {
  return flattenWithDepth(groupCollections.value[groupId] || [])
}

function formatRelative(date) {
  if (!date) return ''
  const d = date instanceof Date ? date : new Date(date)
  const secs = Math.floor((Date.now() - d.getTime()) / 1000)
  if (secs < 60) return 'just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return d.toLocaleDateString()
}

async function openInBrowser(url) {
  try {
    const { open } = await import('@tauri-apps/plugin-shell')
    await open(url)
  } catch {}
}

// ── Lifecycle ──

onMounted(async () => {
  const key = await loadZoteroApiKey()
  const cfg = await loadZoteroConfig()
  if (key && cfg?.userId) {
    connected.value = true
    config.value = cfg
    syncScope.value = cfg.selectedCollections ? 'selected' : 'all'
    autoSync.value = cfg.autoSync !== false
    pushTargetValue.value = encodePushTarget(cfg.pushTarget)
    if (cfg.selectedCollections) {
      selectedCollectionKeys.value = new Set(cfg.selectedCollections.map(c => `${c.libraryType}/${c.libraryId}/${c.collectionKey}`))
    }
    await loadCollections(key)
  }
})

async function loadCollections(key) {
  collectionsLoading.value = true
  try {
    const apiKeyVal = key || await loadZoteroApiKey()

    // Fetch user collections
    const userColls = await fetchCollections(apiKeyVal, 'user', config.value.userId)
    userCollections.value = buildCollectionTree(userColls)

    // Fetch groups
    groups.value = await fetchUserGroups(apiKeyVal, config.value.userId)

    // Fetch collections for each group
    const gc = {}
    for (const g of groups.value) {
      try {
        const colls = await fetchCollections(apiKeyVal, 'group', g.id)
        gc[g.id] = buildCollectionTree(colls)
      } catch {
        gc[g.id] = []
      }
    }
    groupCollections.value = gc
  } catch (e) {
    console.warn('[zotero] Failed to load collections:', e)
  } finally {
    collectionsLoading.value = false
  }
}

// ── Connect / Disconnect ──

async function handleConnect() {
  error.value = ''
  loading.value = true
  try {
    const result = await validateApiKey(apiKey.value.trim())

    // Store credentials
    await storeZoteroApiKey(apiKey.value.trim())

    // Save initial config
    const cfg = {
      userId: result.userID,
      username: result.username,
      selectedCollections: null,
      pushTarget: null,
      autoSync: true,
      lastSyncVersions: {},
      _groups: [],
    }
    await saveZoteroConfig(cfg)

    config.value = cfg
    connected.value = true
    userId.value = ''
    apiKey.value = ''

    // Load collections
    await loadCollections()

    // Store groups in config for sync engine
    cfg._groups = groups.value
    await saveZoteroConfig(cfg)

    // Set workspace state
    workspace.zoteroSyncStatus = 'idle'
  } catch (e) {
    if (e.message?.includes('403') || e.name === 'ZoteroAuthError') {
      error.value = 'Invalid API key or User ID. Check your credentials.'
    } else {
      error.value = `Connection failed: ${e.message}`
    }
  } finally {
    loading.value = false
  }
}

async function handleDisconnect() {
  loading.value = true
  try {
    await disconnectZotero()
    connected.value = false
    config.value = null
    groups.value = []
    userCollections.value = []
    groupCollections.value = {}
    error.value = ''
  } finally {
    loading.value = false
  }
}

// ── Sync scope ──

function toggleCollection(libraryType, libraryId, collectionKey) {
  const key = `${libraryType}/${libraryId}/${collectionKey}`
  if (selectedCollectionKeys.value.has(key)) {
    selectedCollectionKeys.value.delete(key)
  } else {
    selectedCollectionKeys.value.add(key)
  }
  saveScopeConfig()
}

async function saveScopeConfig() {
  if (!config.value) return
  if (syncScope.value === 'all') {
    config.value.selectedCollections = null
  } else {
    config.value.selectedCollections = Array.from(selectedCollectionKeys.value).map(k => {
      const [libraryType, libraryId, collectionKey] = k.split('/')
      return { libraryType, libraryId, collectionKey }
    })
  }
  await saveZoteroConfig(config.value)
}

// ── Push target ──

function encodePushTarget(target) {
  if (!target) return ''
  if (target.collectionKey) return `${target.libraryType}/${target.libraryId}/${target.collectionKey}`
  return target.libraryType === 'user' ? 'user' : `group/${target.libraryId}`
}

function decodePushTarget(value) {
  if (!value) return null
  if (value === 'user') return { libraryType: 'user', libraryId: config.value.userId, collectionKey: null }
  const parts = value.split('/')
  if (parts.length === 2) return { libraryType: parts[0], libraryId: parts[1], collectionKey: null }
  if (parts.length === 3) return { libraryType: parts[0], libraryId: parts[1], collectionKey: parts[2] }
  return null
}

async function savePushTarget() {
  if (!config.value) return
  config.value.pushTarget = decodePushTarget(pushTargetValue.value)
  await saveZoteroConfig(config.value)
}

// ── Auto-sync ──

async function toggleAutoSync() {
  autoSync.value = !autoSync.value
  if (config.value) {
    config.value.autoSync = autoSync.value
    await saveZoteroConfig(config.value)
  }
}

// ── Sync Now ──

async function handleSyncNow() {
  error.value = ''
  try {
    const report = await syncNow()
    if (report) {
      const parts = []
      if (report.added > 0) parts.push(`${report.added} added`)
      if (report.updated > 0) parts.push(`${report.updated} updated`)
      if (report.pushed > 0) parts.push(`${report.pushed} pushed`)
      if (parts.length > 0) {
        const { useToastStore } = await import('../../stores/toast')
        useToastStore().show(`Zotero sync: ${parts.join(', ')}`, { type: 'success', duration: 4000 })
      }
    }
  } catch (e) {
    error.value = e.message
    if (e.name === 'ZoteroAuthError') {
      error.value = 'Zotero API key is invalid or expired. Reconnect below.'
    }
  }
}
</script>

<style scoped>
.zt-connected {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid rgb(var(--border));
  border-radius: 6px;
  margin-bottom: 16px;
  background: rgb(var(--bg-primary));
}

.zt-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.zt-status-dot.good { background: rgb(var(--success)); }
.zt-status-dot.warn { background: rgb(var(--warning)); }
.zt-status-dot.error { background: rgb(var(--error)); }
.zt-status-dot.none { background: rgb(var(--fg-muted)); opacity: 0.4; }

.zt-user-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.zt-username {
  font-size: 13px;
  font-weight: 500;
  color: rgb(var(--fg-primary));
}

.zt-user-id {
  font-size: 11px;
  color: rgb(var(--fg-muted));
}

.zt-error {
  padding: 8px 10px;
  border-radius: 5px;
  background: rgba(var(--error), 0.1);
  color: rgb(var(--error));
  font-size: 12px;
  margin-bottom: 12px;
}

.zt-section {
  margin-bottom: 20px;
}

.zt-section-label {
  font-size: 12px;
  font-weight: 600;
  color: rgb(var(--fg-secondary));
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.zt-radio {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: rgb(var(--fg-primary));
  cursor: pointer;
  padding: 3px 0;
}

.zt-radio input[type="radio"] {
  accent-color: rgb(var(--accent));
}

.zt-collection-tree {
  margin-top: 8px;
  border: 1px solid rgb(var(--border));
  border-radius: 6px;
  padding: 8px;
  max-height: 240px;
  overflow-y: auto;
  background: rgb(var(--bg-primary));
}

.zt-lib-group {
  margin-bottom: 8px;
}

.zt-lib-group:last-child {
  margin-bottom: 0;
}

.zt-lib-header {
  font-size: 11px;
  font-weight: 600;
  color: rgb(var(--fg-muted));
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.zt-lock {
  font-size: 10px;
}

.zt-collection-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: rgb(var(--fg-primary));
  cursor: pointer;
  padding: 2px 0;
}

.zt-collection-item input[type="checkbox"] {
  accent-color: rgb(var(--accent));
}

.zt-empty {
  font-size: 11px;
  color: rgb(var(--fg-muted));
  padding-left: 16px;
  font-style: italic;
}

.zt-loading {
  font-size: 12px;
  color: rgb(var(--fg-muted));
  padding: 8px;
}

.zt-select {
  width: 100%;
  padding: 6px 8px;
  border-radius: 5px;
  border: 1px solid rgb(var(--border));
  background: rgb(var(--bg-primary));
  color: rgb(var(--fg-primary));
  font-size: 12px;
  outline: none;
  cursor: pointer;
}

.zt-select:focus {
  border-color: rgb(var(--accent));
}

.zt-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: rgb(var(--fg-primary));
  cursor: pointer;
  padding: 4px 0;
}

.zt-sync-info {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 10px 0;
}

.zt-sync-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.zt-sync-dot.good { background: rgb(var(--success)); }
.zt-sync-dot.warn { background: rgb(var(--warning)); animation: syncPulse 1.5s ease-in-out infinite; }
.zt-sync-dot.error { background: rgb(var(--error)); }
.zt-sync-dot.none { background: rgb(var(--fg-muted)); opacity: 0.4; }

.zt-sync-text {
  font-size: 12px;
  color: rgb(var(--fg-secondary));
}

.zt-pending {
  font-size: 11px;
  color: rgb(var(--fg-muted));
  margin-bottom: 8px;
}

.zt-progress-wrap {
  margin-bottom: 10px;
}

.zt-progress-bar {
  height: 4px;
  background: rgb(var(--bg-tertiary));
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 4px;
}

.zt-progress-fill {
  height: 100%;
  background: rgb(var(--accent));
  border-radius: 2px;
  transition: width 0.3s ease;
}

.zt-progress-text {
  font-size: 11px;
  color: rgb(var(--fg-muted));
}

.zt-connect-form {
  margin-bottom: 12px;
}

.zt-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: rgb(var(--fg-primary));
  margin-bottom: 4px;
  margin-top: 12px;
}

.zt-label:first-child {
  margin-top: 0;
}

.zt-eye-btn {
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  color: rgb(var(--fg-muted));
  display: flex;
  align-items: center;
}

.zt-eye-btn:hover {
  color: rgb(var(--fg-primary));
}

@keyframes syncPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
