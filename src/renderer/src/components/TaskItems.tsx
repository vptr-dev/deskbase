import { repeatLabel } from '../lib/recurrence'
import { createPortal } from 'react-dom'
import { TaskReminder, TaskSnooze } from './TaskTiming'
import { TaskRepeatEditor } from './TaskRepeatEditor'
import { parseQuickAdd } from '../lib/quickAdd'
import { WidgetItemMenu } from './widgetActionContext'
import { useContext, useId, useMemo, useState } from 'react'
import { wouldCycle, act, addTask, deleteTask, setTaskDone, snoozeTask, updateTask, useApp, useData } from '../store'
import { ScheduleFields, firstScheduledDate } from './ScheduleFields'
import type { CustomRepeat, Task } from '../types'
import { formatTime, friendlyDay, snoozeOptions, today, uid } from '../lib/util'
import { AutoText, Button, Checkbox, OptionalColor, ConfirmButton, Menu, type MenuItem, Popover, Segmented, useDoc } from './ui'
import { Icon } from './Icon'

export const PRIORITY = [
  { v: 0, label: 'None', color: 'var(--muted)' },
  { v: 1, label: 'Low', color: '#30d158' },
  { v: 2, label: 'Medium', color: '#ff9f0a' },
  { v: 3, label: 'High', color: '#ff453a' }
] as const

export function QuickAdd({ pageId, initialTitle, submitButton, resolvePage, defaults = {}, placeholder = 'Add a task', autoFocus, onAdded, onEscape, schedulePicker }: { initialTitle?: string; submitButton?: boolean; resolvePage?: () => string; schedulePicker?: boolean; pageId: string; defaults?: Partial<Task>; placeholder?: string; autoFocus?: boolean; onAdded?: (id: string) => void; onEscape?: () => void }): JSX.Element {
  const scheduleId = useId()
  const [v, setV] = useState(initialTitle ?? '')
  const weekStart = useData(d => d.settings.weekStart)
  const [schedule, setSchedule] = useState<CustomRepeat | null>(null)
  const first = schedule ? firstScheduledDate(schedule) : null
  const parsed = useMemo(() => (v.trim() ? parseQuickAdd(v, weekStart, defaults.due, !schedule) : null), [v, weekStart, defaults.due, schedule])
  const submit = (): void => {
    if (!parsed?.title || (schedule && !first)) return
    const id = addTask(resolvePage?.() ?? pageId, {
      ...defaults,
      title: parsed.title,
      due: first ?? parsed.due ?? defaults.due ?? null,
      time: parsed.time ?? null,
      priority: parsed.priority ?? defaults.priority ?? 0,
      tags: [...(defaults.tags ?? []), ...parsed.tags],
      repeat: schedule ?? parsed.repeat ?? defaults.repeat ?? 'none',
      difficulty: defaults.difficulty ?? 'easy'
    })
    setV('')
    setSchedule(null)
    onAdded?.(id)
  }
  return (
    <><div className="quickadd glass">
      <Icon name="plus" size={16} className="muted" />
      <input
        aria-label="Add a task"
        className="quickadd-input"
        placeholder={placeholder}
        value={v}
        autoFocus={autoFocus}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { if (!v && onEscape) onEscape(); else setV('') } }}
      />
      {submitButton && <button type="button" className="btn btn-primary btn-sm" disabled={!parsed?.title || (!!schedule && !first)} onClick={submit}>Add</button>}
      {schedulePicker && <button type="button" className="icon-btn" title="Repeat schedule" aria-label="Repeat schedule" aria-pressed={!!schedule} onClick={() => {
        const start = defaults.due || today()
        setSchedule(schedule ? null : { unit: 'week', interval: 1, start, days: [new Date(start + 'T12:00:00').getDay()], weekStart })
      }}><Icon name="repeat" size={15} /></button>}
    </div>
    {schedule && <div className="panel-repeat"><ScheduleFields id={scheduleId} draft={schedule} onChange={setSchedule} />
      <Button small kind="primary" disabled={!first || !parsed?.title} onClick={submit}>Add repeating task</Button></div>}</>
  )
}

