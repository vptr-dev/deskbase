// Markdown <-> blocks, shared by the main process (Notion export import) and the renderer
// (AI "append to page", pasted Markdown). Plain text only: inline Markdown marks are stripped.
import type { Block, BlockType } from '../renderer/src/types'

let n = 0
export const bid = (): string => Date.now().toString(36) + (n++).toString(36) + Math.random().toString(36).slice(2, 6)

export function stripInline(s: string): string {
  return s
    .replace(/!\[([^\]]*)\]\(([^)]*)\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]*)\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[^*])\*(?!\s)([^*]+?)\*(?!\*)/g, '$1$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/<\/?(?:u|b|i|em|strong|span|mark)[^>]*>/gi, '')
}

const make = (type: BlockType, text = '', extra: Partial<Block> = {}): Block => ({ id: bid(), type, text, ...extra })

export function markdownToBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  const out: Block[] = []
  let i = 0
  const indentOf = (s: string): number => Math.min(4, Math.floor((s.match(/^\s*/)?.[0].replace(/\t/g, '    ').length ?? 0) / 2))
  while (i < lines.length) {
    const raw = lines[i]
    const line = raw.trimEnd()
    const t = line.trim()
    // fenced code
    if (t.startsWith('```')) {
      const body: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) body.push(lines[i++])
      i++
      out.push(make('code', body.join('\n')))
      continue
    }
    // table
    if (t.startsWith('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const rows: string[][] = []
      const parse = (s: string): string[] => s.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => stripInline(c.trim()))
      rows.push(parse(line))
      i += 2
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(parse(lines[i++]))
      out.push(make('table', '', { rows }))
      continue
    }
    // <details> toggles
    const det = t.match(/^<details>\s*<summary>(.*?)<\/summary>/i)
    if (det) {
      const body: string[] = []
      i++
      while (i < lines.length && !/^<\/details>/i.test(lines[i].trim())) body.push(lines[i++])
      i++
      out.push(make('toggle', stripInline(det[1]), { open: false }))
      for (const b of markdownToBlocks(body.join('\n'))) out.push({ ...b, indent: Math.min(4, (b.indent ?? 0) + 1) })
      continue
    }
    // Notion callouts are exported as <aside> blocks
    if (/^<aside>/i.test(t)) {
      const body: string[] = []
      const first = t.replace(/^<aside>/i, '').replace(/<\/aside>$/i, '').trim()
      if (first) body.push(first)
      if (!/<\/aside>$/i.test(t)) {
        i++
        while (i < lines.length && !/<\/aside>/i.test(lines[i])) body.push(lines[i++])
        const last = (lines[i] ?? '').replace(/<\/aside>/i, '').trim()
        if (last) body.push(last)
      }
      i++
      const text = body.map((b) => b.trim()).filter(Boolean).join(' ').replace(/^\p{Extended_Pictographic}\s*/u, '')
      out.push(make('callout', stripInline(text)))
      continue
    }
    const ind = indentOf(raw)
    let m: RegExpMatchArray | null
    if (!t) { out.push(make('p')); i++; continue }
    if ((m = t.match(/^(#{1,3})\s+(.*)$/))) out.push(make((['h1', 'h2', 'h3'] as const)[m[1].length - 1], stripInline(m[2])))
    else if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) out.push(make('divider'))
    else if ((m = t.match(/^[-*+]\s+\[([ xX])\]\s*(.*)$/))) out.push(make('todo', stripInline(m[2]), { checked: m[1] !== ' ', indent: ind }))
    else if ((m = t.match(/^[-*+]\s+(.*)$/))) out.push(make('bullet', stripInline(m[1]), { indent: ind }))
    else if ((m = t.match(/^\d+[.)]\s+(.*)$/))) out.push(make('number', stripInline(m[1]), { indent: ind }))
    else if ((m = t.match(/^>\s?(.*)$/))) out.push(make('quote', stripInline(m[1])))
    else out.push(make('p', stripInline(t), { indent: ind }))
    i++
  }
  return tidy(out)
}

/** Collapse runs of empty paragraphs and trim them from both ends. */
export function tidy(blocks: Block[]): Block[] {
  const out: Block[] = []
  for (const b of blocks) {
    const empty = b.type === 'p' && !b.text.trim()
    if (empty && (out.length === 0 || (out[out.length - 1].type === 'p' && !out[out.length - 1].text.trim()))) continue
    out.push(b)
  }
  while (out.length && out[out.length - 1].type === 'p' && !out[out.length - 1].text.trim()) out.pop()
  return out.length ? out : [make('p')]
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  const s = text.replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') q = false
      else cell += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim()))
}
