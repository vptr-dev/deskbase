import { createRoot, type Root } from 'react-dom/client'
import { create } from 'zustand'
import { act, getData, openView, toast, useApp, useData } from '../store'
import type { DeskWidget, WidgetStyle, WidgetType } from '../types'
import { api, type DeskMenuItem, type DeskSpec, isDesktop } from './api'
import { uid } from './util'
import { refreshFromNotion } from './importer'
import { fullStyle, surfaceMaterial, widgetClass, widgetVars } from './widgetStyle'
import { WidgetBody, widgetDef, widgetTitle } from '../components/Widgets'
import { DocContext } from '../components/ui'
import { Icon } from '../components/Icon'

// ---------- shared UI state ----------
interface DeskUi { editing: boolean; selected: string | null }
export const useDesk = create<DeskUi>(() => ({ editing: false, selected: null }))

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

/** Where a new widget goes: next to the others on the main screen, without overlapping. */
async function freePlace(w: number, h: number): Promise<{ x: number; y: number }> {
  const displays = await api.displays().catch(() => [])
  const main = displays.find((d) => d.primary) ?? displays[0]
  const area = main?.workArea ?? { x: 0, y: 0, width: window.screen.width, height: window.screen.height }
  const taken = activePanels().filter((x) => !x.hidden && x.w > 0)
  const hit = (x: number, y: number): boolean => taken.some((o) => x < o.x + o.w + 12 && o.x < x + w + 12 && y < o.y + o.h + 12 && o.y < y + h + 12)
  for (let y = area.y + 24; y + h <= area.y + area.height - 24; y += 24) {
    for (let x = area.x + area.width - w - 24; x >= area.x + 24; x -= 24) if (!hit(x, y)) return { x, y }
  }
  return { x: Math.round(area.x + (area.width - w) / 2), y: Math.round(area.y + (area.height - h) / 2) }
}

const SIZE: Partial<Record<WidgetType, [number, number]>> = {
  clock: [300, 150], countdown: [220, 170], stat: [220, 170], progress: [220, 220], value: [300, 190], quickadd: [380, 76], page: [260, 80],
  focus: [300, 170], text: [420, 150], image: [320, 320], week: [560, 150], calendar: [300, 330], chart: [380, 260]
}

