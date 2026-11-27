import { useMemo, useRef, useState } from 'react'
import { act, getData, openPage, useData } from '../store'
import type { DbFilter, DbProp, DbSchema, DbView, Page, PropType } from '../types'
import {
  TITLE, PROP_TYPES, ROLLUP_FNS, VIEW_TYPES, addOption, addProp, addRow, addRowFrom, addTemplate, cellValue, deleteProp, deleteRows, filterOps, formatNumber, formulaResult, hasOptions,
  isComputed, linkedRows, newView, optionOf, propText, propTypeInfo, rowsOf, setRowProp, setupProp, templatesOf, updateDb, updateView, viewRows
} from '../lib/db'
import { FORMULA_FUNCTIONS, formulaText } from '../lib/formula'
import { ChartSvg, chartData, chartGroupable, chartTitleOf } from '../components/DbChart'
import { COLORS, coverStyle } from '../lib/defaults'
import { DAYS_SHORT, MONTHS_LONG, addDays, friendlyDay, parseDay, today, uid, weekStartOf } from '../lib/util'
import { Button, ColorDots, Empty, Menu, type MenuItem, Popover, Progress, Segmented } from '../components/ui'
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

function RelationPicker({ prop, value, onChange, onClose, anchor }: { prop: DbProp; value: any; onChange: (v: string[]) => void; onClose: () => void; anchor: HTMLElement }): JSX.Element {
  const all = useData((d) => d.pages)
  const target = prop.relation ? all[prop.relation] : undefined
  const [q, setQ] = useState('')
  const sel: string[] = Array.isArray(value) ? value : []
  const rows = target ? Object.values(all).filter((r) => r.rowOf === target.id && !r.deletedAt && !r.template) : []
  const ql = q.trim().toLowerCase()
  const list = rows.filter((r) => (r.title || 'Untitled').toLowerCase().includes(ql)).sort((a, b) => Number(sel.includes(b.id)) - Number(sel.includes(a.id))).slice(0, 80)
  const toggle = (id: string): void => onChange(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id])
  const create = (): void => { if (!target || !q.trim()) return; const id = addRow(target.id, {}, q.trim()); onChange([...sel, id]); setQ('') }
  return (
    <Popover anchor={anchor} onClose={onClose} width={280}>
      <div className="db-picker" onClick={(e) => e.stopPropagation()}>
        {!target ? <div className="muted small pad">Pick the database to link to from this property's menu.</div> : <>
          <input className="input input-sm" autoFocus placeholder={`Link to ${target.title || 'a row'}`} value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { if (list[0] && (!ql || list[0].title.toLowerCase() === ql)) toggle(list[0].id); else create() } }} />
          <div className="db-opts">
            {list.map((r) => (
              <div key={r.id} className={`db-opt ${sel.includes(r.id) ? 'on' : ''}`} onClick={() => toggle(r.id)}>
                <span className="db-rel-chip"><Glyph value={r.icon} fallback="file-text" size={12} />{r.title || 'Untitled'}</span>
                <span className="spacer" />
                {sel.includes(r.id) && <Icon name="check" size={13} />}
              </div>
            ))}
            {ql && !rows.some((r) => r.title.toLowerCase() === ql) && <div className="db-opt" onClick={create}><span className="muted small">New row</span><span className="db-rel-chip">{q.trim()}</span></div>}
            {!list.length && !ql && <div className="muted small pad">{target.title || 'That database'} has no rows yet</div>}
          </div>
        </>}
      </div>
    </Popover>
  )
}

/** Value of a rollup or formula, read-only. */
function ComputedView({ prop, v }: { prop: DbProp; v: any }): JSX.Element | null {
  if (v === undefined || v === null || v === '') return null
  if (typeof v === 'boolean') return <Icon name={v ? 'square-check-big' : 'square'} size={14} className={v ? 'accent-ink' : 'muted'} />
  if (prop.type === 'rollup' && prop.rollup?.fn === 'checked') return <span className="db-cell-progress"><Progress value={Number(v) / 100} height={4} /><span className="small muted">{v}%</span></span>
  return <span className={`ellipsis ${typeof v === 'number' ? 'num' : ''}`}>{propText(prop, v)}</span>
}

