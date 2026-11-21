import type { CustomRepeat } from '../types'
import { occurrence, validDay } from '../lib/recurrence'
import { addDays, DAYS_LONG, DAYS_SHORT, friendlyDay } from '../lib/util'

export function firstScheduledDate(draft: CustomRepeat, from = draft.start): string | null {
  const valid = validDay(draft.start) && Number.isInteger(draft.interval) && draft.interval >= 1 && draft.interval <= 999 &&
    (draft.unit !== 'week' || draft.days.length > 0) && (!draft.until || validDay(draft.until))
  return valid ? occurrence(draft, from) : null
}

export function ScheduleFields({ id, draft, onChange, from }: {
  id: string; draft: CustomRepeat; onChange: (rule: CustomRepeat) => void; from?: string
}): JSX.Element {
  const first = firstScheduledDate(draft, from)
  const preview: string[] = []
  if (first) {
    let date: string | null = first
    while (date && preview.length < 3) {
      preview.push(date)
      date = occurrence(draft, addDays(date, 1))
    }
  }
  return <>
      <div className="row gap-sm wrap"><label htmlFor={`interval-${id}`}>Every</label>
        <input id={`interval-${id}`} aria-label="Repeat interval" className="input input-sm w-60" type="number" min={1} max={999} value={draft.interval || ''} onChange={e => onChange({ ...draft, interval: Number(e.target.value) })} />
        <select aria-label="Repeat unit" className="input input-sm" value={draft.unit} onChange={e => onChange({ ...draft, unit: e.target.value as CustomRepeat['unit'] })}>
          {(['day', 'week', 'month', 'year'] as const).map(unit => <option key={unit} value={unit}>{unit}{draft.interval === 1 ? '' : 's'}</option>)}
        </select>
      </div>
      {draft.unit === 'week' && <div role="group" aria-label="Repeat on weekdays" className="repeat-days">
        {Array.from({ length: 7 }, (_, i) => (i + draft.weekStart) % 7).map(day => <button key={day} type="button" aria-label={DAYS_LONG[day]} aria-pressed={draft.days.includes(day)} className="chip-btn" onClick={() => {
          const days = draft.days.includes(day) ? draft.days.filter(d => d !== day) : [...draft.days, day]
          onChange({ ...draft, days })
        }}>{DAYS_SHORT[day]}</button>)}
      </div>}
      <label className="repeat-date">Start date<input className="input input-sm" type="date" value={draft.start} onChange={e => onChange({ ...draft, start: e.target.value })} /></label>
      <label className="repeat-date">End date (optional)<input className="input input-sm" type="date" min={draft.start} value={draft.until ?? ''} onChange={e => onChange({ ...draft, until: e.target.value || undefined })} /></label>
      <span className="muted small" aria-live="polite">{first ? 'Scheduled: ' + preview.map(friendlyDay).join(' · ') : !draft.days.length && draft.unit === 'week' ? 'Choose at least one weekday.' : 'Choose an interval and dates that include an occurrence.'}</span>
  </>
}
