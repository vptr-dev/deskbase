import type { CustomRepeat, Repeat } from '../types'
import { occurrence, validDay } from './recurrence'
import { addDays, addMonths, dayKey, DAYS_SHORT, MONTHS_LONG, pad, parseDay, today } from './util'

const WEEKDAY_RE = '(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues?|wed|thu(?:rs?)?|fri|sat)'
const MONTH_RE = '(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)'
const weekdayIndex = (w: string): number => DAYS_SHORT.findIndex((d) => d.toLowerCase() === w.toLowerCase().slice(0, 3))
const monthIndex = (m: string): number => MONTHS_LONG.findIndex((x) => x.slice(0, 3).toLowerCase() === m.toLowerCase().slice(0, 3))

const weekday = WEEKDAY_RE.replace('(', '(?:')
const weekdayList = weekday + '(?:(?:\\s*,\\s*(?:and\\s+)?|\\s+(?:and|&)\\s+)' + weekday + ')*'
const CUSTOM_INTERVAL = new RegExp('\\severy\\s+(?:(\\d+)\\s+|(?=weeks?\\s+on\\s+))' +
  '(day|week|month|year)s?\\b(?:\\s+on\\s+(' + weekdayList + ')\\b)?', 'i')

/** Natural-language quick add: "Pay rent tomorrow 5pm !high #home every month" */
export function parseQuickAdd(input: string, weekStart: 0 | 1 = 1, defaultDue?: string | null, parseRepeat = true): {
  title: string
  due?: string
  time?: string
  priority?: 0 | 1 | 2 | 3
  tags: string[]
  repeat?: Repeat
  difficulty?: 'trivial' | 'easy' | 'medium' | 'hard' | 'epic'
} {
  let s = ` ${input} `
  const out: ReturnType<typeof parseQuickAdd> = { title: '', tags: [] }
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void): void => {
    const m = s.match(re)
    if (m) {
      fn(m)
      s = s.replace(re, ' ')
    }
  }
  s = s.replace(/\s#([\w-]+)/g, (_, t) => {
    out.tags.push(t.toLowerCase())
    return ' '
  })
  take(/\s!(high|h|3|urgent)\b/i, () => (out.priority = 3))
  take(/\s!(med|medium|m|2)\b/i, () => (out.priority = 2))
  take(/\s!(low|l|1)\b/i, () => (out.priority = 1))
  let custom: { unit: CustomRepeat['unit']; interval: number; days?: number[] } | undefined
  const recurring = parseRepeat ? s.match(CUSTOM_INTERVAL) : null
  if (recurring) {
    const unit = recurring[2].toLowerCase() as CustomRepeat['unit']
    const days = recurring[3]?.match(new RegExp(WEEKDAY_RE, 'gi'))?.map(weekdayIndex)
    const interval = Number(recurring[1] ?? 1)
    if (interval > 0 && interval <= 999 && (!days || unit === 'week')) {
      custom = { unit, interval, days }
      s = s.replace(recurring[0], ' ')
    }
  }
  if (parseRepeat && !custom) {
    take(/\s(?:every\s?day|daily)\b/i, () => (out.repeat = 'daily'))
    take(/\s(?:every\s?weekday|weekdays)\b/i, () => (out.repeat = 'weekdays'))
    take(/\s(?:every\s?week|weekly)\b/i, () => (out.repeat = 'weekly'))
    take(/\s(?:every\s?month|monthly)\b/i, () => (out.repeat = 'monthly'))
    take(/\s(?:every\s?year|yearly)\b/i, () => (out.repeat = 'yearly'))
  }
  take(/\s(?:at\s)?(\d{1,2})(?::(\d{2}))?\s?(am|pm)\b/i, (m) => {
    let h = Number(m[1]) % 12
    if (m[3].toLowerCase() === 'pm') h += 12
    out.time = `${pad(h)}:${pad(Number(m[2] ?? 0))}`
  })
  take(/\s(?:at\s)([01]?\d|2[0-3]):([0-5]\d)\b/, (m) => (out.time = `${pad(Number(m[1]))}:${m[2]}`))
  const t0 = today()
  const now = new Date()
  take(/\s(today|tonight)\b/i, () => (out.due = t0))
  take(/\s(tomorrow|tmr|tmrw)\b/i, () => (out.due = addDays(t0, 1)))
  take(/\s(?:end of (?:the )?month|eom)\b/i, () => (out.due = dayKey(new Date(now.getFullYear(), now.getMonth() + 1, 0))))
  take(/\s(?:end of (?:the )?week|eow)\b/i, () => (out.due = addDays(t0, (7 - now.getDay()) % 7)))
  take(/\send of (?:the )?year\b/i, () => (out.due = `${now.getFullYear()}-12-31`))
  take(/\s(?:this )?weekend\b/i, () => (out.due = addDays(t0, (6 - now.getDay() + 7) % 7)))
  take(new RegExp(`\\snext ${WEEKDAY_RE}\\b`, 'i'), (m) => {
    const toMonday = (8 - now.getDay()) % 7 || 7
    out.due = addDays(t0, toMonday + ((weekdayIndex(m[1]) + 6) % 7))
  })
  take(/\snext week\b/i, () => (out.due = addDays(t0, 7)))
  take(/\snext month\b/i, () => (out.due = addMonths(t0, 1)))
  take(/\snext year\b/i, () => (out.due = addMonths(t0, 12)))
  take(/\sin (\d+|an?|one|two|three|four|five|six) (day|week|month|year)s?\b/i, (m) => {
    const words: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 }
    const n = words[m[1].toLowerCase()] ?? Number(m[1])
    const unit = m[2].toLowerCase()
    out.due = unit === 'day' ? addDays(t0, n) : unit === 'week' ? addDays(t0, n * 7) : addMonths(t0, unit === 'month' ? n : n * 12)
  })
  take(/\s(\d{4}-\d{2}-\d{2})\b/, (m) => (out.due = m[1]))
  const onDate = (month: number, day: number): void => {
    if (month < 0 || day < 1 || day > 31) return
    let k = dayKey(new Date(now.getFullYear(), month, day))
    if (k < t0) k = dayKey(new Date(now.getFullYear() + 1, month, day))
    out.due = k
  }
  take(new RegExp(`\\s(?:on\\s)?${MONTH_RE}\\s(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i'), (m) => onDate(monthIndex(m[1]), Number(m[2])))
  take(new RegExp(`\\s(?:on\\s)?(\\d{1,2})(?:st|nd|rd|th)?\\s${MONTH_RE}\\b`, 'i'), (m) => onDate(monthIndex(m[2]), Number(m[1])))
  take(new RegExp(`\\s(?:on\\s)?${WEEKDAY_RE}\\b`, 'i'), (m) => {
    let diff = (weekdayIndex(m[1]) - now.getDay() + 7) % 7
    if (diff === 0) diff = 7
    out.due = addDays(t0, diff)
  })
  if (custom) {
    const start = out.due ?? defaultDue ?? today()
    if (validDay(start)) {
      const rule = { ...custom, start, weekStart, days: [...new Set(custom.days ?? [parseDay(start).getDay()])] }
      out.repeat = rule
      out.due = occurrence(rule, start) ?? start
    }
  }
  if (out.repeat && !out.due) out.due = defaultDue ?? today()
  out.title = s.replace(/\s+/g, ' ').trim()
  return out
}
