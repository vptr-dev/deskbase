import { WidgetActionHost } from '../components/WidgetActionHost'
import { PanelBody } from '../components/PanelBody'
import { createRoot, type Root } from 'react-dom/client'
import { create } from 'zustand'
import { act, getData, openView, toast, useApp, useData } from '../store'
import type { DeskWidget, WidgetStyle, WidgetType } from '../types'
import { api, type DeskSpec, type Backdrop, type DisplayInfo, isDesktop } from './api'
import { useEffect, useState } from 'react'
import { uid } from './util'
import { refreshFromNotion } from './importer'
import { fullStyle, surfaceMaterial, widgetClass, widgetVars } from './widgetStyle'
import { WidgetBody, widgetDef, widgetTitle } from '../components/Widgets'
import { DocContext } from '../components/ui'
import { Icon } from '../components/Icon'
import { DESK_LOOKS } from '../components/WidgetConfig'

// ---------- shared UI state ----------
interface DeskUi { editing: boolean; selected: string | null; adding?: boolean }
export const useDesk = create<DeskUi>(() => ({ editing: false, selected: null }))

// ---------- frost ----------
// Windows 11 blurs a window's whole rectangle, ignoring its rounded shape, so Blur and Frosted panels
// blur what is behind them themselves (a small picture of the desktop, taken every few seconds).
interface WallState { wp: Backdrop | null; displays: DisplayInfo[] }
export const useWall = create<WallState>(() => ({ wp: null, displays: [] }))
const frosted = (m: string): boolean => m === 'blur' || m === 'acrylic'

let loadingWall = false
async function loadWall(): Promise<void> {
  if (loadingWall) return
  loadingWall = true
  try {
    const [r, displays] = await Promise.all([api.desk.backdrop(useWall.getState().wp?.stamp), api.displays()])
    const same = JSON.stringify(displays) === JSON.stringify(useWall.getState().displays)
    if (r && 'same' in r) { if (!same) useWall.setState({ displays }); return }
    if (!r?.displays.length) return
    await Promise.all(r.displays.map(async display => {
      const image = new Image()
      image.src = display.url
      await image.decode()
    }))
    useWall.setState({ wp: r, displays })
  } catch { /* Keep the last decoded wallpaper if capture or decoding failed. */ }
  finally { loadingWall = false }
}

/** Where a panel's window is on screen, live while it is dragged. */
function useScreenPos(doc: Document, x: number, y: number): { x: number; y: number } {
  const [pos, setPos] = useState({ x, y })
  useEffect(() => {
    const win = doc.defaultView
    if (!win) return
    let raf = 0
    const read = (): void => setPos((p) => (p.x === win.screenX && p.y === win.screenY ? p : { x: win.screenX, y: win.screenY }))
    const loop = (): void => { read(); if (doc.documentElement.classList.contains('dw-dragging')) raf = win.requestAnimationFrame(loop); else raf = 0 }
    const t = win.setInterval(() => { read(); if (!raf && doc.documentElement.classList.contains('dw-dragging')) loop() }, 300)
    read()
    return () => { win.clearInterval(t); if (raf) win.cancelAnimationFrame(raf) }
  }, [doc, x, y])
  return pos
}

function Frost({ doc, w, material, radius, amount: blur }: { doc: Document; w: DeskWidget; material: string; radius: number; amount: number }): JSX.Element | null {
  const wp = useWall((s) => s.wp)
  const displays = useWall((s) => s.displays)
  const sat = useData((d) => d.settings.look.saturation)
  const pos = useScreenPos(doc, w.x, w.y)
  if (!wp || !frosted(material) || !displays.length) return null
  const cx = pos.x + w.w / 2
  const cy = pos.y + w.h / 2
  const d = displays.find((x) => cx >= x.bounds.x && cx < x.bounds.x + x.bounds.width && cy >= x.bounds.y && cy < x.bounds.y + x.bounds.height) ?? displays.find((x) => x.primary) ?? displays[0]
  const img = wp.displays.find((x) => x.id === d.id)
  if (!img) return null
  const amount = Math.round((blur ?? 28) * (material === 'acrylic' ? 1.8 : 1))
  return (
    <div className="dw-frost" style={{ borderRadius: radius }} aria-hidden>
      <div className="dw-frost-img" style={{
        left: d.bounds.x - pos.x, top: d.bounds.y - pos.y, width: d.bounds.width, height: d.bounds.height,
        backgroundImage: `url("${img.url}")`, backgroundSize: '100% 100%',
        filter: `blur(${amount}px) saturate(${(sat || 160) / 100})`
      }} />
    </div>
  )
}

