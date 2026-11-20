// Connections that bring things in from outside: calendar feeds (ICS), news feeds (RSS and Atom)
// and GitHub. The parsers are plain functions so the main process and the browser preview share them.

export type ConnKind = 'notion' | 'calendar' | 'rss' | 'github' | 'mail' | 'todoist'

/** A mail account (IMAP). The password stays in the main process. */
export interface MailAccount { preset: string; host: string; port: number; user: string }

/** What the main process needs to fetch a connection. Secrets stay in the main process. */
export interface ConnSpec { id: string; kind: ConnKind; url: string; repos: string[]; account?: MailAccount }

export interface FeedEvent {
  id: string
  title: string
  /** YYYY-MM-DD in local time */
  start: string
  /** HH:MM, missing for all-day events */
  time?: string
  /** last day (YYYY-MM-DD), for events over several days */
  end?: string
  endTime?: string
  allDay: boolean
  location?: string
  url?: string
  /** milliseconds, for sorting */
  at: number
}

export interface FeedItem {
  id: string
  title: string
  url: string
  /** milliseconds */
  date?: number
  summary?: string
  kind?: 'post' | 'issue' | 'pr' | 'mail' | 'task'
  /** mail: not read yet */
  unread?: boolean
  /** tasks: YYYY-MM-DD, and the time when there is one */
  due?: string
  dueTime?: string
  /** tasks: 1 (normal) to 4 (urgent) */
  priority?: number
  project?: string
  repo?: string
  number?: number
  author?: string
  state?: 'open' | 'draft' | 'merged' | 'closed'
  comments?: number
  labels?: { name: string; color: string }[]
}

export interface FeedResult {
  ok: boolean
  error?: string
  /** when it was fetched */
  at: number
  /** the feed's own name, or the GitHub account */
  title?: string
  events?: FeedEvent[]
  items?: FeedItem[]
  /** mail: unread messages in the inbox */
  unread?: number
}

const pad = (n: number): string => String(n).padStart(2, '0')
export const localDay = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const localTime = (d: Date): string => `${pad(d.getHours())}:${pad(d.getMinutes())}`

