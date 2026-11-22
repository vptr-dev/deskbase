import { BrowserWindow, Menu, type MenuItemConstructorOptions, screen, shell, type WebContents } from 'electron'

/**
 * Desktop widgets: each widget is its own small frameless window. The windows are opened by the
 * main window's renderer with window.open, so they share its JavaScript, store and React tree;
 * this module only creates, places and styles the native windows.
 */
export type DeskMaterial = 'glass' | 'blur' | 'acrylic' | 'tint' | 'clear'
export type DeskLayer = 'desktop' | 'normal' | 'top'
export interface DeskSpec {
  id: string
  x: number
  y: number
  w: number
  h: number
  displayId?: number | null
  material: DeskMaterial
  layer: DeskLayer
  radius: number
  clickThrough: boolean
  title: string
  /** panels with the same group move together */
  group?: string | null
}
interface Entry { interacting?: boolean; win: BrowserWindow; spec: DeskSpec; drag?: { mode: 'move' | 'resize'; sx: number; sy: number; start: Electron.Rectangle; mates: { e: Entry; start: Electron.Rectangle }[] } }

const pending = new Map<string, DeskSpec>()
const wins = new Map<string, Entry>()
let host: WebContents | null = null
let editing = false
let watching = false
/** A panel's right-click menu is open: it keeps focus until the menu closes. */
let menuOpen = false

const HWND_BOTTOM = 1
const MIN_W = 96
const MIN_H = 64

