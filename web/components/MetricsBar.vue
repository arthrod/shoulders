<template>
  <div class="px-6 max-w-4xl mx-auto mt-10">
    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
      <div
        v-for="metric in metrics"
        :key="metric.label"
        class="border-t border-stone-200 pt-4 pb-2"
      >
        <div class="text-2xl font-semibold text-stone-900 tracking-tight">
          {{ metric.value.toLocaleString() }}
        </div>
        <div class="text-xs text-stone-400 mt-1 uppercase tracking-[0.1em]">
          {{ metric.label }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  metadata: {
    type: Object,
    required: true
  }
})

const metrics = computed(() => {
  const nc = props.metadata?.node_counts || {}
  return [
    { label: 'Projects', value: nc.project || 0 },
    { label: 'Researchers', value: nc.researcher || 0 },
    { label: 'Countries', value: nc.country || 0 },
    { label: 'Instruments', value: nc.instrument || 0 },
    { label: 'Working Groups', value: nc.working_group || 0 }
  ]
})
</script>
