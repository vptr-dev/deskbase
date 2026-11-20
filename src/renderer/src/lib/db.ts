import { act, emit, getData, toast, unemit } from '../store'
import type { AppData, Block, DbFilter, DbProp, DbSchema, DbView, Page, PropType, RollupFn, ViewType } from '../types'
import { evalFormula, formulaText, type FVal } from './formula'
import { COLORS } from './defaults'
import { friendlyDay, today, uid } from './util'

/** Pseudo property id for the row title ("Name" column). */
export const TITLE = '__title'

export const PROP_TYPES: { type: PropType; name: string; icon: string }[] = [
  { type: 'text', name: 'Text', icon: 'note' },
  { type: 'number', name: 'Number', icon: 'chart' },
  { type: 'select', name: 'Select', icon: 'down' },
  { type: 'multi', name: 'Multi-select', icon: 'list' },
  { type: 'status', name: 'Status', icon: 'restore' },
  { type: 'date', name: 'Date', icon: 'calendar' },
  { type: 'checkbox', name: 'Checkbox', icon: 'check' },
  { type: 'url', name: 'URL', icon: 'link' },
  { type: 'progress', name: 'Progress', icon: 'gauge' },
  { type: 'relation', name: 'Relation', icon: 'arrow-up-right' },
  { type: 'rollup', name: 'Rollup', icon: 'search' },
  { type: 'formula', name: 'Formula', icon: 'sigma' }
]

/** Properties whose value is worked out instead of typed in. */
export const isComputed = (t: PropType): boolean => t === 'rollup' || t === 'formula'

export const ROLLUP_FNS: { fn: RollupFn; name: string }[] = [
  { fn: 'count', name: 'Count' }, { fn: 'sum', name: 'Sum' }, { fn: 'avg', name: 'Average' }, { fn: 'min', name: 'Smallest' }, { fn: 'max', name: 'Largest' },
  { fn: 'checked', name: 'Percent checked' }, { fn: 'list', name: 'Show values' }, { fn: 'earliest', name: 'Earliest date' }, { fn: 'latest', name: 'Latest date' }
]
export const propTypeInfo = (t: PropType): (typeof PROP_TYPES)[number] => PROP_TYPES.find((p) => p.type === t) ?? PROP_TYPES[0]

export const VIEW_TYPES: { type: ViewType; name: string; icon: string }[] = [
  { type: 'table', name: 'Table', icon: 'table' },
  { type: 'board', name: 'Board', icon: 'board' },
  { type: 'gallery', name: 'Gallery', icon: 'gallery' },
  { type: 'list', name: 'List', icon: 'list' },
  { type: 'calendar', name: 'Calendar', icon: 'calendar' },
  { type: 'timeline', name: 'Timeline', icon: 'calendar-range' },
  { type: 'chart', name: 'Chart', icon: 'chart-pie' }
]

export const hasOptions = (t: PropType): boolean => t === 'select' || t === 'multi' || t === 'status'

export function updateDb(dbId: string, fn: (db: DbSchema, page: Page) => void, key?: string): void {
  act((d) => {
    const p = d.pages[dbId]
    if (!p?.db) return
    fn(p.db, p)
    p.updatedAt = Date.now()
  }, { key })
}

export function updateView(dbId: string, viewId: string, fn: (v: DbView) => void, key?: string): void {
  updateDb(dbId, (db) => { const v = db.views.find((x) => x.id === viewId); if (v) fn(v) }, key)
}

export function rowsOf(d: AppData, dbId: string): Page[] {
  return Object.values(d.pages).filter((p) => p.rowOf === dbId && !p.deletedAt && !p.template).sort((a, b) => (a.rowOrder ?? a.createdAt) - (b.rowOrder ?? b.createdAt))
}

