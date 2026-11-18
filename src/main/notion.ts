// Notion import.
// 1) From the Notion desktop app's local cache (notion.db, SQLite) — no export needed.
// 2) From a Notion export (.zip or folder of Markdown & CSV).
// Both produce an ImportResult page tree that the renderer adds to the store.
import fs from 'fs'
import os from 'os'
import path from 'path'
import { unzipSync, strFromU8 } from 'fflate'
import type { Block, BlockType } from '../renderer/src/types'
import type { ImportPage, ImportResult, ImportTask, NotionPageInfo } from '../shared/import-types'
import { bid, markdownToBlocks, parseCsv, stripInline, tidy } from '../shared/markdown'

type Row = Record<string, any>

export function notionDbPath(): string | null {
  const candidates = [
    path.join(process.env.APPDATA ?? '', 'Notion', 'notion.db'),
    path.join(os.homedir(), 'Library', 'Application Support', 'Notion', 'notion.db'),
    path.join(os.homedir(), '.config', 'Notion', 'notion.db')
  ]
  return candidates.find((p) => p && fs.existsSync(p)) ?? null
}

/** Copies the cache (with its WAL) so a running Notion app is never touched. */
function openCopy(): { db: any; cleanup: () => void } {
  const src = notionDbPath()
  if (!src) throw new Error('The Notion app was not found on this computer.')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-notion-'))
  const dest = path.join(dir, 'notion.db')
  fs.copyFileSync(src, dest)
  for (const ext of ['-wal', '-shm']) if (fs.existsSync(src + ext)) fs.copyFileSync(src + ext, dest + ext)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { DatabaseSync } = require('node:sqlite')
  const db = new DatabaseSync(dest)
  return { db, cleanup: () => { try { db.close() } catch { /* ignore */ } try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ } } }
}

const json = (s: string | null | undefined, fallback: any): any => {
  if (!s) return fallback
  try { return JSON.parse(s) } catch { return fallback }
}

const isEmoji = (s: unknown): s is string => typeof s === 'string' && s.length > 0 && s.length <= 8 && !/^https?:|^\//.test(s)

class NotionReader {
  db: any
  blockStmt: any
  titleCache = new Map<string, string>()
  stats = { pages: 0, blocks: 0, todos: 0, tasks: 0, tables: 0, skipped: 0, missing: 0 }
  warnings: string[] = []
  seen = new Set<string>()

  constructor(db: any) {
    this.db = db
    this.blockStmt = db.prepare('select * from block where id = ?')
  }

  block(id: string): Row | undefined { return this.blockStmt.get(id) }

  /** Flattens Notion rich text, resolving page, date and user mentions. */
  rich(prop: any): string {
    if (!Array.isArray(prop)) return ''
    return prop.map((seg: any[]) => {
      const text: string = seg[0] ?? ''
      const marks: any[] = seg[1] ?? []
      for (const m of marks) {
        if (m[0] === 'd' && m[1]) return this.dateText(m[1])
        if (m[0] === 'p' && m[1]) return this.pageTitle(m[1])
        if (m[0] === 'u') return '@someone'
        if (m[0] === 'e') return m[1] ?? text
      }
      return text === '‣' ? '' : text
    }).join('')
  }

  dateText(d: any): string {
    const s = d.start_date ?? ''
    const t = d.start_time ? ` ${d.start_time}` : ''
    return d.end_date ? `${s}${t} → ${d.end_date}` : `${s}${t}`
  }

  pageTitle(id: string): string {
    if (this.titleCache.has(id)) return this.titleCache.get(id)!
    const r = this.block(id)
    const t = r ? this.rich(json(r.properties, {}).title) || 'Untitled' : 'Untitled'
    this.titleCache.set(id, t)
    return t
  }

  listPages(): NotionPageInfo[] {
    const rows: Row[] = this.db.prepare("select id, type, properties, format, parent_id, parent_table from block where alive = 1 and type in ('page', 'collection_view_page')").all()
    const out: NotionPageInfo[] = []
    for (const r of rows) {
      if (r.parent_table === 'collection') continue // database rows
      const title = this.rich(json(r.properties, {}).title)
      if (!title.trim()) continue
      const icon = json(r.format, {}).page_icon
      let parent = ''
      if (r.parent_table === 'block' && r.parent_id) {
        const p = this.block(r.parent_id)
        if (p && (p.type === 'page' || p.type === 'collection_view_page')) parent = this.pageTitle(p.id)
      }
      out.push({ id: r.id, title, icon: isEmoji(icon) ? icon : '', parent, kind: r.type === 'page' ? 'page' : 'database' })
    }
    return out.sort((a, b) => a.title.localeCompare(b.title))
  }

