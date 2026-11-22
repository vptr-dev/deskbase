import { useEffect, useMemo, useRef, useState } from 'react'
import { act, createPage, openPage, getData, moveOverdueToToday, setTaskDone, toast, updatePage, useData } from '../store'
import type { Task, TaskStatus } from '../types'
import { addDays, friendlyDay, today, uid } from '../lib/util'
import { QuickAdd, TaskRow, PRIORITY, useTaskDrawer } from '../components/TaskItems'
import { Button, Modal, MenuButton, Progress, Segmented } from '../components/ui'
import { Icon } from '../components/Icon'

type Filter = 'all' | 'today' | 'upcoming' | 'overdue' | 'nodate' | 'done'
type Sort = 'manual' | 'due' | 'priority' | 'created' | 'title'
type Group = 'none' | 'due' | 'priority' | 'tag'

export function filterTasks(tasks: Task[], filter: Filter, q: string, tag: string | null): Task[] {
  const t = today()
  const ql = q.toLowerCase()
  return tasks.filter((x) => {
    if (x.archived) return false
    if (tag && !x.tags.includes(tag)) return false
    if (ql && !(x.title.toLowerCase().includes(ql) || x.notes.toLowerCase().includes(ql) || x.tags.some((g) => g.includes(ql)))) return false
    switch (filter) {
      case 'today': return !x.done && !!x.due && x.due <= t
      case 'upcoming': return !x.done && !!x.due && x.due > t
      case 'overdue': return !x.done && !!x.due && x.due < t
      case 'nodate': return !x.done && !x.due
      case 'done': return x.done
      default: return true
    }
  })
}

export function sortTasks(tasks: Task[], sort: Sort): Task[] {
  const arr = [...tasks]
  arr.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    switch (sort) {
      case 'due': return (a.due ?? '9999') .localeCompare(b.due ?? '9999') || (a.time ?? '').localeCompare(b.time ?? '')
      case 'priority': return b.priority - a.priority
      case 'created': return b.createdAt - a.createdAt
      case 'title': return a.title.localeCompare(b.title)
      default: return a.order - b.order
    }
  })
  return arr
}

export function groupTasks(tasks: Task[], group: Group): { key: string; label: string; items: Task[] }[] {
  if (group === 'none') return [{ key: 'all', label: '', items: tasks }]
  const map = new Map<string, { label: string; items: Task[]; rank: string }>()
  const t = today()
  for (const x of tasks) {
    let key = ''
    let label = ''
    let rank = ''
    if (group === 'due') {
      if (x.done) { key = 'done'; label = 'Completed'; rank = 'z' }
      else if (!x.due) { key = 'none'; label = 'No date'; rank = 'y' }
      else if (x.due < t) { key = 'over'; label = 'Overdue'; rank = '0' }
      else if (x.due === t) { key = 'today'; label = 'Today'; rank = '1' }
      else if (x.due === addDays(t, 1)) { key = 'tom'; label = 'Tomorrow'; rank = '2' }
      else if (x.due <= addDays(t, 7)) { key = 'week'; label = 'Next 7 days'; rank = '3' }
      else { key = 'later'; label = 'Later'; rank = '4' }
    } else if (group === 'priority') {
      key = String(x.priority); label = PRIORITY[x.priority].label + ' priority'; rank = String(9 - x.priority)
    } else {
      key = x.tags[0] ?? '~'; label = x.tags[0] ? '#' + x.tags[0] : 'No tag'; rank = x.tags[0] ?? '~'
    }
    if (!map.has(key)) map.set(key, { label, items: [], rank })
    map.get(key)!.items.push(x)
  }
  return [...map.entries()].sort((a, b) => a[1].rank.localeCompare(b[1].rank)).map(([key, v]) => ({ key, label: v.label, items: v.items }))
}

