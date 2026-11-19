import { useMemo } from 'react'
import { moveOverdueToToday, openPage, useData } from '../store'
import { habitDayTarget, habitDoneOn, habitDueToday, habitStreak, habitWeekCount, isWeekly } from '../lib/habits'
import { CountdownsPanel } from '../components/Countdowns'
import { addDays, longDate, today } from '../lib/util'
import { Progress, Ring } from '../components/ui'
import { QuickAdd, TaskRow, useTaskDrawer } from '../components/TaskItems'
import { logHabit } from './HabitsPage'
import { ensureEntry, MOODS } from './JournalPage'
import { focusActions, fmtClock, remainingSecs, useFocus } from './FocusPage'
import { Glyph, Icon } from '../components/Icon'
import { goalProgress } from './GoalsPage'

function greeting(): string {
  const h = new Date().getHours()
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export function TodayPage({ pageId }: { pageId: string }): JSX.Element {
  const tasks = useData((d) => d.tasks)
  const habits = useData((d) => d.habits)
  const pages = useData((d) => d.pages)
  const journal = useData((d) => d.journal)
  const goals = useData((d) => d.goals)
  const focus = useFocus()
  const [, openTask, drawer] = useTaskDrawer()
  const t = today()

  const { overdue, due, upcoming, doneToday } = useMemo(() => {
    const list = Object.values(tasks).filter((x) => !x.archived && pages[x.pageId] && !pages[x.pageId].deletedAt)
    return {
      overdue: list.filter((x) => !x.done && x.due && x.due < t).sort((a, b) => a.due!.localeCompare(b.due!)),
      due: list.filter((x) => !x.done && x.due === t).sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99') || b.priority - a.priority),
      upcoming: list.filter((x) => !x.done && x.due && x.due > t && x.due <= addDays(t, 3)).sort((a, b) => a.due!.localeCompare(b.due!)),
      doneToday: list.filter((x) => x.done && x.doneAt && new Date(x.doneAt).toDateString() === new Date().toDateString())
    }
  }, [tasks, pages, t])
  const todaysHabits = Object.values(habits).filter((h) => !h.archived && pages[h.pageId] && !pages[h.pageId].deletedAt && habitDueToday(h, t))
  const journalPage = Object.values(pages).find((p) => p.type === 'journal' && !p.deletedAt)
  const entry = journalPage ? Object.values(journal).find((j) => j.pageId === journalPage.id && j.date === t) : undefined
  const listPage = Object.values(pages).find((p) => p.type === 'tasks' && !p.deletedAt)
  const focusPage = Object.values(pages).find((p) => p.type === 'focus' && !p.deletedAt)
  const activeGoals = Object.values(goals).filter((g) => !g.done && pages[g.pageId] && !pages[g.pageId].deletedAt).slice(0, 4)
  const total = due.length + overdue.length + doneToday.length

  return (
    <div className="today">
      <div className="today-hero">
        <div>
          <div className="today-greet">{greeting()}</div>
          <div className="muted">{longDate(t)}</div>
        </div>
        <div className="spacer" />
        <div className="today-rings">
          <div className="ring-block"><Ring value={total ? doneToday.length / total : 0} size={58} stroke={5}><span className="strong">{doneToday.length}</span></Ring><span className="muted small">Tasks</span></div>
        </div>
      </div>

      <div className="today-grid">
        <section className="panel glass span2">
          <div className="panel-head"><h3>Tasks</h3><span className="muted small">{due.length + overdue.length} to do</span></div>
          {listPage && <QuickAdd pageId={listPage.id} defaults={{ due: t }} placeholder="Add a task for today" />}
          {overdue.length > 0 && <><div className="group-label danger">Overdue<span className="count">{overdue.length}</span><button className="link" onClick={() => moveOverdueToToday()}>Move all to today</button></div><div className="task-list">{overdue.map((x) => <TaskRow key={x.id} task={x} showPage onOpen={openTask} />)}</div></>}
          <div className="task-list">{due.map((x) => <TaskRow key={x.id} task={x} showPage onOpen={openTask} />)}</div>
          {due.length + overdue.length === 0 && <div className="muted pad">All clear for today.</div>}
          {upcoming.length > 0 && <><div className="group-label">Coming up</div><div className="task-list">{upcoming.map((x) => <TaskRow key={x.id} task={x} showPage onOpen={openTask} />)}</div></>}
          {doneToday.length > 0 && <><div className="group-label">Done today<span className="count">{doneToday.length}</span></div><div className="task-list">{doneToday.map((x) => <TaskRow key={x.id} task={x} showPage onOpen={openTask} />)}</div></>}
        </section>

        <CountdownsPanel />

        <section className="panel glass">
          <div className="panel-head"><h3>Habits</h3><span className="muted small">{todaysHabits.filter((h) => h.kind === 'good' && habitDoneOn(h, t)).length}/{todaysHabits.filter((h) => h.kind === 'good').length}</span></div>
          {todaysHabits.length === 0 ? <div className="muted small">No habits for today.</div> : todaysHabits.map((h) => {
            const v = h.log[t] ?? 0
            const need = habitDayTarget(h)
            const done = h.kind === 'good' ? v >= need : false
            return (
              <div key={h.id} className="today-habit">
                <button className={`habit-cell ${done ? 'done' : ''} ${h.kind === 'bad' && v ? 'slip' : ''}`} style={{ ['--c' as any]: h.color }} onClick={() => logHabit(h.id, t, h.kind === 'good' && done ? -v : 1)}>
                  {done ? <Icon name="check" size={14} stroke={3} /> : h.kind === 'bad' && v ? <Icon name="x" size={14} stroke={3} /> : v ? <span className="small">{v}</span> : null}
                </button>
                <span className="grow row gap-xs"><Glyph value={h.icon} size={14} color={h.color} /> {h.name}{isWeekly(h) ? <span className="muted small"> {habitWeekCount(h, t)}/{h.target} this week</span> : h.target > 1 && h.kind === 'good' ? <span className="muted small"> {v}/{h.target}</span> : null}</span>
                <span className="muted small row gap-xs">{habitStreak(h) ? <><Icon name="flame" size={12} className="flame" />{habitStreak(h)}{isWeekly(h) ? 'w' : ''}</> : ''}</span>
              </div>
            )
          })}
        </section>

        <section className="panel glass">
          <div className="panel-head"><h3>Focus</h3>{focusPage && <button className="link small" onClick={() => openPage(focusPage.id)}>Open</button>}</div>
          <div className="row gap-md">
            <div className="clock-sm">{fmtClock(remainingSecs(focus))}</div>
            {focus.running
              ? <button className="btn btn-default btn-sm" onClick={focusActions.pause}><Icon name="pause" size={14} /> Pause</button>
              : <button className="btn btn-primary btn-sm" onClick={focusActions.start}><Icon name="play" size={14} /> Start</button>}
          </div>
        </section>

        <section className="panel glass">
          <div className="panel-head"><h3>Journal</h3></div>
          {journalPage ? (
            <button className="today-journal" onClick={() => { ensureEntry(journalPage.id, t); openPage(journalPage.id) }}>
              {entry?.text ? <><span className="big"><Icon name={MOODS[entry.mood] || 'notebook-pen'} size={22} /></span><span className="muted ellipsis">{entry.title || entry.text.slice(0, 80)}</span></> : <span className="muted">Write today’s entry</span>}
            </button>
          ) : <div className="muted small">Add a Journal page to write entries.</div>}
        </section>

        {activeGoals.length > 0 && (
          <section className="panel glass">
            <div className="panel-head"><h3>Goals</h3></div>
            {activeGoals.map((g) => (
              <button key={g.id} className="today-goal" onClick={() => openPage(g.pageId)}>
                <Glyph value={g.icon} fallback="target" size={15} color={g.color} /><span className="grow ellipsis">{g.title}</span>
                <Progress value={goalProgress(g, tasks)} color={g.color} className="w-80" />
              </button>
            ))}
          </section>
        )}
      </div>
      {drawer}
      <span hidden>{pageId}</span>
    </div>
  )
}
