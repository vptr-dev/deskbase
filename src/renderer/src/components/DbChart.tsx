import type { AppData, DbChart, DbProp, DbSchema, Page } from '../types'
import { COLORS } from '../lib/defaults'
import { cellValue, optionOf } from '../lib/db'
import { MONTHS_LONG } from '../lib/util'

export interface Slice { key: string; label: string; value: number; color: string }

/** Properties a chart can split rows by. */
export const chartGroupable = (db: DbSchema): DbProp[] => db.props.filter((p) => ['select', 'status', 'multi', 'checkbox', 'date', 'relation', 'text', 'url', 'formula', 'rollup'].includes(p.type))

/** Rows split into groups, with a count or a sum/average of a number per group. */
export function chartData(d: AppData, db: DbSchema, rows: Page[], chart: DbChart): Slice[] {
  const by = db.props.find((p) => p.id === chart.by)
  const val = chart.fn !== 'count' ? db.props.find((p) => p.id === chart.value) : undefined
  const groups = new Map<string, { label: string; color: string; vals: number[]; order: number }>()
  const put = (key: string, label: string, color: string, order: number, v: number): void => {
    const g = groups.get(key) ?? { label, color, vals: [], order }
    g.vals.push(v)
    groups.set(key, g)
  }
  for (const r of rows) {
    const n = val ? Number(cellValue(d, r, val)) : 1
    const v = Number.isFinite(n) ? n : 0
    if (!by) { put('all', 'All', COLORS[0], 0, v); continue }
    const x = cellValue(d, r, by)
    switch (by.type) {
      case 'select': case 'status': {
        const o = optionOf(by, x)
        put(o?.id ?? '', o?.name ?? 'None', o?.color ?? '#8e8e93', o ? (by.options ?? []).indexOf(o) : 999, v)
        break
      }
      case 'multi': {
        const ids: string[] = Array.isArray(x) ? x : []
        if (!ids.length) put('', 'None', '#8e8e93', 999, v)
        for (const id of ids) { const o = optionOf(by, id); if (o) put(o.id, o.name, o.color, (by.options ?? []).indexOf(o), v) }
        break
      }
      case 'checkbox': put(x ? 'y' : 'n', x ? 'Checked' : 'Not checked', x ? '#30d158' : '#8e8e93', x ? 0 : 1, v); break
      case 'date': {
        const m = typeof x === 'string' ? x.slice(0, 7) : ''
        put(m, m ? `${MONTHS_LONG[Number(m.slice(5, 7)) - 1].slice(0, 3)} ${m.slice(0, 4)}` : 'No date', '', m ? Number(m.replace('-', '')) : 1e9, v)
        break
      }
      case 'relation': {
        const ids: string[] = Array.isArray(x) ? x : []
        if (!ids.length) put('', 'None', '#8e8e93', 1e9, v)
        for (const id of ids) put(id, d.pages[id]?.title || 'Untitled', '', 0, v)
        break
      }
      default: {
        const s = x === undefined || x === null || x === '' ? '' : String(x)
        put(s, s || 'Empty', '', s ? 0 : 1e9, v)
      }
    }
  }
  let out = [...groups.entries()].map(([key, g]) => ({
    key, label: g.label, color: g.color, order: g.order,
    value: chart.fn === 'avg' ? (g.vals.length ? g.vals.reduce((a, b) => a + b, 0) / g.vals.length : 0) : g.vals.reduce((a, b) => a + b, 0)
  }))
  out.sort((a, b) => a.order - b.order || (by && ['text', 'url', 'formula', 'rollup', 'relation'].includes(by.type) ? b.value - a.value : 0))
  if (out.length > 16) out = out.slice(0, 16)
  return out.map((s, i) => ({ key: s.key, label: s.label, value: Math.round(s.value * 100) / 100, color: s.color || COLORS[i % COLORS.length] }))
}

const fmt = (n: number): string => (Math.abs(n) >= 10000 ? `${Math.round(n / 1000)}k` : Number(n.toFixed(2)).toLocaleString())

