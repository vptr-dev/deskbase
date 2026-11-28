import { conflictingEvents, freeRanges, locationTravel, minuteOf, sourceTime, timetableWeek, timeLabel } from '../lib/calendarPlanning'
import { calendarOptions, CalendarPreferences, type CalendarOptions } from './CalendarPreferences'
import { useEffect, useMemo, useState } from 'react'
import { Glyph, Icon } from '../components/Icon'
import { addTask, useData, getData, updateTask, updatePage } from '../store'
import type { Task } from '../types'
import { DAYS_SHORT, MONTHS_LONG, addDays, dayKey, friendlyDay, longDate, parseDay, plural, today, weekStartOf } from '../lib/util'
import { habitDoneOn } from '../lib/habits'
import { Button, Empty, Segmented } from '../components/ui'
import { QuickAdd, TaskRow, useTaskDrawer } from '../components/TaskItems'
import { MOODS } from './JournalPage'
import { type CalEvent, eventsByDay, useCalendarEvents } from '../lib/connections'
import { EventRow } from '../components/PanelKit5'

function CalendarEvents({ events, day }: { events: CalEvent[]; day: string }) {
  const conflicts=conflictingEvents(events,day)
  return <div className="cal-events glass">{events.map(event=><div key={event.id+event.conn}>
    <EventRow e={event}/><div className="calendar-event-source muted small">{event.connName}{sourceTime(event) && ' · '+sourceTime(event)}{conflicts.has(event) && <strong> · Overlap</strong>}</div>
  </div>)}</div>
}

function Agenda({ byDay, evBy, onOpen, days, onDays }: { days: number; onDays: (n: number) => void; byDay: Record<string, Task[]>; evBy: Record<string, CalEvent[]>; onOpen: (id: string) => void }): JSX.Element {
  const t = today()
  const overdue = Object.entries(byDay).filter(([k]) => k < t).flatMap(([, v]) => v).filter((x) => !x.done).sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''))
  const keys = Array.from({ length: days }, (_, i) => addDays(t, i)).filter((k) => byDay[k]?.length || evBy[k]?.length)
  const sortDay = (list: Task[]): Task[] => [...list].sort((a, b) => Number(a.done) - Number(b.done) || (a.time ?? '99').localeCompare(b.time ?? '99'))
  return (
    <div className="agenda">
      {overdue.length > 0 && (
        <section className="agenda-day">
          <div className="agenda-head danger"><span className="strong">Overdue</span><span className="muted small">{plural(overdue.length, 'task')}</span></div>
          <div className="task-list glass">{overdue.map((x) => <TaskRow key={x.id} task={x} showPage onOpen={onOpen} />)}</div>
        </section>
      )}
      {keys.map((k) => (
        <section key={k} className="agenda-day">
          <div className={`agenda-head ${k === t ? 'accent' : ''}`}><span className="strong">{friendlyDay(k)}</span><span className="muted small">{longDate(k)}</span></div>
          {!!evBy[k]?.length && <CalendarEvents events={evBy[k]} day={k}/>}
          {!!byDay[k]?.length && <div className="task-list glass">{sortDay(byDay[k]).map((x) => <TaskRow key={x.id} task={x} showPage onOpen={onOpen} />)}</div>}
        </section>
      ))}
      {days < 365 && <div className="center"><Button small kind="ghost" onClick={() => onDays(days < 90 ? 90 : 365)}>Show more</Button></div>}
    </div>
  )
}

