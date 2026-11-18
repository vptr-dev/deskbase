import { download } from './util'
import { migrate } from '../../../main/migrations'
import { type AiConfig, type ChatMessage, listOpenAiModels, providerInfo, streamOllama, streamOpenAi } from '../../../shared/ai-core'
import type { ImportResult, NotionPageInfo } from '../../../shared/import-types'

export interface AppInfo {
  version: string
  platform: string
  micaSupported: boolean
  material: 'mica' | 'acrylic' | 'none'
  dataPath: string
  packaged: boolean
}

export type UpdateStatus =
  | { state: 'idle' | 'checking' | 'none' | 'dev' }
  | { state: 'available' | 'ready'; version: string }
  | { state: 'downloading'; percent: number }
  | { state: 'error'; message: string }

export interface Bridge {
  info(): Promise<AppInfo>
  load(): Promise<{ data: any; migratedFrom: number | null; path: string; error?: string }>
  save(data: unknown): Promise<boolean>
  saveSync(data: unknown): boolean
  exportFile(text: string, name: string): Promise<string | null>
  importFile(): Promise<any>
  listBackups(): Promise<{ name: string; date: string; size: number; mtime: number }[]>
  createBackup(): Promise<string | null>
  readBackup(name: string): Promise<any>
  openDataFolder(): Promise<void>
  setTheme(t: string): Promise<boolean>
  setMaterial(m: string): Promise<boolean>
  notify(title: string, body: string): Promise<void>
  alwaysOnTop(on: boolean): Promise<boolean>
  loginItem(on?: boolean): Promise<boolean>
  setShell(p: { closeToTray?: boolean; quickAddHotkey?: boolean }): Promise<{ closeToTray: boolean; hotkey: boolean }>
  quickAddDone(added: boolean): Promise<void>
  onQuickAdd(cb: () => void): () => void
  openExternal(url: string): Promise<void>
  ai: {
    getConfig(): Promise<AiConfig>
    setConfig(patch: Partial<AiConfig> & { key?: string | null }): Promise<AiConfig>
    models(): Promise<string[]>
    detect(): Promise<{ provider: AiConfig['provider']; models: string[] }[]>
    chat(id: string, system: string, messages: ChatMessage[]): Promise<string>
    abort(id: string): Promise<void>
    onChunk(cb: (id: string, text: string, thinking?: boolean) => void): () => void
  }
  notion: {
    available(): Promise<boolean>
    list(): Promise<NotionPageInfo[]>
    importPages(ids: string[]): Promise<ImportResult>
    importExport(): Promise<ImportResult | null>
  }
  updater: {
    status(): Promise<UpdateStatus>
    check(): Promise<void>
    install(): Promise<void>
    onStatus(cb: (s: UpdateStatus) => void): () => void
  }
}

const KEY = 'planner:data'
const AI_KEY = 'planner:ai'