export function addRow(dbId: string, props: Record<string, any> = {}, title = ''): string {
  const id = uid()
  act((d) => {
    const now = Date.now()
    const orders = Object.values(d.pages).filter((p) => p.rowOf === dbId).map((p) => p.rowOrder ?? 0)
    d.pages[id] = {
      id, title, icon: '', type: 'doc', parentId: null, children: [], createdAt: now, updatedAt: now, deletedAt: null,
      blocks: [{ id: uid(), type: 'p', text: '' }], expanded: false, view: {}, rowOf: dbId, props: { ...props },
      rowOrder: orders.length ? Math.max(...orders) + 1 : 0
    }
  })
  return id
}

/** Row templates of a database. */
export function templatesOf(d: AppData, dbId: string): Page[] {
  return Object.values(d.pages).filter((p) => p.rowOf === dbId && !p.deletedAt && p.template).sort((a, b) => a.createdAt - b.createdAt)
}

/** A deep copy of blocks with new ids (tabs and columns included). */
export function copyBlocks(blocks: Block[]): Block[] {
  const re = (list: Block[]): Block[] => list.map((b) => {
    const c: any = { ...b, id: uid() }
    if (Array.isArray(c.children)) c.children = re(c.children)
    if (Array.isArray(c.cols)) c.cols = c.cols.map((col: any) => (Array.isArray(col) ? re(col) : col))
    return c
  })
  return re(structuredClone(blocks))
}

/** A new row that starts as a copy of a template row. */
export function addRowFrom(dbId: string, tplId: string, props: Record<string, any> = {}): string {
  const t = getData().pages[tplId]
  const id = addRow(dbId, { ...(t?.props ?? {}), ...props }, t?.title ?? '')
  if (t) act((d) => { const r = d.pages[id]; r.icon = t.icon; r.iconColor = t.iconColor; r.cover = t.cover ?? null; r.blocks = copyBlocks(t.blocks) })
  return id
}

/** A new page that starts as a copy of a template page (its look, content and database setup). */
export function pageFromTemplate(tplId: string, parentId: string | null, title?: string): string {
  const t = getData().pages[tplId]
  const id = uid()
  act((d) => {
    const now = Date.now()
    const page: Page = {
      ...structuredClone(t), id, title: title ?? t.title, parentId, children: [], createdAt: now, updatedAt: now, favorite: false,
      template: undefined, source: null, rowOf: null, props: undefined, blocks: copyBlocks(t.blocks)
    }
    if (page.db) page.db = { ...page.db, views: page.db.views.map((v) => ({ ...v, id: uid() })) }
    d.pages[id] = page
    if (parentId && d.pages[parentId]) d.pages[parentId].children.push(id)
    else d.rootOrder.push(id)
    if (t.db) for (const r of Object.values(d.pages).filter((x) => x.rowOf === tplId && x.template && !x.deletedAt)) {
      const rid = uid()
      d.pages[rid] = { ...structuredClone(r), id: rid, rowOf: id, createdAt: now, updatedAt: now, blocks: copyBlocks(r.blocks) }
    }
  })
  return id
}

/** A new template row for a database. */
export function addTemplate(dbId: string): string {
  const id = addRow(dbId, {}, 'New template')
  act((d) => { d.pages[id].template = true })
  return id
}

export function deleteRows(ids: string[]): void {
  act((d) => { const now = Date.now(); for (const id of ids) if (d.pages[id]) d.pages[id].deletedAt = now })
  toast(`Deleted ${ids.length === 1 ? 'row' : `${ids.length} rows`}`, { undo: true })
}

/** Set a row property and run value rules for status/select/checkbox changes. */
export function setRowProp(rowId: string, propId: string, value: any, key?: string): void {
  act((d) => {
    const row = d.pages[rowId]
    if (!row?.rowOf) return
    if (propId === TITLE) { row.title = String(value ?? ''); row.updatedAt = Date.now(); return }
    const prop = d.pages[row.rowOf]?.db?.props.find((p) => p.id === propId)
    row.props = row.props ?? {}
    const old = row.props[propId]
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) delete row.props[propId]
    else row.props[propId] = value
    row.updatedAt = Date.now()
    if (!prop) return
    const base = { on: 'row' as const, label: row.title || 'Row', scope: row.rowOf, prop: propId }
    if (prop.type === 'checkbox') {
      const src = `row:${rowId}:${propId}`
      if (value && !old) emit(d, { ...base, src, option: null })
      else if (!value && old) unemit(d, src)
    } else if (prop.type === 'status' || prop.type === 'select') {
      if (old === value) return
      if (old) unemit(d, `row:${rowId}:${propId}:${old}`)
      if (value) emit(d, { ...base, src: `row:${rowId}:${propId}:${value}`, option: value })
    }
  }, { key })
}

