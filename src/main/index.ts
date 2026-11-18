import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, nativeTheme, Notification, screen, shell, Tray } from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createBackup, dataDir, listBackups, loadData, parseImport, readBackup, saveData } from './storage'
import { checkForUpdates, getStatus, initUpdater, installUpdate } from './updater'
import { registerAi } from './ai'
import { importNotionExport, importNotionPages, listNotionPages, notionDbPath } from './notion'

type Material = 'mica' | 'acrylic' | 'none'

const isWin = process.platform === 'win32'
const winBuild = isWin ? Number(os.release().split('.')[2] ?? 0) : 0
const micaSupported = isWin && winBuild >= 22621

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let hiddenBeforeQuickAdd = false
const QUICK_ADD_KEY = 'CommandOrControl+Shift+Space'

// Development runs keep their own data so they never touch a real install.
if (!app.isPackaged) app.setPath('userData', path.join(app.getPath('appData'), 'Planner-dev'))

// ---------- window state ----------
interface WinState { x?: number; y?: number; width: number; height: number; maximized: boolean }
const stateFile = (): string => path.join(app.getPath('userData'), 'window-state.json')

function readWinState(): WinState {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8')) as WinState
    const visible = screen.getAllDisplays().some((d) => {
      const b = d.workArea
      return s.x !== undefined && s.y !== undefined && s.x >= b.x - 50 && s.y >= b.y - 50 && s.x < b.x + b.width && s.y < b.y + b.height
    })
    return visible ? s : { width: s.width, height: s.height, maximized: s.maximized }
  } catch {
    return { width: 1280, height: 820, maximized: false }
  }
}

function saveWinState(w: BrowserWindow): void {
  try {
    const b = w.getNormalBounds()
    fs.writeFileSync(stateFile(), JSON.stringify({ ...b, maximized: w.isMaximized() }))
  } catch { /* ignore */ }
}

// ---------- preferences needed before the renderer loads ----------
const prefsFile = (): string => path.join(app.getPath('userData'), 'shell-prefs.json')
interface ShellPrefs { material: Material; theme: 'system' | 'light' | 'dark'; closeToTray: boolean; quickAddHotkey: boolean }
const DEFAULT_PREFS: ShellPrefs = { material: 'mica', theme: 'system', closeToTray: false, quickAddHotkey: true }
function readPrefs(): ShellPrefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(fs.readFileSync(prefsFile(), 'utf8')) }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}
function writePrefs(p: Partial<ReturnType<typeof readPrefs>>): void {
  try { fs.writeFileSync(prefsFile(), JSON.stringify({ ...readPrefs(), ...p })) } catch { /* ignore */ }
}

function overlayColors(): { color: string; symbolColor: string; height: number } {
  return {
    color: '#00000000',
    symbolColor: nativeTheme.shouldUseDarkColors ? '#e8e8ec' : '#1d1d22',
    height: 40
  }
}

function createWindow(): void {
  const prefs = readPrefs()
  nativeTheme.themeSource = prefs.theme
  const st = readWinState()
  const material: Material = micaSupported ? prefs.material : 'none'

  mainWindow = new BrowserWindow({
    x: st.x,
    y: st.y,
    width: st.width,
    height: st.height,
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: 'Planner',
    ...(app.isPackaged ? {} : { icon: path.join(__dirname, '../../build/icon.png') }),
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: isWin ? overlayColors() : undefined,
    trafficLightPosition: { x: 14, y: 13 },
    backgroundColor: material === 'none' ? (nativeTheme.shouldUseDarkColors ? '#1c1c20' : '#f3f3f5') : '#00000000',
    ...(isWin && material !== 'none' ? { backgroundMaterial: material } : {}),
    ...(process.platform === 'darwin' ? { vibrancy: 'under-window' as const, visualEffectState: 'active' as const } : {}),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true
    }
  })

  if (st.maximized) mainWindow.maximize()
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('close', (e) => {
    if (mainWindow) saveWinState(mainWindow)
    if (!quitting && tray && readPrefs().closeToTray) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  // Links open in the default browser, never inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('http://localhost') && !url.startsWith('file://')) {
      e.preventDefault()
      if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    }
  })

  nativeTheme.on('updated', () => {
    if (isWin && mainWindow) mainWindow.setTitleBarOverlay(overlayColors())
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  initUpdater(mainWindow)
  if (app.isPackaged) setTimeout(() => checkForUpdates(), 4000)
}
// ---------- tray & quick add ----------
function showWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function openQuickAdd(): void {
  if (!mainWindow) return
  hiddenBeforeQuickAdd = !mainWindow.isVisible() || mainWindow.isMinimized()
  showWindow()
  mainWindow.webContents.send('app:quickAdd')
}

async function trayIcon(): Promise<Electron.NativeImage> {
  if (!app.isPackaged) return nativeImage.createFromPath(path.join(__dirname, '../../build/icon.png')).resize({ width: 16, height: 16 })
  try { return await app.getFileIcon(process.execPath, { size: 'small' }) } catch { return nativeImage.createEmpty() }
}

async function applyTray(): Promise<void> {
  const p = readPrefs()
  if (p.closeToTray && !tray) {
    tray = new Tray(await trayIcon())
    tray.setToolTip('Planner')
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open Planner', click: showWindow },
      { label: 'Quick add task…', click: openQuickAdd },
      { type: 'separator' },
      { label: 'Quit', click: () => { quitting = true; app.quit() } }
    ]))
    tray.on('click', showWindow)
  } else if (!p.closeToTray && tray) {
    tray.destroy()
    tray = null
  }
  globalShortcut.unregister(QUICK_ADD_KEY)
  if (p.quickAddHotkey) {
    try { globalShortcut.register(QUICK_ADD_KEY, openQuickAdd) } catch { /* taken by another app */ }
  }
}