export function setDeskEditing(on: boolean): void {
  useDesk.setState({ editing: on })
  api.desk.edit(on).catch(() => {})
}

export const findDesk = (id: string): DeskWidget | undefined => getData().desktop.widgets.find((w) => w.id === id)

/** Panels of the workspace on screen. */
export const activePanels = (d = getData().desktop): DeskWidget[] => d.widgets.filter((w) => w.space === d.active)

export function switchSpace(id: string): void {
  const d = getData().desktop
  if (d.active === id || !d.spaces.some((s) => s.id === id)) return
  act((x) => { x.desktop.active = id; x.desktop.enabled = true })
  useDesk.setState({ selected: null })
}

export function addSpace(copyCurrent = false): string {
  const id = uid()
  act((x) => {
    const n = x.desktop.spaces.length + 1
    x.desktop.spaces.push({ id, name: `Workspace ${n}`, icon: 'layout' })
    if (copyCurrent) {
      for (const w of x.desktop.widgets.filter((w) => w.space === x.desktop.active)) {
        x.desktop.widgets.push({ ...JSON.parse(JSON.stringify(w)), id: uid(), space: id, createdAt: Date.now() })
      }
    }
    x.desktop.active = id
  })
  return id
}

export function removeSpace(id: string): void {
  const d = getData().desktop
  if (d.spaces.length < 2) return
  const name = d.spaces.find((s) => s.id === id)?.name ?? 'Workspace'
  act((x) => {
    x.desktop.spaces = x.desktop.spaces.filter((s) => s.id !== id)
    x.desktop.widgets = x.desktop.widgets.filter((w) => w.space !== id)
    if (x.desktop.active === id) x.desktop.active = x.desktop.spaces[0].id
  })
  toast(`${name} deleted`, { undo: true })
}

/** Next or previous workspace (tray, hotkey). */
export function cycleSpace(step: number): void {
  const d = getData().desktop
  const i = d.spaces.findIndex((s) => s.id === d.active)
  const next = d.spaces[(i + step + d.spaces.length) % d.spaces.length]
  if (next) { switchSpace(next.id); toast(next.name, { icon: 'monitor' }) }
}

export function patchDesk(id: string, fn: (w: DeskWidget) => void, key?: string): void {
  act((d) => { const w = d.desktop.widgets.find((x) => x.id === id); if (w) fn(w) }, { key })
}

/**
 * A ready-made column of panels at the right edge of the main screen: clock and daylight, the month,
 * the weather, system use and four quick timers. Every piece is its own panel.
 */
export async function addDeskSet(): Promise<void> {
  const displays = await api.displays().catch(() => [])
  const main = displays.find((d) => d.primary) ?? displays[0]
  const area = main?.workArea ?? { x: 0, y: 0, width: window.screen.width, height: window.screen.height }
  const gap = 12
  const tile = Math.max(170, Math.min(260, Math.floor((area.height - 48 - gap * 3) / 4.2)))
  const wide = tile * 2 + gap
  const low = Math.round(tile * 0.92)
  const x0 = area.x + area.width - 24 - wide
  let y = area.y + 24
  const t = Math.floor((tile - gap) / 2)
  const items: { type: WidgetType; x: number; y: number; w: number; h: number; config?: Record<string, any> }[] = []
  items.push({ type: 'clock', x: x0, y, w: tile, h: tile, config: { style: 'ring' } })
  items.push({ type: 'daylight', x: x0 + tile + gap, y, w: tile, h: tile })
  y += tile + gap
  items.push({ type: 'calendar', x: x0, y, w: wide, h: low, config: { list: true } })
  y += low + gap
  items.push({ type: 'weather', x: x0, y, w: wide, h: low, config: { days: 4 } })
  y += low + gap
  items.push({ type: 'system', x: x0, y, w: tile, h: tile })
  ;[1, 5, 15, 30].forEach((m, i) => items.push({ type: 'timer', x: x0 + tile + gap + (i % 2) * (t + gap), y: y + Math.floor(i / 2) * (t + gap), w: t, h: t, config: { minutes: m } }))
  act((d) => {
    d.desktop.enabled = true
    for (const it of items) {
      const def = widgetDef(it.type)
      d.desktop.widgets.push({ id: uid(), type: it.type, config: { ...(def.config ?? {}), ...(it.config ?? {}) }, style: {}, layer: 'desktop', space: d.desktop.active, createdAt: Date.now(), x: it.x, y: it.y, w: it.w, h: it.h })
    }
  })
  toast('Panels added to your desktop')
}

