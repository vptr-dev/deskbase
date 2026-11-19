import { useEffect, useRef, useState } from 'react'
import { act, duplicatePage, movePage, openPage, openView, setOverlay, setSettings, trashPage, updatePage, useApp, useData } from '../store'
import { typeInfo } from '../lib/defaults'
import { addSpace, removeSpace, switchSpace } from '../lib/desktop'
import { api, type UpdateStatus } from '../lib/api'
import { exportPageMarkdown } from '../lib/exporters'
import { Glyph, Icon } from './Icon'
import { IconPickerButton, Menu, Popover } from './ui'
import { pagePath } from './MovePage'

type DropPos = 'before' | 'after' | 'inside'
let dragId: string | null = null

function PageRow({ id, depth }: { id: string; depth: number }): JSX.Element | null {
  const page = useData((d) => d.pages[id])
  const current = useApp((s) => s.current)
  const childIds = useData((d) => (d.pages[id]?.children ?? []).filter((c) => d.pages[c] && !d.pages[c].deletedAt).join(','))
  const [menu, setMenu] = useState<{ x: number; y: number } | HTMLElement | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [drop, setDrop] = useState<DropPos | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (renaming) inputRef.current?.select() }, [renaming])
  if (!page || page.deletedAt) return null
  const children = childIds ? childIds.split(',') : []
  const title = page.title || 'Untitled'
  const icon = page.icon || typeInfo(page.type).icon

  const onDragOver = (e: React.DragEvent): void => {
    if (!dragId || dragId === id) return
    e.preventDefault()
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const y = (e.clientY - r.top) / r.height
    setDrop(y < 0.28 ? 'before' : y > 0.72 ? 'after' : 'inside')
  }
  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    const pos = drop
    setDrop(null)
    if (!dragId || dragId === id || !pos) return
    const d = useApp.getState().data
    if (pos === 'inside') movePage(dragId, id, d.pages[id].children.length)
    else {
      const parent = page.parentId
      const list = parent ? d.pages[parent].children : d.rootOrder
      const idx = list.indexOf(id)
      movePage(dragId, parent, pos === 'before' ? idx : idx + 1)
    }
    dragId = null
  }

  const items = [
    { label: 'Add subpage', icon: 'plus', onClick: () => setOverlay('newPage', { parentId: id }) },
    { label: 'Rename', icon: 'edit', onClick: () => setRenaming(true), hint: 'F2' },
    { label: page.favorite ? 'Remove from favorites' : 'Add to favorites', icon: 'star', onClick: () => updatePage(id, (p) => { p.favorite = !p.favorite }) },
    { label: 'Duplicate', icon: 'copy', onClick: () => duplicatePage(id) },
    { label: 'Export as Markdown', icon: 'download', onClick: () => exportPageMarkdown(id) },
    { label: 'Move to…', icon: 'folder', onClick: () => setOverlay('movePage', { pageId: id }) },
    { label: 'Move to top level', icon: 'left', onClick: () => movePage(id, null, useApp.getState().data.rootOrder.length), disabled: !page.parentId },
    { divider: true, label: '' },
    { label: 'Move to trash', icon: 'trash', danger: true, onClick: () => trashPage(id) }
  ]

  return (
    <>
      <div
        className={`tree-row ${current === id ? 'active' : ''} ${drop ? 'drop-' + drop : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        draggable={!renaming}
        onDragStart={(e) => { dragId = id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id) }}
        onDragEnd={() => { dragId = null; setDrop(null) }}
        onDragOver={onDragOver}
        onDragLeave={() => setDrop(null)}
        onDrop={onDrop}
        onClick={() => openPage(id)}
        onDoubleClick={() => setRenaming(true)}
        onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }) }}
        onKeyDown={(e) => { if (e.key === 'F2') setRenaming(true) }}
        tabIndex={0}
        role="treeitem"
        aria-expanded={children.length ? !!page.expanded : undefined}
      >
        <button
          className={`tree-chevron ${children.length ? '' : 'invisible'} ${page.expanded ? 'open' : ''}`}
          onClick={(e) => { e.stopPropagation(); updatePage(id, (p) => { p.expanded = !p.expanded }) }}
          tabIndex={-1}
          aria-label={page.expanded ? 'Collapse' : 'Expand'}
        >
          <Icon name="chevron" size={12} stroke={2.2} />
        </button>
        <span className="tree-icon"><Glyph value={icon} size={15} color={page.iconColor || undefined} /></span>
        {renaming ? (
          <input
            ref={inputRef}
            className="tree-rename"
            defaultValue={page.title}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => { updatePage(id, (p) => { p.title = e.target.value }); setRenaming(false) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              if (e.key === 'Escape') setRenaming(false)
            }}
          />
        ) : (
          <span className={`tree-title ${page.title ? '' : 'muted'}`}>{title}</span>
        )}
        <span className="tree-actions">
          <button title="More" onClick={(e) => { e.stopPropagation(); setMenu(e.currentTarget) }}><Icon name="more" size={14} stroke={2.4} /></button>
          <button title="Add subpage" onClick={(e) => { e.stopPropagation(); setOverlay('newPage', { parentId: id }) }}><Icon name="plus" size={14} stroke={2} /></button>
        </span>
      </div>
      {menu && <Popover anchor={menu} onClose={() => setMenu(null)}><Menu items={items} onClose={() => setMenu(null)} /></Popover>}
      {page.expanded && children.map((c) => <PageRow key={c} id={c} depth={depth + 1} />)}
    </>
  )
}

function RootDrop(): JSX.Element {
  const [over, setOver] = useState(false)
  return (
    <div
      className={`tree-root-drop ${over ? 'over' : ''}`}
      onDragOver={(e) => { if (dragId) { e.preventDefault(); setOver(true) } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (dragId) movePage(dragId, null, useApp.getState().data.rootOrder.length); dragId = null }}
    />
  )
}

function UpdatePill(): JSX.Element | null {
  const [s, setS] = useState<UpdateStatus>({ state: 'idle' })
  useEffect(() => {
    api.updater.status().then(setS)
    return api.updater.onStatus(setS)
  }, [])
  if (s.state === 'ready') return <button className="update-pill" onClick={() => api.updater.install()}><Icon name="download" size={14} /> Restart to update to {s.version}</button>
  if (s.state === 'downloading') return <div className="update-pill passive">Downloading update… {s.percent}%</div>
  return null
}

export function Sidebar(): JSX.Element {
  const rootIds = useData((d) => d.rootOrder.filter((id) => d.pages[id] && !d.pages[id].deletedAt).join(','))
  const favIds = useData((d) => Object.values(d.pages).filter((p) => p.favorite && !p.deletedAt).map((p) => p.id).join(','))
  const width = useData((d) => d.settings.sidebarWidth)
  const collapsed = useData((d) => d.settings.sidebarCollapsed)
  const current = useApp((s) => s.current)
  const pages = useData((d) => d.pages)
  const roots = rootIds ? rootIds.split(',') : []
  const favs = favIds ? favIds.split(',') : []
  const [filter, setFilter] = useState<string | null>(null)
  const fq = (filter ?? '').trim().toLowerCase()
  const data = useData((d) => d)
  const matches = fq ? Object.values(pages).filter((p) => !p.deletedAt && !p.rowOf && (p.title || 'Untitled').toLowerCase().includes(fq)).sort((a, b) => (a.title || '').localeCompare(b.title || '')) : []

  const startResize = (e: React.MouseEvent): void => {
    e.preventDefault()
    const startX = e.clientX
    const startW = width
    const move = (ev: MouseEvent): void => {
      const w = Math.max(200, Math.min(420, startW + ev.clientX - startX))
      document.documentElement.style.setProperty('--sidebar-w', w + 'px')
    }
    const up = (ev: MouseEvent): void => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      const w = Math.max(200, Math.min(420, startW + ev.clientX - startX))
      setSettings((s) => { s.sidebarWidth = w })
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`} aria-hidden={collapsed}>
      <div className="sidebar-top drag">
        <SpaceSwitcher />
        <button className="icon-btn no-drag" title="Collapse sidebar (Ctrl+\)" onClick={() => setSettings((s) => { s.sidebarCollapsed = true })}>
          <Icon name="left" size={15} stroke={2} />
        </button>
      </div>


      <nav className="sidebar-nav">
        <button className="nav-item" onClick={() => setOverlay('search')}><Icon name="search" size={15} /> <span>Search</span><kbd>Ctrl K</kbd></button>
        <button className="nav-item" onClick={() => setOverlay('newPage', { parentId: null })}><Icon name="plus" size={15} /> <span>New page</span><kbd>Ctrl N</kbd></button>
        <button className={`nav-item ${current === '@desktop' ? 'active' : ''}`} onClick={() => openView('@desktop')}><Icon name="monitor" size={15} /> <span>Desktop</span></button>
        <button className="nav-item" onClick={() => setOverlay('values')}><Icon name="diamond" size={15} /> <span>Values</span></button>
      </nav>

      <div className="sidebar-scroll" role="tree">
        {favs.length > 0 && (
          <>
            <div className="sidebar-section">Favorites</div>
            {favs.map((id) => (
              <button key={id} className={`tree-row fav ${current === id ? 'active' : ''}`} style={{ paddingLeft: 8 }} onClick={() => openPage(id)}>
                <span className="tree-chevron invisible" />
                <span className="tree-icon"><Glyph value={pages[id].icon || typeInfo(pages[id].type).icon} size={15} color={pages[id].iconColor || undefined} /></span>
                <span className="tree-title">{pages[id].title || 'Untitled'}</span>
              </button>
            ))}
          </>
        )}
        <div className="sidebar-section row between">
          <span>Pages</span>
          <button className="section-btn" title="Filter pages" onClick={() => setFilter(filter === null ? '' : null)}><Icon name={filter === null ? 'filter' : 'x'} size={12} stroke={2} /></button>
        </div>
        {filter !== null && (
          <input id="sidebar-filter" autoFocus className="input input-sm sidebar-filter" placeholder="Filter pages" value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setFilter(null)
              if (e.key === 'Enter' && matches[0]) openPage(matches[0].id)
            }} />
        )}
        {fq ? (
          matches.length ? matches.map((p) => (
            <button key={p.id} className={`tree-row ${current === p.id ? 'active' : ''}`} style={{ paddingLeft: 8 }} onClick={() => openPage(p.id)} title={pagePath(data, p.id)}>
              <span className="tree-chevron invisible" />
              <span className="tree-icon"><Glyph value={p.icon || typeInfo(p.type).icon} size={15} color={p.iconColor || undefined} /></span>
              <span className="tree-title">{p.title || 'Untitled'}</span>
              {p.parentId && <span className="tree-path ellipsis">{pagePath(data, p.id)}</span>}
            </button>
          )) : <div className="muted small pad">No pages match</div>
        ) : roots.map((id) => <PageRow key={id} id={id} depth={0} />)}
        <button className="tree-row add-row" style={{ paddingLeft: 8 }} onClick={() => setOverlay('newPage', { parentId: null })}>
          <span className="tree-chevron invisible" />
          <span className="tree-icon"><Icon name="plus" size={14} /></span>
          <span className="tree-title">Add a page</span>
        </button>
        <RootDrop />
      </div>

      <div className="sidebar-bottom">
        <UpdatePill />
        <button className={`nav-item ${current === '@appearance' ? 'active' : ''}`} onClick={() => openView('@appearance')}><Icon name="palette" size={15} /> <span>Appearance</span></button>
        <button className="nav-item" onClick={() => setOverlay('trash')}><Icon name="trash" size={15} /> <span>Trash</span></button>
        <button className="nav-item" onClick={() => setOverlay('settings')}><Icon name="settings" size={15} /> <span>Settings</span><kbd>Ctrl ,</kbd></button>
      </div>
      <div className="sidebar-resizer" onMouseDown={startResize} onDoubleClick={() => setSettings((s) => { s.sidebarWidth = 248 })} />
    </aside>
  )
}

