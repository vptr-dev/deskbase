import { useState } from 'react'
import { act, award, pageItems, patch, removeItem, upsert, useData } from '../store'
import type { Metric } from '../types'
import { COLORS } from '../lib/defaults'
import { addDays, friendlyDay, today, uid } from '../lib/util'
import { Button, ColorDots, ConfirmButton, Empty, IconPickerButton, Modal, Progress, Segmented, Sparkline } from '../components/ui'
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
  const t = today()
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
      <Sparkline values={series} width={260} height={40} color={m.color} />
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
