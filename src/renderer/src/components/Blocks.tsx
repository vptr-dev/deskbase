import { ButtonActionFields, defaultAction, runButtonAction } from './ButtonActions'
import { useEffect, useMemo, useRef, useState } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { getData, toast, updatePage, useData } from '../store'
import { api } from '../lib/api'
import { typeInfo } from '../lib/defaults'
import { imageToDataUrl, pickImage } from '../lib/image'
import { backlinks, hasInline, pageByTitle, pageForLink, parseInline, plainText, scrollToBlock } from '../lib/links'
import { openFromClick } from '../lib/tabs'
import { addDays, friendlyDay, today } from '../lib/util'
import type { Block, Page } from '../types'
import { Glyph, Icon } from './Icon'
import { AutoText, Popover, Segmented, type AutoTextProps } from './ui'

type SetBlock = (fn: (b: Block) => void, key?: string) => void
type Click = { ctrlKey?: boolean; metaKey?: boolean; button?: number; shiftKey?: boolean }

const openLinkTitle = (title: string, e?: Click): void => openFromClick(pageForLink(title), e)

// ---------- text with page links, dates and web links ----------

/** Marks inside a mark (bold inside a link, a link inside strike-through…), drawn without chips. */
export function Marks({ text }: { text: string }): JSX.Element {
  const parts = parseInline(text)
  if (parts.length === 1 && parts[0].kind === 'text') return <>{text}</>
  return (
    <>
      {parts.map((p, i) => {
        switch (p.kind) {
          case 'bold': return <strong key={i}><Marks text={p.text} /></strong>
          case 'bolditalic': return <strong key={i}><em>{p.text}</em></strong>
          case 'italic': return <em key={i}><Marks text={p.text} /></em>
          case 'strike': return <s key={i}><Marks text={p.text} /></s>
          case 'code': return <code key={i} className="inline-code">{p.text}</code>
          case 'link': return <span key={i} className="inline-link">{p.text}</span>
          case 'url': return <span key={i} className="inline-link">{p.url.replace(/^https?:\/\/(www\.)?/, '')}</span>
          case 'page': return <span key={i} className="inline-link">{p.title}</span>
          case 'date': return <span key={i}>{friendlyDay(p.day) || p.day}{p.time ? ' ' + p.time : ''}</span>
          case 'color': return <span key={i} style={p.bg ? { background: `var(--bc-${p.color})`, borderRadius: 3 } : { color: `var(--tc-${p.color})` }}><Marks text={p.text} /></span>
          default: return <span key={i}>{p.text}</span>
        }
      })}
    </>
  )
}