export async function addDesktopWidget(type: WidgetType, init: Partial<DeskWidget> = {}): Promise<string> {
  const def = widgetDef(type)
  const [w, h] = init.w && init.h ? [init.w, init.h] : SIZE[type] ?? [Math.max(240, def.w * 80), Math.max(140, def.h * 76)]
  const pos = await freePlace(w, h)
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
async function showMenu(id: string, editable: boolean): Promise<void> {
  const w = findDesk(id)
  if (!w) return
  const editing = useDesk.getState().editing
  const d = getData()
  const page = typeof w.config.pageId === 'string' ? d.pages[w.config.pageId] : undefined
  const allLocked = activePanels(d.desktop).every((x) => x.locked)
  const items: DeskMenuItem[] = [
    ...(editable ? [
      { id: 'cut', label: 'Cut', role: 'cut' },
      { id: 'copy', label: 'Copy', role: 'copy' },
      { id: 'paste', label: 'Paste', role: 'paste' },
      { id: 'sep0', label: '', type: 'separator' }
    ] as DeskMenuItem[] : []),
    { id: 'lock', label: w.locked ? 'Unlock movement' : 'Lock movement' },
    { id: 'edit', label: 'Edit panel…' },
    ...(page?.source?.kind === 'notion' ? [{ id: 'refresh', label: 'Refresh from Notion' }] : []),
    { id: 'sep1', label: '', type: 'separator' },
    { id: 'layer', label: 'Stay', submenu: [
      { id: 'layer:desktop', label: 'On the desktop', checked: w.layer === 'desktop' },
      { id: 'layer:normal', label: 'Like a window', checked: w.layer === 'normal' },
      { id: 'layer:top', label: 'Always on top', checked: w.layer === 'top' }
    ] },
    { id: 'click', label: 'Click-through', checked: !!(w.config.clickThrough) },
    { id: 'sep2', label: '', type: 'separator' },
    { id: 'arrange', label: editing ? 'Done arranging' : 'Arrange panels' },
    { id: 'lock-all', label: allLocked ? 'Unlock all panels' : 'Lock all panels' },
    { id: 'sep3', label: '', type: 'separator' },
    { id: 'duplicate', label: 'Duplicate' },
    { id: 'hide', label: 'Hide' },
    { id: 'remove', label: 'Remove' },
    { id: 'sep4', label: '', type: 'separator' },
    { id: 'open', label: 'Open app' }
  ]
  const cmd = await api.desk.menu(id, items)
  if (cmd) runCommand(id, cmd)
}

export function runCommand(id: string, cmd: string): void {
  const w = id ? findDesk(id) : undefined
  if (cmd === 'toggle') { act((d) => { d.desktop.enabled = !d.desktop.enabled }); return }
  if (cmd === 'arrange') { setDeskEditing(!useDesk.getState().editing); return }
  if (cmd === 'open') { openView('@desktop'); return }
  if (cmd.startsWith('space:')) { switchSpace(cmd.slice(6)); return }
  if (cmd === 'next-space') { cycleSpace(1); return }
  if (cmd === 'lock-all') {
    act((d) => { const list = activePanels(d.desktop); const lock = !list.every((x) => x.locked); for (const x of list) x.locked = lock })
    return
  }
  if (!w) return
  switch (cmd) {
    case 'edit': useDesk.setState({ selected: id }); openView('@desktop'); break
    case 'lock': patchDesk(id, (x) => { x.locked = !x.locked }); break
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
      if (cmd.startsWith('layer:')) patchDesk(id, (x) => { x.layer = cmd.slice(6) as DeskWidget['layer'] })
  }
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
  const movable = editing || !w.locked

  const drag = (e: React.PointerEvent, mode: 'move' | 'resize'): void => {
    if (e.button !== 0 || !movable) return
    const t = e.target as HTMLElement
    if (mode === 'move' && !editing && t.closest('button, input, textarea, select, a, label, .check')) return
    e.preventDefault()
    e.stopPropagation()
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    api.desk.drag(id, 'start', e.screenX, e.screenY, mode, e.altKey, grid)
    doc.documentElement.classList.add('dw-dragging')
    const move = (ev: PointerEvent): void => api.desk.drag(id, 'move', ev.screenX, ev.screenY, mode, ev.altKey, grid)
    const up = async (): Promise<void> => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      doc.documentElement.classList.remove('dw-dragging')
      const b = await api.desk.dragEnd(id)
      if (b) patchDesk(id, (x) => { x.x = b.x; x.y = b.y; x.w = b.width; x.h = b.height })
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }

  return (
    <DocContext.Provider value={doc}>
      <div
        className={`dw wt-${w.type} ${widgetClass(st)} ${editing ? 'editing' : ''} ${selected && editing ? 'selected' : ''} ${w.locked ? 'locked' : ''}`}
        data-theme={st.theme === 'auto' ? undefined : st.theme}
        style={widgetVars(st)}
        onContextMenu={(e) => { e.preventDefault(); showMenu(id, !!(e.target as HTMLElement).closest('input, textarea, [contenteditable="true"]')) }}
        onPointerDown={(e) => { if (editing) useDesk.setState({ selected: id }) ; if (!st.header || editing) drag(e, 'move') }}
      >
        {st.header && title && (
          <div className="dw-head" onPointerDown={(e) => drag(e, 'move')}>
            <span className="widget-title ellipsis">{title}</span>
          </div>
        )}
        <div className="dw-body"><WidgetBody w={w} setConfig={(k, v) => patchDesk(id, (x) => { x.config[k] = v }, 'dcfg:' + id + k)} /></div>
        {editing && (
          <div className="dw-edit">
            <span className="dw-edit-label">{widgetDef(w.type).name}{w.locked ? ' · locked' : ''}</span>
            <span className="dw-edit-size">{Math.round(w.w)} × {Math.round(w.h)}</span>
          </div>
        )}
        {movable && <div className="dw-resize" title="Resize" onPointerDown={(e) => drag(e, 'resize')}><Icon name="resize" size={11} /></div>}
      </div>
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
    material: st.material === 'auto' ? 'glass' : st.material, layer: w.layer, radius: st.radius, clickThrough: !!w.config.clickThrough,
    title: widgetTitle(w, getData()) || widgetDef(w.type).name
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
  let last = getData().desktop
  let lastSurface = surfaceMaterial(getData().settings.look, true)
  const unsub = useApp.subscribe((s) => {
    const surface = surfaceMaterial(s.data.settings.look, true)
    if (s.data.desktop !== last || surface !== lastSurface) { last = s.data.desktop; lastSurface = surface; reconcile() }
  })
  // Titles and contents follow the data on their own; specs only change with the desktop settings.
  const offClosed = api.desk.onClosed((id) => {
    const o = open.get(id)
    if (!o) return
    open.delete(id)
    try { o.root.unmount() } catch { /* ignore */ }
    // Closed from outside (for example Alt+F4): treat it as hidden.
    if (findDesk(id) && !findDesk(id)!.hidden) patchDesk(id, (x) => { x.hidden = true })
  })
  const offCmd = api.desk.onCommand((id, cmd) => runCommand(id, cmd))
  const onUnload = (): void => { for (const id of [...open.keys()]) closeWidget(id) }
  window.addEventListener('beforeunload', onUnload)
  return () => { unsub(); offClosed(); offCmd(); window.removeEventListener('beforeunload', onUnload) }
}

/** Current on-screen bounds of a widget (after the user moved it). */
export const liveBounds = (id: string): Promise<{ x: number; y: number; width: number; height: number } | null> => api.desk.bounds(id)
export const isOpenOnDesktop = (id: string): boolean => open.has(id)
