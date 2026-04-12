<template>
  <div class="px-6 max-w-4xl mx-auto mt-16">
    <p class="text-xs font-semibold text-cadet-500 uppercase tracking-[0.15em] mb-6">Distribution Overview</p>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-12">

      <!-- Projects by Working Group -->
      <div>
        <h3 class="text-sm font-medium text-stone-900 mb-4 tracking-tight">Projects by Working Group</h3>
        <div class="space-y-2.5">
          <div v-for="item in wgDistribution" :key="item.label" class="flex items-center gap-3">
            <div class="w-36 text-xs text-stone-500 text-right truncate shrink-0">{{ item.label }}</div>
            <div class="flex-1 h-4 bg-stone-100 rounded overflow-hidden">
              <div
                class="h-full rounded"
                :style="{ width: item.pct + '%', backgroundColor: item.color }"
              ></div>
            </div>
            <div class="w-8 text-xs text-stone-400 text-right shrink-0 font-sans">{{ item.count }}</div>
          </div>
        </div>
      </div>

      <!-- Top 15 Instruments -->
      <div>
        <h3 class="text-sm font-medium text-stone-900 mb-4 tracking-tight">Top 10 Instruments</h3>
        <div class="space-y-2">
          <div v-for="item in topInstruments" :key="item.label" class="flex items-center gap-3">
            <div class="w-32 text-xs text-stone-500 text-right truncate shrink-0">{{ item.label }}</div>
            <div class="flex-1 h-3.5 bg-stone-100 rounded overflow-hidden">
              <div
                class="h-full rounded bg-stone-400"
                :style="{ width: item.pct + '%' }"
              ></div>
            </div>
            <div class="w-8 text-xs text-stone-400 text-right shrink-0 font-sans">{{ item.count }}</div>
          </div>
        </div>
      </div>

      <!-- Top 20 Countries -->
      <div>
        <h3 class="text-sm font-medium text-stone-900 mb-4 tracking-tight">Top 20 Countries</h3>
        <div class="space-y-1.5">
          <div v-for="item in topCountries" :key="item.label" class="flex items-center gap-3">
            <div class="w-28 text-xs text-stone-500 text-right truncate shrink-0">{{ item.label }}</div>
            <div class="flex-1 h-3 bg-stone-100 rounded overflow-hidden">
              <div
                class="h-full rounded bg-stone-300"
                :style="{ width: item.pct + '%' }"
              ></div>
            </div>
            <div class="w-8 text-xs text-stone-400 text-right shrink-0 font-sans">{{ item.count }}</div>
          </div>
        </div>
      </div>

      <!-- Projects by Type -->
      <div>
        <h3 class="text-sm font-medium text-stone-900 mb-4 tracking-tight">Projects by Type</h3>
        <div class="space-y-2.5">
          <div v-for="item in projectTypes" :key="item.label" class="flex items-center gap-3">
            <div class="w-36 text-xs text-stone-500 text-right truncate shrink-0">{{ item.label }}</div>
            <div class="flex-1 h-4 bg-stone-100 rounded overflow-hidden">
              <div
                class="h-full rounded bg-stone-400"
                :style="{ width: item.pct + '%' }"
              ></div>
            </div>
            <div class="w-8 text-xs text-stone-400 text-right shrink-0 font-sans">{{ item.count }}</div>
          </div>
        </div>
      </div>

      <!-- Top 20 Researchers -->
      <div>
        <h3 class="text-sm font-medium text-stone-900 mb-4 tracking-tight">Top 20 Researchers (by PI count)</h3>
        <div class="space-y-1.5">
          <div v-for="item in topResearchers" :key="item.label" class="flex items-center gap-3">
            <div class="w-36 text-xs text-stone-500 text-right truncate shrink-0">{{ item.label }}</div>
            <div class="flex-1 h-3 bg-stone-100 rounded overflow-hidden">
              <div
                class="h-full rounded bg-stone-300"
                :style="{ width: item.pct + '%' }"
              ></div>
            </div>
            <div class="w-8 text-xs text-stone-400 text-right shrink-0 font-sans">{{ item.count }}</div>
          </div>
        </div>
      </div>

      <!-- Top 20 Conditions -->
      <div>
        <h3 class="text-sm font-medium text-stone-900 mb-4 tracking-tight">Top 20 Conditions</h3>
        <div class="space-y-1.5">
          <div v-for="item in topConditions" :key="item.label" class="flex items-center gap-3">
            <div class="w-28 text-xs text-stone-500 text-right truncate shrink-0">{{ item.label }}</div>
            <div class="flex-1 h-3 bg-stone-100 rounded overflow-hidden">
              <div
                class="h-full rounded bg-orange-300"
                :style="{ width: item.pct + '%' }"
              ></div>
            </div>
            <div class="w-8 text-xs text-stone-400 text-right shrink-0 font-sans">{{ item.count }}</div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const WG_COLORS = {
  'Valuation': '#3b82f6',
  'Descriptive Systems': '#10b981',
  'Populations and Health Systems': '#f59e0b',
  'Youth': '#ec4899',
  'EQ-HWB': '#8b5cf6',
  'Education and Outreach': '#6b7280',
  'Others': '#94a3b8',
  'Dissemination': '#64748b',
  'OA fee': '#475569'
}

const props = defineProps({
  graphData: {
    type: Object,
    required: true
  }
})

const nodeLabels = computed(() => {
  const map = {}
  props.graphData.nodes.forEach(n => { map[n.id] = n.label })
  return map
})

function edgeCounts(edgeType, limit) {
  const labels = nodeLabels.value
  const counts = {}
  props.graphData.edges.forEach(e => {
    if (e.type !== edgeType) return
    const target = typeof e.target === 'object' ? e.target.id : e.target
    const label = labels[target] || target
    counts[label] = (counts[label] || 0) + 1
  })
  let items = Object.entries(counts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
  if (limit) items = items.slice(0, limit)
  const max = items.length > 0 ? items[0].count : 1
  return items.map(item => ({ ...item, pct: Math.round((item.count / max) * 100) }))
}

const wgDistribution = computed(() => {
  return edgeCounts('BELONGS_TO').map(item => ({
    ...item,
    color: WG_COLORS[item.label] || '#94a3b8'
  }))
})

const topInstruments = computed(() => edgeCounts('USES_INSTRUMENT', 10))
const topCountries = computed(() => edgeCounts('CONDUCTED_IN', 20))
const topConditions = computed(() => edgeCounts('STUDIES_CONDITION', 20))

// Researchers: PI_OF edges go project -> researcher, so count by source (project side)
const topResearchers = computed(() => {
  const labels = nodeLabels.value
  const counts = {}
  props.graphData.edges.forEach(e => {
    if (e.type !== 'PI_OF') return
    // target is the researcher
    const target = typeof e.target === 'object' ? e.target.id : e.target
    if (!target.startsWith('researcher_')) return
    const label = labels[target] || target
    counts[label] = (counts[label] || 0) + 1
  })
  let items = Object.entries(counts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
  const max = items.length > 0 ? items[0].count : 1
  return items.map(item => ({ ...item, pct: Math.round((item.count / max) * 100) }))
})

const projectTypes = computed(() => {
  const counts = {}
  props.graphData.nodes.forEach(n => {
    if (n.type !== 'project') return
    const t = (n.project_type || 'unknown').replace(/_/g, ' ')
    counts[t] = (counts[t] || 0) + 1
  })
  const items = Object.entries(counts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
  const max = items.length > 0 ? items[0].count : 1
  return items.map(item => ({ ...item, pct: Math.round((item.count / max) * 100) }))
})
</script>