/** Draws a block's links and marks while it is not being edited; a click on plain text edits at that spot. */
function RichView({ text, className, onPlace }: { text: string; className: string; onPlace: (pos: number) => void }): JSX.Element {
  const parts = useMemo(() => parseInline(text), [text])
  // Only the pages this line links to; following every page would redraw it on each keystroke anywhere.
  const linked = useData((d) => parts.map((p) => { if (p.kind !== 'page') return ''; const t = pageByTitle(d, p.title); return t ? `${t.id}\u0001${t.title}\u0001${t.icon}\u0001${t.iconColor ?? ''}\u0001${t.type}` : '' }).join('\u0002'))
  const targets = useMemo(() => linked.split('\u0002').map((x) => { if (!x) return undefined; const [id, title, icon, iconColor, type] = x.split('\u0001'); return { id, title, icon, iconColor, type } as { id: string; title: string; icon: string; iconColor: string; type: Page['type'] } }), [linked])
  const place = (e: React.MouseEvent): void => {
    if ((e.target as HTMLElement).closest('[data-act]')) return
    e.preventDefault()
    let pos = text.length
    const r = (document as any).caretRangeFromPoint?.(e.clientX, e.clientY) as Range | null
    const host = r?.startContainer?.parentElement?.closest<HTMLElement>('[data-s]')
    if (r && host) pos = Number(host.dataset.s) + (host.dataset.kind === 'text' ? r.startOffset : Number(host.dataset.e) - Number(host.dataset.s))
    onPlace(Math.max(0, Math.min(text.length, pos)))
  }
  return (
    <div className={`rich ${className}`} onMouseDown={place}>
      {parts.map((p, i) => {
        if (p.kind === 'text') return <span key={i} data-s={p.start} data-e={p.end} data-kind="text">{p.text}</span>
        if (p.kind === 'bold') return <strong key={i} data-s={p.start} data-e={p.end}><Marks text={p.text} /></strong>
        if (p.kind === 'bolditalic') return <strong key={i} data-s={p.start} data-e={p.end}><em>{p.text}</em></strong>
        if (p.kind === 'italic') return <em key={i} data-s={p.start} data-e={p.end}><Marks text={p.text} /></em>
        if (p.kind === 'strike') return <s key={i} data-s={p.start} data-e={p.end}><Marks text={p.text} /></s>
        if (p.kind === 'link') {
          return (
            <a key={i} data-act data-s={p.start} data-e={p.end} className="inline-link" href={p.url} title={p.url}
              onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.preventDefault(); api.launch(p.url) }}><Marks text={p.text} /></a>
          )
        }
        if (p.kind === 'code') return <code key={i} className="inline-code" data-s={p.start} data-e={p.end}>{p.text}</code>
        if (p.kind === 'color') return <span key={i} data-s={p.start} data-e={p.end} className={p.bg ? 'inline-bg' : ''} style={p.bg ? { background: `var(--bc-${p.color})` } : { color: `var(--tc-${p.color})` }}><Marks text={p.text} /></span>
        if (p.kind === 'url') {
          return (
            <a key={i} data-act data-s={p.start} data-e={p.end} className="inline-link" href={p.url} title={p.url}
              onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.preventDefault(); api.launch(p.url) }}>{p.url.replace(/^https?:\/\/(www\.)?/, '')}</a>
          )
        }
        if (p.kind === 'date') {
          return <span key={i} data-act data-s={p.start} data-e={p.end} className={`mention mention-date ${p.time ? 'remind' : ''}`} title={p.time ? `Reminder: ${p.day} ${p.time}` : p.day}><Icon name={p.time ? 'bell' : 'calendar'} size={12} />{friendlyDay(p.day) || p.day}{p.time ? ' ' + p.time : ''}</span>
        }
        const target = targets[i]
        return (
          <span key={i} data-act data-s={p.start} data-e={p.end} className={`mention ${target ? '' : 'missing'}`} role="link" tabIndex={-1}
            title={target ? 'Open (Ctrl click for a new tab)' : 'Create this page'}
            onMouseDown={(e) => { e.preventDefault(); if (e.button === 1) openLinkTitle(p.title, e) }}
            onClick={(e) => openLinkTitle(p.title, e)}>
            <Glyph value={target ? target.icon || typeInfo(target.type).icon : 'file-text'} size={13} color={target?.iconColor || undefined} />
            {target ? target.title || 'Untitled' : p.title}
          </span>
        )
      })}
    </div>
  )
}

/** A block's text field; shows page links, dates and web links as chips until it is clicked. */
export function InlineText({ locked, ...props }: AutoTextProps & { locked?: boolean }): JSX.Element {
  const [editing, setEditing] = useState(false)
  const ta = useRef<HTMLTextAreaElement | null>(null)
  const rich = !editing && !!props.value && hasInline(props.value)
  return (
    <div className={`inline-wrap ${rich ? 'rich-on' : ''}`}>
      {rich && <RichView text={props.value} className={props.className ?? ''} onPlace={(pos) => { const el = ta.current; if (!el || locked) return; el.focus(); el.setSelectionRange(pos, pos) }} />}
      <AutoText
        {...props}
        inputRef={(el) => { ta.current = el; props.inputRef?.(el) }}
        onFocus={() => { setEditing(true); props.onFocus?.() }}
        onBlur={() => { setEditing(false); props.onBlur?.() }}
      />
    </div>
  )
}

// ---------- small shared pieces ----------

