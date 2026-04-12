<template>
  <div class="pt-24 pb-32">
    <!-- Header -->
    <header class="px-6 max-w-6xl mx-auto">
      <p class="text-xs font-semibold text-cadet-500 uppercase tracking-[0.15em] mb-4">Research Knowledge Graph</p>
      <h1 class="text-2xl md:text-3xl font-serif font-semibold leading-tight tracking-tight text-stone-900">
        EuroQol Funded Projects
      </h1>
      <p class="mt-5 text-base text-stone-600 leading-relaxed max-w-3xl">
        Preliminary prototype. 944 funded projects, automatically extracted from publicly available project summaries using an AI-assisted pipeline.
      </p>
    </header>

    <!-- Loading sequence -->
    <div v-if="loading" class="px-6 max-w-6xl mx-auto mt-16" style="height: 800px;">
      <div class="font-mono text-xs text-stone-400 space-y-1 w-72">
        <p v-for="(msg, i) in visibleLoadingMessages" :key="i"
           :class="i === visibleLoadingMessages.length - 1 ? 'text-stone-600' : 'text-stone-300'">
          {{ msg }}
        </p>
        <span class="inline-block w-1.5 h-3 bg-stone-300 animate-pulse"></span>
      </div>
    </div>

    <template v-else>
      <!-- Key Metrics -->
      <MetricsBar :metadata="graphData.metadata" />

      <!-- Filter Controls -->
      <div class="px-6 max-w-6xl mx-auto mt-8 mb-4">
        <div class="flex flex-wrap items-center gap-3">
          <span class="text-xs font-semibold text-cadet-500 uppercase tracking-[0.15em] mr-1">Working Group</span>
          <button
            v-for="wg in workingGroups"
            :key="wg.label"
            :class="[
              'px-3 py-1 rounded text-xs font-medium transition-colors border',
              activeWg === wg.label
                ? 'border-transparent text-white'
                : 'border-stone-200 text-stone-500 hover:text-stone-900 hover:border-stone-300 bg-transparent'
            ]"
            :style="activeWg === wg.label ? { backgroundColor: wg.color } : {}"
            @click="toggleWgFilter(wg.label)"
          >
            {{ wg.label }}
          </button>
          <div class="ml-auto flex items-center gap-2">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search nodes..."
              class="bg-white border border-stone-200 rounded px-3 py-1.5 text-xs text-stone-700 placeholder-stone-300 w-56 focus:outline-none focus:border-stone-400 transition-colors"
              @input="onSearch"
            />
            <button
              v-if="searchQuery || activeWg || selectedNode"
              class="px-3 py-1.5 rounded text-xs text-stone-500 hover:text-stone-900 border border-stone-200 hover:border-stone-300 transition-colors"
              @click="resetAll"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      <!-- Network Graph -->
      <div class="px-6 max-w-6xl mx-auto">
        <div class="relative bg-stone-50 rounded-lg border border-stone-200 overflow-hidden mx-auto" style="height: 55vh; max-width: 900px;">
          <svg ref="svgRef" class="w-full h-full"></svg>
          <!-- Tooltip -->
          <div
            v-if="tooltip.show"
            class="absolute pointer-events-none z-50 bg-white border border-stone-200 rounded px-4 py-3 max-w-sm shadow-sm"
            :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }"
          >
            <div class="text-xs uppercase tracking-[0.1em] mb-1 font-semibold" :style="{ color: tooltip.color }">
              {{ tooltip.type }}
            </div>
            <div class="text-sm font-medium text-stone-900 leading-snug">{{ tooltip.title }}</div>
            <div v-if="tooltip.details" class="mt-1.5 text-xs text-stone-500 leading-relaxed">
              {{ tooltip.details }}
            </div>
            <div v-if="tooltip.count" class="mt-1.5 text-xs text-stone-400">
              {{ tooltip.count }}
            </div>
          </div>
          <!-- Selection panel -->
          <div
            v-if="selectionPanel.show"
            class="absolute right-4 top-4 bottom-4 w-80 bg-white/95 backdrop-blur border border-stone-200 rounded overflow-hidden flex flex-col z-40 shadow-sm"
          >
            <div class="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
              <div>
                <div class="text-xs uppercase tracking-[0.1em] font-semibold" :style="{ color: selectionPanel.color }">
                  {{ selectionPanel.type }}
                </div>
                <div class="text-sm font-medium text-stone-900 mt-0.5">{{ selectionPanel.title }}</div>
              </div>
              <button
                class="text-stone-400 hover:text-stone-700 text-lg leading-none"
                @click="resetAll"
              >
                &times;
              </button>
            </div>
            <div class="px-4 py-2 text-xs text-stone-400 border-b border-stone-100">
              {{ selectionPanel.projects.length }} connected project{{ selectionPanel.projects.length !== 1 ? 's' : '' }}
            </div>
            <div class="flex-1 overflow-y-auto">
              <div
                v-for="(p, i) in selectionPanel.projects"
                :key="i"
                class="px-4 py-2.5 border-b border-stone-50 hover:bg-stone-50"
              >
                <div class="text-xs text-stone-700 leading-snug">{{ p.title || p.label }}</div>
                <div v-if="p.pi" class="text-xs text-stone-400 mt-0.5">PI: {{ p.pi }}</div>
              </div>
            </div>
          </div>
          <!-- Zoom controls -->
          <div class="absolute bottom-4 left-4 flex flex-col gap-1 z-30">
            <button
              class="w-8 h-8 bg-white/80 border border-stone-200 rounded text-stone-400 hover:text-stone-700 hover:border-stone-300 text-sm transition-colors flex items-center justify-center"
              @click="zoomIn"
            >+</button>
            <button
              class="w-8 h-8 bg-white/80 border border-stone-200 rounded text-stone-400 hover:text-stone-700 hover:border-stone-300 text-sm transition-colors flex items-center justify-center"
              @click="zoomOut"
            >&minus;</button>
            <button
              class="w-8 h-8 bg-white/80 border border-stone-200 rounded text-stone-400 hover:text-stone-700 hover:border-stone-300 text-xs transition-colors flex items-center justify-center"
              @click="zoomReset"
            >fit</button>
          </div>
        </div>
        <!-- Legend -->
        <div class="flex flex-wrap items-center gap-x-5 gap-y-1 mt-3 mb-2 px-1">
          <span class="text-xs text-stone-400 mr-1">Legend:</span>
          <span v-for="item in legendItems" :key="item.label" class="flex items-center gap-1.5 text-xs text-stone-400">
            <span class="inline-block rounded-full" :style="{ width: item.size + 'px', height: item.size + 'px', backgroundColor: item.color }"></span>
            {{ item.label }}
          </span>
        </div>
      </div>

      <!-- Summary Charts -->
      <SummaryCharts :graph-data="graphData" />

      <!-- Footer note -->
      <div class="px-6 max-w-6xl mx-auto border-t border-stone-100 mt-24 pt-10">
        <p class="text-xs text-stone-300">
          Prototype for EuroQol Seed Grant proposal. Data extracted from publicly available project summaries.
        </p>
        <p class="text-xs text-stone-300 mt-1">
          Built with Shoulders — shoulde.rs
        </p>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, nextTick } from 'vue'
