import { useState } from 'react'
import { DAYS_LONG, DAYS_SHORT } from '../lib/util'
import { Button, Modal } from '../components/ui'

export interface CalendarOptions {
  weekStart: number | null
  weekdays: number[]
  agendaDays: number
  itemLimit: number | null
  completed: boolean
  events: boolean
}

const allDays = [0, 1, 2, 3, 4, 5, 6]
export function calendarOptions(raw: Partial<CalendarOptions> | null | undefined): CalendarOptions {
  const weekdays = allDays.filter(day => Array.isArray(raw?.weekdays) && raw.weekdays.includes(day))
  const integer = (value: unknown, max: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= max
  const weekStart = raw?.weekStart
  return {
    weekStart: typeof weekStart === 'number' && allDays.includes(weekStart) ? weekStart : null,
    weekdays: weekdays.length ? weekdays : allDays,
    agendaDays: integer(raw?.agendaDays, 365) ? raw.agendaDays : 30,
    itemLimit: integer(raw?.itemLimit, 30) ? raw.itemLimit : null,
    completed: raw?.completed !== false, events: raw?.events !== false
  }
}

export function CalendarPreferences({ options, onSave, onClose }: { options: CalendarOptions; onSave: (value: CalendarOptions) => void; onClose: () => void }): JSX.Element {
  const [draft, setDraft] = useState(options)
  const patch = (fields: Partial<CalendarOptions>): void => setDraft(prev => ({ ...prev, ...fields }))
  const valid = draft.weekdays.length > 0 && Number.isInteger(draft.agendaDays) && draft.agendaDays >= 1 && draft.agendaDays <= 365 &&
    (draft.itemLimit == null || (Number.isInteger(draft.itemLimit) && draft.itemLimit >= 1 && draft.itemLimit <= 30))
  return <Modal width={440} title="Calendar view" onClose={onClose}>
    <div className="modal-body form">
      <label htmlFor="calendar-week-start">Week starts on</label>
      <select id="calendar-week-start" className="input" value={draft.weekStart ?? ''} onChange={e => patch({ weekStart: e.target.value === '' ? null : Number(e.target.value) })}>
        <option value="">Use app setting</option>{DAYS_LONG.map((day, i) => <option key={day} value={i}>{day}</option>)}
      </select>
      <label>Visible weekdays</label>
      <div className="repeat-days" role="group" aria-label="Visible weekdays">
        {allDays.map(day => <button key={day} type="button" className="chip-btn" aria-label={DAYS_LONG[day]} aria-pressed={draft.weekdays.includes(day)} onClick={() => patch({
          weekdays: draft.weekdays.includes(day) ? draft.weekdays.filter(d => d !== day) : [...draft.weekdays, day]
        })}>{DAYS_SHORT[day]}</button>)}
      </div>
      <label htmlFor="calendar-horizon">Days in agenda</label>
      <input id="calendar-horizon" className="input" type="number" min={1} max={365} value={draft.agendaDays || ''} onChange={e => patch({ agendaDays: Number(e.target.value) })} />
      <label htmlFor="calendar-limit">Items per date in the grid</label>
      <input id="calendar-limit" className="input" type="number" min={1} max={30} placeholder="Automatic" value={draft.itemLimit ?? ''} onChange={e => patch({ itemLimit: e.target.value === '' ? null : Number(e.target.value) })} />
      <label className="row gap-sm"><input type="checkbox" checked={draft.completed} onChange={e => patch({ completed: e.target.checked })} />Show completed tasks</label>
      <label className="row gap-sm"><input type="checkbox" checked={draft.events} onChange={e => patch({ events: e.target.checked })} />Show connected calendar events</label>
    </div>
    <div className="modal-foot">
      <Button small kind="ghost" onClick={() => setDraft(calendarOptions(null))}>Reset to defaults</Button>
      <div className="spacer" /><Button small kind="primary" disabled={!valid} onClick={() => onSave(draft)}>Apply</Button>
    </div>
  </Modal>
}
