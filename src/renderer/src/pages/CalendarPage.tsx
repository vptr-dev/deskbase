import { useMemo, useState } from 'react'
import { useData, getData } from '../store'
import type { Task } from '../types'
import { DAYS_SHORT, MONTHS_LONG, addDays, dayKey, longDate, parseDay, today, weekStartOf } from '../lib/util'
import { habitDoneOn } from '../lib/game'
import { Button, Segmented } from '../components/ui'
import { QuickAdd, TaskRow, useTaskDrawer } from '../components/TaskItems'
import { MOODS } from './JournalPage'

function defaultListId(): string {
  const d = getData()
  return Object.values(d.pages).find((p) => p.type === 'tasks' && !p.deletedAt)?.id ?? Object.values(d.pages).find((p) => !p.deletedAt)?.id ?? ''
}

export function CalendarPage({ pageId }: { pageId: string }): JSX.Element {
  const tasks = useData((d) => d.tasks)
  const journal = useData((d) => d.journal)
  const habits = useData((d) => d.habits)
  const weekStart = useData((d) => d.settings.weekStart)
  const [cursor, setCursor] = useState(today())
  const [mode, setMode] = useState<'month' | 'week'>('month')
  const [selected, setSelected] = useState(today())
  const [, openTask, drawer] = useTaskDrawer()

  const byDay = useMemo(() => {
    const m: Record<string, Task[]> = {}
    for (const t of Object.values(tasks)) if (t.due && !t.archived) (m[t.due] ??= []).push(t)
    return m
  }, [tasks])
  const moodBy = useMemo(() => {
    const m: Record<string, number> = {}
    for (const j of Object.values(journal)) if (j.mood) m[j.date] = j.mood
    return m
  }, [journal])

  const d = parseDay(cursor)
  const first = dayKey(new Date(d.getFullYear(), d.getMonth(), 1))
  const gridStart = mode === 'month' ? weekStartOf(first, weekStart) : weekStartOf(cursor, weekStart)
  const count = mode === 'month' ? 42 : 7
  const days = Array.from({ length: count }, (_, i) => addDays(gridStart, i))
  const heads = Array.from({ length: 7 }, (_, i) => DAYS_SHORT[(i + weekStart) % 7])
  const move = (n: number): void => {
    if (mode === 'week') return setCursor(addDays(cursor, n * 7))
    const nd = new Date(d.getFullYear(), d.getMonth() + n, 1)
    setCursor(dayKey(nd))
  }
  const selTasks = (byDay[selected] ?? []).sort((a, b) => Number(a.done) - Number(b.done) || (a.time ?? '').localeCompare(b.time ?? ''))
  const habitsDone = Object.values(habits).filter((h) => !h.archived && h.kind === 'good' && habitDoneOn(h, selected))

  return (
    <div className="calendar-page">
      <div className="toolbar">
        <h2 className="cal-title">{mode === 'month' ? `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}` : `Week of ${longDate(gridStart)}`}</h2>
        <div className="spacer" />
        <Segmented small value={mode} onChange={setMode} options={[{ value: 'month', label: 'Month' }, { value: 'week', label: 'Week' }]} />
        <Button small kind="ghost" icon="left" title="Previous" onClick={() => move(-1)} />
        <Button small onClick={() => { setCursor(today()); setSelected(today()) }}>Today</Button>
        <Button small kind="ghost" icon="right" title="Next" onClick={() => move(1)} />
      </div>
      <div className="cal-layout">
        <div className={`cal-grid glass ${mode}`}>
          {heads.map((h) => <div key={h} className="cal-head">{h}</div>)}
          {days.map((k) => {
            const items = byDay[k] ?? []
            const inMonth = mode === 'week' || parseDay(k).getMonth() === d.getMonth()
            return (
              <button key={k} className={`cal-cell ${inMonth ? '' : 'other'} ${k === today() ? 'today' : ''} ${k === selected ? 'selected' : ''}`} onClick={() => setSelected(k)}>
                <div className="cal-num">{parseDay(k).getDate()}{moodBy[k] ? <span className="cal-mood">{MOODS[moodBy[k]]}</span> : null}</div>
                <div className="cal-items">
                  {items.slice(0, mode === 'week' ? 12 : 3).map((t) => <div key={t.id} className={`cal-item ${t.done ? 'done' : ''} ${!t.done && k < today() ? 'over' : ''}`}>{t.time ? t.time + ' ' : ''}{t.title}</div>)}
                  {items.length > (mode === 'week' ? 12 : 3) && <div className="cal-more">+{items.length - (mode === 'week' ? 12 : 3)} more</div>}
                </div>
              </button>
            )
          })}
        </div>
        <div className="cal-side glass">
          <div className="strong">{longDate(selected)}</div>
          <QuickAdd pageId={defaultListId()} defaults={{ due: selected }} placeholder="Add task on this day" />
          <div className="task-list">
            {selTasks.length ? selTasks.map((t) => <TaskRow key={t.id} task={t} showPage onOpen={openTask} />) : <div className="muted small pad">Nothing scheduled</div>}
          </div>
          {habitsDone.length > 0 && (
            <div>
              <div className="section-label">Habits done</div>
              <div className="row wrap gap-xs">{habitsDone.map((h) => <span key={h.id} className="chip">{h.icon} {h.name}</span>)}</div>
            </div>
          )}
        </div>
      </div>
      {drawer}
      <span hidden>{pageId}</span>
    </div>
  )
}
