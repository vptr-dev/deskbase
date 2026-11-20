// Panels: a chart of a database, an activity heatmap, and upcoming deadlines.
import { openPage, useData } from '../store'
import type { AppData } from '../types'
import { datedRows, rowsOf, viewRows } from '../lib/db'
import { DAYS_SHORT, MONTHS_LONG, addDays, dayKey, diffDays, friendlyDay, parseDay, today } from '../lib/util'
import { ChartSvg, chartData, chartTitleOf } from './DbChart'
import { Icon } from './Icon'

type Cfg = Record<string, any>

// ---------- database chart ----------
export function DbChartWidget({ cfg }: { cfg: Cfg }): JSX.Element {
  const d = useData((x) => x)
  const page = cfg.dbId ? d.pages[cfg.dbId] : undefined
  if (!page?.db || page.deletedAt) return <div className="muted small pad">Pick a database in this panel's settings.</div>
  const view = page.db.views.find((v) => v.id === cfg.viewId)
  const rows = view ? viewRows(rowsOf(d, page.id), page.db, view) : rowsOf(d, page.id)
  const chart = { kind: cfg.kind ?? 'donut', by: cfg.by ?? null, value: cfg.value ?? null, fn: cfg.fn ?? 'count' }
  return (
    <div className="dbchart-panel">
      {cfg.caption !== false && <div className="small muted dbchart-caption ellipsis">{chartTitleOf(page.db, chart)}</div>}
      <div className="dbchart-body"><ChartSvg data={chartData(d, page.db, rows, chart)} kind={chart.kind} height={chart.kind === 'donut' ? 120 : 150} compact /></div>
    </div>
  )
}

// ---------- activity heatmap ----------
function activity(d: AppData, source: string): Map<string, number> {
  const m = new Map<string, number>()
  const add = (k: string, n = 1): void => { m.set(k, (m.get(k) ?? 0) + n) }
  if (source === 'all' || source === 'tasks') for (const t of Object.values<any>(d.tasks)) if (t.done && t.doneAt) add(dayKey(new Date(t.doneAt)))
  if (source === 'all' || source === 'habits') for (const h of Object.values<any>(d.habits)) if (!h.archived) for (const [k, v] of Object.entries<number>(h.log ?? {})) if (v > 0) add(k, h.kind === 'bad' ? 0 : 1)
  if (source === 'all' || source === 'focus') for (const f of d.focus as any[]) if (f.kind === 'focus') add(dayKey(new Date(f.start)), source === 'focus' ? f.minutes : 1)
  if (source === 'all' || source === 'pages') for (const p of Object.values<any>(d.pages)) if (!p.deletedAt) add(dayKey(new Date(p.updatedAt)))
  return m
}

export function ActivityWidget({ cfg }: { cfg: Cfg }): JSX.Element {
  const d = useData((x) => x)
  const weekStart = useData((x) => x.settings.weekStart)
  const weeks = Number(cfg.weeks) || 20
  const source = cfg.source ?? 'all'
  const m = activity(d, source)
  const t = today()
  // Columns are weeks, ending with this one.
  const back = (parseDay(t).getDay() - weekStart + 7) % 7
  const start = addDays(t, -back - (weeks - 1) * 7)
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i))
  const max = Math.max(1, ...days.map((k) => m.get(k) ?? 0))
  // Today counts once something is done; until then the streak runs up to yesterday.
  let streak = 0
  for (let k = (m.get(t) ?? 0) > 0 ? t : addDays(t, -1); (m.get(k) ?? 0) > 0 && streak < 3650; k = addDays(k, -1)) streak++
  const total = days.reduce((a, k) => a + (m.get(k) ?? 0), 0)
  const unit = source === 'focus' ? 'min' : ''
  return (
    <div className="activity-panel">
      <div className="activity-grid" style={{ gridTemplateColumns: `auto repeat(${weeks}, 1fr)` }}>
        {Array.from({ length: 7 }, (_, r) => (
          <span key={'l' + r} className="activity-day" style={{ gridRow: r + 1, gridColumn: 1 }}>{r % 2 === 1 ? DAYS_SHORT[(r + weekStart) % 7].slice(0, 1) : ''}</span>
        ))}
        {days.map((k, i) => {
          const v = m.get(k) ?? 0
          const lvl = v === 0 ? 0 : Math.min(4, Math.ceil((v / max) * 4))
          return <span key={k} className={`activity-cell l${lvl} ${k === t ? 'today' : ''} ${k > t ? 'future' : ''}`} style={{ gridRow: (i % 7) + 1, gridColumn: Math.floor(i / 7) + 2 }} title={`${friendlyDay(k)}: ${v}${unit ? ' ' + unit : ''}`} />
        })}
      </div>
      {cfg.stats !== false && (
        <div className="activity-foot small">
          <span><strong>{total.toLocaleString()}</strong> <span className="muted">{unit || 'done'} in {weeks} weeks</span></span>
          <span><strong>{streak}</strong> <span className="muted">day streak</span></span>
        </div>
      )}
    </div>
  )
}