export function addProp(dbId: string, type: PropType, name?: string): string {
  const id = uid()
  updateDb(dbId, (db) => {
    const n = name ?? propTypeInfo(type).name
    let label = n
    for (let i = 2; db.props.some((p) => p.name === label); i++) label = `${n} ${i}`
    const p: DbProp = { id, name: label, type }
    if (hasOptions(type)) p.options = type === 'status'
      ? [{ id: uid(), name: 'Not started', color: '#8e8e93' }, { id: uid(), name: 'In progress', color: '#0a84ff' }, { id: uid(), name: 'Done', color: '#30d158' }]
      : []
    if (type === 'progress') p.max = 100
    setupProp(getData(), dbId, db, p)
    db.props.push(p)
  })
  return id
}

/** First settings for a relation, rollup or formula property. */
export function setupProp(d: AppData, dbId: string, db: DbSchema, p: DbProp): void {
  if (p.type === 'relation' && p.relation === undefined) p.relation = Object.values(d.pages).find((x) => x.type === 'database' && !x.deletedAt && x.id !== dbId)?.id ?? dbId
  if (p.type === 'formula' && p.formula === undefined) p.formula = ''
  if (p.type === 'rollup' && !p.rollup) { const rel = db.props.find((x) => x.type === 'relation'); p.rollup = rel ? { rel: rel.id, prop: TITLE, fn: 'count' } : null }
}

/** A formula's result for one row, with the error if it has one (for the formula editor). */
export function formulaResult(d: AppData, row: Page, prop: DbProp, src: string): { value: FVal; error?: string } {
  const db = d.pages[row.rowOf ?? '']?.db
  if (!db) return { value: null }
  return evalFormula(src, (name) => {
    const p = db.props.find((x) => x.name.toLowerCase() === name.toLowerCase())
    if (!p) { if (/^(name|title)$/i.test(name)) return row.title; throw new Error(`There is no property called "${name}"`) }
    if (p.id === prop.id) throw new Error('A formula cannot use itself')
    return toFVal(d, p, cellValue(d, row, p, 1))
  })
}

export function deleteProp(dbId: string, propId: string): void {
  act((d) => {
    const db = d.pages[dbId]?.db
    if (!db) return
    db.props = db.props.filter((p) => p.id !== propId)
    for (const v of db.views) {
      if (v.groupBy === propId) v.groupBy = null
      if (v.dateProp === propId) v.dateProp = null
      if (v.sort?.prop === propId) v.sort = null
      v.filters = (v.filters ?? []).filter((f) => f.prop !== propId)
    }
  })
  toast('Property deleted', { undo: true })
}

export function addOption(dbId: string, propId: string, name: string): string {
  const id = uid()
  updateDb(dbId, (db) => {
    const p = db.props.find((x) => x.id === propId)
    if (!p) return
    p.options = p.options ?? []
    p.options.push({ id, name, color: COLORS[p.options.length % COLORS.length] })
  })
  return id
}

export const optionOf = (prop: DbProp, id: string | undefined): { id: string; name: string; color: string } | undefined => prop.options?.find((o) => o.id === id)

