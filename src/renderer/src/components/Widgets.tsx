import { useEffect, useMemo, useState } from 'react'
import { act, openPage, setOverlay, useData } from '../store'
import type { AppData, Page, Widget, WidgetType } from '../types'
import { formatValue, valueNow, valueSeries } from '../lib/values'
import { habitDayTarget, habitDoneOn, habitDueToday } from '../lib/habits'
import { DAYS_SHORT, MONTHS_LONG, addDays, dayKey, diffDays, friendlyDay, parseDay, today, weekStartOf } from '../lib/util'
import { countRows, rowsOf } from '../lib/db'
import { BarChart, Progress, Ring, Sparkline } from './ui'
import { Icon } from './Icon'
import { QuickAdd, TaskRow, useTaskDrawer } from './TaskItems'
import { adjustValue } from './Values'
import { logHabit } from '../pages/HabitsPage'
import { focusActions, fmtClock, remainingSecs, useFocus } from '../pages/FocusPage'
import { goalProgress } from '../pages/GoalsPage'
import { nextDate } from './Countdowns'
import { DatabaseView } from '../pages/DatabasePage'

export const WIDGETS: { type: WidgetType; name: string; icon: string; desc: string; w: number; h: number; config?: Record<string, any> }[] = [
  { type: 'value', name: 'Value', icon: 'diamond', desc: 'One of your values with + and −', w: 3, h: 2, config: { showChart: true, step: 1 } },
  { type: 'chart', name: 'Chart', icon: 'chart', desc: 'A value, tasks, focus or habits over time', w: 4, h: 3, config: { source: 'tasks', days: 14, kind: 'bar' } },
  { type: 'progress', name: 'Progress ring', icon: 'gauge', desc: 'Value toward its goal, or database rows done', w: 2, h: 2, config: { source: 'value' } },
  { type: 'stat', name: 'Number', icon: 'zap', desc: 'Tasks done, overdue, focus time, rows…', w: 2, h: 2, config: { stat: 'tasksToday' } },
  { type: 'tasks', name: 'Tasks', icon: 'check', desc: 'Today, overdue or upcoming tasks', w: 4, h: 4, config: { filter: 'today', quickAdd: true } },
  { type: 'habits', name: 'Habits', icon: 'repeat', desc: "Today's habits to check off", w: 3, h: 3, config: {} },
  { type: 'database', name: 'Database', icon: 'database', desc: 'A database view: table, board, gallery…', w: 6, h: 5, config: {} },
  { type: 'calendar', name: 'Calendar', icon: 'calendar', desc: 'This month with your tasks', w: 3, h: 4, config: {} },
  { type: 'clock', name: 'Clock', icon: 'clock', desc: 'Time and date', w: 3, h: 2, config: { seconds: false } },
  { type: 'note', name: 'Note', icon: 'note', desc: 'Free text you can edit in place', w: 3, h: 3, config: { text: '' } },
  { type: 'countdown', name: 'Countdown', icon: 'snooze', desc: 'Days until something', w: 2, h: 2, config: { title: '', date: '' } },
  { type: 'focus', name: 'Focus timer', icon: 'play', desc: 'Start and pause the focus timer', w: 3, h: 2, config: {} },
  { type: 'quickadd', name: 'Quick add', icon: 'plus', desc: 'Add a task to a list', w: 4, h: 1, config: {} },
  { type: 'goals', name: 'Goals', icon: 'flag', desc: 'Active goals with progress', w: 3, h: 3, config: {} },
  { type: 'page', name: 'Page link', icon: 'note', desc: 'A shortcut to one of your pages', w: 2, h: 1, config: {} }
]
export const widgetDef = (t: WidgetType): (typeof WIDGETS)[number] => WIDGETS.find((w) => w.type === t) ?? WIDGETS[0]

const livePage = (d: AppData, id: string): boolean => !!d.pages[id] && !d.pages[id].deletedAt
const isToday = (ts?: number | null): boolean => !!ts && dayKey(new Date(ts)) === today()

/** Re-render every `ms` (clock, countdowns). */
function useTick(ms: number): number {
  const [n, setN] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setN(Date.now()), ms); return () => clearInterval(id) }, [ms])
  return n
}

