import { CustomButton, TrackerWidget, WishlistWidget } from './PersonalWidgets'
import { filterTasks, groupTasks, sortTasks } from '../pages/TasksPage'
import { defaultAction, runButtonAction } from './ButtonActions'
import { uid } from '../lib/util'
import { WidgetScope, scopedData, useWidgetData } from '../lib/widgetScope'
import { aggregateWidgets, NamedToolWidget } from './NamedSources'
import { ensureTaskPlanner } from '../lib/widgetSources'
import { blockTextColor } from '../lib/look'
import { SERVICES, isService, serviceIds } from '../../../shared/services'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { getData, openPage, setOverlay, updatePage, useData } from '../store'
import type { AppData, Block, Page, Task, Widget, WidgetType } from '../types'
import { formatValue, valueNow, valueSeries } from '../lib/values'
import { habitDayTarget, habitDoneOn, habitDueToday } from '../lib/habits'
import { DAYS_SHORT, addDays, dayKey, diffDays, friendlyDay, longDate, parseDay, today, weekStartOf } from '../lib/util'
import { countRows, datedRows, rowsOf, setRowDone, type DatedRow } from '../lib/db'
import { BarChart, Checkbox, Progress, Ring, Sparkline, useDoc } from './ui'
import { cycleSpace, switchSpace } from '../lib/desktop'
import { Glyph, Icon } from './Icon'
import { TaskRepeatEditor } from './TaskRepeatEditor'
import { QuickAdd, TaskRow, useTaskDrawer } from './TaskItems'
import { adjustValue } from './Values'
import { logHabit } from '../pages/HabitsPage'
import { DaylightWidget, MonthWidget, RingClock, SectionsWidget, SystemWidget, TableWidget, TimerWidget, WeatherWidget } from './PanelKit'
import { BatteryWidget, ClockStyles, DaylightStyles, LauncherWidget, MoonWidget, QuoteWidget, SearchWidget, StopwatchWidget, SystemStyles, TimeLeftWidget, WeatherStyles, WorldClockWidget, zoned } from './PanelKit2'
import { focusActions, fmtClock, remainingSecs, useFocus } from '../pages/FocusPage'
import { goalProgress } from '../pages/GoalsPage'
import { nextDate } from './Countdowns'
import { DatabaseView } from '../pages/DatabasePage'
import { DashboardGrid } from '../pages/DashboardPage'
import { pickImageData } from '../lib/image'
import { api } from '../lib/api'
import { Marks, findBlock } from './Blocks'
import { plainText } from '../lib/links'
import { CalculatorWidget, NetworkWidget, RecentWidget } from './PanelKit3'
import { ActivityWidget, DbChartWidget, DeadlinesWidget } from './PanelKit4'
import { ListPanel, EventsWidget, FeedWidget, GitHubWidget, MailWidget, MediaWidget, TodoistWidget } from './PanelKit5'
import { eventsByDay, useCalendarEvents } from '../lib/connections'

/** Partial widget used by both dashboards and desktop widgets. */
export type AnyWidget = Pick<Widget, 'id' | 'type' | 'config' | 'title'>
export type SetConfig = (key: string, value: any) => void