// ---------- native helpers (Windows) ----------
type Native = {
  setWindowPos: (h: bigint, after: number, x: number, y: number, cx: number, cy: number, flags: number) => boolean
  accent: (h: bigint, state: number, color: number) => boolean
  corner: (h: bigint, pref: number) => number
  region: (h: bigint, w: number, hgt: number, r: number) => void
  /** Brings a window to the foreground even when Windows' focus lock would refuse it. */
  foreground: (h: bigint) => boolean
  /**
   * Makes a panel a desktop skin like Rainmeter's: a tool window (no taskbar button, not in Alt+Tab,
   * ignored by apps that act on windows) owned by the desktop, so Show desktop keeps it visible.
   */
  skin: (h: bigint) => void
}
let native: Native | null | undefined
function nat(): Native | null {
  if (native !== undefined) return native
  native = null
  if (process.platform !== 'win32') return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const koffi = require('koffi')
    const user32 = koffi.load('user32.dll')
    const gdi32 = koffi.load('gdi32.dll')
    const dwm = koffi.load('dwmapi.dll')
    const ACCENT = koffi.struct('DeskAccent', { AccentState: 'int', AccentFlags: 'int', GradientColor: 'uint32', AnimationId: 'int' })
    koffi.struct('DeskWcad', { Attribute: 'int', Data: 'void *', SizeOfData: 'size_t' })
    const swp = user32.func('bool __stdcall SetWindowPos(intptr_t hWnd, intptr_t after, int X, int Y, int cx, int cy, uint32_t flags)')
    const swca = user32.func('bool __stdcall SetWindowCompositionAttribute(intptr_t hWnd, _Inout_ DeskWcad *data)')
    const dsa = dwm.func('int __stdcall DwmSetWindowAttribute(intptr_t hWnd, uint32_t attr, _In_ int *value, uint32_t size)')
    const rrr = gdi32.func('intptr_t __stdcall CreateRoundRectRgn(int x1, int y1, int x2, int y2, int w, int h)')
    const swr = user32.func('int __stdcall SetWindowRgn(intptr_t hWnd, intptr_t rgn, bool redraw)')
    const sfw = user32.func('bool __stdcall SetForegroundWindow(intptr_t hWnd)')
    const gfw = user32.func('intptr_t __stdcall GetForegroundWindow()')
    const gwtp = user32.func('uint32_t __stdcall GetWindowThreadProcessId(intptr_t hWnd, void *pid)')
    const ati = user32.func('bool __stdcall AttachThreadInput(uint32_t from, uint32_t to, bool attach)')
    const gct = koffi.load('kernel32.dll').func('uint32_t __stdcall GetCurrentThreadId()')
    const gwl = user32.func('intptr_t __stdcall GetWindowLongPtrW(intptr_t hWnd, int index)')
    const swl = user32.func('intptr_t __stdcall SetWindowLongPtrW(intptr_t hWnd, int index, intptr_t value)')
    const fwin = user32.func('intptr_t __stdcall FindWindowW(str16 cls, str16 title)')
    native = {
      setWindowPos: (h, after, x, y, cx, cy, flags) => swp(h, after, x, y, cx, cy, flags),
      accent: (h, state, color) => {
        const buf = koffi.alloc(ACCENT, 1)
        // Flags stay 0: with the gradient flag and a see-through color the blur turns black.
        koffi.encode(buf, ACCENT, { AccentState: state, AccentFlags: 0, GradientColor: color, AnimationId: 0 })
        const ok = swca(h, { Attribute: 19, Data: buf, SizeOfData: koffi.sizeof(ACCENT) })
        koffi.free(buf)
        return ok
      },
      corner: (h, pref) => dsa(h, 33, [pref], 4),
      region: (h, w, hgt, r) => { swr(h, r > 0 ? rrr(0, 0, w + 1, hgt + 1, r * 2, r * 2) : 0, true) },
      foreground: (h) => {
        if (sfw(h)) return true
        // Share input with the foreground window's thread for a moment so the switch is allowed.
        const fg = gfw()
        const other = fg ? gwtp(fg, null) : 0
        const me = gct()
        if (!other || other === me) return sfw(h)
        ati(me, other, true)
        const ok = sfw(h)
        ati(me, other, false)
        return ok
      },
      skin: (h) => {
        const GWL_EXSTYLE = -20
        const GWLP_HWNDPARENT = -8
        const WS_EX_TOOLWINDOW = 0x80
        const WS_EX_APPWINDOW = 0x40000
        const ex = Number(gwl(h, GWL_EXSTYLE))
        const want = (ex | WS_EX_TOOLWINDOW) & ~WS_EX_APPWINDOW
        if (want !== ex) swl(h, GWL_EXSTYLE, want)
        const desk = fwin('Progman', null)
        if (desk && Number(gwl(h, GWLP_HWNDPARENT)) !== Number(desk)) swl(h, GWLP_HWNDPARENT, desk)
        // 0x20 = SWP_FRAMECHANGED: the new style takes effect now.
        swp(h, HWND_BOTTOM, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010 | 0x0020)
      }
    }
  } catch (e) {
    console.warn('desktop widgets: native effects unavailable', e)
  }
  return native ?? null
}
const hwnd = (w: BrowserWindow): bigint => {
  const b = w.getNativeWindowHandle()
  return b.length >= 8 ? b.readBigInt64LE(0) : BigInt(b.readInt32LE(0))
}

const SWP_NOSIZE_NOMOVE_NOACTIVATE = 0x0001 | 0x0002 | 0x0010

/** Keeps a panel a desktop skin (see Native.skin). Run after anything that may change its window style. */
function asSkin(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  win.setSkipTaskbar(true)
  try { nat()?.skin(hwnd(win)) } catch { /* ignore */ }
}

/**
 * Electron's setFocusable also turns "skip taskbar" off when a window becomes focusable, which gave
 * panels a taskbar button after any click; panels always go back to being skins.
 */
function setFocus(win: BrowserWindow, on: boolean): void {
  if (win.isDestroyed()) return
  win.setFocusable(on)
  asSkin(win)
}

function sendToBack(e: Entry): void {
  // While its menu is open a panel stays where it is, so the menu shows above other windows.
  if (editing || menuOpen || e.interacting || e.win.isDestroyed()) return
  try { nat()?.setWindowPos(hwnd(e.win), HWND_BOTTOM, 0, 0, 0, 0, SWP_NOSIZE_NOMOVE_NOACTIVATE) } catch { /* ignore */ }
}