export function propText(prop: DbProp, v: any): string {
  if (v === undefined || v === null || v === '') return ''
  switch (prop.type) {
    case 'select': case 'status': return optionOf(prop, v)?.name ?? ''
    case 'multi': return (Array.isArray(v) ? v : []).map((x) => optionOf(prop, x)?.name).filter(Boolean).join(', ')
    case 'checkbox': return v ? 'Yes' : 'No'
    case 'date': return friendlyDay(v)
    case 'number': return formatNumber(prop, Number(v))
    case 'progress': return `${Math.round((Number(v) / (prop.max || 100)) * 100)}%`
    case 'relation': { const d = getData(); return (Array.isArray(v) ? v : []).map((id) => d.pages[id]).filter((r) => r && !r.deletedAt).map((r) => r.title || 'Untitled').join(', ') }
    case 'formula': return formulaText(v)
    case 'rollup':
      if (prop.rollup?.fn === 'checked') return `${v}%`
      if (typeof v === 'number') return Number(v.toFixed(2)).toLocaleString()
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return friendlyDay(v)
      return String(v)
    default: return String(v)
  }
}

export function formatNumber(prop: DbProp, n: number): string {
  if (!Number.isFinite(n)) return ''
  if (prop.format === 'percent') return `${n}%`
  if (prop.format === 'currency') return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
  if (prop.format === 'decimal') return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return n.toLocaleString()
}

/** A cell's value, with rollups and formulas worked out. */
export function cellValue(d: AppData, row: Page, prop: DbProp, depth = 0): any {
  if (prop.type === 'formula') {
    const db = d.pages[row.rowOf ?? '']?.db
    if (!db || depth > 8) return null
    return evalFormula(prop.formula ?? '', (name) => {
      const p = db.props.find((x) => x.name.toLowerCase() === name.toLowerCase())
      if (!p) { if (/^(name|title)$/i.test(name)) return row.title; throw new Error('missing') }
      if (p.id === prop.id) throw new Error('self')
      return toFVal(d, p, cellValue(d, row, p, depth + 1))
    }).value
  }
  if (prop.type === 'rollup') {
    const ru = prop.rollup
    const db = d.pages[row.rowOf ?? '']?.db
    const rel = ru && db?.props.find((x) => x.id === ru.rel && x.type === 'relation')
    if (!ru || !rel || depth > 8) return null
    const linked = linkedRows(d, row, rel)
    const tdb = d.pages[rel.relation ?? '']?.db
    const tp = tdb?.props.find((x) => x.id === ru.prop)
    const vals = linked.map((r) => (tp ? cellValue(d, r, tp, depth + 1) : r.title))
    const nums = vals.map((v) => (typeof v === 'number' ? v : Number(v))).filter((n) => Number.isFinite(n) && n !== null)
    const dates = vals.filter((v): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)).sort()
    switch (ru.fn) {
      case 'count': return linked.length
      case 'sum': return nums.reduce((a, b) => a + b, 0)
      case 'avg': return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null
      case 'min': return nums.length ? Math.min(...nums) : null
      case 'max': return nums.length ? Math.max(...nums) : null
      case 'checked': return linked.length ? Math.round((vals.filter(Boolean).length / linked.length) * 100) : null
      case 'earliest': return dates[0] ?? null
      case 'latest': return dates[dates.length - 1] ?? null
      default: return linked.map((r, i) => (tp ? propText(tp, vals[i]) : r.title)).filter(Boolean).join(', ')
    }
  }
  return row.props?.[prop.id]
}

/** Rows a relation cell points at (missing or deleted ones left out). */
export function linkedRows(d: AppData, row: Page, rel: DbProp): Page[] {
  const ids: string[] = Array.isArray(row.props?.[rel.id]) ? row.props![rel.id] : []
  return ids.map((id) => d.pages[id]).filter((r): r is Page => !!r && !r.deletedAt)
}

/** A property value as formulas see it. */
function toFVal(d: AppData, p: DbProp, v: any): FVal {
  if (v === undefined || v === null || v === '') return null
  switch (p.type) {
    case 'number': case 'progress': return Number(v)
    case 'checkbox': return !!v
    case 'select': case 'status': return optionOf(p, v)?.name ?? null
    case 'multi': return (Array.isArray(v) ? v : []).map((x: string) => optionOf(p, x)?.name).filter(Boolean).join(', ')
    case 'relation': return (Array.isArray(v) ? v : []).map((id: string) => d.pages[id]?.title).filter(Boolean).join(', ')
    default: return typeof v === 'number' || typeof v === 'boolean' ? v : String(v)
  }
}

