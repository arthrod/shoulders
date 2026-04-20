<template>
  <ChromeIconButton :title="title" @click="$emit('click', $event)">
    <IconLayoutSidebar v-if="side === 'left'" :size="16" :stroke-width="1.5" />
    <IconLayoutSidebarRight v-else :size="16" :stroke-width="1.5" />
  </ChromeIconButton>
</template>

<script setup>
import { IconLayoutSidebar, IconLayoutSidebarRight } from '@tabler/icons-vue'
import ChromeIconButton from './ChromeIconButton.vue'

defineProps({
  side: { type: String, required: true },
  title: { type: String, default: undefined },
})
defineEmits(['click'])
</script>