/** Blur and rounded corners. Blur stays on when the widget isn't focused (unlike Mica/Acrylic materials). */
function applyEffects(e: Entry): void {
  const n = nat()
  if (!n || e.win.isDestroyed()) return
  const h = hwnd(e.win)
  const blur = e.spec.material === 'blur' || e.spec.material === 'acrylic'
  try {
    // ACCENT_ENABLE_BLURBEHIND = 3, ACCENT_ENABLE_ACRYLICBLURBEHIND = 4, disabled = 0
    n.accent(h, blur ? (e.spec.material === 'acrylic' ? 4 : 3) : 0, e.spec.material === 'acrylic' ? 0x01ffffff : 0)
  } catch { /* ignore */ }
  applyShape(e)
}

/** Clip the window to its rounded rectangle so the blur has the same corners as the card. */
function applyShape(e: Entry): void {
  const n = nat()
  if (!n || e.win.isDestroyed()) return
  const blur = e.spec.material === 'blur' || e.spec.material === 'acrylic'
  const b = e.win.getBounds()
  const scale = screen.getDisplayMatching(b).scaleFactor || 1
  try {
    if (blur) n.region(hwnd(e.win), Math.round(b.width * scale), Math.round(b.height * scale), Math.round(Math.max(0, e.spec.radius) * scale))
    else n.region(hwnd(e.win), 0, 0, 0)
  } catch { /* ignore */ }
}

/** Panels always sit on the desktop, under every window; only arranging lifts them up. */
function applyLayer(e: Entry): void {
  if (e.win.isDestroyed()) return
  e.win.setAlwaysOnTop(editing, 'screen-saver')
  if (!editing) {
    if (!e.win.isFocused()) setFocus(e.win, false)
    sendToBack(e)
  }
}

/**
 * setBounds across monitors with different scaling can land with the wrong size (the size is
 * converted with the old monitor's scale). Setting it again on the new monitor fixes it.
 */
function placeWindow(win: BrowserWindow, r: Electron.Rectangle): void {
  const before = screen.getDisplayMatching(win.getBounds()).scaleFactor
  win.setBounds(r)
  const now = win.getBounds()
  if (screen.getDisplayMatching(r).scaleFactor !== before || now.width !== r.width || now.height !== r.height) win.setBounds(r)
}

function applyMouse(e: Entry): void {
  if (e.win.isDestroyed()) return
  if (e.spec.clickThrough && !editing) e.win.setIgnoreMouseEvents(true)
  else e.win.setIgnoreMouseEvents(false)
}

// ---------- geometry ----------
export function listDisplays(): { id: number; label: string; primary: boolean; width: number; height: number; bounds: Electron.Rectangle; workArea: Electron.Rectangle; scale: number }[] {
  const primary = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    label: d.label || `Display ${i + 1}`,
    primary: d.id === primary,
    width: Math.round(d.size.width * d.scaleFactor),
    height: Math.round(d.size.height * d.scaleFactor),
    bounds: d.bounds,
    workArea: d.workArea,
    scale: d.scaleFactor
  }))
}

function displayFor(id?: number | null): Electron.Display {
  const all = screen.getAllDisplays()
  const found = all.find((d) => d.id === id)
  if (found) return found
  const primary = screen.getPrimaryDisplay()
  const others = all.filter((d) => d.id !== primary.id)
  return others.find((d) => d.bounds.width >= d.bounds.height) ?? others[0] ?? primary
}

/** Keep at least part of the widget on a screen that exists right now. */
function visibleBounds(spec: DeskSpec): Electron.Rectangle {
  if (spec.w <= 0 || spec.h <= 0) return displayFor(spec.displayId).workArea
  const r = { x: Math.round(spec.x), y: Math.round(spec.y), width: Math.max(MIN_W, Math.round(spec.w)), height: Math.max(MIN_H, Math.round(spec.h)) }
  const area = screen.getDisplayMatching(r).workArea
  const overlaps = screen.getAllDisplays().some((d) => {
    const a = d.workArea
    return r.x + r.width - 40 > a.x && r.x + 40 < a.x + a.width && r.y + 20 > a.y && r.y + 20 < a.y + a.height
  })
  if (overlaps) return r
  return { ...r, x: Math.round(area.x + (area.width - r.width) / 2), y: Math.round(area.y + (area.height - r.height) / 2) }
}