function UrlInput({ placeholder, onSubmit, autoFocus = true }: { placeholder: string; onSubmit: (v: string) => void; autoFocus?: boolean }): JSX.Element {
  const [v, setV] = useState('')
  const submit = (): void => { const t = v.trim(); if (t) onSubmit(/^[a-z][\w+.-]*:/i.test(t) ? t : 'https://' + t) }
  return (
    <div className="url-input">
      <input className="input input-sm" autoFocus={autoFocus} placeholder={placeholder} value={v} onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } if (e.key === 'Escape') (e.target as HTMLInputElement).blur() }}
        onPaste={(e) => { const t = e.clipboardData.getData('text').trim(); if (/^https?:\/\/\S+$/i.test(t)) { e.preventDefault(); onSubmit(t) } }} />
      <button className="btn btn-sm" onClick={submit}>Add</button>
    </div>
  )
}

function Empty({ icon, label, children }: { icon: string; label: string; children?: React.ReactNode }): JSX.Element {
  return (
    <div className="block-empty">
      <span className="block-empty-label"><Icon name={icon} size={16} /> {label}</span>
      {children}
    </div>
  )
}

const host = (url: string): string => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url } }

// ---------- table of contents ----------

const HEAD_LEVEL: Record<string, number> = { h1: 1, h2: 2, h3: 3, 'toggle-h1': 1, 'toggle-h2': 2, 'toggle-h3': 3 }

export function TocBlock({ pageId }: { pageId: string }): JSX.Element {
  const blocks = useData((d) => d.pages[pageId]?.blocks)
  const heads = useMemo(() => (blocks ?? []).filter((b) => HEAD_LEVEL[b.type] && b.text.trim()).map((b) => ({ id: b.id, text: plainText(b.text), level: HEAD_LEVEL[b.type] })), [blocks])
  if (!heads.length) return <div className="toc toc-empty">No headings</div>
  return (
    <nav className="toc">
      {heads.map((h) => (
        <button key={h.id} className={`toc-item toc-${h.level}`} onClick={() => scrollToBlock(h.id)}>{h.text}</button>
      ))}
    </nav>
  )
}

// ---------- bookmark ----------

export function BookmarkBlock({ block, locked, set }: { block: Block; locked?: boolean; set: SetBlock }): JSX.Element {
  const url = block.url
  useEffect(() => {
    if (!url || block.meta) return
    let live = true
    api.linkInfo(url).then((m) => { if (live) set((b) => { b.meta = m }, 'meta:' + block.id) }).catch(() => {})
    return () => { live = false }
  }, [url])
  if (!url) return locked ? <div /> : <Empty icon="bookmark" label="Bookmark"><UrlInput placeholder="Paste a link" onSubmit={(u) => set((b) => { b.url = u; b.meta = undefined })} /></Empty>
  const m = block.meta ?? {}
  return (
    <a className="bookmark" href={url} title={url} onClick={(e) => { e.preventDefault(); api.launch(url) }}>
      <div className="bookmark-main">
        <div className="bookmark-title">{m.title || host(url)}</div>
        {m.desc && <div className="bookmark-desc">{m.desc}</div>}
        <div className="bookmark-url">
          {m.icon && <img src={m.icon} alt="" width={14} height={14} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />}
          <span>{url.replace(/^https?:\/\/(www\.)?/, '')}</span>
        </div>
      </div>
    </a>
  )
}

// ---------- image ----------

const IMG_WIDTHS = ['25', '50', '75', '100']

export async function imageFromFile(file: Blob): Promise<string> {
  return imageToDataUrl(file, 1800, 1800, 0.86)
}

