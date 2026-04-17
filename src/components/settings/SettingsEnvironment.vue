<template>
  <div>
    <h3 class="settings-section-title">System</h3>
    <p class="settings-hint">System tools and compilers detected on your machine.</p>

    <div class="env-languages">
      <div v-for="lang in envLanguages" :key="lang.key" class="env-lang-card">
        <div class="env-lang-header">
          <span class="env-lang-dot" :class="envLangDotClass(lang)"></span>
          <span class="env-lang-name">{{ lang.label }}</span>
          <span v-if="lang.info.found" class="env-lang-version">{{ lang.info.version || '' }}</span>
          <span v-else class="env-lang-missing">Not found</span>
        </div>

        <div v-if="lang.info.found" class="env-lang-details">
          <div class="env-lang-path">{{ lang.info.path }}</div>
          <div class="env-lang-kernel-row">
            <span>Jupyter kernel</span>
            <span v-if="lang.info.hasKernel" class="env-kernel-badge env-kernel-yes">Installed</span>
            <template v-else>
              <span class="env-kernel-badge env-kernel-no">Not installed</span>
              <button
                class="env-install-btn"
                :disabled="envStore.installing === lang.key"
                @click="envStore.installKernel(lang.key)"
              >
                {{ envStore.installing === lang.key ? 'Installing...' : 'Install' }}
              </button>
            </template>
          </div>
        </div>

        <div v-else class="env-lang-hint">{{ envStore.installHint(lang.key) }}</div>

        <div v-if="envStore.installing === lang.key && envStore.installError" class="env-install-error">
          {{ envStore.installError }}
        </div>
      </div>
    </div>

    <div class="env-actions">
      <button class="env-redetect-btn" :disabled="envStore.detecting" @click="envStore.detect()">
        {{ envStore.detecting ? 'Detecting...' : 'Re-detect' }}
      </button>
      <span v-if="!envStore.detected" class="env-hint-text">Not yet detected</span>
      <span v-else class="env-hint-text">Last detected this session</span>
    </div>

    <!-- Terminal Shell -->
    <h3 class="settings-section-title" style="margin-top: 24px;">Terminal</h3>
    <p class="settings-hint">Choose which shell to use for the integrated terminal. Applies to new terminals.</p>

    <div class="env-lang-card">
      <div class="env-lang-header">
        <span class="env-lang-dot good"></span>
        <span class="env-lang-name">Shell</span>
        <span class="env-lang-version">{{ currentShellLabel }}</span>
      </div>
      <div class="env-lang-details" v-if="availableShells.length > 0">
        <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;">
          <button
            v-for="s in availableShells"
            :key="s.path"
            class="env-install-btn"
            :style="isActiveShell(s.path) ? { background: 'rgb(var(--accent))', color: '#fff', borderColor: 'rgb(var(--accent))' } : {}"
            @click="selectShell(s.path)"
          >{{ s.label }}</button>
        </div>
        <div class="env-lang-path" style="margin-top: 6px;">{{ effectiveShellPath }}</div>
      </div>
    </div>

    <!-- LaTeX Compiler -->
    <h3 class="settings-section-title" style="margin-top: 24px;">LaTeX Compiler</h3>
    <p class="settings-hint">Tectonic compiles .tex files to PDF. A one-time download is required.</p>

    <div class="env-lang-card">
      <!-- Installed state -->
      <template v-if="latexStore.tectonicInstalled">
        <div class="env-lang-header">
          <span class="env-lang-dot" :class="latexStore.tectonicEnabled ? 'good' : 'none'"></span>
          <span class="env-lang-name">Tectonic</span>
          <span v-if="latexStore.tectonicEnabled" class="env-lang-version">Installed</span>
          <span v-else class="env-lang-missing">Disabled</span>
          <div style="flex: 1;"></div>
          <button
            class="tool-toggle-switch"
            :class="{ on: latexStore.tectonicEnabled }"
            @click="latexStore.setTectonicEnabled(!latexStore.tectonicEnabled)"
          >
            <span class="tool-toggle-knob"></span>
          </button>
        </div>
        <div class="env-lang-details">
          <div class="env-lang-path">{{ latexStore.tectonicPath }}</div>
        </div>
      </template>

      <!-- Downloading state -->
      <template v-else-if="latexStore.downloading">
        <div class="env-lang-header">
          <span class="env-lang-dot warn"></span>
          <span class="env-lang-name">Tectonic</span>
          <span class="env-lang-version">Downloading... {{ latexStore.downloadProgress }}%</span>
        </div>
        <div class="tectonic-progress" style="margin: 8px 16px 4px;">
          <div class="tectonic-progress-bar">
            <div class="tectonic-progress-fill" :style="{ width: latexStore.downloadProgress + '%' }"></div>
          </div>
        </div>
      </template>

      <!-- Not installed state -->
      <template v-else>
        <div class="env-lang-header">
          <span class="env-lang-dot none"></span>
          <span class="env-lang-name">Tectonic</span>
          <span class="env-lang-missing">Not installed</span>
        </div>
        <div class="env-lang-hint" style="margin-top: 4px; padding-left: 16px;">
          PDF compilation for LaTeX requires Tectonic, a modern TeX engine. One-time ~15MB download.
        </div>
        <div style="padding-left: 16px; margin-top: 8px;">
          <button class="env-install-btn" @click="latexStore.downloadTectonic()">
            Download Tectonic
          </button>
        </div>
      </template>

      <!-- Error state -->
      <div v-if="latexStore.downloadError" class="env-install-error" style="margin: 6px 16px;">
        {{ latexStore.downloadError }}
        <button class="env-install-btn" style="margin-left: 8px;" @click="latexStore.downloadTectonic()">
          Retry
        </button>
      </div>
    </div>

    <!-- Quarto -->
    <h3 class="settings-section-title" style="margin-top: 24px;">Quarto</h3>
    <p class="settings-hint">Render .qmd, .md, and .rmd files to Word and PDF via Quarto CLI.</p>

    <div class="env-lang-card">
      <div class="env-lang-header">
        <span class="env-lang-dot" :class="quartoAvailable ? 'good' : 'none'"></span>
        <span class="env-lang-name">Quarto</span>
        <span v-if="quartoAvailable" class="env-lang-version">{{ quartoVersion || 'Installed' }}</span>
        <span v-else class="env-lang-missing">Not found</span>
      </div>
      <div v-if="quartoAvailable && quartoPath" class="env-lang-details">
        <div class="env-lang-path">{{ quartoPath }}</div>
      </div>
      <div v-else-if="!quartoAvailable" class="env-lang-hint" style="margin-top: 4px; padding-left: 16px;">
        Install from <strong>quarto.org</strong> or run <code style="font-size: 10px;">brew install --cask quarto</code>
      </div>
    </div>

    <!-- Word Bridge -->
    <h3 class="settings-section-title" style="margin-top: 24px;">Word Bridge</h3>
    <p class="settings-hint">Connect Microsoft Word to Shoulders for AI-powered editing and commenting.</p>

    <div class="env-lang-card">
      <!-- Checking state -->
      <template v-if="wordBridgeStatus.checking">
        <div class="env-lang-header">
          <span class="env-lang-dot none"></span>
          <span class="env-lang-name">Word Bridge</span>
          <span class="env-lang-missing">Checking...</span>
        </div>
      </template>

      <!-- Ready state -->
      <template v-else-if="wordBridgeStatus.manifest_installed">
        <div class="env-lang-header">
          <span class="env-lang-dot" :class="wordBridgeStatus.running ? 'good' : 'warn'"></span>
          <span class="env-lang-name">Word Bridge</span>
          <span v-if="wordBridgeStatus.running" class="env-lang-version">Running</span>
          <span v-else class="env-lang-missing">Installed (server stopped)</span>
        </div>
        <div class="env-lang-details">
          <div class="env-lang-path">
            Server: {{ wordBridgeStatus.running ? 'listening on port 3001' : 'not running' }}
            · Certs: {{ wordBridgeStatus.certs_exist ? 'OK' : 'missing' }}
            · Connected: {{ wordFileCount }} file{{ wordFileCount !== 1 ? 's' : '' }}
          </div>
          <div class="env-lang-kernel-row" style="margin-top: 4px;">
            <span style="line-height: 1.4;">In Word: <strong>Insert</strong> → click <strong>▾</strong> next to Add-ins → <strong>Shoulders</strong></span>
          </div>
        </div>
        <div style="padding-left: 16px; margin-top: 8px; margin-bottom: 4px;">
          <button
            class="env-install-btn"
            :class="{ 'env-install-btn--success': wordBridgeSetupDone }"
            :disabled="wordBridgeSettingUp || wordBridgeSetupDone"
            @click="setupWordBridge"
          >
            {{ wordBridgeSettingUp ? 'Setting up...' : wordBridgeSetupDone ? 'Done!' : 'Reinstall' }}
          </button>
        </div>
      </template>

      <!-- Not set up state -->
      <template v-else>
        <div class="env-lang-header">
          <span class="env-lang-dot none"></span>
          <span class="env-lang-name">Word Bridge</span>
          <span class="env-lang-missing">Not set up</span>
        </div>
        <div class="env-lang-hint" style="margin-top: 4px; padding-left: 16px;">
          Connect Microsoft Word to Shoulders for AI-powered editing and commenting.
        </div>
        <div style="padding-left: 16px; margin-top: 8px; margin-bottom: 4px;">
          <button
            class="env-install-btn"
            :class="{ 'env-install-btn--success': wordBridgeSetupDone }"
            :disabled="wordBridgeSettingUp || wordBridgeSetupDone"
            @click="setupWordBridge"
          >
            {{ wordBridgeSettingUp ? 'Setting up...' : wordBridgeSetupDone ? 'Done!' : 'Set Up Word Bridge' }}
          </button>
        </div>
      </template>

      <!-- Error state -->
      <div v-if="wordBridgeError" class="env-install-error" style="margin: 6px 16px;">
        {{ wordBridgeError }}
        <button class="env-install-btn" style="margin-left: 8px;" :disabled="wordBridgeSettingUp" @click="setupWordBridge">
          Retry
        </button>
      </div>

      <!-- Setup log -->
      <div v-if="wordBridgeLog.length > 0" style="margin: 6px 16px 4px; padding: 6px 8px; border-radius: 4px; background: rgb(var(--bg-primary)); font-family: var(--font-mono); font-size: 10px; max-height: 120px; overflow-y: auto;">
        <div v-for="(entry, i) in wordBridgeLog" :key="i" :style="{ color: entry.isError ? 'rgb(var(--error))' : 'rgb(var(--fg-muted))' }">
          <span style="opacity: 0.5;">{{ entry.time }}</span> {{ entry.msg }}
        </div>
      </div>
    </div>

    <!-- Tool Server -->
    <h3 class="settings-section-title" style="margin-top: 24px;">Tool Server</h3>
    <p class="settings-hint">Expose workspace tools as a local HTTP API for Claude Code and other CLI tools.</p>

    <div class="env-lang-card">
      <div class="env-lang-header">
        <span class="env-lang-name">Enable tool server</span>
        <div style="flex: 1;"></div>
        <button
          class="tool-toggle-switch"
          :class="{ on: toolServerOn }"
          @click="toggleToolServer"
        >
          <span class="tool-toggle-knob"></span>
        </button>
      </div>
    </div>

    <!-- Telemetry -->
    <h3 class="settings-section-title" style="margin-top: 24px;">Analytics</h3>
    <p class="settings-hint">Help improve Shoulders by sharing anonymous usage data.</p>

    <div class="env-lang-card">
      <div class="env-lang-header">
        <span class="env-lang-name">Share usage analytics</span>
        <div style="flex: 1;"></div>
        <button
          class="tool-toggle-switch"
          :class="{ on: telemetryOn }"
          @click="toggleTelemetry"
        >
          <span class="tool-toggle-knob"></span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useEnvironmentStore } from '../../stores/environment'
