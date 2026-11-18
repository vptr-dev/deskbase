import { contextBridge, ipcRenderer } from 'electron'

const api = {
  info: () => ipcRenderer.invoke('app:info'),
  load: () => ipcRenderer.invoke('data:load'),
  save: (data: unknown) => ipcRenderer.invoke('data:save', data),
  saveSync: (data: unknown) => ipcRenderer.sendSync('data:saveSync', data),
  exportFile: (text: string, name: string) => ipcRenderer.invoke('data:export', text, name),
  importFile: () => ipcRenderer.invoke('data:import'),
  listBackups: () => ipcRenderer.invoke('backups:list'),
  createBackup: () => ipcRenderer.invoke('backups:create'),
  readBackup: (name: string) => ipcRenderer.invoke('backups:read', name),
  openDataFolder: () => ipcRenderer.invoke('app:openDataFolder'),
  setTheme: (t: string) => ipcRenderer.invoke('app:setTheme', t),
  setMaterial: (m: string) => ipcRenderer.invoke('app:setMaterial', m),
  notify: (title: string, body: string) => ipcRenderer.invoke('app:notify', title, body),
  alwaysOnTop: (on: boolean) => ipcRenderer.invoke('app:alwaysOnTop', on),
  openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
  ai: {
    getConfig: () => ipcRenderer.invoke('ai:getConfig'),
    setConfig: (patch: unknown) => ipcRenderer.invoke('ai:setConfig', patch),
    models: () => ipcRenderer.invoke('ai:models'),
    detect: () => ipcRenderer.invoke('ai:detect'),
    chat: (id: string, system: string, messages: unknown) => ipcRenderer.invoke('ai:chat', id, system, messages),
    abort: (id: string) => ipcRenderer.invoke('ai:abort', id),
    onChunk: (cb: (id: string, text: string, thinking?: boolean) => void) => {
      const fn = (_e: unknown, id: string, text: string, thinking?: boolean): void => cb(id, text, thinking)
      ipcRenderer.on('ai:chunk', fn)
      return () => ipcRenderer.removeListener('ai:chunk', fn)
    }
  },
  notion: {
    available: () => ipcRenderer.invoke('notion:available'),
    list: () => ipcRenderer.invoke('notion:list'),
    importPages: (ids: string[]) => ipcRenderer.invoke('notion:import', ids),
    importExport: () => ipcRenderer.invoke('notion:importExport')
  },
  updater: {
    status: () => ipcRenderer.invoke('updater:status'),
    check: () => ipcRenderer.invoke('updater:check'),
    install: () => ipcRenderer.invoke('updater:install'),
    onStatus: (cb: (s: unknown) => void) => {
      const fn = (_e: unknown, s: unknown): void => cb(s)
      ipcRenderer.on('updater:status', fn)
      return () => ipcRenderer.removeListener('updater:status', fn)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
export type Api = typeof api
