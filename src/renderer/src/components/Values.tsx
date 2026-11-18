import { useState } from 'react'
import { act, setOverlay, toast, useApp, useData } from '../store'
import type { AppData, RuleTrigger, TrackedValue, ValueRule } from '../types'
import { COLORS } from '../lib/defaults'
import { TRIGGERS, formatValue, valueNow, valueSeries } from '../lib/values'
import { timeAgo, uid } from '../lib/util'
import { Button, ColorDots, IconPickerButton, Modal, Progress, Segmented, Sparkline, Toggle } from './ui'
import { Icon } from './Icon'

export function newValue(order: number, name = ''): TrackedValue {
  return { id: uid(), name, icon: '◆', color: COLORS[order % COLORS.length], unit: '', base: 0, goal: null, decimals: 0, reset: 'never', log: [], order, createdAt: Date.now() }
}

export function createValue(name = 'New value'): string {
  const id = uid()
  act((d) => { d.values[id] = { ...newValue(Object.keys(d.values).length, name), id } })
  return id
}

/** Change a value by hand (+/- buttons, widgets). */
export function adjustValue(id: string, delta: number, note = 'Manual'): void {
  if (!delta) return
  act((d) => {
    const v = d.values[id]
    if (v) v.log.push({ id: uid(), at: Date.now(), delta, note })
  })
}

export function setValueTo(id: string, target: number): void {
  act((d) => {
    const v = d.values[id]
    if (!v) return
    const delta = target - valueNow(v, d.settings.weekStart)
    if (delta) v.log.push({ id: uid(), at: Date.now(), delta, note: 'Set' })
  })
}

const patchValue = (id: string, fn: (v: TrackedValue) => void, key?: string): void => act((d) => { if (d.values[id]) fn(d.values[id]) }, { key })
const patchRule = (id: string, fn: (r: ValueRule) => void, key?: string): void => act((d) => { const r = d.rules.find((x) => x.id === id); if (r) fn(r) }, { key })

/** Options for the "which one" part of a rule, depending on its trigger. */
function scopeOptions(d: AppData, on: RuleTrigger): { value: string; label: string }[] {
  const live = (pid: string): boolean => !!d.pages[pid] && !d.pages[pid].deletedAt
  const pagesOf = (types: string[]): { value: string; label: string }[] =>
    Object.values(d.pages).filter((p) => !p.deletedAt && !p.rowOf && types.includes(p.type)).map((p) => ({ value: p.id, label: `${p.icon} ${p.title || 'Untitled'}` }))
  switch (on) {
    case 'task': return pagesOf(['tasks', 'board', 'today'])
    case 'habit': return Object.values(d.habits).filter((h) => !h.archived && live(h.pageId)).map((h) => ({ value: h.id, label: `${h.icon} ${h.name}` }))
    case 'row': return pagesOf(['database'])
    case 'metric': return Object.values(d.metrics).filter((m) => live(m.pageId)).map((m) => ({ value: m.id, label: `${m.icon} ${m.name}` }))
    case 'goal': return pagesOf(['goals'])
    case 'journal': return pagesOf(['journal'])
    default: return []
  }
}

const anyLabel: Record<RuleTrigger, string> = { task: 'Any list', habit: 'Any habit', row: 'Choose a database', metric: 'Any tracker', goal: 'Any goals page', journal: 'Any journal', focus: '' }

