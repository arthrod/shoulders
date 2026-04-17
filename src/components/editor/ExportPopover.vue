<template>
  <Teleport to="body">
    <div v-if="visible" class="export-popover-backdrop" @mousedown.self="$emit('close')"></div>
    <div v-if="visible" class="export-popover" :style="posStyle">
      <div class="export-popover-header">
        <span>Export</span>
        <button class="export-close" @click="$emit('close')">&times;</button>
      </div>

      <!-- Format toggle -->
      <div class="export-format-toggle">
        <button :class="{ active: format === 'word' }" @click="format = 'word'">Word</button>
        <button :class="{ active: format === 'pdf' }" @click="format = 'pdf'">PDF</button>
        <button v-if="fileIsQmd" :class="{ active: format === 'html' }" @click="format = 'html'">HTML</button>
      </div>

      <!-- Engine toggle (hidden for .qmd — always Quarto) -->
      <div v-if="!fileIsQmd" class="export-engine-row">
        <label class="export-label" style="margin-top: 0;">Engine</label>
        <div class="export-engine-toggle">
          <button
            :class="{ active: engine === 'shoulders' }"
            @click="engine = 'shoulders'"
          >
            Shoulders
          </button>
          <button
            :class="{ active: engine === 'quarto', disabled: !quartoAvailable }"
            :disabled="!quartoAvailable"
            @click="quartoAvailable && (engine = 'quarto')"
            :title="quartoAvailable ? 'Render with Quarto CLI' : 'Install Quarto from quarto.org'"
          >
            Quarto
            <span v-if="!quartoAvailable" class="export-engine-unavailable">not found</span>
          </button>
        </div>
      </div>

      <!-- Quarto not installed warning (for .qmd only) -->
      <div v-if="fileIsQmd && !quartoAvailable" class="export-quarto-missing">
        Quarto not installed — install from <strong>quarto.org</strong> or run <code>brew install --cask quarto</code>
      </div>

      <!-- ═══ Shoulders engine controls ═══ -->
      <template v-if="engine === 'shoulders'">
        <!-- Template (PDF only) -->
        <template v-if="format === 'pdf'">
          <label class="export-label">Template</label>
          <div class="export-templates">
            <button
              v-for="t in shouldersTemplates"
              :key="t.id"
              class="export-template-btn"
              :class="{ active: local.template === t.id }"
              @click="local.template = t.id"
              :title="t.desc"
            >
              {{ t.label }}
            </button>
          </div>
        </template>

        <!-- Font -->
        <label class="export-label">Font</label>
        <select v-model="local.font" class="export-select">
          <option v-for="f in shouldersFontOptions" :key="f" :value="f">{{ f }}</option>
        </select>

        <!-- Settings row -->
        <div class="export-row mt-2">
          <div class="export-col">
            <label class="export-label">Size</label>
            <select v-model.number="local.font_size" class="export-select">
              <option v-for="s in fontSizes" :key="s" :value="s">{{ s }}pt</option>
            </select>
          </div>
          <div class="export-col">
            <label class="export-label">Page</label>
            <select v-model="local.page_size" class="export-select">
              <option value="a4">A4</option>
              <option value="us-letter">US Letter</option>
              <option value="a5">A5</option>
            </select>
          </div>
          <div class="export-col">
            <label class="export-label">Margins</label>
            <select v-model="local.margins" class="export-select">
              <option value="narrow">Narrow</option>
              <option value="normal">Normal</option>
              <option value="wide">Wide</option>
            </select>
          </div>
          <div v-if="format === 'pdf'" class="export-col">
            <label class="export-label">Spacing</label>
            <select v-model="local.spacing" class="export-select">
              <option value="compact">Compact</option>
              <option value="normal">Normal</option>
              <option value="relaxed">Relaxed</option>
            </select>
          </div>
        </div>
      </template>

      <!-- ═══ Quarto engine controls ═══ -->
      <template v-if="engine === 'quarto'">
        <!-- Reference document (Word only) -->
        <template v-if="format === 'word'">
          <label class="export-label">Template</label>
          <div class="export-templates">
            <button
              class="export-template-btn"
              :class="{ active: !local.reference_doc }"
              @click="local.reference_doc = null"
            >
              Default
            </button>
            <button
              v-for="t in quartoTemplates"
              :key="t.relativePath"
              class="export-template-btn"
              :class="{ active: local.reference_doc === t.relativePath }"
              @click="local.reference_doc = t.relativePath"
              :title="t.relativePath"
            >
              {{ t.name }}
            </button>
          </div>
          <p v-if="!quartoTemplates.length && !local.reference_doc" class="export-hint">
            Drop .docx templates into .project/templates/
          </p>
        </template>

        <!-- Font + layout settings (not for HTML — irrelevant) -->
        <template v-if="format !== 'html'">
          <label class="export-label">
            Font
            <span v-if="hasReferenceDoc" class="export-label-note">via template</span>
          </label>
          <select v-model="local.font" class="export-select" :disabled="hasReferenceDoc">
            <option v-for="f in quartoFontOptions" :key="f" :value="f">{{ f }}</option>
          </select>

          <div class="export-row mt-2">
            <div class="export-col">
              <label class="export-label">
                Size
                <span v-if="hasReferenceDoc" class="export-label-note">via template</span>
              </label>
              <select v-model.number="local.font_size" class="export-select" :disabled="hasReferenceDoc">
                <option v-for="s in fontSizes" :key="s" :value="s">{{ s }}pt</option>
              </select>
            </div>
            <div class="export-col">
              <label class="export-label">Page</label>
              <select v-model="local.page_size" class="export-select">
                <option value="a4">A4</option>
                <option value="us-letter">US Letter</option>
                <option value="a5">A5</option>
              </select>
            </div>
            <div class="export-col">
              <label class="export-label">
                Margins
                <span v-if="hasReferenceDoc" class="export-label-note">via template</span>
              </label>
              <select v-model="local.margins" class="export-select" :disabled="hasReferenceDoc">
                <option value="narrow">Narrow</option>
                <option value="normal">Normal</option>
                <option value="wide">Wide</option>
              </select>
            </div>
          </div>
        </template>

        <!-- Quarto-specific toggles (apply to all formats) -->
        <div class="export-toggles mt-2">
          <label class="export-toggle">
            <input type="checkbox" v-model="local.toc">
            <span>Table of contents</span>
          </label>
          <label class="export-toggle">
            <input type="checkbox" v-model="local.number_sections">
            <span>Number sections</span>
          </label>
        </div>
      </template>

      <!-- Export button -->
      <button class="export-btn" @click="doExport" :disabled="fileIsQmd && !quartoAvailable">
        {{ exportLabel }}
      </button>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  anchorRect: { type: Object, default: null },
  pdfSettings: { type: Object, default: () => ({}) },
  wordSettings: { type: Object, default: () => ({}) },
  quartoAvailable: { type: Boolean, default: false },
  quartoSettings: { type: Object, default: () => ({}) },
  quartoTemplates: { type: Array, default: () => [] },
  defaultEngine: { type: String, default: 'shoulders' },
  fileIsQmd: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'export'])

