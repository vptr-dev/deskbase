// Panels: network speed, calculator, recent pages.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { openPage, useData } from '../store'
import { api, type NetStats } from '../lib/api'
import { typeInfo } from '../lib/defaults'
import { Glyph, Icon } from './Icon'

type Cfg = Record<string, any>

// ---------- network ----------
const HISTORY = 40
let netLast: NetStats | null = null
let netHist: { down: number; up: number }[] = []
let netTimer: ReturnType<typeof setInterval> | null = null
const netSubs = new Set<() => void>()

async function pollNet(): Promise<void> {
  try {
    const s = await api.netStats()
    netLast = s
    netHist = [...netHist, { down: s.down, up: s.up }].slice(-HISTORY)
    netSubs.forEach((f) => f())
  } catch { /* try again next time */ }
}

function subscribeNet(cb: () => void): () => void {
  netSubs.add(cb)
  if (!netTimer) { void pollNet(); netTimer = setInterval(() => { void pollNet() }, 1500) }
  return () => {
    netSubs.delete(cb)
    if (!netSubs.size && netTimer) { clearInterval(netTimer); netTimer = null }
  }
}

const useNet = (): NetStats | null => useSyncExternalStore(subscribeNet, () => netLast)

/** 1234567 bytes per second → "1.2 MB/s"; bits when asked. */
export function rate(bytes: number, bits = false): string {
  let v = bits ? bytes * 8 : bytes
  const units = bits ? ['b/s', 'Kb/s', 'Mb/s', 'Gb/s'] : ['B/s', 'KB/s', 'MB/s', 'GB/s']
  let i = 0
  while (v >= 1000 && i < units.length - 1) { v /= 1000; i++ }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}

const size = (bytes: number): string => {
  let v = bytes
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (v >= 1000 && i < units.length - 1) { v /= 1000; i++ }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}

function NetGraph({ hist }: { hist: { down: number; up: number }[] }): JSX.Element {
  const w = 200
  const h = 60
  const max = Math.max(1024, ...hist.map((x) => Math.max(x.down, x.up)))
  const line = (key: 'down' | 'up'): string => {
    const pts = Array.from({ length: HISTORY }, (_, i) => {
      const s = hist[i - (HISTORY - hist.length)]
      const v = s ? s[key] : 0
      return `${((i / (HISTORY - 1)) * w).toFixed(1)},${(h - 2 - (v / max) * (h - 6)).toFixed(1)}`
    })
    return 'M' + pts.join(' L')
  }
  return (
    <svg className="pk-net-graph" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <path d={`${line('down')} L${w},${h} L0,${h} Z`} className="area down" />
      <path d={line('down')} className="line down" />
      <path d={line('up')} className="line up" />
    </svg>
  )
}

/** Download and upload speed in one line, for other panels (System). */
export function NetSpeed({ bits, big }: { bits?: boolean; big?: boolean }): JSX.Element | null {
  const s = useNet()
  if (s && !s.supported) return null
  if (big) return <>
    <div className="pk-sys-num net"><span className="pk-sys-big sm">{s ? rate(s.down, bits) : '—'}</span><span className="pk-sys-k">Down</span></div>
    <div className="pk-sys-num net"><span className="pk-sys-big sm">{s ? rate(s.up, bits) : '—'}</span><span className="pk-sys-k">Up</span></div>
  </>
  return (
    <span className="pk-net-inline">
      <span><Icon name="down" size={12} stroke={2.4} />{s ? rate(s.down, bits) : '—'}</span>
      <span><Icon name="up" size={12} stroke={2.4} />{s ? rate(s.up, bits) : '—'}</span>
    </span>
  )
}

export function NetworkWidget({ cfg }: { cfg: Cfg }): JSX.Element {
  const s = useNet()
  const hist = useSyncExternalStore(subscribeNet, () => netHist)
  const bits = cfg.unit === 'bits'
  if (s && !s.supported) return <div className="pk pk-empty"><span className="muted small">Network speed isn't available on this computer.</span></div>
  return (
    <div className={`pk pk-net ${cfg.graph === false ? 'no-graph' : ''}`}>
      <div className="pk-net-rows">
        <div className="pk-net-row down"><Icon name="down" size={14} stroke={2.4} /><b>{s ? rate(s.down, bits) : '—'}</b></div>
        <div className="pk-net-row up"><Icon name="up" size={14} stroke={2.4} /><b>{s ? rate(s.up, bits) : '—'}</b></div>
      </div>
      {cfg.graph !== false && <NetGraph hist={hist} />}
      {cfg.details && s && (
        <div className="pk-net-details">
          <span>{s.online ? s.ip || 'Connected' : 'Offline'}</span>
          <span>{size(s.rx)} in · {size(s.tx)} out</span>
        </div>
      )}
    </div>
  )
}