  importPage(id: string): ImportPage | null {
    const r = this.block(id)
    if (!r) { this.stats.missing++; return null }
    if (this.seen.has(id)) return null
    this.seen.add(id)
    const props = json(r.properties, {})
    const fmt = json(r.format, {})
    const page: ImportPage = {
      title: this.rich(props.title) || 'Untitled',
      icon: isEmoji(fmt.page_icon) ? fmt.page_icon : '',
      type: 'doc',
      blocks: [],
      children: []
    }
    this.stats.pages++
    if (r.type === 'collection_view_page' && r.collection_id) {
      const db = this.collection(r.collection_id, page.title)
      return db ?? page
    }
    for (const c of json(r.content, [])) this.convert(c, 0, page)
    page.blocks = tidy(page.blocks)
    return page
  }

  push(page: ImportPage, type: BlockType, text: string, indent: number, extra: Partial<Block> = {}): Block {
    const b: Block = { id: bid(), type, text, ...(indent ? { indent: Math.min(4, indent) } : {}), ...extra }
    page.blocks.push(b)
    this.stats.blocks++
    return b
  }

  children(r: Row): string[] { return json(r.content, []) }

  convert(id: string, indent: number, page: ImportPage): void {
    const r = this.block(id)
    if (!r) { this.stats.missing++; return }
    if (!r.alive) return
    const props = json(r.properties, {})
    const fmt = json(r.format, {})
    const title = this.rich(props.title)
    const kids = this.children(r)
    const sub = (ind = indent + 1): void => { for (const c of kids) this.convert(c, ind, page) }
    switch (r.type) {
      case 'text': this.push(page, 'p', title, indent); sub(); return
      case 'header': this.push(page, 'h1', title, indent); sub(fmt.toggleable ? indent + 1 : indent); return
      case 'sub_header': this.push(page, 'h2', title, indent); sub(fmt.toggleable ? indent + 1 : indent); return
      case 'sub_sub_header': this.push(page, 'h3', title, indent); sub(fmt.toggleable ? indent + 1 : indent); return
      case 'to_do':
        this.push(page, 'todo', title, indent, { checked: props.checked?.[0]?.[0] === 'Yes' })
        this.stats.todos++
        sub(); return
      case 'bulleted_list': this.push(page, 'bullet', title, indent); sub(); return
      case 'numbered_list': this.push(page, 'number', title, indent); sub(); return
      case 'quote': this.push(page, 'quote', title, indent); sub(); return
      case 'divider': this.push(page, 'divider', '', 0); return
      case 'code':
      case 'equation': this.push(page, 'code', title, indent); return
      case 'toggle':
        this.push(page, 'toggle', title, indent, { open: false })
        sub(); return
      case 'callout': {
        let text = title
        let rest = kids
        if (!text && kids.length) {
          const first = this.block(kids[0])
          if (first && first.type === 'text') { text = this.rich(json(first.properties, {}).title); rest = kids.slice(1) }
        }
        if (text) this.push(page, 'callout', text, indent)
        for (const c of rest) this.convert(c, text ? indent + 1 : indent, page)
        return
      }
      case 'tab':
        // Tab labels are child text blocks; their children are the tab's content.
        for (const c of kids) {
          const label = this.block(c)
          if (!label) { this.stats.missing++; continue }
          const name = this.rich(json(label.properties, {}).title)
          if (name) this.push(page, 'h2', name, indent)
          for (const cc of this.children(label)) this.convert(cc, indent, page)
        }
        return
      case 'column_list':
      case 'column':
      case 'transclusion_container':
        sub(indent); return
      case 'transclusion_reference': {
        const ref = fmt.transclusion_reference_pointer?.id
        const target = ref ? this.block(ref) : undefined
        if (target) for (const c of this.children(target)) this.convert(c, indent, page)
        return
      }
      case 'table': {
        const order: string[] = fmt.table_block_column_order ?? []
        const rows: string[][] = []
        for (const rid of kids) {
          const tr = this.block(rid)
          if (!tr) { this.stats.missing++; continue }
          const p = json(tr.properties, {})
          rows.push(order.map((col) => this.rich(p[col])))
        }
        if (rows.length) { this.push(page, 'table', '', 0, { rows }); this.stats.tables++ }
        return
      }
      case 'page': {
        const child = this.importPage(id)
        if (child) page.children.push(child)
        return
      }
      case 'collection_view':
      case 'collection_view_page': {
        if (!r.collection_id) { this.stats.skipped++; return }
        const child = this.collection(r.collection_id)
        if (child) page.children.push(child)
        return
      }
      case 'alias': {
        const to = fmt.alias_pointer?.id
        if (to) this.push(page, 'p', '→ ' + this.pageTitle(to), indent)
        return
      }
      case 'bookmark':
      case 'embed':
      case 'image':
      case 'video':
      case 'file':
      case 'pdf': {
        const src = props.source?.[0]?.[0] ?? fmt.display_source ?? ''
        const cap = this.rich(props.caption) || this.rich(props.title)
        if (src || cap) this.push(page, 'p', [cap, src].filter(Boolean).join(' — '), indent)
        return
      }
      case 'button':
      case 'breadcrumb':
      case 'table_of_contents':
        this.stats.skipped++
        return
      default:
        if (title) this.push(page, 'p', title, indent)
        else this.stats.skipped++
        sub()
    }
  }

