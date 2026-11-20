// Notion through its public API with an integration token: pages and databases shared with the
// integration come in as the same page trees the Notion app import makes, so refreshing updates
// them in place. Checking a to-do (or a checkbox property) here is sent back to Notion.
import { net } from 'electron'
import type { Block, BlockType, DbProp, PropType } from '../renderer/src/types'
import type { ImportPage, ImportResult, ImportRow, NotionPageInfo } from '../shared/import-types'
import { emojiToIcon } from '../shared/emoji-icons'
import { bid, tidy } from '../shared/markdown'
import { OPTION_HEX, colorOf, isEmoji, propId, publicUrl } from './notion'

const API = 'https://api.notion.com/v1'
const VERSION = '2022-06-28'
const MAX_REQUESTS = 700
const MAX_DEPTH = 3
const ROW_PAGES = 30

export type NotionPush =
  | { kind: 'todo'; block: string; checked: boolean }
  | { kind: 'checkbox'; page: string; prop: string; value: boolean }

class NotionApi {
  requests = 0
  constructor(private token: string) {}

  async call(method: string, p: string, body?: unknown): Promise<any> {
    if (++this.requests > MAX_REQUESTS) throw new Error('LIMIT')
    for (let attempt = 0; ; attempt++) {
      const r = await net.fetch(API + p, {
        method,
        headers: { Authorization: `Bearer ${this.token}`, 'Notion-Version': VERSION, 'Content-Type': 'application/json', 'User-Agent': 'Deskbase' },
        ...(body ? { body: JSON.stringify(body) } : {})
      })
      if (r.status === 429 && attempt < 4) { await new Promise((ok) => setTimeout(ok, (Number(r.headers.get('retry-after')) || 1) * 1000)); continue }
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        const msg = r.status === 401 ? 'Notion did not accept the token.' : r.status === 404 ? 'NOT_FOUND' : j?.message ?? `Notion answered ${r.status}.`
        throw new Error(msg)
      }
      return j
    }
  }

  async all(method: string, p: string, body?: Record<string, unknown>, limit = 1000): Promise<any[]> {
    const out: any[] = []
    let cursor: string | undefined
    do {
      const sep = p.includes('?') ? '&' : '?'
      const j = method === 'GET'
        ? await this.call('GET', `${p}${sep}page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`)
        : await this.call(method, p, { ...(body ?? {}), page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) })
      out.push(...(j.results ?? []))
      cursor = j.has_more ? j.next_cursor : undefined
    } while (cursor && out.length < limit)
    return out
  }
}

const plain = (rt: any): string => (Array.isArray(rt) ? rt.map((x) => x?.plain_text ?? '').join('') : '')

/** Notion rich text with Deskbase's marks: **bold**, *italic*, ~~strike~~, `code`, [links](…) and [[pages]]. */
function rich(rt: any): string {
  if (!Array.isArray(rt)) return ''
  return rt.map((x) => {
    const t: string = x?.plain_text ?? ''
    if (!t) return ''
    if (x.type === 'mention' && x.mention?.type === 'page') return `[[${t}]]`
    if (x.type === 'equation') return '`' + t + '`'
    const a = x.annotations ?? {}
    const lead = t.match(/^\s*/)![0]
    const trail = t.match(/\s*$/)![0]
    let s = t.trim()
    if (!s) return t
    if (a.code) s = '`' + s + '`'
    if (a.bold) s = `**${s}**`
    if (a.italic) s = `*${s}*`
    if (a.strikethrough) s = `~~${s}~~`
    if (x.href && x.type !== 'mention') s = `[${s}](${x.href})`
    return lead + s + trail
  }).join('')
}

const iconOf = (icon: any): string => (icon?.type === 'emoji' && isEmoji(icon.emoji) ? icon.emoji : '')
const coverOf = (cover: any): string | undefined => (cover?.type === 'external' && publicUrl(cover.external?.url) ? cover.external.url : undefined)
const titleOfPage = (p: any): string => {
  for (const v of Object.values(p?.properties ?? {}) as any[]) if (v?.type === 'title') return plain(v.title).trim()
  return ''
}
const dashed = (id: string): string => {
  const h = id.replace(/-/g, '').toLowerCase()
  return h.length === 32 ? `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}` : id
}

const TYPE: Record<string, PropType> = {
  rich_text: 'text', number: 'number', select: 'select', multi_select: 'multi', status: 'status', date: 'date', checkbox: 'checkbox',
  url: 'url', email: 'text', phone_number: 'text', people: 'text', files: 'text', relation: 'relation', formula: 'text', rollup: 'text',
  created_time: 'date', last_edited_time: 'date', created_by: 'text', last_edited_by: 'text', unique_id: 'text'
}

