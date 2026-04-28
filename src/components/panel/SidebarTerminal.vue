<template>
  <div class="flex flex-col h-full">
    <!-- Back bar -->
    <SidebarBackBar :label="sidebar.backButtonLabel" @back="sidebar.goBack()">
      <template #actions>
        <span v-if="agentDef" class="flex items-center gap-1.5 ui-text-sm text-content-muted mr-1">
          <span class="px-1 py-px rounded text-[9px] font-bold uppercase tracking-wide bg-surface-tertiary">{{ agentDef.badge }}</span>
          {{ agentDef.name }}
        </span>
      </template>
    </SidebarBackBar>

    <!-- Terminal instance -->
    <div class="flex-1 min-h-0 overflow-hidden">
      <Terminal
        v-if="agentDef"
        :spawnCmd="agentDef.command"
        :spawnArgs="[]"
        :env="agentEnv"
        @exit="$emit('exited')"
      />
      <div v-else class="h-full flex items-center justify-center ui-text-base text-content-muted">
        Agent not found
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useAISidebarStore } from '../../stores/aiSidebar'
import { useWorkspaceStore } from '../../stores/workspace'
import { AGENTS, ensureAgentConfig } from '../../services/agentRegistry'
import SidebarBackBar from './SidebarBackBar.vue'
import Terminal from '../layout/Terminal.vue'

const props = defineProps({
  session: { type: Object, required: true },
})

defineEmits(['exited'])

const sidebar = useAISidebarStore()
const workspace = useWorkspaceStore()

const agentDef = computed(() => {
  return AGENTS.find(a => a.id === props.session.agentId) || null
})

const toolServerToken = ref(null)
const toolServerPort = ref(null)

onMounted(async () => {
  if (!workspace.path) return

  ensureAgentConfig(props.session.agentId, workspace)

  try {
    toolServerToken.value = await invoke('read_file', { path: workspace.path + '/.shoulders/tool-server-token' })
    const status = await invoke('tool_server_status')
    if (status?.port) toolServerPort.value = status.port
  } catch { /* tool server may not be running */ }
})

const agentEnv = computed(() => {
  if (!toolServerPort.value || !toolServerToken.value) return null
  return {
    SHOULDERS_TOOL_SERVER_URL: `http://localhost:${toolServerPort.value}`,
    SHOULDERS_TOOL_SERVER_TOKEN: toolServerToken.value,
  }
})
</script>