import { useLatexStore } from '../../stores/latex'
import { useWorkspaceStore } from '../../stores/workspace'
import { isTelemetryEnabled, setTelemetryEnabled } from '../../services/telemetry'
import { defaultShell, isMac } from '../../platform'
import { wordFiles } from '../../services/wordBridge'

const envStore = useEnvironmentStore()
const latexStore = useLatexStore()
const workspace = useWorkspaceStore()

// Quarto detection
const quartoAvailable = ref(false)
const quartoVersion = ref('')
const quartoPath = ref('')
const telemetryOn = ref(isTelemetryEnabled())
const toolServerOn = ref(localStorage.getItem('toolServerEnabled') !== 'false')

// Terminal shell preference
const availableShells = ref([])

const effectiveShellPath = computed(() => {
  if (workspace.terminalShell) return workspace.terminalShell
  return defaultShell().cmd
})

const currentShellLabel = computed(() => effectiveShellPath.value.split('/').pop())

function isActiveShell(path) {
  if (!workspace.terminalShell) return path === defaultShell().cmd
  return path === workspace.terminalShell
}

function selectShell(path) {
  // If selecting the platform default, clear the override
  workspace.setTerminalShell(path === defaultShell().cmd ? '' : path)
}

async function detectShells() {
  const candidates = isMac
    ? ['/bin/zsh', '/bin/bash', '/bin/sh', '/opt/homebrew/bin/fish', '/usr/local/bin/fish', '/opt/homebrew/bin/nu', '/usr/local/bin/nu']
    : ['/bin/bash', '/bin/zsh', '/bin/sh', '/usr/bin/fish', '/usr/local/bin/fish', '/usr/bin/nu', '/usr/local/bin/nu']
  const found = []
  const seen = new Set()
  for (const path of candidates) {
    try {
      const exists = await invoke('path_exists', { path })
      if (!exists) continue
      const label = path.split('/').pop()
      if (seen.has(label)) continue
      seen.add(label)
      found.push({ path, label })
    } catch { /* skip */ }
  }
  availableShells.value = found
}