export function CalendarPage({ pageId }: { pageId: string }): JSX.Element {
  const pages=useData(d=>d.pages)
  const connections=useData(d=>d.connections)
  const feeds:string[]|undefined=pages[pageId]?.view?.calendarFeeds
  const sources:string[]|undefined=pages[pageId]?.view?.sourceIds
  const [meetingLength,setMeetingLength]=useState(30)
  const [meetingPicked,setMeetingPicked]=useState<string[]>([])
  const [copied,setCopied]=useState(false)
  const [destination,setDestination]=useState('')
  const planners = Object.values(pages).filter(p=>!p.deletedAt && ['calendar','tasks','board','project'].includes(p.type) && (!sources || sources.includes(p.id)))
  const target = planners.some(p=>p.id===destination) ? destination : planners.find(p=>p.id===pageId)?.id || planners[0]?.id

  const tasks = useData((d) => d.tasks)
  const journal = useData((d) => d.journal)
  const habits = useData((d) => d.habits)
  const appWeekStart = useData(d => d.settings.weekStart)
  const rawOptions = useData(d => d.pages[pageId]?.view?.calendar)
  const options = useMemo(() => calendarOptions(rawOptions), [rawOptions])
  const weekStart = options.weekStart ?? appWeekStart
  const [editing, setEditing] = useState(false)
  const saveOptions = (calendar: CalendarOptions): void => updatePage(pageId, p => {
    p.view = { ...p.view, calendar }
  })
  const initial=useData(d=>d.pages[pageId]?.view?.calendarDay) as string|undefined
  const [cursor, setCursor] = useState(initial||today())
  const mode: 'month' | 'week' | 'agenda' = useData((d) => d.pages[pageId]?.view?.mode ?? 'month')
  const setMode = (m: 'month' | 'week' | 'agenda'): void => updatePage(pageId, (p) => { p.view = { ...(p.view ?? {}), mode: m } })
  const [dropOn, setDropOn] = useState<string | null>(null)
  const dropProps = (k: string): React.HTMLAttributes<HTMLDivElement> => ({
    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes('text/task')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dropOn !== k) setDropOn(k) } },
    onDragLeave: () => setDropOn((x) => (x === k ? null : x)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      setDropOn(null)
      const id = e.dataTransfer.getData('text/task')
      if (id && getData().tasks[id]) { updateTask(id, (t) => { t.due = k }); setSelected(k) }
    }
  })
  const [picked, setSelected] = useState(initial||today())
  useEffect(()=>{if(initial){setCursor(initial);setSelected(initial)}},[initial])
  const selected = addDays(picked, Math.min(...options.weekdays.map(day => (day - parseDay(picked).getDay() + 7) % 7)))
  const events = useCalendarEvents(feeds)
  const cancelled=useCalendarEvents(feeds,true)
  const existingFollowups = new Set(Object.values(tasks).filter(t=>!t.archived && !t.done && t.calendarFollowup).map(t=>t.calendarFollowup))
  const cancelledRecent = cancelled.filter(e=>(!feeds || feeds.includes(e.conn)) && e.start>=addDays(today(),-14)).slice(0,30)
  const countdowns=useData(d=>d.countdowns)
  const evBy = useMemo(() => {
    const years=[Number(cursor.slice(0,4))-1,Number(cursor.slice(0,4)),Number(cursor.slice(0,4))+1]
    const local:CalEvent[]=countdowns.flatMap(c=>(c.yearly?years.map(y=>y+c.date.slice(4)):[c.date]).filter(Boolean).map(date=>({id:c.id,title:c.title,start:date,color:c.color,conn:'countdown',connName:'Countdown',allDay:true,at:parseDay(date).getTime()})))
    return Object.fromEntries(Object.entries(eventsByDay([...(options.events?events.filter(e=>!feeds || feeds.includes(e.conn)):[]),...local])).filter(([day]) => options.weekdays.includes(parseDay(day).getDay())))
  }, [events, options,countdowns,cursor,feeds])
  const [, openTask, drawer] = useTaskDrawer()

  const byDay = useMemo(() => {
    const m: Record<string, Task[]> = {}
    for (const t of Object.values(tasks)) {
      if ((!sources||sources.includes(t.pageId)) && t.due && !t.archived && (options.completed || !t.done) && options.weekdays.includes(parseDay(t.due).getDay())) (m[t.due] ??= []).push(t)
    }
    return m
  }, [tasks, options,sources])
  const window={start:minuteOf(options.dayStart) ?? 540,end:minuteOf(options.dayEnd) ?? 1020}
  const travel=locationTravel(options.travelByLocation)
  function capacity(day:string):boolean {
    const planned=(byDay[day]||[]).filter(t=>!t.done && t.estimate && t.estimate>0)
    const untimed=planned.filter(t=>minuteOf(t.time)===null).reduce((n,t)=>n+(t.estimate||0),0)
    const timed=planned.filter(t=>minuteOf(t.time)!==null).reduce((n,t)=>n+(t.estimate||0),0)
    const afterEvents=freeRanges([],evBy[day]||[],day,window,travel).reduce((n,r)=>n+r.end-r.start,0)
    const available=freeRanges(planned,evBy[day]||[],day,window,travel).reduce((n,r)=>n+r.end-r.start,0)
    return untimed>available || timed+untimed>afterEvents
  }
  const [showMeeting,setShowMeeting]=useState(false)
  const now=new Date()
  const startForToday=Math.max(window.start,Math.ceil((now.getHours()*60+now.getMinutes())/5)*5)
  const slots=showMeeting?Array.from({length:21},(_,i)=>addDays(today(),i)).flatMap(day=>{
    if(!options.weekdays.includes(parseDay(day).getDay()))return []
    const bounds={...window,start:day===today()?startForToday:window.start}
    if(bounds.start>=bounds.end)return []
    return freeRanges(byDay[day]||[],evBy[day]||[],day,bounds,travel)
      .filter(r=>r.end-r.start>=meetingLength).map(r=>({day,start:r.start,end:r.end}))
  }).slice(0,12):[]
  const moodBy = useMemo(() => {
    const m: Record<string, number> = {}
    for (const j of Object.values(journal)) if (j.mood) m[j.date] = j.mood
    return m
  }, [journal])

  const d = parseDay(cursor)
  const first = dayKey(new Date(d.getFullYear(), d.getMonth(), 1))
  const gridStart = mode === 'month' ? weekStartOf(first, weekStart) : weekStartOf(cursor, weekStart)
  const count = mode === 'month' ? 42 : 7
  const days = Array.from({ length: count }, (_, i) => addDays(gridStart, i)).filter(k => options.weekdays.includes(parseDay(k).getDay()))
  const heads = Array.from({ length: 7 }, (_, i) => (i + weekStart) % 7).filter(day => options.weekdays.includes(day)).map(day => DAYS_SHORT[day])
  const move = (n: number): void => {
    if (mode === 'agenda') return
    if (mode === 'week') return setCursor(addDays(cursor, n * 7))
    const nd = new Date(d.getFullYear(), d.getMonth() + n, 1)
    setCursor(dayKey(nd))
  }
  const selTasks = (byDay[selected] ?? []).sort((a, b) => Number(a.done) - Number(b.done) || (a.time ?? '').localeCompare(b.time ?? ''))
  const habitsDone = Object.values(habits).filter((h) => !h.archived && h.kind === 'good' && habitDoneOn(h, selected))

  return (
    <div className="calendar-page">
      {options.events && cancelledRecent.length>0 && <details><summary>Cancelled events ({cancelledRecent.length})</summary>
        {cancelledRecent.map(event=>{
          const link=event.conn+':'+event.id
          return <div className="row wrap gap-sm" key={link}><span>{event.title} · {longDate(event.start)}</span>
            <Button small disabled={!target || existingFollowups.has(link)} onClick={()=>{
              if(!target)return
              const due=today()
              addTask(target,{title:'Follow up on '+event.title,due,remindAt:Date.now()+60_000,
                notes:[event.notes,event.location,event.url].filter(Boolean).join('\n'),calendarFollowup:link})
            }}>{existingFollowups.has(link)?'Reminder added':'Make follow-up reminder'}</Button>
          </div>
        })}
      </details>}
      <details><summary>Calendars and planners</summary>{Object.values(pages).filter(p=>!p.deletedAt&&['calendar','tasks','board','project'].includes(p.type)).map(p=><label key={p.id} className="row gap-sm"><input type="checkbox" checked={!sources||sources.includes(p.id)} onChange={e=>{const current=sources??Object.values(pages).filter(x=>!x.deletedAt&&['calendar','tasks','board','project'].includes(x.type)).map(x=>x.id);updatePage(pageId,x=>{x.view={...x.view,sourceIds:e.target.checked?[...current,p.id]:current.filter(id=>id!==p.id)}})}}/>{p.title}</label>)}</details>
      {connections.some(c=>c.kind==='calendar'&&!c.off) && <details><summary>Connected calendars</summary>
        {connections.filter(c=>c.kind==='calendar'&&!c.off).map(c=><label key={c.id} className="row gap-xs">
          <input type="checkbox" checked={!feeds || feeds.includes(c.id)} onChange={e=>{
            const ids=feeds ?? connections.filter(x=>x.kind==='calendar'&&!x.off).map(x=>x.id)
            updatePage(pageId,p=>{p.view={...p.view,calendarFeeds:e.target.checked?[...ids,c.id]:ids.filter(id=>id!==c.id)}})
          }}/>{c.name || 'Calendar'}
        </label>)}
      </details>}
      {timetableWeek(cursor,options.timetableStart,options.timetablePattern) && <div className="calendar-week-cycle">
        {timetableWeek(cursor,options.timetableStart,options.timetablePattern)}
      </div>}
      <div className="toolbar">
        <h2 className="cal-title">{mode === 'agenda' ? 'Agenda' : mode === 'month' ? `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}` : `Week of ${longDate(gridStart)}`}</h2>
        <div className="spacer" />
        <Segmented small value={mode} onChange={setMode} options={[{ value: 'month', label: 'Month' }, { value: 'week', label: 'Week' }, { value: 'agenda', label: 'Agenda' }]} />
        <Button small kind="ghost" icon="sliders-horizontal" title="Customize calendar view" onClick={() => setEditing(true)}>View options</Button>
        {mode !== 'agenda' && <>
          <Button small kind="ghost" icon="left" title="Previous" onClick={() => move(-1)} />
          <Button small onClick={() => { setCursor(today()); setSelected(today()) }}>Today</Button>
          <Button small kind="ghost" icon="right" title="Next" onClick={() => move(1)} />
        </>}
      </div>
      <details className="calendar-meetings" onToggle={e=>setShowMeeting(e.currentTarget.open)}><summary>Find shared free time</summary>
        {showMeeting && <><label>Meeting length <input type="number" min="5" max="480" className="input input-sm w-80" value={meetingLength}
          onChange={e=>{setMeetingLength(Math.max(5,Math.min(480,Number(e.target.value)||30)));setMeetingPicked([]);setCopied(false)}}/> minutes</label>
          {slots.length ? <div className="meeting-slots">{slots.map((slot,index)=>{
            const text=longDate(slot.day)+' · '+timeLabel(slot.start)+'–'+timeLabel(slot.start+meetingLength)
            return <label key={text}><input type="checkbox" checked={meetingPicked.includes(text)} onChange={e=>{setMeetingPicked(old=>e.target.checked?[...old,text]:old.filter(x=>x!==text));setCopied(false)}}/>
              {text}{index===0 && <strong> · Next free interval (until {timeLabel(slot.end)})</strong>}
            </label>
          })}</div> : <p>No matching opening in the next 21 days.</p>}
          <Button small disabled={!meetingPicked.length} onClick={()=>void navigator.clipboard.writeText(meetingPicked.join('\n')).then(()=>setCopied(true)).catch(()=>setCopied(false))}>{copied?'Copied':'Copy meeting options'}</Button>
        </>}
      </details>
      {mode === 'agenda' ? <Agenda days={options.agendaDays} onDays={agendaDays => saveOptions({ ...options, agendaDays })} byDay={byDay} evBy={evBy} onOpen={openTask} /> : (
      <div className="cal-layout">
        <div className={`cal-grid glass ${mode}`} style={{ gridTemplateColumns: `repeat(${heads.length}, minmax(0, 1fr))` }}>
          {heads.map((h) => <div key={h} className="cal-head">{h}</div>)}
          {days.map((k) => {
            const items = byDay[k] ?? []
            const overCapacity=items.length>0 && capacity(k)
            const evs = evBy[k] ?? []
            const cap = options.itemLimit ?? (mode === 'week' ? 12 : 3)
            const shownEv = evs.slice(0, cap)
            const room = Math.max(0, cap - shownEv.length)
            const more = evs.length + items.length - shownEv.length - Math.min(room, items.length)
            const inMonth = mode === 'week' || parseDay(k).getMonth() === d.getMonth()
            return (
              <div key={k} data-date={k} data-over-capacity={overCapacity || undefined} role="button" tabIndex={0} className={`cal-cell ${DAYS_SHORT[parseDay(k).getDay()] === heads[heads.length - 1] ? 'last-column' : ''} ${inMonth ? '' : 'other'} ${k === today() ? 'today' : ''} ${k === selected ? 'selected' : ''} ${dropOn === k ? 'drop' : ''}`} onClick={() => setSelected(k)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(k) } }} {...dropProps(k)}>
                <div className="cal-num">{parseDay(k).getDate()}{overCapacity && <span className="danger" title="Estimated work exceeds available time" aria-label="Over capacity">!</span>}{moodBy[k] ? <span className="cal-mood"><Icon name={MOODS[moodBy[k]]} size={12} /></span> : null}</div>
                <div className="cal-items">
                  {shownEv.map((e) => <div key={e.id + e.conn} className="cal-item cal-event" style={{ '--ev': e.color } as React.CSSProperties} title={[e.title, e.location].filter(Boolean).join(' · ')}>{e.allDay || e.start !== k ? '' : e.time + ' '}{e.title}</div>)}
                  {items.slice(0, room).map((t) => <div key={t.id} draggable title={t.title} onDragStart={(e) => { e.dataTransfer.setData('text/task', t.id); e.dataTransfer.effectAllowed = 'move' }} onDoubleClick={(e) => { e.stopPropagation(); openTask(t.id) }} className={`cal-item ${t.done ? 'done' : ''} ${!t.done && k < today() ? 'over' : ''}`}>{t.time ? t.time + ' ' : ''}{t.title}</div>)}
                  {more > 0 && <div className="cal-more">+{more} more</div>}
                </div>
              </div>
            )
          })}
        </div>
        <div className="cal-side glass">
          <div className="strong">{longDate(selected)}</div>
          {timetableWeek(selected,options.timetableStart,options.timetablePattern) && <div className="small muted">{timetableWeek(selected,options.timetableStart,options.timetablePattern)}</div>}
          {capacity(selected) && <div className="danger small">Estimated work exceeds available hours.</div>}
          {(evBy[selected]||[]).filter(e=>!e.allDay && e.start===selected && !!travel[e.location?.trim().toLowerCase() || '']).map(e=>{
            const duration=travel[e.location!.trim().toLowerCase()]
            return <div key={e.conn+e.id} className="small muted">Travel before {e.title} · {duration} min</div>
          })}
          {!!evBy[selected]?.length && <CalendarEvents events={evBy[selected]} day={selected}/>}
          {planners.length>1 && <label>Save new task in <select className="input input-sm" aria-label="Calendar task destination" value={target || ''} onChange={e=>setDestination(e.target.value)}>
            {planners.map(p=><option key={p.id} value={p.id}>{p.title || 'Untitled'}</option>)}
          </select></label>}
          {target && <QuickAdd key={target+selected} pageId={target} defaults={{due:selected}} placeholder="Add task on this day" />}
          <details><summary>Unscheduled tasks</summary><div className="task-list">
            {Object.values(tasks).filter(t=>!t.done && !t.archived && !t.due && planners.some(p=>p.id===t.pageId)).map(t=><TaskRow key={t.id} task={t} showPage draggable onOpen={openTask}/>)}
          </div></details>
          <div className="task-list">
            {selTasks.length ? selTasks.map((t) => <TaskRow key={t.id} task={t} showPage draggable onOpen={openTask} />) : <div className="muted small pad">Nothing scheduled</div>}
          </div>
          {habitsDone.length > 0 && (
            <div>
              <div className="section-label">Habits done</div>
              <div className="row wrap gap-xs">{habitsDone.map((h) => <span key={h.id} className="chip"><Glyph value={h.icon} size={12} color={h.color} /> {h.name}</span>)}</div>
            </div>
          )}
        </div>
      </div>
      )}
      {drawer}
      {editing && <CalendarPreferences options={options} onClose={() => setEditing(false)} onSave={value => { saveOptions(value); setEditing(false) }} />}
    </div>
  )
}
