import { useEffect, useRef, useState } from 'react'
import { act, updatePage, useData } from '../store'
import type { Block, BlockType } from '../types'
import { uid } from '../lib/util'
import { AutoText, Checkbox, Menu, Popover } from '../components/ui'
import { Icon } from '../components/Icon'

const SLASH: { type: BlockType; label: string; icon: string; hint: string }[] = [
  { type: 'p', label: 'Text', icon: 'type', hint: '' },
  { type: 'h1', label: 'Heading 1', icon: 'heading-1', hint: '#' },
  { type: 'h2', label: 'Heading 2', icon: 'heading-2', hint: '##' },
  { type: 'h3', label: 'Heading 3', icon: 'heading-3', hint: '###' },
  { type: 'todo', label: 'To-do', icon: 'square-check-big', hint: '[]' },
  { type: 'bullet', label: 'Bulleted list', icon: 'list', hint: '-' },
  { type: 'number', label: 'Numbered list', icon: 'list-ordered', hint: '1.' },
  { type: 'toggle', label: 'Toggle', icon: 'list-collapse', hint: '>>' },
  { type: 'quote', label: 'Quote', icon: 'quote', hint: '"' },
  { type: 'callout', label: 'Callout', icon: 'lightbulb', hint: '!' },
  { type: 'code', label: 'Code', icon: 'code', hint: '```' },
  { type: 'divider', label: 'Divider', icon: 'minus', hint: '---' },
  { type: 'table', label: 'Table', icon: 'table', hint: '' }
]

