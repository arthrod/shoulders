<template>
  <div
    ref="rootRef"
    class="flex flex-col h-full outline-none"
    tabindex="-1"
    @keydown="handleKeydown"
  >
    <!-- Header -->
    <SidebarBackBar label="Back" @back="sidebar.goBack()">
      <template #actions />
    </SidebarBackBar>

    <!-- Content -->
    <div ref="itemListRef" class="flex-1 overflow-y-auto min-h-0">
      <div class="max-w-[80ch] mx-auto w-full">

        <!-- ═══ Chat input (hero area — ~30% screen) ═══ -->
        <div class="shrink-0 pt-8 pb-6 sidebar-new-input">
          <ChatInput
            ref="chatInputRef"
            :isStreaming="false"
            :modelId="workspace.selectedModelId"
            :popoverBelow="true"
            @send="handleSend"
            @update-model="handleModelChange"
          />
        </div>

        <!-- ═══ Workflows section ═══ -->
        <div class="px-3">
          <div class="text-[9px] font-semibold tracking-[0.08em] uppercase text-content-muted px-2.5 pb-0.5">Workflows</div>
          <button
            data-launcher-item
            class="flex items-center gap-2.5 w-full text-left px-2.5 py-2 rounded transition-colors duration-75 bg-transparent cursor-pointer"
            @click="toggleWorkflowPicker"
            @mouseenter="selectedIdx = 0"
          >
            <span
              class="w-3 shrink-0 leading-none select-none"
              style="font-size: 14px;"
              :style="{ color: selectedIdx === 0 ? 'rgb(var(--fg-muted))' : 'transparent' }"
            >&#x203a;</span>
            <span class="w-5 h-5 flex items-center justify-center rounded bg-surface-tertiary text-content-muted">
              <IconBolt :size="12" :stroke-width="2" />
            </span>
            <span class="flex-1 ui-text-lg font-medium" :class="selectedIdx === 0 ? 'text-content' : 'text-content-secondary'">Browse workflows</span>
            <IconChevronRight :size="14" :stroke-width="2" class="text-content-muted transition-transform duration-75" :class="showWorkflowPicker ? 'rotate-90' : ''" />
          </button>

          <!-- Workflow picker (inline expand) -->
          <WorkflowPicker v-if="showWorkflowPicker" class="ml-10 mb-2" />
        </div>

        <!-- ═══ Agents section ═══ -->
        <div class="px-3">
          <div class="text-[9px] font-semibold tracking-[0.08em] uppercase text-content-muted px-2.5 pt-4 pb-0.5">Agents</div>

          <!-- Installed agents (always visible) -->
          <template v-for="(agent, i) in installedAgents" :key="agent.id">
            <button
              data-launcher-item
              class="flex items-center gap-2.5 w-full text-left px-2.5 py-2 rounded transition-colors duration-75 bg-transparent cursor-pointer"
              @click="handleAgentClick(agent)"
              @mouseenter="selectedIdx = 1 + i"
            >
              <span
                class="w-3 shrink-0 leading-none select-none"
                style="font-size: 14px;"
                :style="{ color: selectedIdx === 1 + i ? 'rgb(var(--fg-muted))' : 'transparent' }"
              >&#x203a;</span>
              <span class="w-5 h-5 flex items-center justify-center rounded bg-surface-tertiary text-[9px] font-bold text-content-muted">{{ agent.badge }}</span>
              <span class="flex-1 ui-text-lg font-medium" :class="selectedIdx === 1 + i ? 'text-content' : 'text-content-secondary'">{{ agent.name }}</span>
            </button>
          </template>

          <!-- No installed agents message -->
          <div v-if="installedAgents.length === 0 && uninstalledAgents.length > 0" class="px-2.5 py-1.5 ui-text-sm text-content-muted/50">
            No agents installed
          </div>

          <!-- Uninstalled agents (behind expander) -->
          <template v-if="uninstalledAgents.length > 0">
            <button
              class="flex items-center gap-2 w-full text-left px-2.5 py-1.5 ui-text-xs text-content-muted/60 bg-transparent cursor-pointer mt-1"
              @click="showMoreAgents = !showMoreAgents"
            >
              <span class="w-3 shrink-0" />
              <span>{{ showMoreAgents ? 'Fewer agents' : 'More agents...' }}</span>
            </button>

            <div v-if="showMoreAgents" class="flex flex-col gap-1 mt-1">
              <template v-for="agent in uninstalledAgents" :key="agent.id">
                <button
                  class="flex items-center gap-2.5 w-full text-left px-2.5 py-2 rounded transition-colors duration-75 bg-transparent cursor-pointer opacity-60"
                  @click="openInstallUrl(agent)"
                >
                  <span class="w-3 shrink-0" />
                  <span class="w-5 h-5 flex items-center justify-center rounded bg-surface-tertiary text-[9px] font-bold text-content-muted">{{ agent.badge }}</span>
                  <span class="flex-1 ui-text-lg font-medium text-content-secondary">{{ agent.name }}</span>
                  <span class="ui-text-xs text-accent">Install</span>
                </button>
              </template>
            </div>
          </template>
        </div>

        <!-- ═══ Settings ═══ -->
        <div class="px-3 mt-6 mb-4">
          <button
            class="flex items-center gap-2 px-2.5 py-1.5 ui-text-sm text-content-muted hover:text-content-secondary bg-transparent cursor-pointer transition-colors duration-75"
            @click="openSettings"
          >
            <span class="w-3 shrink-0" />
            <IconSettings :size="14" :stroke-width="1.5" />
            Settings
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted } from 'vue'
import { IconBolt, IconChevronRight, IconSettings } from '@tabler/icons-vue'
import { useAISidebarStore } from '../../stores/aiSidebar'
import { useWorkspaceStore } from '../../stores/workspace'
import { detectAgents, getTier1Agents, getTier2Agents } from '../../services/agentRegistry'
import SidebarBackBar from './SidebarBackBar.vue'
import ChatInput from '../chat/ChatInput.vue'
import WorkflowPicker from './WorkflowPicker.vue'

