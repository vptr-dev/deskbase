import { useEffect, useRef, useState } from 'react'
import { act, setSettings, toast, updatePage, useData } from '../store'
import type { Widget, WidgetType } from '../types'
import { STATS, WIDGETS, WidgetBody, widgetDef, widgetTitle } from '../components/Widgets'
import { createValue } from '../components/Values'
import { Button, Modal, Segmented, Toggle } from '../components/ui'
import { Icon } from '../components/Icon'
import { isDesktop } from '../lib/api'
import { uid } from '../lib/util'

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
      const config: Record<string, any> = { ...(def.config ?? {}) }
      if (type === 'value' || type === 'progress') config.valueId = Object.values(d.values).sort((a, b) => a.order - b.order)[0]?.id ?? null
      if (type === 'database') config.dbId = Object.values(d.pages).find((x) => x.type === 'database' && !x.deletedAt)?.id ?? null
      p.widgets.push({ id, type, x: pos.x, y: pos.y, w, h: def.h, config })
    })
    onClose()
    const needsSetup = ['value', 'progress', 'database', 'countdown', 'page'].includes(type)
    if (needsSetup) setTimeout(() => window.dispatchEvent(new CustomEvent('planner:widget-settings', { detail: id })), 50)
  }
  return (
    <Modal onClose={onClose} width={680}>
      <div className="modal-head"><h3>Add a widget</h3></div>
      <div className="modal-body widget-gallery">
        {WIDGETS.map((w) => (
          <button key={w.type} className="widget-pick glass" onClick={() => add(w.type)}>
            <span className="widget-pick-icon"><Icon name={w.icon} size={18} /></span>
            <span className="strong">{w.name}</span>
            <span className="muted small">{w.desc}</span>
          </button>
        ))}
      </div>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return <><label>{label}</label><div className="row gap-sm wrap">{children}</div></>
}