export const WIDGETS: { type: WidgetType; name: string; icon: string; desc: string; w: number; h: number; config?: Record<string, any>; group: 'Work' | 'Plan' | 'Track' | 'More' | 'Connections' }[] = [
  { type: 'list', name:'List tracker', icon:'list-checks', desc:'Track a named list and its quantities', w:4,h:4,group:'Track' },
  {type:'reading',name:'Reading list',icon:'book-open',desc:'Books and reading progress',w:4,h:4,group:'Plan'},
  {type:'workout',name:'Workout log',icon:'activity',desc:'Exercise sessions and sets',w:4,h:4,group:'Plan'},
  { type: 'study', name:'Study deck', icon:'graduation-cap', desc:'Review flashcards from one subject', w:4,h:4,group:'Plan' },
  { type: 'tracker', name: 'Tracker', icon: 'activity', desc: 'Log water, calories or another daily measurement', w: 3, h: 3, group: 'Track' },
  { type: 'wishlist', name: 'Wishlist', icon: 'shopping-bag', desc: 'Plan purchases and check off what you bought', w: 4, h: 4, group: 'Plan' },
  { type: 'button', name: 'Custom button', icon: 'mouse-pointer-click', desc: 'Run an action on a page, task or value', w: 3, h: 1, group: 'Work' },
  { type: 'tasks', name: 'Tasks', icon: 'square-check-big', desc: 'What is due today, overdue or next, with quick add', w: 4, h: 4, group: 'Work', config: { filter: 'today', quickAdd: true } },
  { type: 'checklist', name: 'Checklist', icon: 'list-todo', desc: 'Check off the to-dos of any page or section, Notion included', w: 3, h: 4, group: 'Work', config: { hideChecked: true, subpages: false } },
  { type: 'pageview', name: 'Page', icon: 'file-text', desc: 'Keep a page open on screen and work in it', w: 4, h: 5, group: 'Work', config: { hideChecked: false } },
  { type: 'note', name: 'Scratchpad', icon: 'notebook-pen', desc: 'Jot things down; saved as you type', w: 3, h: 3, group: 'Work', config: { text: '' } },
  { type: 'quickadd', name: 'Quick add', icon: 'plus', desc: 'Capture a task without opening the app', w: 4, h: 1, group: 'Work', config: {} },
  { type: 'focus', name: 'Focus timer', icon: 'timer', desc: 'Start a focus session from the desktop', w: 3, h: 2, group: 'Work', config: {} },
  { type: 'database', name: 'Database', icon: 'database', desc: 'A table, board or gallery you can edit', w: 6, h: 5, group: 'Work', config: {} },
  { type: 'timer', name: 'Timer', icon: 'timer', desc: 'Click to start; put a few side by side', w: 2, h: 2, group: 'Work', config: { minutes: 5 } },
  { type: 'stopwatch', name: 'Stopwatch', icon: 'stopwatch', desc: 'Start, pause, laps', w: 3, h: 3, group: 'Work', config: {} },
  {type:'workspaces', name:'Workspace switcher', icon:'layout', desc:'Switch desktop workspaces', w:3,h:2,group:'Work',config:{pinnedEverywhere:true,look:'cycle'}},
  { type: 'launcher', name: 'Launcher', icon: 'rocket', desc: 'Open websites, apps, files and folders with one click', w: 4, h: 2, group: 'Work', config: { items: [], look: 'grid' } },
  { type: 'search', name: 'Web search', icon: 'search', desc: 'Search the web from the desktop', w: 4, h: 1, group: 'Work', config: { engine: 'google' } },
  { type: 'agenda', name: 'Agenda', icon: 'calendar-days', desc: 'The next days with tasks and times', w: 3, h: 4, group: 'Plan', config: { days: 5 } },
  { type: 'week', name: 'Week', icon: 'columns-3', desc: 'Seven days: what is due and what got done', w: 6, h: 2, group: 'Plan', config: {} },
  { type: 'calendar', name: 'Month', icon: 'calendar', desc: "This month, with what's due today beside it", w: 5, h: 3, group: 'Plan', config: { list: true } },
  { type: 'goals', name: 'Goals', icon: 'target', desc: 'Active goals and how far along they are', w: 3, h: 3, group: 'Plan', config: {} },
  { type: 'habits', name: 'Habits', icon: 'repeat', desc: "Today's habits to check off", w: 3, h: 3, group: 'Plan', config: {} },
  { type: 'countdown', name: 'Deadline', icon: 'hourglass', desc: 'Days left until a date', w: 2, h: 2, group: 'Plan', config: { title: '', date: '' } },
  { type: 'timeleft', name: 'Time left', icon: 'gauge', desc: 'How much of the day, week, month and year is gone', w: 3, h: 3, group: 'Plan', config: { look: 'bars' } },
  { type: 'stat', name: 'Number', icon: 'hash', desc: 'Tasks done, overdue, focus time, rows…', w: 2, h: 2, group: 'Track', config: { stat: 'tasksToday' } },
  { type: 'chart', name: 'Chart', icon: 'chart-column', desc: 'Tasks, focus, habits or a value over time', w: 4, h: 3, group: 'Track', config: { source: 'tasks', days: 14, kind: 'bar' } },
  { type: 'progress', name: 'Progress', icon: 'gauge', desc: 'A value toward its goal, or database rows done', w: 2, h: 2, group: 'Track', config: { source: 'value' } },
  { type: 'value', name: 'Counter', icon: 'gem', desc: 'One of your values with + and −', w: 3, h: 2, group: 'Track', config: { showChart: true, step: 1 } },
  { type: 'sections', name: 'Progress by section', icon: 'listChecks', desc: 'How far along each toggle or heading is, like subjects to revise', w: 3, h: 4, group: 'Track', config: { next: 3 } },
  { type: 'table', name: 'Table', icon: 'table', desc: 'A table from a page, with a total and the next due dates', w: 4, h: 3, group: 'Track', config: { table: 0 } },
  { type: 'system', name: 'System', icon: 'cpu', desc: 'CPU, memory and disk as rings, bars, numbers or a graph', w: 2, h: 3, group: 'Track', config: {} },
  { type: 'dbchart', name: 'Database chart', icon: 'chart-pie', desc: 'Rows of a database as a donut, bars or a line, split by any property', w: 3, h: 3, group: 'Track', config: { kind: 'donut', fn: 'count' } },
  { type: 'activity', name: 'Activity', icon: 'grid', desc: 'Every day you got things done as a heatmap, with your streak', w: 4, h: 2, group: 'Track', config: { source: 'all', weeks: 20 } },
  { type: 'events', name: 'Events', icon: 'calendarSync', desc: 'What is next on your Google, Outlook or Apple calendars', w: 3, h: 4, group: 'Plan', config: { days: 14, count: 8 } },
  { type: 'feed', name: 'News feed', icon: 'rss', desc: 'The latest posts from a blog, news site or channel', w: 3, h: 4, group: 'More', config: { count: 6, summary: true } },
  { type: 'mail', name: 'Inbox', icon: 'mail', desc: 'Unread mail and the latest messages from your inbox', w: 3, h: 4, group: 'Work', config: { count: 6 } },
  { type: 'todoist', name: 'Todoist', icon: 'checkSquare', desc: 'Todoist tasks due today, checked off from the desktop', w: 3, h: 4, group: 'Work', config: { show: 'today', count: 8 } },
  { type: 'media', name: 'Now playing', icon: 'music', desc: 'What Spotify, your browser or any player is playing, with controls', w: 4, h: 2, group: 'More', config: { look: 'card' } },
  { type: 'github', name: 'GitHub', icon: 'pr', desc: 'Open issues and pull requests', w: 4, h: 4, group: 'Work', config: { show: 'all', count: 8 } },
  { type: 'deadlines', name: 'Coming up', icon: 'hourglass', desc: 'Deadlines, due tasks and dated rows with the days left', w: 3, h: 3, group: 'Plan', config: { days: 60, count: 6 } },
  { type: 'network', name: 'Network', icon: 'wifi', desc: 'Download and upload speed with a live graph', w: 3, h: 2, group: 'Track', config: { graph: true } },
  { type: 'battery', name: 'Battery', icon: 'battery', desc: 'Charge left and time remaining', w: 2, h: 2, group: 'Track', config: { look: 'ring' } },
  { type: 'dashboard', name: 'Dashboard', icon: 'layout-dashboard', desc: 'A whole dashboard page in one panel', w: 8, h: 6, group: 'More', config: {} },
  { type: 'page', name: 'Shortcut', icon: 'link', desc: 'Opens one of your pages', w: 2, h: 1, group: 'More', config: {} },
  { type: 'clock', name: 'Clock', icon: 'clock', desc: 'Ring, analog, digital, flip, bars, words or a sun dial; any time zone', w: 3, h: 2, group: 'More', config: { seconds: false, style: 'ring' } },
  { type: 'worldclock', name: 'World clock', icon: 'globe', desc: 'The time in several cities', w: 3, h: 3, group: 'More', config: { style: 'list' } },
  { type: 'moon', name: 'Moon', icon: 'moonStar', desc: "Tonight's moon phase and the next full moon", w: 3, h: 2, group: 'More', config: {} },
  { type: 'quote', name: 'Words', icon: 'quote', desc: 'A line to keep in mind, from your own list or built in', w: 4, h: 2, group: 'More', config: { every: 'day', look: 'plain' } },
  { type: 'weather', name: 'Weather', icon: 'cloudSun', desc: 'Now and the next days where you are', w: 5, h: 3, group: 'More', config: { days: 4 } },
  { type: 'daylight', name: 'Daylight', icon: 'sunrise', desc: "The sun's path today, with sunrise and sunset", w: 3, h: 2, group: 'More', config: {} },
  { type: 'calculator', name: 'Calculator', icon: 'calculator', desc: 'Sums as you type, with keys and your last answers', w: 3, h: 4, group: 'More', config: { keys: true } },
  { type: 'recent', name: 'Recent pages', icon: 'history', desc: 'Favorites and the pages you opened last', w: 3, h: 3, group: 'Work', config: { count: 8, favorites: true } },
  { type: 'text', name: 'Heading', icon: 'type', desc: 'A title, rule or reminder in big type', w: 4, h: 2, group: 'More', config: { text: '', size: 28, weight: 650 } },
  { type: 'image', name: 'Picture', icon: 'image', desc: 'A reference image or photo', w: 3, h: 3, group: 'More', config: { src: null, fit: 'cover' } },
  ...serviceIds.map(type => ({ type, name: SERVICES[type].name, icon: SERVICES[type].icon, desc: SERVICES[type].desc,
    w: 4, h: 4, group: 'Connections' as const, config: { count: 8, summary: true } }))

]
export const widgetDef = (t: WidgetType): (typeof WIDGETS)[number] => WIDGETS.find((w) => w.type === t) ?? WIDGETS[0]

