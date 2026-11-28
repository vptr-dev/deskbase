import { useState } from 'react'
import { setSettings,useData } from '../store'
import type { CustomRepeat } from '../types'
import { occurrence, validDay } from '../lib/recurrence'
import { diffDays, addDays, DAYS_LONG, DAYS_SHORT, friendlyDay } from '../lib/util'

export function firstScheduledDate(draft: CustomRepeat, from = draft.start): string | null {
  const valid = validDay(draft.start) && Number.isInteger(draft.interval) && draft.interval >= 1 && draft.interval <= 999 &&
    (draft.unit !== 'week' || draft.days.length > 0) && (!draft.until || validDay(draft.until))
  return valid ? occurrence(draft, from) : null
}

export function ScheduleFields({ id, draft, onChange, from, taskLimit }: {
  id: string; draft: CustomRepeat; onChange: (rule: CustomRepeat) => void; from?: string; taskLimit?:boolean
}): JSX.Element {
  const patterns=useData(d=>d.settings.repeatPatterns)??[]
  const [name,setName]=useState('')
  const [excluded,setExcluded]=useState('')
  const [people,setPeople]=useState(draft.rotation?.join('\n') ?? '')
  const first = firstScheduledDate(draft, from)
  const preview: string[] = []
  if (first) {
    let date: string | null = first
    while (date && preview.length < Math.min(10,draft.remaining??10)) {
      preview.push(date)
      date = occurrence(draft, addDays(date, 1))
    }
  }
  return <>
      <details><summary>Named schedules</summary><div className="row wrap gap-sm">
        {patterns.map(p=><span key={p.name}><button type="button" className="btn btn-sm" onClick={()=>{
          const rule={...p.rule,start:draft.start,until:p.rule.until?addDays(draft.start,diffDays(p.rule.until,p.rule.start)):undefined}
          if(!taskLimit){delete rule.remaining;delete rule.afterCompletion;delete rule.rotation}
          setPeople(rule.rotation?.join('\n') || '')
          onChange(rule)
        }}>{p.name}</button><button type="button" className="icon-btn" aria-label={'Remove schedule '+p.name} onClick={()=>setSettings(s=>{s.repeatPatterns=s.repeatPatterns?.filter(x=>x.name!==p.name)})}>×</button></span>)}
        <input className="input input-sm" placeholder="Schedule name" aria-label="Schedule name" value={name} onChange={e=>setName(e.target.value)}/>
        <button type="button" className="btn btn-sm" disabled={!name.trim()||!first} onClick={()=>{setSettings(s=>{s.repeatPatterns=[...(s.repeatPatterns??[]).filter(x=>x.name!==name.trim()),{name:name.trim(),rule:{...draft,days:[...draft.days]}}]});setName('')}}>Save schedule</button>
      </div></details>
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
      {taskLimit&&<label className="repeat-date">Occurrences including this task<input aria-label="Occurrence limit" className="input input-sm" type="number" min="1" step="1" placeholder="Unlimited" value={draft.remaining??''} onChange={e=>{const n=e.target.valueAsNumber;if(!e.target.value||Number.isSafeInteger(n)&&n>0)onChange({...draft,remaining:e.target.value?n:undefined})}}/></label>}
      {taskLimit && <label><input type="checkbox" checked={!!draft.afterCompletion} onChange={e=>onChange({...draft,afterCompletion:e.target.checked})}/> Restart interval from completion</label>}
      {taskLimit && <label>Rotate among, one name per line<textarea className="input input-sm" aria-label="Household rotation"
        value={people} onChange={e=>{setPeople(e.target.value);onChange({...draft,rotation:[...new Set(e.target.value.split('\n').map(name=>name.trim().slice(0,80)).filter(Boolean))].slice(0,30)})}}/></label>}
      <details><summary>Excluded dates and holidays ({draft.excludedDates?.length || 0})</summary>
        <label>Skip date<input className="input input-sm" type="date" value={excluded} onChange={e=>setExcluded(e.target.value)} /></label>
        <button className="btn btn-sm" type="button" disabled={!validDay(excluded)||draft.excludedDates?.includes(excluded)||(draft.excludedDates?.length??0)>=366} onClick={()=>{
          onChange({...draft,excludedDates:[...draft.excludedDates??[],excluded].sort()});setExcluded('')
        }}>Exclude date</button>
        {(draft.excludedDates ?? []).map(date=><button key={date} type="button" className="chip-btn" aria-label={'Remove excluded date '+date}
          onClick={()=>onChange({...draft,excludedDates:draft.excludedDates?.filter(d=>d!==date)})}>{friendlyDay(date)} ×</button>)}
      </details>
      <span className="muted small" aria-live="polite">{first ? (draft.afterCompletion?'If completed on each due date: ':'Next dates: ') + preview.map(friendlyDay).join(' · ') : !draft.days.length && draft.unit === 'week' ? 'Choose at least one weekday.' : 'Choose an interval and dates that include an occurrence.'}</span>
  </>
}