// ---------- calculator ----------
/** Works out + − × ÷ ^ %, brackets and a few functions without running any code. */
export function calc(src: string): number | null {
  const s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '').replace(/\s+/g, '').toLowerCase()
  if (!s) return null
  let i = 0
  const peek = (): string => s[i] ?? ''
  const eat = (c: string): boolean => (s.startsWith(c, i) ? ((i += c.length), true) : false)
  const FN: Record<string, (x: number) => number> = {
    sqrt: Math.sqrt, sin: (x) => Math.sin((x * Math.PI) / 180), cos: (x) => Math.cos((x * Math.PI) / 180), tan: (x) => Math.tan((x * Math.PI) / 180),
    log: Math.log10, ln: Math.log, abs: Math.abs, round: Math.round
  }
  const primary = (): number => {
    if (eat('(')) { const v = expr(); eat(')'); return v }
    if (eat('-')) return -factor()
    if (eat('+')) return factor()
    if (eat('pi')) return Math.PI
    for (const f of Object.keys(FN)) if (eat(f)) return FN[f](primary())
    const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/.exec(s.slice(i))
    if (!m) throw new Error('bad')
    i += m[0].length
    let v = Number(m[0])
    if (eat('%')) v /= 100
    return v
  }
  const factor = (): number => {
    const base = primary()
    return eat('^') || eat('**') ? Math.pow(base, factor()) : base
  }
  const term = (): number => {
    let v = factor()
    for (;;) {
      if (eat('*')) v *= factor()
      else if (eat('/')) v /= factor()
      else if (/[(a-z]/.test(peek())) v *= factor() // 2(3+1), 2pi
      else return v
    }
  }
  const expr = (): number => {
    let v = term()
    for (;;) {
      if (eat('+')) v += term()
      else if (eat('-')) v -= term()
      else return v
    }
  }
  try {
    const v = expr()
    return i === s.length && Number.isFinite(v) ? v : null
  } catch {
    return null
  }
}

const show = (n: number): string => {
  if (Math.abs(n) >= 1e15 || (Math.abs(n) < 1e-9 && n !== 0)) return n.toExponential(6).replace(/\.?0+e/, 'e')
  return Number(n.toPrecision(12)).toLocaleString(undefined, { maximumFractionDigits: 10 })
}

const KEYS = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '0', '.', '%', '+']

export function CalculatorWidget({ cfg, setConfig }: { cfg: Cfg; setConfig: (k: string, v: any) => void }): JSX.Element {
  const [text, setText] = useState('')
  const input = useRef<HTMLInputElement | null>(null)
  const history: { q: string; a: string }[] = Array.isArray(cfg.history) ? cfg.history : []
  const value = useMemo(() => calc(text.replace(/−/g, '-')), [text])
  const done = (): void => {
    if (value === null) return
    setConfig('history', [{ q: text, a: show(value) }, ...history].slice(0, 6))
    setText(String(Number(value.toPrecision(12))))
  }
  const press = (k: string): void => { setText((t) => t + k); input.current?.focus() }
  return (
    <div className={`pk pk-calc ${cfg.keys === false ? 'no-keys' : ''}`}>
      <div className="pk-calc-hist">
        {history.slice(0, cfg.keys === false ? 4 : 2).reverse().map((h, i) => (
          <button key={i} className="pk-calc-line" title="Use this answer" onClick={() => setText(h.a.replace(/,/g, ''))}><span>{h.q}</span><b>{h.a}</b></button>
        ))}
      </div>
      <input ref={input} className="pk-calc-input" value={text} placeholder="0" spellCheck={false}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); done() } if (e.key === 'Escape') setText('') }} />
      <div className="pk-calc-answer">{text && value !== null && String(value) !== text ? '= ' + show(value) : ' '}</div>
      {cfg.keys !== false && (
        <div className="pk-calc-keys">
          {KEYS.map((k) => <button key={k} className={/[÷×−+%]/.test(k) ? 'op' : ''} onClick={() => press(k === '−' ? '-' : k)}>{k}</button>)}
          <button onClick={() => setText((t) => t.slice(0, -1))} title="Delete"><Icon name="left" size={14} /></button>
          <button onClick={() => setText('')}>C</button>
          <button onClick={() => press('(')}>(</button>
          <button className="eq" onClick={done}>=</button>
        </div>
      )}
    </div>
  )
}

// ---------- recent pages ----------
export function RecentWidget({ cfg }: { cfg: Cfg }): JSX.Element {
  const pages = useData((d) => d.pages)
  const recent = useData((d) => d.recent)
  const n = Math.max(3, Math.min(20, Number(cfg.count) || 8))
  const favs = cfg.favorites !== false ? Object.values(pages).filter((p) => p.favorite && !p.deletedAt) : []
  const list = recent.map((id) => pages[id]).filter((p) => p && !p.deletedAt && !favs.includes(p)).slice(0, n)
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 60000); return () => clearInterval(t) }, [])
  const row = (p: (typeof list)[number], star = false): JSX.Element => (
    <button key={p.id} className="pk-recent-row" onClick={() => openPage(p.id)}>
      <Glyph value={p.icon || typeInfo(p.type).icon} size={15} color={p.iconColor || undefined} />
      <span className="ellipsis">{p.title || 'Untitled'}</span>
      {star && <Icon name="star" size={12} className="pk-recent-star" />}
    </button>
  )
  if (!favs.length && !list.length) return <div className="pk pk-empty"><span className="muted small">Pages you open show up here.</span></div>
  return (
    <div className="pk pk-recent w-scroll">
      {favs.map((p) => row(p, true))}
      {favs.length > 0 && list.length > 0 && <div className="pk-recent-sep" />}
      {list.map((p) => row(p))}
    </div>
  )
}
