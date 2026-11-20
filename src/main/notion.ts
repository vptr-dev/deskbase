// Notion import.
// 1) From the Notion desktop app's local cache (notion.db, SQLite) — no export needed.
// 2) From a Notion export (.zip or folder of Markdown & CSV).
// Both produce an ImportResult page tree that the renderer adds to the store.
import fs from 'fs'
import os from 'os'
import path from 'path'
import { unzipSync, strFromU8 } from 'fflate'
import type { Block, BlockType, DbFilter, DbProp, DbView, PropType, ViewType } from '../renderer/src/types'
import type { ImportPage, ImportResult, ImportRow, ImportTask, NotionPageInfo } from '../shared/import-types'
import { emojiToIcon } from '../shared/emoji-icons'
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deskbase-notion-'))
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

export const isEmoji = (s: unknown): s is string => typeof s === 'string' && s.length > 0 && s.length <= 8 && !/^https?:|^\//.test(s)

// ---------- colors ----------
const COLOR_NAMES = new Set(['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'])

/** Notion's "red" / "red_background" as a block's text color or background. */
export function colorOf(c: unknown): { color?: string; bg?: string } {
  if (typeof c !== 'string') return {}
  const name = c.replace(/_background$/, '')
  if (!COLOR_NAMES.has(name)) return {}
  return c.endsWith('_background') ? { bg: name } : { color: name }
}

export const OPTION_HEX: Record<string, string> = {
  default: '#8e8e93', gray: '#8e8e93', brown: '#a2845e', orange: '#ff9f0a', yellow: '#e5b000',
  green: '#30d158', blue: '#0a84ff', purple: '#bf5af2', pink: '#ff375f', red: '#ff453a'
}