const format = ref('word')
const engine = ref('shoulders')

// Sync engine + format when popover opens
watch(() => props.visible, (vis) => {
  if (!vis) return
  if (props.fileIsQmd) {
    engine.value = 'quarto'
    // Restore last-used format for .qmd
    if (props.quartoSettings?.format) {
      const fmt = props.quartoSettings.format
      format.value = fmt === 'docx' ? 'word' : fmt
    }
  } else {
    engine.value = props.quartoAvailable ? props.defaultEngine : 'shoulders'
  }
})

// ── Shoulders engine options ──────────────────────────────────

const shouldersTemplates = [
  { id: 'clean', label: 'Clean', desc: 'Minimal, no numbering — good for notes and drafts' },
  { id: 'academic', label: 'Academic', desc: 'Numbered sections, indented paragraphs — papers and essays' },
  { id: 'report', label: 'Report', desc: 'Numbered sections, page numbers, chapter breaks' },
  { id: 'letter', label: 'Letter', desc: 'Left-aligned, no justification — correspondence' },
  { id: 'compact', label: 'Compact', desc: 'Two-column, small font — reference sheets and handouts' },
]

const PDF_FONTS = ['STIX Two Text', 'Lora', 'Times New Roman', 'Inter', 'Arial']
const DOCX_FONTS = ['Calibri', 'Times New Roman', 'Arial', 'Georgia', 'Cambria']
const QUARTO_FONTS = ['Calibri', 'Times New Roman', 'Arial', 'Georgia', 'Cambria', 'STIX Two Text', 'Lora', 'Inter']
const fontSizes = [9, 10, 10.5, 11, 11.5, 12, 13, 14]

