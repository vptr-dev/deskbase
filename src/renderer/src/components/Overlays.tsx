import { creativeNames } from '../lib/creativeProjects'
import { useEffect, useMemo, useRef, useState } from 'react'
import { newTab, reopenTab } from '../lib/tabs'
import { updatePage, createCreativePage, createToolDocument, createPage, getData, openPage, openSettings, openView, purgePage, restorePage, setOverlay, setSettings, toast, useApp, useData, undo, redo } from '../store'
import { PAGE_TYPES, typeInfo } from '../lib/defaults'
import { useFeeds } from '../lib/connections'
import { api } from '../lib/api'
import { exportAll } from '../lib/exporters'
import { createFromPageLayout, type TemplateMode } from '../lib/layoutTemplates'
import { uid,timeAgo } from '../lib/util'
import { Button, ConfirmButton, Empty, Modal } from './ui'
import { Glyph, Icon } from './Icon'
import { toggleAssistant } from './Assistant'
import { QuickAdd } from './TaskItems'

// ---------- Quick add (global hotkey / tray) ----------
export function QuickAddDialog(): JSX.Element {
  const lists = useData((d) => Object.values(d.pages).filter((p) => !p.deletedAt && (p.type === 'tasks' || p.type === 'board' || p.type === 'project')))
  const last = useData((d) => d.settings.lastPage)
  const [pageId, setPageId] = useState(() => (lists.find((p) => p.id === last) ?? lists[0])?.id ?? '')
  const added = useRef(0)
  const close = (): void => { setOverlay(null); api.quickAddDone(added.current > 0) }
  return (
    <Modal onClose={close} width={560} className="quickadd-modal">
      <div className="modal-body form">
        {lists.length === 0 ? (
          <div className="row between"><span className="muted">No to-do list yet.</span><Button small kind="primary" onClick={() => { setOverlay(null); createPage('tasks', null, 'To-do') }}>Create one</Button></div>
        ) : (
          <>
            <QuickAdd key={pageId} pageId={pageId} autoFocus placeholder="Add a task  ·  Enter to save, Esc to close" onAdded={(id) => { added.current++; const t = getData().tasks[id]; toast(`Added “${t?.title ?? 'task'}”`) }} onEscape={close} />
            {lists.length > 1 && (
              <div className="row gap-sm">
                <span className="muted small">Add to</span>
                <select id="quickadd-list" className="input input-sm" value={pageId} onChange={(e) => setPageId(e.target.value)}>
                  {lists.map((p) => <option key={p.id} value={p.id}>{p.title || 'Untitled'}</option>)}
                </select>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}

// ---------- New page ----------
export function NewPageDialog(): JSX.Element {
  const arg = useApp((s) => s.overlayArg) as { parentId: string | null } | null
  const [title, setTitle] = useState('')
  const [mode, setMode] = useState<TemplateMode>('linked')
  const templates = useData((d) => Object.values(d.pages).filter((p) => p.template && !p.rowOf && !p.deletedAt))
  const make = (type: (typeof PAGE_TYPES)[number]['type']): void => {
    const id = createToolDocument(type, arg?.parentId ?? null, title.trim() || undefined)
    ;(window as any).__lastCreated = id
    setOverlay(null)
  }
  const fromTemplate = (tplId: string): void => {
    const id = createFromPageLayout(tplId, arg?.parentId ?? null, title.trim() || undefined, mode)
    openPage(id)
    setOverlay(null)
  }
  return (
    <Modal onClose={() => setOverlay(null)} width={620}>
      <div className="modal-head"><h3>New page</h3></div>
      <div className="modal-body">
        <input id="newpage-title" className="input" autoFocus placeholder="Page name (optional)" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') make('doc') }} />
        <div className="type-grid">
          {PAGE_TYPES.map((t) => (
            <button key={t.type} className="type-card" onClick={() => make(t.type)}>
              <span className="type-icon"><Icon name={t.icon} size={18} /></span>
              <span className="strong">{t.name}</span>
              <span className="muted small">{t.desc}</span>
            </button>
          ))}
        </div>
        <details><summary>Creative projects</summary><div className="type-grid">
          {creativeNames.map(kind=><button key={kind} className="type-card" onClick={()=>{createCreativePage(kind,arg?.parentId ?? null,title);setOverlay(null)}}>{kind}</button>)}
        </div></details>
        {templates.length > 0 && <>
          <div className="section-label">Templates</div>
          <label>Template lists<select className="input input-sm" value={mode} onChange={e => setMode(e.target.value as TemplateMode)}><option value="linked">Link to existing lists</option><option value="fresh">Start with fresh lists</option></select></label>
          <div className="type-grid">
            {templates.map((t) => (
              <button key={t.id} className="type-card" onClick={() => fromTemplate(t.id)}>
                <span className="type-icon"><Glyph value={t.icon} fallback={typeInfo(t.type).icon} size={18} /></span>
                <span className="strong">{t.title || 'Untitled'}</span>
                <span className="muted small">{typeInfo(t.type).name}</span>
              </button>
            ))}
          </div>
        </>}
      </div>
    </Modal>
  )
}

// ---------- Search / command palette ----------
interface Result { id: string; icon: string; title: string; sub?: string; run: () => void; page?: string }

export function CommandPalette(): JSX.Element {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const data = useApp((s) => s.data)
  const listRef = useRef<HTMLDivElement>(null)
  const feeds=useFeeds(s=>s.results)
  const results = useMemo<Result[]>(() => {
    const ql = q.trim().toLowerCase()
    const out: Result[] = []
    const pages = Object.values(data.pages).filter((p) => !p.deletedAt)
    const pageMatch = (ql ? pages.filter((p) => (p.title || 'untitled').toLowerCase().includes(ql) || p.blocks.some((b) => b.text.toLowerCase().includes(ql))) : data.recent.map((id) => data.pages[id]).filter((p) => p && !p.deletedAt))
    for (const p of pageMatch.slice(0, 10)) {
      const hit = ql && !(p.title || '').toLowerCase().includes(ql) ? p.blocks.find((b) => b.text.toLowerCase().includes(ql))?.text : undefined
      out.push({ id: 'p' + p.id, icon: p.icon || typeInfo(p.type).icon, title: p.title || 'Untitled', sub: hit ? hit.slice(0, 80) : p.rowOf ? `in ${data.pages[p.rowOf]?.title || 'Untitled'}` : typeInfo(p.type).name, page: p.id, run: () => openPage(p.id) })
    }
    if (ql) {
      for (const t of Object.values(data.tasks).filter((t) => t.title.toLowerCase().includes(ql) || t.notes.toLowerCase().includes(ql)).slice(0, 8)) {
        out.push({ id: 't' + t.id, icon: t.done ? 'circle-check' : 'circle', title: t.title, sub: data.pages[t.pageId]?.title, run: () => openPage(t.pageId) })
      }
      for (const j of Object.values(data.journal).filter((j) => (j.title + j.text).toLowerCase().includes(ql)).slice(0, 5)) {
        out.push({ id: 'j' + j.id, icon: 'notebook-pen', title: j.title || j.date, sub: j.text.slice(0, 80), run: () => openPage(j.pageId) })
      }
      for (const h of Object.values(data.habits).filter((h) => h.name.toLowerCase().includes(ql)).slice(0, 5)) {
        out.push({ id: 'h' + h.id, icon: h.icon, title: h.name, sub: 'Habit', run: () => openPage(h.pageId) })
      }
    }
    if(ql){
      const matches=(text:string)=>text.toLowerCase().includes(ql)
      for(const p of pages){
        const items=[...(p.entries??[]).map(x=>x.name),...(p.cards??[]).map(x=>x.question),...(p.wishlist?.items??[]).map(x=>x.name)]
        for(const [i,title] of items.entries())if(matches(title)&&out.length<35)out.push({id:p.id+'-entry-'+i,icon:typeInfo(p.type).icon,title,sub:p.title,page:p.id,run:()=>openPage(p.id)})
      }
      for(const c of data.connections){
        if(c.off)continue
        const feed=feeds[c.id]
        for(const item of [...(feed?.items??[]),...(feed?.events??[])]){
          if(out.length>=45)break
          if(matches(item.title))out.push({id:c.id+'-'+item.id,icon:'plug',title:item.title,sub:c.name,run:()=>{if(item.url&&(item.url.startsWith('https://')||item.url.startsWith('http://')))void api.openExternal(item.url);else openView('@connections')}})
        }
      }
    }
    const cmds: Result[] = [
      {id:'c-clip',icon:'bookmark',title:'Save clipboard link as a page',run:async()=>{
        try{const url=new URL((await navigator.clipboard.readText()).trim());if(!['http:','https:'].includes(url.protocol))throw Error()
          const id=createPage('doc',null,url.hostname);updatePage(id,p=>{p.blocks=[{id:uid(),type:'bookmark',text:url.hostname,url:url.href},{id:uid(),type:'p',text:''}]})
        }catch{toast('Copy a web address first and allow clipboard access',{kind:'error'})}
      }},
      { id: 'c-new', icon: 'plus', title: 'New page', sub: 'Ctrl N', run: () => setOverlay('newPage', { parentId: null }) },
      { id: 'c-tab', icon: 'app-window', title: 'New tab', sub: 'Ctrl T', run: () => newTab() },
      { id: 'c-reopen', icon: 'rotate-ccw', title: 'Reopen closed tab', sub: 'Ctrl Shift T', run: () => reopenTab() },
      { id: 'c-desktop', icon: 'monitor', title: 'Desktop', sub: 'Panels and workspaces', run: () => openView('@desktop') },
      { id: 'c-look', icon: 'palette', title: 'Appearance', sub: 'Themes, surface, fonts', run: () => openView('@appearance') },
      { id: 'c-assistant', icon: 'sparkle', title: 'Assistant', sub: 'Chats', run: () => openView('@assistant') },
      { id: 'c-connections', icon: 'plug', title: 'Connections', sub: 'Calendars, feeds, GitHub, Notion', run: () => openView('@connections') },
      ...(['glass', 'blur', 'frosted', 'solid'] as const).map((v) => ({ id: 'c-surface-' + v, icon: 'layers', title: 'Surface: ' + v[0].toUpperCase() + v.slice(1), run: () => setSettings((x) => { x.look = { ...x.look, surface: v } }) })),
      { id: 'c-values', icon: 'gem', title: 'Values and rules', sub: 'Your own numbers', run: () => setOverlay('values') },
      { id: 'c-quickadd', icon: 'square-check-big', title: 'Quick add task', sub: 'Ctrl Shift Space', run: () => setOverlay('quickAdd') },
      { id: 'c-settings', icon: 'settings', title: 'Open settings', sub: 'Ctrl ,', run: () => openSettings() },
      { id: 'c-trash', icon: 'trash', title: 'Open trash', run: () => setOverlay('trash') },
      { id: 'c-theme', icon: 'contrast', title: 'Toggle dark mode', run: () => { const dark = document.documentElement.dataset.theme === 'dark'; setSettings((s) => { s.theme = dark ? 'light' : 'dark' }) } },
      { id: 'c-sidebar', icon: 'sidebar', title: 'Toggle sidebar', sub: 'Ctrl \\', run: () => setSettings((s) => { s.sidebarCollapsed = !s.sidebarCollapsed }) },
      { id: 'c-export', icon: 'download', title: 'Export all data', run: () => exportAll() },
      { id: 'c-ai', icon: 'sparkles', title: 'Ask the assistant', sub: 'Ctrl J', run: () => toggleAssistant() },
      { id: 'c-notion', icon: 'file-input', title: 'Import from Notion', run: () => setTimeout(() => setOverlay('notionImport'), 0) },
      { id: 'c-undo', icon: 'undo', title: 'Undo', sub: 'Ctrl Z', run: undo },
      { id: 'c-redo', icon: 'redo', title: 'Redo', sub: 'Ctrl Shift Z', run: redo },
      { id: 'c-keys', icon: 'keyboard', title: 'Keyboard shortcuts', sub: 'Ctrl /', run: () => setOverlay('shortcuts') },
      ...PAGE_TYPES.map((t) => ({ id: 'c-new-' + t.type, icon: t.icon, title: `New ${t.name.toLowerCase()} page`, run: () => { createToolDocument(t.type, null); setOverlay(null) } }))
    ]
    out.push(...cmds.filter((c) => !ql || c.title.toLowerCase().includes(ql)).slice(0, ql ? 6 : 4))
    return out
  }, [q, data, feeds])
  useEffect(() => setSel(0), [q])
  useEffect(() => { listRef.current?.querySelector('.active')?.scrollIntoView({ block: 'nearest' }) }, [sel])
  const run = (r?: Result, inTab = false): void => { if (!r) return; setOverlay(null); if (inTab && r.page) newTab(r.page); else r.run() }
  return (
    <Modal onClose={() => setOverlay(null)} width={600} className="palette">
      <div className="palette-input">
        <Icon name="search" size={18} />
        <input id="palette-q" autoFocus placeholder="Search pages, tasks, journal, or run a command" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)) }
          if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)) }
          if (e.key === 'Enter') run(results[sel], e.ctrlKey || e.metaKey)
        }} />
      </div>
      <div className="palette-list" ref={listRef}>
        {!q && <div className="palette-section">Recent</div>}
        {results.map((r, i) => (
          <button key={r.id} className={`palette-item ${i === sel ? 'active' : ''}`} onMouseEnter={() => setSel(i)} onClick={(e) => run(r, e.ctrlKey || e.metaKey)} onAuxClick={(e) => { if (e.button === 1) run(r, true) }}>
            <span className="palette-icon"><Glyph value={r.icon} size={16} /></span>
            <span className="palette-title">{r.title}</span>
            {r.sub && <span className="palette-sub">{r.sub}</span>}
          </button>
        ))}
        {results.length === 0 && <div className="muted pad">No results</div>}
      </div>
    </Modal>
  )
}

