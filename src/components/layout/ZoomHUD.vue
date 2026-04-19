<template>
  <Teleport to="body">
    <Transition name="zoom-hud">
      <div
        v-if="visible"
        class="fixed z-[9999] bg-surface-secondary px-4 py-2 rounded-full shadow-lg text-base font-bold text-content pointer-events-none"
        style="top: 30vh; left: 50%; transform: translateX(-50%);"
      >
        {{ percentage }}%
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
defineProps({
  visible: { type: Boolean, default: false },
  percentage: { type: Number, default: 100 },
})
</script>