const shouldersFontOptions = computed(() => format.value === 'pdf' ? PDF_FONTS : DOCX_FONTS)
const quartoFontOptions = QUARTO_FONTS

// ── Quarto engine helpers ─────────────────────────────────────

const hasReferenceDoc = computed(() => engine.value === 'quarto' && !!local.reference_doc)

// ── Local settings (reactive copy synced from props) ──────────

const local = reactive({})

watch([format, engine, () => props.pdfSettings, () => props.wordSettings, () => props.quartoSettings], () => {
  if (engine.value === 'quarto') {
    Object.assign(local, props.quartoSettings)
  } else if (format.value === 'pdf') {
    Object.assign(local, props.pdfSettings)
  } else {
    Object.assign(local, props.wordSettings)
  }
  // Ensure font is valid for current engine/format
  const fonts = engine.value === 'quarto' ? quartoFontOptions : shouldersFontOptions.value
  if (local.font && !fonts.includes(local.font)) {
    local.font = fonts[0]
  }
}, { immediate: true })

// ── Positioning ───────────────────────────────────────────────

const posStyle = ref({})
watch(() => [props.visible, props.anchorRect], () => {
  if (!props.visible || !props.anchorRect) return
  const r = props.anchorRect
  const popoverWidth = 320
  const margin = 8
  const maxLeft = window.innerWidth - popoverWidth - margin
  posStyle.value = {
    position: 'fixed',
    top: (r.bottom + 6) + 'px',
    left: Math.min(maxLeft, Math.max(margin, r.left - 120)) + 'px',
    zIndex: 10000,
  }
}, { immediate: true })

// ── Export ─────────────────────────────────────────────────────

const exportLabel = computed(() => {
  const fmtLabel = format.value === 'pdf' ? 'PDF' : format.value === 'html' ? 'HTML' : 'Word'
  if (props.fileIsQmd) return `Export ${fmtLabel}`
  return engine.value === 'quarto' ? `Export ${fmtLabel} via Quarto` : `Export ${fmtLabel}`
})

function doExport() {
  emit('export', { format: format.value, engine: engine.value, ...local })
}
</script>

<style>
.export-popover-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9999;
}

.export-popover {
  width: 320px;
  background: rgb(var(--bg-secondary));
  border: 1px solid rgb(var(--border));
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  font-size: 12px;
  color: rgb(var(--fg-primary));
}

.export-popover-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  font-weight: 600;
  font-size: 13px;
}

.export-close {
  background: none;
  border: none;
  color: rgb(var(--fg-muted));
  font-size: 16px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}
.export-close:hover { color: rgb(var(--fg-primary)); }

.export-format-toggle {
  display: flex;
  border: 1px solid rgb(var(--border));
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 8px;
}
.export-format-toggle button {
  flex: 1;
  padding: 5px 0;
  font-size: 12px;
  font-weight: 500;
  border: none;
  background: transparent;
  color: rgb(var(--fg-muted));
  cursor: pointer;
  transition: all 0.15s;
}
.export-format-toggle button:not(:last-child) {
  border-right: 1px solid rgb(var(--border));
}
.export-format-toggle button.active {
  background: rgb(var(--accent));
  color: #fff;
}

