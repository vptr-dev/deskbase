import { useMemo, useRef, useState } from 'react'
import { act, setTaskDone, toast, updatePage, useData } from '../store'
import type { Task, TaskStatus } from '../types'
import { DIFFICULTY } from '../lib/game'
import { addDays, friendlyDay, today } from '../lib/util'
import { QuickAdd, TaskRow, PRIORITY, useTaskDrawer } from '../components/TaskItems'
import { Button, Empty, MenuButton, Progress, Segmented } from '../components/ui'
import { Icon } from '../components/Icon'

type Filter = 'all' | 'today' | 'upcoming' | 'overdue' | 'nodate' | 'done'
type Sort = 'manual' | 'due' | 'priority' | 'difficulty' | 'created' | 'title'
type Group = 'none' | 'due' | 'priority' | 'tag' | 'difficulty'

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
  const diffRank = (d: string): number => Object.keys(DIFFICULTY).indexOf(d)
  const arr = [...tasks]
  arr.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    switch (sort) {
      case 'due': return (a.due ?? '9999') .localeCompare(b.due ?? '9999') || (a.time ?? '').localeCompare(b.time ?? '')
      case 'priority': return b.priority - a.priority
      case 'difficulty': return diffRank(b.difficulty) - diffRank(a.difficulty)
      case 'created': return b.createdAt - a.createdAt
      case 'title': return a.title.localeCompare(b.title)
      default: return a.order - b.order
    }
  })
  return arr
}

function groupTasks(tasks: Task[], group: Group): { key: string; label: string; items: Task[] }[] {
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
    } else if (group === 'difficulty') {
      key = x.difficulty; label = DIFFICULTY[x.difficulty].label; rank = String(9 - Object.keys(DIFFICULTY).indexOf(x.difficulty))
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
  const view = useData((d) => d.pages[pageId]?.view ?? {})
  const showCompleted = useData((d) => d.settings.showCompleted)
  const tagColors = useData((d) => d.tags)
  const [q, setQ] = useState('')
  const [, openTask, drawer] = useTaskDrawer()
  const dragId = useRef<string | null>(null)
  const filter: Filter = view.filter ?? 'all'
  const sort: Sort = view.sort ?? 'manual'
  const group: Group = view.group ?? 'none'
  const tag: string | null = view.tag ?? null
  const hideDone = view.hideDone ?? !showCompleted
  const setView = (k: string, v: unknown): void => updatePage(pageId, (p) => { p.view = { ...(p.view ?? {}), [k]: v } })

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
    <div className="tasks-page">
      <div className="toolbar">
        <Segmented small value={filter} onChange={(v) => setView('filter', v)} options={[
          { value: 'all', label: 'All' }, { value: 'today', label: 'Today' }, { value: 'upcoming', label: 'Upcoming' },
          { value: 'overdue', label: 'Overdue' }, { value: 'nodate', label: 'No date' }, { value: 'done', label: 'Done' }
        ]} />
        <div className="spacer" />
        <div className="search-mini">
          <Icon name="search" size={14} />
          <input id={`task-search-${pageId}`} placeholder="Filter" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <MenuButton icon="sort" title="Sort" items={(['manual', 'due', 'priority', 'difficulty', 'created', 'title'] as Sort[]).map((s) => ({ label: 'Sort: ' + s, checked: sort === s, onClick: () => setView('sort', s) }))} />
        <MenuButton icon="list" title="Group" items={(['none', 'due', 'priority', 'difficulty', 'tag'] as Group[]).map((g) => ({ label: 'Group: ' + g, checked: group === g, onClick: () => setView('group', g) }))} />
        <MenuButton title="More" items={[
          { label: hideDone ? 'Show completed' : 'Hide completed', icon: hideDone ? 'eye' : 'eyeOff', onClick: () => setView('hideDone', !hideDone) },
          { label: 'Clear completed', icon: 'trash', onClick: () => {
            const n = mine.filter((t) => t.done).length
            act((d) => { for (const t of Object.values(d.tasks)) if (t.pageId === pageId && t.done) delete d.tasks[t.id] })
            toast(`Cleared ${n} completed`, { undo: true })
          } },
          { label: 'Complete all visible', icon: 'check', onClick: () => visible.filter((t) => !t.done).forEach((t) => setTaskDone(t.id, true)) }
        ]} />
      </div>

      {tags.length > 0 && (
        <div className="tag-bar">
          <button className={`chip-btn ${!tag ? 'active' : ''}`} onClick={() => setView('tag', null)}>All tags</button>
          {tags.map((t) => <button key={t} className={`chip-btn ${tag === t ? 'active' : ''}`} style={{ ['--c' as any]: tagColors[t] }} onClick={() => setView('tag', tag === t ? null : t)}>#{t}</button>)}
        </div>
      )}

      <QuickAdd pageId={pageId} placeholder="Add a task  ·  try “Call mom tomorrow 6pm !high #family”" />

      <div className="list-summary">
        <span>{open} open</span><span>·</span><span>{doneToday} done today</span>
        <Progress value={pct} height={4} className="grow" />
        <span>{Math.round(pct * 100)}%</span>
      </div>

      {visible.length === 0 ? (
        <Empty icon={filter === 'done' ? '🏁' : '✨'} title={filter === 'all' ? 'No tasks yet' : 'Nothing here'} />
      ) : (
        groups.map((g) => (
          <div key={g.key} className="task-group">
            {g.label && <div className="group-label">{g.label}<span className="count">{g.items.length}</span></div>}
            <div className="task-list glass">
              {g.items.map((t) => (
                <TaskRow key={t.id} task={t} onOpen={openTask} draggable={sort === 'manual' || group === 'none'} onDragStart={() => { dragId.current = t.id }} onDropOn={() => dropOn(t)} />
              ))}
            </div>
          </div>
        ))
      )}
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
                  <div className="card-title">{t.title || 'Untitled'}</div>
                  <div className="task-meta">
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