/** Where a new widget goes: next to the others on the main screen, without overlapping. */
async function freePlace(w: number, h: number, display?: number): Promise<{ x: number; y: number }> {
  const displays = await api.displays().catch(() => [])
  const main = displays.find((d) => d.id === display) ?? displays.find((d) => d.primary) ?? displays[0]
  const area = main?.workArea ?? { x: 0, y: 0, width: window.screen.width, height: window.screen.height }
  const taken = activePanels().filter((x) => !x.hidden && x.w > 0)
  const hit = (x: number, y: number): boolean => taken.some((o) => x < o.x + o.w + 12 && o.x < x + w + 12 && y < o.y + o.h + 12 && o.y < y + h + 12)
  for (let y = area.y + 24; y + h <= area.y + area.height - 24; y += 24) {
    for (let x = area.x + area.width - w - 24; x >= area.x + 24; x -= 24) if (!hit(x, y)) return { x, y }
  }
  return { x: Math.round(area.x + (area.width - w) / 2), y: Math.round(area.y + (area.height - h) / 2) }
}

const SIZE: Partial<Record<WidgetType, [number, number]>> = {
  clock: [260, 260], countdown: [220, 170], stat: [220, 170], progress: [220, 220], value: [300, 190], quickadd: [380, 76], page: [260, 80],
  focus: [300, 170], text: [420, 150], image: [320, 320], week: [560, 150], calendar: [560, 270], chart: [380, 260],
  weather: [560, 270], daylight: [260, 260], system: [260, 260], timer: [128, 128], sections: [320, 420], table: [440, 260], tasks: [320, 300],
  worldclock: [300, 240], stopwatch: [260, 220], timeleft: [300, 230], moon: [300, 150], launcher: [360, 130], search: [420, 64], quote: [420, 140], battery: [180, 180],
  dbchart: [320, 260], activity: [440, 200], deadlines: [300, 320], events: [300, 340], feed: [320, 380], github: [380, 360], mail: [320, 380], todoist: [300, 360], media: [380, 150]
}

/** The size a new panel of this type starts at. */
export function panelSize(type: WidgetType): [number, number] {
  const def = widgetDef(type)
  return SIZE[type] ?? [Math.max(240, def.w * 80), Math.max(140, def.h * 76)]
}

export async function addDesktopWidget(type: WidgetType, init: Partial<DeskWidget> = {}, display?: number): Promise<string> {
  const def = widgetDef(type)
  const [w, h] = init.w && init.h ? [init.w, init.h] : panelSize(type)
  const pos = typeof init.x === 'number' && typeof init.y === 'number' ? { x: init.x, y: init.y } : await freePlace(w, h, display)
  const id = uid()
  act((d) => {
    d.desktop.enabled = true
    d.desktop.widgets.push({ id, type, config: { ...(def.config ?? {}) }, style: {}, layer: 'desktop', space: d.desktop.active, createdAt: Date.now(), ...init, x: pos.x, y: pos.y, w, h })
  })
  useDesk.setState({ selected: id })
  toast(`${def.name} is on your desktop`)
  return id
}

