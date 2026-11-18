import { useState } from 'react'
import { act, award, pageItems, patch, removeItem, upsert, useData } from '../store'
import type { Metric } from '../types'
import { COLORS } from '../lib/defaults'
import { DAYS_SHORT, MONTHS_LONG, addDays, friendlyDay, parseDay, today, uid, weekStartOf } from '../lib/util'
import { BarChart, Button, ColorDots, ConfirmButton, Empty, IconPickerButton, Modal, Progress, Segmented, Sparkline } from '../components/ui'
import { Icon } from '../components/Icon'

const PRESETS: Partial<Metric>[] = [
  { name: 'Water', icon: '💧', unit: 'glasses', goal: 8, direction: 'up', aggregate: 'sum' },
  { name: 'Sleep', icon: '😴', unit: 'hours', goal: 8, direction: 'up', aggregate: 'last' },
  { name: 'Weight', icon: '⚖️', unit: 'kg', goal: null, direction: 'down', aggregate: 'last' },
  { name: 'Steps', icon: '🚶', unit: 'steps', goal: 8000, direction: 'up', aggregate: 'sum' },
  { name: 'Reading', icon: '📖', unit: 'pages', goal: 20, direction: 'up', aggregate: 'sum' },
  { name: 'Screen time', icon: '📱', unit: 'hours', goal: 3, direction: 'down', aggregate: 'last' },
  { name: 'Workout', icon: '🏋️', unit: 'minutes', goal: 30, direction: 'up', aggregate: 'sum' },
  { name: 'Spending', icon: '💸', unit: '$', goal: null, direction: 'down', aggregate: 'sum' }
]

export function metricValue(m: Metric, day: string): number | null {
  const es = m.entries.filter((e) => e.date === day)
  if (!es.length) return null
  return m.aggregate === 'sum' ? es.reduce((a, e) => a + e.value, 0) : es[es.length - 1].value
}

const round = (n: number): number => Math.round(n * 10) / 10

/** Average of daily values over the last `days` days that have entries. */
export function metricAverage(m: Metric, days: number): number | null {
  const t = today()
  const vals = Array.from({ length: days }, (_, i) => metricValue(m, addDays(t, -i))).filter((x): x is number => x !== null)
  return vals.length ? round(vals.reduce((a, b) => a + b, 0) / vals.length) : null
}

type Range = 'week' | 'month' | 'year'
function MetricChart({ m, range }: { m: Metric; range: Range }): JSX.Element {
  const t = today()
  let data: { label: string; value: number }[]
  if (range === 'week') {
    data = Array.from({ length: 7 }, (_, i) => { const k = addDays(t, i - 6); return { label: DAYS_SHORT[parseDay(k).getDay()][0], value: metricValue(m, k) ?? 0 } })
  } else if (range === 'month') {
    data = Array.from({ length: 30 }, (_, i) => { const k = addDays(t, i - 29); return { label: i % 5 === 4 ? String(parseDay(k).getDate()) : '', value: metricValue(m, k) ?? 0 } })
  } else {
    // 12 months: monthly total for sums, monthly average for latest-value metrics.
    const now = parseDay(t)
    data = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)
      const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const days = [...new Set(m.entries.filter((e) => e.date.startsWith(prefix)).map((e) => e.date))]
      const vals = days.map((k) => metricValue(m, k) ?? 0)
      const v = vals.length ? (m.aggregate === 'sum' ? vals.reduce((a, b) => a + b, 0) : vals.reduce((a, b) => a + b, 0) / vals.length) : 0
      return { label: MONTHS_LONG[d.getMonth()].slice(0, 1), value: round(v) }
    })
  }
  return <BarChart data={data} height={90} color={m.color} format={(v) => `${v} ${m.unit}`} />
}