// ---------- built-in numbers ----------
export const STATS: { id: string; label: string; get: (d: AppData, cfg: Record<string, any>) => number; fmt?: (n: number) => string }[] = [
  { id: 'tasksToday', label: 'Tasks done today', get: (d) => Object.values(d.tasks).filter((t) => t.done && isToday(t.doneAt)).length },
  { id: 'tasksWeek', label: 'Tasks done this week', get: (d) => { const from = weekStartOf(today(), d.settings.weekStart); return Object.values(d.tasks).filter((t) => t.done && t.doneAt && dayKey(new Date(t.doneAt)) >= from).length } },
  { id: 'open', label: 'Open tasks', get: (d) => Object.values(d.tasks).filter((t) => !t.done && !t.archived && livePage(d, t.pageId)).length },
  { id: 'dueToday', label: 'Due today', get: (d) => Object.values(d.tasks).filter((t) => !t.done && t.due === today() && livePage(d, t.pageId)).length },
  { id: 'overdue', label: 'Overdue', get: (d) => Object.values(d.tasks).filter((t) => !t.done && t.due && t.due < today() && livePage(d, t.pageId)).length },
  { id: 'focusToday', label: 'Focus today', get: (d) => Math.round(d.focus.filter((f) => f.kind === 'focus' && isToday(f.start)).reduce((a, f) => a + f.minutes, 0)), fmt: (n) => `${Math.floor(n / 60) ? Math.floor(n / 60) + 'h ' : ''}${n % 60}m` },
  { id: 'habitsToday', label: 'Habits done today', get: (d) => Object.values(d.habits).filter((h) => !h.archived && h.kind === 'good' && livePage(d, h.pageId) && habitDoneOn(h, today())).length },
  { id: 'rows', label: 'Rows in a database', get: (d, c) => (c.dbId ? countRows(c.dbId, c.prop ? { id: 'w', prop: c.prop, op: c.option ? (d.pages[c.dbId]?.db?.props.find((p) => p.id === c.prop)?.type === 'multi' ? 'contains' : 'is') : 'checked', value: c.option } : null) : 0) }
]

function series(d: AppData, cfg: Record<string, any>): { label: string; value: number }[] {
  const days: number = cfg.days ?? 14
  const keys = Array.from({ length: days }, (_, i) => addDays(today(), i - days + 1))
  const label = (k: string, i: number): string => (days <= 7 ? DAYS_SHORT[parseDay(k).getDay()].slice(0, 2) : i % Math.ceil(days / 7) === 0 ? String(parseDay(k).getDate()) : '')
  let vals: number[]
  if (cfg.source === 'value' && d.values[cfg.valueId]) {
    const s = valueSeries(d.values[cfg.valueId], days, !!cfg.cumulative)
    vals = s.map((x) => x.value)
  } else if (cfg.source === 'focus') {
    vals = keys.map((k) => Math.round(d.focus.filter((f) => f.kind === 'focus' && dayKey(new Date(f.start)) === k).reduce((a, f) => a + f.minutes, 0)))
  } else if (cfg.source === 'habits') {
    const hs = Object.values(d.habits).filter((h) => !h.archived && h.kind === 'good' && livePage(d, h.pageId))
    vals = keys.map((k) => hs.filter((h) => habitDoneOn(h, k)).length)
  } else if (cfg.source === 'metric' && d.metrics[cfg.metricId]) {
    const m = d.metrics[cfg.metricId]
    vals = keys.map((k) => { const es = m.entries.filter((e) => e.date === k); return m.aggregate === 'sum' ? es.reduce((a, e) => a + e.value, 0) : es.length ? es[es.length - 1].value : 0 })
  } else {
    vals = keys.map((k) => Object.values(d.tasks).filter((t) => t.done && t.doneAt && dayKey(new Date(t.doneAt)) === k).length)
  }
  return keys.map((k, i) => ({ label: label(k, i), value: vals[i] ?? 0 }))
}

// ---------- widget bodies ----------
function ValueWidget({ cfg }: { cfg: Record<string, any> }): JSX.Element {
  const v = useData((d) => d.values[cfg.valueId])
  const weekStart = useData((d) => d.settings.weekStart)
  if (!v) return <Missing text="Choose a value in the widget settings." action={() => setOverlay('values')} actionLabel="Open values" />
  const n = valueNow(v, weekStart)
  const step = Number(cfg.step) || 1
  return (
    <div className="w-value">
      <div className="w-value-top">
        <span className="w-value-icon" style={{ background: v.color }}>{v.icon}</span>
        <span className="w-label ellipsis">{v.name}</span>
      </div>
      <div className="w-value-num glass-text">{formatValue(v, n, false)}<span className="w-unit">{v.unit}</span></div>
      {v.goal ? <Progress value={n / v.goal} color={v.color} height={4} /> : null}
      <div className="w-value-foot">
        {cfg.showChart !== false && <Sparkline values={valueSeries(v, 14, v.reset === 'never').map((x) => x.value)} width={110} height={30} color={v.color} />}
        <span className="spacer" />
        <button className="w-step" onClick={() => adjustValue(v.id, -step)}><Icon name="minus" size={13} /></button>
        <button className="w-step primary" onClick={() => adjustValue(v.id, step)}><Icon name="plus" size={13} /></button>
      </div>
    </div>
  )
}

