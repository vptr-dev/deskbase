import { useState } from 'react'
import type { Task } from '../types'
import { snoozeTask, updateTask } from '../store'
import { addDays, addMonths, dayKey, friendlyDay, snoozeOptions, today } from '../lib/util'
import { taskReminderAt } from '../lib/recurrence'
import { Button } from './ui'

export function TaskSnooze({ task }: { task: Task }): JSX.Element {
  const [custom, setCustom] = useState(false)
  const [count, setCount] = useState('1')
  const [unit, setUnit] = useState('day')
  const n = Number(count)
  const due = Number.isInteger(n) && n >= 1 && n <= 999
    ? unit === 'month' ? addMonths(today(), n) : addDays(today(), n * (unit === 'week' ? 7 : 1))
    : null
  return <div className="repeat-editor">
    <div className="row gap-xs wrap">{snoozeOptions().map(o =>
      <button key={o.label} className="chip-btn" title={friendlyDay(o.due)} onClick={() => snoozeTask(task.id, o.due)}>{o.label}</button>
    )}<button className="chip-btn" aria-expanded={custom} onClick={() => setCustom(!custom)}>Custom…</button></div>
    {custom && <div className="row gap-sm wrap">
      <input aria-label="Snooze interval" type="number" className="input input-sm w-60" min={1} max={999} value={count} onChange={e => setCount(e.target.value)} />
      <select aria-label="Snooze unit" className="input input-sm" value={unit} onChange={e => setUnit(e.target.value)}>{['day', 'week', 'month'].map(u => <option key={u} value={u}>{u}{n === 1 ? '' : 's'}</option>)}</select>
      <Button small disabled={!due} onClick={() => { if (due) { snoozeTask(task.id, due); setCustom(false) } }}>Snooze{due ? ' to ' + friendlyDay(due) : ''}</Button>
    </div>}
  </div>
}

export function TaskReminder({ task }: { task: Task }): JSX.Element {
  const lead = task.reminderBeforeMinutes
  const relative = lead != null
  const initialUnit = relative && lead > 0 && lead % 1440 === 0 ? 1440 : relative && lead > 0 && lead % 60 === 0 ? 60 : 1
  const [unit, setUnit] = useState(initialUnit)
  const [input, setInput] = useState(String(relative ? lead / initialUnit : 15))
  const minutes = Number(input) * unit
  const valid = input.trim() !== '' && Number.isSafeInteger(minutes) && minutes >= 0 && minutes <= 525600
  const setLead = (value: number): void => updateTask(task.id, t => {
    t.reminderBeforeMinutes = value; t.remindAt = null; t.reminded = false
  })
  const timestamp = taskReminderAt(task)
  const date = timestamp == null ? null : new Date(timestamp)
  const localTime = date ? dayKey(date) + 'T' + date.toTimeString().slice(0, 5) : ''
  return <div className="repeat-editor">
    <select aria-label="Reminder type" className="input input-sm" value={relative ? 'relative' : 'date'} onChange={e => {
      if (e.target.value === 'relative') { setUnit(1); setInput('15'); setLead(15) }
      else updateTask(task.id, t => { delete t.reminderBeforeMinutes; t.remindAt = timestamp; t.reminded = false })
    }}><option value="date">Specific date and time</option><option value="relative">Before due time</option></select>
    {relative ? <>
      <div className="row gap-sm wrap">
        <input aria-label="Reminder lead time" type="number" min={0} className="input input-sm w-60" value={input} onChange={e => setInput(e.target.value)} />
        <select aria-label="Reminder unit" className="input input-sm" value={unit} onChange={e => setUnit(Number(e.target.value))}>
          <option value={1}>minutes</option><option value={60}>hours</option><option value={1440}>days</option>
        </select>
        <Button small disabled={!valid || minutes === lead} onClick={() => setLead(minutes)}>Apply</Button>
      </div>
      <span className="small muted">{!task.due ? 'Choose a due date to schedule this reminder.' : date?.toLocaleString()}{task.due && !task.time ? ' · Due at 09:00 for all-day tasks' : ''}</span>
    </> : <input id={`remind-${task.id}`} aria-label="Reminder date and time" type="datetime-local" className="input input-sm" value={localTime} onChange={e => updateTask(task.id, t => {
      t.remindAt = e.target.value ? new Date(e.target.value).getTime() : null; t.reminded = false
    })} />}
  </div>
}
