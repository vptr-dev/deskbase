import { type CSSProperties, useEffect, useState } from 'react'
import { getData, toast, useData } from '../store'
import { api } from '../lib/api'
import { DAYS_SHORT, MONTHS_LONG } from '../lib/util'
import { Icon } from './Icon'
import { GB, PlacePrompt, deg, pad, sunAltitude, sunTimes, sysHistory, usePlace, useSys, useTick, useTimeFormat, useWeather, wmo } from './PanelKit'

type Cfg = Record<string, any>
type SetConfig = (key: string, value: any) => void

// ---------- time helpers ----------
export const localZone = (): string => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return 'UTC' }
}
/** A Date whose local fields read as the time in `tz` (for display only). */
export function zoned(d: Date, tz?: string): Date {
  if (!tz) return d
  try { return new Date(d.toLocaleString('en-US', { timeZone: tz })) } catch { return d }
}
export const zoneCity = (tz: string): string => (tz.split('/').pop() ?? tz).replace(/_/g, ' ')
let zoneList: string[] | null = null
export function allZones(): string[] {
  if (zoneList) return zoneList
  try { zoneList = (Intl as any).supportedValuesOf('timeZone') as string[] } catch { zoneList = [] }
  if (!zoneList.length) zoneList = ['UTC', 'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'Australia/Sydney']
  return zoneList
}
function offsetLabel(tz: string, now: Date): string {
  const diff = Math.round((zoned(now, tz).getTime() - now.getTime()) / 900_000) / 4
  if (!diff) return 'Same time'
  const h = Math.trunc(Math.abs(diff))
  const m = Math.round((Math.abs(diff) - h) * 60)
  return `${diff > 0 ? '+' : '−'}${h ? h + 'h' : ''}${m ? ` ${m}m` : ''}`.trim()
}
function dayWord(local: Date, there: Date): string {
  const a = new Date(local.getFullYear(), local.getMonth(), local.getDate()).getTime()
  const b = new Date(there.getFullYear(), there.getMonth(), there.getDate()).getTime()
  return b > a ? 'Tomorrow' : b < a ? 'Yesterday' : 'Today'
}
function use24(cfg: Cfg): boolean {
  const app = useData((d) => d.settings.use24h)
  return cfg.h24 === '24' ? true : cfg.h24 === '12' ? false : app
}
const hm = (d: Date, h24: boolean): string => `${h24 ? pad(d.getHours()) : d.getHours() % 12 || 12}:${pad(d.getMinutes())}`
const dateLine = (d: Date, fmt?: string): string =>
  fmt === 'numeric' ? d.toLocaleDateString() : d.toLocaleDateString(undefined, fmt === 'long' ? { weekday: 'long', day: 'numeric', month: 'long' } : { weekday: 'short', day: 'numeric', month: 'short' })

// ---------- clock styles ----------
const WORDS = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven']
function timeInWords(d: Date): string {
  const m5 = Math.round(d.getMinutes() / 5) * 5
  let h = d.getHours() % 12
  const next = WORDS[(h + 1) % 12]
  if (m5 === 0 || m5 === 60) return `${WORDS[m5 === 60 ? (h + 1) % 12 : h]} o'clock`
  if (m5 === 15) return `quarter past ${WORDS[h]}`
  if (m5 === 30) return `half past ${WORDS[h]}`
  if (m5 === 45) return `quarter to ${next}`
  if (m5 < 30) return `${m5 === 25 ? 'twenty-five' : m5 === 20 ? 'twenty' : m5 === 10 ? 'ten' : 'five'} past ${WORDS[h]}`
  h = (h + 1) % 12
  const left = 60 - m5
  return `${left === 25 ? 'twenty-five' : left === 20 ? 'twenty' : left === 10 ? 'ten' : 'five'} to ${WORDS[h]}`
}

export function AnalogFace({ now, seconds, face = 'classic', date }: { now: Date; seconds: boolean; face?: string; date?: string }): JSX.Element {
  const s = now.getSeconds()
  const m = now.getMinutes() + s / 60
  const h = (now.getHours() % 12) + m / 60
  const P = (deg: number, r: number): [number, number] => [50 + r * Math.sin((deg * Math.PI) / 180), 50 - r * Math.cos((deg * Math.PI) / 180)]
  const hand = (degr: number, len: number, w: number, cls: string, tail = 0): JSX.Element => {
    const [x2, y2] = P(degr, len)
    const [x1, y1] = P(degr + 180, tail)
    return <line className={cls} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={w} strokeLinecap="round" />
  }
  return (
    <svg className={`pk-analog face-${face}`} viewBox="0 0 100 100" aria-hidden>
      <circle cx="50" cy="50" r="47" className="face" />
      {face === 'classic' && Array.from({ length: 60 }, (_, i) => {
        const [x1, y1] = P(i * 6, i % 5 ? 43 : 39.5)
        const [x2, y2] = P(i * 6, 45)
        return <line key={i} className="tick" x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={i % 5 ? 0.7 : 1.8} strokeLinecap="round" />
      })}
      {face === 'dots' && Array.from({ length: 12 }, (_, i) => { const [x, y] = P(i * 30, 41); return <circle key={i} className="dot" cx={x} cy={y} r={i % 3 ? 1.3 : 2.4} /> })}
      {face === 'numerals' && Array.from({ length: 12 }, (_, i) => { const [x, y] = P(i * 30, 38); return <text key={i} className="num" x={x} y={y} textAnchor="middle" dominantBaseline="central">{i || 12}</text> })}
      {face === 'minimal' && [0, 90, 180, 270].map((a) => { const [x1, y1] = P(a, 40); const [x2, y2] = P(a, 46); return <line key={a} className="tick" x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={2} strokeLinecap="round" /> })}
      {date && <text className="date" x="70" y="52" textAnchor="middle">{date}</text>}
      {hand(h * 30, 24, 4.2, 'hand', 4)}
      {hand(m * 6, 35, 2.8, 'hand', 5)}
      {seconds && hand(s * 6, 39, 1.1, 'hand sec', 8)}
      <circle cx="50" cy="50" r="2.4" className="pin" />
    </svg>
  )
}

/** Clock styles beyond digital, stacked and ring: analog faces, bars, words, flip, sun dial and minimal. */
export function ClockStyles({ cfg }: { cfg: Cfg }): JSX.Element {
  const base = new Date(useTick(cfg.seconds || cfg.style === 'bars' ? 1000 : 5000))
  const now = zoned(base, cfg.tz || undefined)
  const h24 = use24(cfg)
  const showDate = cfg.date !== false
  const label = cfg.tz ? cfg.label || zoneCity(cfg.tz) : ''
  const date = showDate ? dateLine(now, cfg.dateFmt) : ''
  switch (cfg.style) {
    case 'analog':
      return (
        <div className={`pk pk-clock-analog ${label ? 'has-label' : ''}`}>
          <AnalogFace now={now} seconds={!!cfg.seconds} face={cfg.face ?? 'classic'} date={showDate ? `${DAYS_SHORT[now.getDay()]} ${now.getDate()}` : undefined} />
          {label && <div className="pk-clock-label">{label}</div>}
        </div>
      )
    case 'bars': {
      const rows = [
        { k: 'H', v: h24 ? now.getHours() / 23 : (now.getHours() % 12 || 12) / 12, t: h24 ? pad(now.getHours()) : String(now.getHours() % 12 || 12) },
        { k: 'M', v: now.getMinutes() / 59, t: pad(now.getMinutes()) },
        ...(cfg.seconds !== false ? [{ k: 'S', v: now.getSeconds() / 59, t: pad(now.getSeconds()) }] : [])
      ]
      return (
        <div className="pk pk-clock-bars">
          {rows.map((r) => (
            <div key={r.k} className="pk-cb-row">
              <span className="pk-cb-num">{r.t}</span>
              <span className="pk-cb-bar"><span style={{ width: `${Math.max(2, r.v * 100)}%` }} /></span>
            </div>
          ))}
          {(date || label) && <div className="pk-clock-foot">{[label, date].filter(Boolean).join(' · ')}</div>}
        </div>
      )
    }
    case 'word':
      return (
        <div className="pk pk-clock-word">
          <div className="pk-cw-text">{cfg.prefix !== false && <span className="pk-cw-pre">it's </span>}{timeInWords(now)}</div>
          {(date || label) && <div className="pk-clock-foot">{[label, date].filter(Boolean).join(' · ')}</div>}
        </div>
      )
    case 'flip': {
      const hh = h24 ? pad(now.getHours()) : pad(now.getHours() % 12 || 12)
      return (
        <div className="pk pk-clock-flip">
          <div className="pk-flip-row">
            <span className="pk-flip-card">{hh}</span>
            <span className="pk-flip-card">{pad(now.getMinutes())}</span>
            {cfg.seconds && <span className="pk-flip-card sec">{pad(now.getSeconds())}</span>}
          </div>
          {(date || label) && <div className="pk-clock-foot">{[label, date].filter(Boolean).join(' · ')}{!h24 && <span className="pk-ampm">{now.getHours() < 12 ? 'AM' : 'PM'}</span>}</div>}
        </div>
      )
    }
    case 'sun': return <SunDial cfg={cfg} now={now} h24={h24} date={date} label={label} />
    default:
      return (
        <div className="pk pk-clock-minimal">
          <div className="pk-cm-time">{hm(now, h24)}{cfg.seconds && <span className="pk-cm-sec">{pad(now.getSeconds())}</span>}</div>
          {(date || label) && <div className="pk-clock-foot">{[label, date].filter(Boolean).join(' · ')}</div>}
        </div>
      )
  }
}

/** A 24-hour dial: daylight as an arc between sunrise and sunset, a hand at the current time. */
function SunDial({ cfg, now, h24, date, label }: { cfg: Cfg; now: Date; h24: boolean; date: string; label: string }): JSX.Element {
  const place = usePlace(cfg)
  const frac = (d: Date): number => (d.getHours() * 60 + d.getMinutes()) / 1440
  const t = place ? sunTimes(now, place.lat, place.lon) : null
  const rise = t?.rise ? frac(t.rise) : 0.25
  const set = t?.set ? frac(t.set) : 0.75
  const P = (f: number, r: number): [number, number] => [50 + r * Math.sin(f * 2 * Math.PI + Math.PI), 50 - r * Math.cos(f * 2 * Math.PI + Math.PI)]
  const arc = (a: number, b: number, r: number): string => {
    const [x1, y1] = P(a, r)
    const [x2, y2] = P(b, r)
    return `M${x1},${y1} A${r},${r} 0 ${(b - a + 1) % 1 > 0.5 ? 1 : 0} 1 ${x2},${y2}`
  }
  const [hx, hy] = P(frac(now), 36)
  return (
    <div className="pk pk-clock-sun">
      <svg viewBox="0 0 100 100" aria-hidden>
        <circle cx="50" cy="50" r="42" className="night" />
        <path d={arc(rise, set, 42)} className="day" />
        {Array.from({ length: 24 }, (_, i) => { const [x1, y1] = P(i / 24, i % 6 ? 46 : 45); const [x2, y2] = P(i / 24, 48); return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="tick" strokeWidth={i % 6 ? 0.6 : 1.4} /> })}
        <line x1="50" y1="50" x2={hx} y2={hy} className="hand" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx={P(frac(now), 42)[0]} cy={P(frac(now), 42)[1]} r="3.2" className={`sun ${frac(now) > rise && frac(now) < set ? '' : 'moon'}`} />
      </svg>
      <div className="pk-sd-mid">
        <div className="pk-sd-time">{hm(now, h24)}</div>
        {(date || label) && <div className="pk-sd-date">{label || date}</div>}
      </div>
    </div>
  )
}

// ---------- world clock ----------
export function WorldClockWidget({ cfg }: { cfg: Cfg }): JSX.Element {
  const base = new Date(useTick(cfg.seconds ? 1000 : 10_000))
  const h24 = use24(cfg)
  const zones: string[] = Array.isArray(cfg.zones) && cfg.zones.length ? cfg.zones : [localZone(), 'America/New_York', 'Asia/Tokyo']
  const style = cfg.style ?? 'list'
  const rows = zones.map((tz) => {
    const there = zoned(base, tz)
    const hr = there.getHours()
    return { tz, there, day: hr >= 7 && hr < 19, name: (cfg.names?.[tz] as string) || zoneCity(tz), sub: [dayWord(base, there), cfg.offset !== false ? offsetLabel(tz, base) : ''].filter(Boolean).join(' · ') }
  })
  return (
    <div className={`pk pk-world ${style}`} style={{ '--n': zones.length } as CSSProperties}>
      {rows.map((r) => style === 'analog' ? (
        <div key={r.tz} className="pk-world-item">
          <AnalogFace now={r.there} seconds={!!cfg.seconds} face={cfg.face ?? 'minimal'} />
          <span className="pk-world-name">{r.name}</span>
          <span className="pk-world-sub">{hm(r.there, h24)}</span>
        </div>
      ) : (
        <div key={r.tz} className="pk-world-item">
          <span className="pk-world-text">
            <span className="pk-world-name">{cfg.daynight !== false && <Icon name={r.day ? 'sun' : 'moon'} size={13} />}{r.name}</span>
            <span className="pk-world-sub">{r.sub}</span>
          </span>
          <span className="pk-world-time">{hm(r.there, h24)}{cfg.seconds && <small>:{pad(r.there.getSeconds())}</small>}</span>
        </div>
      ))}
    </div>
  )
}

// ---------- daylight styles ----------
const dur = (ms: number): string => { const m = Math.round(ms / 60_000); return `${Math.floor(m / 60)}h ${pad(m % 60)}m` }

export function DaylightStyles({ cfg }: { cfg: Cfg }): JSX.Element {
  const place = usePlace(cfg)
  const now = new Date(useTick(60_000))
  const fmt = useTimeFormat()
  if (!place) return <PlacePrompt />
  const t = sunTimes(now, place.lat, place.lon)
  const y = sunTimes(new Date(now.getTime() - 864e5), place.lat, place.lon)
  const len = t.rise && t.set ? t.set.getTime() - t.rise.getTime() : 0
  const prev = y.rise && y.set ? y.set.getTime() - y.rise.getTime() : 0
  const change = Math.round((len - prev) / 60_000)
  const extra = cfg.length !== false && len ? (
    <div className="pk-dl-len">{dur(len)} of daylight{cfg.change !== false && prev ? <span className="muted"> · {change >= 0 ? '+' : '−'}{Math.abs(change)} min</span> : null}</div>
  ) : null
  const placeName = cfg.showPlace ? <div className="pk-dl-place">{place.name}</div> : null
  if (cfg.style === 'times') {
    return (
      <div className="pk pk-dl-times">
        {placeName}
        <div className="pk-dl-pair">
          <div className="pk-dl-t"><Icon name="sunrise" size={20} /><span className="pk-dl-big">{t.rise ? fmt(t.rise) : '—'}</span><span className="pk-dl-k">Sunrise</span></div>
          <div className="pk-dl-t"><Icon name="sunset" size={20} /><span className="pk-dl-big">{t.set ? fmt(t.set) : '—'}</span><span className="pk-dl-k">Sunset</span></div>
        </div>
        {extra}
      </div>
    )
  }
  const f = (d: Date | null): number => (d ? (d.getHours() * 60 + d.getMinutes()) / 1440 : 0)
  const nf = f(now)
  const rf = f(t.rise)
  const sf = f(t.set)
  if (cfg.style === 'bar') {
    return (
      <div className="pk pk-dl-bar">
        {placeName}
        <div className="pk-dl-track">
          <span className="pk-dl-dayseg" style={{ left: `${rf * 100}%`, width: `${Math.max(0, sf - rf) * 100}%` }} />
          <span className="pk-dl-now" style={{ left: `${nf * 100}%` }} />
        </div>
        <div className="pk-dl-scale"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div>
        <div className="pk-dl-rs">
          <span><Icon name="sunrise" size={14} />{t.rise ? fmt(t.rise) : '—'}</span>
          <span><Icon name="sunset" size={14} />{t.set ? fmt(t.set) : '—'}</span>
        </div>
        {extra}
      </div>
    )
  }
  // arc: the sun travels a half circle from sunrise to sunset
  const p = sf > rf ? Math.min(1, Math.max(0, (nf - rf) / (sf - rf))) : 0
  const up = nf > rf && nf < sf
  const ang = Math.PI * (1 - p)
  const sx = 50 + 40 * Math.cos(ang)
  const sy = 52 - 40 * Math.sin(ang)
  const alt = sunAltitude(now, place.lat, place.lon)
  return (
    <div className="pk pk-dl-arc">
      {placeName}
      <svg viewBox="0 0 100 60" aria-hidden>
        <path d="M10,52 A40,40 0 0 1 90,52" className="pk-dl-path" />
        {up && <path d={`M10,52 A40,40 0 0 1 ${sx},${sy}`} className="pk-dl-done" />}
        <line x1="4" x2="96" y1="52" y2="52" className="pk-dl-hz" />
        {up ? <circle cx={sx} cy={sy} r="4" className="pk-dl-sun" /> : <circle cx="50" cy="57" r="2.4" className="pk-dl-sun night" opacity={alt < -0.1 ? 0.6 : 1} />}
      </svg>
      <div className="pk-dl-rs">
        <span><Icon name="sunrise" size={14} />{t.rise ? fmt(t.rise) : '—'}</span>
        <span><Icon name="sunset" size={14} />{t.set ? fmt(t.set) : '—'}</span>
      </div>
      {extra}
    </div>
  )
}

// ---------- weather styles ----------
export function WeatherStyles({ cfg }: { cfg: Cfg }): JSX.Element {
  const place = usePlace(cfg)
  const fahrenheit = useData((d) => d.settings.fahrenheit)
  const w = useWeather(place, fahrenheit)
  const fmt = useTimeFormat()
  if (!place) return <PlacePrompt />
  const data: any = w?.data
  if (!data) return <div className="pk pk-empty"><span className="muted small">{w?.error ? 'Weather is not available right now.' : 'Loading the weather…'}</span></div>
  const c = data.current ?? {}
  const dl = data.daily ?? {}
  const hr = data.hourly ?? {}
  const now = wmo(c.weather_code, c.is_day !== 0)
  const head = (
    <>
      {cfg.showPlace !== false && <div className="pk-w-place">{place.name}</div>}
    </>
  )
  if (cfg.style === 'compact') {
    return (
      <div className="pk pk-wx-compact">
        <Icon name={now.icon} size={36} />
        <div>
          <div className="pk-wx-temp">{deg(c.temperature_2m)}</div>
          {cfg.cond !== false && <div className="pk-wx-cond">{now.label}</div>}
          {cfg.showPlace !== false && <div className="pk-wx-sub">{place.name}</div>}
        </div>
      </div>
    )
  }
  if (cfg.style === 'detailed') {
    const unit = fahrenheit ? 'mph' : 'km/h'
    const facts = [
      { k: 'Feels like', v: deg(c.apparent_temperature), on: cfg.feels !== false },
      { k: 'Humidity', v: typeof c.relative_humidity_2m === 'number' ? `${c.relative_humidity_2m}%` : '–', on: cfg.humidity !== false },
      { k: 'Wind', v: typeof c.wind_speed_10m === 'number' ? `${Math.round(c.wind_speed_10m)} ${unit}` : '–', on: cfg.wind !== false },
      { k: 'Rain', v: typeof dl.precipitation_probability_max?.[0] === 'number' ? `${dl.precipitation_probability_max[0]}%` : '–', on: cfg.rain !== false },
      { k: 'High / low', v: `${deg(dl.temperature_2m_max?.[0])} / ${deg(dl.temperature_2m_min?.[0])}`, on: cfg.hl !== false }
    ].filter((f) => f.on)
    return (
      <div className="pk pk-wx-detail">
        <div className="pk-wx-top">
          <div>{head}<div className="pk-wx-temp">{deg(c.temperature_2m)}</div>{cfg.cond !== false && <div className="pk-wx-cond"><Icon name={now.icon} size={15} />{now.label}</div>}</div>
          <Icon name={now.icon} size={44} className="pk-wx-art" />
        </div>
        <div className="pk-wx-facts">{facts.map((f) => <div key={f.k} className="pk-wx-fact"><span>{f.k}</span><b>{f.v}</b></div>)}</div>
      </div>
    )
  }
  // hourly
  const hours = Math.max(4, Math.min(12, Number(cfg.hours ?? 6)))
  const start = Math.max(0, (hr.time ?? []).findIndex((t: string) => new Date(t).getTime() > Date.now() - 3600e3))
  const items = (hr.time ?? []).slice(start, start + hours).map((t: string, i: number) => ({
    t: i === 0 ? 'Now' : fmt(new Date(t)).replace(/:00$/, ''),
    icon: wmo(hr.weather_code?.[start + i], hr.is_day?.[start + i] !== 0).icon,
    temp: hr.temperature_2m?.[start + i],
    rain: hr.precipitation_probability?.[start + i]
  }))
  return (
    <div className="pk pk-wx-hourly">
      <div className="pk-wx-row">
        <div>{head}<div className="pk-wx-temp sm">{deg(c.temperature_2m)}</div></div>
        {cfg.cond !== false && <div className="pk-wx-cond right"><Icon name={now.icon} size={15} />{now.label}<span className="muted">H:{deg(dl.temperature_2m_max?.[0])} L:{deg(dl.temperature_2m_min?.[0])}</span></div>}
      </div>
      <div className="pk-wx-hours">
        {items.map((h: any, i: number) => (
          <div key={i} className="pk-wx-hour">
            <span className="pk-wx-h">{h.t}</span>
            <Icon name={h.icon} size={18} />
            <span className="pk-wx-ht">{deg(h.temp)}</span>
            {cfg.rain && <span className="pk-wx-hr">{typeof h.rain === 'number' && h.rain >= 20 ? h.rain + '%' : ''}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- system styles ----------
export function SystemStyles({ cfg }: { cfg: Cfg }): JSX.Element {
  const s = useSys(cfg.drive ?? '')
  const meters = [
    cfg.cpu !== false && { id: 'cpu', label: 'CPU', value: s?.cpu ?? 0, sub: '' },
    cfg.ram !== false && { id: 'ram', label: 'RAM', value: s?.ram ?? 0, sub: s ? `${GB(s.ramUsed)} / ${GB(s.ramTotal)} GB` : '' },
    cfg.disk !== false && { id: 'disk', label: cfg.diskLabel || 'SSD', value: s?.disk ?? 0, sub: s ? `${GB(s.diskFree)} GB free` : '' }
  ].filter(Boolean) as { id: string; label: string; value: number; sub: string }[]
  const up = s ? `${Math.floor(s.uptime / 86400) ? Math.floor(s.uptime / 86400) + 'd ' : ''}${Math.floor((s.uptime % 86400) / 3600)}h ${pad(Math.floor((s.uptime % 3600) / 60))}m` : ''
  if (cfg.look === 'graph') {
    const line = (key: 'cpu' | 'ram'): string => {
      const pts = sysHistory.slice(-40)
      if (pts.length < 2) return ''
      return pts.map((p, i) => `${i ? 'L' : 'M'}${((i / (pts.length - 1)) * 100).toFixed(1)},${(38 - (p[key] / 100) * 36).toFixed(1)}`).join(' ')
    }
    return (
      <div className="pk pk-sys-graph">
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden>
          {cfg.ram !== false && <path d={line('ram')} className="ram" vectorEffect="non-scaling-stroke" />}
          {cfg.cpu !== false && <path d={line('cpu')} className="cpu" vectorEffect="non-scaling-stroke" />}
        </svg>
        <div className="pk-sys-legend">
          {meters.map((m, i) => <span key={m.id} className={`m${i}`}><i />{m.label} <b>{m.value}%</b></span>)}
          {cfg.uptime && <span>Up <b>{up}</b></span>}
        </div>
      </div>
    )
  }
  return (
    <div className="pk pk-sys-numbers">
      {meters.map((m) => (
        <div key={m.id} className="pk-sys-num">
          <span className="pk-sys-big">{m.value}<small>%</small></span>
          <span className="pk-sys-k">{m.label}</span>
          {cfg.details && m.sub && <span className="pk-sys-s">{m.sub}</span>}
        </div>
      ))}
      {cfg.uptime && <div className="pk-sys-num"><span className="pk-sys-big sm">{up}</span><span className="pk-sys-k">Uptime</span></div>}
    </div>
  )
}

// ---------- battery ----------
interface Batt { level: number; charging: boolean; time: number }
function useBattery(): Batt | null | undefined {
  const [b, setB] = useState<Batt | null | undefined>(undefined)
  useEffect(() => {
    const nav = navigator as any
    if (!nav.getBattery) { setB(null); return }
    let bat: any
    const read = (): void => setB({ level: bat.level, charging: bat.charging, time: bat.charging ? bat.chargingTime : bat.dischargingTime })
    nav.getBattery().then((x: any) => {
      bat = x
      read()
      for (const ev of ['levelchange', 'chargingchange', 'chargingtimechange', 'dischargingtimechange']) bat.addEventListener(ev, read)
    }).catch(() => setB(null))
    return () => { if (bat) for (const ev of ['levelchange', 'chargingchange', 'chargingtimechange', 'dischargingtimechange']) bat.removeEventListener(ev, read) }
  }, [])
  return b
}
export function BatteryWidget({ cfg }: { cfg: Cfg }): JSX.Element {
  const b = useBattery()
  if (b === undefined) return <div className="pk pk-empty" />
  if (!b) return <div className="pk pk-empty"><span className="muted small">No battery information.</span></div>
  const pct = Math.round(b.level * 100)
  const plugged = b.charging && pct >= 100
  const sub = plugged ? 'Plugged in' : b.charging ? (Number.isFinite(b.time) && b.time > 0 ? `Full in ${dur(b.time * 1000)}` : 'Charging') : Number.isFinite(b.time) && b.time > 0 ? `${dur(b.time * 1000)} left` : 'On battery'
  const low = !b.charging && pct <= 20
  if (cfg.look === 'bar') {
    return (
      <div className={`pk pk-batt-bar ${low ? 'low' : ''}`}>
        <div className="pk-batt-row"><Icon name={b.charging ? 'batteryCharging' : 'battery'} size={18} /><b>{pct}%</b><span className="muted">{sub}</span></div>
        <span className="pk-batt-track"><span style={{ width: pct + '%' }} /></span>
      </div>
    )
  }
  return (
    <div className={`pk pk-batt-ring ${low ? 'low' : ''}`}>
      <svg viewBox="0 0 100 100" aria-hidden>
        <circle cx="50" cy="50" r="42" className="track" />
        <circle cx="50" cy="50" r="42" className="arc" pathLength={100} strokeDasharray={`${pct} 100`} transform="rotate(-90 50 50)" />
      </svg>
      <div className="pk-batt-mid"><Icon name={b.charging ? 'batteryCharging' : 'battery'} size={16} /><b>{pct}%</b>{cfg.details !== false && <span>{sub}</span>}</div>
    </div>
  )
}

// ---------- stopwatch ----------
const swText = (ms: number, cs: boolean): string => {
  const t = Math.max(0, ms)
  const h = Math.floor(t / 3600e3)
  const m = Math.floor((t % 3600e3) / 60e3)
  const s = Math.floor((t % 60e3) / 1000)
  return `${h ? h + ':' + pad(m) : m}:${pad(s)}${cs ? '.' + pad(Math.floor((t % 1000) / 10)) : ''}`
}
export function StopwatchWidget({ cfg, setConfig }: { cfg: Cfg; setConfig: SetConfig }): JSX.Element {
  const running = typeof cfg.startedAt === 'number'
  const now = useTick(running ? 50 : 1000)
  const elapsed = (Number(cfg.elapsed) || 0) + (running ? now - cfg.startedAt : 0)
  const laps: number[] = Array.isArray(cfg.laps) ? cfg.laps : []
  const toggle = (): void => {
    if (running) { setConfig('elapsed', elapsed); setConfig('startedAt', null) }
    else setConfig('startedAt', Date.now())
  }
  return (
    <div className={`pk pk-sw ${running ? 'running' : ''}`}>
      <button className="pk-sw-time" onClick={toggle} title={running ? 'Pause' : 'Start'}>{swText(elapsed, cfg.hundredths !== false)}</button>
      <div className="pk-sw-actions">
        <button className="pk-sw-btn" onClick={toggle}>{running ? 'Pause' : elapsed ? 'Resume' : 'Start'}</button>
        {cfg.laps !== false && <button className="pk-sw-btn" disabled={!running} onClick={() => setConfig('laps', [elapsed, ...laps].slice(0, 20))}>Lap</button>}
        <button className="pk-sw-btn" disabled={!elapsed} onClick={() => { setConfig('startedAt', null); setConfig('elapsed', 0); setConfig('laps', []) }}>Reset</button>
      </div>
      {laps.length > 0 && cfg.showLaps !== false && (
        <div className="pk-sw-laps">{laps.map((l, i) => <div key={i}><span>Lap {laps.length - i}</span><span>{swText(l - (laps[i + 1] ?? 0), true)}</span></div>)}</div>
      )}
    </div>
  )
}

// ---------- time left ----------
export function TimeLeftWidget({ cfg }: { cfg: Cfg }): JSX.Element {
  const now = new Date(useTick(60_000))
  const weekStart = useData((d) => d.settings.weekStart)
  const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const wk0 = new Date(day0)
  wk0.setDate(day0.getDate() - ((day0.getDay() - weekStart + 7) % 7))
  const mo0 = new Date(now.getFullYear(), now.getMonth(), 1)
  const mo1 = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const yr0 = new Date(now.getFullYear(), 0, 1)
  const yr1 = new Date(now.getFullYear() + 1, 0, 1)
  const parts = [
    { id: 'day', label: 'Day', f: (now.getTime() - day0.getTime()) / 864e5, left: `${Math.ceil((864e5 - (now.getTime() - day0.getTime())) / 3600e3)}h left` },
    { id: 'week', label: 'Week', f: (now.getTime() - wk0.getTime()) / (7 * 864e5), left: `${7 - Math.floor((now.getTime() - wk0.getTime()) / 864e5) - 1}d left` },
    { id: 'month', label: MONTHS_LONG[now.getMonth()], f: (now.getTime() - mo0.getTime()) / (mo1.getTime() - mo0.getTime()), left: `${Math.ceil((mo1.getTime() - now.getTime()) / 864e5)}d left` },
    { id: 'year', label: String(now.getFullYear()), f: (now.getTime() - yr0.getTime()) / (yr1.getTime() - yr0.getTime()), left: `${Math.ceil((yr1.getTime() - now.getTime()) / 864e5)}d left` }
  ].filter((p) => cfg[p.id] !== false)
  if (cfg.look === 'rings') {
    return (
      <div className="pk pk-tl-rings">
        {parts.map((p) => (
          <div key={p.id} className="pk-tl-ring">
            <svg viewBox="0 0 100 100" aria-hidden>
              <circle cx="50" cy="50" r="40" className="track" />
              <circle cx="50" cy="50" r="40" className="arc" pathLength={100} strokeDasharray={`${p.f * 100} 100`} transform="rotate(-90 50 50)" />
              <text x="50" y="54" textAnchor="middle">{Math.floor(p.f * 100)}%</text>
            </svg>
            <span>{p.label}</span>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="pk pk-tl-bars">
      {parts.map((p) => (
        <div key={p.id} className="pk-tl-row">
          <div className="pk-tl-head"><span>{p.label}</span><span className="muted">{cfg.left !== false ? p.left : `${Math.floor(p.f * 100)}%`}</span></div>
          <span className="pk-tl-track"><span style={{ width: `${p.f * 100}%` }} /></span>
        </div>
      ))}
    </div>
  )
}

// ---------- moon ----------
const SYNODIC = 29.530588853
const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14)
export function moonPhase(d: Date): number {
  const days = (d.getTime() - NEW_MOON) / 864e5
  return (((days % SYNODIC) + SYNODIC) % SYNODIC) / SYNODIC
}
const PHASES = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent']
export function MoonWidget({ cfg }: { cfg: Cfg }): JSX.Element {
  const now = new Date(useTick(600_000))
  const p = moonPhase(now)
  const name = PHASES[Math.round(p * 8) % 8]
  const lit = Math.round(((1 - Math.cos(2 * Math.PI * p)) / 2) * 100)
  const toFull = ((0.5 - p + 1) % 1) * SYNODIC
  const full = new Date(now.getTime() + toFull * 864e5)
  const waxing = p < 0.5
  const k = Math.cos(2 * Math.PI * p)
  const r = 40
  const rx = Math.abs(k) * r
  const inner = waxing ? (k > 0 ? 0 : 1) : (k > 0 ? 1 : 0)
  const path = `M50,${50 - r} A${r},${r} 0 0 ${waxing ? 1 : 0} 50,${50 + r} A${rx},${r} 0 0 ${inner} 50,${50 - r} Z`
  return (
    <div className={`pk pk-moon ${cfg.look === 'row' ? 'row' : ''}`}>
      <svg viewBox="0 0 100 100" aria-hidden>
        <circle cx="50" cy="50" r={r} className="dark" />
        {lit > 0 && <path d={path} className="lit" />}
      </svg>
      <div className="pk-moon-text">
        {cfg.name !== false && <div className="pk-moon-name">{name}</div>}
        {cfg.lit !== false && <div className="pk-moon-sub">{lit}% lit</div>}
        {cfg.next !== false && <div className="pk-moon-sub">Full moon {toFull < 1 ? 'tonight' : `${full.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`}</div>}
      </div>
    </div>
  )
}

// ---------- launcher ----------
export interface LaunchItem { label: string; target: string; icon?: string }
const tileHue = (s: string): number => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360; return h }
export function LauncherWidget({ cfg }: { cfg: Cfg }): JSX.Element {
  const items: LaunchItem[] = Array.isArray(cfg.items) ? cfg.items.filter((i: LaunchItem) => i && i.target) : []
  if (!items.length) return <div className="pk pk-empty"><span className="muted small">Add websites, apps or folders in the panel settings.</span></div>
  const open = (t: string): void => { api.launch(t).then((ok) => { if (!ok) toast('That link or file could not be opened') }).catch(() => {}) }
  return (
    <div className={`pk pk-launch ${cfg.look ?? 'grid'} ${cfg.labels === false ? 'nolabel' : ''}`}>
      {items.map((it, i) => (
        <button key={i} className="pk-launch-item" title={it.target} onClick={() => open(it.target)}>
          <span className="pk-launch-icon" style={it.icon ? undefined : { background: `hsl(${tileHue(it.label || it.target)} 55% 55% / 0.85)` }}>
            {it.icon ? <Icon name={it.icon} size={18} /> : (it.label || it.target).replace(/^https?:\/\/(www\.)?/, '').slice(0, 1).toUpperCase()}
          </span>
          {cfg.labels !== false && <span className="pk-launch-label">{it.label || it.target.replace(/^https?:\/\/(www\.)?/, '')}</span>}
        </button>
      ))}
    </div>
  )
}

// ---------- web search ----------
export const ENGINES: Record<string, { name: string; url: string }> = {
  google: { name: 'Google', url: 'https://www.google.com/search?q=' },
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=' },
  youtube: { name: 'YouTube', url: 'https://www.youtube.com/results?search_query=' },
  wikipedia: { name: 'Wikipedia', url: 'https://en.wikipedia.org/w/index.php?search=' }
}
export function SearchWidget({ cfg }: { cfg: Cfg }): JSX.Element {
  const [q, setQ] = useState('')
  const engine = ENGINES[cfg.engine] ?? ENGINES.google
  const go = (): void => { const s = q.trim(); if (!s) return; api.launch(engine.url + encodeURIComponent(s)); setQ('') }
  return (
    <div className="pk pk-search">
      <Icon name="search" size={16} />
      <input className="pk-search-input" value={q} placeholder={`Search ${engine.name}`} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') go() }} />
    </div>
  )
}

// ---------- quote ----------
const LINES = [
  'Small steps still move you forward.',
  'Do the next right thing.',
  'Done is better than perfect.',
  'One task at a time.',
  'Rest is part of the work.',
  'Start before you feel ready.',
  'Make it simple, then make it good.',
  'Focus on what you can change today.',
  'Progress, not perfection.',
  'Future you will thank you.',
  'Show up, even for ten minutes.',
  'Clear desk, clear head.',
  'You have done hard things before.',
  'Write it down so your mind can rest.',
  'Keep promises to yourself.',
  'Slow is smooth, smooth is fast.'
]
export function QuoteWidget({ cfg, setConfig }: { cfg: Cfg; setConfig: SetConfig }): JSX.Element {
  const now = useTick(60_000)
  const own = String(cfg.lines ?? '').split('\n').map((s) => s.trim()).filter(Boolean)
  const list = own.length ? (cfg.builtIn ? [...own, ...LINES] : own) : LINES
  const step = cfg.every === 'hour' ? Math.floor(now / 3600e3) : Math.floor((now - new Date().getTimezoneOffset() * 60e3) / 864e5)
  const idx = ((step + (Number(cfg.shift) || 0)) % list.length + list.length) % list.length
  return (
    <button className={`pk pk-quote ${cfg.look ?? 'plain'}`} onClick={() => setConfig('shift', (Number(cfg.shift) || 0) + 1)} title="Next">
      {cfg.look === 'mark' && <Icon name="quote" size={22} className="pk-quote-mark" />}
      <span className="pk-quote-text">{list[idx]}</span>
    </button>
  )
}

/** Data for the config editor: rows of the launcher. */
export const launcherItems = (cfg: Cfg): LaunchItem[] => (Array.isArray(cfg.items) ? cfg.items : [])
export const currentPlaceName = (): string => getData().settings.place?.name ?? ''