function ChartWidget({ cfg }: { cfg: Record<string, any> }): JSX.Element {
  const d = useData((x) => x)
  const data = series(d, cfg)
  const color = cfg.source === 'value' ? d.values[cfg.valueId]?.color : cfg.source === 'metric' ? d.metrics[cfg.metricId]?.color : undefined
  const total = data.reduce((a, x) => a + x.value, 0)
  return (
    <div className="w-chart">
      <div className="w-chart-total glass-text">{cfg.source === 'value' && cfg.cumulative ? data[data.length - 1]?.value ?? 0 : Math.round(total * 100) / 100}</div>
      <div className="w-chart-body">
        {cfg.kind === 'line'
          ? <Sparkline values={data.map((x) => x.value)} width={600} height={140} color={color ?? 'var(--accent)'} />
          : <BarChart data={data} height={140} color={color ?? 'var(--accent)'} />}
      </div>
    </div>
  )
}

function ProgressWidget({ cfg }: { cfg: Record<string, any> }): JSX.Element {
  const d = useData((x) => x)
  let pct = 0
  let label = ''
  let sub = ''
  let color: string | undefined
  if (cfg.source === 'db' && cfg.dbId && d.pages[cfg.dbId]?.db) {
    const total = rowsOf(d, cfg.dbId).length
    const done = cfg.prop ? countRows(cfg.dbId, { id: 'w', prop: cfg.prop, op: cfg.option ? 'is' : 'checked', value: cfg.option }) : 0
    pct = total ? done / total : 0
    label = d.pages[cfg.dbId].title || 'Database'
    sub = `${done} of ${total}`
  } else if (d.values[cfg.valueId]) {
    const v = d.values[cfg.valueId]
    const n = valueNow(v, d.settings.weekStart)
    pct = v.goal ? n / v.goal : 0
    label = v.name
    sub = v.goal ? `${formatValue(v, n)} / ${formatValue(v, v.goal)}` : 'No goal set'
    color = v.color
  } else return <Missing text="Choose what to track in the widget settings." />
  return (
    <div className="w-progress">
      <Ring value={pct} size={86} stroke={8} color={color}><span className="strong glass-text">{Math.round(pct * 100)}%</span></Ring>
      <div className="w-label ellipsis">{label}</div>
      <div className="muted small ellipsis">{sub}</div>
    </div>
  )
}

function StatWidget({ cfg }: { cfg: Record<string, any> }): JSX.Element {
  const d = useData((x) => x)
  const s = STATS.find((x) => x.id === cfg.stat) ?? STATS[0]
  const n = s.get(d, cfg)
  return (
    <div className="w-stat">
      <div className="w-stat-num glass-text">{s.fmt ? s.fmt(n) : n.toLocaleString()}</div>
      <div className="w-label">{cfg.label || (s.id === 'rows' && d.pages[cfg.dbId] ? d.pages[cfg.dbId].title : s.label)}</div>
    </div>
  )
}

function TasksWidget({ cfg }: { cfg: Record<string, any> }): JSX.Element {
  const tasks = useData((d) => d.tasks)
  const pages = useData((d) => d.pages)
  const [, openTask, drawer] = useTaskDrawer()
  const t = today()
  const list = useMemo(() => {
    const all = Object.values(tasks).filter((x) => !x.archived && pages[x.pageId] && !pages[x.pageId].deletedAt && (!cfg.pageId || x.pageId === cfg.pageId))
    const f = cfg.filter ?? 'today'
    const pick = f === 'overdue' ? all.filter((x) => !x.done && x.due && x.due < t)
      : f === 'upcoming' ? all.filter((x) => !x.done && x.due && x.due > t && x.due <= addDays(t, 7))
      : f === 'all' ? all.filter((x) => !x.done)
      : all.filter((x) => (!x.done && x.due && x.due <= t) || (x.done && x.doneAt && dayKey(new Date(x.doneAt)) === t))
    return pick.sort((a, b) => Number(a.done) - Number(b.done) || (a.due ?? '9').localeCompare(b.due ?? '9') || b.priority - a.priority)
  }, [tasks, pages, cfg.filter, cfg.pageId, t])
  const listPage = cfg.pageId && pages[cfg.pageId] ? cfg.pageId : Object.values(pages).find((p) => !p.deletedAt && p.type === 'tasks')?.id
  return (
    <div className="w-tasks">
      {cfg.quickAdd !== false && listPage && <QuickAdd pageId={listPage} defaults={cfg.filter === 'today' || !cfg.filter ? { due: t } : {}} placeholder="Add a task" />}
      <div className="w-scroll">
        {list.length === 0 ? <div className="muted small pad">Nothing here.</div> : list.map((x) => <TaskRow key={x.id} task={x} onOpen={openTask} />)}
      </div>
      {drawer}
    </div>
  )
}

