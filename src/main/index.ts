import { registerMedia } from './media'
import { registerConnections } from './connections'
import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, nativeTheme, Notification, screen, shell, Tray } from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createBackup, dataDir, listBackups, loadData, parseImport, readBackup, saveData } from './storage'
import { checkForUpdates, getStatus, initUpdater, installUpdate } from './updater'
import { linkInfo } from './linkinfo'
import { registerAi } from './ai'
import { importNotionExport, importNotionPages, listNotionPages, notionDbPath } from './notion'
import { findPlace, netStats, sysStats, weather } from './sysinfo'
import { backdrop } from './wallpaper'
import { listVersions, saveVersion } from './history'
import { attachDesktopHost, closeAllWidgets, deskBounds, deskClose, deskDrag, deskDragEnd, deskEdit, deskFocus, deskMenu, deskPrepare, deskShow, deskUpdate, listDisplays, type DeskSpec } from './desktop'

type Material = 'mica' | 'acrylic' | 'none'

const isWin = process.platform === 'win32'
const winBuild = isWin ? Number(os.release().split('.')[2] ?? 0) : 0
const micaSupported = isWin && winBuild >= 22621

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
/** Workspaces, as last reported by the window (for the tray menu). */
let deskSpaces: { id: string; name: string }[] = []
let activeSpace = ''
let quitting = false
let hiddenBeforeQuickAdd = false
const QUICK_ADD_KEY = 'CommandOrControl+Shift+Space'
/** Started by Windows at sign-in: stay in the tray and only show the desktop widgets. */
const startHidden = process.argv.includes('--hidden')

// User data lives in %APPDATA%\Deskbase (dev runs: Deskbase-dev, so they never touch a real install).
// Versions before 0.6 used the folder "Planner"; it is moved over once, before anything reads it.
function useDataFolder(): void {
  const appData = app.getPath('appData')
  const target = path.join(appData, app.isPackaged ? 'Deskbase' : 'Deskbase-dev')
  const legacy = path.join(appData, app.isPackaged ? 'Planner' : 'Planner-dev')
  if (!fs.existsSync(target) && fs.existsSync(path.join(legacy, 'data'))) {
    try {
      fs.renameSync(legacy, target)
    } catch {
      // Something still holds the old folder open: keep using it rather than starting empty.
      app.setPath('userData', legacy)
      return
    }
  }
  app.setPath('userData', target)
}
useDataFolder()

/** After the exe was renamed, re-point an existing "start with Windows" entry at it. */
function refreshLoginItem(): void {
  if (!app.isPackaged || !isWin) return
  try {
    const s = app.getLoginItemSettings({ args: ['--hidden'] })
    const stale = (s.launchItems ?? []).some((i) => /planner\.exe/i.test(i.path))
    if (stale && !s.executableWillLaunchAtLogin) app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] })
  } catch { /* not supported here */ }
}

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
interface ShellPrefs { material: Material; theme: 'system' | 'light' | 'dark'; closeToTray: boolean; quickAddHotkey: boolean; desktop: boolean; autostartSet: boolean }
const DEFAULT_PREFS: ShellPrefs = { material: 'mica', theme: 'system', closeToTray: false, quickAddHotkey: true, desktop: false, autostartSet: false }

/** Panels belong on the desktop from sign-in: start with Windows (in the tray) unless turned off once. */
function defaultAutostart(): void {
  if (!app.isPackaged || !isWin || readPrefs().autostartSet) return
  try { app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] }) } catch { /* not supported */ }
  writePrefs({ autostartSet: true })
}
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

/** Keep running in the tray when the window closes. */
const keepRunning = (): boolean => { const p = readPrefs(); return p.closeToTray || p.desktop }

