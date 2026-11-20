import { useMemo, useRef, useState } from 'react'
import { act, openPage, useData } from '../store'
import type { DbFilter, DbProp, DbSchema, DbView, Page, PropType } from '../types'
import {
  TITLE, PROP_TYPES, VIEW_TYPES, addOption, addProp, addRow, deleteProp, deleteRows, filterOps, formatNumber, hasOptions,
  newView, optionOf, propText, propTypeInfo, rowsOf, setRowProp, updateDb, updateView, viewRows
} from '../lib/db'
import { COLORS, coverStyle } from '../lib/defaults'
import { DAYS_SHORT, MONTHS_LONG, addDays, friendlyDay, parseDay, today, uid, weekStartOf } from '../lib/util'
import { Button, ColorDots, Empty, Menu, type MenuItem, Popover, Progress } from '../components/ui'
import { Glyph, Icon } from '../components/Icon'
import { api } from '../lib/api'

// ---------- option chips & picker ----------
export function Chip({ name, color }: { name: string; color: string }): JSX.Element {
  return <span className="db-chip" style={{ ['--c' as any]: color }}>{name}</span>
}

function OptionPicker({ dbId, prop, value, onChange, onClose, anchor }: {
  dbId: string; prop: DbProp; value: any; onChange: (v: any) => void; onClose: () => void; anchor: HTMLElement
}): JSX.Element {
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const multi = prop.type === 'multi'
  const sel: string[] = multi ? (Array.isArray(value) ? value : []) : value ? [value] : []
  const opts = (prop.options ?? []).filter((o) => o.name.toLowerCase().includes(q.trim().toLowerCase()))
  const exact = (prop.options ?? []).some((o) => o.name.toLowerCase() === q.trim().toLowerCase())
  const pick = (id: string): void => {
    if (multi) onChange(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id])
    else { onChange(sel[0] === id ? null : id); onClose() }
  }
  const create = (): void => {
    const name = q.trim()
    if (!name) return
    const id = addOption(dbId, prop.id, name)
    pick(id)
    setQ('')
  }
  const editOpt = editing ? prop.options?.find((o) => o.id === editing) : undefined
  return (
    <Popover anchor={anchor} onClose={onClose} width={240}>
      <div className="db-picker" onClick={(e) => e.stopPropagation()}>
        {editOpt ? (
          <div className="db-opt-edit">
            <input className="input input-sm" autoFocus value={editOpt.name} onChange={(e) => updateDb(dbId, (db) => { const o = db.props.find((p) => p.id === prop.id)?.options?.find((x) => x.id === editOpt.id); if (o) o.name = e.target.value }, 'opt:' + editOpt.id)} onKeyDown={(e) => { if (e.key === 'Enter') setEditing(null) }} />
            <ColorDots value={editOpt.color} colors={COLORS} onChange={(c) => updateDb(dbId, (db) => { const o = db.props.find((p) => p.id === prop.id)?.options?.find((x) => x.id === editOpt.id); if (o) o.color = c })} />
            <div className="row between">
              <Button small kind="ghost" icon="trash" onClick={() => { updateDb(dbId, (db) => { const p = db.props.find((x) => x.id === prop.id); if (p) p.options = (p.options ?? []).filter((o) => o.id !== editOpt.id) }); setEditing(null) }}>Delete</Button>
              <Button small onClick={() => setEditing(null)}>Done</Button>
            </div>
          </div>
        ) : <>
          <input className="input input-sm" autoFocus placeholder={multi ? 'Search or add tags' : 'Search or add an option'} value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { if (opts[0] && (exact || !q.trim())) pick(opts[0].id); else create() } }} />
          <div className="db-opts">
            {opts.map((o) => (
              <div key={o.id} className={`db-opt ${sel.includes(o.id) ? 'on' : ''}`} onClick={() => pick(o.id)}>
                <Chip name={o.name} color={o.color} />
                <span className="spacer" />
                {sel.includes(o.id) && <Icon name="check" size={13} />}
                <button className="icon-btn db-opt-more" title="Edit option" onClick={(e) => { e.stopPropagation(); setEditing(o.id) }}><Icon name="more" size={13} /></button>
              </div>
            ))}
            {q.trim() && !exact && <div className="db-opt" onClick={create}><span className="muted small">Create</span><Chip name={q.trim()} color={COLORS[(prop.options?.length ?? 0) % COLORS.length]} /></div>}
            {!opts.length && !q.trim() && <div className="muted small pad">Type to add an option</div>}
          </div>
        </>}
      </div>
    </Popover>
  )
}