import MetricsBar from '~/components/MetricsBar.vue'
import SummaryCharts from '~/components/SummaryCharts.vue'

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

const NODE_COLORS = {
  project: '#78716c',
  researcher: '#a8a29e',
  instrument: '#44403c',
  country: '#0284c7',
  method: '#0d9488',
  working_group: '#1c1917',
  condition: '#ea580c'
}

const workingGroups = Object.entries(WG_COLORS).map(([label, color]) => ({ label, color }))

const legendItems = [
  { label: 'Project (colored by WG)', color: '#3b82f6', size: 8 },
  { label: 'Working Group', color: '#1c1917', size: 14 },
  { label: 'Instrument', color: '#44403c', size: 10 },
  { label: 'Country', color: '#0284c7', size: 8 },
  { label: 'Method', color: '#0d9488', size: 7 },
  { label: 'Condition', color: '#ea580c', size: 7 },
  { label: 'Researcher', color: '#a8a29e', size: 5 },
]

const loading = ref(true)
const graphData = ref(null)
const svgRef = ref(null)

const loadingMessages = [
  'Connecting to graph database...',
  'Retrieving project metadata...',
  'Parsing entity relationships...',
  'Resolving instrument taxonomy...',
  'Mapping researcher affiliations...',
  'Indexing working group structure...',
  'Computing force-directed layout...',
  'Positioning 2,116 nodes...',
  'Rendering 8,213 edges...',
  'Calibrating cluster distances...',
  'Applying spatial constraints...',
  'Finalizing graph topology...',
]
const visibleLoadingMessages = ref([])
let loadingInterval = null

let loadingResolve = null
const loadingComplete = new Promise(r => { loadingResolve = r })
let dataReady = false

