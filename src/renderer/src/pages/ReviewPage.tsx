import { useMemo, useState } from 'react'
import { moveOverdueToToday, openPage, updatePage, useData } from '../store'
import { habitDoneOn, habitScheduled } from '../lib/habits'
import { DAYS_SHORT, addDays, dayKey, formatMinutes, friendlyDay, parseDay, today, weekStartOf } from '../lib/util'
import { AutoText, BarChart, Stat } from '../components/ui'
import { Icon } from '../components/Icon'
import { MOODS } from './JournalPage'
import { formatValue } from '../lib/values'

const shortDate = (k: string): string => parseDay(k).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

const inRange = (ts: number | null | undefined, from: string, to: string): boolean => {
  if (!ts) return false
  const k = dayKey(new Date(ts))
  return k >= from && k < to
}

/** One week at a glance: what got done, how habits went, and a place to reflect. */
export function ReviewPage({ pageId }: { pageId: string }): JSX.Element {
  const d = useData((x) => x)
  const weekStart = d.settings.weekStart
  const [from, setFrom] = useState(() => weekStartOf(today(), weekStart))
  const to = addDays(from, 7)
  const isCurrent = from === weekStartOf(today(), weekStart)
  const notes: Record<string, string> = d.pages[pageId]?.view?.reviews ?? {}
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i))

  const s = useMemo(() => {
    const tasks = Object.values(d.tasks)
    const done = tasks.filter((t) => t.done && inRange(t.doneAt, from, to))
    const habits = Object.values(d.habits).filter((h) => !h.archived && h.kind === 'good' && d.pages[h.pageId] && !d.pages[h.pageId].deletedAt)
    let sched = 0
    let hit = 0
    for (const h of habits) for (const k of days) if (k <= today() && habitScheduled(h, k)) { sched++; if (habitDoneOn(h, k)) hit++ }
    const focus = d.focus.filter((f) => f.kind === 'focus' && inRange(f.start, from, to)).reduce((a, f) => a + f.minutes, 0)
    const entries = Object.values(d.journal).filter((j) => j.date >= from && j.date < to && j.text.trim())
    const moods = entries.filter((j) => j.mood > 0)
    const fromMs = new Date(from + 'T00:00').getTime()
    const toMs = new Date(to + 'T00:00').getTime()
    const valueChanges = Object.values(d.values)
      .map((v) => ({ v, delta: v.log.filter((e) => e.at >= fromMs && e.at < toMs).reduce((a, e) => a + e.delta, 0) }))
      .filter((x) => x.delta !== 0)
    const tagCount = new Map<string, number>()
    for (const t of done) for (const g of t.tags) tagCount.set(g, (tagCount.get(g) ?? 0) + 1)
    return {
      done,
      perDay: days.map((k, i) => ({ label: DAYS_SHORT[(i + weekStart) % 7], value: done.filter((t) => dayKey(new Date(t.doneAt!)) === k).length })),
      habitRate: sched ? hit / sched : null,
      focus,
      entries: entries.length,
      mood: moods.length ? moods.reduce((a, j) => a + j.mood, 0) / moods.length : 0,
      valueChanges,
      tags: [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
      overdue: tasks.filter((t) => !t.done && !t.archived && t.due && t.due < today()).length,
      next: tasks.filter((t) => !t.done && !t.archived && t.due && t.due >= to && t.due < addDays(to, 7)).sort((a, b) => a.due!.localeCompare(b.due!))
    }
  }, [d, from])

  return (
    <div className="review-page">
      <div className="toolbar">
        <button className="icon-btn" title="Previous week" onClick={() => setFrom(addDays(from, -7))}><Icon name="left" size={15} /></button>
        <span className="strong">{shortDate(from)} – {shortDate(addDays(to, -1))}</span>
        <button className="icon-btn" title="Next week" disabled={isCurrent} onClick={() => setFrom(addDays(from, 7))}><Icon name="right" size={15} /></button>
        {!isCurrent && <button className="link small" onClick={() => setFrom(weekStartOf(today(), weekStart))}>This week</button>}
      </div>
      <div className="stat-row">
        <Stat label="Tasks done" value={s.done.length} />
        <Stat label="Habits" value={s.habitRate === null ? '–' : `${Math.round(s.habitRate * 100)}%`} />
        <Stat label="Focus" value={s.focus ? formatMinutes(Math.round(s.focus)) : '0m'} />
        <Stat label="Journal" value={s.entries} sub={s.mood ? `mood ${MOODS[Math.round(s.mood)] ?? ''}` : undefined} />
      </div>
      <div className="review-grid">
        <section className="panel glass">
          <div className="panel-head"><h3>Completed per day</h3></div>
          <BarChart data={s.perDay} height={110} />
        </section>
        <section className="panel glass">
          <div className="panel-head"><h3>Highlights</h3></div>
          <div className="review-list">
            {s.tags.length > 0 && <div className="row gap-xs wrap">{s.tags.map(([t, n]) => <span key={t} className="chip">#{t} · {n}</span>)}</div>}
            {s.valueChanges.map(({ v, delta }) => <div key={v.id} className="row between small"><span>{v.icon} {v.name}</span><span className="muted">{delta > 0 ? '+' : ''}{formatValue(v, delta)}</span></div>)}
            {s.done.slice().sort((a, b) => b.priority - a.priority).slice(0, 5).map((t) => <div key={t.id} className="row gap-xs small"><Icon name="check" size={12} className="accent" /><span className="ellipsis">{t.title}</span></div>)}
            {!s.done.length && !s.valueChanges.length && <div className="muted small">Nothing logged this week.</div>}
          </div>
        </section>
        {isCurrent && (s.overdue > 0 || s.next.length > 0) && (
          <section className="panel glass">
            <div className="panel-head"><h3>Next week</h3>{s.overdue > 0 && <button className="link small" onClick={() => moveOverdueToToday()}>Move {s.overdue} overdue to today</button>}</div>
            {s.next.slice(0, 6).map((t) => <button key={t.id} className="row between small review-next" onClick={() => openPage(t.pageId)}><span className="ellipsis">{t.title}</span><span className="muted">{friendlyDay(t.due)}</span></button>)}
          </section>
        )}
        <section className="panel glass span2">
          <div className="panel-head"><h3>Reflection</h3></div>
          <AutoText
            className="notes"
            value={notes[from] ?? ''}
            placeholder="What went well? What will you change next week?"
            onChange={(v) => updatePage(pageId, (p) => { p.view = { ...(p.view ?? {}), reviews: { ...(p.view?.reviews ?? {}), [from]: v } } }, 'review:' + pageId + from)}
          />
        </section>
      </div>
    </div>
  )
}