// Word Bridge
const wordBridgeStatus = ref({ checking: true, certs_exist: false, manifest_installed: false, running: false })
const wordBridgeSettingUp = ref(false)
const wordBridgeSetupDone = ref(false)
const wordBridgeError = ref('')
const wordFileCount = computed(() => {
  let count = 0
  for (const entry of wordFiles.values()) {
    if (entry.connected) count++
  }
  return count
})

async function checkWordBridge() {
  try {
    const status = await invoke('addin_is_setup')
    wordBridgeStatus.value = { checking: false, ...status }
  } catch {
    wordBridgeStatus.value = { checking: false, certs_exist: false, manifest_installed: false, running: false }
  }
}

const wordBridgeLog = ref([])

function wbLog(msg, isError = false) {
  console.log(`[wordBridge] ${msg}`)
  wordBridgeLog.value.push({ msg, isError, time: new Date().toLocaleTimeString() })
  if (wordBridgeLog.value.length > 20) wordBridgeLog.value.shift()
}

async function setupWordBridge() {
  wordBridgeSettingUp.value = true
  wordBridgeSetupDone.value = false
  wordBridgeError.value = ''
  wordBridgeLog.value = []
  wbLog('Starting setup...')
  try {
    wbLog('Generating certs + trusting CA + installing manifest...')
    const result = await invoke('addin_setup')
    wbLog(`Setup result: ${result}`)
    wbLog('Checking status...')
    await checkWordBridge()
    const s = wordBridgeStatus.value
    wbLog(`Status: certs=${s.certs_exist}, manifest=${s.manifest_installed}, running=${s.running}`)

    // Tag all .docx files in the workspace for AutoShow
    const workspace = useWorkspaceStore()
    if (workspace.path) {
      wbLog('Scanning workspace for .docx files...')
      try {
        const tagResult = await invoke('addin_tag_workspace', { workspacePath: workspace.path })
        wbLog(`Tagged ${tagResult.tagged.length} files, ${tagResult.skipped.length} already tagged`)
        if (tagResult.errors.length > 0) {
          wbLog(`${tagResult.errors.length} files had errors`, true)
        }
      } catch (e) {
        wbLog(`Tagging error: ${e?.message || e}`, true)
      }
    }
    wbLog('Done.')
    wordBridgeSettingUp.value = false
    wordBridgeSetupDone.value = true
    setTimeout(() => { wordBridgeSetupDone.value = false }, 2000)
  } catch (e) {
    const msg = e === 'Setup canceled by user' ? 'Canceled by user' : (e?.message || String(e))
    wbLog(`Error: ${msg}`, true)
    wordBridgeError.value = e === 'Setup canceled by user' ? '' : msg
    wordBridgeSettingUp.value = false
  }
}