/** True when rendered inside a desktop widget window. */
const useInDesk = (): boolean => useDoc() !== document

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
  if (!v) return <Missing text="Choose a value in the panel settings." action={() => setOverlay('values')} actionLabel="Open values" />
  const n = valueNow(v, weekStart)
  const step = Number(cfg.step) || 1
  return (
    <div className="w-value">
      <div className="w-value-top">
        <span className="w-value-icon" style={{ background: v.color }}><Glyph value={v.icon} fallback="gem" size={13} /></span>
        <span className="w-label ellipsis">{v.name}</span>
      </div>
      <div className="w-value-num glass-text">{formatValue(v, n, false)}<span className="w-unit">{v.unit}</span></div>
      {v.goal ? <Progress value={n / v.goal} color={v.color} height={4} /> : null}
      <div className="w-value-foot">
        {cfg.showChart !== false && <Sparkline values={valueSeries(v, 14, v.reset === 'never').map((x) => x.value)} width={110} height={30} color={v.color} />}
        <span className="spacer" />
        <button data-widget-action={'Subtract ' + step} className="w-step" onClick={() => adjustValue(v.id, -step)}><Icon name="minus" size={13} /></button>
        <button data-widget-action={'Add ' + step} className="w-step primary" onClick={() => adjustValue(v.id, step)}><Icon name="plus" size={13} /></button>
      </div>
    </div>
  )
}

function ChartWidget({ cfg }: { cfg: Record<string, any> }): JSX.Element {
  const d = useWidgetData((x) => x)
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
  } else return <Missing text="Choose what to track in the panel settings." />
  return (
    <div className="w-progress">
      <Ring value={pct} size={86} stroke={8} color={color}><span className="strong glass-text">{Math.round(pct * 100)}%</span></Ring>
      <div className="w-label ellipsis">{label}</div>
      <div className="muted small ellipsis">{sub}</div>
    </div>
  )
}

function StatWidget({ cfg }: { cfg: Record<string, any> }): JSX.Element {
  const d = useWidgetData((x) => x)
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
  const listId = cfg.pageId && pages[cfg.pageId] && !pages[cfg.pageId].deletedAt ? cfg.pageId : undefined
  const inDesk = useInDesk()
  const [, setOpen, drawerEl] = useTaskDrawer()
  const showCompleted = useData(d => d.settings.showCompleted)
  const saved = pages[listId]?.view?.taskViews?.find((v: { id: string }) => v.id === cfg.taskViewId)?.options
  const openTask = (id: string): void => { if (inDesk) { const t = tasks[id]; if (t) openPage(t.pageId) } else setOpen(id) }
  const drawer = inDesk ? null : drawerEl
  const [repeatId, setRepeatId] = useState<string | null>(null)
  const t = today()
  const list = useMemo(() => {
    const all = Object.values(tasks).filter((x) => !x.archived && pages[x.pageId] && !pages[x.pageId].deletedAt && (!listId || x.pageId === listId))
    if (saved) {
      const items = filterTasks(all, saved.filter ?? 'all', saved.query ?? '', saved.tag ?? null)
      return sortTasks(items.filter(t => t.done ? saved.filter === 'done' || !(saved.hideDone ?? !showCompleted) : true), saved.sort ?? 'manual')
    }
    const f = cfg.filter ?? 'today'
    const pick = f === 'overdue' ? all.filter((x) => !x.done && x.due && x.due < t)
      : f === 'upcoming' ? all.filter((x) => !x.done && x.due && x.due > t && x.due <= addDays(t, 7))
      : f === 'all' ? all.filter((x) => !x.done)
      : all.filter((x) => (!x.done && x.due && x.due <= t) || (x.done && x.doneAt && dayKey(new Date(x.doneAt)) === t))
    return pick.sort((a, b) => Number(a.done) - Number(b.done) || (a.due ?? '9').localeCompare(b.due ?? '9') || b.priority - a.priority)
  }, [tasks, pages, cfg.filter, listId, saved, showCompleted, t])
  // Rows of databases with a date and a checkbox or status count as tasks too.
  const rows = useMemo(() => {
    if (listId) return []
    const f = cfg.filter ?? 'today'
    return datedRows(pages).filter((r) => r.doable && (f === 'overdue' ? !r.done && r.due < t
      : f === 'upcoming' ? !r.done && r.due > t && r.due <= addDays(t, 7)
      : f === 'all' ? !r.done
      : r.due === t || (!r.done && r.due < t))).sort((a, b) => Number(a.done) - Number(b.done) || a.due.localeCompare(b.due))
  }, [pages, cfg.filter, listId, t])
  const listPage = listId || Object.values(pages).find((p) => !p.deletedAt && p.type === 'tasks')?.id
  return (
    <div className="w-tasks" data-hide-fields={(saved?.hiddenFields ?? []).join(' ')}>
      {cfg.quickAdd !== false && <QuickAdd schedulePicker submitButton pageId={listPage ?? ''} resolvePage={() => ensureTaskPlanner(listPage)} defaults={cfg.filter === 'today' || !cfg.filter ? { due: t } : {}} placeholder="Add a task" />}
      <div className="w-scroll">
         {groupTasks(list, saved?.group ?? 'none').map(group => <div key={group.key}>{group.label && <div className="section-label">{group.label}</div>}{group.items.map((x) => <div key={x.id}><TaskRow task={x} onOpen={openTask} onRepeat={setRepeatId} />
          {repeatId === x.id && <div className="panel-repeat"><TaskRepeatEditor task={x} /><button className="btn btn-sm" onClick={() => setRepeatId(null)}>Done</button></div>}</div>)}</div>)}
        {rows.map((r) => <RowTask key={r.id} r={r} />)}
      </div>
      {drawer}
    </div>
  )
}

function HabitsWidget({id}:{id?:string}): JSX.Element {
  const habits = useData((d) => d.habits)
  const pages = useData((d) => d.pages)
  const t = today()
  const list = Object.values(habits).filter((h) => (!id || h.pageId===id) && !h.archived && pages[h.pageId] && !pages[h.pageId].deletedAt && habitDueToday(h, t))
  if (!list.length) return <Missing text="No habits for today." />
  return (
    <div className="w-scroll">
      {list.map((h) => {
        const v = h.log[t] ?? 0
        const done = h.kind === 'good' && v >= habitDayTarget(h)
        return (
          <div key={h.id} data-widget-item={h.name} className="today-habit">
            <button data-item-action={done ? 'Undo today\'s log' : 'Log habit'} className={`habit-cell ${done ? 'done' : ''} ${h.kind === 'bad' && v ? 'slip' : ''}`} style={{ ['--c' as any]: h.color }} onClick={() => logHabit(h.id, t, h.kind === 'good' && done ? -v : 1)}>
              {done ? <Icon name="check" size={14} stroke={3} /> : h.kind === 'bad' && v ? <Icon name="x" size={14} stroke={3} /> : v ? <span className="small">{v}</span> : null}
            </button>
            <Glyph value={h.icon} fallback="circle-check" size={14} color={h.color} />
            <span className="grow ellipsis">{h.name}</span>
          </div>
        )
      })}
    </div>
  )
}


function AnalogClock({ now, seconds }: { now: Date; seconds: boolean }): JSX.Element {
  const s = now.getSeconds()
  const m = now.getMinutes() + s / 60
  const h = (now.getHours() % 12) + m / 60
  const hand = (deg: number, len: number, w: number, cls: string): JSX.Element => (
    <line className={cls} x1="50" y1="50" x2={50 + len * Math.sin((deg * Math.PI) / 180)} y2={50 - len * Math.cos((deg * Math.PI) / 180)} strokeWidth={w} strokeLinecap="round" />
  )
  return (
    <svg className="w-analog" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="47" className="face" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * 30 * Math.PI) / 180
        return <line key={i} className="tick" x1={50 + 40 * Math.sin(a)} y1={50 - 40 * Math.cos(a)} x2={50 + 44 * Math.sin(a)} y2={50 - 44 * Math.cos(a)} strokeWidth={i % 3 ? 1.2 : 2.4} strokeLinecap="round" />
      })}
      {hand(h * 30, 24, 4, 'hand')}
      {hand(m * 6, 34, 3, 'hand')}
      {seconds && hand(s * 6, 38, 1.4, 'hand sec')}
      <circle cx="50" cy="50" r="2.6" className="pin" />
    </svg>
  )
}