// ---------- cells ----------
export function PropCell({ row, prop, dbId, inline }: { row: Page; prop: DbProp; dbId: string; inline?: boolean }): JSX.Element {
  const v = row.props?.[prop.id]
  const [el, setEl] = useState<HTMLElement | null>(null)
  const set = (val: any, key?: string): void => setRowProp(row.id, prop.id, val, key)
  if (isComputed(prop.type)) return <div className="db-cell db-computed"><ComputedView prop={prop} v={cellValue(getData(), row, prop)} />{!inline ? null : cellValue(getData(), row, prop) === null ? <span className="db-empty">Empty</span> : null}</div>
  switch (prop.type) {
    case 'relation': {
      const linked = linkedRows(getData(), row, prop)
      return (
        <div className="db-cell db-cell-btn" onClick={(e) => { e.stopPropagation(); setEl(e.currentTarget) }}>
          {linked.map((r) => <span key={r.id} className="db-rel-chip link" onClick={(e) => { e.stopPropagation(); openPage(r.id) }}><Glyph value={r.icon} fallback="file-text" size={12} />{r.title || 'Untitled'}</span>)}
          {!linked.length && inline && <span className="db-empty">Empty</span>}
          {el && <RelationPicker prop={prop} value={v} anchor={el} onChange={(x) => set(x)} onClose={() => setEl(null)} />}
        </div>
      )
    }
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
  if (isComputed(prop.type)) return <span className="small muted row gap-xs">{typeof v === 'boolean' ? <><Icon name={v ? 'square-check-big' : 'square'} size={13} /> {prop.name}</> : propText(prop, v)}</span>
  if (prop.type === 'relation') return <div className="row gap-xs wrap">{(Array.isArray(v) ? v : []).map((id: string) => getData().pages[id]).filter((r): r is Page => !!r && !r.deletedAt).map((r) => <span key={r.id} className="db-rel-chip"><Glyph value={r.icon} fallback="file-text" size={11} />{r.title || 'Untitled'}</span>)}</div>
  if (prop.type === 'progress') return <Progress value={(Number(v) || 0) / (prop.max || 100)} height={4} />
  return <span className="small muted ellipsis">{prop.type === 'number' ? formatNumber(prop, Number(v)) : propText(prop, v)}</span>
}

// ---------- property header menu ----------
/** Write a formula with the result for the first row shown as you type. */
function FormulaEditor({ dbId, prop, anchor, onClose }: { dbId: string; prop: DbProp; anchor: HTMLElement; onClose: () => void }): JSX.Element {
  const db = useData((d) => d.pages[dbId]?.db)
  const sample = useData((d) => rowsOf(d, dbId)[0])
  const [src, setSrc] = useState(prop.formula ?? '')
  const ref = useRef<HTMLTextAreaElement>(null)
  const res = sample ? formulaResult(getData(), sample, prop, src) : { value: null }
  const insert = (t: string): void => {
    const el = ref.current
    const a = el?.selectionStart ?? src.length
    const b = el?.selectionEnd ?? src.length
    const next = src.slice(0, a) + t + src.slice(b)
    setSrc(next)
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(a + t.length, a + t.length) })
  }
  const save = (): void => { updateDb(dbId, (s) => { const p = s.props.find((x) => x.id === prop.id); if (p) p.formula = src }); onClose() }
  return (
    <Popover anchor={anchor} onClose={save} width={460}>
      <div className="formula-edit" onClick={(e) => e.stopPropagation()}>
        <textarea ref={ref} className="input formula-input" autoFocus spellCheck={false} rows={3} value={src} placeholder={'prop("Price") * prop("Amount")'}
          onChange={(e) => setSrc(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save() }} />
        <div className={`formula-result ${res.error ? 'error' : ''}`}>
          {res.error ? res.error : sample ? <>{sample.title || 'Untitled'}: <strong>{formulaText(res.value) || '—'}</strong></> : 'Add a row to see the result'}
        </div>
        <div className="section-label">Properties</div>
        <div className="formula-chips">
          <button onClick={() => insert('prop("Name")')}>Name</button>
          {(db?.props ?? []).filter((p) => p.id !== prop.id).map((p) => <button key={p.id} onClick={() => insert(`prop("${p.name}")`)}>{p.name}</button>)}
        </div>
        <div className="section-label">Functions</div>
        <div className="formula-chips fn">
          {FORMULA_FUNCTIONS.filter((f) => f !== 'prop').map((f) => <button key={f} onClick={() => insert(f + '(')}>{f}</button>)}
        </div>
        <div className="row gap-sm"><div className="spacer" /><Button small kind="primary" onClick={save}>Done</Button></div>
      </div>
    </Popover>
  )
}

