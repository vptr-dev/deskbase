import { type ConnSpec, type FeedResult, feedUrl, githubItems, parseFeed, parseIcs } from '../../../shared/feeds'
import { download } from './util'
import { migrate } from '../../../main/migrations'
import { type AiConfig, type AiProvider, type ChatMessage, type ChatOptions, PROVIDERS, listOpenAiModels, providerInfo, streamOllama, streamOpenAi } from '../../../shared/ai-core'
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
  history: { list(id: string): Promise<PageVersion[]>; save(id: string, v: PageVersion): Promise<void> }
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
  /** Title, description, site name and icon of a web page, for bookmarks. */
  linkInfo(url: string): Promise<{ title?: string; desc?: string; site?: string; icon?: string }>
  win: {
    control(action: 'min' | 'max' | 'close'): Promise<void>
    isMax(): Promise<boolean>
    onMax(cb: (max: boolean) => void): () => void
  }
  sysStats(drive?: string): Promise<SysStats>
  netStats(): Promise<NetStats>
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
    backdrop(stamp?: string): Promise<Backdrop | { same: true } | null>
    onClosed(cb: (id: string) => void): () => void
    onCommand(cb: (id: string, cmd: string) => void): () => void
  }
  ai: {
    getConfig(): Promise<AiConfig>
    setConfig(patch: Partial<Pick<AiConfig, 'provider' | 'baseUrl' | 'model' | 'enabled'>> & { key?: string | null; target?: AiProvider }): Promise<AiConfig>
    models(provider?: AiProvider): Promise<string[]>
    detect(): Promise<{ provider: AiConfig['provider']; models: string[] }[]>
    chat(id: string, system: string, messages: ChatMessage[], opts?: ChatOptions & { effort?: 'low' | 'medium' | 'high' }): Promise<string>
    abort(id: string): Promise<void>
    onChunk(cb: (id: string, text: string, thinking?: boolean) => void): () => void
  }
  conn: {
    secrets(): Promise<string[]>
    setSecret(id: string, value: string | null): Promise<string[]>
    fetch(spec: ConnSpec, force?: boolean): Promise<FeedResult>
    notionList(id: string): Promise<NotionPageInfo[]>
    notionImport(id: string, ids: string[]): Promise<ImportResult>
    notionPush(id: string, op: { kind: 'todo'; block: string; checked: boolean } | { kind: 'checkbox'; page: string; prop: string; value: boolean }): Promise<void>
    todoistClose(id: string, task: string): Promise<void>
  }
  media: {
    watch(on: boolean): Promise<void>
    control(cmd: 'toggle' | 'next' | 'prev'): Promise<void>
    onState(cb: (s: MediaState) => void): () => void
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

// Browser preview: feeds are fetched straight from the page (works for servers that allow it).
const CONN_KEY = 'deskbase:conn'
const webSecrets = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(CONN_KEY) ?? '{}') } catch { return {} } }
const webConn: Bridge['conn'] = {
  secrets: async () => Object.keys(webSecrets()),
  setSecret: async (id, value) => { const s = webSecrets(); if (value) s[id] = value; else delete s[id]; localStorage.setItem(CONN_KEY, JSON.stringify(s)); return Object.keys(s) },
  fetch: async (spec) => {
    try {
      if (spec.kind === 'notion' || spec.kind === 'mail' || spec.kind === 'todoist') throw new Error('This connection works in the desktop app.')
      if (spec.kind === 'github') {
        const tok = webSecrets()[spec.id]
        const h: Record<string, string> = { Accept: 'application/vnd.github+json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }
        const get = async (p: string): Promise<any> => { const r = await fetch('https://api.github.com' + p, { headers: h }); if (!r.ok) throw new Error(`GitHub answered ${r.status}`); return r.json() }
        const items = spec.repos.length ? (await Promise.all(spec.repos.map(async (r) => githubItems(await get(`/repos/${r}/issues?state=open&per_page=40&sort=updated`), r)))).flat() : githubItems(await get('/issues?filter=all&state=open&per_page=60'))
        items.sort((a, b) => (b.date ?? 0) - (a.date ?? 0))
        return { ok: true, at: Date.now(), title: spec.repos.join(', '), items }
      }
      const r = await fetch(feedUrl(spec.url))
      if (!r.ok) throw new Error(`The server answered ${r.status}.`)
      const body = await r.text()
      if (spec.kind === 'calendar') { const now = Date.now(); const x = parseIcs(body, now - 62 * 86400000, now + 400 * 86400000); return { ok: true, at: now, title: x.title, events: x.events } }
      const x = parseFeed(body)
      return { ok: true, at: Date.now(), title: x.title, items: x.items.slice(0, 80) }
    } catch (e: any) { return { ok: false, at: Date.now(), error: e?.message ?? 'Could not load it' } }
  },
  notionList: async () => { throw new Error('Notion connections work in the desktop app.') },
  notionImport: async () => { throw new Error('Notion connections work in the desktop app.') },
  notionPush: async () => {},
  todoistClose: async () => {}
}

const KEY = 'deskbase:data'
const AI_KEY = 'deskbase:ai'
const OLD_KEY = 'planner:data'

// Browser preview: talks to local OpenAI-compatible servers directly (Ollama allows localhost origins).
const webAi = (() => {
  // The browser preview keeps its settings in local storage (keys only for local testing).
  type Slot = { baseUrl: string; model: string; key?: string }
  type W = { provider: AiProvider; enabled: boolean; slots: Partial<Record<AiProvider, Slot>> }
  const listeners = new Set<(id: string, t: string, thinking?: boolean) => void>()
  const ctrls = new Map<string, AbortController>()
  const read = (): W => {
    try { const j = JSON.parse(localStorage.getItem(AI_KEY) ?? '{}'); return { provider: j.provider ?? 'ollama', enabled: j.enabled !== false, slots: j.slots ?? (j.model ? { [j.provider ?? 'ollama']: { baseUrl: j.baseUrl, model: j.model, key: j.key } } : {}) } } catch { return { provider: 'ollama', enabled: true, slots: {} } }
  }
  const save = (w: W): void => { try { localStorage.setItem(AI_KEY, JSON.stringify(w)) } catch { /* ignore */ } }
  const slot = (w: W, p: AiProvider): Slot => { const i = providerInfo(p); const x = w.slots[p] ?? { baseUrl: i.baseUrl, model: i.defaultModel }; return { ...x, baseUrl: i.fixedUrl ? i.baseUrl : x.baseUrl || i.baseUrl } }
  const pub = (w: W): AiConfig => {
    const d = slot(w, w.provider)
    const providers = Object.fromEntries(PROVIDERS.map((p) => { const x = slot(w, p.id); return [p.id, { baseUrl: x.baseUrl, model: x.model, hasKey: Boolean(x.key) }] })) as AiConfig['providers']
    return { provider: w.provider, baseUrl: d.baseUrl, model: d.model, enabled: w.enabled, hasKey: Boolean(d.key), providers }
  }
  return {
    getConfig: async () => {
      const w = read()
      if (!slot(w, w.provider).model) {
        try { const m = await listOpenAiModels(slot(w, w.provider).baseUrl, undefined, w.provider); if (m[0]) { w.slots[w.provider] = { ...slot(w, w.provider), model: m[0] }; save(w) } } catch { /* none */ }
      }
      return pub(w)
    },
    setConfig: async (patch: any) => {
      const w = read()
      if (patch.provider) w.provider = patch.provider
      if (typeof patch.enabled === 'boolean') w.enabled = patch.enabled
      const t: AiProvider = patch.target ?? w.provider
      const sl = { ...slot(w, t), ...(w.slots[t] ?? {}) }
      if (typeof patch.baseUrl === 'string') sl.baseUrl = patch.baseUrl
      if (typeof patch.model === 'string') sl.model = patch.model
      if (patch.key === null) delete sl.key
      else if (typeof patch.key === 'string' && patch.key) sl.key = patch.key
      w.slots[t] = sl
      save(w)
      return pub(w)
    },
    models: async (p?: AiProvider) => { const w = read(); const pr = p ?? w.provider; const x = slot(w, pr); return listOpenAiModels(x.baseUrl, x.key, pr) },
    detect: async () => {
      const out: { provider: AiConfig['provider']; models: string[] }[] = []
      for (const p of ['ollama', 'lmstudio'] as const) { try { out.push({ provider: p, models: await listOpenAiModels(providerInfo(p).baseUrl, undefined, p) }) } catch { /* not running */ } }
      return out
    },
    chat: async (id: string, system: string, messages: ChatMessage[], opts: ChatOptions = {}) => {
      const w = read()
      const p = opts.provider ?? w.provider
      if (p === 'anthropic') throw new Error('Anthropic works in the desktop app.')
      const x = slot(w, p)
      const model = opts.model || x.model
      const ctrl = new AbortController()
      ctrls.set(id, ctrl)
      try {
        const onText = (t: string): void => listeners.forEach((l) => l(id, t))
        const onThinking = (): void => listeners.forEach((l) => l(id, '', true))
        const common = { model, system, messages, signal: ctrl.signal, onText, onThinking, temperature: opts.temperature, maxTokens: opts.maxTokens }
        if (p === 'ollama') return await streamOllama({ baseUrl: x.baseUrl, ...common })
        return await streamOpenAi({ baseUrl: x.baseUrl, key: x.key, ...common })
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
  history: {
    // In the browser preview, a few versions per page in local storage.
    list: async (id) => { try { return JSON.parse(localStorage.getItem('deskbase:history:' + id) ?? '[]') } catch { return [] } },
    save: async (id, v) => {
      try {
        const key = 'deskbase:history:' + id
        const list: PageVersion[] = JSON.parse(localStorage.getItem(key) ?? '[]')
        const last = list[list.length - 1]
        if (last && JSON.stringify(last.blocks) === JSON.stringify(v.blocks) && last.title === v.title) return
        localStorage.setItem(key, JSON.stringify([...list, v].slice(-10)))
      } catch { /* storage full */ }
    }
  },
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
  linkInfo: async (u) => { try { const h = new URL(u).hostname; return { site: h.replace(/^www\./, ''), icon: `https://${h}/favicon.ico` } } catch { return {} } },
  win: { control: async () => {}, isMax: async () => false, onMax: () => () => {} },
  // Preview stand-ins: fixed numbers, no network.
  netStats: async () => { const t = Date.now() / 1000; return { supported: true, down: 2.4e6 + Math.sin(t) * 1.6e6, up: 1.8e5 + Math.cos(t / 2) * 1.2e5, rx: 8.2e9, tx: 1.1e9, ip: '192.168.1.24', online: true } },
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
    backdrop: async () => null,
    onClosed: () => () => {},
    onCommand: () => () => {}
  },
  ai: webAi,
  conn: webConn,
  media: { watch: async () => {}, control: async () => {}, onState: () => () => {} },
  notion: {
    available: async () => false,
    list: async () => [],
    importPages: async () => ({ pages: [], stats: { pages: 0, blocks: 0, todos: 0, tasks: 0, tables: 0, databases: 0, rows: 0, skipped: 0, missing: 0 }, warnings: ['Notion import works in the desktop app.'] }),
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
export interface PageVersion { at: number; title: string; icon: string; blocks: any[] }
export interface Backdrop { stamp: string; displays: { id: number; url: string }[] }
export interface DisplayInfo { id: number; label: string; primary: boolean; width: number; height: number; scale: number; bounds: Rect; workArea: Rect }
export interface DeskSpec { id: string; x: number; y: number; w: number; h: number; displayId?: number | null; material: 'glass' | 'blur' | 'acrylic' | 'tint' | 'clear'; layer: 'desktop' | 'normal' | 'top'; radius: number; clickThrough: boolean; title: string; group?: string | null }
export interface NetStats { supported: boolean; down: number; up: number; rx: number; tx: number; ip: string; online: boolean }
export interface SysStats { cpu: number; ram: number; ramUsed: number; ramTotal: number; disk: number; diskFree: number; diskTotal: number; uptime: number }
export interface Place { name: string; region: string; country: string; lat: number; lon: number }
export interface DeskMenuItem { id: string; label: string; checked?: boolean; type?: 'separator'; role?: 'cut' | 'copy' | 'paste'; submenu?: { id: string; label: string; checked?: boolean }[] }

/** What is playing in Windows (any app that shows in the volume flyout: Spotify, browsers, Media Player…). */
export interface MediaState { none?: boolean; title?: string; artist?: string; album?: string; app?: string; playing?: boolean; pos?: number; dur?: number; at?: number; thumb?: string; canNext?: boolean; canPrev?: boolean }
