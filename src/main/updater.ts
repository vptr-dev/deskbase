import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'none' }
  | { state: 'available'; version: string }
  | { state: 'downloading'; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string }
  | { state: 'dev' }

let status: UpdateStatus = { state: 'idle' }
let win: BrowserWindow | null = null

function send(s: UpdateStatus): void {
  status = s
  win?.webContents.send('updater:status', s)
}

export function initUpdater(w: BrowserWindow): void {
  win = w
  if (!app.isPackaged) {
    status = { state: 'dev' }
    return
  }
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => send({ state: 'checking' }))
  autoUpdater.on('update-not-available', () => send({ state: 'none' }))
  autoUpdater.on('update-available', (i) => send({ state: 'available', version: i.version }))
  autoUpdater.on('download-progress', (p) => send({ state: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (i) => send({ state: 'ready', version: i.version }))
  autoUpdater.on('error', (e) => send({ state: 'error', message: String(e?.message ?? e) }))
}

export function getStatus(): UpdateStatus {
  return status
}

export async function checkForUpdates(): Promise<void> {
  if (!app.isPackaged) return send({ state: 'dev' })
  try {
    await autoUpdater.checkForUpdates()
  } catch (e: any) {
    send({ state: 'error', message: String(e?.message ?? e) })
  }
}

export function installUpdate(): void {
  if (status.state === 'ready') autoUpdater.quitAndInstall(true, true)
}