export function TasksPage({ pageId }: { pageId: string }): JSX.Element {
  const all = useData((d) => d.tasks)
  const pages = useData(d => d.pages)
  const page = pages[pageId]
  const settings = page?.view ?? {}
  const tabs: { id: string; name: string; options: Record<string, any> }[] = settings.taskViews ?? []
  const tab = tabs.find(v => v.id === settings.activeView) ?? tabs[0]
  const view = tab?.options ?? settings
  const [naming, setNaming] = useState<'planner' | 'view' | 'rename' | null>(null)
  const [name, setName] = useState('')
  const askName = (kind: typeof naming, value = ''): void => { setName(value); setNaming(kind) }
  const saveName = (): void => {
    if (!name.trim()) return
    if (naming === 'planner') createPage('tasks', null, name.trim())
    else updatePage(pageId, p => {
      p.view ??= {}
      if (naming === 'rename' && tab) {
        const current = p.view.taskViews.find((v: {id: string}) => v.id === tab.id)
        if (current) current.name = name.trim()
        return
      }
      const { taskViews, activeView, ...legacy } = settings
      const first = { id: uid(), name: 'Tasks', options: legacy }
      const next = { id: uid(), name: name.trim(), options: { ...(tab?.options ?? legacy) } }
      p.view.taskViews = [...(tabs.length ? tabs : [first]), next]
      p.view.activeView = next.id
    })
    setNaming(null)
  }
  const showCompleted = useData((d) => d.settings.showCompleted)
  const tagColors = useData((d) => d.tags)
  const q: string = view.query ?? ''
  const [, openTask, drawer] = useTaskDrawer()
  const dragId = useRef<string | null>(null)
  const filter: Filter = view.filter ?? 'all'
  const sort: Sort = view.sort ?? 'manual'
  const group: Group = view.group ?? 'none'
  const tag: string | null = view.tag ?? null
  const hideDone = view.hideDone ?? !showCompleted
  const setView = (k: string, v: unknown): void => updatePage(pageId, (p) => { p.view ??= {}
    const current = p.view.taskViews?.find((x: {id: string}) => x.id === tab?.id)
    if (current) current.options[k] = v
    else p.view[k] = v })

  const mine = useMemo(() => Object.values(all).filter((t) => t.pageId === pageId), [all, pageId])
  const visible = useMemo(() => {
    let list = filterTasks(mine, filter, q, tag)
    if (hideDone && filter !== 'done') list = list.filter((t) => !t.done)
    return sortTasks(list, sort)
  }, [mine, filter, q, tag, hideDone, sort])
  const groups = groupTasks(visible, group)
  const open = mine.filter((t) => !t.done).length
  const doneToday = mine.filter((t) => t.done && t.doneAt && new Date(t.doneAt).toDateString() === new Date().toDateString()).length
  const tags = [...new Set(mine.flatMap((t) => t.tags))].sort()
  const pct = mine.length ? mine.filter((t) => t.done).length / mine.length : 0
  const overdueCount = mine.filter((t) => !t.done && !t.archived && t.due && t.due < today()).length
  const [selected, setSelected] = useState<string[]>([])
  const anchor = useRef<string | null>(null)
  const order = groups.flatMap((g) => g.items.map((t) => t.id))
  const select = (id: string, range: boolean): void => {
    if (range && anchor.current && order.includes(anchor.current)) {
      const [a, b] = [order.indexOf(anchor.current), order.indexOf(id)].sort((x, y) => x - y)
      setSelected((s) => [...new Set([...s, ...order.slice(a, b + 1)])])
    } else {
      anchor.current = id
      setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
    }
  }
  // Drop ids that disappeared (deleted, filtered out).
  const live = selected.filter((id) => order.includes(id))
  useEffect(() => {
    if (!live.length) return
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setSelected([]) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [live.length])

  const dropOn = (target: Task): void => {
    const from = dragId.current
    dragId.current = null
    if (!from || from === target.id) return
    act((d) => {
      const list = Object.values(d.tasks).filter((t) => t.pageId === pageId).sort((a, b) => a.order - b.order)
      const fi = list.findIndex((t) => t.id === from)
      const [m] = list.splice(fi, 1)
      const ti = list.findIndex((t) => t.id === target.id)
      list.splice(ti, 0, m)
      list.forEach((t, i) => { d.tasks[t.id].order = i })
    })
    if (sort !== 'manual') setView('sort', 'manual')
  }

  return (
    <div className="tasks-page" data-hide-fields={(view.hiddenFields ?? []).join(' ')}>
      <div className="planner-nav">
        {page?.type === 'tasks' && <><select aria-label="Task planner" className="input input-sm planner-select" value={pageId} onChange={e => openPage(e.target.value)}>
          {Object.values(pages).filter(p => p.type === 'tasks' && !p.deletedAt).map(p => <option key={p.id} value={p.id}>{p.title || 'Untitled planner'}</option>)}
        </select><Button small kind="ghost" icon="plus" onClick={() => askName('planner')}>New planner</Button></>}
        <div className="spacer" /><Button small kind="ghost" icon="plus" onClick={() => askName('view')}>Add view</Button>
      </div>
      {tab && <div className="planner-tabs" role="tablist" aria-label="Saved task views">{tabs.map(v =>
        <button role="tab" aria-selected={v.id === tab.id} key={v.id} className="chip-btn" onClick={() => updatePage(pageId, p => { p.view!.activeView = v.id })}>{v.name}</button>)}
        <MenuButton title="View options" items={[
          { label: 'Rename view', onClick: () => askName('rename', tab.name) },
          { label: 'Remove view', disabled: tabs.length < 2, onClick: () => updatePage(pageId, p => {
            p.view!.taskViews = tabs.filter(v => v.id !== tab.id); p.view!.activeView = p.view!.taskViews[0].id
          }) }
        ]} /></div>}
      {naming && <Modal width={360} onClose={() => setNaming(null)}><form onSubmit={e => { e.preventDefault(); saveName() }}>
        <div className="modal-head"><h3>{naming === 'planner' ? 'New task planner' : naming === 'rename' ? 'Rename view' : 'New saved view'}</h3></div>
        <div className="modal-body"><label>Name<input className="input" autoFocus value={name} placeholder={naming === 'planner' ? 'Work or Home' : 'Upcoming'} onChange={e => setName(e.target.value)} /></label></div>
        <div className="modal-foot"><button type="submit" className="btn btn-primary" disabled={!name.trim()}>Save</button></div></form></Modal>}
      <div className="toolbar">
        <Segmented small value={filter} onChange={(v) => setView('filter', v)} options={[
          { value: 'all', label: 'All' }, { value: 'today', label: 'Today' }, { value: 'upcoming', label: 'Upcoming' },
          { value: 'overdue', label: 'Overdue' }, { value: 'nodate', label: 'No date' }, { value: 'done', label: 'Done' }
        ]} />
        <div className="spacer" />
        <div className="search-mini">
          <Icon name="search" size={14} />
          <input id={`task-search-${pageId}`} placeholder="Filter" value={q} onChange={(e) => setView('query', e.target.value)} />
        </div>
        <MenuButton icon="sort" title="Sort" items={(['manual', 'due', 'priority', 'created', 'title'] as Sort[]).map((s) => ({ label: 'Sort: ' + s, checked: sort === s, onClick: () => setView('sort', s) }))} />
        <MenuButton icon="list" title="Group" items={(['none', 'due', 'priority', 'tag'] as Group[]).map((g) => ({ label: 'Group: ' + g, checked: group === g, onClick: () => setView('group', g) }))} />
        <MenuButton title="Visible fields" icon="columns-3" items={['date','repeat','tags','priority','details'].map(field => ({
          label: field[0].toUpperCase() + field.slice(1), checked: !(view.hiddenFields ?? []).includes(field),
          onClick: () => { const hidden: string[] = view.hiddenFields ?? []; setView('hiddenFields', hidden.includes(field) ? hidden.filter(v => v !== field) : [...hidden, field]) }
        }))} />
        <MenuButton title="More" items={[
          { label: hideDone ? 'Show completed' : 'Hide completed', icon: hideDone ? 'eye' : 'eyeOff', onClick: () => setView('hideDone', !hideDone) },
          { label: 'Clear completed', icon: 'trash', onClick: () => {
            const n = mine.filter((t) => t.done).length
            act((d) => { for (const t of Object.values(d.tasks)) if (t.pageId === pageId && t.done) delete d.tasks[t.id] })
            toast(`Cleared ${n} completed`, { undo: true })
          } },
          { label: 'Complete all visible', icon: 'check', onClick: () => visible.filter((t) => !t.done).forEach((t) => setTaskDone(t.id, true)) },
          { label: 'Select all visible', icon: 'list', onClick: () => setSelected(order) },
          { label: `Move overdue to today${overdueCount ? ` (${overdueCount})` : ''}`, icon: 'calendar', disabled: !overdueCount, onClick: () => moveOverdueToToday(pageId) }
        ]} />
      </div>

      {tags.length > 0 && (
        <div className="tag-bar">
          <button className={`chip-btn ${!tag ? 'active' : ''}`} onClick={() => setView('tag', null)}>All tags</button>
          {tags.map((t) => <button key={t} className={`chip-btn ${tag === t ? 'active' : ''}`} style={{ ['--c' as any]: tagColors[t] }} onClick={() => setView('tag', tag === t ? null : t)}>#{t}</button>)}
        </div>
      )}

      <QuickAdd pageId={pageId} />

      {mine.length > 0 && <div className="list-summary">
        <span>{open} open</span><span>·</span><span>{doneToday} done today</span>
        <Progress value={pct} height={4} className="grow" />
        <span>{Math.round(pct * 100)}%</span>
        {overdueCount > 0 && <button className="link danger-link" onClick={() => moveOverdueToToday(pageId)}>{overdueCount} overdue · move to today</button>}
      </div>}

      {visible.length > 0 && (
        groups.map((g) => (
          <div key={g.key} className="task-group">
            {g.label && <div className="group-label">{g.label}<span className="count">{g.items.length}</span></div>}
            <div className="task-list glass">
              {g.items.map((t) => (
                <TaskRow key={t.id} task={t} onOpen={openTask} selected={live.includes(t.id)} onSelect={select} draggable={sort === 'manual' || group === 'none'} onDragStart={() => { dragId.current = t.id }} onDropOn={() => dropOn(t)} />
              ))}
            </div>
          </div>
        ))
      )}
      {live.length > 0 && <BulkBar ids={live} onClear={() => setSelected([])} />}
      {drawer}
    </div>
  )
}

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: 'todo', label: 'To do' }, { status: 'doing', label: 'In progress' }, { status: 'done', label: 'Done' }
]

export function BoardPage({ pageId }: { pageId: string }): JSX.Element {
  const all = useData((d) => d.tasks)
  const [, openTask, drawer] = useTaskDrawer()
  const [over, setOver] = useState<TaskStatus | null>(null)
  const tasks = Object.values(all).filter((t) => t.pageId === pageId && !t.archived).sort((a, b) => a.order - b.order)
  const moveTo = (id: string, status: TaskStatus): void => {
    const t = all[id]
    if (!t) return
    if (status === 'done' && !t.done) setTaskDone(id, true)
    else if (status !== 'done' && t.done) { setTaskDone(id, false); act((d) => { d.tasks[id].status = status }) }
    else act((d) => { d.tasks[id].status = status })
  }
  return (
    <div className="board">
      {COLUMNS.map((c) => {
        const items = tasks.filter((t) => (t.done ? 'done' : t.status === 'done' ? 'todo' : t.status) === c.status)
        return (
          <div key={c.status} className={`board-col glass ${over === c.status ? 'drag-over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setOver(c.status) }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData('text/task'); if (id) moveTo(id, c.status) }}>
            <div className="board-head"><span className={`dot dot-${c.status}`} />{c.label}<span className="count">{items.length}</span></div>
            <div className="board-items">
              {items.map((t) => (
                <div key={t.id} className={`card ${t.done ? 'done' : ''}`} draggable onDragStart={(e) => e.dataTransfer.setData('text/task', t.id)} onClick={() => openTask(t.id)}>
                  <div className="card-title" style={{ color: t.textColor }}>{t.title || 'Untitled'}</div>
                  <div className="task-meta" style={{ ['--task-icon' as string]: t.iconColor }}>
                    {t.due && <span className={`meta ${!t.done && t.due < today() ? 'danger' : ''}`}><Icon name="calendar" size={12} />{friendlyDay(t.due)}</span>}
                    {t.priority > 0 && <span className="meta" style={{ color: PRIORITY[t.priority].color }}><Icon name="flag" size={12} />{PRIORITY[t.priority].label}</span>}
                    {t.subtasks.length > 0 && <span className="meta"><Icon name="check" size={12} />{t.subtasks.filter((s) => s.done).length}/{t.subtasks.length}</span>}
                    {t.tags.map((g) => <span key={g} className="meta tag">#{g}</span>)}
                  </div>
                </div>
              ))}
            </div>
            {c.status !== 'done' && <BoardAdd pageId={pageId} status={c.status} />}
          </div>
        )
      })}
      {drawer}
    </div>
  )
}

function BoardAdd({ pageId, status }: { pageId: string; status: TaskStatus }): JSX.Element {
  const [on, setOn] = useState(false)
  if (!on) return <Button kind="ghost" small icon="plus" className="board-add" onClick={() => setOn(true)}>New</Button>
  return <QuickAdd pageId={pageId} defaults={{ status }} placeholder="Card title, then Enter" />
}

/** Floating action bar for a multi-selection of tasks (Ctrl/Shift click). */
export function BulkBar({ ids, onClear }: { ids: string[]; onClear: () => void }): JSX.Element {
  const lists = useData((d) => Object.values(d.pages).filter((p) => !p.deletedAt && (p.type === 'tasks' || p.type === 'board' || p.type === 'project')))
  const t0 = today()
  const each = (fn: (t: Task) => void): void => act((d) => { for (const id of ids) if (d.tasks[id]) fn(d.tasks[id]) })
  const n = ids.length
  return (
    <div className="bulk-bar glass-strong" role="toolbar" aria-label="Selected tasks">
      <span className="bulk-count">{n} selected</span>
      <Button small icon="check" onClick={() => {
        const open = ids.filter((id) => !getData().tasks[id]?.done)
        if (open.length) open.forEach((id) => setTaskDone(id, true))
        else ids.forEach((id) => setTaskDone(id, false))
        onClear()
      }}>Complete</Button>
      <MenuButton icon="calendar" title="Due date" label="Due" items={[
        { label: 'Today', onClick: () => each((t) => { t.due = t0 }) },
        { label: 'Tomorrow', onClick: () => each((t) => { t.due = addDays(t0, 1) }) },
        { label: 'In a week', onClick: () => each((t) => { t.due = addDays(t0, 7) }) },
        { label: 'Push one day', onClick: () => each((t) => { t.due = addDays(t.due && t.due > t0 ? t.due : t0, 1) }) },
        { divider: true, label: '' },
        { label: 'Remove date', icon: 'x', onClick: () => each((t) => { t.due = null; t.time = null }) }
      ]} />
      <MenuButton icon="flag" title="Priority" label="Priority" items={PRIORITY.map((p) => ({ label: p.label, onClick: () => each((t) => { t.priority = p.v as Task['priority'] }) }))} />
      <MenuButton icon="folder" title="Move to list" label="Move" items={lists.map((p) => ({ label: p.title || 'Untitled', onClick: () => { each((t) => { t.pageId = p.id }); onClear(); toast(`Moved ${n} task${n === 1 ? '' : 's'}`, { undo: true }) } }))} />
      <Button small icon="trash" onClick={() => { act((d) => { for (const id of ids) delete d.tasks[id] }); onClear(); toast(`Deleted ${n} task${n === 1 ? '' : 's'}`, { undo: true }) }}>Delete</Button>
      <button className="icon-btn" title="Clear selection (Esc)" onClick={onClear}><Icon name="x" size={14} /></button>
    </div>
  )
}