const optId = (o: any): string => 'o_' + propId(String(o?.id ?? o?.name ?? '')).replace(/^n_/, '')

function valueOf(v: any, prop: DbProp): any {
  switch (v?.type) {
    case 'rich_text': return plain(v.rich_text).trim() || undefined
    case 'number': return typeof v.number === 'number' ? v.number : undefined
    case 'select': case 'status': {
      const o = v[v.type]
      if (!o) return undefined
      if (prop.options && !prop.options.some((x) => x.id === optId(o))) prop.options.push({ id: optId(o), name: String(o.name), color: OPTION_HEX[o.color] ?? OPTION_HEX.default })
      return optId(o)
    }
    case 'multi_select': {
      const list = Array.isArray(v.multi_select) ? v.multi_select : []
      for (const o of list) if (prop.options && !prop.options.some((x) => x.id === optId(o))) prop.options.push({ id: optId(o), name: String(o.name), color: OPTION_HEX[o.color] ?? OPTION_HEX.default })
      return list.length ? list.map(optId) : undefined
    }
    case 'date': return v.date?.start ? String(v.date.start).slice(0, 10) : undefined
    case 'checkbox': return v.checkbox ? true : undefined
    case 'url': return v.url || undefined
    case 'email': return v.email || undefined
    case 'phone_number': return v.phone_number || undefined
    case 'people': return (v.people ?? []).map((p: any) => p?.name).filter(Boolean).join(', ') || undefined
    case 'files': return (v.files ?? []).map((f: any) => f?.external?.url ?? f?.name).filter(Boolean).join(', ') || undefined
    case 'relation': return (v.relation ?? []).length ? v.relation.map((r: any) => 'notion:' + dashed(r.id)) : undefined
    case 'formula': {
      const f = v.formula ?? {}
      const x = f.type === 'date' ? f.date?.start?.slice(0, 10) : f[f.type]
      return x === null || x === undefined || x === '' ? undefined : String(x)
    }
    case 'rollup': {
      const r = v.rollup ?? {}
      if (r.type === 'number') return r.number === null ? undefined : String(r.number)
      if (r.type === 'date') return r.date?.start?.slice(0, 10)
      if (r.type === 'array') return (r.array ?? []).map((x: any) => (x?.type === 'title' || x?.type === 'rich_text' ? plain(x[x.type]) : x?.[x?.type]?.name ?? x?.[x?.type] ?? '')).filter((s: any) => s !== '' && typeof s !== 'object').join(', ') || undefined
      return undefined
    }
    case 'created_time': return v.created_time?.slice(0, 10)
    case 'last_edited_time': return v.last_edited_time?.slice(0, 10)
    case 'created_by': return v.created_by?.name || undefined
    case 'last_edited_by': return v.last_edited_by?.name || undefined
    case 'unique_id': return v.unique_id?.number !== undefined ? `${v.unique_id.prefix ? v.unique_id.prefix + '-' : ''}${v.unique_id.number}` : undefined
    default: return undefined
  }
}

class Importer {
  stats = { pages: 0, blocks: 0, todos: 0, tasks: 0, tables: 0, databases: 0, rows: 0, skipped: 0, missing: 0 }
  warnings: string[] = []
  seen = new Set<string>()
  constructor(private api: NotionApi, private via: string) {}

  push(out: Block[], type: BlockType, text: string, indent: number, extra: Partial<Block> = {}): void {
    out.push({ id: bid(), type, text, ...(indent ? { indent: Math.min(4, indent) } : {}), ...extra })
    this.stats.blocks++
  }

  async children(id: string): Promise<any[]> { return this.api.all('GET', `/blocks/${id}/children`) }

  async blocks(id: string, page: ImportPage, depth: number, indent = 0): Promise<Block[]> {
    const out: Block[] = []
    for (const b of await this.children(id)) await this.convert(b, indent, out, page, depth)
    return tidy(out)
  }