  /** An inline or full-page database becomes a to-do list (if it has dates/checkboxes/status) or a table. */
  collection(collectionId: string, fallbackTitle = ''): ImportPage | null {
    const col: Row | undefined = this.db.prepare('select * from collection where id = ?').get(collectionId)
    if (!col) { this.stats.missing++; return null }
    const name = this.rich(json(col.name, [])) || fallbackTitle || 'Database'
    const schema: Record<string, { name: string; type: string; options?: any[] }> = json(col.schema, {})
    const icon = json(col.icon, null)
    const rows: Row[] = this.db.prepare('select * from block where parent_id = ? and parent_table = ? and alive = 1').all(collectionId, 'collection')
    const keys = Object.keys(schema)
    const dateKey = keys.find((k) => schema[k].type === 'date')
    const checkKey = keys.find((k) => schema[k].type === 'checkbox')
    const statusKey = keys.find((k) => schema[k].type === 'status' || (schema[k].type === 'select' && /status|state|progress/i.test(schema[k].name)))
    const tagKeys = keys.filter((k) => (schema[k].type === 'multi_select' || schema[k].type === 'select') && k !== statusKey)
    const page: ImportPage = { title: name, icon: isEmoji(icon) ? icon : '', type: 'doc', blocks: [], children: [] }
    this.stats.pages++
    const read = (p: any, k: string): string => {
      const v = p[k]
      if (!v) return ''
      if (schema[k]?.type === 'date') {
        const d = v?.[0]?.[1]?.find?.((m: any[]) => m[0] === 'd')?.[1]
        return d?.start_date ?? ''
      }
      return this.rich(v)
    }
    if (dateKey || checkKey || statusKey) {
      page.type = 'tasks'
      page.tasks = rows.map((row): ImportTask => {
        const p = json(row.properties, {})
        const status = statusKey ? read(p, statusKey) : ''
        const done = (checkKey ? p[checkKey]?.[0]?.[0] === 'Yes' : false) || /done|complete|finished/i.test(status)
        const tags = tagKeys.flatMap((k) => read(p, k).split(',').map((t) => t.trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean))
        const extra = keys.filter((k) => k !== 'title' && ![dateKey, checkKey, statusKey, ...tagKeys].includes(k)).map((k) => {
          const v = read(p, k)
          return v ? `${schema[k].name}: ${v}` : ''
        }).filter(Boolean)
        return { title: this.rich(p.title) || 'Untitled', done, due: dateKey ? read(p, dateKey).slice(0, 10) || null : null, tags, notes: extra.join('\n') }
      })
      this.stats.tasks += page.tasks.length
    } else {
      const cols = ['title', ...keys.filter((k) => k !== 'title')]
      const tableRows = [cols.map((k) => schema[k]?.name ?? k), ...rows.map((row) => { const p = json(row.properties, {}); return cols.map((k) => read(p, k)) })]
      page.blocks.push({ id: bid(), type: 'table', text: '', rows: tableRows })
      this.stats.tables++
    }
    if (!rows.length) this.warnings.push(`“${name}”: no rows are stored on this computer yet. Open it once in the Notion app, then import again to bring its rows.`)
    if (!page.blocks.length) page.blocks = [{ id: bid(), type: 'p', text: '' }]
    return page
  }
}

export function listNotionPages(): NotionPageInfo[] {
  const { db, cleanup } = openCopy()
  try { return new NotionReader(db).listPages() } finally { cleanup() }
}

export function importNotionPages(ids: string[]): ImportResult {
  const { db, cleanup } = openCopy()
  try {
    const reader = new NotionReader(db)
    const pages = ids.map((id) => reader.importPage(id)).filter((p): p is ImportPage => !!p)
    if (reader.stats.missing) reader.warnings.push(`${reader.stats.missing} block(s) weren't stored on this computer by Notion and were skipped. Opening those pages in the Notion app first makes them available.`)
    return { pages, stats: reader.stats, warnings: reader.warnings }
  } finally {
    cleanup()
  }
}

// ---------- Notion export (Markdown & CSV) ----------
const ID_SUFFIX = /\s+[0-9a-f]{32}$/i
const cleanName = (n: string): string => n.replace(/\.(md|csv)$/i, '').replace(ID_SUFFIX, '').replace(/_all$/, '').trim()

