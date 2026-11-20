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
  displays(): Promise<DisplayInfo[]>
  onOpenPage(cb: (id: string) => void): () => void
  showMain(): Promise<void>
  launch(target: string): Promise<boolean>
  win: {
    control(action: 'min' | 'max' | 'close'): Promise<void>
    isMax(): Promise<boolean>
    onMax(cb: (max: boolean) => void): () => void
  }
  sysStats(drive?: string): Promise<SysStats>
  places(q: string): Promise<Place[]>
  weather(lat: number, lon: number, fahrenheit: boolean): Promise<any>
  desk: {
    active(on: boolean, spaces?: { id: string; name: string }[], current?: string): Promise<void>
    prepare(spec: DeskSpec): Promise<Rect>
    show(id: string): Promise<void>
    update(spec: DeskSpec): Promise<void>
    close(id: string): Promise<void>
    edit(on: boolean): Promise<void>
    drag(id: string, phase: 'start' | 'move', x: number, y: number, mode: 'move' | 'resize', free: boolean, grid: number): void
    dragEnd(id: string): Promise<(Rect & { id: string })[]>
    bounds(id: string): Promise<Rect | null>
    menu(id: string, items: DeskMenuItem[]): Promise<string | null>
    focus(id: string): Promise<void>
    onClosed(cb: (id: string) => void): () => void
    onCommand(cb: (id: string, cmd: string) => void): () => void
  }
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

const KEY = 'deskbase:data'
const AI_KEY = 'deskbase:ai'
const OLD_KEY = 'planner:data'

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
      const t = localStorage.getItem(KEY) ?? localStorage.getItem(OLD_KEY)
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
  displays: async () => {
    const w = window.screen.width
    const h = window.screen.height
    return [{ id: 1, label: 'This screen', primary: true, width: w, height: h, scale: 1, bounds: { x: 0, y: 0, width: w, height: h }, workArea: { x: 0, y: 0, width: w, height: h - 48 } }]
  },
  onOpenPage: () => () => {},
  showMain: async () => {},
  launch: async (t) => { if (/^https?:/i.test(t)) window.open(t, '_blank'); return true },
  win: { control: async () => {}, isMax: async () => false, onMax: () => () => {} },
  // Preview stand-ins: fixed numbers, no network.
  sysStats: async () => ({ cpu: 29, ram: 61, ramUsed: 9.8e9, ramTotal: 16e9, disk: 63, diskFree: 180e9, diskTotal: 480e9, uptime: 36000 }),
  places: async (q: string) => (q.trim() ? [{ name: q.trim(), region: '', country: 'Preview', lat: 52.33, lon: -0.18 }] : []),
  weather: async () => {
    const day = (i: number): string => new Date(Date.now() + i * 864e5).toISOString().slice(0, 10)
    const days = Array.from({ length: 7 }, (_, i) => day(i))
    return {
      current: { temperature_2m: 7, apparent_temperature: 5, weather_code: 45, is_day: 1, wind_speed_10m: 9, relative_humidity_2m: 93 },
      hourly: { time: Array.from({ length: 24 }, (_, i) => new Date(Date.now() + i * 3600e3).toISOString().slice(0, 13) + ':00'), temperature_2m: Array.from({ length: 24 }, (_, i) => Math.round(6 + 3 * Math.sin(i / 4))), weather_code: Array.from({ length: 24 }, (_, i) => [2, 3, 61, 1][i % 4]), precipitation_probability: Array.from({ length: 24 }, (_, i) => (i * 7) % 60), is_day: Array.from({ length: 24 }, (_, i) => (i > 6 && i < 17 ? 1 : 0)) },
      daily: { time: days, weather_code: [45, 2, 0, 3, 2, 61, 1], temperature_2m_max: [6, 9, 8, 8, 7, 10, 9], temperature_2m_min: [1, -2, 1, 1, 2, 4, 3], sunrise: days.map((d) => d + 'T07:28'), sunset: days.map((d) => d + 'T16:04'), precipitation_probability_max: [20, 5, 0, 10, 15, 70, 10] }
    }
  },
  desk: {
    active: async () => {},
    prepare: async (s) => ({ x: s.x, y: s.y, width: s.w, height: s.h }),
    show: async () => {},
    update: async () => {},
    close: async () => {},
    edit: async () => {},
    drag: () => {},
    dragEnd: async () => [],
    bounds: async () => null,
    menu: async () => null,
    focus: async () => {},
    onClosed: () => () => {},
    onCommand: () => () => {}
  },
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

export interface Rect { x: number; y: number; width: number; height: number }
export interface DisplayInfo { id: number; label: string; primary: boolean; width: number; height: number; scale: number; bounds: Rect; workArea: Rect }
export interface DeskSpec { id: string; x: number; y: number; w: number; h: number; displayId?: number | null; material: 'glass' | 'blur' | 'acrylic' | 'tint' | 'clear'; layer: 'desktop' | 'normal' | 'top'; radius: number; clickThrough: boolean; title: string; group?: string | null }
export interface SysStats { cpu: number; ram: number; ramUsed: number; ramTotal: number; disk: number; diskFree: number; diskTotal: number; uptime: number }
export interface Place { name: string; region: string; country: string; lat: number; lon: number }
export interface DeskMenuItem { id: string; label: string; checked?: boolean; type?: 'separator'; role?: 'cut' | 'copy' | 'paste'; submenu?: { id: string; label: string; checked?: boolean }[] }