  async convert(b: any, indent: number, out: Block[], page: ImportPage, depth: number): Promise<void> {
    const t: string = b.type
    const v = b[t] ?? {}
    const look: Partial<Block> = colorOf(v.color)
    const sub = async (ind = indent + 1): Promise<void> => { if (b.has_children) for (const c of await this.children(b.id)) await this.convert(c, ind, out, page, depth) }
    switch (t) {
      case 'paragraph': this.push(out, 'p', rich(v.rich_text), indent, look); await sub(); return
      case 'heading_1': case 'heading_2': case 'heading_3': {
        const level = t.slice(-1)
        const toggle = !!v.is_toggleable
        this.push(out, (toggle ? `toggle-h${level}` : `h${level}`) as BlockType, rich(v.rich_text), indent, { ...look, ...(toggle ? { open: true } : {}) })
        await sub(toggle ? indent + 1 : indent); return
      }
      case 'to_do': this.push(out, 'todo', rich(v.rich_text), indent, { ...look, checked: !!v.checked, nid: b.id }); this.stats.todos++; await sub(); return
      case 'bulleted_list_item': this.push(out, 'bullet', rich(v.rich_text), indent, look); await sub(); return
      case 'numbered_list_item': this.push(out, 'number', rich(v.rich_text), indent, look); await sub(); return
      case 'quote': this.push(out, 'quote', rich(v.rich_text), indent, look); await sub(); return
      case 'toggle': this.push(out, 'toggle', rich(v.rich_text), indent, { ...look, open: false }); await sub(); return
      case 'callout': {
        const icon = isEmoji(v.icon?.emoji) ? emojiToIcon(v.icon.emoji, 'lightbulb') : undefined
        this.push(out, 'callout', rich(v.rich_text), indent, { ...look, ...(icon && icon !== 'lightbulb' ? { icon } : {}) })
        await sub(); return
      }
      case 'divider': this.push(out, 'divider', '', 0); return
      case 'code': this.push(out, 'code', plain(v.rich_text), indent); return
      case 'equation': this.push(out, 'equation', v.expression ?? '', indent); return
      case 'table_of_contents': this.push(out, 'toc', '', indent); return
      case 'table': {
        const rows = (await this.children(b.id)).filter((r) => r.type === 'table_row').map((r) => (r.table_row?.cells ?? []).map((c: any) => plain(c)))
        if (rows.length) { this.push(out, 'table', '', 0, { rows }); this.stats.tables++ }
        return
      }
      case 'bookmark': case 'link_preview': {
        if (v.url) this.push(out, 'bookmark', '', indent, { url: v.url })
        return
      }
      case 'embed': case 'video': case 'audio': case 'pdf': case 'file': {
        const url = v.url ?? v.external?.url
        if (publicUrl(url)) this.push(out, 'embed', '', indent, { url })
        else this.stats.skipped++
        return
      }
      case 'image': {
        const url = v.external?.url
        if (publicUrl(url)) this.push(out, 'image', plain(v.caption), indent, { url })
        else this.stats.skipped++
        return
      }
      case 'column_list': {
        const cols: Block[][] = []
        for (const c of await this.children(b.id)) if (c.type === 'column') cols.push(await this.blocks(c.id, page, depth))
        if (cols.length === 1) out.push(...cols[0])
        else if (cols.length) this.push(out, 'columns', '', indent, { cols })
        return
      }
      case 'synced_block': {
        const from = v.synced_from?.block_id
        for (const c of await this.children(from ?? b.id)) await this.convert(c, indent, out, page, depth)
        return
      }
      case 'child_page': case 'child_database': {
        const id = dashed(b.id)
        if (depth < MAX_DEPTH) {
          const child = await this.page(id, depth + 1).catch(() => null)
          if (child) page.children.push(child)
        }
        this.push(out, t === 'child_database' ? 'database' : 'link', v.title ?? '', indent, { ref: 'notion:' + id })
        return
      }
      case 'link_to_page': {
        const id = v.page_id ?? v.database_id
        if (id) this.push(out, 'link', '', indent, { ref: 'notion:' + dashed(id) })
        return
      }
      default: this.stats.skipped++
    }
  }

  async page(id: string, depth = 0): Promise<ImportPage | null> {
    if (this.seen.has(id)) return null
    this.seen.add(id)
    let p: any
    try { p = await this.api.call('GET', `/pages/${id}`) } catch (e: any) {
      if (e?.message !== 'NOT_FOUND') throw e
      try { return await this.database(id, depth) } catch (e2: any) {
        if (e2?.message === 'NOT_FOUND') { this.warnings.push('A page is no longer shared with the connection.'); return null }
        throw e2
      }
    }
    const page: ImportPage = { notionId: id, via: this.via, title: titleOfPage(p), icon: iconOf(p.icon), type: 'doc', blocks: [], children: [], ...(coverOf(p.cover) ? { cover: coverOf(p.cover) } : {}) }
    this.stats.pages++
    page.blocks = await this.blocks(id, page, depth)
    return page
  }

