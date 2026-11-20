import { useEffect, useRef, useState } from 'react'
import { act, toast, updatePage, useData } from '../store'
import type { Widget, WidgetStyle, WidgetType } from '../types'
import { type AnyWidget, WIDGETS, WidgetBody, widgetDef, widgetTitle } from '../components/Widgets'
import { StyleFields, TitleField, WidgetConfigFields } from '../components/WidgetConfig'
import { Button, Modal, Segmented, useDoc } from '../components/ui'
import { Icon } from '../components/Icon'
import { isDesktop } from '../lib/api'
import { uid } from '../lib/util'
import { fullStyle, surfaceMaterial, widgetClass, widgetVars } from '../lib/widgetStyle'
import { addDesktopWidget } from '../lib/desktop'

const overlap = (a: Widget, b: Widget): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/** Push widgets that overlap the moved one further down until nothing overlaps. */
function settle(list: Widget[], movedId: string): void {
  const moved = list.find((w) => w.id === movedId)
  if (!moved) return
  const queue = [moved]
  for (let guard = 0; queue.length && guard < 500; guard++) {
    const a = queue.shift()!
    for (const b of list) {
      if (b !== a && b !== moved && overlap(a, b)) { b.y = a.y + a.h; queue.push(b) }
    }
  }
}

function freeSpot(list: Widget[], w: number, h: number, cols: number): { x: number; y: number } {
  for (let y = 0; y < 200; y++) {
    for (let x = 0; x + w <= cols; x++) {
      const probe = { id: '', type: 'note' as WidgetType, x, y, w, h, config: {} }
      if (!list.some((o) => overlap(o, probe))) return { x, y }
    }
  }
  return { x: 0, y: Math.max(0, ...list.map((o) => o.y + o.h)) }
}

const patchWidget = (pageId: string, id: string, fn: (w: Widget) => void, key?: string): void =>
  act((d) => { const w = d.pages[pageId]?.widgets?.find((x) => x.id === id); if (w) fn(w) }, { key })