// ---------- context menu ----------
export function runCommand(id: string, cmd: string): void {
  const w = id ? findDesk(id) : undefined
  if (cmd === 'toggle') { act((d) => { d.desktop.enabled = !d.desktop.enabled }); return }
  if (cmd === 'arrange') { setDeskEditing(!useDesk.getState().editing); return }
  if (cmd === 'open') { openView('@desktop'); return }
  if (cmd === 'add') { useDesk.setState({ adding: true }); openView('@desktop'); void api.showMain(); return }
  if (cmd.startsWith('space:')) { switchSpace(cmd.slice(6)); return }
  if (cmd === 'next-space') { cycleSpace(1); return }
  if (cmd === 'lock-all') {
    act((d) => { for (const x of activePanels(d.desktop)) x.locked = true })
    return
  }
  if (!w) return
  switch (cmd) {
    case 'edit': useDesk.setState({ selected: id }); openView('@desktop'); break
    case 'look:shared': patchDesk(id, (x) => { x.style = {} }); break
    case 'lock': patchDesk(id, (x) => { x.locked = !x.locked }); break
    case 'header': {
      const on = fullStyle(getData().desktop.style, w.style).header
      patchDesk(id, (x) => { x.style = { ...x.style, header: !on } })
      break
    }
    case 'group': {
      const ids = touchingPanels(w).map((x) => x.id)
      const gid = getData().desktop.widgets.find((x) => ids.includes(x.id) && x.group)?.group ?? uid()
      act((d) => { for (const x of d.desktop.widgets) if (ids.includes(x.id) || (x.group && d.desktop.widgets.some((y) => ids.includes(y.id) && y.group === x.group))) x.group = gid })
      toast(`${ids.length} panels now move together`)
      break
    }
    case 'ungroup':
      act((d) => {
        const g = w.group
        for (const x of d.desktop.widgets) if (x.id === id) x.group = null
        const rest = d.desktop.widgets.filter((x) => x.group === g)
        if (rest.length < 2) for (const x of rest) x.group = null
      })
      break
    case 'timer-reset': patchDesk(id, (x) => { x.config.endsAt = null; x.config.left = null }); break
    case 'refresh':
      if (typeof w.config.pageId === 'string') refreshFromNotion([w.config.pageId]).catch(() => toast('Could not refresh from Notion'))
      break
    case 'click':
      patchDesk(id, (x) => { x.config.clickThrough = !x.config.clickThrough })
      if (!w.config.clickThrough) toast('Clicks now pass through. Use Arrange panels or the Desktop page to change it.')
      break
    case 'duplicate': {
      const copy: DeskWidget = JSON.parse(JSON.stringify(w))
      copy.id = uid()
      copy.x += 24
      copy.y += 24
      copy.createdAt = Date.now()
      act((d) => { d.desktop.widgets.push(copy) })
      break
    }
    case 'hide': patchDesk(id, (x) => { x.hidden = true }); toast('Panel hidden. Show it again from the Desktop page.', { undo: true }); break
    case 'remove': act((d) => { d.desktop.widgets = d.desktop.widgets.filter((x) => x.id !== id) }); toast('Panel removed', { undo: true }); break
    default:
      if (cmd.startsWith('look:')) { const l = DESK_LOOKS.find((x) => 'look:' + x.id === cmd); if (l) patchDesk(id, (x) => { x.style = { ...x.style, ...l.style } }) } else if (cmd.startsWith('timer:')) patchDesk(id, (x) => { x.config.minutes = Number(cmd.slice(6)) || 5; x.config.endsAt = null; x.config.left = null })
  }
}

/** This panel and every panel that touches it (directly or through others), in the workspace on screen. */
export function touchingPanels(w: DeskWidget): DeskWidget[] {
  const list = activePanels().filter((x) => !x.hidden)
  const near = (a: DeskWidget, b: DeskWidget): boolean => {
    const t = 24
    const overlapX = a.x < b.x + b.w + t && b.x < a.x + a.w + t
    const overlapY = a.y < b.y + b.h + t && b.y < a.y + a.h + t
    return overlapX && overlapY
  }
  const out = [w]
  for (let i = 0; i < out.length; i++) for (const x of list) if (!out.includes(x) && near(out[i], x)) out.push(x)
  return out
}