function startLoadingSequence() {
  let idx = 0
  visibleLoadingMessages.value = [loadingMessages[0]]
  idx = 1
  loadingInterval = setInterval(() => {
    if (idx < loadingMessages.length) {
      visibleLoadingMessages.value = [...visibleLoadingMessages.value, loadingMessages[idx]]
      idx++
    }
    // Once we've shown enough messages AND data is ready, finish
    if (idx >= 8 && dataReady) {
      stopLoadingSequence()
      loadingResolve()
    }
  }, 1000)
}

function stopLoadingSequence() {
  if (loadingInterval) {
    clearInterval(loadingInterval)
    loadingInterval = null
  }
}
const activeWg = ref(null)
const searchQuery = ref('')
const selectedNode = ref(null)

const tooltip = reactive({
  show: false,
  x: 0,
  y: 0,
  type: '',
  title: '',
  details: '',
  count: '',
  color: '#fff'
})

const selectionPanel = reactive({
  show: false,
  type: '',
  title: '',
  color: '#fff',
  projects: []
})

let d3 = null
let simulation = null
let zoomBehavior = null
let svgSelection = null
let gContainer = null
let nodeElements = null
let linkElements = null
let labelElements = null
let nodeDataMap = {}
let edgeIndex = {}
let currentTransform = null

function getProjectColor(node) {
  if (node.type !== 'project') return null
  const wg = node.wg || ''
  const firstWg = wg.split(',')[0].trim()
  return WG_COLORS[firstWg] || '#94a3b8'
}

function getNodeColor(node) {
  if (node.type === 'project') return getProjectColor(node)
  if (node.type === 'working_group') return WG_COLORS[node.label] || '#94a3b8'
  return NODE_COLORS[node.type] || '#94a3b8'
}

function getNodeRadius(node) {
  if (node.type === 'working_group') return 18
  if (node.type === 'instrument') return 9
  if (node.type === 'country') return 4.5
  if (node.type === 'method') return 3.5
  if (node.type === 'condition') return 3
  if (node.type === 'researcher') return 1.8
  return 3.5
}

function getConnectedProjects(nodeId) {
  const neighbors = edgeIndex[nodeId] || []
  return neighbors
    .map(id => nodeDataMap[id])
    .filter(n => n && n.type === 'project')
}

function getConnectedProjectCount(nodeId) {
  return getConnectedProjects(nodeId).length
}

function formatTooltip(node) {
  const color = getNodeColor(node)
  let type = node.type.replace('_', ' ')
  let title = node.label || node.title || node.id
  let details = ''
  let count = ''

  if (node.type === 'project') {
    title = node.title || node.label
    const parts = []
    if (node.pi) parts.push('PI: ' + node.pi)
    if (node.wg) parts.push('WG: ' + node.wg)
    if (node.project_type) parts.push('Type: ' + node.project_type.replace(/_/g, ' '))
    details = parts.join(' | ')
    if (node.key_finding) {
      count = node.key_finding.length > 180 ? node.key_finding.substring(0, 180) + '...' : node.key_finding
    }
  } else {
    const n = getConnectedProjectCount(node.id)
    const prefix = (node.type === 'instrument' || node.type === 'method') ? 'Used in ' : ''
    count = prefix + n + ' project' + (n !== 1 ? 's' : '')
  }

  return { type, title, details, count, color }
}

function toggleWgFilter(wgLabel) {
  if (activeWg.value === wgLabel) {
    activeWg.value = null
    resetHighlighting()
  } else {
    activeWg.value = wgLabel
    selectedNode.value = null
    selectionPanel.show = false
    searchQuery.value = ''
    highlightWg(wgLabel)
  }
}

function highlightWg(wgLabel) {
  const wgNodeId = 'working_group_' + wgLabel.replace(/ /g, '_')
  const connectedProjects = new Set(getConnectedProjects(wgNodeId).map(p => p.id))
  connectedProjects.add(wgNodeId)

  nodeElements.attr('opacity', d => connectedProjects.has(d.id) || d.id === wgNodeId ? 1 : 0.04)
  linkElements.attr('stroke-opacity', d => {
    const sid = typeof d.source === 'object' ? d.source.id : d.source
    const tid = typeof d.target === 'object' ? d.target.id : d.target
    return connectedProjects.has(sid) && connectedProjects.has(tid) ? 0.2 : 0.005
  })
  labelElements.attr('opacity', d => connectedProjects.has(d.id) || d.id === wgNodeId ? 1 : 0.04)
}