// ---------- cells ----------
export function PropCell({ row, prop, dbId, inline }: { row: Page; prop: DbProp; dbId: string; inline?: boolean }): JSX.Element {
  const v = row.props?.[prop.id]
  const [el, setEl] = useState<HTMLElement | null>(null)
  const set = (val: any, key?: string): void => setRowProp(row.id, prop.id, val, key)
  switch (prop.type) {
    case 'checkbox':
      return <label className="db-cell db-check" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={!!v} onChange={(e) => set(e.target.checked || null)} /></label>
    case 'select': case 'status': case 'multi': {
      const ids: string[] = prop.type === 'multi' ? (Array.isArray(v) ? v : []) : v ? [v] : []
      return (
        <div className="db-cell db-cell-btn" onClick={(e) => { e.stopPropagation(); setEl(e.currentTarget) }}>
          {ids.map((id) => { const o = optionOf(prop, id); return o ? <Chip key={id} name={o.name} color={o.color} /> : null })}
          {!ids.length && inline && <span className="db-empty">Empty</span>}
          {el && <OptionPicker dbId={dbId} prop={prop} value={v} anchor={el} onChange={(x) => set(x)} onClose={() => setEl(null)} />}
        </div>
      )
    }
    case 'date':
      return <input className="db-cell db-input" type="date" value={v ?? ''} onClick={(e) => e.stopPropagation()} onChange={(e) => set(e.target.value || null)} />
    case 'number':
      return <input className="db-cell db-input num" type="number" step="any" value={v ?? ''} placeholder={inline ? 'Empty' : ''} onClick={(e) => e.stopPropagation()} onChange={(e) => set(e.target.value === '' ? null : Number(e.target.value), 'cell:' + row.id + prop.id)} />
    case 'progress': {
      const max = prop.max || 100
      return (
        <div className="db-cell db-progress" onClick={(e) => e.stopPropagation()}>
          <Progress value={(Number(v) || 0) / max} height={5} />
          <input className="db-input num" type="number" min={0} max={max} value={v ?? ''} onChange={(e) => set(e.target.value === '' ? null : Math.max(0, Math.min(max, Number(e.target.value))), 'cell:' + row.id + prop.id)} />
        </div>
      )
    }
    case 'url':
      return (
        <div className="db-cell db-url" onClick={(e) => e.stopPropagation()}>
          <input className="db-input" value={v ?? ''} placeholder={inline ? 'Empty' : ''} onChange={(e) => set(e.target.value, 'cell:' + row.id + prop.id)} />
          {v && /^https?:\/\//i.test(v) && <button className="icon-btn" title="Open link" onClick={() => api.openExternal(v)}><Icon name="external" size={12} /></button>}
        </div>
      )
    default:
      return <input className="db-cell db-input" value={v ?? ''} placeholder={inline ? 'Empty' : ''} onClick={(e) => e.stopPropagation()} onChange={(e) => set(e.target.value, 'cell:' + row.id + prop.id)} />
  }
}

/** Read-only property for cards. */
function PropView({ prop, v }: { prop: DbProp; v: any }): JSX.Element | null {
  if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return null
  if (hasOptions(prop.type)) {
    const ids: string[] = Array.isArray(v) ? v : [v]
    return <div className="row gap-xs wrap">{ids.map((id) => { const o = optionOf(prop, id); return o ? <Chip key={id} name={o.name} color={o.color} /> : null })}</div>
  }
  if (prop.type === 'checkbox') return <span className="small row gap-xs"><Icon name={v ? 'square-check-big' : 'square'} size={13} /> {prop.name}</span>
  if (prop.type === 'progress') return <Progress value={(Number(v) || 0) / (prop.max || 100)} height={4} />
  return <span className="small muted ellipsis">{prop.type === 'number' ? formatNumber(prop, Number(v)) : propText(prop, v)}</span>
}

// ---------- property header menu ----------
function PropHeader({ dbId, view, prop }: { dbId: string; view: DbView; prop: DbProp }): JSX.Element {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [rename, setRename] = useState(false)
  const items: MenuItem[] = [
    { label: 'Rename', icon: 'edit', onClick: () => setRename(true) },
    ...PROP_TYPES.map((t) => ({ label: `Type: ${t.name}`, checked: prop.type === t.type, onClick: () => updateDb(dbId, (db) => {
      const p = db.props.find((x) => x.id === prop.id)
      if (!p || p.type === t.type) return
      p.type = t.type
      if (hasOptions(t.type) && !p.options) p.options = []
      if (t.type === 'progress' && !p.max) p.max = 100
    }) })),
    ...(prop.type === 'number' ? [{ divider: true, label: '' }, ...(['plain', 'decimal', 'percent', 'currency'] as const).map((f) => ({ label: `Format: ${f}`, checked: (prop.format ?? 'plain') === f, onClick: () => updateDb(dbId, (db) => { const p = db.props.find((x) => x.id === prop.id); if (p) p.format = f }) }))] : []),
    { divider: true, label: '' },
    { label: 'Sort ascending', icon: 'sort', onClick: () => updateView(dbId, view.id, (v) => { v.sort = { prop: prop.id, dir: 'asc' } }) },
    { label: 'Sort descending', icon: 'sort', onClick: () => updateView(dbId, view.id, (v) => { v.sort = { prop: prop.id, dir: 'desc' } }) },
    { label: 'Hide in this view', icon: 'eye', onClick: () => updateView(dbId, view.id, (v) => { v.hidden = [...(v.hidden ?? []), prop.id] }) },
    { divider: true, label: '' },
    { label: 'Delete property', icon: 'trash', danger: true, onClick: () => deleteProp(dbId, prop.id) }
  ]
  return (
    <div className="db-th" style={{ width: view.widths?.[prop.id] ?? 170 }}>
      {rename ? (
        <input className="db-input strong" autoFocus defaultValue={prop.name} onBlur={(e) => { const n = e.target.value.trim(); if (n) updateDb(dbId, (db) => { const p = db.props.find((x) => x.id === prop.id); if (p) p.name = n }); setRename(false) }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur() }} />
      ) : (
        <button className="db-th-btn" onClick={(e) => setEl(e.currentTarget)}><Icon name={propTypeInfo(prop.type).icon} size={13} /><span className="ellipsis">{prop.name}</span></button>
      )}
      <ColResizer dbId={dbId} view={view} colId={prop.id} />
      {el && <Popover anchor={el} onClose={() => setEl(null)}><Menu items={items} onClose={() => setEl(null)} /></Popover>}
    </div>
  )
}