function ClockWidget({ cfg }: { cfg: Record<string, any> }): JSX.Element {
  const now = zoned(new Date(useTick(1000)), cfg.tz || undefined)
  const use24h = useData((d) => d.settings.use24h)
  const time = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: cfg.seconds ? '2-digit' : undefined, hour12: !use24h })
  if (cfg.style === 'analog') return <div className="w-clock analog"><AnalogClock now={now} seconds={!!cfg.seconds} /></div>
  if (cfg.style === 'big') {
    const [hh, mm] = [now.getHours(), now.getMinutes()]
    const h12 = use24h ? hh : hh % 12 || 12
    return (
      <div className="w-clock big">
        <div className="w-clock-stack glass-text"><span>{String(h12).padStart(2, '0')}</span><span>{String(mm).padStart(2, '0')}</span></div>
        <div className="w-label">{now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}</div>
      </div>
    )
  }
  return (
    <div className="w-clock">
      <div className="w-clock-time glass-text">{time}</div>
      <div className="w-label">{now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
    </div>
  )
}

function NoteWidget({ w, setConfig }: { w: AnyWidget; setConfig: SetConfig }): JSX.Element {
  return <textarea data-widget-action="Write a note" className="w-note" placeholder="Write something…" value={w.config.text ?? ''} onChange={(e) => setConfig('text', e.target.value)} />
}

function CountdownWidget({ cfg }: { cfg: Record<string, any> }): JSX.Element {
  const look: string = cfg.look ?? 'number'
  useTick(look === 'clock' ? 1000 : 60_000)
  if (!cfg.date) return <Missing text="Set a date in the panel settings." />
  const date = nextDate({ date: cfg.date, yearly: !!cfg.yearly })
  const n = diffDays(date, today())
  const target = new Date(`${date}T${/^\d\d:\d\d$/.test(cfg.time ?? '') ? cfg.time : '00:00'}`).getTime()
  const title = cfg.title || friendlyDay(date)
  if (look === 'clock') {
    const left = Math.max(0, target - Date.now())
    const parts: [number, string][] = [[Math.floor(left / 86400000), 'days'], [Math.floor(left / 3600000) % 24, 'hours'], [Math.floor(left / 60000) % 60, 'min'], [Math.floor(left / 1000) % 60, 'sec']]
    return (
      <div className="w-cd look-clock">
        <div className="w-cd-boxes">{parts.map(([v, l]) => <span key={l} className="w-cd-box"><b className="glass-text">{String(v).padStart(2, '0')}</b><em>{l}</em></span>)}</div>
        <div className="w-label ellipsis">{left ? title : `${title} is here`}</div>
      </div>
    )
  }
  if (look === 'ring' || look === 'bar') {
    const from = /^\d{4}-\d{2}-\d{2}$/.test(cfg.from ?? '') ? cfg.from : addDays(date, -Math.max(30, Number(cfg.span) || 30))
    const total = Math.max(1, diffDays(date, from))
    const done = Math.min(1, Math.max(0, diffDays(today(), from) / total))
    if (look === 'ring') return (
      <div className="w-cd look-ring">
        <Ring value={done * 100} size={92} stroke={7}><span className="w-cd-ring-n glass-text">{n === 0 ? '!' : Math.abs(n)}</span><span className="w-cd-ring-l">{n === 0 ? 'today' : n === 1 ? 'day' : 'days'}</span></Ring>
        <div className="w-label ellipsis">{title}</div>
      </div>
    )
    return (
      <div className="w-cd look-bar">
        <div className="row between"><span className="strong ellipsis">{title}</span><span className="muted small nowrap">{n === 0 ? 'Today' : n < 0 ? `${-n} days ago` : `${n} day${n === 1 ? '' : 's'} left`}</span></div>
        <Progress value={done * 100} height={8} />
        <div className="muted small">{longDate(date)}</div>
      </div>
    )
  }
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
          ? <button className="btn btn-default btn-sm" data-widget-action="Pause focus session" onClick={focusActions.pause}><Icon name="pause" size={14} /> Pause</button>
          : <button className="btn btn-primary btn-sm" data-widget-action="Start focus session" onClick={focusActions.start}><Icon name="play" size={14} /> Start</button>}
        <span className="muted small">{f.mode === 'focus' ? 'Focus' : f.mode === 'stopwatch' ? 'Stopwatch' : 'Break'}</span>
      </div>
    </div>
  )
}

function QuickAddWidget({ cfg }: { cfg: Record<string, any> }): JSX.Element {
  const pages = useData((d) => d.pages)
  const id = cfg.pageId && pages[cfg.pageId] && !pages[cfg.pageId].deletedAt ? cfg.pageId : Object.values(pages).find((p) => !p.deletedAt && p.type === 'tasks')?.id
  return <QuickAdd schedulePicker submitButton pageId={id ?? ''} resolvePage={() => ensureTaskPlanner(id)} placeholder={id ? 'Add to ' + (pages[id].title || 'list') : 'Add a task'} />

}

function GoalsWidget({id}:{id?:string}): JSX.Element {
  const goals = useData((d) => d.goals)
  const tasks = useData((d) => d.tasks)
  const pages = useData((d) => d.pages)
  const list = Object.values(goals).filter((g) => (!id || g.pageId===id) && !g.done && pages[g.pageId] && !pages[g.pageId].deletedAt)
  if (!list.length) return <Missing text="No active goals." />
  return (
    <div className="w-scroll">
      {list.map((g) => (
        <button key={g.id} className="today-goal" onClick={() => openPage(g.pageId)}>
          <Glyph value={g.icon} fallback="target" size={15} color={g.color} /><span className="grow ellipsis">{g.title}</span>
          <Progress value={goalProgress(g, tasks)} color={g.color} className="w-80" />
        </button>
      ))}
    </div>
  )
}

function PageWidget({ cfg }: { cfg: Record<string, any> }): JSX.Element {
  const p: Page | undefined = useData((d) => d.pages[cfg.pageId])
  if (!p || p.deletedAt) return <Missing text="Choose a page in the panel settings." />
  return (
    <button className="w-page" onClick={() => openPage(p.id)}>
      <span className="w-page-icon"><Glyph value={p.icon} fallback="file-text" size={20} /></span>
      <span className="ellipsis strong">{p.title || 'Untitled'}</span>
      <Icon name="right" size={14} />
    </button>
  )
}

function Missing({ text, action, actionLabel }: { text: string; action?: () => void; actionLabel?: string }): JSX.Element {
  return <div className="w-missing"><span>{text}</span>{action && <button className="link small" onClick={action}>{actionLabel}</button>}</div>
}

type WidgetBodyProps = { w: AnyWidget; setConfig: SetConfig }

const RenderingWidgets = createContext<string[]>([])