const SNAP = 10
const GAP = 12

/** Snap a rectangle to screen edges, other widgets and the grid. */
function snap(id: string, r: Electron.Rectangle, mode: 'move' | 'resize', grid: number, skip: string[] = []): Electron.Rectangle {
  const area = screen.getDisplayMatching(r).workArea
  const others = [...wins.values()].filter((e) => e.spec.id !== id && !skip.includes(e.spec.id) && !e.win.isDestroyed() && e.win.isVisible()).map((e) => e.win.getBounds())
  const xs: number[] = [area.x + GAP, area.x + area.width - GAP]
  const ys: number[] = [area.y + GAP, area.y + area.height - GAP]
  for (const o of others) {
    xs.push(o.x, o.x + o.width, o.x - GAP, o.x + o.width + GAP)
    ys.push(o.y, o.y + o.height, o.y - GAP, o.y + o.height + GAP)
  }
  const best = (vals: number[], targets: number[]): { d: number; v: number } | null => {
    let out: { d: number; v: number } | null = null
    for (const v of vals) for (const t of targets) {
      const d = t - v
      if (Math.abs(d) <= SNAP && (!out || Math.abs(d) < Math.abs(out.d))) out = { d, v }
    }
    return out
  }
  const g = (n: number): number => (grid > 1 ? Math.round(n / grid) * grid : n)
  const out = { ...r }
  if (mode === 'move') {
    const bx = best([r.x, r.x + r.width], xs)
    const by = best([r.y, r.y + r.height], ys)
    out.x = bx ? r.x + bx.d : area.x + g(r.x - area.x)
    out.y = by ? r.y + by.d : area.y + g(r.y - area.y)
  } else {
    const bx = best([r.x + r.width], xs)
    const by = best([r.y + r.height], ys)
    out.width = bx ? r.width + bx.d : g(r.width)
    out.height = by ? r.height + by.d : g(r.height)
    out.width = Math.max(MIN_W, out.width)
    out.height = Math.max(MIN_H, out.height)
  }
  return out
}

function watchDisplays(): void {
  if (watching) return
  watching = true
  const fix = (): void => {
    setTimeout(() => {
      for (const e of wins.values()) {
        if (e.win.isDestroyed()) continue
        placeWindow(e.win, visibleBounds(e.spec))
        applyShape(e)
      }
    }, 400)
  }
  screen.on('display-added', fix)
  screen.on('display-removed', fix)
  screen.on('display-metrics-changed', fix)
}

// ---------- windows ----------
function optionsFor(spec: DeskSpec): Electron.BrowserWindowConstructorOptions {
  const b = visibleBounds(spec)
  return {
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: false,
    focusable: false,
    title: spec.title || 'Panel',
    thickFrame: false,
    autoHideMenuBar: true
  }
}