function ColResizer({ dbId, view, colId }: { dbId: string; view: DbView; colId: string }): JSX.Element {
  const start = (e: React.MouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    const th = (e.currentTarget as HTMLElement).parentElement as HTMLElement
    const x0 = e.clientX
    const w0 = th.getBoundingClientRect().width
    const move = (ev: MouseEvent): void => { th.style.width = Math.max(80, w0 + ev.clientX - x0) + 'px' }
    const up = (ev: MouseEvent): void => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      const w = Math.max(80, Math.round(w0 + ev.clientX - x0))
      updateView(dbId, view.id, (v) => { v.widths = { ...(v.widths ?? {}), [colId]: w } })
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }
  return <span className="db-resizer" onMouseDown={start} />
}

function AddPropButton({ dbId }: { dbId: string }): JSX.Element {
  const [el, setEl] = useState<HTMLElement | null>(null)
  return (
    <>
      <button className="db-th db-add-col" title="Add a property" onClick={(e) => setEl(e.currentTarget)}><Icon name="plus" size={14} /></button>
      {el && <Popover anchor={el} align="end" onClose={() => setEl(null)}><Menu items={PROP_TYPES.map((t) => ({ label: t.name, icon: t.icon, onClick: () => addProp(dbId, t.type) }))} onClose={() => setEl(null)} /></Popover>}
    </>
  )
}