export function TaskRow({ task, showPage, onOpen, draggable, onDragStart, onDropOn, selected, onSelect, onRepeat }: {
  onRepeat?: (id: string) => void
  task: Task; showPage?: boolean; onOpen: (id: string) => void; draggable?: boolean; onDragStart?: () => void; onDropOn?: () => void
  selected?: boolean; onSelect?: (id: string, range: boolean) => void
}): JSX.Element {
  const widgetMenu = useContext(WidgetItemMenu)
  const pageTitle = useData((d) => (showPage ? d.pages[task.pageId]?.title : ''))
  const goalTitle = useData((d) => (task.goalId ? d.goals[task.goalId]?.title : ''))
  const use24h = useData((d) => d.settings.use24h)
  const [over, setOver] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const overdue = !task.done && task.due && task.due < today()
  const menuItems: MenuItem[] = [
    { label: 'Open', icon: 'expand', onClick: () => onOpen(task.id) },
    ...(onRepeat ? [{ label: 'Repeat schedule', icon: 'repeat', onClick: () => onRepeat(task.id) }] : []),
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
      tabIndex={0} aria-label={task.title}
      onKeyDown={e=>{
        if(e.target!==e.currentTarget||e.ctrlKey||e.metaKey||e.altKey)return
        const key=e.key.toLowerCase()
        if(!['j','k','x',' ','enter'].includes(key))return
        e.preventDefault();e.stopPropagation()
        if(key==='j'||key==='k'){
          const rows=Array.from((e.currentTarget.closest('.tasks-page')??e.currentTarget.parentElement)?.querySelectorAll<HTMLElement>('.task-row')??[])
          rows[rows.indexOf(e.currentTarget)+(key==='j'?1:-1)]?.focus()
        }else if(key==='x')setTaskDone(task.id,!task.done)
        else if(key===' '&&onSelect)onSelect(task.id,false)
        else onOpen(task.id)
      }}
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
      onContextMenu={(e) => { if (widgetMenu) { widgetMenu(e, task.title, menuItems); return }; e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }) }}
    >
      {menu && <Popover anchor={menu} onClose={() => setMenu(null)}><div onClick={(e) => e.stopPropagation()}><Menu items={menuItems} onClose={() => setMenu(null)} /></div></Popover>}
      <Checkbox checked={task.done} onChange={(v) => setTaskDone(task.id, v)} round color={task.iconColor ?? (task.priority ? PRIORITY[task.priority].color : undefined)} />
      <div className="task-main">
        <div className="task-title" style={{ color: task.textColor }}>{task.title || <span className="muted">Untitled</span>}</div>
        <div className="task-meta" style={{ ['--task-icon' as string]: task.iconColor }}>
          {task.due && <span data-field="date" className={`meta ${overdue ? 'danger' : task.due === today() ? 'accent' : ''}`}><Icon name="calendar" size={12} />{friendlyDay(task.due)}{task.time ? ' ' + formatTime(task.time, use24h) : ''}</span>}
          {task.repeat !== 'none' && <span data-field="repeat" className="meta" title={repeatLabel(task.repeat)}><Icon name="repeat" size={12} />{repeatLabel(task.repeat)}</span>}
          {task.subtasks.length > 0 && <span data-field="details" className="meta"><Icon name="check" size={12} />{subDone}/{task.subtasks.length}</span>}
          {task.blockedBy && <BlockerLabel id={task.blockedBy}/>}
          {task.notes && <span data-field="details" className="meta"><Icon name="note" size={12} /></span>}
          {task.estimate ? <span data-field="details" className="meta"><Icon name="clock" size={12} />{task.estimate}m</span> : null}
          {task.tags.map((t) => <span data-field="tags" key={t} className="meta tag">#{t}</span>)}
          {goalTitle && <span data-field="details" className="meta"><Icon name="flag" size={12} />{goalTitle}</span>}
          {showPage && pageTitle && <span className="meta">{pageTitle}</span>}
        </div>
      </div>
      {task.priority > 0 && <Icon name="flag" size={14} className="task-flag" color={task.iconColor} fill />}
    </div>
  )
}

