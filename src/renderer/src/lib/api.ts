import { download } from './util'

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
  openExternal(url: string): Promise<void>
  updater: {
    status(): Promise<UpdateStatus>
    check(): Promise<void>
    install(): Promise<void>
    onStatus(cb: (s: UpdateStatus) => void): () => void
  }
}

const KEY = 'planner:data'

/** Fallback used when the UI runs in a plain browser (development preview). */
const browserBridge: Bridge = {
  info: async () => ({ version: 'dev', platform: 'web', micaSupported: false, material: 'none', dataPath: 'localStorage', packaged: false }),
  load: async () => {
    try {
      const t = localStorage.getItem(KEY)
      return { data: t ? JSON.parse(t) : null, migratedFrom: null, path: 'localStorage' }
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
  openExternal: async (url) => { window.open(url, '_blank') },
  updater: {
    status: async () => ({ state: 'dev' }),
    check: async () => {},
    install: async () => {},
    onStatus: () => () => {}
  }
}

export const api: Bridge = (window as any).api ?? browserBridge
export const isDesktop = Boolean((window as any).api)
