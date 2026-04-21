<template>
  <footer
    class="h-6 shrink-0 grid items-center px-3 bg-surface-secondary border-t border-line select-none text-xs"
    style="grid-template-columns: 1fr auto 1fr; font-variant-numeric: tabular-nums;"
  >
    <!-- LEFT: terminal + sync + pending -->
    <div class="flex items-center gap-2 justify-self-start whitespace-nowrap self-stretch">
      <!-- Terminal toggle -->
      <button
        class="flex items-center gap-1 px-3 -ml-3 h-full border-none cursor-pointer transition-colors duration-75"
        :class="workspace.bottomPanelOpen
          ? 'text-content bg-surface-tertiary'
          : 'text-content-muted hover:text-content-secondary bg-transparent'"
        title="Toggle terminal (⌃`)"
        @click="workspace.toggleBottomPanel()"
      >
        <IconTerminal2 :size="14" :stroke-width="1.5" />
        <span class="text-[11px]">Terminal</span>
      </button>

      <!-- Separator -->
      <div v-if="workspace.githubUser" class="w-px h-3 shrink-0 bg-line" />

      <!-- Git sync status -->
      <span
        v-if="workspace.githubUser"
        ref="syncTriggerRef"
        class="flex items-center gap-1 cursor-pointer hover:opacity-80"
        :class="syncColorClass"
        :title="syncTooltip"
        @click="toggleSyncPopover"
      >
        <svg v-if="workspace.syncStatus === 'synced'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/>
        </svg>
        <svg v-else-if="workspace.syncStatus === 'syncing'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sync-pulse">
          <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/>
          <path d="M11 13l-2 2 2 2M13 11l2-2-2-2"/>
        </svg>
        <svg v-else-if="workspace.syncStatus === 'error' || workspace.syncStatus === 'conflict'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/>
          <path d="M12 9v4M12 17h.01"/>
        </svg>
        <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-40">
          <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/>
          <path d="M4 20L20 4"/>
        </svg>
        <span v-if="syncLabel" class="text-[11px]">{{ syncLabel }}</span>
      </span>

      <!-- Zotero sync -->
      <template v-if="workspace.zoteroSyncStatus && workspace.zoteroSyncStatus !== 'disconnected'">
        <div class="w-px h-3 shrink-0 bg-line" />
        <span
          class="flex items-center gap-1 hover:opacity-80"
          :class="zoteroColorClass"
          :title="zoteroTooltip"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :class="{ 'sync-pulse': workspace.zoteroSyncStatus === 'syncing' }">
            <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
          </svg>
          <span v-if="zoteroSyncLabel" class="text-[11px]">{{ zoteroSyncLabel }}</span>
        </span>
      </template>

      <!-- Word Bridge -->
      <template v-if="wordFileCount > 0">
        <div class="w-px h-3 shrink-0 bg-line" />
        <span
          class="flex items-center gap-1 cursor-pointer hover:opacity-80 text-accent"
          :title="wordBridgeTooltip"
          @click="openFirstWordFile"
        >
          <IconFileTypeDocx :size="14" />
          <span class="text-[11px]">{{ wordFileCount === 1 ? wordFirstName : wordFileCount + ' files' }}</span>
        </span>
      </template>

      <!-- Pending changes -->
      <template v-if="reviews.pendingCount > 0">
        <div class="w-px h-3 shrink-0 bg-line" />
        <span
          ref="pendingTriggerRef"
          class="flex items-center gap-1 cursor-pointer hover:opacity-80 text-warning"
          @click="togglePendingPopover"
        >
          {{ reviews.pendingCount }} change{{ reviews.pendingCount !== 1 ? 's' : '' }}
        </span>
      </template>
    </div>

    <!-- CENTER: zoom controls -->
    <div class="justify-self-center flex items-center">
      <button
        class="w-5 h-5 flex items-center justify-center rounded cursor-pointer transition-colors duration-75 border-none bg-transparent text-content-muted hover:text-content"
        :title="`Zoom out (${modKey}+-)`"
        @click="workspace.zoomOut()"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 5h6"/></svg>
      </button>
      <button
        ref="zoomTriggerRef"
        class="min-w-[36px] text-center text-[11px] px-0.5 bg-transparent border-none cursor-pointer transition-colors duration-75"
        :class="zoomPercent !== 100 ? 'text-accent' : 'text-content-muted hover:text-content'"
        :title="`Zoom level (${modKey}+0 to reset)`"
        @click="toggleZoomPopover"
      >
        {{ zoomPercent }}%
      </button>
      <button
        class="w-5 h-5 flex items-center justify-center rounded cursor-pointer transition-colors duration-75 border-none bg-transparent text-content-muted hover:text-content"
        :title="`Zoom in (${modKey}+=)`"
        @click="workspace.zoomIn()"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M5 2v6M2 5h6"/></svg>
      </button>
    </div>

    <!-- RIGHT: stats + billing -->
    <div class="flex items-center gap-2 justify-self-end whitespace-nowrap text-content-muted">
      <template v-if="stats.words > 0">
        <span :class="stats.selWords > 0 ? 'text-accent' : ''">
          <span class="inline-block min-w-[3ch] text-right">{{ (stats.selWords > 0 ? stats.selWords : stats.words).toLocaleString() }}</span> words
        </span>
        <span :class="stats.selChars > 0 ? 'text-accent' : ''">
          <span class="inline-block min-w-[3ch] text-right">{{ (stats.selChars > 0 ? stats.selChars : stats.chars).toLocaleString() }}</span> chars
        </span>
      </template>

      <template v-if="usageStore.showInFooter && footerBillingVisible">
        <div class="w-px h-3 shrink-0 bg-line" />
        <span
          v-if="billingRoute?.route === 'shoulders' && shouldersBalance !== null"
          class="cursor-pointer hover:opacity-80"
          :class="shouldersBalanceColorClass"
          title="Shoulders account balance"
          @click="workspace.openSettings('account')"
        >
          <span class="font-mono font-bold tracking-tight pr-1">{{ formatCents(shouldersBalance) }}</span>
          <span class="tracking-tight">Credits remaining</span>
        </span>
        <span
          v-else-if="billingRoute?.route === 'direct'"
          class="cursor-pointer hover:opacity-80"
          :class="usageStore.isOverBudget ? 'text-error' : usageStore.isNearBudget ? 'text-warning' : ''"
          title="Estimated API cost this month"
          @click="workspace.openSettings('models')"
        >
          ~{{ formatCost(usageStore.directCost) }} this month
        </span>
      </template>
    </div>
  </footer>

  <!-- Zoom popover -->
  <Teleport to="body">
    <div v-if="showZoomPopover" class="fixed inset-0 z-50" @click="showZoomPopover = false">
      <div
        class="fixed z-50 rounded-lg border border-line overflow-hidden bg-surface-secondary"
        :style="zoomPopoverPos"
        style="width: 120px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);"
        @click.stop
      >
        <div class="py-1">
          <div
            v-for="level in zoomPresets" :key="level"
            class="px-3 py-1.5 text-xs cursor-pointer flex items-center justify-between hover:bg-surface-hover"
            :class="level === zoomPercent ? 'text-accent' : 'text-content-secondary'"
            @click="selectZoom(level)"
          >
            <span>{{ level }}%</span>
            <span v-if="level === 100" class="text-[10px] text-content-muted">default</span>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Pending changes popover -->
  <Teleport to="body">
    <div v-if="showPendingPopover" class="fixed inset-0 z-50" @click="showPendingPopover = false">
      <div
        class="fixed z-50 rounded-lg border border-line overflow-hidden bg-surface-secondary"
        :style="pendingPopoverPos"
        style="min-width: 200px; max-width: 360px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);"
        @click.stop
      >
        <div class="px-3 py-2 text-xs font-medium uppercase tracking-wider text-content-muted border-b border-line">
          Pending Changes
        </div>
        <div class="py-1 max-h-48 overflow-y-auto">
          <div
            v-for="file in reviews.filesWithEdits" :key="file"
            class="px-3 py-1.5 text-xs cursor-pointer flex items-center gap-2 text-content-secondary hover:bg-surface-hover"
            :title="file"
            @click="openPendingFile(file)"
          >
            <span class="truncate">{{ file?.split('/').pop() }}</span>
            <span class="ml-auto text-[10px] shrink-0 px-1.5 rounded-full bg-warning/20 text-warning">
              {{ reviews.editsForFile(file).length }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Sync popover -->
  <Teleport to="body">
    <div v-if="showSyncPopover" class="fixed inset-0 z-50" @click="showSyncPopover = false">
      <div
        class="fixed z-50 rounded-lg border border-line overflow-hidden bg-surface-secondary"
        :style="syncPopoverPos"
        style="box-shadow: 0 8px 24px rgba(0,0,0,0.4);"
        @click.stop
      >
        <SyncPopover
          @sync-now="handleSyncNow"
          @refresh="handleSyncRefresh"
          @open-settings="handleOpenGitHubSettings"
        />
      </div>
    </div>
  </Teleport>

  <!-- Conflict dialog -->
  <GitHubConflictDialog
    :visible="showConflictDialog"
    @close="showConflictDialog = false"
  />
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { IconTerminal2, IconFileTypeDocx } from '@tabler/icons-vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { useReviewsStore } from '../../stores/reviews'
import { useEditorStore } from '../../stores/editor'
import { useUsageStore } from '../../stores/usage'
import { useToastStore } from '../../stores/toast'
import { getBillingRoute } from '../../services/apiClient'
import { modKey } from '../../platform'
import { wordFiles } from '../../services/wordBridge'
import SyncPopover from './SyncPopover.vue'
import GitHubConflictDialog from '../GitHubConflictDialog.vue'

const workspace = useWorkspaceStore()
const reviews = useReviewsStore()
const editorStore = useEditorStore()
const usageStore = useUsageStore()
const toastStore = useToastStore()

// --- Editor stats (set by App.vue via exposed method) ---
const stats = ref({ words: 0, chars: 0, selWords: 0, selChars: 0 })

// --- Word Bridge ---
const connectedWordFiles = computed(() => {
  const connected = []
  for (const [path, entry] of wordFiles) {
    if (entry.connected) connected.push(path)
  }
  return connected
})
const wordFileCount = computed(() => connectedWordFiles.value.length)
const wordFirstName = computed(() => {
  if (connectedWordFiles.value.length === 0) return ''
  return connectedWordFiles.value[0]?.split('/').pop() || ''
})
const wordBridgeTooltip = computed(() => {
  const names = connectedWordFiles.value.map(p => p?.split('/').pop())
  return 'Connected to Word: ' + names.join(', ')
})
function openFirstWordFile() {
  if (connectedWordFiles.value.length === 0) return
  if (connectedWordFiles.value[0]) editorStore.openFile(connectedWordFiles.value[0])
}

// --- Git sync ---
const showSyncPopover = ref(false)
const syncTriggerRef = ref(null)
const syncPopoverPos = ref({})
const showConflictDialog = ref(false)

const syncColorClass = computed(() => {
  switch (workspace.syncStatus) {
    case 'error': return 'text-error'
    case 'conflict': return 'text-warning'
    default: return 'text-content-muted'
  }
})
const syncTooltip = computed(() => {
  switch (workspace.syncStatus) {
    case 'synced': return 'Synced with GitHub'
    case 'syncing': return 'Syncing with GitHub...'
    case 'conflict': return 'Needs your input — click for details'
    case 'error': return 'Needs attention — click for details'
    case 'idle': return 'GitHub: connected'
    default: return 'GitHub: not connected'
  }
})
const syncLabel = computed(() => {
  switch (workspace.syncStatus) {
    case 'synced': return 'Backed up'
    case 'syncing': return 'Saving...'
    case 'error':
    case 'conflict': return 'Sync issue'
    default: return null
  }
})

function toggleSyncPopover() {
  showSyncPopover.value = !showSyncPopover.value
  if (showSyncPopover.value) {
    nextTick(() => {
      const rect = syncTriggerRef.value?.getBoundingClientRect()
      if (rect) {
        syncPopoverPos.value = {
          bottom: (window.innerHeight - rect.top + 4) + 'px',
          left: rect.left + 'px',
        }
      }
    })
  }
}
async function handleSyncNow() {
  showSyncPopover.value = false
  await workspace.syncNow()
}
async function handleSyncRefresh() {
  showSyncPopover.value = false
  await workspace.fetchRemoteChanges()
}
function handleOpenGitHubSettings() {
  showSyncPopover.value = false
  workspace.openSettings('github')
}

watch(() => workspace.syncStatus, (status) => {
  if (status === 'conflict') {
    showConflictDialog.value = true
    toastStore.showOnce('sync-conflict', 'Your changes conflict with updates on GitHub. Click to resolve.', {
      type: 'warning', duration: 8000,
      action: { label: 'Resolve', onClick: () => { showConflictDialog.value = true } },
    })
  } else if (status === 'error') {
    const errorType = workspace.syncErrorType
    if (errorType === 'auth') {
      toastStore.showOnce('sync-auth', 'GitHub connection expired. Reconnect in Settings.', {
        type: 'error', duration: 8000,
        action: { label: 'Settings', onClick: () => workspace.openSettings('github') },
      })
    } else if (errorType !== 'network') {
      toastStore.showOnce('sync-error', workspace.syncError || 'Sync failed. Click for details.', {
        type: 'error', duration: 6000,
        action: { label: 'Details', onClick: () => { toggleSyncPopover() } },
      })
    }
  }
})

// --- Zotero ---
const zoteroColorClass = computed(() => {
  if (workspace.zoteroSyncStatus === 'error') return 'text-error'
  return 'text-content-muted'
})
const zoteroTooltip = computed(() => {
  switch (workspace.zoteroSyncStatus) {
    case 'synced': return 'Zotero: synced'
    case 'syncing': return 'Syncing with Zotero...'
    case 'error': return `Zotero: ${workspace.zoteroSyncError || 'sync error'}`
    case 'idle': return 'Zotero: connected'
    default: return 'Zotero: not connected'
  }
})
const zoteroSyncLabel = computed(() => {
  switch (workspace.zoteroSyncStatus) {
    case 'syncing': return 'Zotero...'
    case 'error': return 'Zotero issue'
    default: return null
  }
})

// --- Pending changes ---
const showPendingPopover = ref(false)
const pendingTriggerRef = ref(null)
const pendingPopoverPos = ref({})

function togglePendingPopover() {
  showPendingPopover.value = !showPendingPopover.value
  if (showPendingPopover.value) {
    nextTick(() => {
      const rect = pendingTriggerRef.value?.getBoundingClientRect()
      if (rect) {
        pendingPopoverPos.value = {
          bottom: (window.innerHeight - rect.top + 4) + 'px',
          left: rect.left + 'px',
        }
      }
    })
  }
}
function openPendingFile(file) {
  editorStore.openFile(file)
  showPendingPopover.value = false
}
watch(() => reviews.pendingCount, (count) => {
  if (count === 0) showPendingPopover.value = false
})

// --- Zoom ---
const showZoomPopover = ref(false)
const zoomTriggerRef = ref(null)
const zoomPopoverPos = ref({})
const zoomPresets = [75, 80, 90, 100, 110, 125, 150]
const zoomPercent = computed(() => Math.round(workspace.editorFontSize / 14 * 100))

function toggleZoomPopover() {
  showZoomPopover.value = !showZoomPopover.value
  if (showZoomPopover.value) {
    nextTick(() => {
      const rect = zoomTriggerRef.value?.getBoundingClientRect()
      if (rect) {
        zoomPopoverPos.value = {
          bottom: (window.innerHeight - rect.top + 4) + 'px',
          left: (rect.left + rect.width / 2 - 60) + 'px',
        }
      }
    })
  }
}
function selectZoom(level) {
  workspace.setZoomPercent(level)
  showZoomPopover.value = false
}

// --- Billing ---
const billingRoute = computed(() => {
  if (!workspace.selectedModelId) return null
  return getBillingRoute(workspace.selectedModelId, workspace)
})
const shouldersBalance = computed(() => {
  if (!workspace.shouldersAuth?.token) return null
  const credits = workspace.shouldersAuth.credits
  return typeof credits === 'number' ? credits : null
})
const footerBillingVisible = computed(() => {
  const route = billingRoute.value
  if (!route) return false
  if (route.route === 'shoulders') return shouldersBalance.value !== null
  if (route.route === 'direct') return usageStore.showCostEstimates && usageStore.directCost > 0
  return false
})
const shouldersBalanceColorClass = computed(() => {
  const cents = shouldersBalance.value ?? 0
  if (cents < 25) return 'text-error'
  if (cents < 100) return 'text-warning'
  return 'text-content-muted'
})

function formatCents(cents) {
  if (cents == null) return '$0.00'
  return '$' + (cents / 100).toFixed(2)
}
function formatCost(val) {
  if (!val) return '$0.00'
  return '$' + val.toFixed(2)
}

// --- Expose for App.vue ---
defineExpose({
  setEditorStats(s) { stats.value = s },
})
</script>

<style scoped>
.sync-pulse {
  animation: syncPulse 2s ease-in-out infinite;
}
@keyframes syncPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