export function WidgetBody(props: WidgetBodyProps): JSX.Element {
  const ancestors = useContext(RenderingWidgets)
  const data=useData(d=>d)
  const id=props.w.config.sourcePageId
  const scope=useMemo(()=>(id||props.w.config.extraSources?.length) && aggregateWidgets.has(props.w.type) ? scopedData(data,[id,...(props.w.config.extraSources??[])].filter(Boolean)) : null,[id,data,props.w.type,props.w.config.extraSources])
  if (ancestors.includes(props.w.id)) return <div className="small muted">This widget is already displayed above.</div>
  const button = props.w.config.footerButton
  return <RenderingWidgets.Provider value={[...ancestors,props.w.id]}><WidgetScope.Provider value={scope}><WidgetContent {...props} /></WidgetScope.Provider>{button && props.w.type !== 'button' && <div className="widget-action"><CustomButton config={button} /></div>}</RenderingWidgets.Provider>
}

function WidgetContent({ w, setConfig }: WidgetBodyProps): JSX.Element {
  const c = w.config
  if (isService(w.type)) return <ListPanel cfg={c} kind={w.type} />
  switch (w.type) {
    case 'button': return <CustomButton config={c} />
    case 'tracker': return <TrackerWidget key={c.metricId} metricId={c.metricId} step={c.step} />
    case 'reading': case 'workout': case 'list': case 'study': return <NamedToolWidget type={w.type} id={c.pageId} setId={id=>setConfig('pageId',id)} />
    case 'wishlist': return <WishlistWidget pageId={c.pageId} setPage={id => setConfig('pageId', id)} />
    case 'value': return <ValueWidget cfg={c} />
    case 'chart': return <ChartWidget cfg={c} />
    case 'progress': return <ProgressWidget cfg={c} />
    case 'stat': return <StatWidget cfg={c} />
    case 'tasks': return <TasksWidget cfg={c} />
    case 'habits': return <HabitsWidget id={c.pageId} />
    case 'database': return c.dbId ? <div className="w-scroll"><DatabaseView dbId={c.dbId} viewId={c.viewId || undefined} embedded /></div> : <Missing text="Choose a database in the panel settings." />
    case 'calendar': return <MonthWidget cfg={c} />
    case 'clock': return c.style === 'ring' ? <RingClock cfg={c} /> : !c.style || c.style === 'digital' || c.style === 'big' ? <ClockWidget cfg={c} /> : <ClockStyles cfg={c} />
    case 'weather': return !c.style || c.style === 'standard' ? <WeatherWidget cfg={c} /> : <WeatherStyles cfg={c} />
    case 'daylight': return !c.style || c.style === 'curve' ? <DaylightWidget cfg={c} /> : <DaylightStyles cfg={c} />
    case 'system': return c.look === 'numbers' || c.look === 'graph' ? <SystemStyles cfg={c} /> : <SystemWidget cfg={c} />
    case 'worldclock': return <WorldClockWidget cfg={c} />
    case 'stopwatch': return <StopwatchWidget cfg={c} setConfig={setConfig} />
    case 'timeleft': return <TimeLeftWidget cfg={c} />
    case 'moon': return <MoonWidget cfg={c} />
    case 'workspaces': return <WorkspaceSwitcher look={c.look}/>
    case 'launcher': return <LauncherWidget cfg={c} id={w.id} />
    case 'search': return <SearchWidget cfg={c} />
    case 'quote': return <QuoteWidget cfg={c} setConfig={setConfig} />
    case 'battery': return <BatteryWidget cfg={c} />
    case 'network': return <NetworkWidget cfg={c} />
    case 'dbchart': return <DbChartWidget cfg={c} />
    case 'activity': return <ActivityWidget cfg={c} />
    case 'deadlines': return <DeadlinesWidget cfg={c} />
    case 'events': return <EventsWidget cfg={c} />
    case 'feed': return <FeedWidget cfg={c} />
    case 'github': return <GitHubWidget cfg={c} />
    case 'mail': return <MailWidget cfg={c} />
    case 'todoist': return <TodoistWidget cfg={c} />
    case 'media': return <MediaWidget cfg={c} />
    case 'calculator': return <CalculatorWidget cfg={c} setConfig={setConfig} />
    case 'recent': return <RecentWidget cfg={c} />
    case 'timer': return <TimerWidget cfg={c} setConfig={setConfig} />
    case 'sections': return <SectionsPanel cfg={c} />
    case 'table': return <TablePanel cfg={c} />
    case 'note': return <NoteWidget w={w} setConfig={setConfig} />
    case 'countdown': return <CountdownWidget cfg={c} />
    case 'focus': return <FocusWidget />
    case 'quickadd': return <QuickAddWidget cfg={c} />
    case 'goals': return <GoalsWidget id={c.pageId} />
    case 'page': return <PageWidget cfg={c} />
    case 'pageview': return <PageViewWidget cfg={c} />
    case 'checklist': return <ChecklistWidget cfg={c} />
    case 'dashboard': return <DashboardWidget cfg={c} />
    case 'image': return <ImageWidget cfg={c} setConfig={setConfig} />
    case 'text': return <TextWidget cfg={c} />
    case 'agenda': return <AgendaWidget cfg={c} />
    case 'week': return <WeekWidget />
    default: return <Missing text="This panel is not available." />
  }
}
/** Title shown in the widget header (empty = no header). */
export function widgetTitle(w: AnyWidget, d: AppData): string {
  if (w.title !== undefined && w.title !== null) return w.title
  const sourceName=d.pages[w.config.sourcePageId ?? w.config.pageId]?.title
  if(sourceName && (aggregateWidgets.has(w.type) || ['tasks','list','study','reading','workout','habits','goals','table','wishlist','tracker'].includes(w.type)))return sourceName
  switch (w.type) {
    case 'value': case 'progress': case 'stat': case 'clock': case 'countdown': case 'quickadd': case 'page': case 'focus': case 'image': case 'text': case 'dashboard': case 'week':
    case 'calendar': case 'weather': case 'daylight': case 'system': case 'timer':
    case 'workspaces': case 'worldclock': case 'stopwatch': case 'timeleft': case 'moon': case 'search': case 'quote': case 'battery': case 'launcher': case 'network': case 'calculator': return ''
    case 'button': case 'tracker': return ''
    case 'wishlist': return d.pages[w.config.pageId]?.title || 'Wishlist'
    case 'sections': return w.config.section || d.pages[w.config.pageId]?.title || 'Progress'
    case 'dbchart': return d.pages[w.config.dbId]?.title || 'Chart'
    case 'activity': return 'Activity'
    case 'deadlines': return 'Coming up'
    case 'events': return 'Events'
    case 'media': return ''
    case 'mail': { const cn = d.connections.find((x) => x.id === w.config.conn) ?? d.connections.find((x) => x.kind === 'mail'); return cn?.name || 'Inbox' }
    case 'todoist': return w.config.show === 'all' ? 'Todoist' : w.config.show === 'week' ? 'This week' : 'Today'
    case 'feed': { const cn = d.connections.find((x) => x.id === w.config.conn) ?? d.connections.find((x) => x.kind === 'rss'); return cn?.name || 'News' }
    case 'github': { const cn = d.connections.find((x) => x.id === w.config.conn) ?? d.connections.find((x) => x.kind === 'github'); return cn?.name || 'GitHub' }
    case 'table': return d.pages[w.config.pageId]?.title || 'Table'
    case 'chart': return w.config.source === 'value' ? d.values[w.config.valueId]?.name ?? 'Chart' : w.config.source === 'focus' ? 'Focus minutes' : w.config.source === 'habits' ? 'Habits done' : w.config.source === 'metric' ? d.metrics[w.config.metricId]?.name ?? 'Tracker' : 'Tasks done'
    case 'tasks': return { today: 'Today', overdue: 'Overdue', upcoming: 'Next 7 days', all: 'Open tasks' }[w.config.filter as string] ?? 'Tasks'
    case 'database': return d.pages[w.config.dbId]?.title || 'Database'
    case 'pageview': return (w.config.today ? 'Today · ' : '') + (w.config.section || d.pages[w.config.pageId]?.title || 'Page')
    case 'checklist': return w.config.section || d.pages[w.config.pageId]?.title || 'Checklist'
    case 'agenda': return 'Agenda'
    default: return widgetDef(w.type).name
  }
}