/** Widget picker grouped by kind. Used by dashboards and the desktop. */
export function WidgetGallery({ onPick, extra }: { onPick: (type: WidgetType) => void; extra?: JSX.Element }): JSX.Element {
  const groups = [...new Set(WIDGETS.map((w) => w.group))]
  return (
    <div className="widget-gallery-groups">
      {extra}
      {groups.map((g) => (
        <div key={g}>
          <div className="section-label">{g}</div>
          <div className="widget-gallery">
            {WIDGETS.filter((w) => w.group === g && w.type !== 'dashboard').map((w) => (
              <button key={w.type} className="widget-pick glass" onClick={() => onPick(w.type)}>
                <span className="widget-pick-icon"><Icon name={w.icon} size={18} /></span>
                <span className="strong">{w.name}</span>
                <span className="muted small">{w.desc}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Sensible first settings for a new widget of a type. */
export function initialConfig(type: WidgetType, d: import('../types').AppData, exclude?: string): Record<string, any> {
  const def = widgetDef(type)
  const config: Record<string, any> = { ...(def.config ?? {}) }
  const live = Object.values(d.pages).filter((x) => !x.deletedAt && !x.rowOf && x.id !== exclude)
  if (type === 'value' || type === 'progress') config.valueId = Object.values(d.values).sort((a, b) => a.order - b.order)[0]?.id ?? null
  if (type === 'database') config.dbId = live.find((x) => x.type === 'database')?.id ?? null
  if (type === 'dbchart') { const db = live.find((x) => x.type === 'database'); config.dbId = db?.id ?? null; config.by = (db?.db?.props.find((p) => p.type === 'status') ?? db?.db?.props.find((p) => p.type === 'select'))?.id ?? null }
  if (type === 'dashboard') config.pageId = live.find((x) => x.type === 'dashboard')?.id ?? null
  if (type === 'pageview' || type === 'checklist') {
    const withTodos = live.filter((x) => x.type === 'doc' && x.blocks.some((b) => b.type === 'todo'))
    config.pageId = (withTodos.find((x) => x.source) ?? withTodos[0] ?? live.find((x) => x.type === 'doc'))?.id ?? null
  }
  return config
}

export const NEEDS_SETUP: WidgetType[] = ['value', 'progress', 'database', 'countdown', 'page', 'text', 'image']

function AddWidgetDialog({ pageId, onClose }: { pageId: string; onClose: () => void }): JSX.Element {
  const cols = useData((d) => d.pages[pageId]?.view?.cols ?? 12)
  const add = (type: WidgetType): void => {
    const def = widgetDef(type)
    const id = uid()
    act((d) => {
      const p = d.pages[pageId]
      if (!p) return
      p.widgets = p.widgets ?? []
      const w = Math.min(def.w, cols)
      const pos = freeSpot(p.widgets, w, def.h, cols)
      p.widgets.push({ id, type, x: pos.x, y: pos.y, w, h: def.h, config: initialConfig(type, d, pageId), style: {} })
    })
    onClose()
    if (NEEDS_SETUP.includes(type)) setTimeout(() => window.dispatchEvent(new CustomEvent('desk:panel-settings', { detail: id })), 50)
  }
  return (
    <Modal onClose={onClose} width={720}>
      <div className="modal-head"><h3>Add a panel</h3></div>
      <div className="modal-body"><WidgetGallery onPick={add} /></div>
    </Modal>
  )
}
function WidgetSettings({ pageId, w, onClose }: { pageId: string; w: Widget; onClose: () => void }): JSX.Element {
  const [tab, setTab] = useState<'content' | 'style'>('content')
  const patch = (fn: (x: AnyWidget & { style?: Partial<WidgetStyle> }) => void, key?: string): void => patchWidget(pageId, w.id, fn as (x: Widget) => void, key)
  const st = fullStyle(DASH_STYLE, w.style, 'auto')
  return (
    <Modal onClose={onClose} width={560}>
      <div className="modal-head row between">
        <h3>{widgetDef(w.type).name}</h3>
        <Segmented small value={tab} onChange={setTab} options={[{ value: 'content', label: 'Content' }, { value: 'style', label: 'Style' }]} />
      </div>
      <div className="modal-body">
        {tab === 'content' ? <>
          <TitleField w={w} setTitle={(t) => patch((x) => { x.title = t }, 'wtitle:' + w.id)} />
          <WidgetConfigFields w={w} selfPageId={pageId} set={(k, v) => patch((x) => { x.config[k] = v }, 'wcfg:' + w.id + k)} patch={(fn) => patch(fn)} />
        </> : (
          <StyleFields style={st} inherit={w.style} set={(p) => patch((x) => { x.style = { ...(x.style ?? {}), ...p } }, 'wstyle:' + w.id)} />
        )}
      </div>
      <div className="modal-foot">
        <Button kind="ghost" icon="trash" onClick={() => { act((dd) => { const p = dd.pages[pageId]; if (p?.widgets) p.widgets = p.widgets.filter((x) => x.id !== w.id) }); toast('Panel removed', { undo: true }); onClose() }}>Remove</Button>
        {isDesktop && <Button kind="ghost" icon="monitor" onClick={() => { addDesktopWidget(w.type, { config: { ...w.config }, title: w.title, style: { ...(w.style ?? {}) } }); onClose() }}>Put on desktop</Button>}
        {tab === 'style' && Object.keys(w.style ?? {}).length > 0 && <Button kind="ghost" onClick={() => patch((x) => { x.style = {} })}>Reset style</Button>}
        <div className="spacer" />
        <Button kind="primary" onClick={onClose}>Done</Button>
      </div>
    </Modal>
  )
}

/** Dashboard cards default to in-app glass. */
const DASH_STYLE: Partial<WidgetStyle> = { material: 'auto', opacity: 60, radius: 20, padding: 14, header: true }
/** The widget grid. `bare` hides editing chrome (desktop widget window). */
export function DashboardGrid({ pageId, bare }: { pageId: string; bare?: boolean }): JSX.Element {
  const page = useData((d) => d.pages[pageId])
  const d = useData((x) => x)
  // A dashboard pinned to the desktop follows the panels' surface, inside the app the app's.
  const auto = surfaceMaterial(d.settings.look, useDoc() !== document)
  const editing = !bare && !!page?.view?.editing
  const cols: number = page?.view?.cols ?? 12
  const rowH: number = page?.view?.rowH ?? 76
  const gap = 12
  const gridRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; w: number; h: number } | null>(null)
  const [settingsFor, setSettingsFor] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  useListen(setSettingsFor)
  if (!page) return <div />
  const widgets = page.widgets ?? []

  const startDrag = (e: React.PointerEvent, w: Widget, mode: 'move' | 'resize'): void => {
    e.preventDefault()
    e.stopPropagation()
    const grid = gridRef.current
    if (!grid) return
    const cellW = (grid.clientWidth - gap * (cols - 1)) / cols + gap
    const cellH = rowH + gap
    const sx = e.clientX
    const sy = e.clientY
    let cur = { id: w.id, x: w.x, y: w.y, w: w.w, h: w.h }
    const move = (ev: PointerEvent): void => {
      const dx = Math.round((ev.clientX - sx) / cellW)
      const dy = Math.round((ev.clientY - sy) / cellH)
      cur = mode === 'move'
        ? { ...cur, x: Math.max(0, Math.min(cols - w.w, w.x + dx)), y: Math.max(0, w.y + dy) }
        : { ...cur, w: Math.max(1, Math.min(cols - w.x, w.w + dx)), h: Math.max(1, w.h + dy) }
      setDrag(cur)
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setDrag(null)
      if (cur.x === w.x && cur.y === w.y && cur.w === w.w && cur.h === w.h) return
      act((dd) => {
        const list = dd.pages[pageId]?.widgets
        const t = list?.find((x) => x.id === w.id)
        if (!list || !t) return
        Object.assign(t, { x: cur.x, y: cur.y, w: cur.w, h: cur.h })
        settle(list, t.id)
      })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const rows = Math.max(1, ...widgets.map((w) => (drag?.id === w.id ? drag.y + drag.h : w.y + w.h))) + (editing ? 2 : 0)
  const settingsWidget = widgets.find((w) => w.id === settingsFor)
  return (
    <div className={`dash ${editing ? 'editing' : ''} ${bare ? 'bare' : ''}`}>
      {!bare && (
        <div className="dash-toolbar">
          {editing && <>
            <Button small kind="primary" icon="plus" onClick={() => setAdding(true)}>Add panel</Button>
            <span className="muted small">Columns</span>
            <Segmented small value={cols} onChange={(v) => updatePage(pageId, (p) => { p.view = { ...(p.view ?? {}), cols: v }; for (const w of p.widgets ?? []) { w.w = Math.min(w.w, v); w.x = Math.min(w.x, v - w.w) } })} options={[8, 12, 16, 20, 24].map((n) => ({ value: n, label: String(n) }))} />
            <span className="muted small">Row height</span>
            <input type="range" min={48} max={120} value={rowH} onChange={(e) => updatePage(pageId, (p) => { p.view = { ...(p.view ?? {}), rowH: Number(e.target.value) } }, 'rowh:' + pageId)} />
          </>}
          <div className="spacer" />
          <Button small kind={editing ? 'primary' : 'default'} icon={editing ? 'check' : 'layout'} onClick={() => act((dd) => { const p = dd.pages[pageId]; p.view = { ...(p.view ?? {}), editing: !editing } }, { history: false })}>{editing ? 'Done' : 'Edit layout'}</Button>
        </div>
      )}
      {widgets.length === 0 && !bare ? (
        <button className="dash-empty glass" onClick={() => { act((dd) => { const p = dd.pages[pageId]; p.view = { ...(p.view ?? {}), editing: true } }, { history: false }); setAdding(true) }}>
          <Icon name="layout" size={22} /><span>Add your first panel</span>
        </button>
      ) : (
        <div ref={gridRef} className="dash-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, ${rowH}px)`, gap }}>
          {widgets.map((w) => {
            const g = drag?.id === w.id ? drag : w
            const title = widgetTitle(w, d)
            const st = fullStyle(DASH_STYLE, w.style, auto)
            return (
              <div key={w.id} className={`widget wt-${w.type} ${widgetClass(st)} ${drag?.id === w.id ? 'dragging' : ''}`} style={{ ...widgetVars(st), gridColumn: `${g.x + 1} / span ${g.w}`, gridRow: `${g.y + 1} / span ${g.h}` }}>
                {((title && st.header) || editing) && (
                  <div className="widget-head" onPointerDown={editing ? (e) => startDrag(e, w, 'move') : undefined}>
                    {editing && <Icon name="grip" size={14} className="muted" />}
                    <span className="widget-title ellipsis">{title}</span>
                    {editing && <>
                      <button className="icon-btn" title="Panel settings" onPointerDown={(e) => e.stopPropagation()} onClick={() => setSettingsFor(w.id)}><Icon name="settings" size={14} /></button>
                    </>}
                  </div>
                )}
                <div className="widget-body"><WidgetBody w={w} setConfig={(k, v) => patchWidget(pageId, w.id, (x) => { x.config[k] = v }, 'wcfg:' + w.id + k)} /></div>
                {editing && <span className="widget-resize" title="Resize" onPointerDown={(e) => startDrag(e, w, 'resize')}><Icon name="resize" size={12} /></span>}
              </div>
            )
          })}
        </div>
      )}
      {adding && <AddWidgetDialog pageId={pageId} onClose={() => setAdding(false)} />}
      {settingsWidget && <WidgetSettings pageId={pageId} w={settingsWidget} onClose={() => setSettingsFor(null)} />}
    </div>
  )
}

function useListen(fn: (id: string) => void): void {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    const h = (e: Event): void => ref.current((e as CustomEvent).detail)
    window.addEventListener('desk:panel-settings', h)
    return () => window.removeEventListener('desk:panel-settings', h)
  }, [])
}

export function DashboardPage({ pageId }: { pageId: string }): JSX.Element {
  return <DashboardGrid pageId={pageId} />
}