const rowVal = (row: Page, propId: string): any => {
  if (propId === TITLE) return row.title
  const d = getData()
  const prop = d.pages[row.rowOf ?? '']?.db?.props.find((p) => p.id === propId)
  return prop ? cellValue(d, row, prop) : row.props?.[propId]
}
const isEmpty = (v: any): boolean => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)

export function matchFilter(row: Page, f: DbFilter, prop: DbProp | undefined): boolean {
  const v = rowVal(row, f.prop)
  switch (f.op) {
    case 'empty': return isEmpty(v)
    case 'notEmpty': return !isEmpty(v)
    case 'checked': return !!v
    case 'unchecked': return !v
    case 'contains':
      if (Array.isArray(v)) return v.includes(f.value)
      return String(v ?? '').toLowerCase().includes(String(f.value ?? '').toLowerCase())
    case 'is':
      if (f.value === undefined || f.value === '') return true
      if (prop?.type === 'number' || prop?.type === 'progress') return Number(v) === Number(f.value)
      return String(v ?? '') === String(f.value)
    case 'not': return String(v ?? '') !== String(f.value ?? '')
    case 'gt': return prop?.type === 'date' ? String(v ?? '') > String(f.value ?? '') : Number(v) > Number(f.value)
    case 'lt': return prop?.type === 'date' ? !!v && String(v) < String(f.value ?? '') : Number(v) < Number(f.value)
    default: return true
  }
}

export function filterOps(type: PropType | 'title'): { op: DbFilter['op']; label: string }[] {
  switch (type) {
    case 'checkbox': return [{ op: 'checked', label: 'is checked' }, { op: 'unchecked', label: 'is not checked' }]
    case 'number': case 'progress': return [{ op: 'is', label: '=' }, { op: 'gt', label: '>' }, { op: 'lt', label: '<' }, { op: 'empty', label: 'is empty' }, { op: 'notEmpty', label: 'is not empty' }]
    case 'select': case 'status': return [{ op: 'is', label: 'is' }, { op: 'not', label: 'is not' }, { op: 'empty', label: 'is empty' }, { op: 'notEmpty', label: 'is not empty' }]
    case 'multi': return [{ op: 'contains', label: 'has' }, { op: 'empty', label: 'is empty' }, { op: 'notEmpty', label: 'is not empty' }]
    case 'relation': return [{ op: 'empty', label: 'is empty' }, { op: 'notEmpty', label: 'is not empty' }]
    case 'date': return [{ op: 'is', label: 'is' }, { op: 'lt', label: 'is before' }, { op: 'gt', label: 'is after' }, { op: 'empty', label: 'is empty' }, { op: 'notEmpty', label: 'is not empty' }]
    default: return [{ op: 'contains', label: 'contains' }, { op: 'is', label: 'is' }, { op: 'empty', label: 'is empty' }, { op: 'notEmpty', label: 'is not empty' }]
  }
}

/** Rows a view shows, filtered and sorted. */
export function viewRows(rows: Page[], db: DbSchema, view: DbView, q = ''): Page[] {
  const ql = q.trim().toLowerCase()
  let out = rows.filter((r) => (view.filters ?? []).every((f) => matchFilter(r, f, db.props.find((p) => p.id === f.prop))))
  if (ql) { const d = getData(); out = out.filter((r) => (r.title + ' ' + db.props.map((p) => propText(p, cellValue(d, r, p))).join(' ')).toLowerCase().includes(ql)) }
  const s = view.sort
  if (s) {
    const prop = db.props.find((p) => p.id === s.prop)
    const key = (r: Page): string | number => {
      const v = rowVal(r, s.prop)
      if (!prop) return String(v ?? '').toLowerCase()
      if (prop.type === 'number' || prop.type === 'progress') return v === undefined ? Number.NEGATIVE_INFINITY : Number(v)
      if (prop.type === 'select' || prop.type === 'status') return (prop.options ?? []).findIndex((o) => o.id === v)
      if (prop.type === 'checkbox') return v ? 1 : 0
      if (prop.type === 'relation') return (Array.isArray(v) ? v.length : 0)
      if (isComputed(prop.type)) return typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : String(v ?? '').toLowerCase()
      return String(propText(prop, v) && prop.type === 'date' ? v : propText(prop, v)).toLowerCase()
    }
    out = [...out].sort((a, b) => {
      const ka = key(a)
      const kb = key(b)
      const c = ka < kb ? -1 : ka > kb ? 1 : 0
      return s.dir === 'asc' ? c : -c
    })
  }
  return out
}

