import { useEffect, useState, useSyncExternalStore } from 'react'
import { openPage, setSettings, updatePage, useData } from '../store'
import type { Block, Place } from '../types'
import { api, type SysStats } from '../lib/api'
import { DAYS_SHORT, MONTHS_LONG, addDays, parseDay, today, weekStartOf } from '../lib/util'
import { playChime } from '../lib/sound'
import { Checkbox } from './ui'
import { Icon } from './Icon'
import { Marks, findBlock } from './Blocks'
import { plainText } from '../lib/links'

type Cfg = Record<string, any>
type SetConfig = (key: string, value: any) => void

export const pad = (n: number): string => String(n).padStart(2, '0')

export function useTick(ms: number): number {
  const [n, setN] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setN(Date.now()), ms); return () => clearInterval(id) }, [ms])
  return n
}

export function useTimeFormat(): (d: Date) => string {
  const use24h = useData((d) => d.settings.use24h)
  return (d) => (use24h ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : `${d.getHours() % 12 || 12}:${pad(d.getMinutes())}`)
}

// ---------- ring clock ----------
/** Big time with a ring of second ticks that fills up each minute. */
export function RingClock({ cfg }: { cfg: Cfg }): JSX.Element {
  const base = new Date(useTick(1000))
  const now = cfg.tz ? new Date(base.toLocaleString('en-US', { timeZone: cfg.tz })) : base
  const use24h = useData((d) => d.settings.use24h)
  const h = now.getHours()
  const s = now.getSeconds()
  return (
    <div className="pk pk-ringclock">
      <svg className="pk-ring" viewBox="0 0 100 100" aria-hidden>
        {Array.from({ length: 60 }, (_, i) => {
          const a = (i * 6 * Math.PI) / 180
          const r1 = i % 5 ? 43.5 : 41
          return <line key={i} className={i <= s ? 'on' : ''} x1={50 + r1 * Math.sin(a)} y1={50 - r1 * Math.cos(a)} x2={50 + 47.5 * Math.sin(a)} y2={50 - 47.5 * Math.cos(a)} strokeWidth={i % 5 ? 1.1 : 1.9} />
        })}
      </svg>
      <div className="pk-ringclock-mid">
        <div className="pk-ringclock-time">{use24h ? pad(h) : h % 12 || 12}:{pad(now.getMinutes())}</div>
        {cfg.date !== false && (
          <div className="pk-ringclock-date">
            {now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
            {!use24h && <span className="pk-ringclock-ampm">{h < 12 ? 'AM' : 'PM'}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- places ----------
export function usePlace(cfg: Cfg): Place | null {
  const global = useData((d) => d.settings.place)
  const own = cfg.place && Number.isFinite(cfg.place.lat) ? (cfg.place as Place) : null
  return own ?? global
}

/** Search box for a town or city. Picking one sets the place for every panel unless `onPick` says otherwise. */
export function PlaceSearch({ onPick, compact }: { onPick?: (p: Place) => void; compact?: boolean }): JSX.Element {
  const [q, setQ] = useState('')
  const [found, setFound] = useState<{ name: string; region: string; country: string; lat: number; lon: number }[]>([])
  const [busy, setBusy] = useState(false)
  const search = async (): Promise<void> => {
    if (!q.trim()) return
    setBusy(true)
    try { setFound(await api.places(q)) } catch { setFound([]) } finally { setBusy(false) }
  }
  const pick = (p: { name: string; lat: number; lon: number }): void => {
    const place = { name: p.name, lat: p.lat, lon: p.lon }
    if (onPick) onPick(place)
    else setSettings((s) => { s.place = place })
    setFound([])
    setQ('')
  }
  return (
    <div className={`pk-place ${compact ? 'compact' : ''}`}>
      <div className="pk-place-row">
        <Icon name="place" size={14} />
        <input className="pk-place-input" placeholder="Town or city" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') search() }} />
        <button className="pk-place-go" onClick={search} disabled={busy}>{busy ? '…' : 'Find'}</button>
      </div>
      {found.length > 0 && (
        <div className="pk-place-list">
          {found.map((p, i) => <button key={i} onClick={() => pick(p)}><span>{p.name}</span><span className="muted">{[p.region, p.country].filter(Boolean).join(', ')}</span></button>)}
        </div>
      )}
    </div>
  )
}

// ---------- sun position (after the NOAA / suncalc formulas) ----------
const RAD = Math.PI / 180
const DAY_MS = 864e5
const J1970 = 2440588
const J2000 = 2451545
const OBLIQ = RAD * 23.4397
const toDays = (d: Date): number => d.valueOf() / DAY_MS - 0.5 + J1970 - J2000
const fromJulian = (j: number): Date => new Date((j + 0.5 - J1970) * DAY_MS)
const meanAnomaly = (d: number): number => RAD * (357.5291 + 0.98560028 * d)
const eclipticLon = (m: number): number => m + RAD * (1.9148 * Math.sin(m) + 0.02 * Math.sin(2 * m) + 0.0003 * Math.sin(3 * m)) + RAD * 102.9372 + Math.PI
const declination = (l: number): number => Math.asin(Math.sin(OBLIQ) * Math.sin(l))
const rightAscension = (l: number): number => Math.atan2(Math.sin(l) * Math.cos(OBLIQ), Math.cos(l))

export function sunAltitude(date: Date, lat: number, lon: number): number {
  const d = toDays(date)
  const l = eclipticLon(meanAnomaly(d))
  const h = RAD * (280.16 + 360.9856235 * d) - RAD * -lon - rightAscension(l)
  const phi = RAD * lat
  const dec = declination(l)
  return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(h))
}

export function sunTimes(date: Date, lat: number, lon: number): { rise: Date | null; set: Date | null; noon: Date } {
  const lw = RAD * -lon
  const phi = RAD * lat
  const d = toDays(date)
  const n = Math.round(d - 0.0009 - lw / (2 * Math.PI))
  const ds = 0.0009 + lw / (2 * Math.PI) + n
  const m = meanAnomaly(ds)
  const l = eclipticLon(m)
  const dec = declination(l)
  const noonJ = J2000 + ds + 0.0053 * Math.sin(m) - 0.0069 * Math.sin(2 * l)
  const cosH = (Math.sin(-0.833 * RAD) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec))
  if (cosH < -1 || cosH > 1) return { rise: null, set: null, noon: fromJulian(noonJ) }
  const w = Math.acos(cosH)
  const setJ = J2000 + (0.0009 + (w + lw) / (2 * Math.PI) + n) + 0.0053 * Math.sin(m) - 0.0069 * Math.sin(2 * l)
  return { rise: fromJulian(noonJ - (setJ - noonJ)), set: fromJulian(setJ), noon: fromJulian(noonJ) }
}

export function PlacePrompt({ setConfig }: { setConfig?: SetConfig }): JSX.Element {
  void setConfig
  return <div className="pk pk-empty"><PlaceSearch compact /></div>
}

// ---------- daylight ----------
/** The sun's path today: a curve over the horizon, the sun where it is now, and the next sunrise or sunset. */
export function DaylightWidget({ cfg }: { cfg: Cfg }): JSX.Element {
  const place = usePlace(cfg)
  const now = new Date(useTick(60_000))
  const fmt = useTimeFormat()
  if (!place) return <PlacePrompt />
  const t = sunTimes(now, place.lat, place.lon)
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const alts = Array.from({ length: 97 }, (_, i) => sunAltitude(new Date(start.getTime() + i * 15 * 60_000), place.lat, place.lon))
  // Day and night are scaled apart so the curve fills the panel in winter and summer alike.
  const up = Math.max(...alts, 0.05)
  const down = Math.max(...alts.map((a) => -a), 0.05)
  const HZ = 62
  const y = (a: number): number => (a >= 0 ? HZ - (a / up) * (HZ - 12) : HZ + (-a / down) * (94 - HZ))
  const path = alts.map((a, i) => `${i ? 'L' : 'M'}${((i / 96) * 100).toFixed(2)},${y(a).toFixed(2)}`).join(' ')
  const frac = (now.getTime() - start.getTime()) / DAY_MS
  const nowAlt = sunAltitude(now, place.lat, place.lon)
  const tomorrow = sunTimes(new Date(now.getTime() + DAY_MS), place.lat, place.lon)
  let next: { at: Date | null; up: boolean }
  let other: Date | null
  if (t.rise && now < t.rise) { next = { at: t.rise, up: true }; other = t.set }
  else if (t.set && now < t.set) { next = { at: t.set, up: false }; other = t.rise }
  else { next = { at: tomorrow.rise, up: true }; other = t.set }
  return (
    <div className="pk pk-daylight">
      <svg className="pk-day-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <defs><clipPath id="pk-above"><rect x="0" y="0" width="100" height={HZ} /></clipPath></defs>
        <path d={path} className="pk-day-curve" vectorEffect="non-scaling-stroke" />
        <path d={path} className="pk-day-curve day" clipPath="url(#pk-above)" vectorEffect="non-scaling-stroke" />
        <line x1="0" x2="100" y1={HZ} y2={HZ} className="pk-day-horizon" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className={`pk-sun ${nowAlt < 0 ? 'night' : ''}`} style={{ left: `${frac * 100}%`, top: `${y(nowAlt)}%` }} />
      <div className="pk-day-next">{next.at ? fmt(next.at) : '—'}<Icon name={next.up ? 'arrowUp' : 'arrowDown'} size={14} /></div>
      {cfg.other !== false && other && <div className="pk-day-other">{fmt(other)}</div>}
      {cfg.showPlace && <div className="pk-day-place">{place.name}</div>}
    </div>
  )
}

// ---------- weather ----------
interface WeatherData { current: any; daily: any }
interface WeatherEntry { data: WeatherData | null; at: number; busy: boolean; error: boolean }
const weatherCache = new Map<string, WeatherEntry>()
const weatherSubs = new Set<() => void>()
const emitWeather = (): void => { for (const f of weatherSubs) f() }
const subscribeWeather = (cb: () => void): (() => void) => { weatherSubs.add(cb); return () => { weatherSubs.delete(cb) } }

async function loadWeather(key: string, p: Place, f: boolean): Promise<void> {
  const cur = weatherCache.get(key)
  if (cur?.busy) return
  weatherCache.set(key, { data: cur?.data ?? null, at: cur?.at ?? 0, busy: true, error: false })
  emitWeather()
  try {
    const data = await api.weather(p.lat, p.lon, f)
    weatherCache.set(key, { data, at: Date.now(), busy: false, error: false })
  } catch {
    weatherCache.set(key, { data: cur?.data ?? null, at: Date.now() - 25 * 60_000, busy: false, error: true })
  }
  emitWeather()
}

export function useWeather(p: Place | null, f: boolean): WeatherEntry | null {
  const key = p ? `${p.lat.toFixed(2)},${p.lon.toFixed(2)},${f ? 'f' : 'c'}` : ''
  const tick = useTick(60_000)
  const entry = useSyncExternalStore(subscribeWeather, () => (key ? weatherCache.get(key) ?? null : null))
  useEffect(() => {
    if (!p) return
    const e = weatherCache.get(key)
    if (!e || (!e.busy && Date.now() - e.at > 30 * 60_000)) loadWeather(key, p, f)
  }, [key, tick])
  return entry
}

const WMO: Record<number, [string, string, string]> = {
  0: ['Clear', 'sun', 'moon'], 1: ['Mostly clear', 'sun', 'moon'], 2: ['Partly cloudy', 'cloudSun', 'cloudMoon'], 3: ['Overcast', 'cloudy', 'cloudy'],
  45: ['Fog', 'cloudFog', 'cloudFog'], 48: ['Freezing fog', 'cloudFog', 'cloudFog'],
  51: ['Light drizzle', 'cloudDrizzle', 'cloudDrizzle'], 53: ['Drizzle', 'cloudDrizzle', 'cloudDrizzle'], 55: ['Heavy drizzle', 'cloudDrizzle', 'cloudDrizzle'],
  56: ['Freezing drizzle', 'cloudDrizzle', 'cloudDrizzle'], 57: ['Freezing drizzle', 'cloudDrizzle', 'cloudDrizzle'],
  61: ['Light rain', 'cloudRain', 'cloudRain'], 63: ['Rain', 'cloudRain', 'cloudRain'], 65: ['Heavy rain', 'cloudRain', 'cloudRain'],
  66: ['Freezing rain', 'cloudRain', 'cloudRain'], 67: ['Freezing rain', 'cloudRain', 'cloudRain'],
  71: ['Light snow', 'cloudSnow', 'cloudSnow'], 73: ['Snow', 'cloudSnow', 'cloudSnow'], 75: ['Heavy snow', 'cloudSnow', 'cloudSnow'], 77: ['Snow grains', 'cloudSnow', 'cloudSnow'],
  80: ['Showers', 'cloudRain', 'cloudRain'], 81: ['Showers', 'cloudRain', 'cloudRain'], 82: ['Heavy showers', 'cloudRain', 'cloudRain'],
  85: ['Snow showers', 'cloudSnow', 'cloudSnow'], 86: ['Snow showers', 'cloudSnow', 'cloudSnow'],
  95: ['Thunderstorm', 'cloudLightning', 'cloudLightning'], 96: ['Thunder and hail', 'cloudHail', 'cloudHail'], 99: ['Thunder and hail', 'cloudHail', 'cloudHail']
}
export const wmo = (code: number, day = true): { label: string; icon: string } => {
  const w = WMO[code] ?? ['', 'cloud', 'cloud']
  return { label: w[0], icon: day ? w[1] : w[2] }
}
export const deg = (n: unknown): string => (typeof n === 'number' ? `${Math.round(n)}°` : '–')

export function WeatherWidget({ cfg }: { cfg: Cfg }): JSX.Element {
  const place = usePlace(cfg)
  const fahrenheit = useData((d) => d.settings.fahrenheit)
  const w = useWeather(place, fahrenheit)
  if (!place) return <PlacePrompt />
  const data = w?.data
  if (!data) return <div className="pk pk-empty"><span className="muted small">{w?.error ? 'Weather is not available right now.' : 'Loading the weather…'}</span></div>
  const c = data.current ?? {}
  const dl = data.daily ?? {}
  const now = wmo(c.weather_code, c.is_day !== 0)
  const days = Math.max(0, Math.min(6, Number(cfg.days ?? 4)))
  const rows = (dl.time ?? []).slice(0, days + 1).map((k: string, i: number) => ({
    label: i === 0 ? 'Today' : DAYS_SHORT[parseDay(k).getDay()],
    icon: wmo(dl.weather_code?.[i]).icon,
    lo: dl.temperature_2m_min?.[i],
    hi: dl.temperature_2m_max?.[i],
    rain: dl.precipitation_probability_max?.[i]
  }))
  return (
    <div className="pk pk-weather">
      <div className="pk-w-now">
        <div className="pk-w-place">{place.name}</div>
        <div className="pk-w-temp">{deg(c.temperature_2m)}</div>
        <div className="pk-w-cond"><Icon name={now.icon} size={16} />{now.label}</div>
        <div className="pk-w-hl">H:{deg(dl.temperature_2m_max?.[0])} L:{deg(dl.temperature_2m_min?.[0])}</div>
      </div>
      {rows.length > 0 && (
        <div className="pk-w-days">
          {rows.map((r: any, i: number) => (
            <div key={i} className="pk-w-day">
              <span className="pk-w-dname">{r.label}</span>
              <Icon name={r.icon} size={18} />
              {cfg.rain && <span className="pk-w-rain">{typeof r.rain === 'number' && r.rain >= 20 ? r.rain + '%' : ''}</span>}
              <span className="pk-w-range">{deg(r.lo)} / {deg(r.hi)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------- system ----------
let sysLast: SysStats | null = null
const sysSubs = new Set<() => void>()
let sysTimer: ReturnType<typeof setInterval> | null = null
let sysDrive = ''
/** The last two minutes of samples, for the graph style. */
export const sysHistory: SysStats[] = []
async function pollSys(): Promise<void> {
  try {
    sysLast = await api.sysStats(sysDrive || undefined)
    sysHistory.push(sysLast)
    if (sysHistory.length > 60) sysHistory.shift()
  } catch { /* keep the last numbers */ }
  for (const f of sysSubs) f()
}
// One shared poll for every System panel; it stops when the last one closes.
function subscribeSys(cb: () => void): () => void {
  sysSubs.add(cb)
  if (!sysTimer) { pollSys(); sysTimer = setInterval(pollSys, 2000) }
  return () => {
    sysSubs.delete(cb)
    if (!sysSubs.size && sysTimer) { clearInterval(sysTimer); sysTimer = null }
  }
}
export function useSys(drive: string): SysStats | null {
  useEffect(() => { sysDrive = drive }, [drive])
  return useSyncExternalStore(subscribeSys, () => sysLast)
}

export const GB = (n: number): string => (n / 1024 ** 3).toFixed(n > 100 * 1024 ** 3 ? 0 : 1)

export function SystemWidget({ cfg }: { cfg: Cfg }): JSX.Element {
  const s = useSys(cfg.drive ?? '')
  const meters = [
    cfg.cpu !== false && { id: 'cpu', label: 'CPU', value: s?.cpu ?? 0, sub: '' },
    cfg.ram !== false && { id: 'ram', label: 'RAM', value: s?.ram ?? 0, sub: s ? `${GB(s.ramUsed)} / ${GB(s.ramTotal)} GB` : '' },
    cfg.disk !== false && { id: 'disk', label: cfg.diskLabel || 'SSD', value: s?.disk ?? 0, sub: s ? `${GB(s.diskFree)} GB free` : '' }
  ].filter(Boolean) as { id: string; label: string; value: number; sub: string }[]
  const bars = cfg.look === 'bars'
  return (
    <div className={`pk pk-system ${bars ? 'bars' : ''}`}>
      {!bars && (
        <svg className="pk-sys-rings" viewBox="0 0 100 100" aria-hidden>
          {meters.map((m, i) => {
            const r = 44 - i * 12
            return (
              <g key={m.id} className={`m${i}`}>
                <circle cx="50" cy="50" r={r} className="track" />
                <circle cx="50" cy="50" r={r} className="arc" pathLength={100} strokeDasharray={`${m.value} 100`} transform="rotate(-90 50 50)" />
              </g>
            )
          })}
        </svg>
      )}
      <div className="pk-sys-list">
        {meters.map((m, i) => (
          <div key={m.id} className={`pk-sys-row m${i}`}>
            <span className="pk-sys-label"><span className="pk-sys-key">{m.label}</span> <span className="pk-sys-val">{m.value}%</span></span>
            {bars && <span className="pk-sys-bar"><span style={{ width: m.value + '%' }} /></span>}
            {cfg.details && m.sub && <span className="pk-sys-sub">{m.sub}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- timer ----------
/** One timer you start with a click. Several timer panels sit side by side, each its own window. */
export function TimerWidget({ cfg, setConfig }: { cfg: Cfg; setConfig: SetConfig }): JSX.Element {
  const now = useTick(500)
  const minutes = Math.max(1, Number(cfg.minutes) || 5)
  const total = minutes * 60_000
  const running = typeof cfg.endsAt === 'number' && cfg.endsAt > now
  const finished = typeof cfg.endsAt === 'number' && cfg.endsAt <= now
  const paused = !running && !finished && typeof cfg.left === 'number'
  const left = running ? cfg.endsAt - now : paused ? cfg.left : finished ? 0 : total
  useEffect(() => {
    if (!running) return
    const ms = cfg.endsAt - Date.now()
    const id = setTimeout(() => {
      playChime()
      api.notify(cfg.label || `${minutes} min timer`, 'Time is up.')
    }, Math.max(0, ms))
    return () => clearTimeout(id)
  }, [cfg.endsAt, running])
  const click = (): void => {
    if (running) { setConfig('left', cfg.endsAt - Date.now()); setConfig('endsAt', null) }
    else if (paused) { setConfig('endsAt', Date.now() + cfg.left); setConfig('left', null) }
    else if (finished) { setConfig('endsAt', null); setConfig('left', null) }
    else { setConfig('endsAt', Date.now() + total); setConfig('left', null) }
  }
  const secs = Math.ceil(left / 1000)
  const active = running || paused || finished
  const frac = active ? 1 - left / total : 0
  const state = `${running ? 'running' : ''} ${paused ? 'paused' : ''} ${finished ? 'done' : ''}`
  const tip = running ? 'Pause' : paused ? 'Resume' : finished ? 'Reset' : 'Start'
  const text = active ? (finished ? 'Done' : `${Math.floor(secs / 60)}:${pad(secs % 60)}`) : `${minutes} min`
  if (cfg.look === 'bar' || cfg.look === 'minimal') {
    return (
      <button className={`pk pk-timer-${cfg.look} ${state}`} onClick={click} title={tip}>
        <span className="pk-tb-top"><span className="pk-tb-time">{text}</span>{cfg.label && <span className="pk-timer-label">{cfg.label}</span>}</span>
        {cfg.look === 'bar' && <span className="pk-tb-track"><span style={{ width: `${frac * 100}%` }} /></span>}
      </button>
    )
  }
  return (
    <button className={`pk pk-timer ${state}`} onClick={click} title={tip}>
      <svg className="pk-timer-dial" viewBox="0 0 100 100" aria-hidden>
        {Array.from({ length: 60 }, (_, i) => {
          const a = (i * 6 * Math.PI) / 180
          const r1 = i % 5 ? 42 : 39
          return <line key={i} className={active && i / 60 < frac ? 'on' : ''} x1={50 + r1 * Math.sin(a)} y1={50 - r1 * Math.cos(a)} x2={50 + 46 * Math.sin(a)} y2={50 - 46 * Math.cos(a)} strokeWidth={i % 5 ? 1 : 1.8} />
        })}
      </svg>
      <span className="pk-timer-mid">
        {active
          ? <span className="pk-timer-left">{finished ? 'Done' : `${Math.floor(secs / 60)}:${pad(secs % 60)}`}</span>
          : <><span className="pk-timer-num">{minutes}</span><span className="pk-timer-unit">min</span></>}
        {cfg.label && <span className="pk-timer-label">{cfg.label}</span>}
      </span>
    </button>
  )
}

// ---------- sections: progress per toggle or heading ----------
const setBlock = (pageId: string, blockId: string, fn: (b: Block) => void): void =>
  updatePage(pageId, (p) => { const b = findBlock(p.blocks, blockId); if (b) fn(b) }, 'pkblock:' + blockId)

const level = (b: Block): number => { const m = /^(?:toggle-)?h([123])$/.exec(b.type); return m ? Number(m[1]) : 0 }

/** Splits blocks into groups: toggles at the outermost level, or else headings of the top level used. */
export function groupsOf(blocks: Block[]): { title: string; todos: Block[] }[] {
  const toggles = blocks.filter((b) => b.type === 'toggle' && b.text.trim())
  const heads = blocks.filter((b) => level(b) && b.text.trim())
  const useToggles = toggles.length > 0
  const pool = useToggles ? toggles : heads
  if (!pool.length) return []
  const ind = Math.min(...pool.map((b) => b.indent ?? 0))
  const top = useToggles ? 0 : Math.min(...pool.filter((b) => (b.indent ?? 0) === ind).map(level))
  const isStart = (b: Block): boolean => (useToggles ? b.type === 'toggle' && (b.indent ?? 0) === ind : level(b) === top && (b.indent ?? 0) === ind) && !!b.text.trim()
  const out: { title: string; todos: Block[] }[] = []
  let cur: { title: string; todos: Block[] } | null = null
  for (const b of blocks) {
    if (isStart(b)) { cur = { title: plainText(b.text).trim(), todos: [] }; out.push(cur); continue }
    if (useToggles && cur && (b.indent ?? 0) <= ind) { cur = null; continue }
    if (cur && b.type === 'todo' && b.text.trim()) cur.todos.push(b)
  }
  return out.filter((g) => g.todos.length > 0)
}

export function SectionsWidget({ cfg, blocks, pageId }: { cfg: Cfg; blocks: Block[]; pageId: string }): JSX.Element {
  const [open, setOpen] = useState<string | null>(null)
  const groups = groupsOf(blocks)
  if (!groups.length) return <div className="pk pk-empty"><span className="muted small">No toggles or headings with to-dos here.</span></div>
  const all = groups.flatMap((g) => g.todos)
  const done = all.filter((b) => b.checked).length
  const nextN = Math.max(1, Math.min(8, Number(cfg.next) || 3))
  return (
    <div className="pk-sections w-scroll">
      {cfg.total !== false && <div className="pk-sec-total"><span>{Math.round((done / all.length) * 100)}%</span><span className="muted">{done} of {all.length}</span></div>}
      {groups.map((g) => {
        const d = g.todos.filter((b) => b.checked).length
        const pct = d / g.todos.length
        const isOpen = open === g.title
        return (
          <div key={g.title} className={`pk-sec ${isOpen ? 'open' : ''}`}>
            <button className="pk-sec-head" onClick={() => setOpen(isOpen ? null : g.title)}>
              <span className="pk-sec-name ellipsis">{g.title}</span>
              <span className="pk-sec-count">{d}/{g.todos.length}</span>
              <span className="pk-sec-bar"><span style={{ width: `${Math.round(pct * 100)}%` }} /></span>
            </button>
            {isOpen && (
              <div className="pk-sec-next">
                {g.todos.filter((b) => !b.checked).slice(0, nextN).map((b) => (
                  <label key={b.id} className="mb-todo">
                    <Checkbox checked={false} size={15} onChange={(v) => setBlock(pageId, b.id, (x) => { x.checked = v })} />
                    <span><Marks text={b.text} /></span>
                  </label>
                ))}
                {g.todos.every((b) => b.checked) && <span className="muted small">All done</span>}
                <button className="link small" onClick={() => openPage(pageId)}>Open page</button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------- table from a page ----------
const dayOfMonth = (s: string): number | null => {
  const m = /(\d{1,2})/.exec(s || '')
  const n = m ? Number(m[1]) : NaN
  return n >= 1 && n <= 31 ? n : null
}
/** Days until the next time the month reaches day `n` (the last day in shorter months). */
function daysUntilDayOfMonth(n: number): number {
  const base = new Date()
  base.setHours(12, 0, 0, 0)
  for (let i = 0; i < 62; i++) {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    if (d.getDate() === Math.min(n, last)) return i
  }
  return 99
}
const toNum = (s: string): number => { const n = parseFloat(String(s ?? '').replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : 0 }

export function TableWidget({ cfg, block }: { cfg: Cfg; block: Block | undefined }): JSX.Element {
  if (!block?.rows?.length) return <div className="pk pk-empty"><span className="muted small">Choose a table in the panel settings.</span></div>
  const [head, ...body] = block.rows
  const rows = body.filter((r) => r.some((c) => String(c ?? '').trim()))
  const dayCol = typeof cfg.dayCol === 'number' && cfg.dayCol >= 0 ? cfg.dayCol : -1
  const sumCol = typeof cfg.sumCol === 'number' && cfg.sumCol >= 0 ? cfg.sumCol : -1
  const hide: number[] = Array.isArray(cfg.hide) ? cfg.hide : []
  const cols = head.map((_, i) => i).filter((i) => !hide.includes(i))
  const sorted = dayCol >= 0 ? [...rows].sort((a, b) => (dayOfMonth(a[dayCol]) ? daysUntilDayOfMonth(dayOfMonth(a[dayCol])!) : 99) - (dayOfMonth(b[dayCol]) ? daysUntilDayOfMonth(dayOfMonth(b[dayCol])!) : 99)) : rows
  const sum = sumCol >= 0 ? rows.reduce((a, r) => a + toNum(r[sumCol]), 0) : null
  const prefix = cfg.prefix ?? ''
  return (
    <div className="pk-table">
      {sum !== null && <div className="pk-table-sum"><span>{prefix}{Number.isInteger(sum) ? sum : sum.toFixed(2)}</span><span className="muted">{cfg.sumLabel || 'total'}</span></div>}
      <div className="w-scroll">
        <table>
          <thead><tr>{cols.map((i) => <th key={i}>{head[i]}</th>)}</tr></thead>
          <tbody>
            {sorted.map((r, ri) => (
              <tr key={ri}>
                {cols.map((i) => {
                  const v = String(r[i] ?? '')
                  if (i === dayCol && dayOfMonth(v)) {
                    const n = daysUntilDayOfMonth(dayOfMonth(v)!)
                    return <td key={i}>{v} <span className={`pk-due ${n <= 2 ? 'soon' : ''}`}>{n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`}</span></td>
                  }
                  return <td key={i}>{i === sumCol && v ? prefix + v : v}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------- month with today's list ----------
export function MonthWidget({ cfg }: { cfg: Cfg }): JSX.Element {
  const weekStart = useData((d) => d.settings.weekStart)
  const tasks = useData((d) => d.tasks)
  const pages = useData((d) => d.pages)
  const use24h = useData((d) => d.settings.use24h)
  const t = today()
  const ym = t.slice(0, 7)
  const start = weekStartOf(`${ym}-01`, weekStart)
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i))
  const open = Object.values(tasks).filter((x) => !x.done && !x.archived && x.due && pages[x.pageId] && !pages[x.pageId].deletedAt)
  const due = new Set(open.map((x) => x.due))
  const [y, m] = ym.split('-').map(Number)
  const todays = open.filter((x) => x.due === t).sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'))
  const time = (s?: string | null): string => {
    if (!s) return ''
    if (use24h) return s
    const [h, mm] = s.split(':').map(Number)
    return `${h % 12 || 12}:${pad(mm)}`
  }
  return (
    <div className={`pk pk-month ${cfg.list === false ? '' : 'with-list'}`}>
      {cfg.list !== false && (
        <div className="pk-month-list">
          <div className="pk-month-today">Today</div>
          {todays.length
            ? todays.slice(0, 8).map((x) => <button key={x.id} className="pk-month-item" onClick={() => openPage(x.pageId)}>{x.time && <span className="pk-month-time">{time(x.time)}</span>}<span className="ellipsis">{x.title}</span></button>)
            : <span className="pk-month-none">Nothing due</span>}
        </div>
      )}
      <div className="pk-month-cal">
        {cfg.title !== false && <div className="pk-month-name">{MONTHS_LONG[m - 1]} {cfg.year ? y : ''}</div>}
        <div className="pk-month-grid">
          {Array.from({ length: 7 }, (_, i) => <span key={i} className="pk-month-dow">{DAYS_SHORT[(i + weekStart) % 7].slice(0, 1)}</span>)}
          {days.map((k) => <span key={k} className={`pk-month-day ${k.slice(0, 7) !== ym ? 'other' : ''} ${k === t ? 'today' : ''} ${due.has(k) ? 'due' : ''}`}>{parseDay(k).getDate()}</span>)}
        </div>
      </div>
    </div>
  )
}
