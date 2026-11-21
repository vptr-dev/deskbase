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

export function weekStartOf(k: string, weekStart: number): string {
  const d = parseDay(k)
  const diff = (d.getDay() - weekStart + 7) % 7
  return addDays(k, -diff)
}

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