function PropHeader({ dbId, view, prop }: { dbId: string; view: DbView; prop: DbProp }): JSX.Element {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [rename, setRename] = useState(false)
  const [formulaEl, setFormulaEl] = useState<HTMLElement | null>(null)
  const pages = useData((d) => d.pages)
  const db = pages[dbId]?.db
  const dbs = Object.values(pages).filter((x) => x.type === 'database' && !x.deletedAt)
  const rels = (db?.props ?? []).filter((x) => x.type === 'relation')
  const rel = prop.rollup ? rels.find((x) => x.id === prop.rollup!.rel) : undefined
  const relDb = rel?.relation ? pages[rel.relation]?.db : undefined
  const setP = (fn: (p: DbProp) => void): void => updateDb(dbId, (s) => { const p = s.props.find((x) => x.id === prop.id); if (p) fn(p) })
  const special: MenuItem[] = prop.type === 'relation' ? [
    { divider: true, label: '' },
    ...dbs.map((x) => ({ label: `Links to: ${x.title || 'Untitled'}${x.id === dbId ? ' (this one)' : ''}`, checked: prop.relation === x.id, onClick: () => setP((p) => { p.relation = x.id }) }))
  ] : prop.type === 'rollup' ? [
    { divider: true, label: '' },
    ...(rels.length ? rels.map((r) => ({ label: `Through: ${r.name}`, checked: prop.rollup?.rel === r.id, onClick: () => setP((p) => { p.rollup = { rel: r.id, prop: TITLE, fn: p.rollup?.fn ?? 'count' } }) })) : [{ label: 'Add a Relation property first', disabled: true }]),
    ...(relDb ? [{ divider: true, label: '' }, { label: 'Of: Name', checked: prop.rollup?.prop === TITLE, onClick: () => setP((p) => { if (p.rollup) p.rollup.prop = TITLE }) },
      ...relDb.props.filter((x) => x.type !== 'rollup').map((x) => ({ label: `Of: ${x.name}`, checked: prop.rollup?.prop === x.id, onClick: () => setP((p) => { if (p.rollup) p.rollup.prop = x.id }) }))] : []),
    ...(prop.rollup ? [{ divider: true, label: '' }, ...ROLLUP_FNS.map((f) => ({ label: `Show: ${f.name}`, checked: prop.rollup?.fn === f.fn, onClick: () => setP((p) => { if (p.rollup) p.rollup.fn = f.fn }) }))] : [])
  ] : prop.type === 'formula' ? [
    { divider: true, label: '' },
    { label: 'Edit formula…', icon: 'sigma', onClick: () => setFormulaEl(el) }
  ] : []
  const items: MenuItem[] = [
    { label: 'Rename', icon: 'edit', onClick: () => setRename(true) },
    ...PROP_TYPES.map((t) => ({ label: `Type: ${t.name}`, checked: prop.type === t.type, onClick: () => updateDb(dbId, (db) => {
      const p = db.props.find((x) => x.id === prop.id)
      if (!p || p.type === t.type) return
      p.type = t.type
      if (hasOptions(t.type) && !p.options) p.options = []
      if (t.type === 'progress' && !p.max) p.max = 100
      setupProp(getData(), dbId, db, p)
    }) })),
    ...special,
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
      {el && !formulaEl && <Popover anchor={el} onClose={() => setEl(null)}><Menu items={items} onClose={() => setEl(null)} /></Popover>}
      {formulaEl && <FormulaEditor dbId={dbId} prop={prop} anchor={formulaEl} onClose={() => { setFormulaEl(null); setEl(null) }} />}
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
      {shown.map((p) => <PropView key={p.id} prop={p} v={cellValue(getData(), row, p)} />)}
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
          {shown.map((p) => <PropView key={p.id} prop={p} v={cellValue(getData(), r, p)} />)}
        </button>
      ))}
      <button className="db-new-row" onClick={() => addRow(dbId, defaultsFromFilters(view))}><Icon name="plus" size={14} /> New</button>
    </div>
  )
}