// ---------- page widgets ----------
const setBlock = (pageId: string, blockId: string, fn: (b: Block) => void): void =>
  updatePage(pageId, (p) => { const b = findBlock(p.blocks, blockId); if (b) fn(b) }, 'wblock:' + blockId)

/** Heading level of a block, toggle headings included (0 when it is not a heading). */
export const headingLevel = (b: Block): number => {
  const m = /^(?:toggle-)?h([123])$/.exec(b.type)
  return m ? Number(m[1]) : 0
}

const TAB_HEAD = 'tabhead:'

/**
 * Every block in reading order with columns and tabs opened up, so panels see what the page shows.
 * A tab's name reads as a heading in front of its blocks.
 */
export function flatBlocks(blocks: Block[]): Block[] {
  if (!blocks.some((b) => b.cols)) return blocks
  const out: Block[] = []
  for (const b of blocks) {
    if (b.type === 'columns') for (const c of b.cols ?? []) out.push(...flatBlocks(c))
    else if (b.type === 'tabs') {
      ;(b.cols ?? []).forEach((c, i) => {
        out.push({ id: `${TAB_HEAD}${b.id}:${i}`, type: 'h2', text: b.labels?.[i] || `Tab ${i + 1}`, indent: b.indent })
        out.push(...flatBlocks(c))
      })
    } else out.push(b)
  }
  return out
}

/** Names a panel can show a section of: headings, toggles and tabs. */
export function sectionNames(blocks: Block[]): string[] {
  return [...new Set(flatBlocks(blocks).filter((b) => (headingLevel(b) || b.type === 'toggle') && b.text.trim()).map((b) => plainText(b.text).trim()))]
}