/** Workspaces: each one keeps its own panels on the screen. */
function SpaceSwitcher(): JSX.Element {
  const spaces = useData((d) => d.desktop.spaces)
  const activeId = useData((d) => d.desktop.active)
  const counts = useData((d) => d.desktop.widgets.reduce<Record<string, number>>((m, w) => { if (!w.hidden) m[w.space] = (m[w.space] ?? 0) + 1; return m }, {}))
  const [el, setEl] = useState<HTMLElement | null>(null)
  const active = spaces.find((s) => s.id === activeId) ?? spaces[0]
  const rename = (name: string): void => act((d) => { const s = d.desktop.spaces.find((x) => x.id === activeId); if (s) s.name = name }, { key: 'space-name:' + activeId })
  const reicon = (icon: string): void => act((d) => { const s = d.desktop.spaces.find((x) => x.id === activeId); if (s) s.icon = icon || 'monitor' })
  return (
    <>
      <button className="space-chip no-drag" onClick={(e) => setEl(e.currentTarget)} title="Switch workspace">
        <span className="space-icon"><Glyph value={active?.icon} fallback="monitor" size={14} /></span>
        <span className="space-name">{active?.name || 'Workspace'}</span>
        <Icon name="down" size={13} className="space-caret" />
      </button>
      {el && (
        <Popover anchor={el} onClose={() => setEl(null)} width={250}>
          <div className="space-menu">
            {spaces.map((s) => (
              <button key={s.id} className={`space-item ${s.id === activeId ? 'active' : ''}`} onClick={() => switchSpace(s.id)}>
                <span className="space-icon"><Glyph value={s.icon} fallback="monitor" size={14} /></span>
                <span className="grow ellipsis">{s.name}</span>
                <span className="muted small">{counts[s.id] ?? 0}</span>
              </button>
            ))}
            <div className="menu-divider" />
            <div className="space-edit">
              <IconPickerButton size="sm" value={active?.icon ?? 'monitor'} onChange={reicon} placeholder="monitor" />
              <input className="input input-sm grow" value={active?.name ?? ''} placeholder="Workspace name" onChange={(e) => rename(e.target.value)} />
            </div>
            <button className="menu-item" onClick={() => { addSpace(false); setEl(null) }}><span className="menu-icon"><Icon name="plus" size={14} /></span><span className="menu-label">New workspace</span></button>
            <button className="menu-item" onClick={() => { addSpace(true); setEl(null) }}><span className="menu-icon"><Icon name="copy" size={14} /></span><span className="menu-label">New from this layout</span></button>
            <button className="menu-item" onClick={() => { openView('@desktop'); setEl(null) }}><span className="menu-icon"><Icon name="layout" size={14} /></span><span className="menu-label">Arrange panels…</span></button>
            {spaces.length > 1 && <button className="menu-item danger" onClick={() => { removeSpace(activeId); setEl(null) }}><span className="menu-icon"><Icon name="trash" size={14} /></span><span className="menu-label">Delete this workspace</span></button>}
          </div>
        </Popover>
      )}
    </>
  )
}
