import { firstScheduledDate, ScheduleFields } from './ScheduleFields'
import { useState } from 'react'
import type { CustomRepeat, RepeatPreset, Task } from '../types'
import { updateTask, useData } from '../store'
import { friendlyDay, parseDay, today } from '../lib/util'
import { repeatLabel, repeatPresets, shiftTaskReminder } from '../lib/recurrence'
import { Button } from './ui'

export function TaskRepeatEditor({ task }: { task: Task }): JSX.Element {
  const weekStart = useData(d => d.settings.weekStart)
  const [draft, setDraft] = useState<CustomRepeat | null>(null)
  const saved = typeof task.repeat === 'object' ? task.repeat : null
  const start = task.due || today()
  const edit = (): void => setDraft(saved ?? {
    interval: 1, unit: 'week', start, days: [parseDay(start).getDay()], weekStart
  })
  const setPreset = (value: string): void => {
    if (value === 'custom') { edit(); return }
    setDraft(null)
    updateTask(task.id, t => {
      t.repeat = value as RepeatPreset
      if (value !== 'none' && !t.due) t.due = today()
    })
  }
  const from = saved && draft?.start === saved.start && task.due ? task.due : draft?.start
  const first = draft ? firstScheduledDate(draft, from) : null
  return <div className="repeat-editor">
    <select id={`repeat-${task.id}`} className="input input-sm" value={draft || saved ? 'custom' : String(task.repeat)} onChange={e => setPreset(e.target.value)}>
      {Object.entries(repeatPresets).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      <option value="custom">Custom schedule…</option>
    </select>
    {!draft && saved && <div className="row wrap gap-sm"><span className="small">{repeatLabel(saved)}{saved.until ? ' · ends ' + friendlyDay(saved.until) : ''}</span><Button small kind="ghost" onClick={edit}>Edit schedule</Button></div>}
    {draft && <div className="repeat-form">
      <ScheduleFields taskLimit id={task.id} draft={draft} onChange={setDraft} from={from} />
      <div className="row gap-sm"><Button small kind="primary" disabled={!first} onClick={() => {
        if (!first) return
        updateTask(task.id, t => {
          t.remindAt = shiftTaskReminder(t.remindAt, t.due || first, first)
          if (t.due !== first) t.reminded = false
          t.repeat = draft
          t.due = first
        })
        setDraft(null)
      }}>Save schedule</Button><Button small kind="ghost" onClick={() => setDraft(null)}>Cancel</Button></div>
    </div>}
  </div>
}