// ---------- the widget inside its window ----------
function DeskWidgetView({ id, doc }: { id: string; doc: Document }): JSX.Element | null {
  const w = useData((d) => d.desktop.widgets.find((x) => x.id === id))
  const base = useData((d) => d.desktop.style)
  const auto = useData((d) => surfaceMaterial(d.settings.look, true))
  const grid = useData((d) => (d.desktop.snap ? d.desktop.grid : 1))
  const data = useData((d) => d)
  const editing = useDesk((s) => s.editing)
  const selected = useDesk((s) => s.selected === id)
  if (!w) return null
  const st = fullStyle(base, w.style, auto)
  const title = widgetTitle(w, data)
  const movable = !w.locked

  // Drag anywhere on a panel. On buttons and links it starts once the pointer has moved a little,
  // so a plain click still clicks; text fields never drag.
  const drag = (e: React.PointerEvent, mode: 'move' | 'resize'): void => {
    if (e.button !== 0 || !movable) return
    const t = e.target as HTMLElement
    if (mode === 'move' && !editing && t.closest('input, textarea, select, [contenteditable="true"]')) return
    const soft = mode === 'move' && !editing && !!t.closest('button, a, label, .check, .mb-todo, .task-row, [role="button"]')
    e.stopPropagation()
    const sx = e.screenX
    const sy = e.screenY
    const pid = e.pointerId
    const el = e.currentTarget as HTMLElement
    const win = doc.defaultView ?? window
    let started = false
    const begin = (alt: boolean): void => {
      started = true
      try { el.setPointerCapture(pid) } catch { /* pointer already gone */ }
      api.desk.drag(id, 'start', sx, sy, mode, alt, grid)
      doc.documentElement.classList.add('dw-dragging')
    }
    if (!soft) { e.preventDefault(); begin(e.altKey) }
    const move = (ev: PointerEvent): void => {
      if (!started) { if (Math.hypot(ev.screenX - sx, ev.screenY - sy) < 5) return; begin(ev.altKey) }
      api.desk.drag(id, 'move', ev.screenX, ev.screenY, mode, ev.altKey, grid)
    }
    const up = async (): Promise<void> => {
      win.removeEventListener('pointermove', move)
      win.removeEventListener('pointerup', up)
      win.removeEventListener('pointercancel', up)
      if (!started) return
      doc.documentElement.classList.remove('dw-dragging')
      if (soft) {
        const swallow = (ce: Event): void => { ce.stopPropagation(); ce.preventDefault() }
        win.addEventListener('click', swallow, { capture: true, once: true })
        setTimeout(() => win.removeEventListener('click', swallow, { capture: true }), 60)
      }
      const moved = await api.desk.dragEnd(id)
      if (moved.length) {
        act((d) => {
          for (const b of moved) {
            const x = d.desktop.widgets.find((y) => y.id === b.id)
            if (x) { x.x = b.x; x.y = b.y; x.w = b.width; x.h = b.height }
          }
        })
      }
    }
    win.addEventListener('pointermove', move)
    win.addEventListener('pointerup', up)
    win.addEventListener('pointercancel', up)
  }

  return (
    <DocContext.Provider value={doc}>
      <Frost doc={doc} w={w} material={st.material} radius={st.radius} amount={st.blur} />
      <WidgetActionHost widget={w} name={widgetDef(w.type).name} source={{page:null,id}} desktopId={id}
        resetTimer={() => runCommand(id,'timer-reset')}
        globalActions={[
          { label: w.locked ? 'Position locked' : 'Lock panel', icon: 'lock', disabled: !!w.locked, onClick: () => runCommand(id,'lock') },
          { label: 'Lock all panels', icon: 'lock', disabled: activePanels().every(x => x.locked), onClick: () => runCommand(id,'lock-all') },
          { label: 'Duplicate panel', icon: 'copy', onClick: () => runCommand(id,'duplicate') },
          { label: 'Hide panel', icon: 'eyeOff', onClick: () => runCommand(id,'hide') }
        ]}
        className={`dw wt-${w.type} ${widgetClass(st)} ${editing && movable ? 'editing' : ''} ${selected && editing ? 'selected' : ''} ${w.locked ? 'locked' : ''}`}
        data-theme={st.theme === 'auto' ? undefined : st.theme}
        style={widgetVars(st)}
        onPointerDown={(e) => {
          if (editing) useDesk.setState({ selected: id })
          // Panels don't take focus on a click; a text field asks for it so you can type.
          if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) {
            const field = e.target as HTMLElement
            api.desk.focus(id).then(() => field.focus()).catch(() => {})
          }
          drag(e, 'move')
        }}
      >
        {st.header && title && (
          <div className="dw-head">
            <span className="widget-title ellipsis">{title}</span>
          </div>
        )}
        <PanelBody desktop><WidgetBody w={w} setConfig={(k, v) => patchDesk(id, (x) => { x.config[k] = v }, 'dcfg:' + id + k)} /></PanelBody>
        {editing && movable && (
          <div className="dw-edit">
            <span className="dw-edit-label">{widgetDef(w.type).name}{w.locked ? ' · locked' : ''}</span>
            <span className="dw-edit-size">{Math.round(w.w)} × {Math.round(w.h)}</span>
          </div>
        )}
        {movable && <div className="dw-resize" title="Resize" onPointerDown={(e) => drag(e, 'resize')}><Icon name="resize" size={11} /></div>}
      </WidgetActionHost>
    </DocContext.Provider>
  )
}

