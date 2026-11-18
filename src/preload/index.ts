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
  loginItem: (on?: boolean) => ipcRenderer.invoke('app:loginItem', on),
  openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
  displays: () => ipcRenderer.invoke('app:displays'),
  onDataChanged: (cb: (data: unknown) => void) => {
    const fn = (_e: unknown, data: unknown): void => cb(data)
    ipcRenderer.on('data:changed', fn)
    return () => ipcRenderer.removeListener('data:changed', fn)
  },
  onOpenPage: (cb: (id: string) => void) => {
    const fn = (_e: unknown, id: string): void => cb(id)
    ipcRenderer.on('app:openPage', fn)
    return () => ipcRenderer.removeListener('app:openPage', fn)
  },
  onWidgetToggle: (cb: () => void) => {
    const fn = (_e: unknown): void => cb()
    ipcRenderer.on('widget:toggle', fn)
    return () => ipcRenderer.removeListener('widget:toggle', fn)
  },
  widget: {
    set: (w: unknown) => ipcRenderer.invoke('widget:set', w),
    openMain: (pageId?: string) => ipcRenderer.invoke('widget:openMain', pageId),
    interactive: (on: boolean) => ipcRenderer.send('widget:interactive', on)
  },
  setShell: (p: { closeToTray?: boolean; quickAddHotkey?: boolean }) => ipcRenderer.invoke('app:setShell', p),
  quickAddDone: (added: boolean) => ipcRenderer.invoke('app:quickAddDone', added),
  onQuickAdd: (cb: () => void) => {
    const fn = (): void => cb()
    ipcRenderer.on('app:quickAdd', fn)
    return () => ipcRenderer.removeListener('app:quickAdd', fn)
  },
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