/** webcal:// links are plain https. */
export function feedUrl(u: string): string {
  const s = u.trim()
  if (/^webcals?:\/\//i.test(s)) return 'https://' + s.replace(/^webcals?:\/\//i, '')
  if (!/^[a-z]+:/i.test(s) && s) return 'https://' + s
  return s
}

// ---------- calendar (ICS) ----------

/** Windows time zone names Outlook writes, as IANA names. */
const WINDOWS_TZ: Record<string, string> = {
  'UTC': 'UTC', 'GMT Standard Time': 'Europe/London', 'Greenwich Standard Time': 'Atlantic/Reykjavik',
  'W. Europe Standard Time': 'Europe/Berlin', 'Romance Standard Time': 'Europe/Paris', 'Central Europe Standard Time': 'Europe/Budapest',
  'Central European Standard Time': 'Europe/Warsaw', 'E. Europe Standard Time': 'Europe/Chisinau', 'FLE Standard Time': 'Europe/Kiev',
  'GTB Standard Time': 'Europe/Bucharest', 'Russian Standard Time': 'Europe/Moscow', 'Turkey Standard Time': 'Europe/Istanbul',
  'Israel Standard Time': 'Asia/Jerusalem', 'Arabian Standard Time': 'Asia/Dubai', 'India Standard Time': 'Asia/Kolkata',
  'SE Asia Standard Time': 'Asia/Bangkok', 'China Standard Time': 'Asia/Shanghai', 'Singapore Standard Time': 'Asia/Singapore',
  'Tokyo Standard Time': 'Asia/Tokyo', 'Korea Standard Time': 'Asia/Seoul', 'AUS Eastern Standard Time': 'Australia/Sydney',
  'E. Australia Standard Time': 'Australia/Brisbane', 'New Zealand Standard Time': 'Pacific/Auckland',
  'Eastern Standard Time': 'America/New_York', 'Central Standard Time': 'America/Chicago', 'Mountain Standard Time': 'America/Denver',
  'US Mountain Standard Time': 'America/Phoenix', 'Pacific Standard Time': 'America/Los_Angeles', 'Alaskan Standard Time': 'America/Anchorage',
  'Hawaiian Standard Time': 'Pacific/Honolulu', 'Atlantic Standard Time': 'America/Halifax', 'E. South America Standard Time': 'America/Sao_Paulo',
  'Argentina Standard Time': 'America/Buenos_Aires', 'Canada Central Standard Time': 'America/Regina', 'Mexico Standard Time': 'America/Mexico_City',
  'South Africa Standard Time': 'Africa/Johannesburg', 'Egypt Standard Time': 'Africa/Cairo', 'W. Central Africa Standard Time': 'Africa/Lagos'
}

const zoneOk = new Map<string, string | null>()
function zoneName(tz: string | undefined): string | null {
  if (!tz) return null
  if (zoneOk.has(tz)) return zoneOk.get(tz)!
  const clean = tz.replace(/^"|"$/g, '').replace(/^\/[^/]*\/[^/]*\//, '')
  const name = WINDOWS_TZ[clean] ?? clean
  let ok: string | null = null
  try { new Intl.DateTimeFormat('en-US', { timeZone: name }); ok = name } catch { ok = null }
  zoneOk.set(tz, ok)
  return ok
}

/** How far a time zone is ahead of UTC at a moment, in ms. */
function zoneOffset(ms: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(new Date(ms))
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value ?? 0)
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second')) - Math.floor(ms / 1000) * 1000
}

/** A wall-clock time in a calendar: in a time zone, in UTC, or floating (this computer's time). */
interface Wall { y: number; m: number; d: number; h: number; mi: number; s: number; date: boolean; utc: boolean; tz: string | null }

function wallToMs(w: Wall): number {
  if (w.utc) return Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s)
  if (w.tz) {
    const guess = Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s)
    let ms = guess - zoneOffset(guess, w.tz)
    ms = guess - zoneOffset(ms, w.tz)
    return ms
  }
  return new Date(w.y, w.m - 1, w.d, w.h, w.mi, w.s).getTime()
}

function parseWall(value: string, params: Record<string, string>): Wall | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/.exec(value.trim())
  if (!m) return null
  const date = !m[4] || params.VALUE === 'DATE'
  return { y: +m[1], m: +m[2], d: +m[3], h: date ? 0 : +m[4], mi: date ? 0 : +m[5], s: date ? 0 : +(m[6] ?? 0), date, utc: !!m[7], tz: m[7] ? null : zoneName(params.TZID) }
}

function addDaysWall(w: Wall, n: number): Wall {
  const t = new Date(Date.UTC(w.y, w.m - 1, w.d + n))
  return { ...w, y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }
}
const weekday = (w: Wall): number => new Date(Date.UTC(w.y, w.m - 1, w.d)).getUTCDay()
const daysIn = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate()
const wallKey = (w: Wall): string => `${w.y}${pad(w.m)}${pad(w.d)}`
const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

function parseDuration(s: string): number {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(s.trim())
  if (!m) return 0
  const ms = (((+(m[2] ?? 0) * 7 + +(m[3] ?? 0)) * 24 + +(m[4] ?? 0)) * 60 + +(m[5] ?? 0)) * 60000 + +(m[6] ?? 0) * 1000
  return m[1] === '-' ? -ms : ms
}

const unescapeText = (s: string): string => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1')

interface Prop { name: string; params: Record<string, string>; value: string }

