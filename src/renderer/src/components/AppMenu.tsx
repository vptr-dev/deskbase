import { useEffect, useRef, useState } from 'react'
import { openSettings, openView, redo, setOverlay, setSettings, undo, useApp, useData } from '../store'
import { closeTab, goBack, goForward, newTab, reopenTab, useTabs } from '../lib/tabs'
import { exportPageMarkdown } from '../lib/exporters'
import { api, isDesktop } from '../lib/api'
import { Icon } from './Icon'
import { Popover, type MenuItem } from './ui'
const logo = new URL('../../../../build/icon.png', import.meta.url).href

export function AppMenu(): JSX.Element {
  const [open, setOpen] = useState(false)
  const [group, setGroup] = useState<string | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const current = useApp(s => s.current)
  const page = useData(d => current ? d.pages[current] : undefined)
  const canUndo = useApp(s => s.canUndo)
  const canRedo = useApp(s => s.canRedo)
  const tab = useTabs(s => s.tabs.find(t => t.id === s.active))
  const groups: Record<string, MenuItem[]> = {
    File: [
      { label: 'New page', hint: 'Ctrl N', onClick: () => setOverlay('newPage', { parentId: null }) },
      { label: 'New tab', hint: 'Ctrl T', onClick: () => newTab() },
      { label: 'Export page as Markdown', disabled: !page, onClick: () => page && exportPageMarkdown(page.id) },
      { label: 'Settings', hint: 'Ctrl ,', onClick: () => openSettings() }
    ],
    Edit: [
      { label: 'Undo', hint: 'Ctrl Z', disabled: !canUndo, onClick: undo },
      { label: 'Redo', hint: 'Ctrl Shift Z', disabled: !canRedo, onClick: redo },
      { label: 'Search workspace', hint: 'Ctrl K', onClick: () => setOverlay('search') }
    ],
    View: [
      { label: 'Toggle sidebar', onClick: () => setSettings(s => { s.sidebarCollapsed = !s.sidebarCollapsed }) },
      { label: 'Appearance', onClick: () => openView('@appearance') },
      { label: 'Desktop panels', onClick: () => openView('@desktop') }
    ],
    History: [
      { label: 'Back', disabled: !tab?.back.length, onClick: goBack },
      { label: 'Forward', disabled: !tab?.fwd.length, onClick: goForward },
      { label: 'Page history', disabled: !page, onClick: () => page && setOverlay('history', { pageId: page.id }) }
    ],
    Window: [
      { label: 'Close tab', hint: 'Ctrl W', onClick: () => closeTab() },
      { label: 'Reopen closed tab', hint: 'Ctrl Shift T', onClick: reopenTab },
      ...(isDesktop ? [
        { label: 'Minimize window', onClick: () => api.win.control('min') },
        { label: 'Maximize or restore window', onClick: () => api.win.control('max') }
      ] : [])
    ],
    Help: [{ label: 'Keyboard shortcuts', onClick: () => setOverlay('shortcuts') }]
  }
  const close = (): void => { setOpen(false); setGroup(null) }
  const toggle = (): void => { if (open) close(); else setOpen(true) }
  useEffect(() => {
    if (open) menu.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [open])
  const enter = (name: string): void => {
    setGroup(name)
    requestAnimationFrame(() => menu.current?.querySelector<HTMLButtonElement>('.app-submenu button:enabled')?.focus())
  }
  return <>
    <button className="app-menu-trigger no-drag" ref={trigger} title="Application menu" aria-label="Application menu"
      aria-haspopup="menu" aria-expanded={open} onMouseDown={e => e.stopPropagation()} onClick={toggle}><img src={logo} alt="" /></button>
    {open && <Popover anchor={trigger.current} onClose={() => { if (menu.current?.contains(document.activeElement)) trigger.current?.focus(); close() }}>
      <div className="app-menu" ref={menu} onKeyDown={e => {
        const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button')
        if (!button) return
        const name = button.dataset.group
        if (e.key === 'ArrowRight' && name) { e.preventDefault(); enter(name) }
        if (e.key === 'ArrowLeft' && group) {
          e.preventDefault(); menu.current?.querySelector<HTMLButtonElement>('[data-group="' + group + '"]')?.focus(); setGroup(null)
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault()
          const siblings = Array.from(button.parentElement!.querySelectorAll<HTMLButtonElement>('button:enabled'))
          siblings[(siblings.indexOf(button) + (e.key === 'ArrowDown' ? 1 : siblings.length - 1)) % siblings.length]?.focus()
        }
        if (e.key === 'Tab') { close(); trigger.current?.focus() }
      }}>
        <div className="app-menu-groups" role="menu" aria-label="Application menu">
          {Object.keys(groups).map(name => <button key={name} role="menuitem" data-group={name} aria-haspopup="menu" aria-expanded={name === group}
            className={'menu-item' + (group === name ? ' chosen' : '')} onMouseEnter={() => setGroup(name)} onClick={() => enter(name)}>
            <span className="menu-label">{name}</span><Icon name="right" size={12} />
          </button>)}
        </div>
        {group && <div className="app-submenu" role="menu" aria-label={group}>
          {groups[group].map(item => <button key={item.label} className="menu-item" role="menuitem" disabled={item.disabled}
            onClick={() => { close(); trigger.current?.focus(); item.onClick?.() }}>
            <span className="menu-label">{item.label}</span>{item.hint && <kbd>{item.hint}</kbd>}
          </button>)}
        </div>}
      </div>
    </Popover>}
  </>
}