// Browser preview: talks to local OpenAI-compatible servers directly (Ollama allows localhost origins).
const webAi = (() => {
  const listeners = new Set<(id: string, t: string, thinking?: boolean) => void>()
  const ctrls = new Map<string, AbortController>()
  const read = (): AiConfig & { key?: string } => {
    try { return { provider: 'ollama', baseUrl: providerInfo('ollama').baseUrl, model: '', enabled: true, hasKey: false, ...JSON.parse(localStorage.getItem(AI_KEY) ?? '{}') } } catch { return { provider: 'ollama', baseUrl: providerInfo('ollama').baseUrl, model: '', enabled: true, hasKey: false } }
  }
  const pub = (c: AiConfig & { key?: string }): AiConfig => ({ provider: c.provider, baseUrl: c.baseUrl, model: c.model, enabled: c.enabled, hasKey: Boolean(c.key) })
  return {
    getConfig: async () => {
      const c = read()
      if (!c.model) {
        try { const m = await listOpenAiModels(c.baseUrl, undefined, c.provider); if (m[0]) { c.model = m[0]; localStorage.setItem(AI_KEY, JSON.stringify(c)) } } catch { /* none */ }
      }
      return pub(c)
    },
    setConfig: async (patch: any) => {
      const c: any = { ...read(), ...patch }
      if (patch.key === null) delete c.key
      try { localStorage.setItem(AI_KEY, JSON.stringify(c)) } catch { /* ignore */ }
      return pub(c)
    },
    models: async () => { const c = read(); return listOpenAiModels(c.baseUrl, c.key, c.provider) },
    detect: async () => {
      const out: { provider: AiConfig['provider']; models: string[] }[] = []
      for (const p of ['ollama', 'lmstudio'] as const) { try { out.push({ provider: p, models: await listOpenAiModels(providerInfo(p).baseUrl, undefined, p) }) } catch { /* not running */ } }
      return out
    },
    chat: async (id: string, system: string, messages: ChatMessage[]) => {
      const c = read()
      if (c.provider === 'anthropic') throw new Error('Anthropic works in the desktop app.')
      const ctrl = new AbortController()
      ctrls.set(id, ctrl)
      try {
        const onText = (t: string): void => listeners.forEach((l) => l(id, t))
        const onThinking = (): void => listeners.forEach((l) => l(id, '', true))
        if (c.provider === 'ollama') return await streamOllama({ baseUrl: c.baseUrl, model: c.model, system, messages, signal: ctrl.signal, onText, onThinking })
        return await streamOpenAi({ baseUrl: c.baseUrl, key: c.key, model: c.model, system, messages, signal: ctrl.signal, onText: (t) => listeners.forEach((l) => l(id, t)), onThinking: () => listeners.forEach((l) => l(id, '', true)) })
      } catch (e) { if (ctrl.signal.aborted) return ''; throw e } finally { ctrls.delete(id) }
    },
    abort: async (id: string) => { ctrls.get(id)?.abort() },
    onChunk: (cb: (id: string, t: string, thinking?: boolean) => void) => { listeners.add(cb); return () => { listeners.delete(cb) } }
  }
})()

/** Fallback used when the UI runs in a plain browser (development preview). */
const browserBridge: Bridge = {
  info: async () => ({ version: 'dev', platform: 'web', micaSupported: false, material: 'none', dataPath: 'localStorage', packaged: false }),
  load: async () => {
    try {
      const t = localStorage.getItem(KEY)
      if (!t) return { data: null, migratedFrom: null, path: 'localStorage' }
      const m = migrate(JSON.parse(t))
      return { data: m.data, migratedFrom: m.changed ? m.from : null, path: 'localStorage' }
    } catch {
      return { data: null, migratedFrom: null, path: 'localStorage' }
    }
  },
  save: async (d) => {
    try { localStorage.setItem(KEY, JSON.stringify(d)) } catch { /* ignore */ }
    return true
  },
  saveSync: (d) => {
    try { localStorage.setItem(KEY, JSON.stringify(d)) } catch { /* ignore */ }
    return true
  },
  exportFile: async (text, name) => { download(name, text); return name },
  importFile: () =>
    new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.json'
      input.onchange = async () => {
        const f = input.files?.[0]
        if (!f) return resolve(null)
        try { resolve(JSON.parse(await f.text())) } catch { resolve(null) }
      }
      input.click()
    }),
  listBackups: async () => [],
  createBackup: async () => null,
  readBackup: async () => null,
  openDataFolder: async () => {},
  setTheme: async () => true,
  setMaterial: async () => true,
  notify: async (title, body) => {
    try {
      if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body })
    } catch { /* ignore */ }
  },
  alwaysOnTop: async (on) => on,
  loginItem: async () => false,
  setShell: async () => ({ closeToTray: false, hotkey: false }),
  quickAddDone: async () => {},
  onQuickAdd: () => () => {},
  openExternal: async (url) => { window.open(url, '_blank') },
  ai: webAi,
  notion: {
    available: async () => false,
    list: async () => [],
    importPages: async () => ({ pages: [], stats: { pages: 0, blocks: 0, todos: 0, tasks: 0, tables: 0, skipped: 0, missing: 0 }, warnings: ['Notion import works in the desktop app.'] }),
    importExport: async () => null
  },
  updater: {
    status: async () => ({ state: 'dev' }),
    check: async () => {},
    install: async () => {},
    onStatus: () => () => {}
  }
}

export const api: Bridge = (window as any).api ?? browserBridge
export const isDesktop = Boolean((window as any).api)