function parseLine(line: string): Prop | null {
  let i = 0
  let inQuote = false
  for (; i < line.length; i++) {
    const c = line[i]
    if (c === '"') inQuote = !inQuote
    else if (c === ':' && !inQuote) break
  }
  if (i >= line.length) return null
  const head = line.slice(0, i)
  const value = line.slice(i + 1)
  const [name, ...rest] = head.split(';')
  const params: Record<string, string> = {}
  for (const p of rest) { const eq = p.indexOf('='); if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '') }
  return { name: name.toUpperCase(), params, value }
}

/** Occurrences of a repeating event's start, as wall times, until `endMs`. */
function* repeats(start: Wall, rule: string, endMs: number): Generator<Wall> {
  const r: Record<string, string> = {}
  for (const part of rule.split(';')) { const [k, v] = part.split('='); if (k && v) r[k.toUpperCase()] = v }
  const freq = r.FREQ
  const interval = Math.max(1, Number(r.INTERVAL) || 1)
  const count = r.COUNT ? Number(r.COUNT) : Infinity
  const until = r.UNTIL ? parseWall(r.UNTIL, {}) : null
  const untilMs = until ? (until.date ? wallToMs({ ...until, h: 23, mi: 59, s: 59, utc: false, tz: start.tz }) : wallToMs(until)) : Infinity
  const byDay = (r.BYDAY ?? '').split(',').filter(Boolean).map((x) => { const m = /^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(x.toUpperCase()); return m ? { n: m[1] ? Number(m[1]) : 0, wd: DAY_CODES.indexOf(m[2]) } : null }).filter((x): x is { n: number; wd: number } => !!x)
  const byMonthDay = (r.BYMONTHDAY ?? '').split(',').filter(Boolean).map(Number).filter((n) => n)
  const byMonth = (r.BYMONTH ?? '').split(',').filter(Boolean).map(Number).filter((n) => n)
  const startKey = wallKey(start)
  let n = 0
  let guard = 0
  const emit = function* (w: Wall): Generator<Wall, boolean> {
    if (wallKey(w) < startKey) return true
    const ms = wallToMs(w)
    if (ms > untilMs || ms > endMs || n >= count) return false
    n++
    yield w
    return true
  }
  if (freq === 'DAILY') {
    for (let w = start; guard++ < 20000; w = addDaysWall(w, interval)) {
      if (byDay.length && !byDay.some((b) => b.wd === weekday(w))) continue
      if (byMonth.length && !byMonth.includes(w.m)) continue
      if (!(yield* emit(w))) return
    }
  } else if (freq === 'WEEKLY') {
    const days = byDay.length ? byDay.map((b) => b.wd) : [weekday(start)]
    const weekStart = DAY_CODES.indexOf((r.WKST ?? 'MO').toUpperCase())
    let week = addDaysWall(start, -((weekday(start) - weekStart + 7) % 7))
    for (; guard++ < 5000; week = addDaysWall(week, 7 * interval)) {
      const list = days.map((wd) => addDaysWall(week, (wd - weekStart + 7) % 7)).sort((a, b) => wallKey(a).localeCompare(wallKey(b)))
      for (const w of list) if (!(yield* emit(w))) return
    }
  } else if (freq === 'MONTHLY' || freq === 'YEARLY') {
    const step = freq === 'MONTHLY' ? interval : interval * 12
    for (let k = 0; guard++ < 3000; k += step) {
      const t = new Date(Date.UTC(start.y, start.m - 1 + k, 1))
      const y = t.getUTCFullYear()
      const m = t.getUTCMonth() + 1
      if (freq === 'YEARLY' && byMonth.length) {
        // Rare; treat as the start's month only.
      }
      const max = daysIn(y, m)
      let dates: number[] = []
      if (byDay.length && (freq === 'MONTHLY' || byMonth.length)) {
        for (const b of byDay) {
          const all: number[] = []
          for (let d = 1; d <= max; d++) if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === b.wd) all.push(d)
          if (b.n > 0 && all[b.n - 1]) dates.push(all[b.n - 1])
          else if (b.n < 0 && all[all.length + b.n]) dates.push(all[all.length + b.n])
          else if (b.n === 0) dates.push(...all)
        }
      } else if (byMonthDay.length) {
        dates = byMonthDay.map((d) => (d < 0 ? max + d + 1 : d)).filter((d) => d >= 1 && d <= max)
      } else if (start.d <= max) dates = [start.d]
      if (freq === 'YEARLY' && m !== start.m && !byMonth.length) continue
      for (const d of [...new Set(dates)].sort((a, b) => a - b)) if (!(yield* emit({ ...start, y, m, d }))) return
    }
  } else {
    yield start
  }
}

