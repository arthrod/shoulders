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
        :key="sidebar.activeTerminalSessionId"
        :termId="terminalId"
        :spawnCmd="agentDef.command"
        :spawnArgs="[]"
      />
      <div v-else class="h-full flex items-center justify-center ui-text-base text-content-muted">
        Agent not found
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useAISidebarStore } from '../../stores/aiSidebar'
import { AGENTS } from '../../services/agentRegistry'
import SidebarBackBar from './SidebarBackBar.vue'
import Terminal from '../layout/Terminal.vue'

const sidebar = useAISidebarStore()

const agentDef = computed(() => {
  const id = sidebar.activeTerminalSessionId
  if (!id) return null
  return AGENTS.find(a => a.id === id) || null
})

const terminalId = computed(() => {
  const id = sidebar.activeTerminalSessionId
  if (!id) return 9000
  return 9000 + AGENTS.findIndex(a => a.id === id)
})
</script>
