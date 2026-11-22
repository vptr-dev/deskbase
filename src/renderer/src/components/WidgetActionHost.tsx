import { useEffect, useRef, useState, type HTMLAttributes, type MouseEvent } from 'react'
import { act, getData, toast, useData } from '../store'
import type { Block, Widget } from '../types'
import { isService } from '../../../shared/services'
import { loadFeed } from '../lib/connections'
import { api } from '../lib/api'
import { newPage } from '../lib/defaults'
import { ensureTaskPlanner, type WidgetSource } from '../lib/widgetSources'
import { today, uid } from '../lib/util'
import { QuickAdd } from './TaskItems'
import { Icon } from './Icon'
import { Popover, useDoc, type MenuItem } from './ui'
import { WidgetItemMenu } from './widgetActionContext'

type Action = MenuItem & { form?: boolean }
type PageInsert = { label: string; block: () => Block }
interface MenuState {
  anchor: { x: number; y: number }; title: string; item: Action[]; widget: Action[]
}
interface HostProps extends HTMLAttributes<HTMLDivElement> {
  widget: Pick<Widget,'id'|'type'|'config'>; source: WidgetSource; name: string
  globalActions?: Action[]; desktopId?: string; resetTimer?: () => void
}
function controlActions(root: HTMLElement, attribute: string): Action[] {
  const selector = '[' + attribute + ']'
  const controls = [...(root.matches(selector) ? [root] : []), ...Array.from(root.querySelectorAll<HTMLElement>(selector))]
  return controls.filter(el => el.closest('[data-widget-host]') === root.closest('[data-widget-host]')).map(el => ({
    label: el.getAttribute(attribute) || el.title || el.innerText.trim(), disabled: el.matches(':disabled'),
    onClick: () => { if (el.matches('input,textarea')) el.focus(); else el.click() }
  })).filter(a => a.label)
}

function Section({ label, actions, close }: { label: string; actions: Action[]; close: () => void }): JSX.Element | null {
  const available = actions.filter(a => !a.divider)
  if (!available.length) return null
  return <section className="widget-menu-section" role="group" aria-label={label}><div className="widget-menu-heading">{label}</div>
    {available.map((a,i) => <button key={i} type="button" role="menuitem" className={'menu-item' + (a.danger ? ' danger' : '')} disabled={a.disabled} onClick={() => { if (!a.form) close(); a.onClick?.() }}>
      <Icon name={a.checked ? 'check' : a.icon || 'chevron-right'} size={14} /><span className="menu-label">{a.label}</span></button>)}</section>
}