function highlightNode(nodeId) {
  const node = nodeDataMap[nodeId]
  if (!node || node.type === 'project') return

  selectedNode.value = nodeId
  activeWg.value = null
  searchQuery.value = ''

  const connected = new Set(edgeIndex[nodeId] || [])
  connected.add(nodeId)

  const connectedProjects = getConnectedProjects(nodeId)

  selectionPanel.show = true
  selectionPanel.type = node.type.replace('_', ' ')
  selectionPanel.title = node.label
  selectionPanel.color = getNodeColor(node)
  selectionPanel.projects = connectedProjects

  nodeElements.attr('opacity', d => connected.has(d.id) ? 1 : 0.04)
  linkElements.attr('stroke-opacity', d => {
    const sid = typeof d.source === 'object' ? d.source.id : d.source
    const tid = typeof d.target === 'object' ? d.target.id : d.target
    return (sid === nodeId || tid === nodeId) ? 0.35 : 0.005
  })
  labelElements.attr('opacity', d => connected.has(d.id) ? 1 : 0.04)
}

function highlightSearch(query) {
  if (!query || query.length < 2) {
    resetHighlighting()
    return
  }
  const q = query.toLowerCase()
  const matchedIds = new Set()

  Object.values(nodeDataMap).forEach(n => {
    const searchable = [n.label, n.title, n.pi, n.wg, n.project_type].filter(Boolean).join(' ').toLowerCase()
    if (searchable.includes(q)) matchedIds.add(n.id)
  })

  if (matchedIds.size === 0) {
    resetHighlighting()
    return
  }

  nodeElements.attr('opacity', d => matchedIds.has(d.id) ? 1 : 0.04)
  linkElements.attr('stroke-opacity', d => {
    const sid = typeof d.source === 'object' ? d.source.id : d.source
    const tid = typeof d.target === 'object' ? d.target.id : d.target
    return matchedIds.has(sid) && matchedIds.has(tid) ? 0.2 : 0.005
  })
  labelElements.attr('opacity', d => matchedIds.has(d.id) ? 1 : 0.04)
}

function resetHighlighting() {
  if (!nodeElements) return
  nodeElements.attr('opacity', 1)
  linkElements.attr('stroke-opacity', 0.08)
  labelElements.attr('opacity', 1)
}

function resetAll() {
  activeWg.value = null
  searchQuery.value = ''
  selectedNode.value = null
  selectionPanel.show = false
  tooltip.show = false
  resetHighlighting()
}

let searchTimeout = null
function onSearch() {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    activeWg.value = null
    selectedNode.value = null
    selectionPanel.show = false
    highlightSearch(searchQuery.value)
  }, 200)
}

function zoomIn() {
  if (svgSelection && zoomBehavior) {
    svgSelection.transition().duration(300).call(zoomBehavior.scaleBy, 1.4)
  }
}
function zoomOut() {
  if (svgSelection && zoomBehavior) {
    svgSelection.transition().duration(300).call(zoomBehavior.scaleBy, 0.7)
  }
}
function zoomReset() {
  if (svgSelection && zoomBehavior) {
    const svg = svgRef.value
    const w = svg.clientWidth
    const h = svg.clientHeight
    svgSelection.transition().duration(500).call(
      zoomBehavior.transform,
      d3.zoomIdentity.translate(w / 2, h / 2).scale(0.6)
    )
  }
}

async function loadD3() {
  if (window.d3) {
    d3 = window.d3
    return
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js'
    script.onload = () => {
      d3 = window.d3
      resolve()
    }
    script.onerror = reject
    document.head.appendChild(script)
  })
}

