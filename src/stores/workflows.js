import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { nanoid } from './utils'
import { useWorkspaceStore } from './workspace'

// Custom tool callbacks — outside Pinia (transient promise map, like chatInstances in chat.js)
const _customToolCallbacks = new Map() // callId → { resolve, reject }

export const useWorkflowsStore = defineStore('workflows', {
  state: () => ({
    // Discovery
    workflows: [],        // Array<WorkflowDefinition>

    // Active runs
    runs: {},             // { [runId]: RunState }
    activeRunIds: {},     // { [workflowId]: runId } — persists across tab switches

    // Event listeners (for cleanup)
    _listeners: {},       // { [runId]: [unlisten functions] }
  }),

  getters: {
    getRun: (state) => (runId) => state.runs[runId],

    workflowsByCategory: (state) => {
      const groups = {}
      for (const w of state.workflows) {
        const cat = w.category || 'Other'
        if (!groups[cat]) groups[cat] = []
        groups[cat].push(w)
      }
      return groups
    },

    availableWorkflows: (state) => state.workflows.filter(w => !w.draft),
  },

  actions: {
    // ─── Discovery ─────────────────────────────────────────────────

    async discoverWorkflows() {
      const workspace = useWorkspaceStore()
      if (!workspace.path) return

      const locations = [
        { dir: `${workspace.projectDir}/workflows`, source: 'project' },
        { dir: `${workspace.globalConfigDir}/workflows`, source: 'global' },
      ]

      const workflows = []
      for (const { dir, source } of locations) {
        if (!dir) continue
        try {
          const exists = await invoke('path_exists', { path: dir })
          if (!exists) continue

          // read_dir_recursive returns a tree; we only want top-level dirs
          const entries = await invoke('read_dir_recursive', { path: dir })
          for (const entry of entries) {
            if (!entry.is_dir) continue

            const workflowDir = entry.path || `${dir}/${entry.name}`
            const jsonPath = `${workflowDir}/workflow.json`
            const hasJson = await invoke('path_exists', { path: jsonPath })
            if (!hasJson) continue

            try {
              const content = await invoke('read_file', { path: jsonPath })
              const config = JSON.parse(content)

              workflows.push({
                id: entry.name,
                name: config.name || entry.name,
                version: config.version || '0.0.0',
                description: config.description || '',
                category: config.category || 'Other',
                draft: config.draft || false,
                inputs: config.inputs || {},
                tools: config.tools || [],
                dir: workflowDir,
                source,
                hasCustomUI: await invoke('path_exists', { path: `${workflowDir}/ui.html` }),
                hasReadme: await invoke('path_exists', { path: `${workflowDir}/README.md` }),
                minAppVersion: config.minAppVersion || null,
              })
            } catch (e) {
              console.warn(`Invalid workflow.json in ${entry.name}:`, e)
            }
          }
        } catch {
          // Location doesn't exist or isn't readable
        }
      }

      this.workflows = workflows
    },

    // ─── Run Lifecycle ─────────────────────────────────────────────

    async startRun(workflowId, userInputs = {}) {
      const workflow = this.workflows.find(w => w.id === workflowId)
      if (!workflow) throw new Error(`Workflow not found: ${workflowId}`)

      const runId = nanoid(12)
      this.activeRunIds[workflowId] = runId

      // Create run state
      this.runs[runId] = {
        id: runId,
        workflowId,
        workflow,
        status: 'running',
        inputs: userInputs,
        messages: [
          { type: 'receipt', workflowName: workflow.name, inputs: userInputs, description: workflow.description },
        ],
        currentStep: null,
        streamingText: '',
        startedAt: new Date(),
        completedAt: null,
        error: null,
        pendingInteraction: null,
      }

      // Set up event listeners
      await this._setupListeners(runId)

      // Resolve SDK path
      const sdkPath = await this._resolveSdkPath()

      // Build config for subprocess
      const configJson = JSON.stringify({
        tools: workflow.tools,
        workflowDir: workflow.dir,
        workflowName: workflow.name,
        runId,
      })

      // Spawn subprocess
      await invoke('workflow_spawn', {
        runId,
        workflowDir: workflow.dir,
        sdkPath,
        inputsJson: JSON.stringify(userInputs),
        configJson,
      })

      return runId
    },

    clearActiveRun(workflowId) {
      delete this.activeRunIds[workflowId]
    },

    async cancelRun(runId) {
      const run = this.runs[runId]
      if (!run || run.status !== 'running') return

      try {
        await invoke('workflow_kill', { runId })
      } catch {
        // Already dead
      }

      run.status = 'cancelled'
      run.completedAt = new Date()
      this._cleanupListeners(runId)
    },

    // ─── Event Listeners ───────────────────────────────────────────

    async _setupListeners(runId) {
      const unMessage = await listen(`workflow-message-${runId}`, (event) => {
        try {
          const msg = JSON.parse(event.payload.data)
          this._handleMessage(runId, msg)
        } catch (e) {
          console.error('Failed to parse workflow message:', e)
        }
      })

      const unExit = await listen(`workflow-exit-${runId}`, (event) => {
        this._handleExit(runId, event.payload.code)
      })

      const unStderr = await listen(`workflow-stderr-${runId}`, (event) => {
        console.warn(`[workflow ${runId} stderr]:`, event.payload.data)
      })

      this._listeners[runId] = [unMessage, unExit, unStderr]
    },

    _cleanupListeners(runId) {
      const listeners = this._listeners[runId]
      if (listeners) {
        listeners.forEach(unlisten => unlisten())
        delete this._listeners[runId]
      }
    },

    // ─── Message Dispatch ──────────────────────────────────────────

    async _handleMessage(runId, msg) {
      const run = this.runs[runId]
      if (!run) return

      switch (msg.type) {
        // === UI Progress ===
        case 'ui.step':
          this._handleStep(run, msg)
          break

        case 'ui.log':
          run.messages.push({ type: 'log', message: msg.message })
          break

        case 'ui.complete':
          this._handleStepComplete(run, msg)
          break

        case 'ui.finish':
          // Auto-complete current step if workflow didn't call ui.complete()
          if (run.currentStep) {
            this._handleStepComplete(run, { summary: '' })
          }
          run.messages.push({ type: 'finish', output: msg.output })
          run.status = 'completed'
          run.completedAt = new Date()
          break

        case 'ui.error':
          // Auto-complete current step
          if (run.currentStep) {
            this._handleStepComplete(run, { summary: '' })
          }
          run.messages.push({ type: 'error', message: msg.message })
          run.status = 'failed'
          run.error = msg.message
          run.completedAt = new Date()
          break

        // === AI Generate (tool loop runs here, not in SDK) ===
        case 'ai.generate':
          await this._handleAiGenerate(runId, msg)
          break

        // === Custom tool result (callback from subprocess) ===
        case 'custom_tool.result': {
          const cb = _customToolCallbacks.get(msg.id)
          if (cb) {
            _customToolCallbacks.delete(msg.id)
            cb.resolve(typeof msg.output === 'string' ? msg.output : JSON.stringify(msg.output))
          }
          break
        }

        // === Workspace Operations ===
        case 'workspace.readFile':
        case 'workspace.writeFile':
        case 'workspace.listFiles':
        case 'workspace.searchContent':
        case 'workspace.readReferences':
        case 'workspace.openFile':
        case 'workspace.addComments':
        case 'workspace.insertText':
        case 'workspace.addReference':
          await this._handleWorkspaceOp(runId, msg)
          break

        // === UI Interactions ===
        case 'ui.chat':
        case 'ui.confirm':
        case 'ui.approve':
        case 'ui.form':
        case 'ui.pickModel':
          this._handleInteraction(runId, msg)
          break
      }
    },

    _handleStep(run, msg) {
      // Complete previous step if any
      if (run.currentStep) {
        const stepMsg = run.messages.findLast(
          m => m.type === 'step' && m.name === run.currentStep.name && m.status === 'running'
        )
        if (stepMsg) {
          stepMsg.status = 'completed'
          stepMsg.completedAt = new Date()
        }
      }
      run.currentStep = { name: msg.name, startedAt: new Date() }
      run.streamingText = ''
      run.messages.push({
        type: 'step',
        name: msg.name,
        status: 'running',
        summary: '',
        startedAt: new Date(),
        completedAt: null,
      })
    },

    _handleStepComplete(run, msg) {
      if (run.currentStep) {
        const stepMsg = run.messages.findLast(
          m => m.type === 'step' && m.name === run.currentStep.name && m.status === 'running'
        )
        if (stepMsg) {
          stepMsg.status = 'completed'
          stepMsg.summary = msg.summary || ''
          stepMsg.completedAt = new Date()
        }
      }
      run.currentStep = null
    },

    _handleExit(runId, code) {
      const run = this.runs[runId]
      if (!run) return

      // If not already completed/failed/cancelled
      if (run.status === 'running') {
        if (code === 0) {
          // Normal exit without ui.finish — shouldn't happen but handle gracefully
          if (!run.messages.some(m => m.type === 'finish')) {
            run.status = 'completed'
          }
        } else {
          run.status = 'failed'
          run.error = `Process exited with code ${code}`
          if (!run.messages.some(m => m.type === 'error')) {
            run.messages.push({ type: 'error', message: `Workflow process exited with code ${code}` })
          }
        }
        run.completedAt = new Date()
      }

      this._cleanupListeners(runId)
    },

    // ─── AI Generate Handler (tool loop runs here) ─────────────────

    async _handleAiGenerate(runId, msg) {
      const run = this.runs[runId]
      if (!run) return

      try {
        const { createModel, buildProviderOptions, convertSdkUsage } = await import('../services/aiSdk.js')
        const { createTauriFetch } = await import('../services/tauriFetch.js')
        const { streamText, tool: defineTool, stepCountIs } = await import('ai')
        const { jsonSchema } = await import('ai')
        const { getAiTools } = await import('../services/chatTools.js')
        const { resolveApiAccess } = await import('../services/apiClient.js')
        const { getThinkingConfig } = await import('../services/chatModels.js')
        const { calculateCost } = await import('../services/tokenUsage.js')
        const workspace = useWorkspaceStore()

        // Resolve model
        const modelId = msg.model || workspace.selectedModelId || 'anthropic/claude-sonnet-4-5-20250514'
        const access = await resolveApiAccess({ modelId }, workspace)
        if (!access) throw new Error(`No API access for model: ${modelId}`)

        const provider = access.providerHint || access.provider
        const tauriFetch = createTauriFetch()
        const model = createModel(access, tauriFetch)

        // Provider options (thinking config, etc.) — same as chatTransport
        const modelEntry = workspace.modelsConfig?.models?.find(m => m.id === modelId)
        const thinkingConfig = getThinkingConfig(access.model, provider, modelEntry?.thinking)
        const providerOptions = buildProviderOptions(thinkingConfig, provider)

        // Build tools — all with execute functions (same objects chat uses)
        const allTools = getAiTools(workspace)
        const tools = {}

        for (const name of (msg.tools || [])) {
          if (allTools[name]) tools[name] = allTools[name]
        }

        // Custom tools — execute via IPC callback to subprocess
        for (const def of (msg.customToolDefs || [])) {
          tools[def.name] = defineTool({
            description: def.description,
            parameters: jsonSchema(def.parameters),
            execute: async (input) => {
              const callId = nanoid(8)
              return new Promise((resolve, reject) => {
                _customToolCallbacks.set(callId, { resolve, reject })
                invoke('workflow_respond', {
                  runId,
                  message: JSON.stringify({ type: 'custom_tool.execute', id: callId, name: def.name, input }),
                })
                setTimeout(() => {
                  if (_customToolCallbacks.has(callId)) {
                    _customToolCallbacks.delete(callId)
                    reject(new Error(`Custom tool ${def.name} timed out (5 min)`))
                  }
                }, 300000)
              })
            },
          })
        }

        // Add ai-output message for streaming display
        const aiMsg = { type: 'ai-output', role: 'assistant', parts: [] }
        run.messages.push(aiMsg)

        // Stream with full tool loop — same pattern as chatTransport.js
        const result = streamText({
          model,
          messages: [{ role: 'user', content: msg.prompt }],
          tools,
          system: msg.system || undefined,
          stopWhen: stepCountIs(15),
          providerOptions,
          onStepFinish(event) {
            if (event.usage) {
              const normalized = convertSdkUsage(event.usage, event.providerMetadata, provider)
              normalized.cost = calculateCost(normalized, access.model, access.provider)
              import('./usage').then(({ useUsageStore }) => {
                useUsageStore().record({
                  usage: normalized,
                  feature: 'workflow',
                  provider: access.provider,
                  modelId: access.model,
                })
              })
            }
          },
        })

        // Stream to UI
        let textAccum = ''
        const allToolCalls = []

        for await (const part of result.fullStream) {
          if (part.type === 'text-delta') {
            textAccum += part.text
            run.streamingText += part.text
            const textPart = aiMsg.parts.find(p => p.type === 'text')
            if (textPart) textPart.text = textAccum
            else aiMsg.parts.push({ type: 'text', text: textAccum })
          } else if (part.type === 'tool-call') {
            aiMsg.parts.push({
              type: `tool-${part.toolName}`,
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              state: 'input-available',
              input: part.args,
              output: null,
            })
            allToolCalls.push({ name: part.toolName, input: part.args })
          } else if (part.type === 'tool-result') {
            const toolPart = aiMsg.parts.find(p => p.toolCallId === part.toolCallId)
            if (toolPart) {
              toolPart.state = 'output-available'
              toolPart.output = part.result
            }
          }
        }

        const finalResult = await result
        const usage = finalResult.usage ? {
          inputTokens: finalResult.usage.promptTokens || 0,
          outputTokens: finalResult.usage.completionTokens || 0,
        } : {}

        // Send final result to subprocess
        await invoke('workflow_respond', {
          runId,
          message: JSON.stringify({
            type: 'ai.generate.done', id: msg.id,
            output: textAccum, toolCalls: allToolCalls, usage,
          }),
        })
        run.streamingText = ''
      } catch (e) {
        console.error(`[workflow ${runId}] ai.generate error:`, e)
        await invoke('workflow_respond', {
          runId,
          message: JSON.stringify({ type: 'ai.generate.error', id: msg.id, error: e.message }),
        })
      }
    },

    // ─── Workspace Operation Handler ───────────────────────────────

    async _handleWorkspaceOp(runId, msg) {
      try {
        let result = {}
        const workspace = useWorkspaceStore()

        switch (msg.type) {
          case 'workspace.readFile':
            result = { content: await invoke('read_file', { path: msg.path }) }
            break

          case 'workspace.writeFile':
            await invoke('write_file', { path: msg.path, content: msg.content })
            break

          case 'workspace.listFiles': {
            const tree = await invoke('read_dir_recursive', { path: msg.dir || workspace.path })
            const files = []
            const walk = (entries) => {
              for (const e of entries) {
                if (!e.is_dir) files.push(e.path || e.name)
                if (e.children) walk(e.children)
              }
            }
            walk(tree)
            result = { files }
            break
          }

          case 'workspace.searchContent':
            result = { results: await invoke('search_content', { path: workspace.path, query: msg.query }) }
            break

          case 'workspace.readReferences': {
            const { useReferencesStore } = await import('./references.js')
            const refs = useReferencesStore()
            result = { references: refs.references || [] }
            break
          }

          case 'workspace.openFile': {
            const { useEditorStore } = await import('./editor.js')
            const editor = useEditorStore()
            editor.openFile(msg.path)
            break
          }

          case 'workspace.addComments':
            // Route to comments store — deferred until CommentMargin is wired
            break

          case 'workspace.insertText': {
            const content = await invoke('read_file', { path: msg.path })
            const lines = content.split('\n')
            const line = msg.position?.line || 0
            const ch = msg.position?.ch || 0
            if (line < lines.length) {
              lines[line] = lines[line].slice(0, ch) + msg.text + lines[line].slice(ch)
            }
            await invoke('write_file', { path: msg.path, content: lines.join('\n') })
            break
          }

          case 'workspace.addReference': {
            const { useReferencesStore } = await import('./references.js')
            const refs = useReferencesStore()
            await refs.addReference(msg.entry)
            break
          }
        }

        await invoke('workflow_respond', {
          runId,
          message: JSON.stringify({ type: `${msg.type}.done`, id: msg.id, ...result }),
        })
      } catch (e) {
        console.error(`[workflow ${runId}] ${msg.type} error:`, e)
        await invoke('workflow_respond', {
          runId,
          message: JSON.stringify({ type: 'error', id: msg.id, error: e.message }),
        })
      }
    },

    // ─── User Interaction Handler ──────────────────────────────────

    _handleInteraction(runId, msg) {
      const run = this.runs[runId]
      if (!run) return

      run.pendingInteraction = {
        type: msg.type,
        id: msg.id,
        prompt: msg.prompt || msg.message || msg.title || '',
        details: msg.details || null,
        schema: msg.schema || null,
      }

      // Add interaction block to messages for display
      run.messages.push({
        type: 'interaction',
        kind: msg.type.replace('ui.', ''),
        prompt: msg.prompt || msg.message || msg.title || '',
        schema: msg.schema || null,
        details: msg.details || null,
        response: null,
      })
    },

    async respondToInteraction(runId, response) {
      const run = this.runs[runId]
      if (!run || !run.pendingInteraction) return

      const { type, id } = run.pendingInteraction
      let responseMsg = {}

      switch (type) {
        case 'ui.chat':
          responseMsg = { type: 'ui.chat.done', id, text: response }
          break
        case 'ui.confirm':
          responseMsg = { type: 'ui.confirm.done', id, confirmed: response }
          break
        case 'ui.approve':
          responseMsg = { type: 'ui.approve.done', id, result: response }
          break
        case 'ui.form':
          responseMsg = { type: 'ui.form.done', id, values: response }
          break
        case 'ui.pickModel':
          responseMsg = { type: 'ui.pickModel.done', id, modelId: response }
          break
      }

      await invoke('workflow_respond', {
        runId,
        message: JSON.stringify(responseMsg),
      })

      // Update the interaction message in display
      const interactionMsg = [...run.messages].reverse().find(m => m.type === 'interaction' && m.response === null)
      if (interactionMsg) {
        interactionMsg.response = response
      }

      run.pendingInteraction = null
    },

    // ─── Helpers ───────────────────────────────────────────────────

    async _resolveSdkPath() {
      // Rust command resolves via CARGO_MANIFEST_DIR (dev) or resource dir (prod)
      return await invoke('workflow_sdk_path')
    },

    // ─── Cleanup ───────────────────────────────────────────────────

    cleanup() {
      // Kill all running workflows
      for (const [runId, run] of Object.entries(this.runs)) {
        if (run.status === 'running') {
          invoke('workflow_kill', { runId }).catch(() => {})
        }
        this._cleanupListeners(runId)
      }
      this.runs = {}
      this.workflows = []
    },
  },
})