export function importNotionExport(filePath: string): ImportResult {
  const files = new Map<string, Uint8Array>()
  const addZip = (data: Uint8Array, prefix = ''): void => {
    const entries = unzipSync(data)
    for (const [name, bytes] of Object.entries(entries)) {
      if (name.endsWith('/')) continue
      if (/\.zip$/i.test(name)) addZip(bytes, prefix)
      else files.set(prefix + name, bytes)
    }
  }
  const stat = fs.statSync(filePath)
  if (stat.isDirectory()) {
    const walk = (dir: string, rel: string): void => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name)
        if (e.isDirectory()) walk(full, rel + e.name + '/')
        else files.set(rel + e.name, fs.readFileSync(full))
      }
    }
    walk(filePath, '')
  } else if (/\.zip$/i.test(filePath)) addZip(fs.readFileSync(filePath))
  else files.set(path.basename(filePath), fs.readFileSync(filePath))

  const stats = { pages: 0, blocks: 0, todos: 0, tasks: 0, tables: 0, skipped: 0, missing: 0 }
  const docs = [...files.keys()].filter((k) => /\.(md|csv)$/i.test(k) && !/_all\.csv$/i.test(k) || /_all\.csv$/i.test(k) && !files.has(k.replace(/_all\.csv$/i, '.csv')))
  const byPath = new Map<string, ImportPage>()
  const roots: ImportPage[] = []

  for (const key of docs.sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))) {
    const text = strFromU8(files.get(key)!)
    const base = key.split('/').pop()!
    let page: ImportPage
    if (/\.csv$/i.test(base)) {
      const rows = parseCsv(text)
      const header = rows[0] ?? []
      const lower = header.map((h) => h.toLowerCase())
      const dateIdx = lower.findIndex((h) => /date|due|when|deadline/.test(h))
      const doneIdx = lower.findIndex((h) => /^(done|complete|completed|checkbox|status)$/.test(h))
      const tagIdx = lower.findIndex((h) => /tags?|category|type/.test(h))
      if (dateIdx >= 0 || doneIdx >= 0) {
        const tasks: ImportTask[] = rows.slice(1).map((r) => ({
          title: r[0] || 'Untitled',
          done: doneIdx >= 0 ? /^(yes|true|done|complete|completed)$/i.test((r[doneIdx] ?? '').trim()) : false,
          due: dateIdx >= 0 ? toIsoDate(r[dateIdx]) : null,
          tags: tagIdx >= 0 ? (r[tagIdx] ?? '').split(',').map((t) => t.trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean) : [],
          notes: header.map((h, i) => (i && i !== dateIdx && i !== doneIdx && i !== tagIdx && r[i] ? `${h}: ${r[i]}` : '')).filter(Boolean).join('\n')
        }))
        page = { title: cleanName(base), icon: '', type: 'tasks', blocks: [{ id: bid(), type: 'p', text: '' }], tasks, children: [] }
        stats.tasks += tasks.length
      } else {
        page = { title: cleanName(base), icon: '', type: 'doc', blocks: [{ id: bid(), type: 'table', text: '', rows }], children: [] }
        stats.tables++
      }
    } else {
      const lines = text.replace(/\r\n?/g, '\n').split('\n')
      let title = cleanName(base)
      if (/^#\s+/.test(lines[0] ?? '')) title = stripInline(lines.shift()!.replace(/^#\s+/, ''))
      // Notion writes page properties as "Key: value" lines right under the title.
      const blocks = markdownToBlocks(lines.join('\n'))
      const icon = title.match(/^(\p{Extended_Pictographic}️?)\s+/u)?.[1] ?? ''
      if (icon) title = title.slice(icon.length).trim()
      page = { title, icon, type: 'doc', blocks, children: [] }
      stats.blocks += blocks.length
      stats.todos += blocks.filter((b) => b.type === 'todo').length
      stats.tables += blocks.filter((b) => b.type === 'table').length
    }
    stats.pages++
    const dir = key.replace(/\.(md|csv)$/i, '').replace(/_all$/, '')
    byPath.set(dir, page)
    const parentDir = key.split('/').slice(0, -1).join('/')
    const parent = byPath.get(parentDir)
    if (parent) parent.children.push(page)
    else roots.push(page)
  }
  return { pages: roots, stats, warnings: roots.length ? [] : ['No Markdown or CSV pages were found in that file.'] }
}

function toIsoDate(s: string | undefined): string | null {
  if (!s) return null
  const iso = s.match(/\d{4}-\d{2}-\d{2}/)
  if (iso) return iso[0]
  const d = new Date(s.split('→')[0].trim())
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