/** Events of an ICS calendar between two moments, repeating events expanded. */
export function parseIcs(text: string, fromMs: number, toMs: number): { title?: string; events: FeedEvent[] } {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n')
  let title: string | undefined
  const raw: Prop[][] = []
  let cur: Prop[] | null = null
  let depth = 0
  for (const line of lines) {
    if (!line) continue
    if (line === 'BEGIN:VEVENT') { cur = []; depth = 0; continue }
    if (line === 'END:VEVENT') { if (cur) raw.push(cur); cur = null; continue }
    if (cur) {
      if (line.startsWith('BEGIN:')) depth++
      else if (line.startsWith('END:')) depth--
      else if (depth === 0) { const p = parseLine(line); if (p) cur.push(p) }
      continue
    }
    if (line.startsWith('X-WR-CALNAME')) { const p = parseLine(line); if (p) title = unescapeText(p.value) }
  }
  // Single changed occurrences of a repeating event replace that occurrence.
  const moved = new Map<string, Set<number>>()
  for (const props of raw) {
    const rid = props.find((p) => p.name === 'RECURRENCE-ID')
    const uid = props.find((p) => p.name === 'UID')?.value
    if (rid && uid) { const w = parseWall(rid.value, rid.params); if (w) { if (!moved.has(uid)) moved.set(uid, new Set()); moved.get(uid)!.add(wallToMs(w)) } }
  }
  const events: FeedEvent[] = []
  for (const props of raw) {
    const get = (n: string): Prop | undefined => props.find((p) => p.name === n)
    if ((get('STATUS')?.value ?? '').toUpperCase() === 'CANCELLED') continue
    const ds = get('DTSTART')
    if (!ds) continue
    const start = parseWall(ds.value, ds.params)
    if (!start) continue
    const de = get('DTEND')
    const endWall = de ? parseWall(de.value, de.params) : null
    const startMs0 = wallToMs(start)
    let length = endWall ? wallToMs(endWall) - startMs0 : get('DURATION') ? parseDuration(get('DURATION')!.value) : start.date ? 86400000 : 0
    if (length < 0) length = 0
    const uid = get('UID')?.value ?? ''
    const summary = unescapeText(get('SUMMARY')?.value ?? '').trim() || 'Busy'
    const location = unescapeText(get('LOCATION')?.value ?? '').trim() || undefined
    const url = get('URL')?.value?.trim() || undefined
    const skip = new Set<number>()
    for (const p of props) if (p.name === 'EXDATE') for (const v of p.value.split(',')) { const w = parseWall(v, p.params.TZID ? p.params : { ...p.params, TZID: ds.params.TZID ?? '' }); if (w) skip.add(start.date ? wallToMs({ ...w, h: 0, mi: 0, s: 0, utc: false, tz: null }) : wallToMs(w)) }
    const rule = get('RRULE')?.value
    const isOverride = !!get('RECURRENCE-ID')
    const occ = rule && !isOverride ? repeats(start, rule, toMs) : [start]
    let guard = 0
    for (const w of occ) {
      if (guard++ > 2000) break
      const ms = start.date ? new Date(w.y, w.m - 1, w.d).getTime() : wallToMs(w)
      if (rule && !isOverride) {
        if (skip.has(ms)) continue
        if (moved.get(uid)?.has(wallToMs(w))) continue
      }
      const endMs = ms + length
      if (endMs < fromMs || ms > toMs) continue
      if (start.date) {
        const s = new Date(w.y, w.m - 1, w.d)
        const days = Math.max(1, Math.round(length / 86400000))
        const last = new Date(w.y, w.m - 1, w.d + days - 1)
        events.push({ id: `${uid}@${localDay(s)}`, title: summary, start: localDay(s), ...(days > 1 ? { end: localDay(last) } : {}), allDay: true, location, url, at: s.getTime() })
      } else {
        const s = new Date(ms)
        const e = new Date(endMs)
        const endDay = localDay(new Date(endMs - 1))
        events.push({ id: `${uid}@${ms}`, title: summary, start: localDay(s), time: localTime(s), ...(endDay !== localDay(s) ? { end: endDay } : {}), ...(length ? { endTime: localTime(e) } : {}), allDay: false, location, url, at: ms })
      }
    }
  }
  events.sort((a, b) => a.at - b.at || Number(b.allDay) - Number(a.allDay))
  return { title, events }
}

