import type { AppData, RuleTrigger, TrackedValue, ValueRule } from '../types'
import { addDays, dayKey, parseDay, today, uid, weekStartOf } from './util'

/** Start (ms) of the period the value currently counts, or 0 when it never resets. */
export function periodStart(v: Pick<TrackedValue, 'reset'>, weekStart: 0 | 1, now = Date.now()): number {
  const k = dayKey(new Date(now))
  if (v.reset === 'day') return parseDay(k).getTime()
  if (v.reset === 'week') return parseDay(weekStartOf(k, weekStart)).getTime()
  if (v.reset === 'month') return parseDay(k.slice(0, 8) + '01').getTime()
  return 0
}

/** The number a value shows right now. */
export function valueNow(v: TrackedValue, weekStart: 0 | 1, now = Date.now()): number {
  const from = periodStart(v, weekStart, now)
  let n = v.reset === 'never' ? v.base : 0
  for (const e of v.log) if (e.at >= from && e.at <= now) n += e.delta
  return n
}

export function formatValue(v: Pick<TrackedValue, 'decimals' | 'unit'>, n: number, withUnit = true): string {
  const s = n.toLocaleString(undefined, { minimumFractionDigits: v.decimals, maximumFractionDigits: v.decimals })
  return withUnit && v.unit ? `${s} ${v.unit}` : s
}

/** Daily totals of changes over the last `days` days (oldest first), or the running value when cumulative. */
export function valueSeries(v: TrackedValue, days: number, cumulative: boolean): { day: string; value: number }[] {
  const end = today()
  const start = addDays(end, -(days - 1))
  const by: Record<string, number> = {}
  let before = v.base
  for (const e of v.log) {
    const k = dayKey(new Date(e.at))
    if (k < start) before += e.delta
    else by[k] = (by[k] ?? 0) + e.delta
  }
  const out: { day: string; value: number }[] = []
  let run = before
  for (let i = 0; i < days; i++) {
    const k = addDays(start, i)
    run += by[k] ?? 0
    out.push({ day: k, value: cumulative ? run : by[k] ?? 0 })
  }
  return out
}

export interface ValueEvent {
  on: RuleTrigger
  /** unique id of what happened (task id, habit+day, …); used to undo */
  src: string
  label: string
  scope?: string | null
  tags?: string[]
  prop?: string
  option?: string | null
  minutes?: number
}

export function ruleMatches(r: ValueRule, ev: ValueEvent): boolean {
  if (!r.enabled || r.on !== ev.on) return false
  if (r.scope && r.scope !== ev.scope) return false
  if (r.on === 'task' && r.tag && !(ev.tags ?? []).includes(r.tag)) return false
  if (r.on === 'row') {
    if (r.prop && r.prop !== ev.prop) return false
    if (r.option && r.option !== ev.option) return false
  }
  return true
}

/** Apply every matching rule. Returns short labels like "+5 Points" for a toast. */
export function applyRules(d: AppData, ev: ValueEvent): string[] {
  const out: string[] = []
  for (const r of d.rules) {
    if (!ruleMatches(r, ev)) continue
    const v = d.values[r.valueId]
    if (!v) continue
    const key = `${r.id}|${ev.src}`
    if (v.log.some((e) => e.src === key)) continue
    const amount = r.on === 'focus' && r.perMinute ? r.amount * (ev.minutes ?? 0) : r.amount
    const delta = r.mode === 'set' ? amount - valueNow(v, d.settings.weekStart) : amount
    if (!delta) continue
    v.log.push({ id: uid(), at: Date.now(), delta, note: ev.label, src: key })
    if (v.log.length > 20000) v.log.splice(0, v.log.length - 20000)
    out.push(`${delta > 0 ? '+' : ''}${formatValue(v, delta, false)} ${v.name}`)
  }
  return out
}

/** Undo what rules did for an event (e.g. a task was un-checked). */
export function revertRules(d: AppData, src: string): void {
  for (const v of Object.values(d.values)) {
    if (v.log.some((e) => e.src?.endsWith('|' + src))) v.log = v.log.filter((e) => !e.src?.endsWith('|' + src))
  }
}

export const TRIGGERS: { on: RuleTrigger; label: string }[] = [
  { on: 'task', label: 'A task is completed' },
  { on: 'habit', label: 'A habit is done for the day' },
  { on: 'row', label: 'A database row changes' },
  { on: 'focus', label: 'A focus session ends' },
  { on: 'journal', label: 'A journal entry is written' },
  { on: 'metric', label: 'A tracker is logged' },
  { on: 'goal', label: 'A goal is completed' }
]