function loadRenderer(w: BrowserWindow, hash?: string): void {
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) w.loadURL(process.env['ELECTRON_RENDERER_URL'] + (hash ? '#' + hash : ''))
  else w.loadFile(path.join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined)
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
    title: 'Deskbase',
    ...(app.isPackaged ? {} : { icon: path.join(__dirname, '../../build/icon.png') }),
    autoHideMenuBar: true,
    // No native caption buttons: the app draws its own (WindowControls) so they follow the theme.
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 14, y: 13 },
    backgroundColor: material === 'none' ? (nativeTheme.shouldUseDarkColors ? '#1c1c20' : '#f3f3f5') : '#00000000',
    ...(isWin && material !== 'none' ? { backgroundMaterial: material } : {}),
    ...(process.platform === 'darwin' ? { vibrancy: 'under-window' as const, visualEffectState: 'active' as const } : {}),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
      // Desktop widgets live in this renderer and keep running while the window is hidden.
      backgroundThrottling: false
    }
  })
  const allowed = new Set(['local-fonts', 'notifications', 'clipboard-sanitized-write', 'fullscreen'])
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)))
  mainWindow.webContents.session.setPermissionCheckHandler((_wc, permission) => allowed.has(permission))
  // Video players in embed blocks refuse to play without a web address naming the page that shows them;
  // the app's pages have none (file://), so embeds name the app's home page instead.
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: ['https://www.youtube-nocookie.com/*', 'https://www.youtube.com/*', 'https://player.vimeo.com/*'] },
    (d, cb) => {
      const ref = d.requestHeaders.Referer ?? d.requestHeaders.referer
      if (!ref || /^(file:|http:\/\/(localhost|127\.0\.0\.1))/i.test(ref)) d.requestHeaders.Referer = 'https://github.com/vptr-dev/deskbase'
      cb({ requestHeaders: d.requestHeaders })
    }
  )

  if (st.maximized) mainWindow.maximize()
  mainWindow.once('ready-to-show', () => { if (!(startHidden && keepRunning())) mainWindow?.show() })
  mainWindow.on('close', (e) => {
    if (mainWindow) saveWinState(mainWindow)
    if (!quitting && tray && keepRunning()) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })
  mainWindow.on('closed', () => { mainWindow = null; closeAllWidgets() })

  // Links open in the default browser; window.open('', 'pw-…') creates desktop widget windows.
  attachDesktopHost(mainWindow, (url) => shell.openExternal(url))
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('http://localhost') && !url.startsWith('file://')) {
      e.preventDefault()
      if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    }
  })

  const sendMax = (): void => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('win:max', mainWindow.isMaximized()) }
  mainWindow.on('maximize', sendMax)
  mainWindow.on('unmaximize', sendMax)

  loadRenderer(mainWindow)

  initUpdater(mainWindow)
  if (app.isPackaged) setTimeout(() => checkForUpdates(), 4000)
}
// ---------- tray & quick add ----------
/** Brings the app window in front of other windows (Windows refuses focus() from the tray otherwise). */
function showWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  if (isWin) {
    mainWindow.setAlwaysOnTop(true)
    mainWindow.moveTop()
    mainWindow.focus()
    setTimeout(() => mainWindow?.setAlwaysOnTop(false), 80)
  } else mainWindow.focus()
}

function openQuickAdd(): void {
  if (!mainWindow) return
  hiddenBeforeQuickAdd = !mainWindow.isVisible() || mainWindow.isMinimized()
  showWindow()
  mainWindow.webContents.send('app:quickAdd')
}

async function trayIcon(): Promise<Electron.NativeImage> {
  // tray.png with @1.5x / @2x siblings, picked by display scale
  const file = app.isPackaged ? path.join(process.resourcesPath, 'tray.png') : path.join(__dirname, '../../build/tray.png')
  const img = nativeImage.createFromPath(file)
  if (!img.isEmpty()) return img
  try { return await app.getFileIcon(process.execPath, { size: 'small' }) } catch { return nativeImage.createEmpty() }
}