function toggleTelemetry() {
  telemetryOn.value = !telemetryOn.value
  setTelemetryEnabled(telemetryOn.value)
}

async function toggleToolServer() {
  toolServerOn.value = !toolServerOn.value
  localStorage.setItem('toolServerEnabled', String(toolServerOn.value))
  if (toolServerOn.value) {
    invoke('tool_server_start').catch(() => {})
    const { initToolServer } = await import('../../services/toolServer')
    initToolServer(workspace)
  } else {
    invoke('tool_server_stop').catch(() => {})
    const { destroyToolServer } = await import('../../services/toolServer')
    destroyToolServer()
  }
}

const envLanguages = computed(() => [
  { key: 'python', label: 'Python', info: envStore.languages.python },
  { key: 'r', label: 'R', info: envStore.languages.r },
  { key: 'julia', label: 'Julia', info: envStore.languages.julia },
])

function envLangDotClass(lang) {
  if (lang.info.hasKernel) return 'good'
  if (lang.info.found) return 'warn'
  return 'none'
}

async function detectQuarto() {
  try {
    quartoAvailable.value = await invoke('is_quarto_available')
    if (quartoAvailable.value) {
      const result = await invoke('run_shell_command', { cwd: '.', command: 'quarto --version' })
      const ver = (typeof result === 'string' ? result : result?.stdout || '').trim()
      if (ver) quartoVersion.value = ver
      const which = await invoke('run_shell_command', { cwd: '.', command: 'which quarto' })
      const p = (typeof which === 'string' ? which : which?.stdout || '').trim()
      if (p) quartoPath.value = p
    }
  } catch {
    quartoAvailable.value = false
  }
}

