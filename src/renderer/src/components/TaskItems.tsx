import { useMemo, useState } from 'react'
import { act, addTask, deleteTask, setTaskDone, snoozeTask, updateTask, useApp, useData } from '../store'
import type { Difficulty, Repeat, StatKey, Task } from '../types'
import { DIFFICULTY, STAT_KEYS } from '../lib/game'
import { formatTime, friendlyDay, parseQuickAdd, snoozeOptions, today, uid } from '../lib/util'
import { AutoText, Button, Checkbox, ConfirmButton, Menu, type MenuItem, Popover, Segmented } from './ui'
import { Icon } from './Icon'

export const PRIORITY = [
  { v: 0, label: 'None', color: 'var(--muted)' },
  { v: 1, label: 'Low', color: '#30d158' },
  { v: 2, label: 'Medium', color: '#ff9f0a' },
  { v: 3, label: 'High', color: '#ff453a' }
] as const

export const REPEATS: { v: Repeat; label: string }[] = [
  { v: 'none', label: 'Never' }, { v: 'daily', label: 'Daily' }, { v: 'weekdays', label: 'Weekdays' },
  { v: 'weekly', label: 'Weekly' }, { v: 'monthly', label: 'Monthly' }, { v: 'yearly', label: 'Yearly' }
]

export function QuickAdd({ pageId, defaults = {}, placeholder = 'Add a task' }: { pageId: string; defaults?: Partial<Task>; placeholder?: string }): JSX.Element {
  const [v, setV] = useState('')
  const parsed = useMemo(() => (v.trim() ? parseQuickAdd(v) : null), [v])
  const submit = (): void => {
    if (!parsed?.title) return
    addTask(pageId, {
      ...defaults,
      title: parsed.title,
      due: parsed.due ?? defaults.due ?? null,
      time: parsed.time ?? null,
      priority: parsed.priority ?? defaults.priority ?? 0,
      tags: [...(defaults.tags ?? []), ...parsed.tags],
      repeat: parsed.repeat ?? 'none',
      difficulty: parsed.difficulty ?? defaults.difficulty ?? 'easy'
    })
    setV('')
  }
  return (
    <div className="quickadd glass">
      <Icon name="plus" size={16} className="muted" />
      <input
        id={`quickadd-${pageId}`}
        className="quickadd-input"
        placeholder={placeholder}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setV('') }}
      />
      {parsed && (
        <div className="quickadd-chips">
          {parsed.due && <span className="chip"><Icon name="calendar" size={12} />{friendlyDay(parsed.due)}</span>}
          {parsed.time && <span className="chip"><Icon name="clock" size={12} />{parsed.time}</span>}
          {parsed.repeat && <span className="chip"><Icon name="repeat" size={12} />{parsed.repeat}</span>}
          {parsed.priority ? <span className="chip" style={{ color: PRIORITY[parsed.priority].color }}><Icon name="flag" size={12} />{PRIORITY[parsed.priority].label}</span> : null}
          {parsed.difficulty && <span className="chip">{DIFFICULTY[parsed.difficulty].label}</span>}
          {parsed.tags.map((t) => <span key={t} className="chip">#{t}</span>)}
        </div>
      )}
    </div>
  )
}