  async database(id: string, depth: number): Promise<ImportPage> {
    const d = await this.api.call('GET', `/databases/${id}`)
    const props: DbProp[] = []
    const byName = new Map<string, DbProp>()
    for (const [name, s] of Object.entries<any>(d.properties ?? {})) {
      if (s.type === 'title' || !TYPE[s.type]) continue
      const type = TYPE[s.type]
      const p: DbProp = { id: propId(decodeURIComponent(String(s.id))), name, type }
      if (type === 'select' || type === 'multi' || type === 'status') p.options = (s[s.type]?.options ?? []).map((o: any) => ({ id: optId(o), name: String(o.name), color: OPTION_HEX[o.color] ?? OPTION_HEX.default }))
      if (type === 'relation') p.relation = s.relation?.database_id ? 'notion:' + dashed(s.relation.database_id) : null
      if (type === 'number') { const f = String(s.number?.format ?? ''); p.format = f === 'percent' ? 'percent' : f === 'number_with_commas' ? 'decimal' : f && f !== 'number' ? 'currency' : 'plain' }
      props.push(p)
      byName.set(name, p)
    }
    const page: ImportPage = {
      notionId: id, via: this.via, title: plain(d.title).trim() || 'Untitled', icon: iconOf(d.icon), type: 'database', children: [],
      blocks: plain(d.description) ? [{ id: bid(), type: 'p', text: rich(d.description) }] : [],
      db: { props, views: [{ id: 'v_table', name: 'Table', type: 'table', filters: [], hidden: [] }] }, rows: [],
      ...(coverOf(d.cover) ? { cover: coverOf(d.cover) } : {})
    }
    this.stats.pages++
    this.stats.databases++
    const rows = await this.api.all('POST', `/databases/${id}/query`, {}, 2000)
    let withContent = 0
    for (const r of rows) {
      if (r.archived || r.in_trash) continue
      const values: Record<string, any> = {}
      for (const [name, v] of Object.entries<any>(r.properties ?? {})) {
        const prop = byName.get(name)
        if (!prop) continue
        const x = valueOf(v, prop)
        if (x !== undefined && x !== '') values[prop.id] = x
      }
      const row: ImportRow = { notionId: dashed(r.id), via: this.via, title: titleOfPage(r), icon: iconOf(r.icon), props: values, blocks: [], ...(coverOf(r.cover) ? { cover: coverOf(r.cover) } : {}) }
      if (withContent < ROW_PAGES && depth <= MAX_DEPTH) {
        withContent++
        row.blocks = await this.blocks(r.id, page, MAX_DEPTH)
      } else row.keepBlocks = true
      page.rows!.push(row)
      this.stats.rows++
    }
    if (rows.length > ROW_PAGES) this.warnings.push(`“${page.title}”: the first ${ROW_PAGES} rows came with their page content; the rest bring their properties.`)
    if (!page.blocks.length) page.blocks = [{ id: bid(), type: 'p', text: '' }]
    return page
  }
}

export async function notionApiSearch(token: string): Promise<NotionPageInfo[]> {
  const api = new NotionApi(token)
  const list = await api.all('POST', '/search', { sort: { direction: 'descending', timestamp: 'last_edited_time' } }, 500)
  return list
    .filter((x) => !x.archived && !x.in_trash && x.parent?.type !== 'database_id')
    .map((x) => ({
      id: dashed(x.id),
      title: (x.object === 'database' ? plain(x.title) : titleOfPage(x)).trim() || 'Untitled',
      icon: iconOf(x.icon),
      parent: x.parent?.type === 'workspace' ? '' : 'Inside another page',
      kind: x.object === 'database' ? 'database' : 'page'
    }))
}

export async function notionApiImport(token: string, ids: string[], via: string): Promise<ImportResult> {
  const api = new NotionApi(token)
  const imp = new Importer(api, via)
  const pages: ImportPage[] = []
  for (const id of ids) {
    try {
      const p = await imp.page(dashed(id))
      if (p) pages.push(p)
    } catch (e: any) {
      if (e?.message === 'LIMIT') { imp.warnings.push('Notion has a lot here; some pages were left for the next refresh.'); break }
      throw e
    }
  }
  return { pages, stats: imp.stats, warnings: imp.warnings }
}

export async function notionApiPush(token: string, op: NotionPush): Promise<void> {
  const api = new NotionApi(token)
  if (op.kind === 'todo') await api.call('PATCH', `/blocks/${op.block}`, { to_do: { checked: op.checked } })
  else await api.call('PATCH', `/pages/${op.page}`, { properties: { [op.prop]: { checkbox: op.value } } })
}
