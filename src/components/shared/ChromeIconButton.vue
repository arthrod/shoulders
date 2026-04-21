<template>
  <button
    class="shrink-0 flex items-center justify-center rounded transition-colors duration-75"
    :class="[
      size === 'sm' ? 'w-6 h-6' : 'w-7 h-7',
      active
        ? 'text-accent'
        : 'text-content-muted hover:text-content hover:bg-surface-hover',
    ]"
    :title="title"
    @click="$emit('click', $event)"
  >
    <slot />
  </button>
</template>

<script setup>
defineProps({
  title: { type: String, default: undefined },
  size: { type: String, default: 'md' },
  active: { type: Boolean, default: false },
})
defineEmits(['click'])
</script>