/** Bar, sideways bar, line or donut chart of slices; scales to its box. */
export function ChartSvg({ data, kind, height = 240, compact }: { data: Slice[]; kind: DbChart['kind']; height?: number; compact?: boolean }): JSX.Element {
  if (!data.length) return <div className="muted small pad">Nothing to show yet.</div>
  const max = Math.max(1, ...data.map((s) => s.value))
  if (kind === 'donut') {
    const total = data.reduce((a, s) => a + Math.max(0, s.value), 0) || 1
    let a0 = -Math.PI / 2
    const R = 46
    const r = 30
    const arcs = data.map((s) => {
      const a1 = a0 + (Math.max(0, s.value) / total) * Math.PI * 2
      const big = a1 - a0 > Math.PI ? 1 : 0
      const p = (ang: number, rad: number): string => `${50 + rad * Math.cos(ang)} ${50 + rad * Math.sin(ang)}`
      const path = a1 - a0 >= Math.PI * 2 - 1e-6
        ? `M ${p(0, R)} A ${R} ${R} 0 1 1 ${p(Math.PI, R)} A ${R} ${R} 0 1 1 ${p(0, R)} M ${p(0, r)} A ${r} ${r} 0 1 0 ${p(Math.PI, r)} A ${r} ${r} 0 1 0 ${p(0, r)} Z`
        : `M ${p(a0, R)} A ${R} ${R} 0 ${big} 1 ${p(a1, R)} L ${p(a1, r)} A ${r} ${r} 0 ${big} 0 ${p(a0, r)} Z`
      a0 = a1
      return { s, path }
    })
    return (
      <div className={`chart-donut ${compact ? 'compact' : ''}`}>
        <svg viewBox="0 0 100 100" style={{ height, maxWidth: height }}>
          {arcs.map(({ s, path }) => <path key={s.key} d={path} fill={s.color} fillRule="evenodd"><title>{`${s.label}: ${fmt(s.value)}`}</title></path>)}
          <text x="50" y="50" textAnchor="middle" dominantBaseline="central" className="chart-total">{fmt(total)}</text>
        </svg>
        <div className="chart-legend">
          {data.map((s) => <div key={s.key} className="chart-legend-row"><i style={{ background: s.color }} /><span className="ellipsis">{s.label}</span><span className="muted">{fmt(s.value)}</span></div>)}
        </div>
      </div>
    )
  }
  if (kind === 'hbar') {
    return (
      <div className="chart-hbars" style={{ maxHeight: compact ? undefined : height + 120 }}>
        {data.map((s) => (
          <div key={s.key} className="chart-hbar">
            <span className="chart-hbar-label ellipsis" title={s.label}>{s.label}</span>
            <span className="chart-hbar-track"><span style={{ width: `${(Math.max(0, s.value) / max) * 100}%`, background: s.color }} /></span>
            <span className="chart-hbar-val">{fmt(s.value)}</span>
          </div>
        ))}
      </div>
    )
  }
  const W = Math.max(320, data.length * 56)
  const H = 200
  const pad = 22
  const x = (i: number): number => pad + (i + 0.5) * ((W - pad * 2) / data.length)
  const y = (v: number): number => H - 26 - (Math.max(0, v) / max) * (H - 50)
  const bw = Math.min(40, ((W - pad * 2) / data.length) * 0.62)
  return (
    <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height }}>
      {[0.25, 0.5, 0.75, 1].map((k) => <line key={k} x1={pad} x2={W - pad} y1={y(max * k)} y2={y(max * k)} className="chart-grid" />)}
      {kind === 'line' ? <>
        <polyline points={data.map((s, i) => `${x(i)},${y(s.value)}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {data.map((s, i) => <circle key={s.key} cx={x(i)} cy={y(s.value)} r="3.5" fill="var(--accent)"><title>{`${s.label}: ${fmt(s.value)}`}</title></circle>)}
      </> : data.map((s, i) => (
        <rect key={s.key} x={x(i) - bw / 2} y={y(s.value)} width={bw} height={Math.max(1, H - 26 - y(s.value))} rx="4" fill={s.color}><title>{`${s.label}: ${fmt(s.value)}`}</title></rect>
      ))}
      {data.map((s, i) => <text key={s.key} x={x(i)} y={y(s.value) - 6} textAnchor="middle" className="chart-val">{fmt(s.value)}</text>)}
      {data.map((s, i) => <text key={'l' + s.key} x={x(i)} y={H - 8} textAnchor="middle" className="chart-label">{s.label.length > 10 ? s.label.slice(0, 9) + '…' : s.label}</text>)}
    </svg>
  )
}

export const chartTitleOf = (db: DbSchema, c: DbChart): string => {
  const by = db.props.find((p) => p.id === c.by)
  const v = db.props.find((p) => p.id === c.value)
  const what = c.fn === 'count' || !v ? 'Rows' : `${c.fn === 'sum' ? 'Total' : 'Average'} ${v.name}`
  return by ? `${what} by ${by.name}` : what
}

