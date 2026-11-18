import { act, emit, getData, toast, unemit } from '../store'
import type { AppData, DbFilter, DbProp, DbSchema, DbView, Page, PropType, ViewType } from '../types'
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
  { type: 'progress', name: 'Progress', icon: 'gauge' }
]
export const propTypeInfo = (t: PropType): (typeof PROP_TYPES)[number] => PROP_TYPES.find((p) => p.type === t) ?? PROP_TYPES[0]

export const VIEW_TYPES: { type: ViewType; name: string; icon: string }[] = [
  { type: 'table', name: 'Table', icon: 'table' },
  { type: 'board', name: 'Board', icon: 'board' },
  { type: 'gallery', name: 'Gallery', icon: 'gallery' },
  { type: 'list', name: 'List', icon: 'list' },
  { type: 'calendar', name: 'Calendar', icon: 'calendar' }
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
  return Object.values(d.pages).filter((p) => p.rowOf === dbId && !p.deletedAt).sort((a, b) => (a.rowOrder ?? a.createdAt) - (b.rowOrder ?? b.createdAt))
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
    db.props.push(p)
  })
  return id
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

const rowVal = (row: Page, propId: string): any => (propId === TITLE ? row.title : row.props?.[propId])
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
    case 'date': return [{ op: 'is', label: 'is' }, { op: 'lt', label: 'is before' }, { op: 'gt', label: 'is after' }, { op: 'empty', label: 'is empty' }, { op: 'notEmpty', label: 'is not empty' }]
    default: return [{ op: 'contains', label: 'contains' }, { op: 'is', label: 'is' }, { op: 'empty', label: 'is empty' }, { op: 'notEmpty', label: 'is not empty' }]
  }
}

/** Rows a view shows, filtered and sorted. */
export function viewRows(rows: Page[], db: DbSchema, view: DbView, q = ''): Page[] {
  const ql = q.trim().toLowerCase()
  let out = rows.filter((r) => (view.filters ?? []).every((f) => matchFilter(r, f, db.props.find((p) => p.id === f.prop))))
  if (ql) out = out.filter((r) => (r.title + ' ' + db.props.map((p) => propText(p, r.props?.[p.id])).join(' ')).toLowerCase().includes(ql))
  const s = view.sort
  if (s) {
    const prop = db.props.find((p) => p.id === s.prop)
    const key = (r: Page): string | number => {
      const v = rowVal(r, s.prop)
      if (!prop) return String(v ?? '').toLowerCase()
      if (prop.type === 'number' || prop.type === 'progress') return v === undefined ? Number.NEGATIVE_INFINITY : Number(v)
      if (prop.type === 'select' || prop.type === 'status') return (prop.options ?? []).findIndex((o) => o.id === v)
      if (prop.type === 'checkbox') return v ? 1 : 0
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
    dateProp: type === 'calendar' ? date?.id ?? null : null,
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