function register(win: BrowserWindow, spec: DeskSpec): void {
  const old = wins.get(spec.id)
  if (old && !old.win.isDestroyed() && old.win !== win) old.win.destroy()
  const e: Entry = { win, spec }
  wins.set(spec.id, e)
  win.setMenu(null)
  asSkin(win)
  // Panels never take focus on a click, so clicking one never lifts it over other windows.
  // Text fields and the right-click menu ask for focus (deskFocus) and give it back on blur.
  win.on('focus', () => setTimeout(() => sendToBack(e), 0))
  win.on('blur', () => {
    e.interacting = false
    if (win.isDestroyed()) return
    if (!editing && !menuOpen) setFocus(win, false)
    sendToBack(e)
  })
  win.on('minimize', () => { if (!win.isDestroyed()) win.restore() })
  win.on('closed', () => {
    if (wins.get(spec.id)?.win === win) {
      wins.delete(spec.id)
      if (host && !host.isDestroyed()) host.send('desk:closed', spec.id)
    }
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (ev) => ev.preventDefault())
  watchDisplays()
}

export function closeAllWidgets(): void {
  for (const e of wins.values()) if (!e.win.isDestroyed()) e.win.destroy()
  wins.clear()
  pending.clear()
}

/** Wire the main window: it opens widget windows with window.open('', 'pw-<id>'). */
export function attachDesktopHost(main: BrowserWindow, openExternal: (url: string) => void): void {
  host = main.webContents
  main.webContents.setWindowOpenHandler(({ url, frameName }) => {
    const spec = frameName.startsWith('pw-') ? pending.get(frameName.slice(3)) : undefined
    if (spec) return { action: 'allow', overrideBrowserWindowOptions: optionsFor(spec) }
    if (/^https?:\/\//i.test(url)) openExternal(url)
    return { action: 'deny' }
  })
  main.webContents.on('did-create-window', (win, details) => {
    const id = details.frameName.startsWith('pw-') ? details.frameName.slice(3) : ''
    const spec = pending.get(id)
    if (!spec) { win.destroy(); return }
    pending.delete(id)
    register(win, spec)
  })
  // A reload or crash loses the React trees inside the widget windows; the renderer reopens them.
  main.webContents.on('did-start-navigation', (ev) => { if (ev.isMainFrame && !ev.isSameDocument) closeAllWidgets() })
  main.webContents.on('render-process-gone', () => closeAllWidgets())
  main.on('closed', () => { closeAllWidgets(); host = null })
}

export function deskPrepare(spec: DeskSpec): Electron.Rectangle {
  pending.set(spec.id, spec)
  return visibleBounds(spec)
}

export function deskShow(id: string): void {
  const e = wins.get(id)
  if (!e || e.win.isDestroyed()) return
  applyEffects(e)
  applyLayer(e)
  applyMouse(e)
  if (!e.win.isVisible()) e.win.showInactive()
  asSkin(e.win)
  sendToBack(e)
}

export function deskUpdate(spec: DeskSpec): void {
  const e = wins.get(spec.id)
  if (!e || e.win.isDestroyed()) return
  const prev = e.spec
  e.spec = spec
  if (!e.drag) {
    const b = visibleBounds(spec)
    const cur = e.win.getBounds()
    if (b.x !== cur.x || b.y !== cur.y || b.width !== cur.width || b.height !== cur.height) placeWindow(e.win, b)
  }
  if (prev.material !== spec.material || prev.radius !== spec.radius || prev.w !== spec.w || prev.h !== spec.h) applyEffects(e)
  if (prev.clickThrough !== spec.clickThrough) applyMouse(e)
  if (prev.title !== spec.title) e.win.setTitle(spec.title || 'Panel')
}

export function deskClose(id: string): void {
  const e = wins.get(id)
  wins.delete(id)
  pending.delete(id)
  if (e && !e.win.isDestroyed()) e.win.destroy()
}

export function deskEdit(on: boolean): void {
  editing = on
  for (const e of wins.values()) {
    applyLayer(e)
    applyMouse(e)
  }
}

export function deskDrag(id: string, phase: 'start' | 'move', sx: number, sy: number, mode: 'move' | 'resize', free: boolean, grid: number): void {
  const e = wins.get(id)
  if (!e || e.win.isDestroyed()) return
  // The OS cursor, not the event's screen coordinates: those lag behind while the window itself moves.
  const c = screen.getCursorScreenPoint()
  void sx; void sy
  if (phase === 'start' || !e.drag) {
    const mates = mode === 'move' && e.spec.group
      ? [...wins.values()].filter((o) => o !== e && o.spec.group === e.spec.group && !o.win.isDestroyed()).map((o) => ({ e: o, start: o.win.getBounds() }))
      : []
    e.drag = { mode, sx: c.x, sy: c.y, start: e.win.getBounds(), mates }
    return
  }
  const d = e.drag
  const dx = Math.round(c.x - d.sx)
  const dy = Math.round(c.y - d.sy)
  let r: Electron.Rectangle = d.mode === 'move'
    ? { ...d.start, x: d.start.x + dx, y: d.start.y + dy }
    : { ...d.start, width: Math.max(MIN_W, d.start.width + dx), height: Math.max(MIN_H, d.start.height + dy) }
  if (!free) r = snap(id, r, d.mode, grid, d.mates.map((m) => m.e.spec.id))
  e.win.setBounds(r)
  if (d.mode === 'resize') applyShape(e)
  for (const m of d.mates) if (!m.e.win.isDestroyed()) m.e.win.setBounds({ ...m.start, x: m.start.x + r.x - d.start.x, y: m.start.y + r.y - d.start.y })
}

/** Ends a drag; returns the new bounds of the panel and of every panel that moved with it. */
export function deskDragEnd(id: string): { id: string; x: number; y: number; width: number; height: number }[] {
  const e = wins.get(id)
  if (!e || e.win.isDestroyed()) return []
  const moved = [e, ...(e.drag?.mates.map((m) => m.e) ?? [])].filter((x) => !x.win.isDestroyed())
  e.drag = undefined
  return moved.map((x) => {
    const b = x.win.getBounds()
    x.spec = { ...x.spec, x: b.x, y: b.y, w: b.width, h: b.height }
    applyEffects(x)
    sendToBack(x)
    return { id: x.spec.id, ...b }
  })
}

export function deskBounds(id: string): Electron.Rectangle | null {
  const e = wins.get(id)
  return e && !e.win.isDestroyed() ? e.win.getBounds() : null
}

/** A text field in a panel was clicked: let the panel take keyboard focus, still under other windows. */
export function deskFocus(id: string): void {
  const e = wins.get(id)
  if (!e || e.win.isDestroyed()) return
  e.interacting = true
  setFocus(e.win, true)
  e.win.focus()
  if (!e.win.isFocused()) {
    try { nat()?.foreground(hwnd(e.win)) } catch { /* ignore */ }
    e.win.webContents.focus()
  }
  setTimeout(() => sendToBack(e), 0)
}

/** Native right-click menu on a widget. Resolves with the chosen command. */
export function deskMenu(id: string, items: { id: string; label: string; checked?: boolean; type?: 'separator'; role?: 'cut' | 'copy' | 'paste'; submenu?: { id: string; label: string; checked?: boolean }[] }[]): Promise<string | null> {
  const e = wins.get(id)
  if (!e || e.win.isDestroyed()) return Promise.resolve(null)
  return new Promise((resolve) => {
    let picked: string | null = null
    const build = (list: typeof items): MenuItemConstructorOptions[] => list.map((it) => {
      if (it.type === 'separator') return { type: 'separator' }
      if (it.role && ['cut', 'copy', 'paste'].includes(it.role)) return { role: it.role, label: it.label }
      if (it.submenu) return { label: it.label, submenu: it.submenu.map((s) => ({ label: s.label, type: 'radio' as const, checked: !!s.checked, click: () => { picked = s.id } })) }
      return { label: it.label, ...(it.checked !== undefined ? { type: 'checkbox' as const, checked: it.checked } : {}), click: () => { picked = it.id } }
    })
    // A menu needs its window in front to close when you click elsewhere.
    menuOpen = true
    deskFocus(id)
    Menu.buildFromTemplate(build(items)).popup({
      window: e.win,
      callback: () => {
        menuOpen = false
        if (!e.win.isDestroyed() && !e.win.isFocused() && !editing) setFocus(e.win, false)
        sendToBack(e)
        setTimeout(() => resolve(picked), 0)
      }
    })
  })
}

export const widgetCount = (): number => wins.size