async function initGraph() {
  const svg = svgRef.value
  if (!svg || !d3) return

  const width = svg.clientWidth
  const height = svg.clientHeight

  const data = graphData.value
  const nodes = data.nodes.map(n => ({ ...n }))
  const edges = data.edges.map(e => ({ ...e }))

  const nodeMap = {}
  nodes.forEach(n => { nodeMap[n.id] = n })
  nodeDataMap = nodeMap

  const adjRaw = {}
  edges.forEach(e => {
    const sid = typeof e.source === 'object' ? e.source.id : e.source
    const tid = typeof e.target === 'object' ? e.target.id : e.target
    if (!adjRaw[sid]) adjRaw[sid] = []
    if (!adjRaw[tid]) adjRaw[tid] = []
    adjRaw[sid].push(tid)
    adjRaw[tid].push(sid)
  })
  edgeIndex = adjRaw

  const wgNodes = nodes.filter(n => n.type === 'working_group')
  const angleStep = (2 * Math.PI) / wgNodes.length
  const clusterRadius = Math.min(width, height) * 0.3
  wgNodes.forEach((n, i) => {
    n.fx = clusterRadius * Math.cos(angleStep * i)
    n.fy = clusterRadius * Math.sin(angleStep * i)
  })

  const wgPositions = {}
  wgNodes.forEach(n => { wgPositions[n.id] = { x: n.fx, y: n.fy } })

  nodes.forEach(n => {
    if (n.type === 'project') {
      const wgId = 'working_group_' + (n.wg || 'Others').split(',')[0].trim().replace(/ /g, '_')
      const wgPos = wgPositions[wgId] || { x: 0, y: 0 }
      n.x = wgPos.x + (Math.random() - 0.5) * 200
      n.y = wgPos.y + (Math.random() - 0.5) * 200
    } else if (n.type !== 'working_group') {
      n.x = (Math.random() - 0.5) * width * 0.8
      n.y = (Math.random() - 0.5) * height * 0.8
    }
  })

  const projectWgTarget = {}
  nodes.forEach(n => {
    if (n.type === 'project') {
      const wgId = 'working_group_' + (n.wg || 'Others').split(',')[0].trim().replace(/ /g, '_')
      const wgPos = wgPositions[wgId]
      if (wgPos) projectWgTarget[n.id] = wgPos
    }
  })

  simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(edges)
      .id(d => d.id)
      .distance(d => {
        if (d.type === 'BELONGS_TO') return 30
        if (d.type === 'PI_OF') return 50
        if (d.type === 'USES_INSTRUMENT') return 70
        return 90
      })
      .strength(d => {
        if (d.type === 'BELONGS_TO') return 0.4
        if (d.type === 'PI_OF') return 0.03
        return 0.015
      })
    )
    .force('charge', d3.forceManyBody()
      .strength(d => {
        if (d.type === 'working_group') return -800
        if (d.type === 'instrument') return -60
        if (d.type === 'project') return -5
        if (d.type === 'researcher') return -3
        return -10
      })
    )
    .force('center', d3.forceCenter(0, 0).strength(0.02))
    .force('collision', d3.forceCollide()
      .radius(d => getNodeRadius(d) + 0.5)
      .strength(0.3)
    )
    .force('clusterX', d3.forceX(d => {
      const t = projectWgTarget[d.id]
      return t ? t.x : 0
    }).strength(d => d.type === 'project' ? 0.08 : 0.01))
    .force('clusterY', d3.forceY(d => {
      const t = projectWgTarget[d.id]
      return t ? t.y : 0
    }).strength(d => d.type === 'project' ? 0.08 : 0.01))
    .stop()

  const totalTicks = 300
  for (let i = 0; i < totalTicks; i++) {
    simulation.tick()
  }

  svgSelection = d3.select(svg)
  svgSelection.selectAll('*').remove()

  svgSelection.on('click', (event) => {
    if (event.target === svg) resetAll()
  })

  const defs = svgSelection.append('defs')
  const glowFilter = defs.append('filter')
    .attr('id', 'glow')
    .attr('x', '-50%').attr('y', '-50%')
    .attr('width', '200%').attr('height', '200%')
  glowFilter.append('feGaussianBlur')
    .attr('stdDeviation', '6')
    .attr('result', 'blur')
  glowFilter.append('feMerge')
    .selectAll('feMergeNode')
    .data(['blur', 'SourceGraphic'])
    .join('feMergeNode')
    .attr('in', d => d)

  gContainer = svgSelection.append('g')

  zoomBehavior = d3.zoom()
    .scaleExtent([0.1, 8])
    .on('zoom', (event) => {
      currentTransform = event.transform
      gContainer.attr('transform', event.transform)
    })

  svgSelection.call(zoomBehavior)
  // Disable scroll-wheel zoom so page scrolling works normally
  svgSelection.on('wheel.zoom', null)

  const initialTransform = d3.zoomIdentity.translate(width / 2, height / 2).scale(0.6)
  svgSelection.call(zoomBehavior.transform, initialTransform)
  currentTransform = initialTransform

  linkElements = gContainer.append('g')
    .attr('class', 'links')
    .selectAll('line')
    .data(edges)
    .join('line')
    .attr('x1', d => d.source.x)
    .attr('y1', d => d.source.y)
    .attr('x2', d => d.target.x)
    .attr('y2', d => d.target.y)
    .attr('stroke', '#a8a29e')
    .attr('stroke-opacity', 0.12)
    .attr('stroke-width', 0.4)

  gContainer.append('g')
    .attr('class', 'wg-glows')
    .selectAll('circle')
    .data(nodes.filter(n => n.type === 'working_group'))
    .join('circle')
    .attr('cx', d => d.x)
    .attr('cy', d => d.y)
    .attr('r', 35)
    .attr('fill', d => getNodeColor(d))
    .attr('fill-opacity', 0.1)
    .attr('filter', 'url(#glow)')
    .style('pointer-events', 'none')

  nodeElements = gContainer.append('g')
    .attr('class', 'nodes')
    .selectAll('circle')
    .data(nodes)
    .join('circle')
    .attr('cx', d => d.x)
    .attr('cy', d => d.y)
    .attr('r', d => getNodeRadius(d))
    .attr('fill', d => getNodeColor(d))
    .attr('fill-opacity', d => {
      if (d.type === 'project') return 0.7
      if (d.type === 'researcher') return 0.4
      if (d.type === 'working_group') return 1
      return 0.8
    })
    .attr('stroke', d => d.type === 'working_group' ? getNodeColor(d) : 'none')
    .attr('stroke-width', d => d.type === 'working_group' ? 2 : 0)
    .attr('stroke-opacity', 0.4)
    .style('cursor', 'pointer')
    .on('mouseenter', handleMouseEnter)
    .on('mousemove', handleMouseMove)
    .on('mouseleave', handleMouseLeave)
    .on('click', handleNodeClick)

  const labeledNodes = nodes.filter(n => n.type === 'working_group' || n.type === 'instrument')

  labelElements = gContainer.append('g')
    .attr('class', 'labels')
    .selectAll('text')
    .data(labeledNodes)
    .join('text')
    .attr('x', d => d.x)
    .attr('y', d => d.y + getNodeRadius(d) + 12)
    .attr('text-anchor', 'middle')
    .attr('fill', d => d.type === 'working_group' ? '#44403c' : '#78716c')
    .attr('font-size', d => d.type === 'working_group' ? '11px' : '8px')
    .attr('font-weight', d => d.type === 'working_group' ? '600' : '400')
    .attr('font-family', 'system-ui, -apple-system, sans-serif')
    .text(d => d.label)
    .style('pointer-events', 'none')
}