function WidgetSettings({ pageId, w, onClose }: { pageId: string; w: Widget; onClose: () => void }): JSX.Element {
  const d = useData((x) => x)
  const set = (k: string, v: any): void => patchWidget(pageId, w.id, (x) => { x.config[k] = v }, 'wcfg:' + w.id + k)
  const c = w.config
  const values = Object.values(d.values).sort((a, b) => a.order - b.order)
  const dbs = Object.values(d.pages).filter((p) => p.type === 'database' && !p.deletedAt)
  const lists = Object.values(d.pages).filter((p) => !p.deletedAt && (p.type === 'tasks' || p.type === 'board'))
  const pages = Object.values(d.pages).filter((p) => !p.deletedAt && p.id !== pageId)
  const db = c.dbId ? d.pages[c.dbId]?.db : undefined
  const flagProps = db?.props.filter((p) => ['status', 'select', 'multi', 'checkbox'].includes(p.type)) ?? []
  const flagProp = flagProps.find((p) => p.id === c.prop)
  const valuePicker = (
    <Field label="Value">
      <select className="input input-sm" value={c.valueId ?? ''} onChange={(e) => set('valueId', e.target.value || null)}>
        <option value="">Choose…</option>
        {values.map((v) => <option key={v.id} value={v.id}>{v.icon} {v.name || 'Untitled'}</option>)}
      </select>
      <Button small kind="ghost" icon="plus" onClick={() => { const id = createValue('New value'); set('valueId', id) }}>New value</Button>
    </Field>
  )
  const dbPicker = (withFlag: boolean): JSX.Element => (
    <>
      <Field label="Database">
        <select className="input input-sm" value={c.dbId ?? ''} onChange={(e) => patchWidget(pageId, w.id, (x) => { x.config.dbId = e.target.value || null; x.config.viewId = null; x.config.prop = null; x.config.option = null })}>
          <option value="">Choose…</option>
          {dbs.map((p) => <option key={p.id} value={p.id}>{p.icon} {p.title || 'Untitled'}</option>)}
        </select>
      </Field>
      {withFlag && db && (
        <Field label="Count rows where">
          <select className="input input-sm" value={c.prop ?? ''} onChange={(e) => patchWidget(pageId, w.id, (x) => { x.config.prop = e.target.value || null; x.config.option = null })}>
            <option value="">{w.type === 'stat' ? 'All rows' : 'Choose a property'}</option>
            {flagProps.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {flagProp && flagProp.type !== 'checkbox' && (
            <select className="input input-sm" value={c.option ?? ''} onChange={(e) => set('option', e.target.value || null)}>
              <option value="">Choose…</option>
              {(flagProp.options ?? []).map((o) => <option key={o.id} value={o.id}>is {o.name}</option>)}
            </select>
          )}
          {flagProp?.type === 'checkbox' && <span className="muted small">is checked</span>}
        </Field>
      )}
    </>
  )
  return (
    <Modal onClose={onClose} width={520}>
      <div className="modal-head"><h3>{widgetDef(w.type).name}</h3></div>
      <div className="modal-body form-grid">
        <label>Title</label>
        <input className="input input-sm" placeholder={widgetTitle({ ...w, title: undefined }, d) || 'No title'} value={w.title ?? ''} onChange={(e) => patchWidget(pageId, w.id, (x) => { x.title = e.target.value || undefined }, 'wtitle:' + w.id)} />
        {w.type === 'value' && <>{valuePicker}
          <Field label="Step"><input className="input input-sm w-80" type="number" step="any" value={c.step ?? 1} onChange={(e) => set('step', Number(e.target.value) || 1)} /></Field>
          <Field label="Small chart"><Toggle checked={c.showChart !== false} onChange={(v) => set('showChart', v)} /></Field>
        </>}
        {w.type === 'chart' && <>
          <Field label="Show">
            <select className="input input-sm" value={c.source ?? 'tasks'} onChange={(e) => set('source', e.target.value)}>
              <option value="tasks">Tasks completed</option>
              <option value="habits">Habits done</option>
              <option value="focus">Focus minutes</option>
              <option value="value">A value</option>
              <option value="metric">A tracker</option>
            </select>
          </Field>
          {c.source === 'value' && <>{valuePicker}<Field label="Running total"><Toggle checked={!!c.cumulative} onChange={(v) => set('cumulative', v)} /></Field></>}
          {c.source === 'metric' && (
            <Field label="Tracker">
              <select className="input input-sm" value={c.metricId ?? ''} onChange={(e) => set('metricId', e.target.value || null)}>
                <option value="">Choose…</option>
                {Object.values(d.metrics).map((m) => <option key={m.id} value={m.id}>{m.icon} {m.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="Days"><Segmented small value={c.days ?? 14} onChange={(v) => set('days', v)} options={[7, 14, 30, 90].map((n) => ({ value: n, label: String(n) }))} /></Field>
          <Field label="Style"><Segmented small value={c.kind ?? 'bar'} onChange={(v) => set('kind', v)} options={[{ value: 'bar', label: 'Bars' }, { value: 'line', label: 'Line' }]} /></Field>
        </>}
        {w.type === 'progress' && <>
          <Field label="Track"><Segmented small value={c.source ?? 'value'} onChange={(v) => set('source', v)} options={[{ value: 'value', label: 'Value vs goal' }, { value: 'db', label: 'Database rows' }]} /></Field>
          {(c.source ?? 'value') === 'value' ? valuePicker : dbPicker(true)}
        </>}
        {w.type === 'stat' && <>
          <Field label="Number">
            <select className="input input-sm" value={c.stat ?? 'tasksToday'} onChange={(e) => set('stat', e.target.value)}>
              {STATS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </Field>
          {c.stat === 'rows' && dbPicker(true)}
          <Field label="Label"><input className="input input-sm" placeholder="Default" value={c.label ?? ''} onChange={(e) => set('label', e.target.value)} /></Field>
        </>}
        {w.type === 'tasks' && <>
          <Field label="Show"><Segmented small value={c.filter ?? 'today'} onChange={(v) => set('filter', v)} options={[{ value: 'today', label: 'Today' }, { value: 'overdue', label: 'Overdue' }, { value: 'upcoming', label: 'Next 7 days' }, { value: 'all', label: 'All open' }]} /></Field>
          <Field label="From">
            <select className="input input-sm" value={c.pageId ?? ''} onChange={(e) => set('pageId', e.target.value || null)}>
              <option value="">All lists</option>
              {lists.map((p) => <option key={p.id} value={p.id}>{p.icon} {p.title || 'Untitled'}</option>)}
            </select>
          </Field>
          <Field label="Quick add"><Toggle checked={c.quickAdd !== false} onChange={(v) => set('quickAdd', v)} /></Field>
        </>}
        {w.type === 'database' && <>{dbPicker(false)}
          {db && (
            <Field label="View">
              <select className="input input-sm" value={c.viewId ?? ''} onChange={(e) => set('viewId', e.target.value || null)}>
                <option value="">Show view tabs</option>
                {db.views.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </Field>
          )}
        </>}
        {w.type === 'clock' && <Field label="Seconds"><Toggle checked={!!c.seconds} onChange={(v) => set('seconds', v)} /></Field>}
        {w.type === 'countdown' && <>
          <Field label="What"><input className="input input-sm" value={c.title ?? ''} placeholder="Trip, launch, birthday…" onChange={(e) => set('title', e.target.value)} /></Field>
          <Field label="Date"><input className="input input-sm" type="date" value={c.date ?? ''} onChange={(e) => set('date', e.target.value)} /></Field>
          <Field label="Every year"><Toggle checked={!!c.yearly} onChange={(v) => set('yearly', v)} /></Field>
        </>}
        {(w.type === 'quickadd') && (
          <Field label="Add to">
            <select className="input input-sm" value={c.pageId ?? ''} onChange={(e) => set('pageId', e.target.value || null)}>
              <option value="">First to-do list</option>
              {lists.map((p) => <option key={p.id} value={p.id}>{p.icon} {p.title || 'Untitled'}</option>)}
            </select>
          </Field>
        )}
        {w.type === 'page' && (
          <Field label="Page">
            <select className="input input-sm" value={c.pageId ?? ''} onChange={(e) => set('pageId', e.target.value || null)}>
              <option value="">Choose…</option>
              {pages.map((p) => <option key={p.id} value={p.id}>{p.icon} {p.title || 'Untitled'}</option>)}
            </select>
          </Field>
        )}
      </div>
      <div className="modal-foot">
        <Button kind="ghost" icon="trash" onClick={() => { act((dd) => { const p = dd.pages[pageId]; if (p?.widgets) p.widgets = p.widgets.filter((x) => x.id !== w.id) }); toast('Widget removed', { undo: true }); onClose() }}>Remove</Button>
        <div className="spacer" />
        <Button kind="primary" onClick={onClose}>Done</Button>
      </div>
    </Modal>
  )
}

/** The widget grid. `bare` hides editing chrome (desktop widget window). */
export function DashboardGrid({ pageId, bare }: { pageId: string; bare?: boolean }): JSX.Element {
  const page = useData((d) => d.pages[pageId])
  const d = useData((x) => x)
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
            <Button small kind="primary" icon="plus" onClick={() => setAdding(true)}>Add widget</Button>
            <span className="muted small">Columns</span>
            <Segmented small value={cols} onChange={(v) => updatePage(pageId, (p) => { p.view = { ...(p.view ?? {}), cols: v }; for (const w of p.widgets ?? []) { w.w = Math.min(w.w, v); w.x = Math.min(w.x, v - w.w) } })} options={[8, 12, 16, 20, 24].map((n) => ({ value: n, label: String(n) }))} />
            <span className="muted small">Row height</span>
            <input type="range" min={48} max={120} value={rowH} onChange={(e) => updatePage(pageId, (p) => { p.view = { ...(p.view ?? {}), rowH: Number(e.target.value) } }, 'rowh:' + pageId)} />
          </>}
          <div className="spacer" />
          {isDesktop && <DesktopToggle pageId={pageId} />}
          <Button small kind={editing ? 'primary' : 'default'} icon={editing ? 'check' : 'layout'} onClick={() => act((dd) => { const p = dd.pages[pageId]; p.view = { ...(p.view ?? {}), editing: !editing } }, { history: false })}>{editing ? 'Done' : 'Edit layout'}</Button>
        </div>
      )}
      {widgets.length === 0 && !bare ? (
        <button className="dash-empty glass" onClick={() => { act((dd) => { const p = dd.pages[pageId]; p.view = { ...(p.view ?? {}), editing: true } }, { history: false }); setAdding(true) }}>
          <Icon name="layout" size={22} /><span>Add your first widget</span>
        </button>
      ) : (
        <div ref={gridRef} className="dash-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, ${rowH}px)`, gap }}>
          {widgets.map((w) => {
            const g = drag?.id === w.id ? drag : w
            const title = widgetTitle(w, d)
            return (
              <div key={w.id} className={`widget glass w-${w.type} ${drag?.id === w.id ? 'dragging' : ''}`} style={{ gridColumn: `${g.x + 1} / span ${g.w}`, gridRow: `${g.y + 1} / span ${g.h}` }}>
                {(title || editing) && (
                  <div className="widget-head" onPointerDown={editing ? (e) => startDrag(e, w, 'move') : undefined}>
                    {editing && <Icon name="grip" size={14} className="muted" />}
                    <span className="widget-title ellipsis">{title}</span>
                    {editing && <>
                      <button className="icon-btn" title="Widget settings" onPointerDown={(e) => e.stopPropagation()} onClick={() => setSettingsFor(w.id)}><Icon name="settings" size={14} /></button>
                    </>}
                  </div>
                )}
                <div className="widget-body"><WidgetBody w={w} pageId={pageId} /></div>
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
    window.addEventListener('planner:widget-settings', h)
    return () => window.removeEventListener('planner:widget-settings', h)
  }, [])
}

function DesktopToggle({ pageId }: { pageId: string }): JSX.Element {
  const widget = useData((d) => d.settings.widget)
  const on = widget.enabled && widget.pageId === pageId
  return (
    <Button small kind={on ? 'default' : 'ghost'} icon="monitor" title="Show this dashboard on your desktop" onClick={() => setSettings((s) => { s.widget = { ...s.widget, enabled: !on, pageId } })}>
      {on ? 'On desktop' : 'Show on desktop'}
    </Button>
  )
}

export function DashboardPage({ pageId }: { pageId: string }): JSX.Element {
  return <DashboardGrid pageId={pageId} />
}