// ---------- RSS and Atom ----------

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', copy: '©', reg: '®', trade: '™', bull: '•', middot: '·' }
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

const cdata = (s: string): string => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
const stripHtml = (s0: string): string => { const s = /&lt;/.test(s0) ? decodeEntities(s0) : s0; return decodeEntities(s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>/gi, ' ').replace(/<\/(p|div|li|h\d)>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim() }

function tag(block: string, name: string): string | undefined {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i')
  const m = re.exec(block)
  return m ? cdata(m[1]) : undefined
}

/** Items of an RSS, RSS 1.0 or Atom feed, newest first. */
export function parseFeed(xml: string): { title?: string; items: FeedItem[] } {
  const atom = /<feed[\s>]/i.test(xml) && /<entry[\s>]/i.test(xml)
  const parts = xml.split(atom ? /<entry[\s>]/i : /<item[\s>]/i)
  const head = parts[0]
  const ft = tag(head, 'title')
  const items: FeedItem[] = []
  for (const block0 of parts.slice(1)) {
    const block = block0.split(atom ? /<\/entry>/i : /<\/item>/i)[0]
    const title = stripHtml(tag(block, 'title') ?? '') || 'Untitled'
    let url = ''
    if (atom) {
      const links = [...block.matchAll(/<link\b([^>]*)\/?>/gi)].map((m) => m[1])
      const alt = links.find((a) => /rel=["']alternate["']/i.test(a)) ?? links.find((a) => !/rel=/i.test(a)) ?? links[0]
      url = decodeEntities(/href=["']([^"']+)["']/i.exec(alt ?? '')?.[1] ?? '')
    } else {
      url = decodeEntities((tag(block, 'link') ?? '').trim())
      if (!url) { const g = tag(block, 'guid'); if (g && /^https?:/i.test(g.trim())) url = g.trim() }
    }
    const when = tag(block, 'pubDate') ?? tag(block, 'dc:date') ?? tag(block, 'published') ?? tag(block, 'updated')
    const date = when ? Date.parse(when.trim()) : NaN
    const body = tag(block, 'description') ?? tag(block, 'summary') ?? tag(block, 'content') ?? tag(block, 'content:encoded') ?? ''
    const summary = stripHtml(body).slice(0, 280) || undefined
    const id = (tag(block, 'guid') ?? tag(block, 'id') ?? url ?? title).trim()
    const author = stripHtml(tag(block, 'dc:creator') ?? tag(tag(block, 'author') ?? '', 'name') ?? tag(block, 'author') ?? '') || undefined
    items.push({ id, title, url, ...(Number.isFinite(date) ? { date } : {}), summary, kind: 'post', author })
  }
  if (items.some((i) => i.date)) items.sort((a, b) => (b.date ?? 0) - (a.date ?? 0))
  return { title: ft ? stripHtml(ft) : undefined, items }
}

// ---------- GitHub ----------

/** GitHub's issues API (pull requests included) as feed items. */
export function githubItems(list: any[], repo?: string): FeedItem[] {
  return (Array.isArray(list) ? list : []).map((x) => {
    const pr = !!x.pull_request
    const r = repo ?? String(x.repository_url ?? '').replace(/^.*\/repos\//, '')
    const state: FeedItem['state'] = pr && x.pull_request?.merged_at ? 'merged' : x.state === 'closed' ? 'closed' : pr && x.draft ? 'draft' : 'open'
    return {
      id: String(x.id), title: String(x.title ?? ''), url: String(x.html_url ?? ''), date: Date.parse(x.updated_at ?? x.created_at) || undefined,
      kind: pr ? 'pr' : 'issue', repo: r, number: Number(x.number) || undefined, author: x.user?.login, state,
      comments: Number(x.comments) || 0, labels: Array.isArray(x.labels) ? x.labels.map((l: any) => ({ name: String(l.name ?? ''), color: '#' + String(l.color ?? '8e8e93') })) : []
    } as FeedItem
  })
}

/** "owner/name" from what people paste: a GitHub link, owner/name, or a link to an issue. */
export function repoOf(s: string): string | null {
  const m = /(?:github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/?#].*)?$/i.exec(s.trim())
  return m ? `${m[1]}/${m[2]}` : null
}

// ---------- mail ----------

export const MAIL_PRESETS: { id: string; name: string; host: string; port: number; web: string; passwordUrl?: string }[] = [
  { id: 'gmail', name: 'Gmail', host: 'imap.gmail.com', port: 993, web: 'https://mail.google.com/mail/u/0/#inbox', passwordUrl: 'https://myaccount.google.com/apppasswords' },
  { id: 'icloud', name: 'iCloud', host: 'imap.mail.me.com', port: 993, web: 'https://www.icloud.com/mail', passwordUrl: 'https://account.apple.com/account/manage' },
  { id: 'yahoo', name: 'Yahoo', host: 'imap.mail.yahoo.com', port: 993, web: 'https://mail.yahoo.com', passwordUrl: 'https://login.yahoo.com/account/security' },
  { id: 'fastmail', name: 'Fastmail', host: 'imap.fastmail.com', port: 993, web: 'https://app.fastmail.com', passwordUrl: 'https://app.fastmail.com/settings/security/apps' },
  { id: 'other', name: 'Other', host: '', port: 993, web: '' }
]
export const mailPreset = (id: string | undefined): (typeof MAIL_PRESETS)[number] => MAIL_PRESETS.find((p) => p.id === id) ?? MAIL_PRESETS[MAIL_PRESETS.length - 1]

// ---------- Todoist ----------

/** Todoist tasks (API v1 or REST v2) as feed items, with project names. */
export function todoistItems(tasks: any[], projects: Record<string, string>): FeedItem[] {
  return (Array.isArray(tasks) ? tasks : []).filter((t) => t && !t.checked && !t.is_completed).map((t) => {
    const dt: string | undefined = t.due?.datetime ?? undefined
    const d: string | undefined = t.due?.date ?? undefined
    return {
      id: String(t.id), title: String(t.content ?? ''), url: `https://app.todoist.com/app/task/${t.id}`, kind: 'task',
      ...(d ? { due: String(d).slice(0, 10) } : {}), ...(dt && /T\d\d:\d\d/.test(dt) ? { dueTime: localTime(new Date(dt)) } : {}),
      priority: Number(t.priority) || 1, project: projects[String(t.project_id)] ?? undefined,
      date: Date.parse(t.added_at ?? t.created_at) || undefined
    } as FeedItem
  }).sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || (b.priority ?? 1) - (a.priority ?? 1))
}