export function TaskDetail({ id, onClose }: { id: string; onClose: () => void }): JSX.Element | null {
  const task = useData((d) => d.tasks[id])
  const pages = useData((d) => d.pages)
  const goals = useData((d) => d.goals)
  const tasks=useData(d=>d.tasks)
  const [tagInput, setTagInput] = useState('')
  const [subInput, setSubInput] = useState('')
  if (!task) return null
  const set = (fn: (t: Task) => void, key?: string): void => updateTask(id, fn, key)
  const listPages = Object.values(pages).filter((p) => !p.deletedAt && ['tasks', 'board', 'project', 'today'].includes(p.type))
  return (
    <div className="drawer glass-strong" onClick={(e) => e.stopPropagation()}>
      <div className="drawer-head" style={{ color: task.textColor }}>
        <Checkbox checked={task.done} onChange={(v) => setTaskDone(id, v)} round size={20} color={task.iconColor ?? (task.priority ? PRIORITY[task.priority].color : undefined)} />
        <AutoText className="drawer-title" value={task.title} placeholder="Task name" onChange={(v) => set((t) => { t.title = v }, 'title:' + id)} />
        <Button kind="ghost" small icon="x" title="Close" onClick={onClose} />
      </div>
      <div className="drawer-body">
        <div className="field-grid">
          <label>Due</label>
          <div className="row gap-sm wrap">
            <input id={`due-${id}`} type="date" className="input input-sm" value={task.due ?? ''} onChange={(e) => set((t) => { t.due = e.target.value || null })} />
            <input id={`time-${id}`} type="time" className="input input-sm" value={task.time ?? ''} onChange={(e) => set((t) => { t.time = e.target.value || null })} />
            {task.due && <Button small kind="ghost" icon="x" title="Clear date" onClick={() => set((t) => { t.due = null; t.time = null })} />}
          </div>
          {!task.done && <>
            <label>Snooze</label>
            <TaskSnooze key={id} task={task} />
          </>}
          <label htmlFor={`repeat-${id}`}>Repeat</label>
          <TaskRepeatEditor key={id} task={task} />
          <label>Text color</label>
          <OptionalColor label="Task text color" value={task.textColor} onChange={color => set(t => { t.textColor = color }, 'task-text:' + id)} />
          <label>Icon color</label>
          <OptionalColor label="Task icon color" value={task.iconColor} onChange={color => set(t => { t.iconColor = color }, 'task-icon:' + id)} />
          <label>Priority</label>
          <Segmented small value={task.priority} onChange={(v) => set((t) => { t.priority = v as Task['priority'] })} options={PRIORITY.map((p) => ({ value: p.v, label: p.label }))} />
          <label htmlFor={'blocked-'+id}>Blocked by</label>
          <select id={'blocked-'+id} className="input input-sm" value={task.blockedBy??''} onChange={e=>set(t=>{t.blockedBy=e.target.value||undefined})}>
            <option value="">None</option>{Object.values(tasks).filter(t=>!pages[t.pageId]?.deletedAt&&!t.archived&&(!t.done||t.id===task.blockedBy)&&!wouldCycle(tasks,id,t.id)).map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select>
          <label>Estimate</label>
          <div className="row gap-sm">
            <input id={`est-${id}`} type="number" min={0} step={5} className="input input-sm w-80" value={task.estimate ?? ''} onChange={(e) => set((t) => { t.estimate = e.target.value ? Number(e.target.value) : null })} />
            <span className="muted">minutes</span>
          </div>
          <label>Reminder</label>
          <TaskReminder key={id} task={task} />
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
              {Object.values(goals).filter((g) => !g.done || g.id === task.goalId).map((g) => <option key={g.id} value={g.id}>{g.title || 'Untitled goal'}</option>)}
            </select>
          </>}
          <label>List</label>
          <select id={`page-${id}`} className="input input-sm" value={task.pageId} onChange={(e) => set((t) => { t.pageId = e.target.value })}>
            {listPages.map((p) => <option key={p.id} value={p.id}>{p.title || 'Untitled'}</option>)}
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
  const doc = useDoc()
  const el = open && exists ? createPortal(
    <div className="drawer-backdrop" onClick={() => setOpen(null)}>
      <TaskDetail key={open} id={open} onClose={() => setOpen(null)} />
    </div>, doc.body
  ) : null
  return [open, setOpen, el]
}

function BlockerLabel({id}:{id:string}):JSX.Element|null {
 const t=useData(d=>d.tasks[id]);return t&&!t.done&&!t.archived?<span className="meta">Blocked by {t.title}</span>:null
}
