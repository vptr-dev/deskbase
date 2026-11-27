import type { CustomRepeat, Repeat, RepeatPreset, Task } from '../types'
import { addDays, addMonths, DAYS_SHORT, dayKey, diffDays, parseDay, weekStartOf } from './util'

export const repeatPresets: Record<RepeatPreset, string> = {
  none: 'Never', daily: 'Daily', weekdays: 'Weekdays', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly'
}

export function validDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && dayKey(parseDay(value)) === value
}

export function normalizeRepeat(value: unknown): Repeat {
  if (typeof value === 'string' && Object.hasOwn(repeatPresets, value)) return value as RepeatPreset
  if (!value || typeof value !== 'object') return 'none'
  const rule = value as CustomRepeat
  if (!['day', 'week', 'month', 'year'].includes(rule.unit) || !validDay(rule.start)) return 'none'
  if (!Number.isInteger(rule.interval) || rule.interval < 1 || rule.interval > 999) return 'none'
  if (rule.until && !validDay(rule.until)) return 'none'
  const days = Array.isArray(rule.days) ? [...new Set(rule.days.filter(n => Number.isInteger(n) && n >= 0 && n < 7))].sort() : []
  if (!days.length) days.push(parseDay(rule.start).getDay())
  return { unit: rule.unit, interval: rule.interval, start: rule.start, weekStart: rule.weekStart === 0 ? 0 : 1, days, ...(typeof rule.remaining==="number" && Number.isSafeInteger(rule.remaining) && rule.remaining>0 ? {remaining:rule.remaining}:{}), ...(rule.until ? { until: rule.until } : {}) }
}

export function repeatLabel(rule: Repeat): string {
  if (typeof rule === 'string') return repeatPresets[rule]
  const every = rule.interval === 1 ? 'Every ' + rule.unit : `Every ${rule.interval} ${rule.unit}s`
  if (rule.unit !== 'week') return every
  const days = rule.days.slice().sort((a,b) => (a - rule.weekStart + 7) % 7 - (b - rule.weekStart + 7) % 7)
  return every + ' on ' + days.map(d => DAYS_SHORT[d]).join(', ')
}

/** First scheduled date on or after the requested local calendar day. */
export function occurrence(rule: CustomRepeat, from: string): string | null {
  const lower = from > rule.start ? from : rule.start
  let date: string
  if (rule.unit === 'day') {
    date = addDays(rule.start, rule.interval * Math.ceil(diffDays(lower, rule.start) / rule.interval))
  } else if (rule.unit === 'week') {
    const startDay = parseDay(rule.start).getDay()
    const first = addDays(rule.start, Math.min(...rule.days.map(day => (day - startDay + 7) % 7)))
    const firstWeek = weekStartOf(first, rule.weekStart)
    const cycle = rule.interval * 7
    const base = addDays(firstWeek, Math.max(0, Math.floor(diffDays(lower, firstWeek) / cycle)) * cycle)
    const offsets = rule.days.map(d => (d - rule.weekStart + 7) % 7).sort((a,b) => a-b)
    const offset = offsets.find(n => n >= diffDays(lower, base))
    date = addDays(base, offset ?? (cycle + offsets[0]))
  } else {
    const start = parseDay(rule.start), bound = parseDay(lower)
    const months = (bound.getFullYear() - start.getFullYear()) * 12 + bound.getMonth() - start.getMonth()
    const step = rule.interval * (rule.unit === 'year' ? 12 : 1)
    const offset = Math.floor(months / step) * step
    date = addMonths(rule.start, offset)
    if (date < lower) date = addMonths(rule.start, offset + step)
  }
  return validDay(date) && (!rule.until || date <= rule.until) ? date : null
}

export function nextTaskDate(rule: Repeat, due: string, completed: string): string | null {
  if (rule === 'none'||(typeof rule==='object'&&rule.remaining===1)) return null
  const start = validDay(due) ? due : completed
  const from = addDays(start > completed ? start : completed, 1)
  if (typeof rule !== 'string') return occurrence(rule, from)
  const unit = rule === 'yearly' ? 'year' : rule === 'monthly' ? 'month' : rule === 'daily' ? 'day' : 'week'
  return occurrence({ unit, interval: 1, start, days: rule === 'weekdays' ? [1, 2, 3, 4, 5] : [parseDay(start).getDay()], weekStart: 1 }, from)
}

export function taskReminderAt(task: Task): number | null {
  if (task.reminderBeforeMinutes == null) return task.remindAt ?? null
  if (!validDay(task.due)) return null
  const dueTime = new Date(task.due + 'T' + (task.time || '09:00'))
  return dueTime.getTime() - task.reminderBeforeMinutes * 60_000
}

export function shiftTaskReminder(reminder: number | null | undefined, from: string, to: string): number | null {
  if (!reminder || !validDay(from) || !validDay(to)) return reminder ?? null
  const date = new Date(reminder)
  date.setDate(date.getDate() + diffDays(to, from))
  return date.getTime()
}