// ---------- window management ----------
interface Open { win: Window; root: Root; spec: DeskSpec }
const open = new Map<string, Open>()

function specOf(w: DeskWidget, base: WidgetStyle): DeskSpec {
  const st = fullStyle(base, w.style, surfaceMaterial(getData().settings.look, true))
  return {
    id: w.id, x: w.x, y: w.y, w: w.w, h: w.h, displayId: w.config.displayId ?? null,
    // With the wallpaper at hand, the panel draws its own blur (see Frost) instead of Windows'.
    material: st.material === 'auto' ? 'glass' : frosted(st.material) && useWall.getState().wp ? 'glass' : st.material, layer: 'desktop', radius: st.radius, clickThrough: !!w.config.clickThrough,
    title: widgetTitle(w, getData()) || widgetDef(w.type).name, group: w.group ?? null
  }
}
const same = (a: DeskSpec, b: DeskSpec): boolean => JSON.stringify(a) === JSON.stringify(b)

/** The app's stylesheets, copied as they are (rule-by-rule copies lose shorthands that use variables). */
const hostCssNodes = (): Element[] => Array.from(document.head.querySelectorAll('link[rel="stylesheet"], style'))
const cssSignature = (): string => hostCssNodes().map((n) => (n instanceof HTMLLinkElement ? 'L' + n.href : 'S' + (n.textContent ?? ''))).join('')

/** Mirrors the stylesheets into a widget window; resolves once linked sheets have loaded. */
function syncStyles(doc: Document): Promise<void> {
  const sig = cssSignature()
  if (doc.head.dataset.cssSig === sig) return Promise.resolve()
  const loads: Promise<void>[] = []
  const added: Element[] = []
  for (const n of hostCssNodes()) {
    let c: HTMLElement
    if (n instanceof HTMLLinkElement) {
      const l = doc.createElement('link')
      l.rel = 'stylesheet'
      l.href = n.href
      loads.push(new Promise((r) => { l.onload = () => r(); l.onerror = () => r() }))
      c = l
    } else {
      c = doc.createElement('style')
      c.textContent = n.textContent
    }
    c.setAttribute('data-host-css', '')
    added.push(c)
  }
  // Add the new copies first, then drop the old ones, so nothing flashes unstyled.
  const old = Array.from(doc.head.querySelectorAll('[data-host-css]'))
  for (const c of added) doc.head.appendChild(c)
  const done = Promise.race([Promise.all(loads).then(() => undefined), new Promise<void>((r) => setTimeout(r, 1500))])
  done.then(() => { for (const o of old) o.remove() })
  doc.head.dataset.cssSig = sig
  return done
}

function syncRoot(doc: Document): void {
  const from = document.documentElement
  const to = doc.documentElement
  for (const a of Array.from(to.attributes)) if (!from.hasAttribute(a.name)) to.removeAttribute(a.name)
  for (const a of Array.from(from.attributes)) if (to.getAttribute(a.name) !== a.value) to.setAttribute(a.name, a.value)
  to.classList.add('dw-root')
  to.classList.remove('mica')
}

let observers: MutationObserver[] = []
function watchHost(): void {
  if (observers.length) return
  const rootObs = new MutationObserver(() => { for (const o of open.values()) if (!o.win.closed) syncRoot(o.win.document) })
  rootObs.observe(document.documentElement, { attributes: true })
  let t: ReturnType<typeof setTimeout> | null = null
  const headObs = new MutationObserver(() => {
    if (t) clearTimeout(t)
    t = setTimeout(() => {
      for (const o of open.values()) if (!o.win.closed) syncStyles(o.win.document)
    }, 120)
  })
  headObs.observe(document.head, { childList: true, subtree: true, characterData: true })
  observers = [rootObs, headObs]
}