/** A Notion id (with or without dashes) from a link to a Notion page, if it is one. */
function notionIdIn(link: string): string | null {
  const m = /^(?:\/|https?:\/\/(?:www\.)?notion\.(?:so|site)\/)(?:[^?#]*?)([0-9a-f]{32})(?:[?#]|$)/i.exec(link)
  if (!m) return null
  const h = m[1].toLowerCase()
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** Files Notion keeps for itself can't be shown outside it; anything else on the web can. */
export const publicUrl = (u: unknown): u is string =>
  typeof u === 'string' && /^https?:\/\//i.test(u) && !/prod-files-secure|secure\.notion-static\.com|file\.notion\.so|X-Amz-Signature/i.test(u)

const coverUrl = (c: unknown): string | null => {
  if (typeof c !== 'string' || !c) return null
  if (c.startsWith('/images/')) return 'https://www.notion.so' + c
  return publicUrl(c) ? c : null
}

/** Property ids safe to use as keys anywhere (Notion's look like "P>tC"). */
export const propId = (k: string): string => (k === 'title' ? 'title' : 'n_' + Array.from(k).map((ch) => (/[a-z0-9]/i.test(ch) ? ch : '_' + ch.charCodeAt(0).toString(36))).join(''))

const day = (ms: unknown): string | undefined => {
  const n = Number(ms)
  if (!n) return undefined
  const d = new Date(n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

class NotionReader {
  db: any
  blockStmt: any
  titleCache = new Map<string, string>()
  users = new Map<string, string>()
  stats = { pages: 0, blocks: 0, todos: 0, tasks: 0, tables: 0, databases: 0, rows: 0, skipped: 0, missing: 0 }
  warnings: string[] = []
  seen = new Set<string>()
  /** collection id → notion id of the database page made from it (linked views show the same one) */
  collections = new Map<string, string>()

  constructor(db: any) {
    this.db = db
    this.blockStmt = db.prepare('select * from block where id = ?')
  }

  block(id: string): Row | undefined { return this.blockStmt.get(id) }

  userName(id: unknown): string {
    if (typeof id !== 'string') return 'someone'
    if (!this.users.has(id)) {
      let name = 'someone'
      try {
        const r = this.db.prepare('select * from notion_user where id = ?').get(id)
        name = r?.name || [r?.given_name, r?.family_name].filter(Boolean).join(' ') || 'someone'
      } catch { /* older caches have no user table */ }
      this.users.set(id, name)
    }
    return this.users.get(id)!
  }

  /**
   * Notion rich text as Deskbase text: **bold**, *italic*, ~~strike~~, `code`, [links](https://…),
   * [[page mentions]] and @dates. `plain` drops the marks (titles, table cells, database values).
   * `color` is set when all of the text has the same color, so the block can take it.
   */
  richInfo(prop: any, plain = false): { text: string; color?: string } {
    if (!Array.isArray(prop)) return { text: '' }
    const colors = new Set<string>()
    let colored = 0
    let total = 0
    const text = prop.map((seg: any[]) => {
      const raw: string = typeof seg?.[0] === 'string' ? seg[0] : ''
      const marks: any[] = Array.isArray(seg?.[1]) ? seg[1] : []
      let mention: string | null = null
      let link = ''
      let color = ''
      const has = { b: false, i: false, s: false, c: false }
      for (const m of marks) {
        switch (m?.[0]) {
          case 'd': if (m[1]) mention = this.dateText(m[1], plain); break
          case 'p': if (m[1]) mention = plain ? this.pageTitle(m[1]) : `[[${this.pageTitle(m[1])}]]`; break
          case 'u': mention = (plain ? '' : '@') + this.userName(m[1]); break
          case 'e': mention = plain ? String(m[1] ?? '') : '`' + String(m[1] ?? '') + '`'; break
          case 'a': link = typeof m[1] === 'string' ? m[1] : ''; break
          case 'h': color = typeof m[1] === 'string' ? m[1] : ''; break
          case 'b': has.b = true; break
          case 'i': has.i = true; break
          case 's': has.s = true; break
          case 'c': has.c = true; break
        }
      }
      if (mention !== null) return mention
      if (raw === '‣') return ''
      if (raw.trim()) { total++; if (color) { colored++; colors.add(color) } }
      if (plain || !raw.trim()) return raw
      const lead = /^\s*/.exec(raw)![0]
      const trail = /\s*$/.exec(raw)![0]
      let core = raw.slice(lead.length, raw.length - trail.length)
      if (has.c) core = '`' + core.replace(/`/g, "'") + '`'
      if (link) {
        const to = notionIdIn(link)
        if (to && this.block(to)) core = `[[${this.pageTitle(to)}]]`
        else if (/^https?:\/\//i.test(link)) core = core === link ? link : `[${core}](${link})`
      }
      if (!has.c) {
        if (has.b && has.i) core = `***${core}***`
        else if (has.b) core = `**${core}**`
        else if (has.i) core = `*${core}*`
      }
      if (has.s) core = `~~${core}~~`
      return lead + core + trail
    }).join('')
    return { text, color: total && colored === total && colors.size === 1 ? [...colors][0] : undefined }
  }

  rich(prop: any, plain = false): string { return this.richInfo(prop, plain).text }

  dateText(d: any, plain = false): string {
    const at = plain ? '' : '@'
    const s = d.start_date ? at + d.start_date : ''
    const t = d.start_time ? ` ${d.start_time}` : ''
    return d.end_date ? `${s}${t} → ${at}${d.end_date}` : `${s}${t}`
  }

  pageTitle(id: string): string {
    if (this.titleCache.has(id)) return this.titleCache.get(id)!
    const r = this.block(id)
    let t = r ? this.rich(json(r.properties, {}).title, true) : ''
    if (!t && r?.collection_id) {
      const col = this.db.prepare('select name from collection where id = ?').get(r.collection_id)
      t = col ? this.rich(json(col.name, []), true) : ''
    }
    t = t.trim() || 'Untitled'
    this.titleCache.set(id, t)
    return t
  }

  listPages(): NotionPageInfo[] {
    const rows: Row[] = this.db.prepare("select id, type, properties, format, parent_id, parent_table, collection_id from block where alive = 1 and type in ('page', 'collection_view_page')").all()
    const out: NotionPageInfo[] = []
    for (const r of rows) {
      if (r.parent_table === 'collection') continue // database rows
      const title = this.pageTitle(r.id)
      if (!title.trim() || title === 'Untitled') continue
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

  /** Page-level look: cover and full width. */
  pageLook(fmt: Row): Pick<ImportPage, 'cover' | 'fullWidth'> {
    const cover = coverUrl(fmt.page_cover)
    return { ...(cover ? { cover } : {}), ...(fmt.page_full_width ? { fullWidth: true } : {}) }
  }

  importPage(id: string): ImportPage | null {
    const r = this.block(id)
    if (!r) { this.stats.missing++; return null }
    if (this.seen.has(id)) return null
    this.seen.add(id)
    const fmt = json(r.format, {})
    if (r.type === 'collection_view_page' || r.type === 'collection_view') {
      return r.collection_id ? this.database(r, this.pageTitle(id)) : null
    }
    const page: ImportPage = {
      notionId: id,
      title: this.pageTitle(id),
      icon: isEmoji(fmt.page_icon) ? fmt.page_icon : '',
      type: 'doc',
      blocks: [],
      children: [],
      ...this.pageLook(fmt)
    }
    this.stats.pages++
    page.blocks = this.blocksOf(this.children(r), page)
    return page
  }

  /** Converts a list of Notion block ids into Deskbase blocks. */
  blocksOf(ids: string[], page: ImportPage, indent = 0): Block[] {
    const out: Block[] = []
    for (const c of ids) this.convert(c, indent, out, page)
    return tidy(out)
  }

  push(out: Block[], type: BlockType, text: string, indent: number, extra: Partial<Block> = {}): Block {
    const b: Block = { id: bid(), type, text, ...(indent ? { indent: Math.min(4, indent) } : {}), ...extra }
    out.push(b)
    this.stats.blocks++
    return b
  }

  children(r: Row): string[] { const c = json(r.content, []); return Array.isArray(c) ? c : [] }

  convert(id: string, indent: number, out: Block[], page: ImportPage): void {
    const r = this.block(id)
    if (!r) { this.stats.missing++; return }
    if (!r.alive) return
    const props = json(r.properties, {})
    const fmt = json(r.format, {})
    const info = this.richInfo(props.title)
    const title = info.text
    const kids = this.children(r)
    // The block's own color, else the color all of its text has.
    const look: Partial<Block> = { ...colorOf(info.color), ...colorOf(fmt.block_color) }
    const sub = (ind = indent + 1): void => { for (const c of kids) this.convert(c, ind, out, page) }
    const heading = (level: 1 | 2 | 3): void => {
      const toggle = Boolean(fmt.toggleable)
      const text = /^\*\*[^*]+\*\*$/.test(title) ? title.slice(2, -2) : title
      this.push(out, (toggle ? `toggle-h${level}` : `h${level}`) as BlockType, text, indent, { ...look, ...(toggle ? { open: true } : {}) })
      sub(toggle ? indent + 1 : indent)
    }
    switch (r.type) {
      case 'text': this.push(out, 'p', title, indent, look); sub(); return
      case 'header': heading(1); return
      case 'sub_header': heading(2); return
      case 'sub_sub_header':
      case 'header_4': heading(3); return
      case 'to_do':
        this.push(out, 'todo', title, indent, { ...look, checked: props.checked?.[0]?.[0] === 'Yes' })
        this.stats.todos++
        sub(); return
      case 'bulleted_list': this.push(out, 'bullet', title, indent, look); sub(); return
      case 'numbered_list': this.push(out, 'number', title, indent, look); sub(); return
      case 'quote': this.push(out, 'quote', title, indent, look); sub(); return
      case 'divider': this.push(out, 'divider', '', 0); return
      case 'code': this.push(out, 'code', this.rich(props.title, true), indent); return
      case 'equation': this.push(out, 'equation', this.rich(props.title, true), indent); return
      case 'toggle':
        this.push(out, 'toggle', title, indent, { ...look, open: false })
        sub(); return
      case 'callout': {
        // A Deskbase callout is one line: the callout's text (or its first line of text), with the
        // rest of its content right under it.
        let text = title
        let rest = kids
        if (!text && kids.length) {
          const first = this.block(kids[0])
          if (first && first.type === 'text') { text = this.rich(json(first.properties, {}).title); rest = [...this.children(first), ...kids.slice(1)] }
        }
        if (!text.trim()) { for (const c of rest) this.convert(c, indent, out, page); return }
        const icon = isEmoji(fmt.page_icon) ? emojiToIcon(fmt.page_icon, 'lightbulb') : undefined
        this.push(out, 'callout', text, indent, { ...colorOf(fmt.block_color), ...(icon && icon !== 'lightbulb' ? { icon } : {}) })
        for (const c of rest) this.convert(c, indent + 1, out, page)
        return
      }
      case 'tab': {
        // Each tab is a child text block: its text is the tab's name, its children the tab's content.
        const labels: string[] = []
        const cols: Block[][] = []
        for (const c of kids) {
          const label = this.block(c)
          if (!label || !label.alive) { if (!label) this.stats.missing++; continue }
          labels.push(this.rich(json(label.properties, {}).title, true).trim())
          cols.push(this.blocksOf(this.children(label), page))
        }
        if (cols.length) this.push(out, 'tabs', '', indent, { labels, cols })
        return
      }
      case 'column_list': {
        const cols: Block[][] = []
        const widths: number[] = []
        for (const c of kids) {
          const col = this.block(c)
          if (!col || !col.alive) { if (!col) this.stats.missing++; continue }
          const content = col.type === 'column' ? this.children(col) : [c]
          cols.push(this.blocksOf(content, page))
          widths.push(Number(json(col.format, {}).column_ratio) || 0)
        }
        if (cols.length === 1) { out.push(...cols[0]); return }
        if (!cols.length) return
        const sum = widths.reduce((a, b) => a + b, 0)
        const even = widths.some((w) => !w) || sum <= 0
        this.push(out, 'columns', '', indent, { cols, ...(even ? {} : { widths: widths.map((w) => Math.round((w / sum) * 1000) / 1000) }) })
        return
      }
      case 'column':
      case 'transclusion_container':
        sub(indent); return
      case 'transclusion_reference': {
        const ref = fmt.transclusion_reference_pointer?.id
        const target = ref ? this.block(ref) : undefined
        if (target) for (const c of this.children(target)) this.convert(c, indent, out, page)
        else this.stats.missing++
        return
      }
      case 'table': {
        const order: string[] = fmt.table_block_column_order ?? []
        const rows: string[][] = []
        for (const rid of kids) {
          const tr = this.block(rid)
          if (!tr) { this.stats.missing++; continue }
          const p = json(tr.properties, {})
          rows.push(order.map((col) => this.rich(p[col], true)))
        }
        if (rows.length) { this.push(out, 'table', '', 0, { rows }); this.stats.tables++ }
        return
      }
      case 'page': {
        const child = this.importPage(id)
        if (child) page.children.push(child)
        this.push(out, 'link', this.pageTitle(id), indent, { ref: 'notion:' + id })
        return
      }
      case 'collection_view':
      case 'collection_view_page': {
        if (!r.collection_id) { this.stats.skipped++; return }
        const known = this.collections.get(r.collection_id)
        if (known) {
          this.push(out, r.type === 'collection_view' ? 'database' : 'link', this.pageTitle(id), indent, { ref: 'notion:' + known })
          return
        }
        const child = this.importPage(id)
        if (child) page.children.push(child)
        this.push(out, r.type === 'collection_view' ? 'database' : 'link', this.pageTitle(id), indent, { ref: 'notion:' + id })
        return
      }
      case 'alias': {
        const to = fmt.alias_pointer?.id
        if (to) this.push(out, 'link', this.pageTitle(to), indent, { ref: 'notion:' + to })
        return
      }
      case 'table_of_contents': this.push(out, 'toc', '', indent); return
      case 'bookmark': {
        const url = props.link?.[0]?.[0] ?? ''
        if (!url) { this.stats.skipped++; return }
        const meta = { title: this.rich(props.title, true) || undefined, desc: this.rich(props.description, true) || undefined, icon: publicUrl(fmt.bookmark_icon) ? fmt.bookmark_icon : undefined }
        this.push(out, 'bookmark', '', indent, { url, meta })
        return
      }
      case 'image': {
        const src = fmt.display_source ?? props.source?.[0]?.[0] ?? ''
        const cap = this.rich(props.caption, true)
        if (publicUrl(src)) {
          const w = Number(fmt.block_width) || 0
          const style = !w || fmt.block_full_width ? undefined : w <= 220 ? '25' : w <= 420 ? '50' : w <= 600 ? '75' : undefined
          this.push(out, 'image', cap, indent, { url: src, ...(style ? { style } : {}) })
        } else {
          // Uploads stay inside Notion; keep their name so nothing silently disappears.
          const name = cap || this.rich(props.title, true) || 'Image'
          this.push(out, 'callout', `${name} (an image stored in Notion)`, indent, { icon: 'image' })
          this.stats.skipped++
        }
        return
      }
      case 'embed':
      case 'video':
      case 'audio':
      case 'maps':
      case 'figma':
      case 'codepen':
      case 'tweet':
      case 'gist':
      case 'drive':
      case 'framer':
      case 'excalidraw':
      case 'typeform':
      case 'miro':
      case 'loom': {
        const src = props.source?.[0]?.[0] ?? fmt.display_source ?? ''
        if (publicUrl(src)) this.push(out, 'embed', this.rich(props.caption, true), indent, { url: src })
        else this.stats.skipped++
        return
      }
      case 'file':
      case 'pdf': {
        const src = props.source?.[0]?.[0] ?? fmt.display_source ?? ''
        const name = this.rich(props.title, true) || this.rich(props.caption, true)
        if (publicUrl(src)) this.push(out, 'bookmark', '', indent, { url: src, meta: { title: name || undefined } })
        else if (name) { this.push(out, 'callout', `${name} (a file stored in Notion)`, indent, { icon: 'file' }); this.stats.skipped++ }
        return
      }
      case 'external_object_instance':
      case 'link_preview': {
        const url = fmt.uri ?? props.link?.[0]?.[0] ?? props.source?.[0]?.[0]
        if (publicUrl(url)) this.push(out, 'bookmark', '', indent, { url })
        else this.stats.skipped++
        return
      }
      case 'button':
      case 'breadcrumb':
        this.stats.skipped++
        return
      default:
        if (title) this.push(out, 'p', title, indent, look)
        else this.stats.skipped++
        sub()
    }
  }

  /** A Notion database (inline or full page): properties, views and rows, each row with its own content. */
  database(r: Row, fallbackTitle = ''): ImportPage | null {
    const collectionId: string = r.collection_id
    const col: Row | undefined = this.db.prepare('select * from collection where id = ?').get(collectionId)
    if (!col) { this.stats.missing++; return null }
    this.collections.set(collectionId, r.id)
    const name = this.rich(json(col.name, []), true) || fallbackTitle || 'Database'
    const schema: Record<string, { name: string; type: string; options?: any[]; number_format?: string; collection_id?: string }> = json(col.schema, {})
    const colFmt = json(col.format, {})
    const icon = json(col.icon, null) ?? json(r.format, {}).page_icon
    const page: ImportPage = {
      notionId: r.id, title: name, icon: isEmoji(icon) ? icon : '', type: 'database', blocks: [], children: [], rows: [],
      ...this.pageLook({ ...json(r.format, {}), page_cover: col.cover ? json(col.cover, col.cover) : json(r.format, {}).page_cover })
    }
    this.stats.pages++
    this.stats.databases++
    const desc = this.rich(json(col.description, []))
    if (desc) page.blocks.push({ id: bid(), type: 'p', text: desc })

    // ---- properties ----
    const TYPE: Record<string, PropType> = {
      text: 'text', number: 'number', select: 'select', multi_select: 'multi', status: 'status', date: 'date',
      checkbox: 'checkbox', url: 'url', email: 'text', phone_number: 'text', person: 'text', created_by: 'text',
      last_edited_by: 'text', relation: 'relation', file: 'text', created_time: 'date', last_edited_time: 'date'
    }
    const order: string[] = (colFmt.collection_page_properties ?? []).map((x: any) => x?.property).filter((k: any) => typeof k === 'string')
    const keys = [...order.filter((k) => schema[k]), ...Object.keys(schema).filter((k) => !order.includes(k))].filter((k) => k !== 'title' && TYPE[schema[k]?.type])
    const props: DbProp[] = keys.map((k) => {
      const s = schema[k]
      const type = TYPE[s.type]
      const p: DbProp = { id: propId(k), name: s.name || 'Property', type }
      if (type === 'select' || type === 'multi' || type === 'status') {
        p.options = (s.options ?? []).filter((o) => o && o.value).map((o) => ({ id: 'o_' + propId(String(o.id ?? o.value)).replace(/^n_/, ''), name: String(o.value), color: OPTION_HEX[o.color] ?? OPTION_HEX.default }))
      }
      if (type === 'relation') {
        // Points at the database's page; the renderer turns notion: refs into its own ids.
        const target: Row | undefined = s.collection_id ? this.db.prepare('select parent_id from collection where id = ?').get(s.collection_id) : undefined
        p.relation = target?.parent_id ? 'notion:' + target.parent_id : null
      }
      if (type === 'number') {
        const f = s.number_format ?? ''
        p.format = f === 'percent' ? 'percent' : /dollar|euro|pound|yen|rupee|won|yuan|real|lira|franc|krona|krone|peso|ruble|rand|ringgit|shekel|zloty|baht|forint|koruna|dirham|riyal|rupiah|leu|dong|currency/.test(f) ? 'currency' : f === 'number_with_commas' ? 'decimal' : 'plain'
      }
      return p
    })
    const byKey = new Map(keys.map((k, i) => [k, props[i]]))
    const pid = (k: string): string | null => (k === 'title' ? '__title' : byKey.get(k)?.id ?? null)
    const optionId = (prop: DbProp, value: string): string | undefined => {
      const v = value.trim()
      if (!v) return undefined
      let o = prop.options!.find((x) => x.name === v)
      if (!o) { o = { id: 'o_' + bid(), name: v, color: OPTION_HEX.default }; prop.options!.push(o) }
      return o.id
    }

    // ---- views ----
    const viewIds: string[] = json(r.view_ids, [])
    const views: DbView[] = []
    let manual: string[] = []
    const VIEW: Record<string, ViewType> = { table: 'table', board: 'board', gallery: 'gallery', list: 'list', calendar: 'calendar', timeline: 'timeline' }
    for (const vid of Array.isArray(viewIds) ? viewIds : []) {
      const v: Row | undefined = this.db.prepare('select * from collection_view where id = ? and alive = 1').get(vid)
      if (!v) continue
      const vf = json(v.format, {})
      const q = json(v.query2, {})
      const type = VIEW[v.type] ?? 'table'
      if (!manual.length) { const ps = json(v.page_sort, []); if (Array.isArray(ps)) manual = ps }
      const list: any[] = vf[`${v.type}_properties`] ?? vf.table_properties ?? []
      const vname = typeof v.name === 'string' && v.name.replace(/[\sㅤ]/g, '') ? v.name.trim() : ({ table: 'Table', board: 'Board', gallery: 'Gallery', list: 'List', calendar: 'Calendar', timeline: 'Timeline', chart: 'Chart' } as const)[type]
      const view: DbView = { id: 'v_' + propId(vid).slice(2, 40), name: vname, type, filters: [], hidden: [] }
      const known = (k: unknown): k is string => typeof k === 'string' && pid(k) !== null
      view.hidden = list.filter((x) => x?.visible === false && known(x.property) && x.property !== 'title').map((x) => pid(x.property)!)
      if (type === 'table') {
        const widths: Record<string, number> = {}
        for (const x of list) if (known(x?.property) && Number(x.width)) widths[pid(x.property)!] = Math.round(Number(x.width))
        if (Object.keys(widths).length) view.widths = widths
      }
      if (type === 'board' || type === 'gallery') {
        view.cardProps = list.filter((x) => x?.visible !== false && known(x?.property) && x.property !== 'title').map((x) => pid(x.property)!)
      }
      const group = vf.board_columns_by?.property ?? q.group_by
      if (type === 'board' && known(group)) view.groupBy = pid(group)
      const cal = vf.calendar_by ?? q.calendar_by
      if (type === 'calendar' && known(cal)) view.dateProp = pid(cal)
      if (type === 'timeline') {
        const start = vf.timeline_by ?? q.timeline_by
        const end = vf.timeline_by_end ?? q.timeline_by_end
        if (known(start)) view.dateProp = pid(start)
        if (known(end)) view.endProp = pid(end)
      }
      const sort = Array.isArray(q.sort) ? q.sort.find((s: any) => known(s?.property)) : null
      if (sort) view.sort = { prop: pid(sort.property)!, dir: sort.direction === 'descending' ? 'desc' : 'asc' }
      for (const f of Array.isArray(vf.property_filters) ? vf.property_filters : []) {
        const inner = f?.filter
        const prop = known(inner?.property) ? byKey.get(inner.property) : undefined
        const op: string = inner?.filter?.operator ?? ''
        const value = inner?.filter?.value?.value
        if (!prop) continue
        const add = (x: Omit<DbFilter, 'id'>): void => { view.filters!.push({ id: bid(), ...x }) }
        if (op === 'checkbox_is') add({ prop: prop.id, op: value === true || value === 'true' ? 'checked' : 'unchecked' })
        else if ((op === 'enum_is' || op === 'status_is' || op === 'enum_contains') && typeof value === 'string' && prop.options) add({ prop: prop.id, op: op === 'enum_contains' ? 'contains' : 'is', value: optionId(prop, value) })
        else if ((op === 'enum_is_not' || op === 'status_is_not') && typeof value === 'string' && prop.options) add({ prop: prop.id, op: 'not', value: optionId(prop, value) })
        else if (op === 'string_contains' && typeof value === 'string') add({ prop: prop.id, op: 'contains', value })
        else if (op === 'string_is' && typeof value === 'string') add({ prop: prop.id, op: 'is', value })
        else if (op === 'is_empty') add({ prop: prop.id, op: 'empty' })
        else if (op === 'is_not_empty') add({ prop: prop.id, op: 'notEmpty' })
        else if (op === 'number_greater_than' && value !== undefined) add({ prop: prop.id, op: 'gt', value: Number(value) })
        else if (op === 'number_less_than' && value !== undefined) add({ prop: prop.id, op: 'lt', value: Number(value) })
      }
      views.push(view)
    }
    if (!views.length) views.push({ id: 'v_' + bid(), name: 'Table', type: 'table', filters: [], hidden: [] })
    page.db = { props, views }

    // A gallery can show a file property's picture on each card.
    let coverKey: string | null = null
    for (const vid of Array.isArray(viewIds) ? viewIds : []) {
      const v: Row | undefined = this.db.prepare('select format from collection_view where id = ?').get(vid)
      const gc = json(v?.format, {}).gallery_cover
      if (gc?.type === 'property' && typeof gc.property === 'string' && schema[gc.property]?.type === 'file') { coverKey = gc.property; break }
    }

    // ---- rows ----
    const rows: Row[] = this.db.prepare('select * from block where parent_id = ? and parent_table = ? and alive = 1 and (is_template is null or is_template = 0)').all(collectionId, 'collection')
    const rank = new Map(manual.map((id, i) => [id, i]))
    rows.sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9) || (a.created_time ?? 0) - (b.created_time ?? 0))
    for (const row of rows) {
      if (this.seen.has(row.id)) continue
      this.seen.add(row.id)
      const p = json(row.properties, {})
      const rf = json(row.format, {})
      const values: Record<string, any> = {}
      for (const k of keys) {
        const prop = byKey.get(k)!
        const s = schema[k]
        const v = p[k]
        let val: any
        switch (s.type) {
          case 'number': { const n = Number(this.rich(v, true).replace(/,/g, '')); if (v && Number.isFinite(n)) val = n; break }
          case 'checkbox': if (v?.[0]?.[0] === 'Yes') val = true; break
          case 'select': case 'status': val = optionId(prop, this.rich(v, true)); break
          case 'multi_select': { const ids = this.rich(v, true).split(',').map((x) => optionId(prop, x)).filter(Boolean); if (ids.length) val = ids; break }
          case 'date': { const d = Array.isArray(v) ? v.flatMap((seg: any[]) => (Array.isArray(seg?.[1]) ? seg[1] : [])).find((m: any[]) => m?.[0] === 'd')?.[1] : null; if (d?.start_date) val = d.start_date; break }
          case 'created_time': val = day(row.created_time); break
          case 'last_edited_time': val = day(row.last_edited_time); break
          case 'url': val = this.rich(v, true).trim() || undefined; break
          case 'file': {
            const links = Array.isArray(v) ? v.map((seg: any[]) => { const a = (seg?.[1] ?? []).find((m: any[]) => m?.[0] === 'a')?.[1]; return publicUrl(a) ? a : seg?.[0] }).filter(Boolean) : []
            val = links.join(', ') || undefined
            break
          }
          case 'relation': { const ids = Array.isArray(v) ? v.flatMap((seg: any[]) => (seg?.[1] ?? []).filter((m: any[]) => m?.[0] === 'p' && typeof m[1] === 'string').map((m: any[]) => 'notion:' + m[1])) : []; if (ids.length) val = ids; break }
          default: val = this.rich(v, true).trim() || undefined
        }
        if (val !== undefined && val !== '') values[prop.id] = val
      }
      if (coverKey) {
        const v = p[coverKey]
        const u = Array.isArray(v) ? v.map((seg: any[]) => (seg?.[1] ?? []).find((m: any[]) => m?.[0] === 'a')?.[1] ?? seg?.[0]).find(publicUrl) : undefined
        if (u && !rf.page_cover) rf.page_cover = u
      }
      const item: ImportRow = {
        notionId: row.id,
        title: this.rich(p.title, true).trim(),
        icon: isEmoji(rf.page_icon) ? rf.page_icon : '',
        props: values,
        blocks: this.blocksOf(this.children(row), page),
        ...this.pageLook(rf)
      }
      page.rows!.push(item)
      this.stats.rows++
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

  const stats = { pages: 0, blocks: 0, todos: 0, tasks: 0, tables: 0, databases: 0, rows: 0, skipped: 0, missing: 0 }
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