export function TaskRow({ task, showPage, onOpen, draggable, onDragStart, onDropOn, selected, onSelect }: {
  task: Task; showPage?: boolean; onOpen: (id: string) => void; draggable?: boolean; onDragStart?: () => void; onDropOn?: () => void
  selected?: boolean; onSelect?: (id: string, range: boolean) => void
}): JSX.Element {
  const pageTitle = useData((d) => (showPage ? d.pages[task.pageId]?.title : ''))
  const goalTitle = useData((d) => (task.goalId ? d.goals[task.goalId]?.title : ''))
  const use24h = useData((d) => d.settings.use24h)
  const gamified = useData((d) => d.settings.gamification)
  const [over, setOver] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const overdue = !task.done && task.due && task.due < today()
  const menuItems: MenuItem[] = [
    { label: 'Open', icon: 'expand', onClick: () => onOpen(task.id) },
    { label: task.done ? 'Mark not done' : 'Complete', icon: 'check', onClick: () => setTaskDone(task.id, !task.done) },
    { divider: true, label: '' },
    { label: 'Due today', icon: 'calendar', disabled: task.due === today(), onClick: () => updateTask(task.id, (t) => { t.due = today() }) },
    ...snoozeOptions().slice(0, 4).map((o) => ({ label: `Snooze: ${o.label.toLowerCase()}`, icon: 'snooze', hint: friendlyDay(o.due), onClick: () => snoozeTask(task.id, o.due) })),
    ...(task.due ? [{ label: 'Remove date', icon: 'x', onClick: () => updateTask(task.id, (t) => { t.due = null; t.time = null }) }] : []),
    { divider: true, label: '' },
    ...PRIORITY.slice(1).map((p) => ({ label: `${p.label} priority`, checked: task.priority === p.v, onClick: () => updateTask(task.id, (t) => { t.priority = (t.priority === p.v ? 0 : p.v) as Task['priority'] }) })),
    { divider: true, label: '' },
    { label: 'Delete', icon: 'trash', danger: true, onClick: () => deleteTask(task.id) }
  ]
  const subDone = task.subtasks.filter((s) => s.done).length
  return (
    <div
      className={`task-row ${task.done ? 'done' : ''} ${over ? 'drag-over' : ''} ${selected ? 'selected' : ''}`}
      onClick={(e) => {
        if (onSelect && (e.ctrlKey || e.metaKey || e.shiftKey)) { e.preventDefault(); onSelect(task.id, e.shiftKey) }
        else onOpen(task.id)
      }}
      onMouseDown={(e) => { if (onSelect && e.shiftKey) e.preventDefault() }}
      draggable={draggable}
      onDragStart={(e) => { e.dataTransfer.setData('text/task', task.id); onDragStart?.() }}
      onDragOver={(e) => { if (onDropOn) { e.preventDefault(); setOver(true) } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onDropOn?.() }}
      onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }) }}
    >
      {menu && <Popover anchor={menu} onClose={() => setMenu(null)}><div onClick={(e) => e.stopPropagation()}><Menu items={menuItems} onClose={() => setMenu(null)} /></div></Popover>}
      <Checkbox checked={task.done} onChange={(v) => setTaskDone(task.id, v)} round color={PRIORITY[task.priority].v ? PRIORITY[task.priority].color : undefined} />
      <div className="task-main">
        <div className="task-title">{task.title || <span className="muted">Untitled</span>}</div>
        <div className="task-meta">
          {task.due && <span className={`meta ${overdue ? 'danger' : task.due === today() ? 'accent' : ''}`}><Icon name="calendar" size={12} />{friendlyDay(task.due)}{task.time ? ' ' + formatTime(task.time, use24h) : ''}</span>}
          {task.repeat !== 'none' && <span className="meta"><Icon name="repeat" size={12} /></span>}
          {task.subtasks.length > 0 && <span className="meta"><Icon name="check" size={12} />{subDone}/{task.subtasks.length}</span>}
          {task.notes && <span className="meta"><Icon name="note" size={12} /></span>}
          {task.estimate ? <span className="meta"><Icon name="clock" size={12} />{task.estimate}m</span> : null}
          {task.tags.map((t) => <span key={t} className="meta tag">#{t}</span>)}
          {goalTitle && <span className="meta"><Icon name="flag" size={12} />{goalTitle}</span>}
          {showPage && pageTitle && <span className="meta">{pageTitle}</span>}
        </div>
      </div>
      {task.priority > 0 && <Icon name="flag" size={14} className="task-flag" fill />}
      {gamified && <span className="xp-chip">{DIFFICULTY[task.difficulty]?.xp ?? 10} XP</span>}
    </div>
  )
}