async function applyTray(): Promise<void> {
  const p = readPrefs()
  const want = keepRunning()
  if (want && !tray) {
    tray = new Tray(await trayIcon())
    tray.setToolTip('Deskbase')
    tray.on('click', showWindow)
  } else if (!want && tray) {
    tray.destroy()
    tray = null
  }
  if (tray) {
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open', click: showWindow },
      { label: 'Quick add task…', click: openQuickAdd },
      { type: 'separator' },
      ...deskSpaces.map((s) => ({ label: s.name, type: 'radio' as const, checked: s.id === activeSpace, click: () => mainWindow?.webContents.send('desk:command', '', 'space:' + s.id) })),
      ...(deskSpaces.length ? [{ type: 'separator' as const }] : []),
      { label: 'Show panels on the desktop', type: 'checkbox' as const, checked: p.desktop, click: () => mainWindow?.webContents.send('desk:command', '', 'toggle') },
      { label: 'Arrange panels', enabled: p.desktop, click: () => mainWindow?.webContents.send('desk:command', '', 'arrange') },
      { type: 'separator' },
      { label: 'Quit', click: () => { quitting = true; app.quit() } }
    ]))
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
    const r = await dialog.showOpenDialog(mainWindow!, { properties: ['openFile'], filters: [{ name: 'Backup', extensions: ['json'] }] })
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
  ipcMain.handle('history:list', (_e, id: string) => listVersions(String(id)))
  ipcMain.handle('history:save', (_e, id: string, v) => saveVersion(String(id), v))

  ipcMain.handle('app:setTheme', (_e, theme: 'system' | 'light' | 'dark') => {
    nativeTheme.themeSource = theme
    writePrefs({ theme })
    return nativeTheme.shouldUseDarkColors
  })

  ipcMain.handle('app:setMaterial', (_e, material: Material) => {
    if (readPrefs().material === material) return true
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
      n.on('click', () => showWindow())
      n.show()
    }
  })

  ipcMain.handle('app:loginItem', (_e, on?: boolean) => {
    if (typeof on === 'boolean' && app.isPackaged) { app.setLoginItemSettings({ openAtLogin: on, args: ['--hidden'] }); writePrefs({ autostartSet: true }) }
    return app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin
  })
  ipcMain.handle('sys:stats', (_e, drive?: string) => sysStats(drive))
  ipcMain.handle('sys:net', () => netStats())
  ipcMain.handle('net:places', (_e, q: string) => findPlace(String(q ?? '')))
  ipcMain.handle('net:weather', (_e, lat: number, lon: number, f: boolean) => weather(Number(lat), Number(lon), !!f))
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
  ipcMain.handle('app:displays', () => listDisplays())
  ipcMain.handle('app:showMain', () => showWindow())
  ipcMain.handle('win:isMax', () => !!mainWindow?.isMaximized())
  ipcMain.handle('win:control', (_e, action: string) => {
    if (!mainWindow) return
    if (action === 'min') mainWindow.minimize()
    else if (action === 'max') { if (mainWindow.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize() }
    else if (action === 'close') mainWindow.close()
  })
  ipcMain.handle('desk:active', async (_e, on: boolean, spaces?: { id: string; name: string }[], current?: string) => {
    const nextSpaces = Array.isArray(spaces) ? spaces.slice(0, 30).map((s) => ({ id: String(s.id), name: String(s.name).slice(0, 60) })) : deskSpaces
    const changed = JSON.stringify(nextSpaces) !== JSON.stringify(deskSpaces) || (current ?? activeSpace) !== activeSpace
    deskSpaces = nextSpaces
    activeSpace = current ?? activeSpace
    if (readPrefs().desktop !== on) { writePrefs({ desktop: on }); await applyTray() } else if (changed) await applyTray()
  })
  ipcMain.handle('desk:prepare', (_e, spec: DeskSpec) => deskPrepare(spec))
  ipcMain.handle('desk:show', (_e, id: string) => deskShow(id))
  ipcMain.handle('desk:update', (_e, spec: DeskSpec) => deskUpdate(spec))
  ipcMain.handle('desk:close', (_e, id: string) => deskClose(id))
  ipcMain.handle('desk:edit', (_e, on: boolean) => deskEdit(on))
  ipcMain.on('desk:drag', (_e, id: string, phase: 'start' | 'move', x: number, y: number, mode: 'move' | 'resize', free: boolean, grid: number) => deskDrag(id, phase, x, y, mode, free, grid))
  ipcMain.handle('desk:dragEnd', (_e, id: string) => deskDragEnd(id))
  ipcMain.handle('desk:bounds', (_e, id: string) => deskBounds(id))
  ipcMain.handle('desk:menu', (_e, id: string, items) => deskMenu(id, items))
  ipcMain.handle('desk:focus', (_e, id: string) => deskFocus(id))
  ipcMain.handle('desk:backdrop', (_e, stamp?: string) => backdrop(stamp))
  ipcMain.handle('app:alwaysOnTop', (_e, on: boolean) => { mainWindow?.setAlwaysOnTop(on); return on })
  ipcMain.handle('app:openExternal', (_e, url: string) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url) })
  // Launcher panels: a website, an app link (mailto:, spotify:, steam:…) or a file, folder or program on this PC.
  ipcMain.handle('net:linkInfo', (_e, url: string) => linkInfo(String(url ?? '')))
  ipcMain.handle('app:launch', async (_e, target: string) => {
    const t = String(target ?? '').trim()
    if (!t) return false
    if (/^(https?|mailto|spotify|steam|discord|ms-settings|obsidian|notion|vscode|zoommtg|msteams|slack):/i.test(t)) { await shell.openExternal(t); return true }
    if (/^[a-z]:[\\/]/i.test(t) || t.startsWith('\\\\')) { if (!fs.existsSync(t)) return false; return (await shell.openPath(t)) === '' }
    if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(t)) { await shell.openExternal('https://' + t); return true }
    return false
  })

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
    // Same id as the first releases, so the taskbar pin, notifications and the sign-in entry carry over.
    if (isWin) app.setAppUserModelId('com.vptrdev.planner')
    refreshLoginItem()
    defaultAutostart()
    registerIpc()
    registerAi()
    registerConnections()
    registerMedia()
    createWindow()
    applyTray()
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
  })
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
}
