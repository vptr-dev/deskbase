export const uid = (): string =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

export const pad = (n: number): string => String(n).padStart(2, '0')

/** Local date key YYYY-MM-DD */
export const dayKey = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const parseDay = (k: string): Date => {
  const [y, m, d] = k.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export const addDays = (k: string, n: number): string => {
  const d = parseDay(k)
  d.setDate(d.getDate() + n)
  return dayKey(d)
}

export const addMonths = (k: string, n: number): string => {
  const d = parseDay(k)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + n)
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, last))
  return dayKey(d)
}

export const today = (): string => dayKey()

export const diffDays = (a: string, b: string): number =>
  Math.round((parseDay(a).getTime() - parseDay(b).getTime()) / 86400000)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function friendlyDay(k: string | null | undefined): string {
  if (!k) return ''
  const t = today()
  const diff = diffDays(k, t)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  const d = parseDay(k)
  if (diff > 1 && diff < 7) return DAYS_LONG[d.getDay()]
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return `${MONTHS[d.getMonth()]} ${d.getDate()}${sameYear ? '' : ', ' + d.getFullYear()}`
}

export function longDate(k: string): string {
  const d = parseDay(k)
  return `${DAYS_LONG[d.getDay()]}, ${MONTHS_LONG[d.getMonth()]} ${d.getDate()}`
}

export function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(ts).toLocaleDateString()
}

export function formatTime(t: string | null | undefined, use24h: boolean): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  if (use24h) return `${pad(h)}:${pad(m)}`
  const ap = h >= 12 ? 'PM' : 'AM'
  return `${((h + 11) % 12) + 1}:${pad(m)} ${ap}`
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${Math.round(min)}m`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m ? `${h}h ${m}m` : `${h}h`
}

export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v))

export function weekStartOf(k: string, weekStart: 0 | 1): string {
  const d = parseDay(k)
  const diff = (d.getDay() - weekStart + 7) % 7
  return addDays(k, -diff)
}

const WEEKDAY_RE = '(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues?|wed|thu(?:rs?)?|fri|sat)'
const MONTH_RE = '(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)'
const weekdayIndex = (w: string): number => DAYS_SHORT.findIndex((d) => d.toLowerCase() === w.toLowerCase().slice(0, 3))
const monthIndex = (m: string): number => MONTHS.findIndex((x) => x.toLowerCase() === m.toLowerCase().slice(0, 3))

/** Snooze targets relative to today. */
export function snoozeOptions(): { label: string; due: string }[] {
  const t = today()
  const dow = parseDay(t).getDay()
  return [
    { label: 'Tomorrow', due: addDays(t, 1) },
    { label: 'In 2 days', due: addDays(t, 2) },
    { label: 'This weekend', due: addDays(t, ((6 - dow + 7) % 7) || 7) },
    { label: 'Next week', due: addDays(t, (8 - dow) % 7 || 7) },
    { label: 'Next month', due: addMonths(t, 1) }
  ]
}

/** Natural-language quick add: "Pay rent tomorrow 5pm !high #home every month" */
export function parseQuickAdd(input: string): {
  title: string
  due?: string
  time?: string
  priority?: 0 | 1 | 2 | 3
  tags: string[]
  repeat?: 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly'
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
  take(/\severy\s?day|\sdaily\b/i, () => (out.repeat = 'daily'))
  take(/\severy\s?weekday|\sweekdays\b/i, () => (out.repeat = 'weekdays'))
  take(/\severy\s?week|\sweekly\b/i, () => (out.repeat = 'weekly'))
  take(/\severy\s?month|\smonthly\b/i, () => (out.repeat = 'monthly'))
  take(/\severy\s?year|\syearly\b/i, () => (out.repeat = 'yearly'))
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
  if (out.repeat && !out.due) out.due = today()
  out.title = s.replace(/\s+/g, ' ').trim()
  return out
}

export function download(name: string, text: string): void {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}