onMounted(() => {
  if (!envStore.detected) envStore.detect()
  latexStore.checkTectonic()
  checkWordBridge()
  detectShells()
  detectQuarto()
})
</script>

<style scoped>
.env-languages {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.env-lang-details {
  margin-top: 6px;
  padding-left: 16px;
}

.env-lang-path {
  font-size: 10px;
  color: rgb(var(--fg-muted));
  font-family: var(--font-mono);
  margin-bottom: 6px;
}

.env-lang-kernel-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: rgb(var(--fg-secondary));
}

.env-kernel-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  font-weight: 500;
}

.env-kernel-yes {
  background: rgba(80, 250, 123, 0.1);
  color: rgb(var(--success, #50fa7b));
}

.env-kernel-no {
  background: rgba(226, 185, 61, 0.1);
  color: rgb(var(--warning, #e2b93d));
}

.env-install-btn {
  padding: 2px 10px;
  border-radius: 4px;
  border: 1px solid rgb(var(--accent));
  background: rgba(122, 162, 247, 0.1);
  color: rgb(var(--accent));
  font-size: 10px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.env-install-btn:hover {
  background: rgba(122, 162, 247, 0.2);
}

.env-install-btn:disabled {
  opacity: 0.5;
  cursor: wait;
}

.env-install-btn--success {
  border-color: rgb(var(--success));
  background: rgba(var(--success), 0.15);
  color: rgb(var(--success));
  opacity: 1 !important;
  cursor: default;
}

.env-install-error {
  margin-top: 6px;
  padding: 4px 8px;
  border-radius: 4px;
  background: rgba(247, 118, 142, 0.1);
  color: rgb(var(--error));
  font-size: 10px;
}

.env-actions {
  margin-top: 16px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.env-redetect-btn {
  padding: 5px 14px;
  border-radius: 5px;
  border: 1px solid rgb(var(--border));
  background: rgb(var(--bg-primary));
  color: rgb(var(--fg-secondary));
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}

.env-redetect-btn:hover {
  border-color: rgb(var(--fg-muted));
  color: rgb(var(--fg-primary));
}

.env-redetect-btn:disabled {
  opacity: 0.5;
  cursor: wait;
}

.env-hint-text {
  font-size: 10px;
  color: rgb(var(--fg-muted));
}

.tectonic-progress-bar {
  height: 4px;
  border-radius: 2px;
  background: rgb(var(--bg-primary));
  overflow: hidden;
}

.tectonic-progress-fill {
  height: 100%;
  background: rgb(var(--accent));
  transition: width 0.2s ease;
}
</style>
