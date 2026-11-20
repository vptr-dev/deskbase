import type { ImportPage, ImportResult, ImportRow } from '../../../shared/import-types'
import { emojiToIcon } from '../../../shared/emoji-icons'
import type { AppData, Block, DbSchema, Page } from '../types'
import { act, getData, openPage, toast } from '../store'
import { api } from './api'
import { newPage, typeInfo } from './defaults'
import { uid } from './util'

const iconFor = (ip: ImportPage): string => (ip.icon ? emojiToIcon(ip.icon, typeInfo(ip.type).icon) : ip.type === 'doc' ? 'file-text' : typeInfo(ip.type).icon)

/** A copy of imported blocks with ids of their own, columns and tabs included. */
function renew(blocks: Block[]): Block[] {
  return blocks.map((b) => ({ ...b, id: uid(), ...(b.cols ? { cols: b.cols.map(renew) } : {}) }))
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

function addTasks(d: AppData, pageId: string, ip: ImportPage): void {
  ;(ip.tasks ?? []).forEach((t, i) => {
    const id = uid()
    d.tasks[id] = {
      id, pageId, title: t.title, notes: t.notes ?? '', status: t.done ? 'done' : 'todo', done: t.done,
      doneAt: t.done ? Date.now() : null, createdAt: Date.now(), due: t.due ?? null, time: null, priority: 0,
      difficulty: 'easy', stat: null, tags: t.tags, subtasks: [], repeat: 'none', order: i
    }
    for (const tag of t.tags) if (!d.tags[tag]) d.tags[tag] = '#8e8e93'
  })
}

function addRow(d: AppData, dbId: string, r: ImportRow, order: number): void {
  const now = Date.now()
  const id = uid()
  d.pages[id] = {
    id, title: r.title, icon: r.icon ? emojiToIcon(r.icon, 'file-text') : '', type: 'doc', parentId: null, children: [],
    createdAt: now, updatedAt: now, deletedAt: null, blocks: r.blocks.length ? renew(r.blocks) : [{ id: uid(), type: 'p', text: '' }],
    expanded: false, view: {}, rowOf: dbId, props: { ...r.props }, rowOrder: order,
    ...(r.cover ? { cover: r.cover } : {}), ...(r.fullWidth ? { fullWidth: true } : {}),
    ...(r.notionId ? { source: { kind: 'notion' as const, id: r.notionId, syncedAt: now, ...(r.via ? { via: r.via } : {}) } } : {})
  }
}

function addPage(d: AppData, ip: ImportPage, parent: string | null, at?: number): string {
  const p: Page = newPage(ip.type, ip.title, parent)
  p.icon = iconFor(ip)
  p.blocks = ip.blocks.length ? renew(ip.blocks) : p.blocks
  p.expanded = false
  if (ip.cover) p.cover = ip.cover
  if (ip.fullWidth) p.fullWidth = true
  if (ip.notionId) p.source = { kind: 'notion', id: ip.notionId, syncedAt: Date.now(), ...(ip.via ? { via: ip.via } : {}) }
  if (ip.type === 'database' && ip.db) p.db = clone(ip.db)
  d.pages[p.id] = p
  const list = parent ? d.pages[parent].children : d.rootOrder
  if (at !== undefined && at >= 0 && at <= list.length) list.splice(at, 0, p.id)
  else list.push(p.id)
  addTasks(d, p.id, ip)
  ;(ip.rows ?? []).forEach((r, i) => addRow(d, p.id, r, i))
  for (const c of ip.children) addPage(d, c, p.id)
  return p.id
}

/** Moves a page and everything under it to the trash (it can be restored from there). */
function trash(d: AppData, id: string): void {
  const now = Date.now()
  const walk = (pid: string): void => {
    const p = d.pages[pid]
    if (!p || p.deletedAt) return
    p.deletedAt = now
    p.children.forEach(walk)
    if (p.type === 'database') for (const r of Object.values(d.pages)) if (r.rowOf === pid && !r.deletedAt) r.deletedAt = now
  }
  walk(id)
}

/**
 * Notion links and inline databases point at Notion ids until the pages they name are here; then
 * they point at those pages. A link to a page that wasn't imported reads as a [[page link]].
 */
function resolveNotionRefs(d: AppData): void {
  const bySource = new Map<string, string>()
  for (const p of Object.values(d.pages)) if (p.source?.id && !p.deletedAt) bySource.set(p.source.id, p.id)
  const fix = (list: Block[]): void => {
    for (const b of list) {
      if (b.ref?.startsWith('notion:')) {
        const id = bySource.get(b.ref.slice(7))
        if (id) {
          b.ref = id
          if (b.type === 'database' && d.pages[id].type !== 'database') b.type = 'link'
        } else {
          b.type = 'p'
          b.text = b.text ? `[[${b.text}]]` : ''
          delete b.ref
        }
      }
      b.cols?.forEach(fix)
    }
  }
  // Relations: the linked database and the linked rows.
  for (const p of Object.values(d.pages)) {
    if (p.deletedAt) continue
    for (const pr of p.db?.props ?? []) if (pr.type === 'relation' && pr.relation?.startsWith('notion:')) pr.relation = bySource.get(pr.relation.slice(7)) ?? null
    if (p.rowOf && p.props) {
      const rels = d.pages[p.rowOf]?.db?.props.filter((x) => x.type === 'relation') ?? []
      for (const r of rels) {
        const v = p.props[r.id]
        if (!Array.isArray(v) || !v.some((x) => typeof x === 'string' && x.startsWith('notion:'))) continue
        const ids = v.map((x: string) => (x.startsWith('notion:') ? bySource.get(x.slice(7)) : x)).filter((x): x is string => !!x)
        if (ids.length) p.props[r.id] = ids
        else delete p.props[r.id]
      }
    }
  }
  for (const p of Object.values(d.pages)) if (!p.deletedAt && p.blocks.some(function has(b: Block): boolean { return Boolean(b.ref?.startsWith('notion:')) || Boolean(b.cols?.some((c) => c.some(has))) })) fix(p.blocks)
}

/**
 * Adds an imported page tree to the store. A Notion page that is already here is updated in place
 * (same page, so panels, links and tabs keep pointing at it). Returns the id of the first top-level page.
 */
export function applyImport(result: ImportResult, parentId: string | null = null): string | null {
  let first: string | null = null
  act((d) => {
    for (const ip of result.pages) {
      const here = ip.notionId ? Object.values(d.pages).find((p) => !p.deletedAt && p.source?.id === ip.notionId) : undefined
      let id: string
      if (here) { updateTree(d, here.id, ip); id = here.id }
      else id = addPage(d, ip, parentId)
      if (!first) first = id
    }
    resolveNotionRefs(d)
  })
  if (first) openPage(first)
  return first
}

const norm = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase()

function walkBlocks(list: Block[], fn: (b: Block) => void): void {
  for (const b of list) { fn(b); b.cols?.forEach((c) => walkBlocks(c, fn)) }
}

/** New blocks from Notion, keeping to-dos you checked off here checked and toggles as you left them. */
function mergeBlocks(old: Block[], next: Block[]): Block[] {
  const checked = new Set<string>()
  const open = new Map<string, boolean | undefined>()
  walkBlocks(old, (b) => {
    if (b.type === 'todo' && b.checked) checked.add(norm(b.text))
    if (b.type === 'toggle' || b.type.startsWith('toggle-')) open.set(b.type + norm(b.text), b.open)
  })
  const out = renew(next)
  walkBlocks(out, (b) => {
    // To-dos from the Notion API send their checks to Notion, so Notion has the latest.
    if (b.type === 'todo' && !b.nid && !b.checked && checked.has(norm(b.text))) b.checked = true
    const k = b.type + norm(b.text)
    if ((b.type === 'toggle' || b.type.startsWith('toggle-')) && open.has(k)) b.open = open.get(k)
  })
  return out
}

/** Notion's properties and rows over what is here; your own properties, views and rows stay. */
function mergeDb(d: AppData, p: Page, ip: ImportPage): void {
  const db: DbSchema = p.db ?? { props: [], views: [] }
  for (const np of ip.db!.props) {
    const lp = db.props.find((x) => x.id === np.id)
    if (!lp) { db.props.push(clone(np)); continue }
    lp.name = np.name
    lp.type = np.type
    if (np.format) lp.format = np.format
    if (np.options) {
      lp.options = lp.options ?? []
      for (const o of np.options) {
        const lo = lp.options.find((x) => x.id === o.id)
        if (lo) lo.name = o.name
        else lp.options.push({ ...o })
      }
    }
  }
  if (!ip.via || !db.views.length) for (const v of ip.db!.views) if (!db.views.some((x) => x.id === v.id)) db.views.push(clone(v))
  p.db = db
  const rows = new Map(Object.values(d.pages).filter((r) => r.rowOf === p.id && !r.deletedAt && r.source?.id).map((r) => [r.source!.id, r]))
  const orders = Object.values(d.pages).filter((r) => r.rowOf === p.id).map((r) => r.rowOrder ?? 0)
  let next = orders.length ? Math.max(...orders) + 1 : 0
  ;(ip.rows ?? []).forEach((r) => {
    const row = r.notionId ? rows.get(r.notionId) : undefined
    if (!row) { addRow(d, p.id, r, next++); return }
    row.title = r.title || row.title
    if (r.icon) row.icon = emojiToIcon(r.icon, 'file-text')
    row.props = { ...(row.props ?? {}), ...r.props }
    for (const k of Object.keys(row.props)) if (k.startsWith('n_') && !(k in r.props) && ip.db!.props.some((x) => x.id === k)) delete row.props[k]
    if (!r.keepBlocks) row.blocks = mergeBlocks(row.blocks, r.blocks.length ? r.blocks : [{ id: uid(), type: 'p', text: '' }])
    if (r.cover) row.cover = r.cover
    row.source = { kind: 'notion', id: r.notionId!, syncedAt: Date.now(), ...((r.via ?? row.source?.via) ? { via: r.via ?? row.source?.via } : {}) }
    row.updatedAt = Date.now()
  })
}

function updateTree(d: AppData, pageId: string, ip: ImportPage): number {
  const p = d.pages[pageId]
  if (!p) return 0
  let n = 1
  p.title = ip.title || p.title
  if (ip.icon) p.icon = iconFor(ip)
  if (ip.cover && (!p.cover || /^https?:/.test(p.cover))) p.cover = ip.cover
  if (ip.fullWidth) p.fullWidth = true
  if (p.type === 'doc' && ip.type === 'doc') p.blocks = mergeBlocks(p.blocks, ip.blocks.length ? ip.blocks : [{ id: uid(), type: 'p', text: '' }])
  if (p.type === 'database' && ip.type === 'database' && ip.db) mergeDb(d, p, ip)
  if (ip.tasks && p.type === 'tasks') {
    const have = new Set(Object.values(d.tasks).filter((t) => t.pageId === pageId).map((t) => norm(t.title)))
    addTasks(d, pageId, { ...ip, tasks: ip.tasks.filter((t) => !have.has(norm(t.title))) })
  }
  const via = ip.via ?? p.source?.via
  p.source = { kind: 'notion', id: ip.notionId ?? p.source?.id ?? '', syncedAt: Date.now(), ...(via ? { via } : {}) }
  p.updatedAt = Date.now()
  const live = (): string[] => p.children.filter((c) => d.pages[c] && !d.pages[c].deletedAt)
  const byNotion = new Map(live().filter((c) => d.pages[c].source?.id).map((c) => [d.pages[c].source!.id, c]))
  for (const child of ip.children) {
    let existing = child.notionId ? byNotion.get(child.notionId) : undefined
    let at: number | undefined
    if (!existing) {
      // Pages imported before Notion ids were kept (or imported twice): match them by name and
      // keep one; the extra copies go to the trash. A database that used to come in as a task
      // list or a table is replaced by the real database.
      const same = live().filter((c) => !d.pages[c].source?.id && norm(d.pages[c].title) === norm(child.title))
      const keep = same.find((c) => d.pages[c].type === child.type)
      if (keep) existing = keep
      if (same.length) at = p.children.indexOf(same[0])
      for (const c of same) if (c !== keep) trash(d, c)
    }
    if (existing) n += updateTree(d, existing, child)
    else { addPage(d, child, pageId, at); n++ }
  }
  return n
}

/** Re-reads pages imported from the Notion app. Returns how many pages were updated. */
export async function refreshFromNotion(pageIds?: string[], quiet = false): Promise<number> {
  const d0 = getData()
  // Only top-most synced pages; their subpages update with them.
  const synced = Object.values(d0.pages).filter((p) => p.source?.kind === 'notion' && !p.deletedAt && !p.rowOf && (!p.parentId || !d0.pages[p.parentId]?.source))
  const targets = pageIds ? pageIds.map((id) => d0.pages[id]).filter((p): p is Page => Boolean(p?.source)) : synced
  if (!targets.length) return 0
  const live = new Set(d0.connections.filter((c) => c.kind === 'notion' && !c.off).map((c) => c.id))
  const groups = new Map<string, Page[]>()
  for (const p of targets) {
    const via = p.source!.via
    if (via && !live.has(via)) continue
    const k = via ?? ''
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(p)
  }
  let n = 0
  for (const [via, list] of groups) {
    let res: ImportResult
    try {
      if (via) res = await api.conn.notionImport(via, list.map((p) => p.source!.id))
      else {
        if (!(await api.notion.available())) { if (!quiet) toast('The Notion app was not found on this computer', { kind: 'error' }); continue }
        res = await api.notion.importPages(list.map((p) => p.source!.id))
      }
    } catch (e: any) {
      if (!quiet) toast(e?.message ?? 'Could not reach Notion', { kind: 'error' })
      continue
    }
    act((d) => {
      for (const ip of res.pages) {
        const target = list.find((p) => p.source!.id === ip.notionId)
        if (target) n += updateTree(d, target.id, ip)
      }
      resolveNotionRefs(d)
    }, { history: false })
  }
  if (!quiet) toast(n ? `Updated ${n} page${n === 1 ? '' : 's'} from Notion` : 'Nothing to update from Notion')
  return n
}

/** Adds pages shared with a Notion connection, or updates them when they are already here. */
export async function syncFromNotionApi(connId: string, ids: string[]): Promise<ImportResult> {
  const res = await api.conn.notionImport(connId, ids)
  if (res.pages.length) applyImport(res)
  return res
}

export function describeImport(r: ImportResult): string {
  const s = r.stats
  const parts = [`${s.pages} page${s.pages === 1 ? '' : 's'}`, `${s.blocks} blocks`]
  if (s.todos) parts.push(`${s.todos} to-dos`)
  if (s.databases) parts.push(`${s.databases} database${s.databases === 1 ? '' : 's'} with ${s.rows} rows`)
  if (s.tasks) parts.push(`${s.tasks} tasks`)
  if (s.tables) parts.push(`${s.tables} tables`)
  return parts.join(', ')
}