export function newView(type: ViewType, db: DbSchema): DbView {
  const groupable = db.props.find((p) => p.type === 'status') ?? db.props.find((p) => p.type === 'select')
  const date = db.props.find((p) => p.type === 'date')
  return {
    id: uid(),
    name: VIEW_TYPES.find((v) => v.type === type)?.name ?? 'View',
    type,
    filters: [],
    hidden: [],
    groupBy: type === 'board' ? groupable?.id ?? null : null,
    dateProp: type === 'calendar' || type === 'timeline' ? date?.id ?? null : null,
    ...(type === 'chart' ? { chart: { kind: 'bar' as const, by: groupable?.id ?? null, value: null, fn: 'count' as const } } : {}),
    cardProps: db.props.slice(0, 3).map((p) => p.id)
  }
}

/** Count of rows in a database matching an optional single filter (for dashboard widgets). */
export function countRows(dbId: string, filter?: DbFilter | null): number {
  const d = getData()
  const db = d.pages[dbId]?.db
  if (!db) return 0
  return rowsOf(d, dbId).filter((r) => !filter || matchFilter(r, filter, db.props.find((p) => p.id === filter.prop))).length
}

export const todayKey = today

// ---------- dated rows in the agenda and task panels ----------
export interface DatedRow { id: string; dbId: string; db: string; title: string; due: string; done: boolean; doable: boolean }

/** Rows of databases with a date property, so a Notion calendar shows up with your tasks. */
export function datedRows(pages: Record<string, Page>): DatedRow[] {
  const out: DatedRow[] = []
  const dbs = Object.values(pages).filter((p) => p.type === 'database' && !p.deletedAt && p.db?.props.some((x) => x.type === 'date'))
  if (!dbs.length) return out
  const byDb = new Map(dbs.map((p) => [p.id, p]))
  for (const row of Object.values(pages)) {
    const db = row.rowOf ? byDb.get(row.rowOf) : undefined
    if (!db || row.deletedAt) continue
    const s = db.db!
    const date = s.props.find((x) => x.type === 'date')!
    const due = row.props?.[date.id]
    if (typeof due !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(due)) continue
    const check = s.props.find((x) => x.type === 'checkbox')
    const status = s.props.find((x) => x.type === 'status')
    const doneOpt = status?.options?.find((o) => /done|complete|finished/i.test(o.name))
    const done = check ? Boolean(row.props?.[check.id]) : status && doneOpt ? row.props?.[status.id] === doneOpt.id : false
    out.push({ id: row.id, dbId: db.id, db: db.title || 'Database', title: row.title || 'Untitled', due: due.slice(0, 10), done, doable: Boolean(check || (status && doneOpt)) })
  }
  return out
}

/** Ticks a dated row off through its checkbox, or its status. */
export function setRowDone(r: DatedRow, done: boolean): void {
  const s = getData().pages[r.dbId]?.db
  if (!s) return
  const check = s.props.find((x) => x.type === 'checkbox')
  if (check) { setRowProp(r.id, check.id, done || undefined); return }
  const status = s.props.find((x) => x.type === 'status')
  const doneOpt = status?.options?.find((o) => /done|complete|finished/i.test(o.name))
  const first = status?.options?.find((o) => o.id !== doneOpt?.id)
  if (status && doneOpt) setRowProp(r.id, status.id, done ? doneOpt.id : first?.id)
}