export function ImageBlock({ block, locked, set }: { block: Block; locked?: boolean; set: SetBlock }): JSX.Element {
  const [linking, setLinking] = useState(false)
  const upload = async (file?: File | null): Promise<void> => {
    const f = file ?? (await pickImage())
    if (!f) return
    try { const url = await imageFromFile(f); set((b) => { b.url = url }) } catch { toast('That file is not an image', { kind: 'error' }) }
  }
  if (!block.url) {
    if (locked) return <div />
    return (
      <Empty icon="image" label="Image">
        <div className="row gap-6" onPaste={(e) => { const f = [...e.clipboardData.files].find((x) => x.type.startsWith('image/')); if (f) { e.preventDefault(); upload(f) } }}>
          {linking ? <UrlInput placeholder="Image address" onSubmit={(u) => set((b) => { b.url = u })} /> : (
            <>
              <button className="btn btn-sm" onClick={() => upload()}><Icon name="upload" size={14} /> Upload</button>
              <button className="btn btn-sm" onClick={() => setLinking(true)}><Icon name="link" size={14} /> Link</button>
            </>
          )}
        </div>
      </Empty>
    )
  }
  const width = IMG_WIDTHS.includes(block.style ?? '') ? block.style! : '100'
  return (
    <figure className="img-block" style={{ width: width + '%' }}
      onDragOver={(e) => { if (!locked && e.dataTransfer.types.includes('Files')) e.preventDefault() }}
      onDrop={(e) => { const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/')); if (f && !locked) { e.preventDefault(); upload(f) } }}>
      <img src={block.url} alt={block.text || ''} draggable={false} />
      {!locked && (
        <div className="img-tools">
          {IMG_WIDTHS.map((w) => <button key={w} className={w === width ? 'active' : ''} title={`${w}% wide`} onClick={() => set((b) => { b.style = w })}>{w === '100' ? 'Full' : w + '%'}</button>)}
          <button title="Replace" onClick={() => upload()}><Icon name="upload" size={12} /></button>
        </div>
      )}
      {(block.text || !locked) && (
        <AutoText className="img-caption" value={block.text} placeholder="Caption" onChange={(v) => set((b) => { b.text = v }, 'cap:' + block.id)} />
      )}
    </figure>
  )
}

// ---------- embed ----------

/** Turns a share link into an address that can be shown inside the page. */
export function embedSrc(raw: string): { src: string; ratio?: number; height?: number } {
  let u: URL
  try { u = new URL(raw) } catch { return { src: raw, height: 420 } }
  const h = u.hostname.replace(/^www\.|^m\./, '')
  if (h === 'youtube.com' || h === 'youtu.be' || h === 'youtube-nocookie.com') {
    const id = h === 'youtu.be' ? u.pathname.slice(1) : u.searchParams.get('v') ?? u.pathname.match(/\/(?:shorts|embed|live)\/([\w-]+)/)?.[1]
    if (id) return { src: `https://www.youtube-nocookie.com/embed/${id}`, ratio: 16 / 9 }
  }
  if (h === 'vimeo.com') { const id = u.pathname.match(/\/(\d+)/)?.[1]; if (id) return { src: `https://player.vimeo.com/video/${id}`, ratio: 16 / 9 } }
  if (h === 'open.spotify.com' && !u.pathname.startsWith('/embed')) {
    const tall = /^\/(playlist|album|show|artist)/.test(u.pathname)
    return { src: `https://open.spotify.com/embed${u.pathname}`, height: tall ? 380 : 152 }
  }
  if (h === 'figma.com') return { src: `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(raw)}`, height: 450 }
  if (h === 'loom.com') return { src: raw.replace('/share/', '/embed/'), ratio: 16 / 9 }
  if (h === 'codepen.io') return { src: raw.replace('/pen/', '/embed/'), height: 400 }
  if (h === 'docs.google.com') return { src: raw.replace(/\/(edit|view)([?#].*)?$/, '/preview'), height: 520 }
  if (h === 'google.com' && u.pathname.startsWith('/maps')) return { src: `https://maps.google.com/maps?q=${encodeURIComponent(u.pathname.split('/place/')[1]?.split('/')[0] ?? u.searchParams.get('q') ?? '')}&output=embed`, height: 380 }
  return { src: raw, height: 460 }
}

export function EmbedBlock({ block, locked, set }: { block: Block; locked?: boolean; set: SetBlock }): JSX.Element {
  if (!block.url) {
    return locked ? <div /> : <Empty icon="embed" label="Embed"><UrlInput placeholder="YouTube, Vimeo, Spotify, Figma, Google Docs, Maps or any page" onSubmit={(u) => set((b) => { b.url = u })} /></Empty>
  }
  const e = embedSrc(block.url)
  return (
    <div className="embed">
      <div className="embed-frame" style={e.ratio ? { aspectRatio: String(e.ratio) } : { height: e.height }}>
        <iframe src={e.src} title={host(block.url)} loading="lazy" allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write" allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-popups allow-presentation allow-forms" referrerPolicy="strict-origin-when-cross-origin" />
      </div>
      <button className="embed-open" onClick={() => api.launch(block.url!)}><Icon name="external" size={12} /> {host(block.url)}</button>
    </div>
  )
}

// ---------- equation ----------

export function renderTex(tex: string, display = true): string {
  try { return katex.renderToString(tex, { displayMode: display, throwOnError: false, output: 'html', strict: 'ignore' }) } catch { return '' }
}

export function EquationBlock({ block, locked, set }: { block: Block; locked?: boolean; set: SetBlock }): JSX.Element {
  const [editing, setEditing] = useState(!block.text && !locked)
  const html = useMemo(() => renderTex(block.text), [block.text])
  return (
    <div className={`equation ${editing ? 'editing' : ''}`}>
      {block.text ? <div className="equation-out" onClick={() => !locked && setEditing(true)} dangerouslySetInnerHTML={{ __html: html }} /> : !editing && <div className="equation-out muted" onClick={() => !locked && setEditing(true)}>Empty equation</div>}
      {editing && (
        <AutoText className="equation-src" autoFocus value={block.text} placeholder="E = mc^2" spellCheck={false}
          onChange={(v) => set((b) => { b.text = v }, 'tex:' + block.id)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => { if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Escape') { e.preventDefault(); setEditing(false) } }} />
      )}
    </div>
  )
}

// ---------- button ----------

export function ButtonBlock({ block, locked, set, addTodos }: { block: Block; locked?: boolean; set: SetBlock; addTodos: (lines: string[]) => void }): JSX.Element {
  const [cfg, setCfg] = useState<HTMLElement | null>(null)
  const a = block.action ?? defaultAction
  const run = (e: React.MouseEvent): void => runButtonAction(a, e, addTodos)
  return (
    <div className="button-block">
      <button className={`btn ${block.style === 'plain' ? '' : 'btn-primary'}`} onClick={run} onAuxClick={(e) => { if (e.button === 1) run(e) }}>
        <Icon name={a.kind === 'link' ? 'external' : a.kind === 'page' ? 'pageLink' : 'checkSquare'} size={14} /> {block.text || 'Button'}
      </button>
      {!locked && <button className="icon-btn button-cfg" title="Edit button" onClick={(e) => setCfg(e.currentTarget)}><Icon name="settings" size={14} /></button>}
      {cfg && (
        <Popover anchor={cfg} onClose={() => setCfg(null)} width={300}>
          <div className="button-form">
            <label>Label<input className="input input-sm" autoFocus value={block.text} placeholder="Button" onChange={(e) => set((b) => { b.text = e.target.value }, 'btn:' + block.id)} /></label>
            <ButtonActionFields localTodos action={a} onChange={action => set(b => { b.action = action }, 'btn-action:' + block.id)} />
            <Segmented small value={block.style === 'plain' ? 'plain' : 'filled'} options={[{ value: 'filled', label: 'Filled' }, { value: 'plain', label: 'Plain' }]} onChange={(v) => set((b) => { b.style = v === 'plain' ? 'plain' : '' })} />
          </div>
        </Popover>
      )}
    </div>
  )
}

// ---------- link to page ----------

export function PagePicker({ onPick, exclude, only, toolsOnly }: { onPick: (id: string) => void; exclude?: string; only?: Page['type']; toolsOnly?: boolean }): JSX.Element {
  const [q, setQ] = useState('')
  const pages = useData((d) => d.pages)
  const recent = useData((d) => d.recent)
  const ql = q.trim().toLowerCase()
  const list = (ql
    ? Object.values(pages).filter((p) => !p.deletedAt && (p.title || 'untitled').toLowerCase().includes(ql))
    : [...recent.map((id) => pages[id]).filter(Boolean), ...Object.values(pages)].filter((p, i, all) => p && !p.deletedAt && all.indexOf(p) === i)
  ).filter((p) => p.id !== exclude && !p.rowOf && (!toolsOnly || p.type !== 'doc') && (!only || p.type === only)).slice(0, 8)
  return (
    <div className="page-picker">
      <input className="input input-sm" autoFocus placeholder="Find a page" value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && list[0]) { e.preventDefault(); onPick(list[0].id) } }} />
      <div className="page-picker-list">
        {list.map((p) => (
          <button key={p.id} className="menu-item" onClick={() => onPick(p.id)}>
            <Glyph value={p.icon || typeInfo(p.type).icon} size={15} color={p.iconColor || undefined} /> <span className="ellipsis">{p.title || 'Untitled'}</span>
          </button>
        ))}
        {!list.length && <div className="muted small pad">No pages</div>}
      </div>
    </div>
  )
}

export function LinkBlock({ block, pageId, locked, set }: { block: Block; pageId: string; locked?: boolean; set: SetBlock }): JSX.Element {
  const target = useData((d) => (block.ref ? d.pages[block.ref] : undefined))
  if (!block.ref) return locked ? <div /> : <Empty icon="pageLink" label="Link to page"><PagePicker exclude={pageId} onPick={(id) => set((b) => { b.ref = id })} /></Empty>
  if (!target || target.deletedAt) return <div className="page-link missing"><Icon name="pageLink" size={15} /> Page was deleted</div>
  return (
    <button className="page-link" onClick={(e) => openFromClick(target.id, e)} onAuxClick={(e) => { if (e.button === 1) openFromClick(target.id, e) }} onMouseDown={(e) => { if (e.button === 1) e.preventDefault() }}>
      <Glyph value={target.icon || typeInfo(target.type).icon} size={16} color={target.iconColor || undefined} />
      <span className="page-link-title">{target.title || 'Untitled'}</span>
      <Icon name="arrow-up-right" size={13} className="page-link-arrow" />
    </button>
  )
}

// ---------- synced block ----------

/** Finds a block by id anywhere in a page, columns included. */
export function findBlock(blocks: Block[], id: string): Block | undefined {
  for (const b of blocks) {
    if (b.id === id) return b
    if (b.cols) for (const c of b.cols) { const f = findBlock(c, id); if (f) return f }
  }
  return undefined
}

export const blockLink = (pageId: string, blockId: string): string => `deskbase://block/${pageId}/${blockId}`
export const parseBlockLink = (t: string): string | null => t.trim().match(/^deskbase:\/\/block\/([\w-]+\/[\w-]+)$/)?.[1] ?? null

export function SyncedBlock({ block, locked }: { block: Block; locked?: boolean }): JSX.Element {
  const [srcPage, srcBlock] = (block.ref ?? '/').split('/')
  const page = useData((d) => d.pages[srcPage])
  const src = page && !page.deletedAt ? findBlock(page.blocks, srcBlock) : undefined
  const spell = useData((d) => d.settings.spellcheck)
  const title = page?.title || 'Untitled'
  return (
    <div className="synced">
      <button className="synced-from" title="Open the original" onClick={(e) => { openFromClick(srcPage, e); setTimeout(() => scrollToBlock(srcBlock), 120) }}>
        <Icon name="refresh" size={11} /> {src ? title : 'Original deleted'}
      </button>
      {src ? (
        src.type === 'divider' ? <hr /> : (
          <AutoText className={`bt bt-${src.type}`} value={src.text} spellCheck={spell}
            placeholder="Synced text"
            onChange={(v) => { if (!locked) updatePage(srcPage, (p) => { const b = findBlock(p.blocks, srcBlock); if (b) b.text = v }, 'sync:' + srcBlock) }} />
        )
      ) : <div className="muted small">The original block is gone.</div>}
    </div>
  )
}

// ---------- backlinks ----------

export function Backlinks({ pageId }: { pageId: string }): JSX.Element | null {
  const pages = useData((d) => d.pages)
  const [list, setList] = useState<Page[]>([])
  // Worked out a moment after edits settle, so typing on big workspaces stays fast.
  useEffect(() => {
    const t = setTimeout(() => setList(backlinks(getData(), pageId)), list.length ? 400 : 60)
    return () => clearTimeout(t)
  }, [pages, pageId])
  const [open, setOpen] = useState(false)
  if (!list.length) return null
  return (
    <div className="backlinks">
      <button className="backlinks-head" onClick={() => setOpen(!open)}>
        <Icon name="chevron" size={12} stroke={2.4} className={open ? 'rot90' : ''} /> {list.length} {list.length === 1 ? 'backlink' : 'backlinks'}
      </button>
      {open && (
        <div className="backlinks-list">
          {list.map((p) => (
            <button key={p.id} className="backlink" onClick={(e) => openFromClick(p.id, e)} onAuxClick={(e) => { if (e.button === 1) openFromClick(p.id, e) }}>
              <Glyph value={p.icon || typeInfo(p.type).icon} size={14} color={p.iconColor || undefined} /> {p.title || 'Untitled'}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------- @ and [[ picker ----------

export interface MentionState { id: string; el: HTMLElement; q: string; kind: '@' | '[[' }

/** Options for the mention menu: pages, and dates after @. */
export function mentionOptions(m: MentionState): { label: string; icon: string; insert: string; hint?: string }[] {
  const d = getData()
  const ql = m.q.trim().toLowerCase()
  const out: { label: string; icon: string; insert: string; hint?: string }[] = []
  if (m.kind === '@') {
    const days: [string, string][] = [['Today', 'today'], ['Tomorrow', 'tomorrow'], ['Yesterday', 'yesterday']]
    for (const [label, word] of days) if (!ql || label.toLowerCase().startsWith(ql)) out.push({ label, icon: 'calendar', insert: '@' + word, hint: 'Date' })
    if (/^\d{4}-\d{2}-\d{2}$/.test(m.q.trim())) out.push({ label: m.q.trim(), icon: 'calendar', insert: '@' + m.q.trim(), hint: 'Date' })
    // Reminders: a date with a time notifies you then.
    const hm = /^(\d{1,2})(?::(\d{2}))?$/.exec(m.q.trim())
    const pad2 = (n: number): string => String(n).padStart(2, '0')
    const at = (dayK: string, h: number, mi: number): string => `@${dayK} ${pad2(h)}:${pad2(mi)}`
    if (hm && Number(hm[1]) < 24) {
      const h = Number(hm[1]); const mi = Math.min(59, Number(hm[2] ?? 0))
      const now = new Date(); const later = h * 60 + mi > now.getHours() * 60 + now.getMinutes()
      const dk = later ? today() : addDays(today(), 1)
      out.push({ label: `Remind ${later ? 'today' : 'tomorrow'} at ${pad2(h)}:${pad2(mi)}`, icon: 'bell', insert: at(dk, h, mi), hint: 'Reminder' })
    } else if (!ql || 'remind'.startsWith(ql) || ql.startsWith('remind')) {
      const next = new Date(Date.now() + 3600000)
      out.push({ label: `Remind in an hour (${pad2(next.getHours())}:00)`, icon: 'bell', insert: at(next.getDate() === new Date().getDate() ? today() : addDays(today(), 1), next.getHours(), 0), hint: 'Reminder' })
      out.push({ label: 'Remind tomorrow at 09:00', icon: 'bell', insert: at(addDays(today(), 1), 9, 0), hint: 'Reminder' })
    }
  }
  const pages = Object.values(d.pages).filter((p) => !p.deletedAt && (!ql || (p.title || 'untitled').toLowerCase().includes(ql)))
  const order = new Map(d.recent.map((id, i) => [id, i]))
  pages.sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99) || (a.title || '').localeCompare(b.title || ''))
  for (const p of pages.slice(0, 7)) out.push({ label: p.title || 'Untitled', icon: p.icon || typeInfo(p.type).icon, insert: `[[${p.title || 'Untitled'}]]`, hint: 'Page' })
  if (m.kind === '[[' && ql && !pages.some((p) => (p.title || '').toLowerCase() === ql)) out.push({ label: `New page "${m.q.trim()}"`, icon: 'plus', insert: `[[${m.q.trim()}]]` })
  return out
}