/** Blocks under a heading (up to the next heading of the same or higher level), inside a toggle, or in a tab. */
export function sectionBlocks(all: Block[], section?: string | null): Block[] {
  if (!section) return flatBlocks(all)
  const out: Block[] = []
  // A tab with that name: exactly its blocks.
  const tabs = (list: Block[]): void => {
    for (const b of list) {
      if (b.type === 'tabs') (b.cols ?? []).forEach((c, i) => { if (plainText(b.labels?.[i] || `Tab ${i + 1}`).trim() === section) out.push(...flatBlocks(c)); else tabs(c) })
      else if (b.type === 'columns') (b.cols ?? []).forEach(tabs)
    }
  }
  tabs(all)
  const blocks = flatBlocks(all)
  const lvl = headingLevel
  // Every heading or toggle with that name counts (Notion pages often repeat a heading).
  blocks.forEach((h, i) => {
    if (h.id.startsWith(TAB_HEAD)) return
    if (!((lvl(h) || h.type === 'toggle') && plainText(h.text).trim() === section)) return
    const ind = h.indent ?? 0
    for (let j = i + 1; j < blocks.length; j++) {
      const b = blocks[j]
      if (h.type === 'toggle') { if ((b.indent ?? 0) <= ind) break }
      else if (lvl(b) && lvl(b) <= lvl(h) && (b.indent ?? 0) <= ind) break
      out.push(b)
    }
  })
  return out
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const dayAt = (text: string): number => {
  const m = /^\s*([a-z]+)/i.exec(text)
  return m ? WEEKDAYS.indexOf(m[1].toLowerCase()) : -1
}

/** Only today's part: a heading or a paragraph that starts with today's weekday, and what follows it. */
export function todayBlocks(blocks: Block[], date = new Date()): Block[] {
  const want = date.getDay()
  const lvl = headingLevel
  const i = blocks.findIndex((b) => b.type !== 'todo' && dayAt(b.text) === want)
  if (i < 0) return []
  const start = blocks[i]
  const ind = start.indent ?? 0
  const out: Block[] = lvl(start) ? [] : [start]
  for (let j = i + 1; j < blocks.length; j++) {
    const b = blocks[j]
    if ((b.indent ?? 0) < ind) break
    if (lvl(start) ? lvl(b) && lvl(b) <= lvl(start) : lvl(b) || b.type === 'divider' || /^\s*[\u2E3B\u2014\u2013-]{1,3}\s*$/.test(b.text) || dayAt(b.text) >= 0) break
    out.push(b)
  }
  return out
}

function scoped(page: Page, cfg: Record<string, any>): Block[] {
  const b = sectionBlocks(page.blocks, cfg.section)
  return cfg.today ? todayBlocks(b) : b
}

function SectionsPanel({ cfg }: { cfg: Record<string, any> }): JSX.Element {
  const page = useData((d) => (cfg.pageId ? d.pages[cfg.pageId] : undefined))
  if (!page || page.deletedAt) return <Missing text="Choose a page in the panel settings." />
  return <SectionsWidget cfg={cfg} blocks={sectionBlocks(page.blocks, cfg.section)} pageId={page.id} />
}

function TablePanel({ cfg }: { cfg: Record<string, any> }): JSX.Element {
  const page = useData((d) => (cfg.pageId ? d.pages[cfg.pageId] : undefined))
  if (!page || page.deletedAt) return <Missing text="Choose a page in the panel settings." />
  const tables=flatBlocks(page.blocks).filter(b=>b.type==='table')
  return <TableWidget cfg={cfg} block={cfg.tableId ? tables.find(b=>b.id===cfg.tableId) : tables[Number(cfg.table)||0]} />
}


function MiniBlock({ b, pageId, n }: { b: Block; pageId: string; n: number }): JSX.Element | null {
  const ind = { paddingLeft: (b.indent ?? 0) * 16 }
  switch (b.type) {
    case 'button': return <button className={b.style === 'plain' ? 'btn' : 'btn btn-primary'} onClick={e => runButtonAction(b.action ?? defaultAction, e, lines => {
      updatePage(pageId, p => {
        const insert = (blocks: Block[]): boolean => {
          const index = blocks.findIndex(x => x.id === b.id)
          if (index >= 0) {
            blocks.splice(index + 1, 0, ...lines.map(text => ({ id: uid(), type: 'todo' as const, text, indent: b.indent })))
            return true
          }
          return blocks.some(x => x.cols?.some(insert))
        }
        insert(p.blocks)
      })
    })}>{b.text || 'Button'}</button>
    case 'h1': return <div className="mb-h1" style={ind}><Marks text={b.text} /></div>
    case 'h2': return <div className="mb-h2" style={ind}><Marks text={b.text} /></div>
    case 'h3': return <div className="mb-h3" style={ind}><Marks text={b.text} /></div>
    case 'toggle-h1': case 'toggle-h2': case 'toggle-h3': return (
      <button className={`mb-toggle mb-${b.type.slice(-2)}`} style={ind} onClick={() => setBlock(pageId, b.id, (x) => { x.open = !x.open })}>
        <Icon name="chevron" size={12} className={b.open ? 'open' : ''} /><Marks text={b.text} />
      </button>
    )
    case 'todo': return (
      <label data-widget-item={b.text} className={`mb-todo ${b.checked ? 'done' : ''}`} style={ind}>
        <Checkbox color={b.iconColor} checked={!!b.checked} size={16} onChange={(v) => setBlock(pageId, b.id, (x) => { x.checked = v })} />
        <span><Marks text={b.text} /></span>
      </label>
    )
    case 'bullet': return <div className="mb-li" style={ind}><span className="mb-dot" /><span><Marks text={b.text} /></span></div>
    case 'number': return <div className="mb-li" style={ind}><span className="mb-num">{n}.</span><span><Marks text={b.text} /></span></div>
    case 'quote': return <div className="mb-quote" style={ind}><Marks text={b.text} /></div>
    case 'callout': return <div className="mb-callout" style={ind}><Glyph value={b.icon || 'lightbulb'} size={14} /><span><Marks text={b.text} /></span></div>
    case 'equation': return <div className="mb-code" style={ind}>{b.text}</div>
    case 'image': return b.url ? <img className="mb-img" style={ind} src={b.url} alt={b.text || ''} /> : null
    case 'bookmark': case 'embed': return b.url ? <button className="mb-p mb-link" style={ind} onClick={() => api.launch(b.url!)}>{b.meta?.title || plainText(b.text) || b.url.replace(/^https?:\/\/(www\.)?/, '')}</button> : null
    case 'link': case 'database': return b.ref ? <button className="mb-p mb-link" style={ind} onClick={() => openPage(b.ref!)}>{b.text || 'Open page'}</button> : null
    case 'toc': return null
    case 'code': return <pre className="mb-code" style={ind}>{b.text}</pre>
    case 'divider': return <hr className="mb-hr" />
    case 'toggle': return (
      <button className="mb-toggle" style={ind} onClick={() => setBlock(pageId, b.id, (x) => { x.open = !x.open })}>
        <Icon name="chevron" size={12} className={b.open ? 'open' : ''} /><Marks text={b.text} />
      </button>
    )
    case 'table': return (
      <div className="mb-table" style={ind}>
        <table><tbody>{(b.rows ?? []).slice(0, 30).map((r, i) => <tr key={i} className={i === 0 ? 'head' : ''}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table>
      </div>
    )
    default: return b.text ? <div className="mb-p" style={ind}><Marks text={b.text} /></div> : <div className="mb-gap" />
  }
}

/** Hides blocks inside closed toggles (deeper indent right after the toggle). */
function visibleBlocks(blocks: Block[]): Block[] {
  const out: Block[] = []
  let hideBelow: number | null = null
  for (const b of blocks) {
    const ind = b.indent ?? 0
    if (hideBelow !== null) { if (ind > hideBelow) continue; hideBelow = null }
    out.push(b)
    if ((b.type === 'toggle' || b.type.startsWith('toggle-h')) && !b.open) hideBelow = ind
  }
  return out
}

function PageViewWidget({ cfg }: { cfg: Record<string, any> }): JSX.Element {
  const [active,setActive]=useState('')
  const pages=useData(d=>d.pages)
  const ids:string[]=[...new Set<string>([cfg.pageId,...(Array.isArray(cfg.extraPages)?cfg.extraPages:[])])].filter(id=>pages[id]&&!pages[id].deletedAt)
  const id=ids.includes(active)?active:ids[0]
  return <div className="w-pageview">{ids.length>1&&<div className="row wrap gap-xs" role="tablist">{ids.map(key=><button role="tab" aria-selected={key===id} className={'chip-btn '+(key===id?'active':'')} key={key} onClick={()=>setActive(key)}>{pages[key].title}</button>)}</div>}<PageTabContent cfg={{...cfg,pageId:id}}/></div>
}
function PageTabContent({ cfg }: { cfg: Record<string, any> }): JSX.Element {
  const page = useData((d) => (cfg.pageId ? d.pages[cfg.pageId] : undefined))
  if (!page || page.deletedAt) return <Missing text="Choose a page in the panel settings." />
  let blocks = visibleBlocks(scoped(page, cfg))
  if (cfg.hideChecked) blocks = blocks.filter((b) => !(b.type === 'todo' && b.checked))
  let n = 0
  return (
    <div className="w-pageview">
      <div className="w-scroll">
        {blocks.map((b) => { n = b.type === 'number' ? n + 1 : 0; return <MiniBlock key={b.id} b={b} pageId={page.id} n={n} /> })}
      </div>
    </div>
  )
}

function collectTodos(d: AppData, pageId: string, subpages: boolean, cfg: Record<string, any>): { b: Block; pageId: string }[] {
  const p = d.pages[pageId]
  if (!p || p.deletedAt) return []
  const own = scoped(p, cfg).filter((b) => b.type === 'todo' && b.text.trim()).map((b) => ({ b, pageId }))
  if (!subpages) return own
  return [...own, ...p.children.flatMap((c) => collectTodos(d, c, true, {}))]
}

function ChecklistWidget({ cfg }: { cfg: Record<string, any> }): JSX.Element {
  const d = useData((x) => x)
  const page = cfg.pageId ? d.pages[cfg.pageId] : undefined
  if (!page || page.deletedAt) return <Missing text="Choose a page in the panel settings." />
  const all = collectTodos(d, page.id, !!cfg.subpages, cfg)
  const done = all.filter((x) => x.b.checked).length
  const list = cfg.hideChecked ? all.filter((x) => !x.b.checked) : all
  return (
    <div className="w-checklist">
      <div className="w-check-top">
        <Progress value={all.length ? done / all.length : 0} height={4} />
        <span className="muted small">{done}/{all.length}</span>
      </div>
      <div className="w-scroll">
        {list.slice(0, 300).map(({ b, pageId }) => (
          <label key={b.id} data-widget-item={b.text} className={`mb-todo ${b.checked ? 'done' : ''}`}>
            <Checkbox color={b.iconColor} checked={!!b.checked} size={16} onChange={(v) => setBlock(pageId, b.id, (x) => { x.checked = v })} />
            <span><Marks text={b.text} /></span>
          </label>
        ))}
        {list.length === 0 && <div className="w-missing"><Icon name="circle-check" size={22} /><span>All done</span></div>}
      </div>
    </div>
  )
}

function DashboardWidget({ cfg }: { cfg: Record<string, any> }): JSX.Element {
  const page = useData((d) => (cfg.pageId ? d.pages[cfg.pageId] : undefined))
  if (!page || page.deletedAt || page.type !== 'dashboard') return <Missing text="Choose a dashboard in the panel settings." />
  return <div className="w-scroll w-dash"><DashboardGrid pageId={page.id} bare /></div>
}

function ImageWidget({ cfg, setConfig }: { cfg: Record<string, any>; setConfig: SetConfig }): JSX.Element {
  if (!cfg.src) {
    return (
      <button className="w-missing w-image-pick" onClick={async () => { const src = await pickImageData(); if (src) setConfig('src', src) }}>
        <Icon name="image" size={24} /><span>Choose a picture</span>
      </button>
    )
  }
  return <div className="w-image" style={{ backgroundImage: `url("${cfg.src}")`, backgroundSize: cfg.fit === 'contain' ? 'contain' : 'cover' }} />
}

function TextWidget({ cfg }: { cfg: Record<string, any> }): JSX.Element {
  return (
    <div className="w-text" style={{ fontSize: Number(cfg.size) || 28, fontWeight: Number(cfg.weight) || 650, textAlign: cfg.align === 'center' ? 'center' : cfg.align === 'end' ? 'right' : 'left' }}>
      {cfg.text ? <span className={cfg.glass === false ? '' : 'glass-text'}>{cfg.text}</span> : <span className="muted small">Write the text in the panel settings.</span>}
      {cfg.sub && <div className="w-label">{cfg.sub}</div>}
    </div>
  )
}

/** A database row in a task list: tick it off, or open it. */
function RowTask({ r }: { r: DatedRow }): JSX.Element {
  return (
    <div data-widget-item={r.title} className={`row-task ${r.done ? 'done' : ''}`}>
      <Checkbox checked={r.done} size={17} onChange={(v) => setRowDone(r, v)} />
      <button className="row-task-title ellipsis" onClick={() => openPage(r.id)}>{r.title}</button>
      <span className="row-task-db ellipsis">{r.db}</span>
    </div>
  )
}

function AgendaWidget({ cfg }: { cfg: Record<string, any> }): JSX.Element {
  const tasks = useWidgetData((d) => d.tasks)
  const pages = useWidgetData((d) => d.pages)
  const use24h = useWidgetData((d) => d.settings.use24h)
  const t = today()
  const days = Math.max(1, Math.min(14, Number(cfg.days) || 5))
  const live = (x: Task): boolean => !x.archived && !x.done && !!pages[x.pageId] && !pages[x.pageId].deletedAt
  const overdue = Object.values(tasks).filter((x) => live(x) && x.due && x.due < t)
  const dated = useMemo(() => datedRows(pages).filter((r) => !r.done), [pages])
  const lateRows = dated.filter((r) => r.doable && r.due < t)
  const keys = Array.from({ length: days }, (_, i) => addDays(t, i))
  const events = useCalendarEvents()
  const evBy = useMemo(() => (cfg.events === false ? {} : eventsByDay(events)), [events, cfg.events])
  const fmtTime = (s?: string | null): string => {
    if (!s) return ''
    if (use24h) return s
    const [h, m] = s.split(':').map(Number)
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
  }
  const rowItem = (r: DatedRow): JSX.Element => (
    <button key={r.id} className="ag-row" onClick={() => openPage(r.id)}>
      <span className="ag-time" />
      <span className="ellipsis">{r.title}</span>
    </button>
  )
  const row = (x: Task): JSX.Element => (
    <button key={x.id} className="ag-row" onClick={() => openPage(x.pageId)}>
      <span className="ag-time">{fmtTime(x.time)}</span>
      <span className="ellipsis">{x.title}</span>
    </button>
  )
  return (
    <div className="w-scroll w-agenda">
      {overdue.length + lateRows.length > 0 && <div className="ag-day"><div className="ag-head danger">Overdue · {overdue.length + lateRows.length}</div>{overdue.slice(0, 5).map(row)}{lateRows.slice(0, Math.max(0, 5 - overdue.length)).map(rowItem)}</div>}
      {keys.map((k) => {
        const list = Object.values(tasks).filter((x) => live(x) && x.due === k).sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'))
        const rs = dated.filter((r) => r.due === k)
        const es = evBy[k] ?? []
        return (
          <div key={k} className="ag-day">
            <div className={`ag-head ${k === t ? 'today' : ''}`}>{k === t ? 'Today' : friendlyDay(k)}</div>
            {es.map((e) => <button key={e.id + e.conn} className="ag-row ag-event" onClick={() => { if (e.url) void api.openExternal(e.url) }} title={e.location ?? e.title}><span className="ag-time">{e.allDay || e.start !== k ? '' : fmtTime(e.time)}</span><span className="ellipsis"><i className="ag-dot" style={{ background: e.color }} />{e.title}</span></button>)}
            {list.length || rs.length ? <>{list.map(row)}{rs.map(rowItem)}</> : !es.length && <div className="ag-empty">Nothing planned</div>}
          </div>
        )
      })}
    </div>
  )
}

function WeekWidget(): JSX.Element {
  const tasks = useWidgetData((d) => d.tasks)
  const habits = useWidgetData((d) => d.habits)
  const weekStart = useWidgetData((d) => d.settings.weekStart)
  const t = today()
  const start = weekStartOf(t, weekStart)
  const keys = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const hs = Object.values(habits).filter((h) => !h.archived && h.kind === 'good')
  return (
    <div className="w-week">
      {keys.map((k) => {
        const due = Object.values(tasks).filter((x) => !x.done && x.due === k).length
        const done = Object.values(tasks).filter((x) => x.done && x.doneAt && dayKey(new Date(x.doneAt)) === k).length
        const hab = hs.length ? hs.filter((h) => habitDoneOn(h, k)).length / hs.length : 0
        return (
          <div key={k} className={`wk-day ${k === t ? 'today' : ''} ${k < t ? 'past' : ''}`}>
            <span className="wk-dow">{DAYS_SHORT[parseDay(k).getDay()]}</span>
            <span className="wk-num">{parseDay(k).getDate()}</span>
            <span className="wk-meta">{due ? `${due} due` : done ? `${done} done` : ''}</span>
            {hs.length > 0 && <span className="wk-bar"><span style={{ width: `${Math.round(hab * 100)}%` }} /></span>}
          </div>
        )
      })}
    </div>
  )
}

function WorkspaceSwitcher({look}:{look?:string}):JSX.Element {
 const desk=useData(d=>d.desktop)
 const spaces=desk.spaces.filter(s=>!s.archived)
 const current=spaces.find(s=>s.id===desk.active)
 if(look==='picker')return <select className="input input-sm space-picker" aria-label="Switch workspace" value={desk.active} onChange={e=>switchSpace(e.target.value)}>{spaces.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
 if(look==='cycle' || !look)return <div className="space-stepper" aria-label="Workspaces">
    <button className="icon-btn" disabled={spaces.length<2} aria-label="Previous workspace" onClick={()=>cycleSpace(-1)}><Icon name="left" size={14}/></button>
    <select className="space-picker" aria-label="Switch workspace" title={current?.name} value={desk.active} onChange={e=>switchSpace(e.target.value)}>
      {spaces.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
    <button className="icon-btn space-cycle" disabled={spaces.length<2} aria-label="Next workspace" onClick={()=>cycleSpace(1)}><Icon name="right" size={14}/></button>
  </div>
 return <div className="space-switcher">{spaces.map(s=><button key={s.id} aria-pressed={s.id===desk.active} className={'chip-btn '+(s.id===desk.active?'active':'')} onClick={()=>switchSpace(s.id)}>{s.icon&&<Glyph value={s.icon} color={s.iconColor} size={14}/>} {s.name}</button>)}</div>
}
