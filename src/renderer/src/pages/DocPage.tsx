import { blockTextColor } from '../lib/look'
import { memo, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { act, getData, toast, updatePage, useApp, useData } from '../store'
import { blocksToText, clearSelection, useSelection } from '../lib/selection'
import type { Block, BlockType, Page, PageType } from '../types'
import { uid } from '../lib/util'
import { newPage, PAGE_TYPES, typeInfo } from '../lib/defaults'
import { openFromClick } from '../lib/tabs'
import { blockRefs as refs, focusBlock } from '../lib/links'
import { AutoText, Button, Checkbox, OptionalColor, IconPickerButton, Menu, Popover, type MenuItem } from '../components/ui'
import { Glyph, Icon } from '../components/Icon'
import { ToolBody } from './ToolBody'
import { DatabaseView } from './DatabasePage'
import {
  BookmarkBlock, ButtonBlock, EmbedBlock, EquationBlock, ImageBlock, InlineText, LinkBlock, PagePicker, SyncedBlock, TocBlock,
  blockLink, findBlock, imageFromFile, mentionOptions, parseBlockLink, type MentionState
} from '../components/Blocks'

interface SlashItem { type: BlockType; label: string; icon: string; hint: string; cols?: number; tool?: PageType; keywords?: string }

const SLASH: SlashItem[] = [
  { type: 'p', label: 'Text', icon: 'type', hint: '' },
  { type: 'h1', label: 'Heading 1', icon: 'heading1', hint: '#' },
  { type: 'h2', label: 'Heading 2', icon: 'heading2', hint: '##' },
  { type: 'h3', label: 'Heading 3', icon: 'heading3', hint: '###' },
  { type: 'todo', label: 'To-do', icon: 'square-check-big', hint: '[]' },
  { type: 'bullet', label: 'Bulleted list', icon: 'list', hint: '-' },
  { type: 'number', label: 'Numbered list', icon: 'list-ordered', hint: '1.' },
  { type: 'toggle', label: 'Toggle', icon: 'list-collapse', hint: '>>' },
  { type: 'toggle-h1', label: 'Toggle heading 1', icon: 'heading1', hint: '>#' },
  { type: 'toggle-h2', label: 'Toggle heading 2', icon: 'heading2', hint: '>##' },
  { type: 'toggle-h3', label: 'Toggle heading 3', icon: 'heading3', hint: '>###' },
  { type: 'quote', label: 'Quote', icon: 'quote', hint: '"' },
  { type: 'callout', label: 'Callout', icon: 'lightbulb', hint: '!' },
  { type: 'code', label: 'Code', icon: 'code', hint: '```' },
  { type: 'divider', label: 'Divider', icon: 'minus', hint: '---' },
  { type: 'table', label: 'Table', icon: 'table', hint: '' },
  { type: 'columns', label: '2 columns', icon: 'columns2', hint: '', cols: 2 },
  { type: 'columns', label: '3 columns', icon: 'columns', hint: '', cols: 3 },
  ...[4, 5, 6, 8, 12].map(cols => ({ type: 'columns' as const, label: cols + ' columns', icon: 'columns', hint: '', cols })),
  { type: 'tabs', label: 'Tabs', icon: 'tabs', hint: '' },
  { type: 'database', label: 'Database', icon: 'database', hint: '' },
  ...PAGE_TYPES.filter(p => p.type !== 'doc' && p.type !== 'database').map(p => ({
    type: 'tool' as const, tool: p.type, icon: p.icon, label: p.type === 'calendar' ? 'Planner calendar' : p.name,
    hint: 'Inline', keywords: p.type + (p.type === 'calendar' ? ' schedule' : '')
  })),
  { type: 'tool', label: 'Existing tool', icon: 'pageLink', hint: 'Linked view' },
  { type: 'toc', label: 'Table of contents', icon: 'toc', hint: '' },
  { type: 'link', label: 'Link to page', icon: 'pageLink', hint: '' },
  { type: 'bookmark', label: 'Bookmark', icon: 'bookmark', hint: '' },
  { type: 'image', label: 'Image', icon: 'image', hint: '' },
  { type: 'embed', label: 'Embed', icon: 'embed', hint: '' },
  { type: 'equation', label: 'Equation', icon: 'sigma', hint: '$$' },
  { type: 'button', label: 'Button', icon: 'pointer', hint: '' }
]

const SHORTCUTS: [RegExp, BlockType][] = [
  [/^#\s$/, 'h1'], [/^##\s$/, 'h2'], [/^###\s$/, 'h3'], [/^\[\]\s$/, 'todo'], [/^\[ \]\s$/, 'todo'],
  [/^[-*]\s$/, 'bullet'], [/^1\.\s$/, 'number'], [/^>>\s$/, 'toggle'], [/^>#\s$/, 'toggle-h1'], [/^>##\s$/, 'toggle-h2'], [/^>###\s$/, 'toggle-h3'],
  [/^"\s$/, 'quote'], [/^!\s$/, 'callout'], [/^```$/, 'code'], [/^\$\$$/, 'equation']
]

/** Blocks edited as a line of text. */
const TEXT_TYPES = new Set<BlockType>(['p', 'h1', 'h2', 'h3', 'todo', 'bullet', 'number', 'quote', 'callout', 'code', 'toggle', 'toggle-h1', 'toggle-h2', 'toggle-h3'])
const TOGGLES = new Set<BlockType>(['toggle', 'toggle-h1', 'toggle-h2', 'toggle-h3'])
/** Blocks with no text line of their own: a new empty line follows them when they are added. */
const OBJECT_TYPES = new Set<BlockType>(['divider', 'table', 'columns', 'tabs', 'database', 'toc', 'link', 'bookmark', 'image', 'embed'])

const DIVIDERS = [['line', 'Line'], ['dashed', 'Dashed'], ['dotted', 'Dotted'], ['thick', 'Thick'], ['fade', 'Fade'], ['space', 'Space only']] as const

/** Named colors for text and backgrounds; each theme has its own shade (--tc-* and --bc-* in styles.css). */
const COLOR_NAMES = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'] as const
const bgColor = (c?: string): string | undefined => (!c ? undefined : c.startsWith('#') ? `color-mix(in srgb, ${c} 16%, transparent)` : `var(--bc-${c})`)
const EMPTY: Block[] = []
const NONE: string[] = []

function ColorRows({ text, bg, onText, onBg }: { text?: string; bg?: string; onText: (c: string) => void; onBg: (c: string) => void }): JSX.Element {
  const name = (n: string): string => n[0].toUpperCase() + n.slice(1)
  return (
    <div className="color-rows">
      <div className="color-label">Text color</div>
      <div className="swatches">
        <button className={`tc-swatch ${!text ? 'active' : ''}`} title="Default" onClick={() => onText('')}>A</button>
        {COLOR_NAMES.map((n) => <button key={n} className={`tc-swatch ${text === n ? 'active' : ''}`} style={{ color: `var(--tc-${n})` }} title={name(n)} onClick={() => onText(n)}>A</button>)}
      </div>
      <div className="color-label">Background</div>
      <div className="swatches">
        <button className={`bc-swatch none ${!bg ? 'active' : ''}`} title="None" onClick={() => onBg('')} />
        {COLOR_NAMES.map((n) => <button key={n} className={`bc-swatch ${bg === n ? 'active' : ''}`} style={{ background: `var(--bc-${n})` }} title={name(n)} onClick={() => onBg(n)} />)}
      </div>
    </div>
  )
}

/** A copy with new ids, columns included. */
function cloneBlock(b: Block): Block {
  const c: Block = JSON.parse(JSON.stringify(b))
  const renew = (x: Block): void => { x.id = uid(); x.cols?.forEach((col) => col.forEach(renew)) }
  renew(c)
  return c
}

/** Where a block list lives: the page itself, or one column (or tab) of a block, at any depth. */
export interface ColumnRef { block: string; index: number }
const listOf = (p: Page | undefined, col?: ColumnRef): Block[] | undefined =>
  !p ? undefined : col ? findBlock(p.blocks, col.block)?.cols?.[col.index] : p.blocks

let movingBlocks: { pageId: string; ids: string[]; source?: ColumnRef } | null = null

function moveBlocks(pageId: string, targetId: string, targetCol: ColumnRef | undefined, before: boolean): void {
  const drag = movingBlocks
  movingBlocks = null
  if (!drag || drag.pageId !== pageId || drag.ids.includes(targetId)) return
  updatePage(pageId, page => {
    const from = listOf(page, drag.source)
    const to = listOf(page, targetCol)
    if (!from || !to || !to.some(b => b.id === targetId)) return
    const chosen = from.filter(b => drag.ids.includes(b.id))
    if (!chosen.length || (targetCol && findBlock(chosen, targetCol.block))) return
    for (const b of chosen) from.splice(from.indexOf(b), 1)
    to.splice(to.findIndex(b => b.id === targetId) + (before ? 0 : 1), 0, ...chosen)
    if (!from.length) from.push({ id: uid(), type: 'p', text: '' })
  })
  clearSelection()
}

const INLINE_COLORS = ['red', 'orange', 'green', 'blue', 'purple', 'gray']

const BlockRow = memo(function BlockRow({ render }: { b: Block; deps: string; render: () => JSX.Element }): JSX.Element { return render() }, (a, z) => a.b === z.b && a.deps === z.deps)

export function BlockEditor({ pageId, locked, col }: { pageId: string; locked?: boolean; col?: ColumnRef }): JSX.Element {
  const blocks = useData((d) => listOf(d.pages[pageId], col) ?? EMPTY)
  const spell = useData((d) => d.settings.spellcheck)
  const [slash, setSlash] = useState<{ id: string; el: HTMLElement; q: string } | null>(null)
  const [mention, setMention] = useState<MentionState | null>(null)
  const [handleMenu, setHandleMenu] = useState<{ id: string; el: HTMLElement } | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const selectionAnchor = useRef<string | null>(null)
  const [insertMenu, setInsertMenu] = useState<HTMLElement | null>(null)
  const selIds = useSelection((s) => (s.page === pageId && !col ? s.ids : NONE))
  /** A menu on a selected block acts on every selected block. */
  const targetsOf = (id: string): string[] => (selIds.length > 1 && selIds.includes(id) ? selIds : [id])
  /** The formatting bar over selected text. */
  const [fmt, setFmt] = useState<{ id: string; top: number; left: number } | null>(null)
  useEffect(() => {
    if (locked) return
    const onSel = (): void => {
      const el = document.activeElement as HTMLTextAreaElement | null
      if (!el || el.tagName !== 'TEXTAREA' || el.selectionStart === el.selectionEnd) { setFmt((f) => (f ? null : f)); return }
      const id = [...refs.entries()].find(([, x]) => x === el)?.[0]
      const b = id ? current().find((x) => x.id === id) : undefined
      if (!b || b.type === 'code' || !TEXT_TYPES.has(b.type)) { setFmt((f) => (f ? null : f)); return }
      const r = (el.closest('[data-block]') ?? el).getBoundingClientRect()
      setFmt({ id: b.id, top: r.top, left: r.left + 28 })
    }
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
  }, [locked, pageId])

  const edit = (fn: (b: Block[]) => void, key?: string): void => updatePage(pageId, (p) => { const l = listOf(p, col); if (l) fn(l) }, key)
  const setBlock = (id: string, fn: (b: Block) => void, key?: string): void =>
    edit((bs) => { const b = bs.find((x) => x.id === id); if (b) fn(b) }, key)
  const current = (): Block[] => listOf(getData().pages[pageId], col) ?? EMPTY

  /** Wraps the selected text in marks (or takes them off when they are already there). */
  const wrapSel = (id: string, open: string, close: string, select?: [number, number]): void => {
    const el = refs.get(id)
    const b = current().find((x) => x.id === id)
    if (!el || !b) return
    const s = el.selectionStart
    const e = el.selectionEnd
    const t = b.text
    let next: string
    let ns: number
    let ne: number
    if (t.slice(s - open.length, s) === open && t.slice(e, e + close.length) === close && open) {
      next = t.slice(0, s - open.length) + t.slice(s, e) + t.slice(e + close.length); ns = s - open.length; ne = e - open.length
    } else if (e - s >= open.length + close.length && t.slice(s, s + open.length) === open && t.slice(e - close.length, e) === close) {
      next = t.slice(0, s) + t.slice(s + open.length, e - close.length) + t.slice(e); ns = s; ne = e - open.length - close.length
    } else {
      next = t.slice(0, s) + open + t.slice(s, e) + close + t.slice(e); ns = s + open.length; ne = e + open.length
      if (select) { ns = e + open.length + select[0]; ne = e + open.length + select[1] }
    }
    setBlock(id, (x) => { x.text = next })
    requestAnimationFrame(() => { const el2 = refs.get(id); if (el2) { el2.focus(); el2.setSelectionRange(ns, ne) } })
  }
  /** Colors the selected text, or takes its color off. */
  const paintSel = (id: string, color: string | null, bg = false): void => {
    const el = refs.get(id)
    const b = current().find((x) => x.id === id)
    if (!el || !b) return
    const s = el.selectionStart
    const e = el.selectionEnd
    const t = b.text
    const tag = /\{([a-z]+(?:-bg)?)\|$/.exec(t.slice(Math.max(0, s - 16), s))
    let start = s
    let end = e
    let text = t
    if (tag && t[e] === '}') {
      text = t.slice(0, s - tag[0].length) + t.slice(s, e) + t.slice(e + 1); start = s - tag[0].length; end = e - tag[0].length
      if (!color || tag[1] === color + (bg ? '-bg' : '')) {
        setBlock(id, (x) => { x.text = text })
        requestAnimationFrame(() => { const el2 = refs.get(id); if (el2) { el2.focus(); el2.setSelectionRange(start, end) } })
        return
      }
    }
    if (!color) return
    const open = `{${color}${bg ? '-bg' : ''}|`
    const out = text.slice(0, start) + open + text.slice(start, end) + '}' + text.slice(end)
    setBlock(id, (x) => { x.text = out })
    requestAnimationFrame(() => { const el2 = refs.get(id); if (el2) { el2.focus(); el2.setSelectionRange(start + open.length, end + open.length) } })
  }
  const linkSel = (id: string): void => wrapSel(id, '[', '](https://)', [2, 10])

  const insertAfter = (id: string, block: Partial<Block> = {}): string => {
    const nb: Block = { id: uid(), type: 'p', text: '', ...block }
    edit((bs) => { const i = bs.findIndex((b) => b.id === id); bs.splice(i + 1, 0, nb) })
    if (TEXT_TYPES.has(nb.type)) focusBlock(nb.id, 'start')
    return nb.id
  }

  /** Puts the caret on the line after a block, adding an empty line when there is none. */
  const lineAfter = (id: string): void => {
    const bs = current()
    const next = bs[bs.findIndex((b) => b.id === id) + 1]
    if (next && next.type === 'p' && !next.text) focusBlock(next.id, 'start')
    else insertAfter(id)
  }

  const changeType = (id: string, type: BlockType, cols?: number): void => {
    const firstCol = uid()
    setBlock(id, (b) => {
      const was = b.text
      b.type = type
      if (OBJECT_TYPES.has(type) && type !== 'table') b.text = ''
      if (type === 'table' && !b.rows?.length) { b.rows = [[was, ''], ['', '']]; b.text = '' }
      if (type === 'columns') b.cols = Array.from({ length: cols ?? 2 }, (_, i) => [{ id: i === 0 ? firstCol : uid(), type: 'p' as BlockType, text: i === 0 ? was : '' }])
      if (type === 'tabs') { b.cols = [[{ id: firstCol, type: 'p' as BlockType, text: was }], [{ id: uid(), type: 'p' as BlockType, text: '' }]]; b.labels = ['', ''] }
      if (type === 'button' && !b.action) b.action = { kind: 'todos', target: '' }
    })
    if (type === 'columns' || type === 'tabs') { lineAfter(id); focusBlock(firstCol, 'end') }
    else if (OBJECT_TYPES.has(type)) lineAfter(id)
    else if (TEXT_TYPES.has(type)) focusBlock(id)
  }

  /** The + beside a block: a new line below (or above) with the block menu open. */
  const addNear = (id: string, above: boolean): void => {
    const nb: Block = { id: uid(), type: 'p', text: '/' }
    edit((bs) => { const i = bs.findIndex((x) => x.id === id); bs.splice(above ? i : i + 1, 0, nb) })
    clearSelection()
    focusBlock(nb.id, 'end')
    requestAnimationFrame(() => requestAnimationFrame(() => { const el = refs.get(nb.id); if (el) setSlash({ id: nb.id, el, q: '' }) }))
  }

  const applySlash = (id: string, s: SlashItem): void => {
    if (s.type === 'tool') {
      const tool = s.tool ? newPage(s.tool, undefined, pageId) : null
      let nextId = ''
      act(d => {
        const page = d.pages[pageId]
        const list = listOf(page, col)
        const at = list?.findIndex(b => b.id === id) ?? -1
        if (!page || !list || at < 0) return
        const line = list[at]
        const before = line.text.replace(/\/[^/]*$/, '')
        const block: Block = { id: uid(), type: 'tool', text: '', ref: tool?.id }
        const index = before ? at + 1 : at
        if (before) line.text = before
        list.splice(index, before ? 0 : 1, block)
        if (tool) { d.pages[tool.id] = tool; page.children.push(tool.id) }
        let next = list[index + 1]
        if (!next || next.type !== 'p' || next.text) {
          next = { id: uid(), type: 'p', text: '' }
          list.splice(index + 1, 0, next)
        }
        page.updatedAt = Date.now()
        nextId = next.id
      })
      if (tool && nextId) focusBlock(nextId, 'start')
      return
    }
    setBlock(id, (x) => { x.text = x.text.replace(/\/[^/]*$/, '') })
    changeType(id, s.type, s.cols)
  }

  const slashMatches = (q: string): SlashItem[] => {
    const ql = q.toLowerCase().trim()
    return SLASH.filter((s) => s.label.toLowerCase().includes(ql) || s.type.includes(ql) || s.keywords?.includes(ql))
  }

  const pickMention = (insert: string): void => {
    if (!mention) return
    const b = current().find((x) => x.id === mention.id)
    if (!b) return setMention(null)
    const el = refs.get(b.id)
    const caret = el?.selectionStart ?? b.text.length
    const before = b.text.slice(0, caret)
    let after = b.text.slice(caret)
    const at = mention.kind === '[[' ? before.lastIndexOf('[[') : before.lastIndexOf('@')
    if (at < 0) return setMention(null)
    if (mention.kind === '[[' && after.startsWith(']]')) after = after.slice(2)
    const text = before.slice(0, at) + insert + ' ' + after.replace(/^ /, '')
    setBlock(b.id, (x) => { x.text = text })
    focusBlock(b.id, at + insert.length + 1)
    setMention(null)
  }

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>, b: Block, idx: number): void => {
    const el = e.currentTarget
    if (mention && ['ArrowUp', 'ArrowDown', 'Enter', 'Escape', 'Tab'].includes(e.key)) {
      if (e.key === 'Escape') { e.preventDefault(); setMention(null) }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const first = mentionOptions(mention)[0]
        if (first) pickMention(first.insert); else setMention(null)
      }
      return
    }
    if (slash && ['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(e.key)) {
      if (e.key === 'Escape') setSlash(null)
      if (e.key === 'Enter') {
        e.preventDefault()
        const match = slashMatches(slash.q)[0]
        if (match) applySlash(b.id, match)
        setSlash(null)
      }
      return
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && b.type !== 'code' && !locked) {
      const k = e.key.toLowerCase()
      const sel = el.selectionStart !== el.selectionEnd
      const run = (fn: () => void): void => { e.preventDefault(); e.stopPropagation(); fn() }
      if (k === 'b' && !e.shiftKey) return run(() => wrapSel(b.id, '**', '**'))
      if (k === 'i' && !e.shiftKey) return run(() => wrapSel(b.id, '*', '*'))
      if (k === 'x' && e.shiftKey) return run(() => wrapSel(b.id, '~~', '~~'))
      if (k === 'e' && !e.shiftKey) return run(() => wrapSel(b.id, '`', '`'))
      if (k === 'h' && e.shiftKey) return run(() => paintSel(b.id, 'yellow', true))
      if (k === 'k' && sel) return run(() => linkSel(b.id))
    }
    if (e.key === 'Enter' && !e.shiftKey && b.type !== 'code') {
      e.preventDefault()
      const before = el.value.slice(0, el.selectionStart)
      const after = el.value.slice(el.selectionEnd)
      const listy = ['todo', 'bullet', 'number'].includes(b.type)
      if (listy && !el.value) { changeType(b.id, 'p'); return }
      setBlock(b.id, (x) => { x.text = before })
      insertAfter(b.id, { type: listy ? b.type : 'p', text: after, indent: TOGGLES.has(b.type) && b.open ? (b.indent ?? 0) + 1 : b.indent })
      return
    }
    if (e.key === 'Enter' && e.ctrlKey && b.type === 'todo') {
      e.preventDefault()
      setBlock(b.id, (x) => { x.checked = !x.checked })
      return
    }
    if (e.key === 'Backspace' && el.selectionStart === 0 && el.selectionEnd === 0) {
      if (b.indent) { e.preventDefault(); setBlock(b.id, (x) => { x.indent = Math.max(0, (x.indent ?? 0) - 1) }); return }
      if (b.type !== 'p') { e.preventDefault(); changeType(b.id, 'p'); return }
      if (idx > 0) {
        e.preventDefault()
        const prev = blocks[idx - 1]
        if (prev.type === 'divider') { edit((bs) => { bs.splice(idx - 1, 1) }); return }
        if (!refs.has(prev.id)) {
          // Nothing to join with (an image, a bookmark…): an empty line just goes away.
          if (!b.text) { edit((bs) => { bs.splice(idx, 1) }); if (blocks.length === 1) insertAfter(prev.id) }
          return
        }
        const pos = prev.text.length
        edit((bs) => {
          bs[idx - 1].text += b.text
          bs.splice(idx, 1)
        })
        focusBlock(prev.id, pos)
      }
      return
    }
    if (e.key === 'Tab' && ['todo', 'bullet', 'number', 'p'].includes(b.type)) {
      e.preventDefault()
      setBlock(b.id, (x) => { x.indent = Math.max(0, Math.min(4, (x.indent ?? 0) + (e.shiftKey ? -1 : 1))) })
      return
    }
    if (e.key === 'ArrowUp' && idx > 0 && !el.value.slice(0, el.selectionStart).includes('\n')) {
      let j = idx - 1
      while (j > 0 && !refs.has(blocks[j].id)) j--
      if (!refs.has(blocks[j].id)) return
      e.preventDefault()
      focusBlock(blocks[j].id, 'end')
      return
    }
    if (e.key === 'ArrowDown' && idx < blocks.length - 1 && !el.value.slice(el.selectionEnd).includes('\n')) {
      let j = idx + 1
      while (j < blocks.length - 1 && !refs.has(blocks[j].id)) j++
      if (!refs.has(blocks[j].id)) return
      e.preventDefault()
      focusBlock(blocks[j].id, 'start')
      return
    }
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      const to = e.key === 'ArrowUp' ? idx - 1 : idx + 1
      if (to < 0 || to >= blocks.length) return
      edit((bs) => { const [m] = bs.splice(idx, 1); bs.splice(to, 0, m) })
      focusBlock(b.id)
      return
    }
    if (e.ctrlKey && e.key.toLowerCase() === 'd') {
      e.preventDefault()
      insertAfter(b.id, cloneBlock(b))
    }
  }

  const onChange = (b: Block, v: string, el: HTMLTextAreaElement | null): void => {
    for (const [re, type] of SHORTCUTS) {
      if (re.test(v) && b.type === 'p') {
        setBlock(b.id, (x) => { x.type = type; x.text = '' })
        if (type === 'equation') setSlash(null)
        return
      }
    }
    if (v === '---' && b.type === 'p') { setBlock(b.id, (x) => { x.text = '' }); changeType(b.id, 'divider'); return }
    setBlock(b.id, (x) => { x.text = v }, 'type:' + b.id)
    const caret = el?.selectionStart ?? v.length
    const before = v.slice(0, caret)
    const m = before.match(/(?:^|\s)\/([\w ]*)$/)
    if (m && el && b.type !== 'code') setSlash({ id: b.id, el, q: m[1] })
    else if (slash) setSlash(null)
    const link = before.match(/\[\[([^\]\n]{0,60})$/)
    const at = before.match(/(?:^|\s)@([\w-]{0,24})$/)
    if (el && b.type !== 'code' && link) setMention({ id: b.id, el, q: link[1], kind: '[[' })
    else if (el && b.type !== 'code' && at) setMention({ id: b.id, el, q: at[1], kind: '@' })
    else if (mention) setMention(null)
  }

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>, b: Block): void => {
    const images = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'))
    if (images.length) {
      e.preventDefault()
      let after = b.id
      const empty = b.type === 'p' && !b.text
      images.forEach((f, i) => {
        const id = i === 0 && empty ? b.id : uid()
        if (!(i === 0 && empty)) { const prev = after; edit((bs) => { bs.splice(bs.findIndex((x) => x.id === prev) + 1, 0, { id, type: 'image', text: '' }) }) }
        else setBlock(b.id, (x) => { x.type = 'image'; x.text = '' })
        after = id
        imageFromFile(f).then((url) => setBlock(id, (x) => { x.url = url })).catch(() => toast('That file is not an image', { kind: 'error' }))
      })
      lineAfter(after)
      return
    }
    const ref = parseBlockLink(e.clipboardData.getData('text'))
    if (ref && b.type === 'p' && !b.text) {
      e.preventDefault()
      setBlock(b.id, (x) => { x.type = 'synced'; x.ref = ref })
      lineAfter(b.id)
    }
  }

  // Blocks nested under a closed toggle are hidden.
  const hidden = new Set<string>()
  let hideBelow: number | null = null
  for (const b of blocks) {
    const ind = b.indent ?? 0
    if (hideBelow !== null) {
      if (ind > hideBelow) { hidden.add(b.id); continue }
      hideBelow = null
    }
    if (TOGGLES.has(b.type) && !b.open) hideBelow = ind
  }

  const menuFor = (id: string): MenuItem[] => {
    const b = blocks.find((x) => x.id === id)
    if (!b) return []
    const items: MenuItem[] = [
      ...(targetsOf(id).length > 1 ? [{ label: `${targetsOf(id).length} blocks`, disabled: true }] : []),
      { label: 'Delete', icon: 'trash', danger: true, hint: 'Del', onClick: () => { const ts = new Set(targetsOf(id)); edit((bs) => { for (let i = bs.length - 1; i >= 0; i--) if (ts.has(bs[i].id)) bs.splice(i, 1); if (!bs.length) bs.push({ id: uid(), type: 'p', text: '' }) }); clearSelection() } },
      { label: 'Duplicate', icon: 'copy', hint: 'Ctrl D', onClick: () => { const ts = targetsOf(id); edit((bs) => { const picked = bs.filter((x) => ts.includes(x.id)); const last = Math.max(...picked.map((x) => bs.indexOf(x))); bs.splice(last + 1, 0, ...picked.map(cloneBlock)) }) } },
      { label: 'Insert below', icon: 'plus', onClick: () => insertAfter(id) }
    ]
    if (TEXT_TYPES.has(b.type) || b.type === 'divider') {
      items.push({ label: 'Copy as synced block', icon: 'refresh', onClick: () => { navigator.clipboard.writeText(blockLink(pageId, id)).then(() => toast('Synced block copied. Paste it on an empty line.', { icon: 'refresh' })).catch(() => {}) } })
    }
    if (b.type === 'divider') {
      items.push({ divider: true, label: '' }, ...DIVIDERS.map(([v, label]) => ({ label, checked: (b.style || 'line') === v, onClick: () => setBlock(id, (x) => { x.style = v === 'line' ? undefined : v }) })))
    }
    if (b.type === 'columns') {
      const n = b.cols?.length ?? 0
      items.push({ divider: true, label: '' },
        { label: 'Add a column', icon: 'plus', disabled: n >= 12, onClick: () => setBlock(id, (x) => { x.cols = [...(x.cols ?? []), [{ id: uid(), type: 'p', text: '' }]]; x.widths = undefined }) },
        { label: 'Remove last column', icon: 'minus', disabled: n <= 2, onClick: () => setBlock(id, (x) => { if (!x.cols || x.cols.length <= 2) return; const last = x.cols.pop()!; x.cols[x.cols.length - 1].push(...last.filter((y) => y.text || y.type !== 'p')); x.widths = undefined }) },
        { label: 'Even widths', icon: 'columns', disabled: !b.widths, onClick: () => setBlock(id, (x) => { x.widths = undefined }) },
        { label: 'Unwrap columns', icon: 'rows', onClick: () => edit((bs) => { const i = bs.findIndex((x) => x.id === id); const inner = (bs[i].cols ?? []).flat().filter((y) => y.text || y.type !== 'p'); bs.splice(i, 1, ...(inner.length ? inner : [{ id: uid(), type: 'p' as BlockType, text: '' }])) }) })
    }
    if (b.type === 'tabs') {
      items.push({ divider: true, label: '' },
        { label: 'Add a tab', icon: 'plus', onClick: () => setBlock(id, (x) => { x.cols = [...(x.cols ?? []), [{ id: uid(), type: 'p', text: '' }]]; x.labels = [...(x.labels ?? []), ''] }) },
        { label: 'Unwrap tabs', icon: 'rows', onClick: () => edit((bs) => {
          const i = bs.findIndex((x) => x.id === id)
          const t = bs[i]
          const inner: Block[] = []
          ;(t.cols ?? []).forEach((c, ci) => {
            const body = c.filter((y) => y.text || y.type !== 'p')
            if (!body.length) return
            inner.push({ id: uid(), type: 'h3', text: t.labels?.[ci] || `Tab ${ci + 1}` }, ...body)
          })
          bs.splice(i, 1, ...(inner.length ? inner : [{ id: uid(), type: 'p' as BlockType, text: '' }]))
        }) })
    }
    if ((b.type === 'image' || b.type === 'bookmark' || b.type === 'embed') && b.url) {
      items.push({ divider: true, label: '' }, { label: 'Change address', icon: 'link', onClick: () => setBlock(id, (x) => { x.url = undefined; x.meta = undefined }) })
      if (b.type === 'bookmark') items.push({ label: 'Show as embed', icon: 'embed', onClick: () => setBlock(id, (x) => { x.type = 'embed' }) })
      if (b.type === 'embed') items.push({ label: 'Show as bookmark', icon: 'bookmark', onClick: () => setBlock(id, (x) => { x.type = 'bookmark'; x.meta = undefined }) })
    }
    if (b.type === 'link' && b.ref) items.push({ divider: true, label: '' }, { label: 'Choose another page', icon: 'pageLink', onClick: () => setBlock(id, (x) => { x.ref = undefined }) })
    if (b.type === 'synced') items.push({ divider: true, label: '' }, { label: 'Turn into plain text', icon: 'type', onClick: () => {
      const [pg, bl] = (b.ref ?? '/').split('/')
      const src = getData().pages[pg]?.blocks
      const find = (list: Block[] | undefined): Block | undefined => { for (const y of list ?? []) { if (y.id === bl) return y; for (const c of y.cols ?? []) { const f = find(c); if (f) return f } } return undefined }
      const s = find(src)
      setBlock(id, (x) => { x.type = s && TEXT_TYPES.has(s.type) ? s.type : 'p'; x.text = s?.text ?? ''; x.ref = undefined })
    } })
    return items
  }

  const live = useRef({ onKey, onChange, onPaste, selIds })
  live.current = { onKey, onChange, onPaste, selIds }
  let num = 0
  return (
    <div className={`blocks ${locked ? 'locked' : ''} ${col ? 'nested' : ''}`}>
      {!col && !locked && <div className="insert-block-row">
        <button className="page-add" aria-haspopup="menu" onClick={e => setInsertMenu(e.currentTarget)}><Icon name="plus" size={14} />Insert block</button>
        {insertMenu && <Popover anchor={insertMenu} onClose={() => setInsertMenu(null)} width={242}>
          <Menu onClose={() => setInsertMenu(null)} items={SLASH.filter(item => ['tool', 'tabs', 'columns', 'database', 'button'].includes(item.type)).map(item => ({
            label: item.label, icon: item.icon, onClick: () => {
              const tail = current().at(-1)
              const id = tail?.type === 'p' && !tail.text ? tail.id : insertAfter(tail?.id ?? '')
              applySlash(id, item)
            }
          }))} />
        </Popover>}
      </div>}
      {blocks.map((b, idx) => {
        if (hidden.has(b.id)) return null
        num = b.type === 'number' ? num + 1 : 0
        const n = num
        // A row draws again only when its block or its place changes, so typing in one line of a
        // long page doesn't redraw every other line. Handlers read the editor's latest state.
        const deps = `${pageId}|${idx}|${n}|${locked ? 1 : 0}|${spell ? 1 : 0}|${dragOver?.slice(1) === b.id ? dragOver[0] : ''}|${selIds.includes(b.id) ? 1 : 0}|${blocks.length === 1 ? 1 : 0}`
        return <BlockRow key={b.id} b={b} deps={deps} render={() => {
        const set = (fn: (x: Block) => void, key?: string): void => setBlock(b.id, fn, key)
        const isToggle = TOGGLES.has(b.type)
        const headLevel = b.type.startsWith('toggle-h') ? b.type.slice(-2) : null
        const common = {
          value: b.text,
          spellCheck: spell,
          inputRef: (el: HTMLTextAreaElement | null) => { if (el) refs.set(b.id, el); else refs.delete(b.id) },
          onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => live.current.onKey(e, b, idx),
          onChange: (v: string) => live.current.onChange(b, v, refs.get(b.id) ?? null),
          onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => live.current.onPaste(e, b),
          placeholder: idx === 0 && blocks.length === 1 && !col ? '' : b.type.startsWith('h') || headLevel ? 'Heading' : b.type === 'p' ? '' : isToggle ? 'Toggle' : 'List item'
        }
        let content: JSX.Element
        switch (b.type) {
          case 'divider': content = <hr className={`hr-${b.style || 'line'}`} />; break
          case 'table': content = <TableBlock block={b} locked={locked} onEdit={(fn) => setBlock(b.id, (x) => { x.rows = x.rows?.length ? x.rows : [['']]; fn(x.rows) }, 'tbl:' + b.id)} />; break
          case 'toc': content = <TocBlock pageId={pageId} />; break
          case 'bookmark': content = <BookmarkBlock block={b} locked={locked} set={set} />; break
          case 'image': content = <ImageBlock block={b} locked={locked} set={set} />; break
          case 'embed': content = <EmbedBlock block={b} locked={locked} set={set} />; break
          case 'equation': content = <EquationBlock block={b} locked={locked} set={set} />; break
          case 'button': content = <ButtonBlock block={b} locked={locked} set={set} addTodos={(lines) => { let after = b.id; for (const t of lines) after = insertAfter(after, { type: 'todo', text: t, indent: b.indent }) }} />; break
          case 'link': content = <LinkBlock block={b} pageId={pageId} locked={locked} set={set} />; break
          case 'synced': content = <SyncedBlock block={b} locked={locked} />; break
          case 'tabs': content = <TabsBlock block={b} pageId={pageId} locked={locked} set={set} />; break
          case 'tool': content = <InlineTool block={b} pageId={pageId} locked={locked} onPick={ref => set(x => { x.ref = ref })} />; break
          case 'database': content = <InlineDatabase block={b} pageId={pageId} locked={locked} set={set} />; break
          case 'columns':
            content = (
              <div className="cols" style={{ gridTemplateColumns: b.widths && b.widths.length === b.cols?.length ? b.widths.map((w) => `minmax(130px, ${w}fr)`).join(' ') : `repeat(${b.cols?.length ?? 2}, minmax(130px, 1fr))` }}>
                {(b.cols ?? []).map((_, ci) => <div key={ci} className="col"><BlockEditor pageId={pageId} locked={locked} col={{ block: b.id, index: ci }} /></div>)}
              </div>
            )
            break
          default:
            content = (
              <div className="block-body">
                {b.type === 'todo' && <Checkbox color={b.iconColor} checked={!!b.checked} onChange={(v) => setBlock(b.id, (x) => { x.checked = v })} size={17} />}
                {b.type === 'bullet' && <span className="bullet">•</span>}
                {b.type === 'number' && <span className="numlabel">{n}.</span>}
                {isToggle && (
                  <button className={`toggle-arrow ${b.open ? 'open' : ''} ${headLevel ? 'toggle-arrow-' + headLevel : ''}`} onClick={() => setBlock(b.id, (x) => { x.open = !x.open })}><Icon name="chevron" size={13} stroke={2.4} /></button>
                )}
                {b.type === 'callout' && (
                  <span className="callout-icon">
                    {locked ? <Glyph value={b.icon || 'lightbulb'} size={16} /> : <IconPickerButton size="sm" value={b.icon || 'lightbulb'} onChange={(v) => setBlock(b.id, (x) => { x.icon = v || undefined })} />}
                  </span>
                )}
                <div className="block-text">
                  {b.type === 'code'
                    ? <AutoText className="bt bt-code" {...common} />
                    : <InlineText className={`bt bt-${headLevel ?? b.type} ${b.checked ? 'checked' : ''}`} locked={locked} {...common} />}
                  {isToggle && b.open && (
                    <AutoText className="bt toggle-body" value={b.body ?? ''} placeholder="Empty toggle. Click to write." onChange={(v) => setBlock(b.id, (x) => { x.body = v }, 'body:' + b.id)} />
                  )}
                </div>
              </div>
            )
        }
        return (
          <div
            key={b.id}
            data-block={b.id}
            className={`block block-${b.type} ${headLevel ? 'block-' + headLevel : ''} ${dragOver?.slice(1) === b.id ? (dragOver[0] === '<' ? 'drop-above' : 'drop-below') : ''} ${selIds.includes(b.id) ? 'selected' : ''} ${b.bg ? 'has-bg' : ''}`}
            style={{ paddingLeft: 28 + (b.indent ?? 0) * 24, color: blockTextColor(b.color), ['--ind' as string]: (b.indent ?? 0) * 24 + 'px', ['--bgc' as string]: bgColor(b.bg) }}
            onDragOver={e => {
              if (locked || movingBlocks?.pageId !== pageId) return
              e.preventDefault(); e.stopPropagation()
              const box = e.currentTarget.getBoundingClientRect()
              setDragOver((e.clientY < box.top + box.height / 2 ? '<' : '>') + b.id)
            }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(null) }}
            onDrop={e => {
              if (locked || movingBlocks?.pageId !== pageId) return
              e.preventDefault(); e.stopPropagation()
              const box = e.currentTarget.getBoundingClientRect()
              moveBlocks(pageId, b.id, col, e.clientY < box.top + box.height / 2)
              setDragOver(null)
            }}
          >
            {!locked && (
              <div className="block-gutter">
                <button className="gutter-btn" title="Add a block below (Alt: above)" onClick={(e) => addNear(b.id, e.altKey)}><Icon name="plus" size={15} stroke={2} /></button>
                <button className="gutter-btn block-handle" draggable onDragStart={e => {
                  e.stopPropagation()
                  movingBlocks = { pageId, source: col, ids: live.current.selIds.includes(b.id) ? live.current.selIds : [b.id] }
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('application/x-deskbase-block', b.id)
                }} onDragEnd={() => { movingBlocks = null; setDragOver(null) }} onClick={e => {
                  if (!col && (e.shiftKey || e.ctrlKey || e.metaKey)) {
                    const ids = current().map(x => x.id)
                    const anchor = ids.indexOf(selectionAnchor.current ?? b.id)
                    const at = ids.indexOf(b.id)
                    const old = live.current.selIds
                    const next = e.shiftKey ? ids.slice(Math.max(0, Math.min(at, anchor)), Math.max(at, anchor) + 1) : old.includes(b.id) ? old.filter(x => x !== b.id) : [...old, b.id]
                    useSelection.setState({ page: pageId, ids: next })
                    if (!e.shiftKey) selectionAnchor.current = b.id
                  } else { selectionAnchor.current = b.id; setHandleMenu({ id: b.id, el: e.currentTarget }) }
                }} title="Block options · drag to move · Shift or Ctrl to select">
                  <Icon name="grip" size={15} stroke={2.4} />
                </button>
              </div>
            )}
            <div className="block-main">{content}</div>
          </div>
        )
        }} />
      })}
      {!locked && <div className="blocks-tail" onClick={() => {
        const last = blocks[blocks.length - 1]
        if (!last || last.text || last.type !== 'p') insertAfter(last?.id ?? '')
        else focusBlock(last.id)
      }} />}

      {slash && (
        <Popover anchor={slash.el} onClose={() => setSlash(null)} width={250}>
          <div className="slash-menu">
            <Menu
              onClose={() => setSlash(null)}
              items={slashMatches(slash.q).map((s) => ({ label: s.label, icon: s.icon, hint: s.hint, onClick: () => applySlash(slash.id, s) }))}
            />
          </div>
        </Popover>
      )}
      {fmt && !locked && !slash && !mention && (
        createPortal(
        <div className="fmt-bar" style={{ top: Math.max(8, fmt.top - 42), left: Math.max(8, fmt.left) }} onMouseDown={(e) => e.preventDefault()}>
          <button title="Bold (Ctrl B)" onClick={() => wrapSel(fmt.id, '**', '**')}><Icon name="bold" size={14} /></button>
          <button title="Italic (Ctrl I)" onClick={() => wrapSel(fmt.id, '*', '*')}><Icon name="italic" size={14} /></button>
          <button title="Strike-through (Ctrl Shift X)" onClick={() => wrapSel(fmt.id, '~~', '~~')}><s className="fmt-s">S</s></button>
          <button title="Code (Ctrl E)" onClick={() => wrapSel(fmt.id, '`', '`')}><Icon name="code" size={14} /></button>
          <button title="Link (Ctrl K)" onClick={() => linkSel(fmt.id)}><Icon name="link" size={14} /></button>
          <span className="fmt-sep" />
          {INLINE_COLORS.map((c) => <button key={c} className="fmt-color" title={c[0].toUpperCase() + c.slice(1)} onClick={() => paintSel(fmt.id, c)}><span style={{ color: `var(--tc-${c})` }}>A</span></button>)}
          <button className="fmt-color" title="Highlight (Ctrl Shift H)" onClick={() => paintSel(fmt.id, 'yellow', true)}><span className="fmt-hl">A</span></button>
          <button title="No color" onClick={() => paintSel(fmt.id, null)}><Icon name="x" size={13} /></button>
        </div>,
        document.body)
      )}
      {mention && mentionOptions(mention).length > 0 && (
        <Popover anchor={mention.el} onClose={() => setMention(null)} width={260}>
          <Menu onClose={() => setMention(null)} items={mentionOptions(mention).map((o) => ({ label: o.label, icon: o.icon, hint: o.hint, onClick: () => pickMention(o.insert) }))} />
        </Popover>
      )}
      {handleMenu && (
        <Popover anchor={handleMenu.el} onClose={() => setHandleMenu(null)} width={230}>
          <Menu onClose={() => setHandleMenu(null)} items={menuFor(handleMenu.id)} />
          {(() => {
            const b = blocks.find((x) => x.id === handleMenu.id)
            if (!b) return null
            const ts = new Set(targetsOf(b.id))
            const paint = (fn: (x: Block) => void): void => edit((bs) => { for (const x of bs) if (ts.has(x.id)) fn(x) })
            return <>
              {TEXT_TYPES.has(b.type) && (
                <div className="turn-into">
                  <div className="color-label">Turn into</div>
                  <div className="turn-grid">
                    {SLASH.filter((s) => TEXT_TYPES.has(s.type)).map((s) => (
                      <button key={s.label} className={`turn-btn ${s.type === b.type ? 'active' : ''}`} title={s.label} onClick={() => { [...ts].forEach((t) => changeType(t, s.type)); setHandleMenu(null) }}>
                        <Icon name={s.icon} size={15} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {b.type === 'todo' && <div className="color-rows">
                <div className="color-label">Checkbox icon</div>
                <OptionalColor label="To-do icon color" value={b.iconColor} onChange={color => paint(x => { if (x.type === 'todo') x.iconColor = color })} />
              </div>}
              <ColorRows text={b.color} bg={b.bg} onText={(c) => paint((x) => { x.color = c || undefined })} onBg={(c) => paint((x) => { x.bg = c || undefined })} />
            </>
          })()}
        </Popover>
      )}
    </div>
  )
}

function InlineTool({ block, pageId, locked, onPick }: { block: Block; pageId: string; locked?: boolean; onPick: (id: string) => void }): JSX.Element {
  const target = useData(d => block.ref ? d.pages[block.ref] : undefined)
  if (!target || target.deletedAt || target.type === 'doc' || target.id === pageId) {
    return <section className="inline-tool tool-picker">
      <strong>{block.ref ? 'Tool unavailable' : 'Choose an existing tool'}</strong>
      {!locked && <PagePicker exclude={pageId} toolsOnly onPick={onPick} />}
    </section>
  }
  const info = typeInfo(target.type)
  return <section className="inline-tool" aria-label={target.title || info.name}>
    <header className="inline-tool-head">
      <Glyph value={target.icon || info.icon} size={17} color={target.iconColor} />
      <strong>{target.title || info.name}</strong>
      <button className="icon-btn" title="Open as a page" aria-label={'Open ' + (target.title || info.name) + ' as a page'}
        onClick={e => openFromClick(target.id, e)} onAuxClick={e => { if (e.button === 1) openFromClick(target.id, e) }}><Icon name="pageLink" size={15} /></button>
    </header>
    <div className="inline-tool-body"><ToolBody key={target.id} page={target} embedded /></div>
  </section>
}

/** A database shown right in the page, like Notion's inline databases. */
function InlineDatabase({ block, pageId, locked, set }: { block: Block; pageId: string; locked?: boolean; set: (fn: (b: Block) => void, key?: string) => void }): JSX.Element {
  const target = useData((d) => (block.ref ? d.pages[block.ref] : undefined))
  const dbs = useData((d) => Object.values(d.pages).filter((p) => p.type === 'database' && !p.deletedAt && p.id !== pageId).length)
  const [picking, setPicking] = useState(false)
  if (!block.ref || !target || target.deletedAt || target.type !== 'database') {
    if (locked) return <div />
    const make = (): void => {
      const db = newPage('database', 'Untitled database', pageId)
      act((d) => { d.pages[db.id] = db; d.pages[pageId]?.children.push(db.id) })
      set((b) => { b.ref = db.id })
    }
    return (
      <div className="block-empty">
        <Icon name="database" size={16} />
        <span>{block.ref ? 'This database was deleted' : 'Database'}</span>
        <Button small onClick={make}>New database</Button>
        {dbs > 0 && <Button small kind="ghost" onClick={() => setPicking((v) => !v)}>Show an existing one</Button>}
        {picking && <PagePicker exclude={pageId} only="database" onPick={(id) => set((b) => { b.ref = id })} />}
      </div>
    )
  }
  return (
    <div className="inline-db">
      <button className="inline-db-title" onClick={(e) => openFromClick(target.id, e)}>
        <Glyph value={target.icon || 'database'} size={17} color={target.iconColor || undefined} />
        <span>{target.title || 'Untitled'}</span>
      </button>
      <DatabaseView dbId={target.id} embedded />
    </div>
  )
}

/** Notion-style tabs: each tab holds its own blocks. Double-click a tab to rename it, right-click for more. */
function TabsBlock({ block, pageId, locked, set }: { block: Block; pageId: string; locked?: boolean; set: (fn: (b: Block) => void, key?: string) => void }): JSX.Element {
  const [active, setActive] = useState(0)
  const [renaming, setRenaming] = useState<number | null>(null)
  const [menu, setMenu] = useState<{ i: number; x: number; y: number } | null>(null)
  const n = Math.max(1, block.cols?.length ?? 1)
  const at = Math.min(active, n - 1)
  const draggedTab = useRef<number | null>(null)
  const labels = block.labels ?? []
  const name = (i: number): string => labels[i] || `Tab ${i + 1}`
  const move = (i: number, to: number): void => {
    if (to < 0 || to >= n) return
    set((x) => {
      const cols = x.cols ?? []
      const ls = x.labels ?? cols.map(() => '')
      ;[cols[i], cols[to]] = [cols[to], cols[i]]
      ;[ls[i], ls[to]] = [ls[to], ls[i]]
      x.labels = ls
    })
    setActive(to)
  }
  return (
    <div className="tabs-block">
      <div className="tabs-bar" role="tablist">
        {Array.from({ length: n }, (_, i) => (renaming === i && !locked ? (
          <input key={i} className="tabs-input" autoFocus value={labels[i] ?? ''} placeholder={`Tab ${i + 1}`}
            onChange={(e) => set((x) => { const ls = x.labels ?? []; while (ls.length < n) ls.push(''); ls[i] = e.target.value; x.labels = ls }, 'tabname:' + block.id)}
            onBlur={() => setRenaming(null)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setRenaming(null) }} />
        ) : (
          <button key={i} role="tab" aria-selected={i === at} className={`tabs-tab ${i === at ? 'active' : ''}`}
            draggable={!locked} onDragStart={e => {
              e.stopPropagation(); draggedTab.current = i; e.dataTransfer.setData('application/x-deskbase-tab', block.id); e.dataTransfer.effectAllowed = 'move'
            }} onDragEnd={() => { draggedTab.current = null }} onDragOver={e => {
              if (draggedTab.current !== null) { e.preventDefault(); e.stopPropagation() }
            }} onDrop={e => {
              if (locked || draggedTab.current === null) return
              e.preventDefault(); e.stopPropagation(); move(draggedTab.current, i); draggedTab.current = null
            }}
            onDragEnter={() => { if (movingBlocks?.pageId === pageId) setActive(i) }} onClick={() => setActive(i)} onDoubleClick={() => !locked && setRenaming(i)}
            onContextMenu={(e) => { if (locked) return; e.preventDefault(); setMenu({ i, x: e.clientX, y: e.clientY }) }}>
            {name(i)}
          </button>
        )))}
        {!locked && (
          <button className="tabs-add" title="Add a tab" onClick={() => { set((x) => { x.cols = [...(x.cols ?? []), [{ id: uid(), type: 'p', text: '' }]]; x.labels = [...(x.labels ?? []), ''] }); setActive(n); setRenaming(n) }}>
            <Icon name="plus" size={13} stroke={2} />
          </button>
        )}
      </div>
      <div className="tabs-body">
        <BlockEditor key={at} pageId={pageId} locked={locked} col={{ block: block.id, index: at }} />
      </div>
      {menu && (
        <Popover anchor={menu} onClose={() => setMenu(null)} width={200}>
          <Menu onClose={() => setMenu(null)} items={[
            { label: 'Rename', icon: 'edit', onClick: () => setRenaming(menu.i) },
            { label: 'Move left', icon: 'left', disabled: menu.i === 0, onClick: () => move(menu.i, menu.i - 1) },
            { label: 'Move right', icon: 'right', disabled: menu.i >= n - 1, onClick: () => move(menu.i, menu.i + 1) },
            { divider: true, label: '' },
            { label: 'Delete tab', icon: 'trash', danger: true, disabled: n <= 1, onClick: () => { set((x) => { x.cols?.splice(menu.i, 1); x.labels?.splice(menu.i, 1) }); setActive(Math.max(0, menu.i - 1)) } }
          ]} />
        </Popover>
      )}
    </div>
  )
}

function TableBlock({ block, locked, onEdit }: { block: Block; locked?: boolean; onEdit: (fn: (rows: string[][]) => void) => void }): JSX.Element {
  const rows = block.rows?.length ? block.rows : [['']]
  const width = Math.max(1, ...rows.map((r) => r.length))
  const pad = (r: string[]): string[] => [...r, ...Array(width - r.length).fill('')]
  const fix = (rs: string[][]): void => { rs.forEach((r, i) => { if (r.length < width) rs[i] = pad(r) }) }
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className={ri === 0 ? 'tbl-head' : ''}>
              {pad(r).map((c, ci) => (
                <td key={ci}>
                  <AutoText className="tbl-cell" value={c} onChange={(v) => onEdit((rs) => { fix(rs); rs[ri][ci] = v })} />
                </td>
              ))}
              {!locked && <td className="tbl-x"><button title="Delete row" onClick={() => onEdit((rs) => { if (rs.length > 1) rs.splice(ri, 1) })}><Icon name="x" size={11} /></button></td>}
            </tr>
          ))}
        </tbody>
      </table>
      {!locked && (
        <div className="tbl-tools">
          <button onClick={() => onEdit((rs) => { fix(rs); rs.push(Array(width).fill('')) })}><Icon name="plus" size={12} /> Row</button>
          <button onClick={() => onEdit((rs) => { fix(rs); rs.forEach((r) => r.push('')) })}><Icon name="plus" size={12} /> Column</button>
          {width > 1 && <button onClick={() => onEdit((rs) => { fix(rs); rs.forEach((r) => r.pop()) })}><Icon name="minus" size={12} /> Column</button>}
        </div>
      )}
    </div>
  )
}

/** Elements a selection box never starts on: text, controls and embedded content. */
const NO_BOX = 'textarea, input, select, button, a, iframe, img, label, [role="link"], .rich, .page-top, .page-cover, .subpages, .tbl-wrap, .embed, .img-block, .bookmark, .equation-out, .block-gutter, .inline-tool, .inline-db, .backlinks, .synced-from, .page-link, .check, .page-picker, .popover, .modal, .row-props'

/** Hold the mouse on an empty part of the page and drag: a box selects the blocks it touches. */
function useBlockSelection(pageId: string, root: React.RefObject<HTMLDivElement>, locked?: boolean): { x: number; y: number; w: number; h: number } | null {
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  useEffect(() => {
    const doc = root.current
    const scroller = doc?.closest<HTMLElement>('.scroll')
    if (!doc || !scroller) return
    let start: { x: number; y: number; top: number } | null = null
    let active = false
    let last = { x: 0, y: 0 }
    let raf = 0
    let eatClick = false
    const edit = (fn: (bs: Block[]) => void): void => updatePage(pageId, (p) => fn(p.blocks))
    const select = (ids: string[]): void => {
      const cur = useSelection.getState()
      if (cur.page !== pageId || cur.ids.join() !== ids.join()) useSelection.setState({ page: pageId, ids })
    }
    const update = (): void => {
      if (!start) return
      const sy = start.y - (scroller.scrollTop - start.top)
      const x1 = Math.min(start.x, last.x), x2 = Math.max(start.x, last.x)
      const y1 = Math.min(sy, last.y), y2 = Math.max(sy, last.y)
      setBox({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 })
      const els = [...doc.querySelectorAll<HTMLElement>(':scope > .blocks > .block')]
      select(els.filter((el) => { const r = el.getBoundingClientRect(); return r.bottom > y1 && r.top < y2 && r.right > x1 && r.left < x2 }).map((el) => el.dataset.block!))
    }
    // Near the top or bottom edge the page scrolls while the box is dragged.
    const tick = (): void => {
      if (!active) return
      const r = scroller.getBoundingClientRect()
      const edge = 46
      const v = last.y < r.top + edge ? -Math.ceil((r.top + edge - last.y) / 3) : last.y > r.bottom - edge ? Math.ceil((last.y - r.bottom + edge) / 3) : 0
      if (v) { scroller.scrollTop += v; update() }
      raf = requestAnimationFrame(tick)
    }
    const down = (e: MouseEvent): void => {
      if (e.defaultPrevented) return
      if (e.button !== 0) return
      const t = e.target as HTMLElement
      if (!scroller.contains(t) || t.closest('.popover, .modal')) return
      if (t === scroller && e.offsetX >= scroller.clientWidth) return // the scrollbar
      if (t.closest(NO_BOX)) { if (!t.closest('.block-gutter')) clearSelection(); return }
      clearSelection()
      start = { x: e.clientX, y: e.clientY, top: scroller.scrollTop }
      last = { x: e.clientX, y: e.clientY }
      e.preventDefault()
    }
    const move = (e: MouseEvent): void => {
      if (!start) return
      last = { x: e.clientX, y: e.clientY }
      if (!active && Math.hypot(last.x - start.x, last.y - start.y) > 5) {
        active = true
        ;(document.activeElement as HTMLElement | null)?.blur?.()
        raf = requestAnimationFrame(tick)
      }
      if (active) update()
    }
    const up = (): void => {
      if (active) eatClick = true
      start = null
      active = false
      cancelAnimationFrame(raf)
      setBox(null)
    }
    const click = (e: MouseEvent): void => { if (eatClick) { eatClick = false; e.stopPropagation(); e.preventDefault() } }
    const key = (e: KeyboardEvent): void => {
      if (useApp.getState().overlay || (e.target as HTMLElement)?.closest?.('.inline-tool, .popover, .modal')) return
      const typing = !!(e.target as HTMLElement)?.closest?.('input, textarea, select, [contenteditable]')
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      const blocks = getData().pages[pageId]?.blocks ?? []
      if (mod && k === 'a' && !typing) { e.preventDefault(); select(blocks.map((b) => b.id)); return }
      const sel = useSelection.getState()
      if (sel.page !== pageId || !sel.ids.length || typing) return
      const ids = new Set(sel.ids)
      const picked = blocks.filter((b) => ids.has(b.id))
      const remove = (): void => { edit((bs) => { for (let i = bs.length - 1; i >= 0; i--) if (ids.has(bs[i].id)) bs.splice(i, 1); if (!bs.length) bs.push({ id: uid(), type: 'p', text: '' }) }); clearSelection() }
      if (e.altKey && !locked && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault()
        edit(bs => {
          const up = e.key === 'ArrowUp'
          const order = up ? [...bs] : [...bs].reverse()
          for (const block of order) {
            if (!ids.has(block.id)) continue
            const at = bs.indexOf(block), next = at + (up ? -1 : 1)
            if (bs[next] && !ids.has(bs[next].id)) [bs[next], bs[at]] = [bs[at], bs[next]]
          }
        })
      } else if (e.key === 'Escape') { e.preventDefault(); clearSelection() }
      else if ((e.key === 'Backspace' || e.key === 'Delete') && !locked) { e.preventDefault(); remove() }
      else if (mod && (k === 'c' || k === 'x')) {
        e.preventDefault()
        navigator.clipboard.writeText(blocksToText(picked)).catch(() => {})
        if (k === 'x' && !locked) remove()
      } else if (mod && k === 'd' && !locked) {
        e.preventDefault()
        const copies = picked.map(cloneBlock)
        edit((bs) => { const lastIdx = Math.max(...picked.map((p) => bs.findIndex((x) => x.id === p.id))); bs.splice(lastIdx + 1, 0, ...copies) })
        select(copies.map((c) => c.id))
      } else if (e.key === 'Tab' && !locked) {
        e.preventDefault()
        edit((bs) => { for (const b of bs) if (ids.has(b.id) && ['p', 'todo', 'bullet', 'number'].includes(b.type)) b.indent = Math.max(0, Math.min(4, (b.indent ?? 0) + (e.shiftKey ? -1 : 1))) })
      } else if (e.key === 'Enter') {
        e.preventDefault()
        clearSelection()
        if (picked[0]) focusBlock(picked[0].id)
      } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !mod) {
        e.preventDefault()
        const idx = blocks.map((b) => b.id)
        const ends = picked.map((p) => idx.indexOf(p.id))
        const at = e.key === 'ArrowUp' ? Math.max(0, Math.min(...ends) - 1) : Math.min(idx.length - 1, Math.max(...ends) + 1)
        if (e.shiftKey) select(idx.slice(Math.min(at, ...ends), Math.max(at, ...ends) + 1))
        else select([idx[at]])
      }
    }
    window.addEventListener('mousedown', down)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    window.addEventListener('click', click, true)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('mousedown', down)
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      window.removeEventListener('click', click, true)
      window.removeEventListener('keydown', key)
      cancelAnimationFrame(raf)
      clearSelection()
    }
  }, [pageId, locked])
  return box
}

export function DocPage({ pageId }: { pageId: string }): JSX.Element {
  const locked = useData((d) => d.pages[pageId]?.locked)
  const root = useRef<HTMLDivElement>(null)
  const box = useBlockSelection(pageId, root, locked)
  const words = useData((d) => (d.pages[pageId]?.blocks ?? []).reduce((a, b) => a + (b.text.trim() ? b.text.trim().split(/\s+/).length : 0), 0))
  useEffect(() => {
    // Focus the first block of a fresh empty page.
    const page = (window as any).__lastCreated
    if (page === pageId) {
      const first = document.querySelector<HTMLTextAreaElement>('.blocks textarea')
      first?.focus()
    }
  }, [pageId])
  return (
    <div className="doc" ref={root}>
      <BlockEditor pageId={pageId} locked={locked} />
      {words > 0 && <div className="doc-foot">{words} {words === 1 ? 'word' : 'words'}</div>}
      {box && createPortal(<div className="select-box" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />, document.body)}
    </div>
  )
}

export function clearChecked(pageId: string): void {
  act((d) => { const p = d.pages[pageId]; if (p) p.blocks = p.blocks.filter((b) => !(b.type === 'todo' && b.checked)) })
}
