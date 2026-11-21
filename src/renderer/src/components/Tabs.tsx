import { useState } from 'react'
import { isView, setOverlay, useData } from '../store'
import { typeInfo } from '../lib/defaults'
import { closeOtherTabs, closeTab, moveTab, newTab, openFromClick, switchTab, useTabs } from '../lib/tabs'
import { Glyph, Icon } from './Icon'
import { Menu, Popover } from './ui'
import type { Page } from '../types'

function tabLook(page: string | null, pages: Record<string, Page>): { title: string; icon: string; color?: string } {
  if (page === '@desktop') return { title: 'Desktop', icon: 'monitor' }
  if (page === '@settings') return { title: 'Settings', icon: 'settings' }
  if (page === '@appearance') return { title: 'Appearance', icon: 'palette' }
  if (page === '@assistant') return { title: 'Assistant', icon: 'sparkle' }
  if (page === '@connections') return { title: 'Connections', icon: 'plug' }
  const p = page && !isView(page) ? pages[page] : undefined
  if (!p || p.deletedAt) return { title: 'New tab', icon: 'grid' }
  return { title: p.title || 'Untitled', icon: p.icon || typeInfo(p.type).icon, color: p.iconColor || undefined }
}

/** The row of open tabs above the top bar; shown once two or more tabs are open. */
export function TabStrip({ captionSpace }: { captionSpace: boolean }): JSX.Element {
  const tabs = useTabs((s) => s.tabs)
  const active = useTabs((s) => s.active)
  const pages = useData((d) => d.pages)
  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)

  return (
    <div className="tabstrip drag" role="tablist">
      {tabs.map((t, i) => {
        const look = tabLook(t.page, pages)
        return (
          <div
            key={t.id}
            role="tab"
            aria-selected={t.id === active}
            tabIndex={0}
            title={look.title}
            className={`tab no-drag ${t.id === active ? 'active' : ''} ${over === i && drag && drag !== t.id ? 'drop-before' : ''}`}
            draggable
            onDragStart={(e) => { setDrag(t.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.id) }}
            onDragEnd={() => { setDrag(null); setOver(null) }}
            onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(i) } }}
            onDrop={(e) => { e.preventDefault(); if (drag) moveTab(drag, i); setDrag(null); setOver(null) }}
            onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); if (e.button === 0) switchTab(t.id) }}
            onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); closeTab(t.id) } }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') switchTab(t.id) }}
            onContextMenu={(e) => { e.preventDefault(); setMenu({ id: t.id, x: e.clientX, y: e.clientY }) }}
          >
            <Glyph value={look.icon} size={14} color={look.color} />
            <span className="tab-title">{look.title}</span>
            <button className="tab-x" title="Close tab (Ctrl+W)" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); closeTab(t.id) }}>
              <Icon name="x" size={12} stroke={2.2} />
            </button>
          </div>
        )
      })}
      <div
        className={`tab-end ${over === tabs.length ? 'drop-before' : ''}`}
        onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(tabs.length) } }}
        onDrop={(e) => { e.preventDefault(); if (drag) moveTab(drag, tabs.length); setDrag(null); setOver(null) }}
      >
        <button className="icon-btn tab-new" title="New tab (Ctrl+T)" onClick={() => newTab()}><Icon name="plus" size={14} stroke={2} /></button>
      </div>
      <div className="spacer" />
      {captionSpace && <div className="caption-space" />}
      {menu && (
        <Popover anchor={menu} onClose={() => setMenu(null)}>
          <Menu onClose={() => setMenu(null)} items={[
            { label: 'New tab', icon: 'plus', hint: 'Ctrl T', onClick: () => newTab() },
            { label: 'Duplicate tab', icon: 'copy', onClick: () => newTab(tabs.find((t) => t.id === menu.id)?.page ?? null) },
            { divider: true, label: '' },
            { label: 'Close tab', icon: 'x', hint: 'Ctrl W', onClick: () => closeTab(menu.id) },
            { label: 'Close other tabs', onClick: () => closeOtherTabs(menu.id), disabled: tabs.length < 2 }
          ]} />
        </Popover>
      )}
    </div>
  )
}

/** What an empty tab shows: recent pages and favorites, to jump to one. */
export function StartView(): JSX.Element {
  const pages = useData((d) => d.pages)
  const recent = useData((d) => d.recent)
  const rootOrder = useData((d) => d.rootOrder)
  const live = (id: string): boolean => !!pages[id] && !pages[id].deletedAt
  const recentIds = recent.filter(live).slice(0, 8)
  const favIds = Object.values(pages).filter((p) => p.favorite && !p.deletedAt).map((p) => p.id).slice(0, 8)
  const topIds = rootOrder.filter(live).filter((id) => !recentIds.includes(id)).slice(0, 8)

  const Card = ({ id }: { id: string }): JSX.Element => {
    const p = pages[id]
    return (
      <button className="start-card" onClick={(e) => openFromClick(id, e)} onAuxClick={(e) => { if (e.button === 1) openFromClick(id, e) }} onMouseDown={(e) => { if (e.button === 1) e.preventDefault() }}>
        <span className="start-card-icon"><Glyph value={p.icon || typeInfo(p.type).icon} size={18} color={p.iconColor || undefined} /></span>
        <span className="start-card-title">{p.title || 'Untitled'}</span>
        <span className="start-card-meta">{typeInfo(p.type).name}</span>
      </button>
    )
  }
  const Section = ({ title, ids }: { title: string; ids: string[] }): JSX.Element | null =>
    ids.length ? (
      <section className="start-section">
        <div className="start-head">{title}</div>
        <div className="start-grid">{ids.map((id) => <Card key={id} id={id} />)}</div>
      </section>
    ) : null

  return (
    <div className="page start-view">
      <div className="start-actions">
        <button className="btn" onClick={() => setOverlay('search')}><Icon name="search" size={15} /> Search pages <kbd>Ctrl K</kbd></button>
        <button className="btn" onClick={() => setOverlay('newPage', { parentId: null })}><Icon name="plus" size={15} /> New page <kbd>Ctrl N</kbd></button>
      </div>
      <Section title="Recent" ids={recentIds} />
      <Section title="Favorites" ids={favIds} />
      <Section title="Pages" ids={topIds} />
    </div>
  )
}
