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
  launch: (target: string) => ipcRenderer.invoke('app:launch', target),
  linkInfo: (url: string) => ipcRenderer.invoke('net:linkInfo', url),
  displays: () => ipcRenderer.invoke('app:displays'),
  onOpenPage: (cb: (id: string) => void) => {
    const fn = (_e: unknown, id: string): void => cb(id)
    ipcRenderer.on('app:openPage', fn)
    return () => ipcRenderer.removeListener('app:openPage', fn)
  },
  showMain: () => ipcRenderer.invoke('app:showMain'),
  win: {
    control: (action: 'min' | 'max' | 'close') => ipcRenderer.invoke('win:control', action),
    isMax: () => ipcRenderer.invoke('win:isMax'),
    onMax: (cb: (max: boolean) => void) => {
      const fn = (_e: unknown, max: boolean): void => cb(max)
      ipcRenderer.on('win:max', fn)
      return () => ipcRenderer.removeListener('win:max', fn)
    }
  },
  sysStats: (drive?: string) => ipcRenderer.invoke('sys:stats', drive),
  places: (q: string) => ipcRenderer.invoke('net:places', q),
  weather: (lat: number, lon: number, f: boolean) => ipcRenderer.invoke('net:weather', lat, lon, f),
  desk: {
    active: (on: boolean, spaces?: { id: string; name: string }[], current?: string) => ipcRenderer.invoke('desk:active', on, spaces, current),
    prepare: (spec: unknown) => ipcRenderer.invoke('desk:prepare', spec),
    show: (id: string) => ipcRenderer.invoke('desk:show', id),
    update: (spec: unknown) => ipcRenderer.invoke('desk:update', spec),
    close: (id: string) => ipcRenderer.invoke('desk:close', id),
    edit: (on: boolean) => ipcRenderer.invoke('desk:edit', on),
    drag: (id: string, phase: 'start' | 'move', x: number, y: number, mode: 'move' | 'resize', free: boolean, grid: number) => ipcRenderer.send('desk:drag', id, phase, x, y, mode, free, grid),
    dragEnd: (id: string) => ipcRenderer.invoke('desk:dragEnd', id),
    bounds: (id: string) => ipcRenderer.invoke('desk:bounds', id),
    menu: (id: string, items: unknown) => ipcRenderer.invoke('desk:menu', id, items),
    focus: (id: string) => ipcRenderer.invoke('desk:focus', id),
    onClosed: (cb: (id: string) => void) => {
      const fn = (_e: unknown, id: string): void => cb(id)
      ipcRenderer.on('desk:closed', fn)
      return () => ipcRenderer.removeListener('desk:closed', fn)
    },
    onCommand: (cb: (id: string, cmd: string) => void) => {
      const fn = (_e: unknown, id: string, cmd: string): void => cb(id, cmd)
      ipcRenderer.on('desk:command', fn)
      return () => ipcRenderer.removeListener('desk:command', fn)
    }
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