function HabitsWidget(): JSX.Element {
  const habits = useData((d) => d.habits)
  const pages = useData((d) => d.pages)
  const t = today()
  const list = Object.values(habits).filter((h) => !h.archived && pages[h.pageId] && !pages[h.pageId].deletedAt && habitDueToday(h, t))
  if (!list.length) return <Missing text="No habits for today." />
  return (
    <div className="w-scroll">
      {list.map((h) => {
        const v = h.log[t] ?? 0
        const done = h.kind === 'good' && v >= habitDayTarget(h)
        return (
          <div key={h.id} className="today-habit">
            <button className={`habit-cell ${done ? 'done' : ''} ${h.kind === 'bad' && v ? 'slip' : ''}`} style={{ ['--c' as any]: h.color }} onClick={() => logHabit(h.id, t, h.kind === 'good' && done ? -v : 1)}>
              {done ? <Icon name="check" size={14} stroke={3} /> : h.kind === 'bad' && v ? <Icon name="x" size={14} stroke={3} /> : v ? <span className="small">{v}</span> : null}
            </button>
            <span className="grow ellipsis">{h.icon} {h.name}</span>
          </div>
        )
      })}
    </div>
  )
}

function CalendarWidget(): JSX.Element {
  const weekStart = useData((d) => d.settings.weekStart)
  const tasks = useData((d) => d.tasks)
  const t = today()
  const ym = t.slice(0, 7)
  const start = weekStartOf(`${ym}-01`, weekStart)
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i))
  const due = new Set(Object.values(tasks).filter((x) => !x.done && x.due).map((x) => x.due))
  const [y, m] = ym.split('-').map(Number)
  return (
    <div className="w-cal">
      <div className="w-label">{MONTHS_LONG[m - 1]} {y}</div>
      <div className="w-cal-grid">
        {Array.from({ length: 7 }, (_, i) => <span key={i} className="w-cal-dow">{DAYS_SHORT[(i + weekStart) % 7][0]}</span>)}
        {days.map((k) => <span key={k} className={`w-cal-day ${k.slice(0, 7) !== ym ? 'other' : ''} ${k === t ? 'today' : ''} ${due.has(k) ? 'dot' : ''}`}>{parseDay(k).getDate()}</span>)}
      </div>
    </div>
  )
}

function ClockWidget({ cfg }: { cfg: Record<string, any> }): JSX.Element {
  const now = new Date(useTick(1000))
  const use24h = useData((d) => d.settings.use24h)
  const time = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: cfg.seconds ? '2-digit' : undefined, hour12: !use24h })
  return (
    <div className="w-clock">
      <div className="w-clock-time glass-text">{time}</div>
      <div className="w-label">{now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
    </div>
  )
}

function NoteWidget({ w, pageId }: { w: Widget; pageId: string }): JSX.Element {
  return (
    <textarea className="w-note" placeholder="Write something…" value={w.config.text ?? ''}
      onChange={(e) => { const v = e.target.value; act((d) => { const x = d.pages[pageId]?.widgets?.find((y) => y.id === w.id); if (x) x.config.text = v }, { key: 'wnote:' + w.id }) }} />
  )
}

function CountdownWidget({ cfg }: { cfg: Record<string, any> }): JSX.Element {
  useTick(60_000)
  if (!cfg.date) return <Missing text="Set a date in the widget settings." />
  const date = nextDate({ date: cfg.date, yearly: !!cfg.yearly })
  const n = diffDays(date, today())
  return (
    <div className="w-stat">
      <div className="w-stat-num glass-text">{n === 0 ? 'Today' : Math.abs(n)}</div>
      <div className="w-label ellipsis">{n === 0 ? cfg.title : `${n < 0 ? 'days since' : n === 1 ? 'day until' : 'days until'} ${cfg.title || friendlyDay(date)}`}</div>
    </div>
  )
}