// ---------- Trash ----------
export function TrashDialog(): JSX.Element {
  const pages = useData((d) => d.pages)
  const deleted = Object.values(pages).filter((p) => p.deletedAt && !(p.parentId && pages[p.parentId]?.deletedAt)).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
  return (
    <Modal onClose={() => setOverlay(null)} width={520}>
      <div className="modal-head"><h3>Trash</h3>{deleted.length > 0 && <ConfirmButton label="Empty trash" confirmLabel="Delete forever" onConfirm={() => deleted.forEach((p) => purgePage(p.id))} />}</div>
      <div className="modal-body">
        {deleted.length === 0 ? <Empty icon="trash" title="Trash is empty" /> : deleted.map((p) => (
          <div key={p.id} className="trash-row">
            <Glyph value={p.icon || typeInfo(p.type).icon} size={15} />
            <span className="grow ellipsis">{p.title || 'Untitled'}</span>
            <span className="muted small">{timeAgo(p.deletedAt!)}</span>
            <Button small kind="ghost" icon="restore" onClick={() => restorePage(p.id)}>Restore</Button>
            <ConfirmButton label="" confirmLabel="Delete" onConfirm={() => purgePage(p.id)} />
          </div>
        ))}
      </div>
    </Modal>
  )
}

// ---------- Shortcuts ----------
export const SHORTCUTS: [string, string][] = [
  ['Ctrl K', 'Search and commands'], ['Ctrl N', 'New page'], ['Ctrl \\', 'Toggle sidebar'], ['Ctrl ,', 'Settings'],
  ['Ctrl J', 'Assistant'], ['Ctrl Z / Ctrl Shift Z', 'Undo / redo'], ['Ctrl [ / Ctrl ]', 'Back / forward'], ['Ctrl T / Ctrl W', 'New tab / close tab'], ['Ctrl Tab', 'Next tab'], ['Ctrl Shift T', 'Reopen closed tab'], ['Ctrl or middle click', 'Open a page in a new tab'], ['Ctrl /', 'Shortcuts'], ['Ctrl Shift L', 'Toggle dark mode'], ['Ctrl Shift Space', 'Quick add task (anywhere)'], ['Ctrl / Shift click', 'Select several tasks'],
  ['Ctrl + / Ctrl -', 'Zoom text'], ['Ctrl 1…9', 'Open sidebar page 1…9'], ['/', 'Block menu (in a page)'], ['# , ## , ###', 'Headings'], ['- or *', 'Bulleted list'],
  ['[]', 'To-do block'], ['1.', 'Numbered list'], ['>>', 'Toggle block'], ['"', 'Quote'], ['---', 'Divider'], ['Tab / Shift Tab', 'Indent block'],
  ['Alt ↑ / Alt ↓', 'Move block'], ['Ctrl D', 'Duplicate block'], ['Ctrl Enter', 'Check a to-do block'], ['F2', 'Rename page in sidebar']
]
export function ShortcutsDialog(): JSX.Element {
  return (
    <Modal onClose={() => setOverlay(null)} width={520}>
      <div className="modal-head"><h3>Keyboard shortcuts</h3></div>
      <div className="modal-body shortcuts">
        {SHORTCUTS.map(([k, v]) => <div key={k} className="shortcut"><span>{v}</span><kbd>{k}</kbd></div>)}
      </div>
    </Modal>
  )
}

export { getData }