const SHORTCUTS: [RegExp, BlockType][] = [
  [/^#\s$/, 'h1'], [/^##\s$/, 'h2'], [/^###\s$/, 'h3'], [/^\[\]\s$/, 'todo'], [/^\[ \]\s$/, 'todo'],
  [/^[-*]\s$/, 'bullet'], [/^1\.\s$/, 'number'], [/^>>\s$/, 'toggle'], [/^"\s$/, 'quote'], [/^!\s$/, 'callout'], [/^```$/, 'code']
]

const BLOCK_COLORS = ['', '#ff453a', '#ff9f0a', '#e5b000', '#30d158', '#0a84ff', '#bf5af2', '#8e8e93']

const refs = new Map<string, HTMLTextAreaElement>()
function focusBlock(id: string, at: 'start' | 'end' | number = 'end'): void {
  requestAnimationFrame(() => {
    const el = refs.get(id)
    if (!el) return
    el.focus()
    const pos = at === 'start' ? 0 : at === 'end' ? el.value.length : at
    el.setSelectionRange(pos, pos)
  })
}

export function BlockEditor({ pageId, locked }: { pageId: string; locked?: boolean }): JSX.Element {
  const blocks = useData((d) => d.pages[pageId]?.blocks ?? [])
  const spell = useData((d) => d.settings.spellcheck)
  const [slash, setSlash] = useState<{ id: string; el: HTMLElement; q: string } | null>(null)
  const [handleMenu, setHandleMenu] = useState<{ id: string; el: HTMLElement } | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const dragRef = useRef<string | null>(null)

  const edit = (fn: (b: Block[]) => void, key?: string): void => updatePage(pageId, (p) => fn(p.blocks), key)
  const setBlock = (id: string, fn: (b: Block) => void, key?: string): void =>
    edit((bs) => { const b = bs.find((x) => x.id === id); if (b) fn(b) }, key)

  const insertAfter = (id: string, block: Partial<Block> = {}): string => {
    const nb: Block = { id: uid(), type: 'p', text: '', ...block }
    edit((bs) => { const i = bs.findIndex((b) => b.id === id); bs.splice(i + 1, 0, nb) })
    focusBlock(nb.id, 'start')
    return nb.id
  }

  const changeType = (id: string, type: BlockType): void => {
    setBlock(id, (b) => {
      b.type = type
      if (type === 'divider') b.text = ''
      if (type === 'table' && !b.rows?.length) b.rows = [[b.text, ''], ['', '']]
    })
    if (type === 'divider') insertAfter(id)
    else focusBlock(id)
  }

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>, b: Block, idx: number): void => {
    const el = e.currentTarget
    if (slash && ['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(e.key)) {
      if (e.key === 'Escape') setSlash(null)
      if (e.key === 'Enter') {
        e.preventDefault()
        const match = SLASH.filter((s) => s.label.toLowerCase().includes(slash.q.toLowerCase()))[0]
        if (match) {
          setBlock(b.id, (x) => { x.text = x.text.replace(/\/[^/]*$/, '') })
          changeType(b.id, match.type)
        }
        setSlash(null)
      }
      return
    }
    if (e.key === 'Enter' && !e.shiftKey && b.type !== 'code') {
      e.preventDefault()
      const before = el.value.slice(0, el.selectionStart)
      const after = el.value.slice(el.selectionEnd)
      const listy = ['todo', 'bullet', 'number'].includes(b.type)
      if (listy && !el.value) { changeType(b.id, 'p'); return }
      setBlock(b.id, (x) => { x.text = before })
      insertAfter(b.id, { type: listy ? b.type : 'p', text: after, indent: b.indent })
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
      e.preventDefault()
      let j = idx - 1
      while (j > 0 && blocks[j].type === 'divider') j--
      focusBlock(blocks[j].id, 'end')
      return
    }
    if (e.key === 'ArrowDown' && idx < blocks.length - 1 && !el.value.slice(el.selectionEnd).includes('\n')) {
      e.preventDefault()
      let j = idx + 1
      while (j < blocks.length - 1 && blocks[j].type === 'divider') j++
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
      insertAfter(b.id, { ...b, id: uid() })
    }
  }

  const onChange = (b: Block, v: string, el: HTMLTextAreaElement | null): void => {
    for (const [re, type] of SHORTCUTS) {
      if (re.test(v) && b.type === 'p') {
        setBlock(b.id, (x) => { x.type = type; x.text = '' })
        return
      }
    }
    if (v === '---' && b.type === 'p') { changeType(b.id, 'divider'); setBlock(b.id, (x) => { x.text = '' }); return }
    setBlock(b.id, (x) => { x.text = v }, 'type:' + b.id)
    const m = v.match(/(?:^|\s)\/([\w ]*)$/)
    if (m && el) setSlash({ id: b.id, el, q: m[1] })
    else if (slash) setSlash(null)
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
    if (b.type === 'toggle' && !b.open) hideBelow = ind
  }

  let num = 0
  return (
    <div className={`blocks ${locked ? 'locked' : ''}`}>
      {blocks.map((b, idx) => {
        if (hidden.has(b.id)) return null
        num = b.type === 'number' ? num + 1 : 0
        const common = {
          value: b.text,
          spellCheck: spell,
          inputRef: (el: HTMLTextAreaElement | null) => { if (el) refs.set(b.id, el); else refs.delete(b.id) },
          onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => onKey(e, b, idx),
          onChange: (v: string) => onChange(b, v, refs.get(b.id) ?? null),
          placeholder: idx === 0 && blocks.length === 1 ? 'Start writing, or press / for blocks' : b.type.startsWith('h') ? 'Heading' : b.type === 'p' ? '' : 'List item'
        }
        return (
          <div
            key={b.id}
            className={`block block-${b.type} ${dragOver === b.id ? 'drag-over' : ''}`}
            style={{ paddingLeft: (b.indent ?? 0) * 24, color: b.color || undefined }}
            onDragOver={(e) => { if (dragRef.current) { e.preventDefault(); setDragOver(b.id) } }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(null)
              const from = dragRef.current
              dragRef.current = null
              if (!from || from === b.id) return
              edit((bs) => {
                const fi = bs.findIndex((x) => x.id === from)
                const [m] = bs.splice(fi, 1)
                const ti = bs.findIndex((x) => x.id === b.id)
                bs.splice(ti + 1, 0, m)
              })
            }}
          >
            {!locked && (
              <div className="block-handle" draggable onDragStart={() => { dragRef.current = b.id }} onClick={(e) => setHandleMenu({ id: b.id, el: e.currentTarget })} title="Drag to move, click for options">
                <Icon name="grip" size={14} stroke={2.6} />
              </div>
            )}
            {b.type === 'divider' ? <hr /> : b.type === 'table' ? <TableBlock block={b} locked={locked} onEdit={(fn) => setBlock(b.id, (x) => { x.rows = x.rows?.length ? x.rows : [['']]; fn(x.rows) }, 'tbl:' + b.id)} /> : (
              <div className="block-body">
                {b.type === 'todo' && <Checkbox checked={!!b.checked} onChange={(v) => setBlock(b.id, (x) => { x.checked = v })} size={17} />}
                {b.type === 'bullet' && <span className="bullet">•</span>}
                {b.type === 'number' && <span className="numlabel">{num}.</span>}
                {b.type === 'toggle' && (
                  <button className={`toggle-arrow ${b.open ? 'open' : ''}`} onClick={() => setBlock(b.id, (x) => { x.open = !x.open })}><Icon name="chevron" size={13} stroke={2.4} /></button>
                )}
                {b.type === 'callout' && <span className="callout-icon"><Icon name="lightbulb" size={16} /></span>}
                <div className="block-text">
                  <AutoText className={`bt bt-${b.type} ${b.checked ? 'checked' : ''}`} {...common} />
                  {b.type === 'toggle' && b.open && (
                    <AutoText className="bt toggle-body" value={b.body ?? ''} placeholder="Empty toggle. Click to write." onChange={(v) => setBlock(b.id, (x) => { x.body = v }, 'body:' + b.id)} />
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}
      {!locked && <div className="blocks-tail" onClick={() => {
        const last = blocks[blocks.length - 1]
        if (!last || last.text || last.type !== 'p') insertAfter(last?.id ?? '')
        else focusBlock(last.id)
      }} />}

      {slash && (
        <Popover anchor={slash.el} onClose={() => setSlash(null)} width={240}>
          <Menu
            onClose={() => setSlash(null)}
            items={SLASH.filter((s) => s.label.toLowerCase().includes(slash.q.toLowerCase())).map((s) => ({
              label: s.label, icon: s.icon, hint: s.hint,
              onClick: () => { setBlock(slash.id, (x) => { x.text = x.text.replace(/\/[^/]*$/, '') }); changeType(slash.id, s.type) }
            }))}
          />
        </Popover>
      )}
      {handleMenu && (
        <Popover anchor={handleMenu.el} onClose={() => setHandleMenu(null)} width={230}>
          <Menu
            onClose={() => setHandleMenu(null)}
            items={[
              { label: 'Delete', icon: 'trash', danger: true, onClick: () => edit((bs) => { const i = bs.findIndex((x) => x.id === handleMenu.id); bs.splice(i, 1); if (!bs.length) bs.push({ id: uid(), type: 'p', text: '' }) }) },
              { label: 'Duplicate', icon: 'copy', hint: 'Ctrl D', onClick: () => { const b = blocks.find((x) => x.id === handleMenu.id); if (b) insertAfter(b.id, { ...b, id: uid() }) } },
              { label: 'Insert below', icon: 'plus', onClick: () => insertAfter(handleMenu.id) },
              { divider: true, label: '' },
              ...SLASH.map((s) => ({ label: 'Turn into ' + s.label.toLowerCase(), icon: s.icon, onClick: () => changeType(handleMenu.id, s.type) }))
            ]}
          />
          <div className="color-row">
            {BLOCK_COLORS.map((c) => (
              <button key={c || 'none'} className="color-dot" style={{ background: c || 'var(--fg)' }} title={c ? c : 'Default'} onClick={() => { setBlock(handleMenu.id, (x) => { x.color = c }); setHandleMenu(null) }} />
            ))}
          </div>
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

export function DocPage({ pageId }: { pageId: string }): JSX.Element {
  const locked = useData((d) => d.pages[pageId]?.locked)
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
    <div className="doc">
      <BlockEditor pageId={pageId} locked={locked} />
      <div className="doc-foot">{words} {words === 1 ? 'word' : 'words'}</div>
    </div>
  )
}

export function clearChecked(pageId: string): void {
  act((d) => { const p = d.pages[pageId]; if (p) p.blocks = p.blocks.filter((b) => !(b.type === 'todo' && b.checked)) })
}