// ---------- IPC ----------
function registerIpc(): void {
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    micaSupported,
    material: micaSupported ? readPrefs().material : 'none',
    dataPath: dataDir(),
    packaged: app.isPackaged
  }))

  ipcMain.handle('data:load', () => loadData())
  ipcMain.handle('data:save', (_e, data) => { saveData(data); return true })
  ipcMain.on('data:saveSync', (e, data) => {
    try { saveData(data); e.returnValue = true } catch { e.returnValue = false }
  })

  ipcMain.handle('data:export', async (_e, text: string, defaultName: string) => {
    const r = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: path.join(app.getPath('documents'), defaultName),
      filters: [{ name: defaultName.split('.').pop()!.toUpperCase(), extensions: [defaultName.split('.').pop()!] }]
    })
    if (r.canceled || !r.filePath) return null
    fs.writeFileSync(r.filePath, text, 'utf8')
    return r.filePath
  })

  ipcMain.handle('data:import', async () => {
    const r = await dialog.showOpenDialog(mainWindow!, { properties: ['openFile'], filters: [{ name: 'Planner backup', extensions: ['json'] }] })
    if (r.canceled || !r.filePaths[0]) return null
    createBackup('before-import')
    return parseImport(fs.readFileSync(r.filePaths[0], 'utf8'))
  })

  ipcMain.handle('backups:list', () => listBackups())
  ipcMain.handle('backups:create', () => createBackup('manual'))
  ipcMain.handle('backups:read', (_e, name: string) => {
    createBackup('before-restore')
    return readBackup(name)
  })
  ipcMain.handle('app:openDataFolder', () => shell.openPath(dataDir()))

  ipcMain.handle('app:setTheme', (_e, theme: 'system' | 'light' | 'dark') => {
    nativeTheme.themeSource = theme
    writePrefs({ theme })
    if (isWin && mainWindow) mainWindow.setTitleBarOverlay(overlayColors())
    return nativeTheme.shouldUseDarkColors
  })

  ipcMain.handle('app:setMaterial', (_e, material: Material) => {
    writePrefs({ material })
    if (micaSupported && mainWindow) {
      mainWindow.setBackgroundMaterial(material)
      if (material === 'none') mainWindow.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#1c1c20' : '#f3f3f5')
      else mainWindow.setBackgroundColor('#00000000')
    }
    return true
  })

  ipcMain.handle('app:notify', (_e, title: string, body: string) => {
    if (Notification.isSupported()) {
      const n = new Notification({ title, body, silent: false })
      n.on('click', () => { mainWindow?.show(); mainWindow?.focus() })
      n.show()
    }
  })

  ipcMain.handle('app:loginItem', (_e, on?: boolean) => {
    if (typeof on === 'boolean' && app.isPackaged) app.setLoginItemSettings({ openAtLogin: on })
    return app.getLoginItemSettings().openAtLogin
  })
  ipcMain.handle('app:setShell', async (_e, p: { closeToTray?: boolean; quickAddHotkey?: boolean }) => {
    const next: Partial<ShellPrefs> = {}
    if (typeof p.closeToTray === 'boolean') next.closeToTray = p.closeToTray
    if (typeof p.quickAddHotkey === 'boolean') next.quickAddHotkey = p.quickAddHotkey
    writePrefs(next)
    await applyTray()
    return { closeToTray: Boolean(tray), hotkey: globalShortcut.isRegistered(QUICK_ADD_KEY) }
  })
  ipcMain.handle('app:quickAddDone', (_e, added: boolean) => {
    if (hiddenBeforeQuickAdd && added && tray) mainWindow?.hide()
    hiddenBeforeQuickAdd = false
  })
  ipcMain.handle('app:alwaysOnTop', (_e, on: boolean) => { mainWindow?.setAlwaysOnTop(on); return on })
  ipcMain.handle('app:openExternal', (_e, url: string) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url) })

  ipcMain.handle('notion:available', () => Boolean(notionDbPath()))
  ipcMain.handle('notion:list', () => listNotionPages())
  ipcMain.handle('notion:import', (_e, ids: string[]) => importNotionPages(ids))
  ipcMain.handle('notion:importExport', async () => {
    const r = await dialog.showOpenDialog(mainWindow!, { title: 'Choose a Notion export', properties: ['openFile'], filters: [{ name: 'Notion export', extensions: ['zip', 'md', 'csv'] }] })
    if (r.canceled || !r.filePaths[0]) return null
    return importNotionExport(r.filePaths[0])
  })

  ipcMain.handle('updater:status', () => getStatus())
  ipcMain.handle('updater:check', () => checkForUpdates())
  ipcMain.handle('updater:install', () => installUpdate())
}

// ---------- lifecycle ----------
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow())
  app.on('before-quit', () => { quitting = true })
  app.on('will-quit', () => globalShortcut.unregisterAll())
  app.whenReady().then(() => {
    if (isWin) app.setAppUserModelId('com.vptrdev.planner')
    registerIpc()
    registerAi()
    createWindow()
    applyTray()
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
  })
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
}
