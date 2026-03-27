import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { useWorkspaceStore } from './workspace'

const DEFAULTS = {
  font: 'Calibri',
  font_size: 11,
  page_size: 'a4',
  margins: 'normal',
}

export const useDocxExportStore = defineStore('docxExport', {
  state: () => ({
    exporting: {},      // { [path]: 'exporting' | 'done' | 'error' }
    docxSettings: {},   // { [relativePath]: DocxSettings }
  }),

  actions: {
    getSettings(mdPath) {
      const workspace = useWorkspaceStore()
      const rel = workspace.path ? mdPath.replace(workspace.path + '/', '') : mdPath
      return { ...DEFAULTS, ...(this.docxSettings[rel] || {}) }
    },

    setSettings(mdPath, settings) {
      const workspace = useWorkspaceStore()
      const rel = workspace.path ? mdPath.replace(workspace.path + '/', '') : mdPath
      this.docxSettings[rel] = { ...this.getSettings(mdPath), ...settings }
      this.persistSettings()
    },

    async loadSettings() {
      const workspace = useWorkspaceStore()
      if (!workspace.projectDir) return
      try {
        const content = await invoke('read_file', {
          path: `${workspace.projectDir}/docx-settings.json`,
        })
        this.docxSettings = JSON.parse(content)
      } catch {
        // No settings file yet — use defaults
      }
    },

    async persistSettings() {
      const workspace = useWorkspaceStore()
      if (!workspace.projectDir) return
      try {
        await invoke('write_file', {
          path: `${workspace.projectDir}/docx-settings.json`,
          content: JSON.stringify(this.docxSettings, null, 2),
        })
      } catch (e) {
        console.error('Failed to save DOCX settings:', e)
      }
    },

    /**
     * Export a markdown file to DOCX.
     * @param {string} mdPath — absolute path to the .md file
     * @param {string} content — markdown content
     * @param {object} options — { references, citationStyle, workspacePath, settings }
     * @returns {{ success: boolean, docxPath: string, duration_ms: number }}
     */
    async exportToDocx(mdPath, content, options = {}) {
      this.exporting[mdPath] = 'exporting'
      const start = performance.now()

      try {
        const title = mdPath.split('/').pop()?.replace(/\.\w+$/, '') || 'Document'
        const { exportMarkdownToDocx } = await import('../services/docxExport')
        const blob = await exportMarkdownToDocx(content, { ...options, title })

        const { blobToBase64 } = await import('../utils/docxBridge')
        const base64 = await blobToBase64(blob)
        const docxPath = mdPath.replace(/\.\w+$/, '.docx')
        await invoke('write_file_base64', { path: docxPath, data: base64 })

        const duration_ms = Math.round(performance.now() - start)
        this.exporting[mdPath] = 'done'

        import('../services/telemetry').then(({ events }) => events.exportDocx?.()).catch(() => {})

        return { success: true, docxPath, duration_ms }
      } catch (e) {
        this.exporting[mdPath] = 'error'
        throw e
      }
    },
  },
})

export { DEFAULTS as DOCX_DEFAULTS }