export function TaskDetail({ id, onClose }: { id: string; onClose: () => void }): JSX.Element | null {
  const task = useData((d) => d.tasks[id])
  const pages = useData((d) => d.pages)
  const stats = useData((d) => d.profile.stats)
  const gamified = useData((d) => d.settings.gamification)
  const goals = useData((d) => d.goals)
  const [tagInput, setTagInput] = useState('')
  const [subInput, setSubInput] = useState('')
  if (!task) return null
  const set = (fn: (t: Task) => void, key?: string): void => updateTask(id, fn, key)
  const listPages = Object.values(pages).filter((p) => !p.deletedAt && ['tasks', 'board', 'today'].includes(p.type))
  return (
    <div className="drawer glass-strong" onClick={(e) => e.stopPropagation()}>
      <div className="drawer-head">
        <Checkbox checked={task.done} onChange={(v) => setTaskDone(id, v)} round size={20} />
        <AutoText className="drawer-title" value={task.title} placeholder="Task name" onChange={(v) => set((t) => { t.title = v }, 'title:' + id)} />
        <Button kind="ghost" small icon="x" title="Close" onClick={onClose} />
      </div>
      <div className="drawer-body">
        <div className="field-grid">
          <label>Due</label>
          <div className="row gap-sm">
            <input id={`due-${id}`} type="date" className="input input-sm" value={task.due ?? ''} onChange={(e) => set((t) => { t.due = e.target.value || null })} />
            <input id={`time-${id}`} type="time" className="input input-sm" value={task.time ?? ''} onChange={(e) => set((t) => { t.time = e.target.value || null })} />
            {task.due && <Button small kind="ghost" icon="x" title="Clear date" onClick={() => set((t) => { t.due = null; t.time = null })} />}
          </div>
          {!task.done && <>
            <label>Snooze</label>
            <div className="row gap-xs wrap">
              {snoozeOptions().map((o) => <button key={o.label} className="chip-btn" title={friendlyDay(o.due)} onClick={() => snoozeTask(id, o.due)}>{o.label}</button>)}
            </div>
          </>}
          <label>Repeat</label>
          <select id={`repeat-${id}`} className="input input-sm" value={task.repeat} onChange={(e) => set((t) => { t.repeat = e.target.value as Repeat; if (t.repeat !== 'none' && !t.due) t.due = today() })}>
            {REPEATS.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}
          </select>
          <label>Priority</label>
          <Segmented small value={task.priority} onChange={(v) => set((t) => { t.priority = v as Task['priority'] })} options={PRIORITY.map((p) => ({ value: p.v, label: p.label }))} />
          {gamified && <>
            <label>Difficulty</label>
            <Segmented small value={task.difficulty} onChange={(v) => set((t) => { t.difficulty = v as Difficulty })} options={(Object.keys(DIFFICULTY) as Difficulty[]).map((k) => ({ value: k, label: DIFFICULTY[k].label }))} />
            <label>Stat</label>
            <select id={`stat-${id}`} className="input input-sm" value={task.stat ?? ''} onChange={(e) => set((t) => { t.stat = (e.target.value || null) as StatKey | null })}>
              <option value="">None</option>
              {STAT_KEYS.map((k) => <option key={k} value={k}>{stats[k].icon} {stats[k].name}</option>)}
            </select>
          </>}
          <label>Estimate</label>
          <div className="row gap-sm">
            <input id={`est-${id}`} type="number" min={0} step={5} className="input input-sm w-80" value={task.estimate ?? ''} onChange={(e) => set((t) => { t.estimate = e.target.value ? Number(e.target.value) : null })} />
            <span className="muted">minutes</span>
          </div>
          <label>Reminder</label>
          <div className="row gap-sm">
            <input id={`remind-${id}`} type="datetime-local" className="input input-sm" value={task.remindAt ? new Date(task.remindAt - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''} onChange={(e) => set((t) => { t.remindAt = e.target.value ? new Date(e.target.value).getTime() : null; t.reminded = false })} />
          </div>
          <label>Tags</label>
          <div className="tags-edit">
            {task.tags.map((t) => <span key={t} className="chip">#{t}<button onClick={() => set((x) => { x.tags = x.tags.filter((y) => y !== t) })}><Icon name="x" size={10} /></button></span>)}
            <input id={`tag-${id}`} className="input input-sm tag-input" placeholder="Add tag" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => {
              if (e.key === 'Enter' && tagInput.trim()) {
                const tg = tagInput.trim().replace(/^#/, '').toLowerCase()
                act((d) => { const t = d.tasks[id]; if (t && !t.tags.includes(tg)) t.tags.push(tg); if (!d.tags[tg]) d.tags[tg] = '#8e8e93' })
                setTagInput('')
              }
            }} />
          </div>
          {(Object.values(goals).some((g) => !g.done) || task.goalId) && <>
            <label>Goal</label>
            <select id={`goal-${id}`} className="input input-sm" value={task.goalId ?? ''} onChange={(e) => set((t) => { t.goalId = e.target.value || null })}>
              <option value="">None</option>
              {Object.values(goals).filter((g) => !g.done || g.id === task.goalId).map((g) => <option key={g.id} value={g.id}>{g.icon} {g.title || 'Untitled goal'}</option>)}
            </select>
          </>}
          <label>List</label>
          <select id={`page-${id}`} className="input input-sm" value={task.pageId} onChange={(e) => set((t) => { t.pageId = e.target.value })}>
            {listPages.map((p) => <option key={p.id} value={p.id}>{p.icon} {p.title || 'Untitled'}</option>)}
          </select>
        </div>

        <div className="drawer-section">
          <div className="section-label">Subtasks</div>
          {task.subtasks.map((s, i) => (
            <div key={s.id} className="subtask">
              <Checkbox size={16} checked={s.done} onChange={(v) => set((t) => { t.subtasks[i].done = v })} />
              <input className="subtask-input" value={s.title} onChange={(e) => set((t) => { t.subtasks[i].title = e.target.value }, 'sub:' + s.id)} />
              <button className="icon-btn" onClick={() => set((t) => { t.subtasks.splice(i, 1) })} title="Remove"><Icon name="x" size={12} /></button>
            </div>
          ))}
          <input id={`sub-${id}`} className="input input-sm" placeholder="Add a subtask" value={subInput} onChange={(e) => setSubInput(e.target.value)} onKeyDown={(e) => {
            if (e.key === 'Enter' && subInput.trim()) { set((t) => { t.subtasks.push({ id: uid(), title: subInput.trim(), done: false }) }); setSubInput('') }
          }} />
        </div>

        <div className="drawer-section">
          <div className="section-label">Notes</div>
          <AutoText className="notes" value={task.notes} placeholder="Add notes" onChange={(v) => set((t) => { t.notes = v }, 'notes:' + id)} />
        </div>
      </div>
      <div className="drawer-foot">
        <span className="muted small">Created {new Date(task.createdAt).toLocaleDateString()}{task.doneAt ? ` · Done ${new Date(task.doneAt).toLocaleDateString()}` : ''}</span>
        <div className="row gap-sm">
          <Button small kind="ghost" icon="copy" onClick={() => { const { id: _i, ...rest } = task; addTask(task.pageId, { ...structuredClone(rest), done: false, status: 'todo', doneAt: null, title: task.title + ' (copy)' }) }}>Duplicate</Button>
          <ConfirmButton onConfirm={() => { onClose(); deleteTask(id) }} />
        </div>
      </div>
    </div>
  )
}

/** Hook-free helper: drawer state shared by pages that list tasks. */
export function useTaskDrawer(): [string | null, (id: string | null) => void, JSX.Element | null] {
  const [open, setOpen] = useState<string | null>(null)
  const exists = useApp((s) => (open ? Boolean(s.data.tasks[open]) : false))
  const el = open && exists ? (
    <div className="drawer-backdrop" onClick={() => setOpen(null)}>
      <TaskDetail id={open} onClose={() => setOpen(null)} />
    </div>
  ) : null
  return [open, setOpen, el]
}