// ---------- views ----------
function TableView({ dbId, db, view, rows }: { dbId: string; db: DbSchema; view: DbView; rows: Page[] }): JSX.Element {
  const props = db.props.filter((p) => !(view.hidden ?? []).includes(p.id))
  const [sel, setSel] = useState<string[]>([])
  const live = sel.filter((id) => rows.some((r) => r.id === id))
  return (
    <div className="db-table-wrap">
      <div className="db-table">
        <div className="db-tr db-head">
          <div className="db-th db-title-col" style={{ width: view.widths?.[TITLE] ?? 260 }}><span className="db-th-btn"><Icon name="note" size={13} />Name</span><ColResizer dbId={dbId} view={view} colId={TITLE} /></div>
          {props.map((p) => <PropHeader key={p.id} dbId={dbId} view={view} prop={p} />)}
          <AddPropButton dbId={dbId} />
        </div>
        {rows.map((r) => (
          <div key={r.id} className={`db-tr ${live.includes(r.id) ? 'selected' : ''}`}>
            <div className="db-td db-title-col" style={{ width: view.widths?.[TITLE] ?? 260 }}>
              <input type="checkbox" className="db-row-check" checked={live.includes(r.id)} onChange={(e) => setSel(e.target.checked ? [...live, r.id] : live.filter((x) => x !== r.id))} />
              {r.icon && <Glyph value={r.icon} size={14} />}
              <input className="db-input strong" value={r.title} placeholder="Untitled" onChange={(e) => setRowProp(r.id, TITLE, e.target.value, 'title:' + r.id)} />
              <button className="db-open" onClick={() => openPage(r.id)} title="Open as page"><Icon name="expand" size={12} /> Open</button>
            </div>
            {props.map((p) => <div key={p.id} className="db-td" style={{ width: view.widths?.[p.id] ?? 170 }}><PropCell row={r} prop={p} dbId={dbId} /></div>)}
            <div className="db-td db-add-col" />
          </div>
        ))}
        <button className="db-new-row" onClick={() => addRow(dbId, defaultsFromFilters(view))}><Icon name="plus" size={14} /> New</button>
      </div>
      {live.length > 0 && (
        <div className="bulk-bar glass-strong">
          <span className="bulk-count">{live.length} selected</span>
          <Button small icon="trash" onClick={() => { deleteRows(live); setSel([]) }}>Delete</Button>
          <button className="icon-btn" title="Clear selection" onClick={() => setSel([])}><Icon name="x" size={14} /></button>
        </div>
      )}
    </div>
  )
}

/** New rows created inside a filtered view get values that make them show up in it. */
function defaultsFromFilters(view: DbView): Record<string, any> {
  const out: Record<string, any> = {}
  for (const f of view.filters ?? []) {
    if (f.prop === TITLE) continue
    if (f.op === 'is' && f.value !== undefined && f.value !== '') out[f.prop] = f.value
    if (f.op === 'checked') out[f.prop] = true
    if (f.op === 'contains' && f.value) out[f.prop] = [f.value]
  }
  return out
}

function Card({ row, db, view, dbId, draggable }: { row: Page; db: DbSchema; view: DbView; dbId: string; draggable?: boolean }): JSX.Element {
  const shown = db.props.filter((p) => (view.cardProps ?? db.props.map((x) => x.id)).includes(p.id) && p.id !== view.groupBy)
  return (
    <div className="db-card glass" draggable={draggable} onDragStart={(e) => e.dataTransfer.setData('text/row', row.id)} onClick={() => openPage(row.id)}>
      {coverStyle(row.cover) && <div className="db-card-cover" style={coverStyle(row.cover)!} />}
      <div className="db-card-title">{row.icon && <><Glyph value={row.icon} size={14} /> </>}{row.title || <span className="muted">Untitled</span>}</div>
      {shown.map((p) => <PropView key={p.id} prop={p} v={row.props?.[p.id]} />)}
      <span hidden>{dbId}</span>
    </div>
  )
}

