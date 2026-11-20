import { act, createPage, getData } from '../store'
import type { AppData, Block, Page } from '../types'
import { addDays, today } from './util'

/** Text editors of the blocks on screen, by block id (for focus, caret and scrolling). */
export const blockRefs = new Map<string, HTMLTextAreaElement>()

export function focusBlock(id: string, at: 'start' | 'end' | number = 'end'): void {
  requestAnimationFrame(() => {
    const el = blockRefs.get(id)
    if (!el) return
    el.focus()
    const pos = at === 'start' ? 0 : at === 'end' ? el.value.length : at
    el.setSelectionRange(pos, pos)
  })
}

export function scrollToBlock(id: string): void {
  const el = blockRefs.get(id) ?? document.querySelector(`[data-block="${id}"]`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el?.closest('.block')?.animate([{ background: 'color-mix(in srgb, var(--accent) 16%, transparent)' }, { background: 'transparent' }], { duration: 1200 })
}

// ---------- inline marks: [[Page title]], @dates, links, **bold**, `code` ----------

export type Inline =
  | { kind: 'text'; text: string; start: number; end: number }
  | { kind: 'page'; title: string; start: number; end: number }
  | { kind: 'date'; day: string; start: number; end: number }
  | { kind: 'url'; url: string; start: number; end: number }
  | { kind: 'bold'; text: string; start: number; end: number }
  | { kind: 'code'; text: string; start: number; end: number }

const INLINE = /\[\[([^\]\n]{1,120})\]\]|@(\d{4}-\d{2}-\d{2}|today|tomorrow|yesterday)\b|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])|\*\*([^*\n]+)\*\*|`([^`\n]+)`/gi

/** True when a block's text has something to draw as a link, chip or mark. */
export const hasInline = (text: string): boolean => { INLINE.lastIndex = 0; return INLINE.test(text) }

export function dayOf(word: string): string {
  const w = word.toLowerCase()
  if (w === 'today') return today()
  if (w === 'tomorrow') return addDays(today(), 1)
  if (w === 'yesterday') return addDays(today(), -1)
  return word
}

export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  let last = 0
  INLINE.lastIndex = 0
  for (let m = INLINE.exec(text); m; m = INLINE.exec(text)) {
    const start = m.index
    const end = start + m[0].length
    if (start > last) out.push({ kind: 'text', text: text.slice(last, start), start: last, end: start })
    if (m[1] !== undefined) out.push({ kind: 'page', title: m[1].trim(), start, end })
    else if (m[2] !== undefined) out.push({ kind: 'date', day: dayOf(m[2]), start, end })
    else if (m[3] !== undefined) out.push({ kind: 'url', url: m[3], start, end })
    else if (m[4] !== undefined) out.push({ kind: 'bold', text: m[4], start, end })
    else out.push({ kind: 'code', text: m[5], start, end })
    last = end
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last), start: last, end: text.length })
  return out
}

/** The live page with this title (links are by title, like a wiki). */
const titleCache = new WeakMap<object, Map<string, Page>>()

/** Lower-case title → oldest live page with it; rebuilt only when the pages change. */
function titleIndex(pages: Record<string, Page>): Map<string, Page> {
  let idx = titleCache.get(pages)
  if (idx) return idx
  idx = new Map()
  for (const p of Object.values(pages)) {
    if (p.deletedAt) continue
    const t = (p.title || 'Untitled').trim().toLowerCase()
    const had = idx.get(t)
    if (!had || p.createdAt < had.createdAt) idx.set(t, p)
  }
  titleCache.set(pages, idx)
  return idx
}

export function pageByTitle(d: Pick<AppData, 'pages'>, title: string): Page | undefined {
  const t = title.trim().toLowerCase()
  return t ? titleIndex(d.pages).get(t) : undefined
}

/** Opens the page a link names; a link to a page that does not exist yet creates it. */
export function pageForLink(title: string): string {
  const found = pageByTitle(getData(), title)
  return found ? found.id : createPage('doc', null, title.trim())
}

/** Every text a page holds in its blocks, columns and toggle bodies. */
export function* blockTexts(blocks: Block[]): Generator<string> {
  for (const b of blocks) {
    yield b.text
    if (b.body) yield b.body
    if (b.rows) for (const r of b.rows) yield* r
    if (b.cols) for (const c of b.cols) yield* blockTexts(c)
  }
}

/** Pages that link to this one with [[its title]] or a link-to-page block. */
export function backlinks(d: AppData, id: string): Page[] {
  const page = d.pages[id]
  if (!page) return []
  const needle = '[[' + (page.title || 'Untitled').trim().toLowerCase() + ']]'
  const out: Page[] = []
  const linksHere = (blocks: Block[]): boolean => blocks.some((b) => (b.type === 'link' && b.ref === id) || (b.cols ? b.cols.some(linksHere) : false))
  for (const p of Object.values(d.pages)) {
    if (p.id === id || p.deletedAt || !p.blocks) continue
    let hit = linksHere(p.blocks)
    if (!hit) for (const t of blockTexts(p.blocks)) { if (t && t.toLowerCase().includes(needle)) { hit = true; break } }
    if (hit) out.push(p)
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt)
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** After a page is renamed, links that used its old title follow the new one. */
export function renameLinks(oldTitle: string, newTitle: string): void {
  const from = oldTitle.trim()
  const to = newTitle.trim()
  if (!from || !to || from.toLowerCase() === to.toLowerCase()) return
  // Another page still has the old title: links keep pointing at it.
  if (pageByTitle(getData(), from)) return
  const re = new RegExp('\\[\\[' + escapeRe(from) + '\\]\\]', 'gi')
  const fix = (blocks: Block[]): void => {
    for (const b of blocks) {
      if (b.text.includes('[[')) b.text = b.text.replace(re, `[[${to}]]`)
      if (b.body?.includes('[[')) b.body = b.body.replace(re, `[[${to}]]`)
      if (b.cols) b.cols.forEach(fix)
    }
  }
  const touched = Object.values(getData().pages).some((p) => p.blocks && [...blockTexts(p.blocks)].some((t) => t && re.test(t) && ((re.lastIndex = 0), true)))
  if (!touched) return
  act((d) => { for (const p of Object.values(d.pages)) if (p.blocks) fix(p.blocks) })
}