/* Engine toggle — same visual pattern, slightly smaller */
.export-engine-row {
  margin-bottom: 10px;
}
.export-engine-toggle {
  display: flex;
  border: 1px solid rgb(var(--border));
  border-radius: 6px;
  overflow: hidden;
  margin-top: 4px;
}
.export-engine-toggle button {
  flex: 1;
  padding: 4px 0;
  font-size: 11px;
  font-weight: 500;
  border: none;
  background: transparent;
  color: rgb(var(--fg-muted));
  cursor: pointer;
  transition: all 0.15s;
  position: relative;
}
.export-engine-toggle button:first-child {
  border-right: 1px solid rgb(var(--border));
}
.export-engine-toggle button.active {
  background: rgb(var(--bg-primary));
  color: rgb(var(--fg-primary));
  font-weight: 600;
}
.export-engine-toggle button.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.export-engine-unavailable {
  display: block;
  font-size: 9px;
  font-weight: 400;
  opacity: 0.6;
  line-height: 1;
  margin-top: 1px;
}

/* Quarto not installed warning */
.export-quarto-missing {
  font-size: 11px;
  color: rgb(var(--fg-muted));
  background: color-mix(in srgb, rgb(var(--warning, #fbbf24)) 10%, rgb(var(--bg-primary)));
  border: 1px solid color-mix(in srgb, rgb(var(--warning, #fbbf24)) 30%, transparent);
  border-radius: 4px;
  padding: 6px 8px;
  margin-bottom: 8px;
  line-height: 1.4;
}
.export-quarto-missing code {
  font-size: 10px;
  background: rgba(0, 0, 0, 0.15);
  padding: 1px 4px;
  border-radius: 2px;
}

.export-label {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgb(var(--fg-muted));
  margin: 8px 0 4px;
}

.export-label-note {
  font-size: 9px;
  text-transform: none;
  letter-spacing: 0;
  opacity: 0.5;
  font-style: italic;
}

.export-hint {
  font-size: 10px;
  color: rgb(var(--fg-muted));
  opacity: 0.6;
  margin: 4px 0 0;
  font-style: italic;
}

.export-templates {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.export-template-btn {
  padding: 2px 4px;
  border-radius: 4px;
  border: 1px solid rgb(var(--border));
  background: rgb(var(--bg-primary));
  color: rgb(var(--fg-muted));
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}
.export-template-btn:hover {
  border-color: rgb(var(--fg-muted));
  color: rgb(var(--fg-primary));
}
.export-template-btn.active {
  border-color: rgb(var(--accent));
  color: rgb(var(--accent));
  background: color-mix(in srgb, rgb(var(--accent)) 10%, rgb(var(--bg-primary)));
}

.export-select {
  width: 100%;
  padding: 5px 8px;
  border-radius: 4px;
  border: 1px solid rgb(var(--border));
  background: rgb(var(--bg-primary));
  color: rgb(var(--fg-primary));
  font-size: 12px;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
}
.export-select:focus {
  border-color: rgb(var(--accent));
}
.export-select:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.export-row {
  display: flex;
  gap: 8px;
}

.export-col {
  flex: 1;
  min-width: 0;
}

/* Quarto-specific toggles */
.export-toggles {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.export-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 12px;
  color: rgb(var(--fg-primary));
}
.export-toggle input[type="checkbox"] {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border: 1px solid rgb(var(--border));
  background: rgb(var(--bg-primary));
  cursor: pointer;
  accent-color: rgb(var(--accent));
}

.export-btn {
  width: 100%;
  margin-top: 12px;
  padding: 7px;
  border-radius: 5px;
  border: none;
  background: rgb(var(--accent));
  color: #fff;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
}
.export-btn:hover {
  opacity: 0.9;
}
.export-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
