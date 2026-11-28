import { validDay } from '../lib/recurrence'
import { minuteOf } from '../lib/calendarPlanning'
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
  dayStart: string
  dayEnd: string
  travelByLocation: string
  timetableStart: string
  timetablePattern: string
}

const allDays = [0, 1, 2, 3, 4, 5, 6]
export function calendarOptions(raw: Partial<CalendarOptions> | null | undefined): CalendarOptions {
  const weekdays = allDays.filter(day => Array.isArray(raw?.weekdays) && raw.weekdays.includes(day))
  const integer = (value: unknown, max: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= max
  const weekStart = raw?.weekStart
  const start = minuteOf(raw?.dayStart), end = minuteOf(raw?.dayEnd)
  const validHours = start !== null && end !== null && start < end
  return {
    weekStart: typeof weekStart === 'number' && allDays.includes(weekStart) ? weekStart : null,
    weekdays: weekdays.length ? weekdays : allDays,
    agendaDays: integer(raw?.agendaDays, 365) ? raw.agendaDays : 30,
    itemLimit: integer(raw?.itemLimit, 30) ? raw.itemLimit : null,
    completed: raw?.completed !== false, events: raw?.events !== false,
    dayStart: validHours ? raw!.dayStart! : '09:00',
    dayEnd: validHours ? raw!.dayEnd! : '17:00',
    travelByLocation: typeof raw?.travelByLocation==='string' ? raw.travelByLocation.slice(0,8000) : '',
    timetableStart: validDay(raw?.timetableStart) ? raw!.timetableStart! : '',
    timetablePattern: typeof raw?.timetablePattern==='string' ? raw.timetablePattern.slice(0,1500) : ''
  }
}

export function CalendarPreferences({ options, onSave, onClose }: { options: CalendarOptions; onSave: (value: CalendarOptions) => void; onClose: () => void }): JSX.Element {
  const [draft, setDraft] = useState(options)
  const patch = (fields: Partial<CalendarOptions>): void => setDraft(prev => ({ ...prev, ...fields }))
  const start = minuteOf(draft.dayStart), end = minuteOf(draft.dayEnd)
  const valid = start!==null && end!==null && start<end && draft.weekdays.length > 0 && Number.isInteger(draft.agendaDays) && draft.agendaDays >= 1 && draft.agendaDays <= 365 &&
    (draft.itemLimit == null || (Number.isInteger(draft.itemLimit) && draft.itemLimit >= 1 && draft.itemLimit <= 30))
  return <Modal width={440} title="Calendar view" onClose={onClose}>
    <div className="modal-body form">
      <label htmlFor="calendar-week-start">Week starts on</label>
      <select id="calendar-week-start" className="input" value={draft.weekStart ?? ''} onChange={e => patch({ weekStart: e.target.value === '' ? null : Number(e.target.value) })}>
        <option value="">Use app setting</option>{DAYS_LONG.map((day, i) => <option key={day} value={i}>{day}</option>)}
      </select>
      <label>Planning hours</label>
      <div className="row gap-sm"><input type="time" className="input" aria-label="Planning day start" value={draft.dayStart} onChange={e=>patch({dayStart:e.target.value})}/>
        <input type="time" className="input" aria-label="Planning day end" value={draft.dayEnd} onChange={e=>patch({dayEnd:e.target.value})}/></div>
      <label htmlFor="travel-locations">Travel minutes by location</label>
      <textarea id="travel-locations" className="input" placeholder="Science block = 15" value={draft.travelByLocation} maxLength={8000} onChange={e=>patch({travelByLocation:e.target.value})}/>
      <label htmlFor="calendar-pattern-start">Timetable cycle starts on</label>
      <input id="calendar-pattern-start" type="date" className="input" value={draft.timetableStart} onChange={e=>patch({timetableStart:e.target.value})}/>
      <label htmlFor="calendar-pattern">One label or shift plan per week</label>
      <textarea id="calendar-pattern" className="input" placeholder={'Week A · early shifts\nWeek B · late shifts'} value={draft.timetablePattern} maxLength={1500} onChange={e=>patch({timetablePattern:e.target.value})}/>
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