// ---------- deadlines ----------
interface Due { key: string; title: string; date: string; kind: 'task' | 'row' | 'countdown'; open?: () => void }

export function DeadlinesWidget({ cfg }: { cfg: Cfg }): JSX.Element {
  const d = useData((x) => x)
  const t = today()
  const within = Number(cfg.days) || 60
  const limit = addDays(t, within)
  const list: Due[] = []
  if (cfg.countdowns !== false) for (const c of d.countdowns) {
    let date = c.date
    if (c.yearly && date) { const y = parseDay(t).getFullYear(); date = `${y}-${date.slice(5)}`; if (date < t) date = `${y + 1}-${date.slice(5)}` }
    if (date && date >= t && date <= limit) list.push({ key: 'c' + c.id, title: c.title || 'Deadline', date, kind: 'countdown' })
  }
  if (cfg.tasks !== false) for (const x of Object.values(d.tasks)) if (!x.done && x.due && x.due <= limit && (x.due >= t || cfg.overdue !== false)) list.push({ key: 't' + x.id, title: x.title, date: x.due, kind: 'task', open: () => openPage(x.pageId) })
  if (cfg.rows !== false) for (const r of datedRows(d.pages)) if (!r.done && r.due <= limit && (r.due >= t || cfg.overdue !== false)) list.push({ key: 'r' + r.id, title: r.title, date: r.due, kind: 'row', open: () => openPage(r.id) })
  list.sort((a, b) => a.date.localeCompare(b.date))
  const shown = list.slice(0, Number(cfg.count) || 6)
  if (!shown.length) return <div className="muted small pad">Nothing due in the next {within} days.</div>
  return (
    <div className="deadlines">
      {shown.map((x) => {
        const n = diffDays(x.date, t)
        const tone = n < 0 ? 'late' : n <= 2 ? 'soon' : n <= 7 ? 'week' : ''
        const dt = parseDay(x.date)
        return (
          <button key={x.key} className={`deadline ${tone}`} onClick={x.open} disabled={!x.open}>
            <span className="deadline-n"><strong>{n < 0 ? -n : n === 0 ? '!' : n}</strong><span>{n < 0 ? 'late' : n === 0 ? 'today' : n === 1 ? 'day' : 'days'}</span></span>
            <span className="deadline-text min0">
              <span className="ellipsis d-block">{x.title || 'Untitled'}</span>
              <span className="muted small">{dt.getDate()} {MONTHS_LONG[dt.getMonth()].slice(0, 3)}{x.kind === 'countdown' ? '' : x.kind === 'row' ? ' · database' : ''}</span>
            </span>
            {x.kind === 'countdown' && <Icon name="hourglass" size={13} className="muted" />}
          </button>
        )
      })}
    </div>
  )
}