function handleMouseEnter(event, d) {
  const info = formatTooltip(d)
  const svgRect = svgRef.value.getBoundingClientRect()
  const x = event.clientX - svgRect.left + 15
  const y = event.clientY - svgRect.top - 10

  tooltip.show = true
  tooltip.x = x
  tooltip.y = y
  tooltip.type = info.type
  tooltip.title = info.title
  tooltip.details = info.details
  tooltip.count = info.count
  tooltip.color = info.color

  d3.select(event.currentTarget)
    .attr('stroke', '#1c1917')
    .attr('stroke-width', 2)
    .attr('stroke-opacity', 0.6)
}

function handleMouseMove(event) {
  const svgRect = svgRef.value.getBoundingClientRect()
  let x = event.clientX - svgRect.left + 15
  let y = event.clientY - svgRect.top - 10
  if (x + 320 > svgRect.width) x = x - 340
  if (y + 150 > svgRect.height) y = y - 100
  tooltip.x = x
  tooltip.y = y
}

function handleMouseLeave(event, d) {
  tooltip.show = false
  d3.select(event.currentTarget)
    .attr('stroke', d.type === 'working_group' ? getNodeColor(d) : 'none')
    .attr('stroke-width', d.type === 'working_group' ? 2 : 0)
    .attr('stroke-opacity', d.type === 'working_group' ? 0.4 : 0)
}

function handleNodeClick(event, d) {
  event.stopPropagation()
  if (d.type === 'project') return
  highlightNode(d.id)
}

onMounted(async () => {
  startLoadingSequence()
  try {
    const [_, dataRes] = await Promise.all([
      loadD3(),
      fetch('/data/graph.json').then(r => r.json())
    ])
    graphData.value = dataRes
    dataReady = true
    await loadingComplete
    loading.value = false
    await nextTick()
    initGraph()
  } catch (err) {
    console.error('Failed to load graph data:', err)
    loading.value = false
  }
})

onBeforeUnmount(() => {
  if (simulation) simulation.stop()
  stopLoadingSequence()
})
</script>

<style scoped>
:deep(svg) {
  user-select: none;
}
</style>