export function WidgetActionHost({ widget: w, source, name, globalActions = [], desktopId, resetTimer, children, ...host }: HostProps): JSX.Element {
  const root = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const doc = useDoc()
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [task, setTask] = useState<{ title: string; notes: string } | null>(null)
  const [insert, setInsert] = useState<PageInsert | null>(null)
  const [destination, setDestination] = useState('')
  const [query, setQuery] = useState('')
  const [newName, setNewName] = useState('')
  const pages = useData(d => d.pages)
  const close = (): void => { setMenu(null); setTask(null); setInsert(null) }
  const focus = (): Promise<unknown> => desktopId ? api.desk.focus(desktopId).catch(() => {}) : Promise.resolve()
  const openTask = (title = '', notes = ''): void => {
    setDestination(w.config.pageId || ''); setTask({ title, notes })
  }
  const choosePage = (label: string, block: () => Block): void => {
    setQuery(''); setNewName(''); setInsert({ label, block })
  }
  const saveTo = (id?: string): void => {
    if (!insert) return
    const block = insert.block()
    act(d => {
      const p = id ? d.pages[id] : newPage('doc', newName.trim() || 'Untitled')
      if (!p || p.deletedAt || p.locked || p.type !== 'doc') return
      if (!id) { d.pages[p.id] = p; d.rootOrder.push(p.id) }
      p.blocks.push(block); p.updatedAt = Date.now()
    })
    close(); toast('Added to page', { undo: true })
  }
  const copy = (text: string): void => {
    void doc.defaultView?.navigator.clipboard.writeText(text).then(() => toast('Copied')).catch(() => toast('Clipboard unavailable'))
  }
  const show = (e: MouseEvent, itemTitle = '', supplied: Action[] = []): void => {
    const el = e.target as HTMLElement
    const panel = root.current
    if (!panel || !panel.contains(el) || el.closest('[data-widget-host]') !== panel) return
    e.preventDefault(); e.stopPropagation()
    const item = el.closest<HTMLElement>('[data-widget-item]')
    const title = itemTitle || item?.dataset.widgetItem || ''
    const url = item?.dataset.itemUrl || ''
    const summary = item?.dataset.itemSummary || ''
    const rows: Action[] = supplied.filter(a => !(desktopId && a.label === 'Open'))
    const field = el.closest<HTMLInputElement | HTMLTextAreaElement>('input:not([type=password]),textarea')
    if (field && field.type !== 'checkbox') {
      itemTitle = 'Text'
      rows.push({label:'Copy text',icon:'copy',disabled:!field.value,onClick:() => {
        const a = field.selectionStart, b = field.selectionEnd
        copy(a !== null && b !== null && a !== b ? field.value.slice(a,b) : field.value)
      }})
    }
    if (item) {
      rows.push(...controlActions(item, 'data-item-action'))
      const check = item.querySelector<HTMLButtonElement>('button[role=checkbox]')
      if (check) rows.push({label: check.getAttribute('aria-checked') === 'true' ? 'Uncheck item' : 'Check item', icon:'check', onClick: () => check.click()})
    }
    if (url) rows.push({ label: 'Open original', icon: 'external', onClick: () => { void api.openExternal(url) } },
      { label: 'Copy link', icon: 'link', onClick: () => copy(url) })
    if (title) {
      rows.push({ label: 'Copy title', icon: 'copy', onClick: () => copy(title) })
      if (!supplied.length) rows.push({ label: 'Make a task', form: true, icon: 'square-check-big', onClick: () => openTask(title, [summary,url].filter(Boolean).join('\n')) })
      rows.push({ label: 'Save item to page', form: true, icon: 'file-plus', onClick: () => choosePage('Save item to page', () => url ? { id: uid(), type: 'bookmark', url, text: title, meta: { title, desc: summary } } : { id: uid(), type: 'p', text: [title,summary].filter(Boolean).join('\n') }) })
    }
    const actions: Action[] = []
    if (w.type === 'tasks' || w.type === 'quickadd' || w.type === 'agenda' || w.type === 'week' || w.type === 'calendar')
      actions.push({ label: 'Add a task', form: true, icon: 'plus', onClick: () => openTask() })
    actions.push(...controlActions(panel, 'data-widget-action'))
    if (w.type === 'timer' && resetTimer) actions.push({ label: 'Reset timer', icon: 'rotate-ccw', onClick: resetTimer })
    const kind = w.type === 'events' ? 'calendar' : w.type === 'feed' ? 'rss' : w.type
    if (isService(w.type) || ['events','feed','github','mail','todoist'].includes(w.type)) {
      const eligible = getData().connections.filter(c => !c.off && c.kind === kind)
      const conns = w.type === 'events' ? eligible.filter(c => !w.config.conns?.length || w.config.conns.includes(c.id)) :
        eligible.filter(c => c.id === (w.config.conn && w.config.conn !== 'first' ? w.config.conn : eligible[0]?.id))
      if (conns.length) actions.push({ label: 'Refresh connection', icon: 'refresh', onClick: () => {
        void Promise.all(conns.map(c => loadFeed(c,true))).then(results => toast(results.every(r => r.ok) ? 'Connection refreshed' : results.find(r => !r.ok)?.error || 'Refresh failed'))
      } })
    }
    const content = panel.querySelector<HTMLElement>('.dw-body, .widget-body')?.innerText.trim()
    if (content) {
      actions.push({ label: 'Copy widget text', icon: 'copy', onClick: () => copy(content) },
        { label: 'Save snapshot to page', form: true, icon: 'file-plus', onClick: () => choosePage('Save snapshot to page', () => ({ id: uid(), type: 'quote', text: content })) })
    }
    actions.push({ label: 'Embed widget in page', form: true, icon: 'embed', onClick: () => choosePage('Embed widget in page', () => ({ id: uid(), type: 'widget', text: name, widgetSource: source })) })
    setTask(null); setInsert(null)
    setMenu({ anchor: { x: e.clientX, y: e.clientY }, title: title || itemTitle, item: rows, widget: actions })
  }
  useEffect(() => {
    if (!menu) return
    let live = true
    void focus().then(() => {
      if (live) body.current?.querySelector<HTMLElement>(task ? '.quickadd-input' : insert ? 'input' : '[role=menuitem]:not(:disabled)')?.focus({preventScroll:true})
    })
    const blur = (): void => close()
    doc.defaultView?.addEventListener('blur', blur)
    return () => { live = false; doc.defaultView?.removeEventListener('blur', blur) }
  }, [menu, task, insert, desktopId, doc])
  const planners = Object.values(pages).filter(p => !p.deletedAt && ['tasks','board','project'].includes(p.type))
  return <div {...host} ref={root} data-widget-host="" onContextMenu={e => show(e)}>
    <WidgetItemMenu.Provider value={show}>{children}</WidgetItemMenu.Provider>
    {menu && <Popover anchor={menu.anchor} width={260} className="widget-action-popover" theme={root.current?.dataset.theme} style={Object.fromEntries(Object.entries(host.style ?? {}).filter(([k]) => k.startsWith('--')))} onClose={close}>
      <div ref={body} className="widget-action-content" onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} onContextMenu={e => {e.preventDefault();e.stopPropagation()}} onKeyDown={e => {
        if (task || insert || !['ArrowDown','ArrowUp','Home','End'].includes(e.key)) return
        const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role=menuitem]:not(:disabled)'))
        if (!buttons.length) return
        e.preventDefault()
        const i = buttons.indexOf(doc.activeElement as HTMLButtonElement)
        buttons[e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length].focus()
      }}>
      {task ? <div className="widget-menu-form"><strong>Add a task</strong>
        <label>Planner<select className="input input-sm" value={planners.some(p => p.id === destination) ? destination : ''} onChange={e => setDestination(e.target.value)}><option value="">Default to-do list</option>{planners.map(p => <option key={p.id} value={p.id}>{p.title || 'Untitled'}</option>)}</select></label>
        <QuickAdd schedulePicker submitButton pageId={destination} resolvePage={() => ensureTaskPlanner(destination)} initialTitle={task.title} defaults={{ notes: task.notes, due: w.type === 'tasks' && (w.config.filter ?? 'today') === 'today' ? today() : null }} onAdded={close} onEscape={close} /></div> :
      insert ? <div className="widget-menu-form"><strong>{insert.label}</strong><input aria-label="Find page" className="input input-sm" placeholder="Find a page" value={query} onChange={e => setQuery(e.target.value)} />
        {Object.values(pages).filter(p => p.type === 'doc' && !p.locked && !p.deletedAt && !p.rowOf && (p.title || 'Untitled').toLowerCase().includes(query.toLowerCase())).map(p => <button key={p.id} className="menu-item" onClick={() => saveTo(p.id)}>{p.title || 'Untitled'}</button>)}
        <form className="row gap-xs" onSubmit={e => { e.preventDefault(); saveTo() }}><input className="input input-sm" aria-label="New page name" placeholder="New page name" value={newName} onChange={e => setNewName(e.target.value)} /><button className="btn btn-sm" disabled={!newName.trim()}>Create</button></form></div> :
      <div role="menu" aria-label={name + ' actions'}>{[[menu.title,menu.item],[name,menu.widget],[desktopId ? 'Desktop' : 'Dashboard',globalActions]].map(([title,actions],i) =>
        <Section key={i} label={String(title)} actions={actions as Action[]} close={close} />)}</div>}
      </div></Popover>}
  </div>
}