const dayDiff = (a: string, b: string): number => Math.round((parseDay(a).getTime() - parseDay(b).getTime()) / 86400000)

function TimelineView({ dbId, db, view, rows }: { dbId: string; db: DbSchema; view: DbView; rows: Page[] }): JSX.Element {
  const startP = db.props.find((p) => p.id === view.dateProp && p.type === 'date')
  const endP = db.props.find((p) => p.id === view.endProp && p.type === 'date' && p.id !== view.dateProp)
  const [zoom, setZoom] = useState<'week' | 'month' | 'quarter'>('month')
  const t = today()
  const [from, setFrom] = useState(() => addDays(t, -7))
  const [drag, setDrag] = useState<{ id: string; dx: number; mode: 'move' | 'end' } | null>(null)
  if (!startP) return <div className="muted pad">Pick a Date property to place rows on the timeline.</div>
  const dw = zoom === 'week' ? 64 : zoom === 'month' ? 30 : 12
  const span = zoom === 'week' ? 21 : zoom === 'month' ? 56 : 120
  const days = Array.from({ length: span }, (_, i) => addDays(from, i))
  const dated = rows.filter((r) => typeof r.props?.[startP.id] === 'string')
  const undated = rows.filter((r) => typeof r.props?.[startP.id] !== 'string')
  const startDrag = (e: React.PointerEvent, r: Page, mode: 'move' | 'end'): void => {
    e.preventDefault()
    e.stopPropagation()
    const x0 = e.clientX
    let moved = 0
    const move = (ev: PointerEvent): void => { moved = ev.clientX - x0; setDrag({ id: r.id, dx: moved, mode }) }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setDrag(null)
      const n = Math.round(moved / dw)
      if (Math.abs(moved) < 4) { if (mode === 'move') openPage(r.id); return }
      if (!n) return
      const s0 = r.props?.[startP.id] as string
      const e0 = (endP && (r.props?.[endP.id] as string)) || s0
      if (mode === 'move') {
        setRowProp(r.id, startP.id, addDays(s0, n))
        if (endP && r.props?.[endP.id]) setRowProp(r.id, endP.id, addDays(e0, n))
      } else if (endP) {
        const ne = addDays(e0, n)
        setRowProp(r.id, endP.id, ne < s0 ? s0 : ne)
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  return (
    <div className="db-timeline glass">
      <div className="row gap-sm db-cal-nav">
        <button className="icon-btn" onClick={() => setFrom(addDays(from, -Math.round(span / 2)))}><Icon name="left" size={14} /></button>
        <button className="link small" onClick={() => setFrom(addDays(t, -7))}>Today</button>
        <button className="icon-btn" onClick={() => setFrom(addDays(from, Math.round(span / 2)))}><Icon name="right" size={14} /></button>
        <div className="spacer" />
        <Segmented small value={zoom} onChange={setZoom} options={[{ value: 'week', label: 'Weeks' }, { value: 'month', label: 'Months' }, { value: 'quarter', label: 'Quarters' }]} />
      </div>
      <div className="tl-scroll">
        <div className="tl-grid" style={{ width: 220 + span * dw }}>
          <div className="tl-head">
            <div className="tl-name-col" />
            {days.map((d) => {
              const dt = parseDay(d)
              const first = dt.getDate() === 1 || d === from
              return (
                <div key={d} className={`tl-day ${d === t ? 'today' : ''} ${dt.getDay() === 0 || dt.getDay() === 6 ? 'weekend' : ''}`} style={{ width: dw }}>
                  {first && <span className="tl-month">{MONTHS_LONG[dt.getMonth()].slice(0, 3)} {dt.getFullYear() !== parseDay(t).getFullYear() ? dt.getFullYear() : ''}</span>}
                  {(zoom !== 'quarter' || dt.getDay() === 1) && <span className="tl-num">{dt.getDate()}</span>}
                </div>
              )
            })}
          </div>
          {dated.map((r) => {
            const s0 = r.props?.[startP.id] as string
            const e0 = (endP && (r.props?.[endP.id] as string)) || s0
            let a = dayDiff(s0, from)
            let b = dayDiff(e0 < s0 ? s0 : e0, from)
            const dx = drag?.id === r.id ? drag.dx : 0
            const color = optionOf(db.props.find((p) => p.type === 'status') ?? db.props.find((p) => p.type === 'select') ?? ({} as DbProp), r.props?.[(db.props.find((p) => p.type === 'status') ?? db.props.find((p) => p.type === 'select'))?.id ?? ''])?.color
            const visible = b >= 0 && a < span
            const cutL = a < 0
            const cutR = b >= span
            a = Math.max(0, a)
            b = Math.min(span - 1, b)
            return (
              <div key={r.id} className="tl-row">
                <button className="tl-name-col ellipsis" onClick={() => openPage(r.id)}>{r.icon && <Glyph value={r.icon} size={13} />} {r.title || 'Untitled'}</button>
                <div className="tl-track" style={{ width: span * dw }}>
                  {days.map((d) => <span key={d} className={`tl-cell ${d === t ? 'today' : ''}`} style={{ width: dw }} />)}
                  {visible && (
                    <div className={`tl-bar ${drag?.id === r.id ? 'dragging' : ''} ${cutL ? 'cut-l' : ''} ${cutR ? 'cut-r' : ''}`} style={{ left: a * dw + 2 + (drag?.mode === 'move' ? dx : 0), width: Math.max(dw - 4, (b - a + 1) * dw - 4 + (drag?.mode === 'end' ? dx : 0)), ['--c' as any]: color ?? 'var(--accent)' }}
                      onPointerDown={(e) => startDrag(e, r, 'move')} title={`${friendlyDay(s0)}${e0 !== s0 ? ' – ' + friendlyDay(e0) : ''}`}>
                      <span className="ellipsis">{r.title || 'Untitled'}</span>
                      {endP && <span className="tl-handle" onPointerDown={(e) => startDrag(e, r, 'end')} />}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {undated.length > 0 && (
        <div className="tl-undated">
          <span className="section-label">No date</span>
          {undated.map((r) => <button key={r.id} className="db-rel-chip link" title="Put on today" onClick={() => setRowProp(r.id, startP.id, t)}><Icon name="plus" size={11} />{r.title || 'Untitled'}</button>)}
        </div>
      )}
      <button className="db-new-row" onClick={() => addRow(dbId, { ...defaultsFromFilters(view), [startP.id]: t })}><Icon name="plus" size={14} /> New</button>
    </div>
  )
}

function ChartView({ db, view, rows }: { db: DbSchema; view: DbView; rows: Page[] }): JSX.Element {
  const c = view.chart ?? { kind: 'bar', by: null, value: null, fn: 'count' }
  const data = chartData(getData(), db, rows, c)
  return (
    <div className="db-chart glass">
      <div className="db-chart-title">{chartTitleOf(db, c)}</div>
      <ChartSvg data={data} kind={c.kind} height={c.kind === 'donut' ? 220 : 260} />
    </div>
  )
}

function ChartSettings({ dbId, db, view }: { dbId: string; db: DbSchema; view: DbView }): JSX.Element {
  const c = view.chart ?? { kind: 'bar' as const, by: null, value: null, fn: 'count' as const }
  const set = (p: Partial<typeof c>): void => updateView(dbId, view.id, (v) => { v.chart = { ...c, ...p } })
  const nums = db.props.filter((p) => p.type === 'number' || p.type === 'progress' || isComputed(p.type))
  return (
    <div className="form-grid">
      <label>Chart</label><Segmented small value={c.kind} onChange={(v) => set({ kind: v })} options={[{ value: 'bar', label: 'Bars' }, { value: 'hbar', label: 'Rows' }, { value: 'line', label: 'Line' }, { value: 'donut', label: 'Donut' }]} />
      <label>Split by</label>
      <select className="input input-sm" value={c.by ?? ''} onChange={(e) => set({ by: e.target.value || null })}>
        <option value="">Nothing (one total)</option>
        {chartGroupable(db).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <label>Show</label>
      <select className="input input-sm" value={c.fn === 'count' ? 'count' : `${c.fn}:${c.value ?? ''}`} onChange={(e) => { const v = e.target.value; if (v === 'count') set({ fn: 'count', value: null }); else { const [fn, id] = v.split(':'); set({ fn: fn as 'sum' | 'avg', value: id }) } }}>
        <option value="count">Number of rows</option>
        {nums.flatMap((p) => [<option key={'s' + p.id} value={`sum:${p.id}`}>Total {p.name}</option>, <option key={'a' + p.id} value={`avg:${p.id}`}>Average {p.name}</option>])}
      </select>
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
  const rows = useMemo(() => Object.values(all).filter((p) => p.rowOf === dbId && !p.deletedAt && !p.template).sort((a, b) => (a.rowOrder ?? a.createdAt) - (b.rowOrder ?? b.createdAt)), [all, dbId])
  const [q, setQ] = useState('')
  const [viewEl, setViewEl] = useState<{ el: HTMLElement; id: string } | null>(null)
  const [addEl, setAddEl] = useState<HTMLElement | null>(null)
  const [tplEl, setTplEl] = useState<HTMLElement | null>(null)
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
      if ((t.type === 'calendar' || t.type === 'timeline') && !x.dateProp) x.dateProp = db.props.find((p) => p.type === 'date')?.id ?? null
      if (t.type === 'chart' && !x.chart) x.chart = { kind: 'bar', by: (db.props.find((p) => p.type === 'status') ?? db.props.find((p) => p.type === 'select'))?.id ?? null, value: null, fn: 'count' }
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
        {view.type === 'timeline' && <>
          <select className="input input-sm db-select" title="Starts" value={view.dateProp ?? ''} onChange={(e) => updateView(dbId, view.id, (v) => { v.dateProp = e.target.value || null })}>
            <option value="">Starts on…</option>
            {dates.map((p) => <option key={p.id} value={p.id}>Starts: {p.name}</option>)}
          </select>
          <select className="input input-sm db-select" title="Ends" value={view.endProp ?? ''} onChange={(e) => updateView(dbId, view.id, (v) => { v.endProp = e.target.value || null })}>
            <option value="">Same day</option>
            {dates.filter((p) => p.id !== view.dateProp).map((p) => <option key={p.id} value={p.id}>Ends: {p.name}</option>)}
          </select>
        </>}
        {view.type === 'chart' && <ToolbarPop icon="chart-pie" label="Chart"><ChartSettings dbId={dbId} db={db} view={view} /></ToolbarPop>}
        <ToolbarPop icon="eye" label="Properties"><PropsEditor dbId={dbId} db={db} view={view} /></ToolbarPop>
        <span className="split-btn">
          <Button small kind="primary" icon="plus" onClick={() => { const id = addRow(dbId, defaultsFromFilters(view)); if (view.type !== 'table') openPage(id) }}>New</Button>
          <Button small kind="primary" icon="down" title="Templates" onClick={(e) => setTplEl(e.currentTarget as HTMLElement)} />
        </span>
      </div>
      {view.type === 'table' && <TableView dbId={dbId} db={db} view={view} rows={shown} />}
      {view.type === 'board' && <BoardView dbId={dbId} db={db} view={view} rows={shown} />}
      {view.type === 'gallery' && <GalleryView dbId={dbId} db={db} view={view} rows={shown} />}
      {view.type === 'list' && <ListView dbId={dbId} db={db} view={view} rows={shown} />}
      {view.type === 'calendar' && <CalendarView dbId={dbId} db={db} view={view} rows={shown} />}
      {view.type === 'timeline' && <TimelineView dbId={dbId} db={db} view={view} rows={shown} />}
      {view.type==='form'&&<EntryForm key={dbId+view.id} dbId={dbId} db={db} view={view}/>}
      {view.type === 'chart' && <ChartView db={db} view={view} rows={shown} />}
      {tplEl && <Popover anchor={tplEl} align="end" onClose={() => setTplEl(null)}><Menu onClose={() => setTplEl(null)} items={[
        ...templatesOf(getData(), dbId).map((t) => ({ label: t.title || 'Untitled', icon: 'file-text', onClick: () => { const id = addRowFrom(dbId, t.id, defaultsFromFilters(view)); openPage(id) } })),
        ...(templatesOf(getData(), dbId).length ? [{ divider: true, label: '' }] : []),
        ...templatesOf(getData(), dbId).map((t) => ({ label: `Edit ${t.title || 'Untitled'}`, icon: 'edit', onClick: () => openPage(t.id) })),
        { label: 'New template', icon: 'plus', onClick: () => openPage(addTemplate(dbId)) }
      ]} /></Popover>}
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
      {row.template && <div className="row-template-note"><Icon name="file-text" size={13} /> Template for new rows <button className="link small" onClick={() => act((d) => { d.pages[rowId].template = undefined })}>Make it a normal row</button></div>}
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

function EntryForm({dbId,db,view}:{dbId:string;db:DbSchema;view:DbView}):JSX.Element {
 const [title,setTitle]=useState(''),[fields,setFields]=useState<Record<string,any>>({}),[sent,setSent]=useState(false)
 return <form className="form panel glass" onSubmit={e=>{e.preventDefault();if(!title.trim())return;addRow(dbId,{...defaultsFromFilters(view),...fields},title.trim());setTitle('');setFields({});setSent(true)}}>
 <label>Name<input className="input" required value={title} onChange={e=>{setTitle(e.target.value);setSent(false)}}/></label>
 {db.props.filter(p=>['text','number','checkbox','date','url'].includes(p.type)).map(p=><label key={p.id}>{p.name}<input className="input" type={p.type==='checkbox'?'checkbox':p.type==='number'?'number':p.type==='date'?'date':p.type==='url'?'url':'text'} step={p.type==='number'?'any':undefined} checked={p.type==='checkbox'?!!fields[p.id]:undefined} value={p.type==='checkbox'?undefined:fields[p.id]??''} onChange={e=>setFields({...fields,[p.id]:p.type==='checkbox'?e.target.checked:p.type==='number'&&e.target.value?e.target.valueAsNumber:e.target.value})}/></label>)}
 <button className="btn btn-primary">Submit entry</button>{sent&&<small role="status">Entry saved</small>}</form>
}