function RuleRow({ r }: { r: ValueRule }): JSX.Element {
  const d = useData((x) => x)
  const scopes = scopeOptions(d, r.on)
  const db = r.on === 'row' && r.scope ? d.pages[r.scope] : undefined
  const props = db?.db?.props.filter((p) => ['status', 'select', 'checkbox'].includes(p.type)) ?? []
  const prop = props.find((p) => p.id === r.prop)
  const tags = Object.keys(d.tags).sort()
  return (
    <div className={`rule ${r.enabled ? '' : 'off'}`}>
      <div className="rule-line">
        <span className="rule-word">When</span>
        <select className="input input-sm" value={r.on} onChange={(e) => patchRule(r.id, (x) => { x.on = e.target.value as RuleTrigger; x.scope = null; x.prop = null; x.option = null; x.tag = null })}>
          {TRIGGERS.map((t) => <option key={t.on} value={t.on}>{t.label.toLowerCase()}</option>)}
        </select>
        {r.on !== 'focus' && (
          <select className="input input-sm" value={r.scope ?? ''} onChange={(e) => patchRule(r.id, (x) => { x.scope = e.target.value || null; x.prop = null; x.option = null })}>
            <option value="">{anyLabel[r.on]}</option>
            {scopes.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
        {r.on === 'task' && tags.length > 0 && (
          <select className="input input-sm" value={r.tag ?? ''} onChange={(e) => patchRule(r.id, (x) => { x.tag = e.target.value || null })}>
            <option value="">any tag</option>
            {tags.map((t) => <option key={t} value={t}>#{t}</option>)}
          </select>
        )}
        {r.on === 'row' && db && (
          <>
            <select className="input input-sm" value={r.prop ?? ''} onChange={(e) => patchRule(r.id, (x) => { x.prop = e.target.value || null; x.option = null })}>
              <option value="">choose a property</option>
              {props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {prop && prop.type !== 'checkbox' && (
              <select className="input input-sm" value={r.option ?? ''} onChange={(e) => patchRule(r.id, (x) => { x.option = e.target.value || null })}>
                <option value="">changes to anything</option>
                {(prop.options ?? []).map((o) => <option key={o.id} value={o.id}>changes to {o.name}</option>)}
              </select>
            )}
            {prop?.type === 'checkbox' && <span className="muted small">gets checked</span>}
          </>
        )}
      </div>
      <div className="rule-line">
        <span className="rule-word">then</span>
        <Segmented small value={r.mode} onChange={(mode) => patchRule(r.id, (x) => { x.mode = mode })} options={[{ value: 'add', label: 'Add' }, { value: 'set', label: 'Set to' }]} />
        <input className="input input-sm w-80" type="number" step="any" value={r.amount} onChange={(e) => patchRule(r.id, (x) => { x.amount = Number(e.target.value) || 0 }, 'rule-amt:' + r.id)} />
        {r.on === 'focus' && r.mode === 'add' && <label className="row gap-xs small"><input type="checkbox" checked={!!r.perMinute} onChange={(e) => patchRule(r.id, (x) => { x.perMinute = e.target.checked })} /> per minute</label>}
        <div className="spacer" />
        <Toggle checked={r.enabled} onChange={(v) => patchRule(r.id, (x) => { x.enabled = v })} />
        <button className="icon-btn" title="Delete rule" onClick={() => act((dd) => { dd.rules = dd.rules.filter((x) => x.id !== r.id) })}><Icon name="trash" size={14} /></button>
      </div>
    </div>
  )
}

function ValueDetail({ v }: { v: TrackedValue }): JSX.Element {
  const weekStart = useData((d) => d.settings.weekStart)
  const rules = useData((d) => d.rules.filter((r) => r.valueId === v.id))
  const [step, setStep] = useState(1)
  const now = valueNow(v, weekStart)
  const series = valueSeries(v, 30, v.reset === 'never').map((x) => x.value)
  const recent = [...v.log].sort((a, b) => b.at - a.at).slice(0, 30)
  return (
    <div className="value-detail">
      <div className="row gap-sm">
        <IconPickerButton value={v.icon} placeholder="◆" onChange={(icon) => patchValue(v.id, (x) => { x.icon = icon || '◆' })} />
        <input className="value-name" value={v.name} placeholder="Name" onChange={(e) => patchValue(v.id, (x) => { x.name = e.target.value }, 'vname:' + v.id)} />
      </div>
      <div className="value-hero glass">
        <div>
          <div className="value-big glass-text">{formatValue(v, now, false)}<span className="value-unit">{v.unit}</span></div>
          <div className="muted small">{v.reset === 'never' ? 'All time' : v.reset === 'day' ? 'Today' : v.reset === 'week' ? 'This week' : 'This month'}{v.goal ? ` · goal ${formatValue(v, v.goal)}` : ''}</div>
          {v.goal ? <Progress value={now / v.goal} color={v.color} className="mt-sm" /> : null}
        </div>
        <Sparkline values={series} width={160} height={46} color={v.color} />
        <div className="value-steps">
          <button className="btn btn-default btn-sm" onClick={() => adjustValue(v.id, -step)}><Icon name="minus" size={14} /></button>
          <input className="input input-sm w-60" type="number" step="any" value={step} onChange={(e) => setStep(Math.abs(Number(e.target.value)) || 1)} title="Step" />
          <button className="btn btn-primary btn-sm" onClick={() => adjustValue(v.id, step)}><Icon name="plus" size={14} /></button>
        </div>
      </div>

      <div className="form-grid">
        <label>Unit</label><input className="input input-sm" placeholder="pts, $, km, h…" value={v.unit} onChange={(e) => patchValue(v.id, (x) => { x.unit = e.target.value }, 'vunit:' + v.id)} />
        <label>Counts</label>
        <Segmented small value={v.reset} onChange={(reset) => patchValue(v.id, (x) => { x.reset = reset })} options={[{ value: 'never', label: 'All time' }, { value: 'day', label: 'Per day' }, { value: 'week', label: 'Per week' }, { value: 'month', label: 'Per month' }]} />
        {v.reset === 'never' && <><label>Starting value</label><input className="input input-sm w-120" type="number" step="any" value={v.base} onChange={(e) => patchValue(v.id, (x) => { x.base = Number(e.target.value) || 0 }, 'vbase:' + v.id)} /></>}
        <label>Goal</label><input className="input input-sm w-120" type="number" step="any" placeholder="none" value={v.goal ?? ''} onChange={(e) => patchValue(v.id, (x) => { x.goal = e.target.value === '' ? null : Number(e.target.value) }, 'vgoal:' + v.id)} />
        <label>Decimals</label><Segmented small value={v.decimals} onChange={(n) => patchValue(v.id, (x) => { x.decimals = n })} options={[0, 1, 2].map((n) => ({ value: n, label: String(n) }))} />
        <label>Color</label><ColorDots value={v.color} colors={COLORS} onChange={(c) => patchValue(v.id, (x) => { x.color = c })} />
      </div>

      <div className="row between mt"><div className="section-label">Automatic changes</div>
        <Button small kind="ghost" icon="plus" onClick={() => act((d) => { d.rules.push({ id: uid(), valueId: v.id, on: 'task', scope: null, tag: null, mode: 'add', amount: 1, enabled: true }) })}>Add rule</Button>
      </div>
      {rules.length === 0 ? <div className="muted small">Only changes when you use the + and − buttons.</div> : <div className="rules">{rules.map((r) => <RuleRow key={r.id} r={r} />)}</div>}

      {recent.length > 0 && <>
        <div className="section-label mt">History</div>
        <div className="history">
          {recent.map((e) => (
            <div key={e.id} className="history-row">
              <span className={e.delta >= 0 ? 'accent' : 'danger'}>{e.delta > 0 ? '+' : ''}{formatValue(v, e.delta, false)}</span>
              <span className="muted ellipsis">{e.note}</span>
              <span className="muted small">{timeAgo(e.at)}</span>
              <button className="icon-btn" title="Remove this change" onClick={() => patchValue(v.id, (x) => { x.log = x.log.filter((l) => l.id !== e.id) })}><Icon name="x" size={12} /></button>
            </div>
          ))}
        </div>
      </>}
      <div className="row mt">
        <Button small kind="ghost" icon="trash" onClick={() => { act((d) => { delete d.values[v.id]; d.rules = d.rules.filter((r) => r.valueId !== v.id) }); toast(`Deleted ${v.name || 'value'}`, { undo: true }) }}>Delete value</Button>
      </div>
    </div>
  )
}

/** Manager for the user's own numbers: points, money, streaks, anything. */
export function ValuesDialog(): JSX.Element {
  const values = useData((d) => Object.values(d.values).sort((a, b) => a.order - b.order))
  const weekStart = useData((d) => d.settings.weekStart)
  const arg = useApp((s) => s.overlayArg)
  const [sel, setSel] = useState<string | null>(typeof arg === 'string' ? arg : values[0]?.id ?? null)
  const cur = values.find((v) => v.id === sel) ?? values[0]
  return (
    <Modal onClose={() => setOverlay(null)} width={860} className="values-modal">
      <div className="values-layout">
        <nav className="values-nav">
          <div className="section-label">Values</div>
          {values.map((v) => (
            <button key={v.id} className={`values-item ${cur?.id === v.id ? 'active' : ''}`} onClick={() => setSel(v.id)}>
              <span className="values-dot" style={{ background: v.color }}>{v.icon}</span>
              <span className="grow ellipsis">{v.name || 'Untitled'}</span>
              <span className="muted small tabular">{formatValue(v, valueNow(v, weekStart), false)}</span>
            </button>
          ))}
          <button className="values-item add" onClick={() => setSel(createValue())}><Icon name="plus" size={14} /> New value</button>
        </nav>
        <div className="values-body">
          {cur ? <ValueDetail key={cur.id} v={cur} /> : (
            <div className="empty"><div className="empty-icon">◆</div><div className="empty-title">No values yet</div><Button kind="primary" small icon="plus" onClick={() => setSel(createValue())}>New value</Button></div>
          )}
        </div>
      </div>
    </Modal>
  )
}