async function openWidget(w: DeskWidget, spec: DeskSpec): Promise<void> {
  await api.desk.prepare(spec)
  const win = window.open('about:blank', 'pw-' + w.id, 'popup')
  if (!win) return
  const doc = win.document
  doc.title = spec.title
  if (!doc.head) doc.documentElement.prepend(doc.createElement('head'))
  if (!doc.body) doc.documentElement.appendChild(doc.createElement('body'))
  doc.body.innerHTML = ''
  const mount = doc.createElement('div')
  mount.id = 'root'
  doc.body.appendChild(mount)
  const styled = syncStyles(doc)
  syncRoot(doc)
  const root = createRoot(mount)
  root.render(<DeskWidgetView id={w.id} doc={doc} />)
  open.set(w.id, { win, root, spec })
  // Show once the styles are in and React has painted, so the window never flashes empty.
  styled.then(() => { if (!win.closed) win.requestAnimationFrame(() => win.requestAnimationFrame(() => { api.desk.show(w.id).catch(() => {}) })) })
}

function closeWidget(id: string): void {
  const o = open.get(id)
  if (!o) return
  open.delete(id)
  try { o.root.unmount() } catch { /* already gone */ }
  api.desk.close(id).catch(() => {})
  try { if (!o.win.closed) o.win.close() } catch { /* ignore */ }
}

let running = false
let queued = false
async function reconcile(): Promise<void> {
  if (running) { queued = true; return }
  running = true
  try {
    const d = getData()
    const want = d.desktop.enabled ? activePanels(d.desktop).filter((w) => !w.hidden) : []
    for (const id of [...open.keys()]) if (!want.some((w) => w.id === id)) closeWidget(id)
    for (const w of want) {
      const spec = specOf(w, d.desktop.style)
      const cur = open.get(w.id)
      if (!cur || cur.win.closed) {
        if (cur) open.delete(w.id)
        await openWidget(w, spec)
      } else if (!same(cur.spec, spec)) {
        cur.spec = spec
        if (cur.win.document.title !== spec.title) cur.win.document.title = spec.title
        await api.desk.update(spec)
      }
    }
    await api.desk.active(want.length > 0 || d.desktop.enabled, d.desktop.spaces.map((s) => ({ id: s.id, name: s.name })), d.desktop.active)
  } finally {
    running = false
    if (queued) { queued = false; reconcile() }
  }
}

/** Starts the desktop widgets for this session. Call once after the data has loaded. */
export function startDesktop(): () => void {
  if (!isDesktop) return () => {}
  watchHost()
  reconcile()
  let wallTimer: ReturnType<typeof setInterval> | null = null
  const wallNeeded = (): boolean => {
    const d = getData()
    return d.desktop.widgets.some((w) => !w.hidden && frosted(fullStyle(d.desktop.style, w.style, surfaceMaterial(d.settings.look, true)).material))
  }
  const syncWall = (): void => {
    if (wallNeeded()) {
      if (!wallTimer) { void loadWall(); wallTimer = setInterval(() => { void loadWall() }, 3000) }
    } else if (wallTimer) { clearInterval(wallTimer); wallTimer = null }
  }
  syncWall()
  let lastWp = useWall.getState().wp
  const offWall = useWall.subscribe((s) => { const was = Boolean(lastWp); lastWp = s.wp; if (Boolean(s.wp) !== was) reconcile() })
  let last = getData().desktop
  let lastSurface = surfaceMaterial(getData().settings.look, true)
  const unsub = useApp.subscribe((s) => {
    const surface = surfaceMaterial(s.data.settings.look, true)
    if (s.data.desktop !== last || surface !== lastSurface) { last = s.data.desktop; lastSurface = surface; reconcile(); syncWall() }
  })
  // Titles and contents follow the data on their own; specs only change with the desktop settings.
  const offClosed = api.desk.onClosed((id) => {
    const o = open.get(id)
    if (!o) return
    open.delete(id)
    try { o.root.unmount() } catch { /* ignore */ }
    // Closed from outside: panels belong to the desktop, so a restart of Explorer closes them too.
    // They come back on their own a moment later.
    setTimeout(() => { reconcile() }, 2500)
  })
  const offCmd = api.desk.onCommand((id, cmd) => runCommand(id, cmd))
  const onUnload = (): void => { for (const id of [...open.keys()]) closeWidget(id) }
  window.addEventListener('beforeunload', onUnload)
  return () => { unsub(); offClosed(); offCmd(); offWall(); if (wallTimer) clearInterval(wallTimer); window.removeEventListener('beforeunload', onUnload) }
}

/** Current on-screen bounds of a widget (after the user moved it). */
export const liveBounds = (id: string): Promise<{ x: number; y: number; width: number; height: number } | null> => api.desk.bounds(id)
export const isOpenOnDesktop = (id: string): boolean => open.has(id)
