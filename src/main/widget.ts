import { BrowserWindow, screen, shell } from 'electron'
import path from 'path'

/** Desktop widget: a frameless window that covers one monitor and shows a dashboard. */
export interface WidgetPrefs {
  enabled: boolean
  displayId: number | null
  pageId: string | null
  opacity: number
  /** 'clear' = transparent window, 'acrylic' = blurred Windows material */
  background: 'clear' | 'acrylic'
  /** 'desktop' keeps it behind other windows, 'top' keeps it above them */
  layer: 'desktop' | 'top'
}

export const DEFAULT_WIDGET: WidgetPrefs = { enabled: false, displayId: null, pageId: null, opacity: 100, background: 'clear', layer: 'desktop' }

export interface DisplayInfo { id: number; label: string; primary: boolean; width: number; height: number; bounds: { x: number; y: number; width: number; height: number } }

let win: BrowserWindow | null = null
let cfg: WidgetPrefs = { ...DEFAULT_WIDGET }
let builtWith: WidgetPrefs['background'] | null = null
let watching = false

// ---------- native: keep the window at the bottom of the z-order (Windows) ----------
type SetWindowPos = (hwnd: bigint | number, after: number, x: number, y: number, cx: number, cy: number, flags: number) => boolean
let setWindowPos: SetWindowPos | null | undefined
function nativeSetWindowPos(): SetWindowPos | null {
  if (setWindowPos !== undefined) return setWindowPos
  setWindowPos = null
  if (process.platform !== 'win32') return null
  try {
    // Loaded lazily so a missing native module never breaks the app.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const koffi = require('koffi')
    const user32 = koffi.load('user32.dll')
    setWindowPos = user32.func('bool __stdcall SetWindowPos(intptr_t hWnd, intptr_t hWndInsertAfter, int X, int Y, int cx, int cy, uint32_t uFlags)')
  } catch (e) {
    console.warn('desktop widget: native layering unavailable', e)
  }
  return setWindowPos ?? null
}
const HWND_BOTTOM = 1
const SWP_FLAGS = 0x0001 | 0x0002 | 0x0010 // NOSIZE | NOMOVE | NOACTIVATE

function sendToBack(): void {
  if (!win || win.isDestroyed() || cfg.layer !== 'desktop') return
  const f = nativeSetWindowPos()
  if (!f) return
  try {
    const h = win.getNativeWindowHandle()
    f(h.length >= 8 ? h.readBigInt64LE(0) : h.readInt32LE(0), HWND_BOTTOM, 0, 0, 0, 0, SWP_FLAGS)
  } catch { /* ignore */ }
}

// ---------- displays ----------
export function listDisplays(): DisplayInfo[] {
  const primary = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    label: d.label || `Display ${i + 1}`,
    primary: d.id === primary,
    width: Math.round(d.size.width * d.scaleFactor),
    height: Math.round(d.size.height * d.scaleFactor),
    bounds: d.bounds
  }))
}

function targetDisplay(): Electron.Display {
  const all = screen.getAllDisplays()
  const primary = screen.getPrimaryDisplay()
  return all.find((d) => d.id === cfg.displayId) ?? defaultDisplay(all, primary)
}

/** No monitor picked yet: prefer a landscape screen that isn't the main one. */
function defaultDisplay(all: Electron.Display[], primary: Electron.Display): Electron.Display {
  const others = all.filter((d) => d.id !== primary.id)
  return others.find((d) => d.bounds.width >= d.bounds.height) ?? others[0] ?? primary
}

function place(): void {
  if (!win || win.isDestroyed()) return
  win.setBounds(targetDisplay().workArea)
  sendToBack()
}

function watchDisplays(): void {
  if (watching) return
  watching = true
  const fix = (): void => { setTimeout(place, 300) }
  screen.on('display-added', fix)
  screen.on('display-removed', fix)
  screen.on('display-metrics-changed', fix)
}

// ---------- window ----------
function create(load: (w: BrowserWindow) => void): void {
  const clear = cfg.background === 'clear'
  const area = targetDisplay().workArea
  win = new BrowserWindow({
    ...area,
    show: false,
    frame: false,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    title: 'Planner widget',
    transparent: clear,
    backgroundColor: '#00000000',
    ...(process.platform === 'win32' && !clear ? { backgroundMaterial: 'acrylic' as const } : {}),
    alwaysOnTop: cfg.layer === 'top',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  })
  builtWith = cfg.background
  win.setOpacity(cfg.opacity / 100)
  win.once('ready-to-show', () => {
    if (!win) return
    win.showInactive()
    place()
  })
  // Stay on the desktop layer even after a click.
  win.on('focus', () => setTimeout(sendToBack, 0))
  win.on('blur', sendToBack)
  win.on('minimize', () => win?.restore())
  win.on('closed', () => { win = null; builtWith = null })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  watchDisplays()
  load(win)
}

/** Create, update or remove the widget window to match `next`. */
export function applyWidget(next: Partial<WidgetPrefs> | undefined, load: (w: BrowserWindow) => void): void {
  cfg = { ...DEFAULT_WIDGET, ...(next ?? {}) }
  cfg.opacity = Math.max(20, Math.min(100, Number(cfg.opacity) || 100))
  if (!cfg.enabled || !cfg.pageId) return closeWidget()
  if (win && !win.isDestroyed() && builtWith !== cfg.background) closeWidget()
  if (!win || win.isDestroyed()) return create(load)
  win.setOpacity(cfg.opacity / 100)
  win.setAlwaysOnTop(cfg.layer === 'top')
  place()
}

export function closeWidget(): void {
  if (win && !win.isDestroyed()) win.destroy()
  win = null
  builtWith = null
}

export const widgetWindow = (): BrowserWindow | null => (win && !win.isDestroyed() ? win : null)

/** Let clicks fall through empty areas to the desktop. */
export function setWidgetInteractive(on: boolean): void {
  const w = widgetWindow()
  if (!w) return
  if (on) w.setIgnoreMouseEvents(false)
  else w.setIgnoreMouseEvents(true, { forward: true })
}