const sidebar = useAISidebarStore()
const workspace = useWorkspaceStore()

const rootRef = ref(null)
const itemListRef = ref(null)
const chatInputRef = ref(null)
const showWorkflowPicker = ref(false)
const showMoreAgents = ref(false)
const selectedIdx = ref(-1) // -1 = ChatInput focused
const tier1Agents = ref([])
const tier2Agents = ref([])

const allAgents = computed(() => [...tier1Agents.value, ...tier2Agents.value])
const installedAgents = computed(() => allAgents.value.filter(a => a.installed))
const uninstalledAgents = computed(() => allAgents.value.filter(a => !a.installed))

const navigableCount = computed(() => 1 + installedAgents.value.length) // workflows + installed agents

onMounted(async () => {
  try {
    const agents = await detectAgents()
    tier1Agents.value = getTier1Agents(agents)
    tier2Agents.value = getTier2Agents(agents)
  } catch {
    const { AGENTS } = await import('../../services/agentRegistry')
    tier1Agents.value = getTier1Agents(AGENTS.map(a => ({ ...a, installed: false })))
    tier2Agents.value = getTier2Agents(AGENTS.map(a => ({ ...a, installed: false })))
  }
})

// ─── Actions ──────────────────────────────────────────────────────

async function handleSend(payload) {
  await sidebar.createChatAndDrillIn({
    text: payload.text,
    fileRefs: payload.fileRefs,
    context: payload.context,
    richHtml: payload.richHtml,
  })
}

function handleModelChange(modelId) {
  workspace.setSelectedModelId(modelId)
}

function handleAgentClick(agent) {
  if (!agent.installed) {
    openInstallUrl(agent)
    return
  }
  sidebar.createTerminalSession(agent.id)
}

function toggleWorkflowPicker() {
  showWorkflowPicker.value = !showWorkflowPicker.value
}

async function openInstallUrl(agent) {
  try {
    const { open } = await import('@tauri-apps/plugin-shell')
    await open(agent.installUrl)
  } catch {
    window.open(agent.installUrl, '_blank')
  }
}

function openSettings() {
  workspace.openSettings()
}

// ─── Keyboard navigation ──────────────────────────────────────────

function handleKeydown(e) {
  const active = document.activeElement
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    moveSelection(1)
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    moveSelection(-1)
    return
  }
  if (e.key === 'Enter' && selectedIdx.value >= 0) {
    e.preventDefault()
    activateSelected()
    return
  }

  // Printable char: redirect to ChatInput
  if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
    selectedIdx.value = -1
    chatInputRef.value?.focus()
  }
}

function moveSelection(delta) {
  const count = navigableCount.value
  if (count === 0) return
  const next = selectedIdx.value + delta
  if (next < 0) {
    selectedIdx.value = -1
    chatInputRef.value?.focus()
    return
  }
  selectedIdx.value = Math.min(count - 1, next)
  nextTick(() => {
    const items = itemListRef.value?.querySelectorAll('[data-launcher-item]')
    items?.[selectedIdx.value]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}

function activateSelected() {
  if (selectedIdx.value === 0) {
    toggleWorkflowPicker()
  } else {
    const agentIdx = selectedIdx.value - 1
    const agent = installedAgents.value[agentIdx]
    if (agent) handleAgentClick(agent)
  }
}

// ─── Focus ────────────────────────────────────────────────────────

function focus() {
  chatInputRef.value?.focus()
}

defineExpose({ focus })
</script>

<style scoped>
.sidebar-new-input :deep(.rich-editor) {
  min-height: 3.6em;
}
</style>