function BoardView({ dbId, db, view, rows }: { dbId: string; db: DbSchema; view: DbView; rows: Page[] }): JSX.Element {
  const group = db.props.find((p) => p.id === view.groupBy && (p.type === 'select' || p.type === 'status'))
  const [over, setOver] = useState<string | null>(null)
  if (!group) return <div className="muted pad">Pick a Select or Status property to group by.</div>
  const cols = [...(group.options ?? []).map((o) => ({ id: o.id, name: o.name, color: o.color })), { id: '', name: 'No ' + group.name, color: '#8e8e93' }]
  return (
    <div className="db-board">
      {cols.map((c) => {
        const items = rows.filter((r) => (r.props?.[group.id] ?? '') === c.id)
        if (!c.id && !items.length) return null
        return (
          <div key={c.id || 'none'} className={`db-col ${over === c.id ? 'over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setOver(c.id) }} onDragLeave={() => setOver(null)}
            onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData('text/row'); if (id) setRowProp(id, group.id, c.id || null) }}>
            <div className="db-col-head"><Chip name={c.name} color={c.color} /><span className="muted small">{items.length}</span></div>
            {items.map((r) => <Card key={r.id} row={r} db={db} view={view} dbId={dbId} draggable />)}
            <button className="db-new-row" onClick={() => addRow(dbId, { ...defaultsFromFilters(view), ...(c.id ? { [group.id]: c.id } : {}) })}><Icon name="plus" size={14} /> New</button>
          </div>
        )
      })}
    </div>
  )
}

function GalleryView({ dbId, db, view, rows }: { dbId: string; db: DbSchema; view: DbView; rows: Page[] }): JSX.Element {
  return (
    <div className="db-gallery">
      {rows.map((r) => <Card key={r.id} row={r} db={db} view={view} dbId={dbId} />)}
      <button className="db-card db-card-new" onClick={() => addRow(dbId, defaultsFromFilters(view))}><Icon name="plus" size={16} /> New</button>
    </div>
  )
}

function ListView({ dbId, db, view, rows }: { dbId: string; db: DbSchema; view: DbView; rows: Page[] }): JSX.Element {
  const shown = db.props.filter((p) => (view.cardProps ?? []).includes(p.id))
  return (
    <div className="db-list glass">
      {rows.map((r) => (
        <button key={r.id} className="db-list-row" onClick={() => openPage(r.id)}>
          <span className="db-list-title">{r.icon || <Icon name="note" size={14} />} <span className="ellipsis">{r.title || 'Untitled'}</span></span>
          <span className="spacer" />
          {shown.map((p) => <PropView key={p.id} prop={p} v={r.props?.[p.id]} />)}
        </button>
      ))}
      <button className="db-new-row" onClick={() => addRow(dbId, defaultsFromFilters(view))}><Icon name="plus" size={14} /> New</button>
    </div>
  )
}

function CalendarView({ dbId, db, view, rows }: { dbId: string; db: DbSchema; view: DbView; rows: Page[] }): JSX.Element {
  const weekStart = useData((d) => d.settings.weekStart)
  const dateProp = db.props.find((p) => p.id === view.dateProp && p.type === 'date')
  const [ym, setYm] = useState(today().slice(0, 7))
  if (!dateProp) return <div className="muted pad">Pick a Date property to show rows on a calendar.</div>
  const [y, m] = ym.split('-').map(Number)
  const first = `${ym}-01`
  const start = weekStartOf(first, weekStart)
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i))
  const shift = (n: number): void => { const d = new Date(y, m - 1 + n, 1); setYm(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`) }
  const t = today()
  return (
    <div className="db-cal glass">
      <div className="row gap-sm db-cal-nav">
        <button className="icon-btn" onClick={() => shift(-1)}><Icon name="left" size={14} /></button>
        <span className="strong">{MONTHS_LONG[m - 1]} {y}</span>
        <button className="icon-btn" onClick={() => shift(1)}><Icon name="right" size={14} /></button>
        <button className="link small" onClick={() => setYm(t.slice(0, 7))}>Today</button>
      </div>
      <div className="db-cal-grid">
        {Array.from({ length: 7 }, (_, i) => <div key={i} className="db-cal-dow">{DAYS_SHORT[(i + weekStart) % 7]}</div>)}
        {days.map((k) => (
          <div key={k} className={`db-cal-day ${k.slice(0, 7) !== ym ? 'other' : ''} ${k === t ? 'today' : ''}`}
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/row'); if (id) setRowProp(id, dateProp.id, k) }}
            onDoubleClick={() => addRow(dbId, { ...defaultsFromFilters(view), [dateProp.id]: k })}>
            <span className="db-cal-num">{parseDay(k).getDate()}</span>
            {rows.filter((r) => r.props?.[dateProp.id] === k).map((r) => (
              <button key={r.id} className="db-cal-item" draggable onDragStart={(e) => e.dataTransfer.setData('text/row', r.id)} onClick={() => openPage(r.id)}>{r.title || 'Untitled'}</button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- toolbar popovers ----------
function FilterEditor({ dbId, db, view }: { dbId: string; db: DbSchema; view: DbView }): JSX.Element {
  const filters = view.filters ?? []
  const setF = (fn: (f: DbFilter[]) => void): void => updateView(dbId, view.id, (v) => { v.filters = v.filters ?? []; fn(v.filters) })
  const propsAll: { id: string; name: string; type: PropType | 'title' }[] = [{ id: TITLE, name: 'Name', type: 'title' }, ...db.props]
  return (
    <div className="db-filters">
      {filters.map((f, i) => {
        const p = propsAll.find((x) => x.id === f.prop) ?? propsAll[0]
        const real = db.props.find((x) => x.id === f.prop)
        const ops = filterOps(p.type)
        const needsValue = !['empty', 'notEmpty', 'checked', 'unchecked'].includes(f.op)
        return (
          <div key={f.id} className="row gap-xs">
            <select className="input input-sm" value={f.prop} onChange={(e) => setF((l) => { const np = propsAll.find((x) => x.id === e.target.value)!; l[i] = { ...l[i], prop: np.id, op: filterOps(np.type)[0].op, value: '' } })}>
              {propsAll.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <select className="input input-sm" value={f.op} onChange={(e) => setF((l) => { l[i].op = e.target.value as DbFilter['op'] })}>
              {ops.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
            </select>
            {needsValue && (real && hasOptions(real.type) ? (
              <select className="input input-sm" value={f.value ?? ''} onChange={(e) => setF((l) => { l[i].value = e.target.value })}>
                <option value="">Choose…</option>
                {(real.options ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            ) : (
              <input className="input input-sm w-120" type={real?.type === 'date' ? 'date' : real && ['number', 'progress'].includes(real.type) ? 'number' : 'text'} value={f.value ?? ''} onChange={(e) => setF((l) => { l[i].value = e.target.value })} />
            ))}
            <button className="icon-btn" onClick={() => setF((l) => { l.splice(i, 1) })}><Icon name="x" size={13} /></button>
          </div>
        )
      })}
      <Button small kind="ghost" icon="plus" onClick={() => setF((l) => { l.push({ id: uid(), prop: TITLE, op: 'contains', value: '' }) })}>Add filter</Button>
    </div>
  )
}

function PropsEditor({ dbId, db, view }: { dbId: string; db: DbSchema; view: DbView }): JSX.Element {
  const cardish = view.type !== 'table' && view.type !== 'calendar'
  return (
    <div className="db-props-editor">
      <div className="section-label">{cardish ? 'Shown on cards' : 'Visible properties'}</div>
      {db.props.map((p) => {
        const on = cardish ? (view.cardProps ?? []).includes(p.id) : !(view.hidden ?? []).includes(p.id)
        return (
          <label key={p.id} className="db-prop-toggle">
            <Icon name={propTypeInfo(p.type).icon} size={13} />
            <span className="grow">{p.name}</span>
            <input type="checkbox" checked={on} onChange={(e) => updateView(dbId, view.id, (v) => {
              if (cardish) v.cardProps = e.target.checked ? [...(v.cardProps ?? []), p.id] : (v.cardProps ?? []).filter((x) => x !== p.id)
              else v.hidden = e.target.checked ? (v.hidden ?? []).filter((x) => x !== p.id) : [...(v.hidden ?? []), p.id]
            })} />
          </label>
        )
      })}
    </div>
  )
}

function ToolbarPop({ icon, label, active, children }: { icon: string; label: string; active?: boolean; children: React.ReactNode }): JSX.Element {
  const [el, setEl] = useState<HTMLElement | null>(null)
  return (
    <>
      <Button small kind={active ? 'default' : 'ghost'} icon={icon} onClick={(e) => setEl(e.currentTarget as HTMLElement)}>{label}</Button>
      {el && <Popover anchor={el} align="end" onClose={() => setEl(null)} width={440}><div className="pad">{children}</div></Popover>}
    </>
  )
}

// ---------- the database ----------
/** A database with its views. Used as a page and inside dashboard widgets. */
export function DatabaseView({ dbId, viewId, embedded }: { dbId: string; viewId?: string; embedded?: boolean }): JSX.Element {
  const page = useData((d) => d.pages[dbId])
  const all = useData((d) => d.pages)
  const rows = useMemo(() => Object.values(all).filter((p) => p.rowOf === dbId && !p.deletedAt).sort((a, b) => (a.rowOrder ?? a.createdAt) - (b.rowOrder ?? b.createdAt)), [all, dbId])
  const [q, setQ] = useState('')
  const [viewEl, setViewEl] = useState<{ el: HTMLElement; id: string } | null>(null)
  const [addEl, setAddEl] = useState<HTMLElement | null>(null)
  const renaming = useRef<string | null>(null)
  const [, force] = useState(0)
  const db = page?.db
  if (!page || !db) return <div className="muted pad">This database no longer exists.</div>
  const activeId: string = viewId ?? page.view?.activeView ?? db.views[0]?.id
  const view = db.views.find((v) => v.id === activeId) ?? db.views[0]
  const shown = viewRows(rows, db, view, q)
  const setActive = (id: string): void => act((d) => { const p = d.pages[dbId]; p.view = { ...(p.view ?? {}), activeView: id } }, { history: false })
  const viewMenu = (v: DbView): MenuItem[] => [
    { label: 'Rename', icon: 'edit', onClick: () => { renaming.current = v.id; force((n) => n + 1) } },
    ...VIEW_TYPES.map((t) => ({ label: `Layout: ${t.name}`, checked: v.type === t.type, onClick: () => updateView(dbId, v.id, (x) => {
      x.type = t.type
      if (t.type === 'board' && !x.groupBy) x.groupBy = (db.props.find((p) => p.type === 'status') ?? db.props.find((p) => p.type === 'select'))?.id ?? null
      if (t.type === 'calendar' && !x.dateProp) x.dateProp = db.props.find((p) => p.type === 'date')?.id ?? null
      if (!x.cardProps) x.cardProps = db.props.slice(0, 3).map((p) => p.id)
    }) })),
    { divider: true, label: '' },
    { label: 'Duplicate view', icon: 'copy', onClick: () => updateDb(dbId, (s) => { const i = s.views.findIndex((x) => x.id === v.id); s.views.splice(i + 1, 0, { ...structuredClone(v), id: uid(), name: v.name + ' copy' }) }) },
    { label: 'Delete view', icon: 'trash', danger: true, disabled: db.views.length < 2, onClick: () => updateDb(dbId, (s) => { s.views = s.views.filter((x) => x.id !== v.id) }) }
  ]
  const groupable = db.props.filter((p) => p.type === 'select' || p.type === 'status')
  const dates = db.props.filter((p) => p.type === 'date')
  return (
    <div className={`db ${embedded ? 'embedded' : ''}`}>
      <div className="db-toolbar">
        {!viewId && (
          <div className="db-tabs">
            {db.views.map((v) => (
              renaming.current === v.id ? (
                <input key={v.id} className="input input-sm w-120" autoFocus defaultValue={v.name} onBlur={(e) => { const n = e.target.value.trim(); if (n) updateView(dbId, v.id, (x) => { x.name = n }); renaming.current = null; force((k) => k + 1) }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
              ) : (
                <button key={v.id} className={`db-tab ${v.id === view.id ? 'active' : ''}`} onClick={(e) => { if (v.id === view.id) setViewEl({ el: e.currentTarget, id: v.id }); else setActive(v.id) }}>
                  <Icon name={VIEW_TYPES.find((t) => t.type === v.type)?.icon ?? 'table'} size={13} />{v.name}
                </button>
              )
            ))}
            <button className="icon-btn" title="Add a view" onClick={(e) => setAddEl(e.currentTarget)}><Icon name="plus" size={14} /></button>
          </div>
        )}
        <div className="spacer" />
        {!embedded && <div className="search-mini"><Icon name="search" size={13} /><input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} /></div>}
        <ToolbarPop icon="filter" label={(view.filters ?? []).length ? `Filter ${(view.filters ?? []).length}` : 'Filter'} active={!!(view.filters ?? []).length}><FilterEditor dbId={dbId} db={db} view={view} /></ToolbarPop>
        <ToolbarPop icon="sort" label="Sort" active={!!view.sort}>
          <div className="row gap-xs">
            <select className="input input-sm" value={view.sort?.prop ?? ''} onChange={(e) => updateView(dbId, view.id, (v) => { v.sort = e.target.value ? { prop: e.target.value, dir: v.sort?.dir ?? 'asc' } : null })}>
              <option value="">Manual order</option>
              <option value={TITLE}>Name</option>
              {db.props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {view.sort && <select className="input input-sm" value={view.sort.dir} onChange={(e) => updateView(dbId, view.id, (v) => { if (v.sort) v.sort.dir = e.target.value as 'asc' | 'desc' })}><option value="asc">Ascending</option><option value="desc">Descending</option></select>}
          </div>
        </ToolbarPop>
        {view.type === 'board' && (
          <select className="input input-sm db-select" title="Group by" value={view.groupBy ?? ''} onChange={(e) => updateView(dbId, view.id, (v) => { v.groupBy = e.target.value || null })}>
            <option value="">Group by…</option>
            {groupable.map((p) => <option key={p.id} value={p.id}>Group: {p.name}</option>)}
          </select>
        )}
        {view.type === 'calendar' && (
          <select className="input input-sm db-select" title="Date property" value={view.dateProp ?? ''} onChange={(e) => updateView(dbId, view.id, (v) => { v.dateProp = e.target.value || null })}>
            <option value="">Date property…</option>
            {dates.map((p) => <option key={p.id} value={p.id}>By {p.name}</option>)}
          </select>
        )}
        <ToolbarPop icon="eye" label="Properties"><PropsEditor dbId={dbId} db={db} view={view} /></ToolbarPop>
        <Button small kind="primary" icon="plus" onClick={() => { const id = addRow(dbId, defaultsFromFilters(view)); if (view.type !== 'table') openPage(id) }}>New</Button>
      </div>
      {rows.length === 0 && view.type !== 'calendar' && view.type !== 'table' ? <Empty icon="database" title="No rows yet" /> : null}
      {view.type === 'table' && <TableView dbId={dbId} db={db} view={view} rows={shown} />}
      {view.type === 'board' && <BoardView dbId={dbId} db={db} view={view} rows={shown} />}
      {view.type === 'gallery' && <GalleryView dbId={dbId} db={db} view={view} rows={shown} />}
      {view.type === 'list' && <ListView dbId={dbId} db={db} view={view} rows={shown} />}
      {view.type === 'calendar' && <CalendarView dbId={dbId} db={db} view={view} rows={shown} />}
      {viewEl && <Popover anchor={viewEl.el} onClose={() => setViewEl(null)}><Menu items={viewMenu(db.views.find((v) => v.id === viewEl.id) ?? view)} onClose={() => setViewEl(null)} /></Popover>}
      {addEl && <Popover anchor={addEl} onClose={() => setAddEl(null)}><Menu items={VIEW_TYPES.map((t) => ({ label: t.name, icon: t.icon, onClick: () => { const nv = newView(t.type, db); updateDb(dbId, (s) => { s.views.push(nv) }); setActive(nv.id) } }))} onClose={() => setAddEl(null)} /></Popover>}
    </div>
  )
}

export function DatabasePage({ pageId }: { pageId: string }): JSX.Element {
  return <DatabaseView dbId={pageId} />
}

/** Properties panel shown at the top of a row opened as a page. */
export function RowProps({ rowId }: { rowId: string }): JSX.Element | null {
  const row = useData((d) => d.pages[rowId])
  const db = useData((d) => (row?.rowOf ? d.pages[row.rowOf]?.db : undefined))
  if (!row?.rowOf || !db) return null
  return (
    <div className="row-props">
      {db.props.map((p) => (
        <div key={p.id} className="row-prop">
          <span className="row-prop-name"><Icon name={propTypeInfo(p.type).icon} size={13} />{p.name}</span>
          <div className="row-prop-val"><PropCell row={row} prop={p} dbId={row.rowOf!} inline /></div>
        </div>
      ))}
      <button className="row-prop-add" onClick={() => addProp(row.rowOf!, 'text')}><Icon name="plus" size={13} /> Add a property</button>
    </div>
  )
}

export const friendly = friendlyDay
export const rowsOfDb = rowsOf