function MetricEditor({ metric, onClose }: { metric: Metric; onClose: () => void }): JSX.Element {
  const [m, setM] = useState(metric)
  const set = (p: Partial<Metric>): void => setM({ ...m, ...p })
  return (
    <Modal onClose={onClose} width={480}>
      <div className="modal-head"><h3>{metric.name ? 'Edit tracker' : 'New tracker'}</h3></div>
      <div className="modal-body form">
        {!metric.name && (
          <div className="row wrap gap-xs">
            {PRESETS.map((p) => <button key={p.name} className="chip-btn" onClick={() => set(p)}>{p.icon} {p.name}</button>)}
          </div>
        )}
        <div className="row gap-sm">
          <IconPickerButton value={m.icon} onChange={(icon) => set({ icon })} />
          <input id="metric-name" autoFocus className="input grow" placeholder="Name" value={m.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
        <div className="form-2">
          <div><label>Unit</label><input id="metric-unit" className="input" value={m.unit} onChange={(e) => set({ unit: e.target.value })} /></div>
          <div><label>Daily goal</label><input id="metric-goal" type="number" className="input" value={m.goal ?? ''} onChange={(e) => set({ goal: e.target.value === '' ? null : Number(e.target.value) })} /></div>
        </div>
        <label>Better when</label>
        <Segmented small value={m.direction} onChange={(direction) => set({ direction })} options={[{ value: 'up', label: 'Higher' }, { value: 'down', label: 'Lower' }, { value: 'none', label: 'Neutral' }]} />
        <label>Multiple entries per day</label>
        <Segmented small value={m.aggregate} onChange={(aggregate) => set({ aggregate })} options={[{ value: 'sum', label: 'Add up' }, { value: 'last', label: 'Keep latest' }]} />
        <label>Color</label>
        <ColorDots value={m.color} colors={COLORS} onChange={(color) => set({ color })} />
      </div>
      <div className="modal-foot">
        {metric.name && <ConfirmButton onConfirm={() => { removeItem('metrics', m.id, 'tracker'); onClose() }} />}
        <div className="spacer" />
        <Button onClick={onClose}>Cancel</Button>
        <Button kind="primary" disabled={!m.name.trim()} onClick={() => { upsert('metrics', m); onClose() }}>Save</Button>
      </div>
    </Modal>
  )
}

function MetricCard({ m, onEdit }: { m: Metric; onEdit: () => void }): JSX.Element {
  const [val, setVal] = useState('')
  const [open, setOpen] = useState(false)
  const [range, setRange] = useState<Range | null>(null)
  const t = today()
  const avg7 = metricAverage(m, 7)
  const avg30 = metricAverage(m, 30)
  const weekStart = weekStartOf(t, 1)
  const weekTotal = m.aggregate === 'sum' ? round(m.entries.filter((e) => e.date >= weekStart && e.date <= t).reduce((a, e) => a + e.value, 0)) : null
  const v = metricValue(m, t)
  const series = Array.from({ length: 30 }, (_, i) => metricValue(m, addDays(t, i - 29))).filter((x): x is number => x !== null)
  const goalPct = m.goal && v !== null ? (m.direction === 'down' ? (v <= m.goal ? 1 : m.goal / v) : v / m.goal) : 0
  const add = (n: number): void => {
    if (Number.isNaN(n)) return
    act((d) => {
      const x = d.metrics[m.id]
      x.entries.push({ date: t, value: n })
      const src = `metric:${m.id}:${t}`
      if (!d.xpLog.some((e) => e.sourceId === src)) award(d, { xp: 3, gold: 0, label: `Logged ${x.name}`, source: 'metric', sourceId: src, stat: 'vit' })
    })
    setVal('')
  }
  const days = [...new Set(m.entries.map((e) => e.date))].sort().reverse()
  return (
    <div className="metric-card glass">
      <div className="row between">
        <div className="row gap-sm"><span className="metric-icon" style={{ background: m.color + '22' }}>{m.icon}</span><div><div className="strong">{m.name}</div><div className="muted small">{m.goal ? `Goal ${m.goal} ${m.unit}` : m.unit}</div></div></div>
        <Button small kind="ghost" icon="edit" title="Edit" onClick={onEdit} />
      </div>
      <div className="metric-value"><span className="big">{v ?? '–'}</span> <span className="muted">{m.unit}</span></div>
      {m.goal ? <Progress value={goalPct} color={m.color} /> : null}
      {range ? <MetricChart m={m} range={range} /> : <Sparkline values={series} width={260} height={40} color={m.color} />}
      <div className="row between gap-sm">
        <div className="metric-stats muted small">
          {avg7 !== null && <span>7d avg <b className="fg">{avg7}</b></span>}
          {avg30 !== null && <span>30d avg <b className="fg">{avg30}</b></span>}
          {weekTotal !== null && weekTotal > 0 && <span>This week <b className="fg">{weekTotal}</b></span>}
        </div>
        <Segmented small value={range ?? 'spark'} onChange={(v) => setRange(v === 'spark' ? null : (v as Range))} options={[{ value: 'spark', label: '~' }, { value: 'week', label: '7d' }, { value: 'month', label: '30d' }, { value: 'year', label: '12m' }]} />
      </div>
      <div className="row gap-xs">
        {m.aggregate === 'sum' && <Button small onClick={() => add(1)}>+1</Button>}
        <input id={`mv-${m.id}`} type="number" className="input input-sm grow" placeholder={`Log ${m.unit}`} value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && val !== '') add(Number(val)) }} />
        <Button small kind="primary" disabled={val === ''} onClick={() => add(Number(val))}>Log</Button>
      </div>
      <button className="link small" onClick={() => setOpen(!open)}>{open ? 'Hide history' : `History (${days.length} days)`}</button>
      {open && (
        <div className="history">
          {days.slice(0, 20).map((k) => (
            <div key={k} className="history-row">
              <span>{friendlyDay(k)}</span>
              <span>{metricValue(m, k)} {m.unit}</span>
              <button className="icon-btn" title="Delete day" onClick={() => patch('metrics', m.id, (x) => { x.entries = x.entries.filter((e) => e.date !== k) })}><Icon name="x" size={12} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function TrackerPage({ pageId }: { pageId: string }): JSX.Element {
  const all = useData((d) => d.metrics)
  const [editing, setEditing] = useState<Metric | null>(null)
  const metrics = pageItems(all, pageId)
  const blank = (): Metric => ({ id: uid(), pageId, name: '', icon: '📈', unit: '', goal: null, direction: 'up', color: COLORS[metrics.length % COLORS.length], entries: [], aggregate: 'sum', order: metrics.length })
  return (
    <div className="tracker-page">
      <div className="toolbar"><div className="spacer" /><Button kind="primary" small icon="plus" onClick={() => setEditing(blank())}>New tracker</Button></div>
      {metrics.length === 0 ? <Empty icon="📈" title="Nothing tracked yet" /> : (
        <div className="card-grid">{metrics.map((m) => <MetricCard key={m.id} m={m} onEdit={() => setEditing(m)} />)}</div>
      )}
      {editing && <MetricEditor metric={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