function FocusWidget(): JSX.Element {
  const f = useFocus()
  return (
    <div className="w-focus">
      <div className="w-clock-time glass-text">{fmtClock(remainingSecs(f))}</div>
      <div className="row gap-sm">
        {f.running
          ? <button className="btn btn-default btn-sm" onClick={focusActions.pause}><Icon name="pause" size={14} /> Pause</button>
          : <button className="btn btn-primary btn-sm" onClick={focusActions.start}><Icon name="play" size={14} /> Start</button>}
        <span className="muted small">{f.mode === 'focus' ? 'Focus' : f.mode === 'stopwatch' ? 'Stopwatch' : 'Break'}</span>
      </div>
    </div>
  )
}

function QuickAddWidget({ cfg }: { cfg: Record<string, any> }): JSX.Element {
  const pages = useData((d) => d.pages)
  const id = cfg.pageId && pages[cfg.pageId] && !pages[cfg.pageId].deletedAt ? cfg.pageId : Object.values(pages).find((p) => !p.deletedAt && p.type === 'tasks')?.id
  if (!id) return <Missing text="Add a To-do list page first." />
  return <QuickAdd pageId={id} placeholder={`Add to ${pages[id].title || 'list'}`} />
}

function GoalsWidget(): JSX.Element {
  const goals = useData((d) => d.goals)
  const tasks = useData((d) => d.tasks)
  const pages = useData((d) => d.pages)
  const list = Object.values(goals).filter((g) => !g.done && pages[g.pageId] && !pages[g.pageId].deletedAt)
  if (!list.length) return <Missing text="No active goals." />
  return (
    <div className="w-scroll">
      {list.map((g) => (
        <button key={g.id} className="today-goal" onClick={() => openPage(g.pageId)}>
          <span>{g.icon}</span><span className="grow ellipsis">{g.title}</span>
          <Progress value={goalProgress(g, tasks)} color={g.color} className="w-80" />
        </button>
      ))}
    </div>
  )
}

function PageWidget({ cfg }: { cfg: Record<string, any> }): JSX.Element {
  const p: Page | undefined = useData((d) => d.pages[cfg.pageId])
  if (!p || p.deletedAt) return <Missing text="Choose a page in the widget settings." />
  return (
    <button className="w-page" onClick={() => openPage(p.id)}>
      <span className="w-page-icon">{p.icon || '📄'}</span>
      <span className="ellipsis strong">{p.title || 'Untitled'}</span>
      <Icon name="right" size={14} />
    </button>
  )
}

function Missing({ text, action, actionLabel }: { text: string; action?: () => void; actionLabel?: string }): JSX.Element {
  return <div className="w-missing"><span>{text}</span>{action && <button className="link small" onClick={action}>{actionLabel}</button>}</div>
}

export function WidgetBody({ w, pageId }: { w: Widget; pageId: string }): JSX.Element {
  const c = w.config
  switch (w.type) {
    case 'value': return <ValueWidget cfg={c} />
    case 'chart': return <ChartWidget cfg={c} />
    case 'progress': return <ProgressWidget cfg={c} />
    case 'stat': return <StatWidget cfg={c} />
    case 'tasks': return <TasksWidget cfg={c} />
    case 'habits': return <HabitsWidget />
    case 'database': return c.dbId ? <div className="w-scroll"><DatabaseView dbId={c.dbId} viewId={c.viewId || undefined} embedded /></div> : <Missing text="Choose a database in the widget settings." />
    case 'calendar': return <CalendarWidget />
    case 'clock': return <ClockWidget cfg={c} />
    case 'note': return <NoteWidget w={w} pageId={pageId} />
    case 'countdown': return <CountdownWidget cfg={c} />
    case 'focus': return <FocusWidget />
    case 'quickadd': return <QuickAddWidget cfg={c} />
    case 'goals': return <GoalsWidget />
    case 'page': return <PageWidget cfg={c} />
    default: return <Missing text="Unknown widget" />
  }
}

/** Title shown in the widget header (empty = no header). */
export function widgetTitle(w: Widget, d: AppData): string {
  if (w.title !== undefined && w.title !== null) return w.title
  switch (w.type) {
    case 'value': case 'progress': case 'stat': case 'clock': case 'countdown': case 'quickadd': case 'page': case 'focus': return ''
    case 'chart': return w.config.source === 'value' ? d.values[w.config.valueId]?.name ?? 'Chart' : w.config.source === 'focus' ? 'Focus minutes' : w.config.source === 'habits' ? 'Habits done' : w.config.source === 'metric' ? d.metrics[w.config.metricId]?.name ?? 'Tracker' : 'Tasks done'
    case 'tasks': return { today: 'Today', overdue: 'Overdue', upcoming: 'Next 7 days', all: 'Open tasks' }[w.config.filter as string] ?? 'Tasks'
    case 'database': return d.pages[w.config.dbId]?.title || 'Database'
    default: return widgetDef(w.type).name
  }
}
