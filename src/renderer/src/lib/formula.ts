// Formulas for database properties, in the spirit of Notion's:
//   prop("Price") * prop("Qty")      if(prop("Done"), "✓", "")      dateBetween(prop("Due"), today(), "days")
// Properties can also be written {Price}. Values are numbers, text, true/false, dates ("2026-11-20") or empty.

export type FVal = number | string | boolean | null

type Tok = { t: 'num'; v: number } | { t: 'str'; v: string } | { t: 'id'; v: string } | { t: 'op'; v: string } | { t: 'prop'; v: string }

function lex(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) { i++; continue }
    if (/[0-9.]/.test(c)) {
      const m = /^\d*\.?\d+(?:e[+-]?\d+)?/i.exec(src.slice(i))
      if (!m) throw new Error('Bad number')
      out.push({ t: 'num', v: Number(m[0]) }); i += m[0].length; continue
    }
    if (c === '"' || c === "'") {
      let j = i + 1
      let s = ''
      while (j < src.length && src[j] !== c) { if (src[j] === '\\' && j + 1 < src.length) j++; s += src[j]; j++ }
      if (j >= src.length) throw new Error('Text is missing its closing quote')
      out.push({ t: 'str', v: s }); i = j + 1; continue
    }
    if (c === '{') {
      const j = src.indexOf('}', i)
      if (j < 0) throw new Error('A { is missing its }')
      out.push({ t: 'prop', v: src.slice(i + 1, j).trim() }); i = j + 1; continue
    }
    const two = src.slice(i, i + 2)
    if (['==', '!=', '<=', '>=', '&&', '||'].includes(two)) { out.push({ t: 'op', v: two }); i += 2; continue }
    if ('+-*/%^()<>!,?:'.includes(c)) { out.push({ t: 'op', v: c === '=' ? '==' : c }); i++; continue }
    if (c === '=') { out.push({ t: 'op', v: '==' }); i++; continue }
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))
    if (m) { out.push({ t: 'id', v: m[0] }); i += m[0].length; continue }
    throw new Error(`Unexpected "${c}"`)
  }
  return out
}

type Node =
  | { k: 'lit'; v: FVal }
  | { k: 'prop'; name: string }
  | { k: 'un'; op: string; a: Node }
  | { k: 'bin'; op: string; a: Node; b: Node }
  | { k: 'if'; c: Node; a: Node; b: Node }
  | { k: 'call'; fn: string; args: Node[] }

function parse(src: string): Node {
  const toks = lex(src)
  let p = 0
  const peek = (): Tok | undefined => toks[p]
  const isOp = (v: string): boolean => { const t = peek(); return !!t && t.t === 'op' && t.v === v }
  const eat = (v: string): void => { if (!isOp(v)) throw new Error(`Expected "${v}"`); p++ }
  const LEVELS = [['||'], ['&&'], ['==', '!='], ['<', '<=', '>', '>='], ['+', '-'], ['*', '/', '%']]
  const ternary = (): Node => {
    const c = binary(0)
    if (isOp('?')) { p++; const a = ternary(); eat(':'); const b = ternary(); return { k: 'if', c, a, b } }
    return c
  }
  const binary = (lv: number): Node => {
    if (lv >= LEVELS.length) return power()
    let a = binary(lv + 1)
    while (peek()?.t === 'op' && LEVELS[lv].includes((peek() as Tok & { v: string }).v)) {
      const op = (toks[p++] as { v: string }).v
      a = { k: 'bin', op, a, b: binary(lv + 1) }
    }
    return a
  }
  const power = (): Node => {
    const a = unary()
    if (isOp('^')) { p++; return { k: 'bin', op: '^', a, b: power() } }
    return a
  }
  const unary = (): Node => {
    if (isOp('-')) { p++; return { k: 'un', op: '-', a: unary() } }
    if (isOp('!')) { p++; return { k: 'un', op: '!', a: unary() } }
    if (isOp('+')) { p++; return unary() }
    return atom()
  }
  const atom = (): Node => {
    const t = toks[p++]
    if (!t) throw new Error('The formula ends too early')
    if (t.t === 'num' || t.t === 'str') return { k: 'lit', v: t.v }
    if (t.t === 'prop') return { k: 'prop', name: t.v }
    if (t.t === 'op' && t.v === '(') { const e = ternary(); eat(')'); return e }
    if (t.t === 'id') {
      const name = t.v
      if (name === 'true' || name === 'false') return { k: 'lit', v: name === 'true' }
      if (name === 'empty' && !isOp('(')) return { k: 'lit', v: null }
      if (!isOp('(')) throw new Error(`Unknown name "${name}"`)
      p++
      const args: Node[] = []
      if (!isOp(')')) { do { args.push(ternary()) } while (isOp(',') && ++p) }
      eat(')')
      if (name === 'prop') {
        const a = args[0]
        if (!a || a.k !== 'lit' || typeof a.v !== 'string') throw new Error('prop() needs a property name in quotes')
        return { k: 'prop', name: a.v }
      }
      if (name === 'if') { if (args.length < 2) throw new Error('if() needs a condition and a value'); return { k: 'if', c: args[0], a: args[1], b: args[2] ?? { k: 'lit', v: null } } }
      if (!(name in FNS)) throw new Error(`Unknown function "${name}"`)
      return { k: 'call', fn: name, args }
    }
    throw new Error(`Unexpected "${(t as { v: unknown }).v}"`)
  }
  const e = ternary()
  if (p < toks.length) throw new Error(`Unexpected "${(toks[p] as { v: unknown }).v}"`)
  return e
}

const num = (v: FVal): number => (typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : v === null || v === '' ? 0 : Number(v))
const str = (v: FVal): string => (v === null ? '' : typeof v === 'number' ? fmtNum(v) : String(v))
const truthy = (v: FVal): boolean => !(v === null || v === false || v === 0 || v === '')
const isDate = (v: FVal): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)
const fmtNum = (n: number): string => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1e6) / 1e6))
const dayMs = 86400000
const toTime = (v: FVal): number => { if (!isDate(v)) return NaN; const [y, m, d] = v.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d).getTime() }
const fromTime = (t: number): string => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const UNITS: Record<string, number> = { days: 1, day: 1, weeks: 7, week: 7 }

const FNS: Record<string, (a: FVal[]) => FVal> = {
  round: ([x, d]) => { const k = 10 ** num(d ?? 0); return Math.round(num(x) * k) / k },
  floor: ([x]) => Math.floor(num(x)),
  ceil: ([x]) => Math.ceil(num(x)),
  abs: ([x]) => Math.abs(num(x)),
  sqrt: ([x]) => Math.sqrt(num(x)),
  pow: ([a, b]) => num(a) ** num(b),
  min: (a) => Math.min(...a.map(num)),
  max: (a) => Math.max(...a.map(num)),
  sum: (a) => a.reduce<number>((s, x) => s + num(x), 0),
  avg: (a) => (a.length ? a.reduce<number>((s, x) => s + num(x), 0) / a.length : 0),
  toNumber: ([x]) => { const n = Number(str(x).replace(/[^0-9.+-eE]/g, '')); return Number.isFinite(n) ? n : null },
  length: ([x]) => str(x).length,
  concat: (a) => a.map(str).join(''),
  join: ([sep, ...a]) => a.map(str).filter(Boolean).join(str(sep)),
  contains: ([a, b]) => str(a).toLowerCase().includes(str(b).toLowerCase()),
  upper: ([x]) => str(x).toUpperCase(),
  lower: ([x]) => str(x).toLowerCase(),
  replace: ([s, a, b]) => str(s).split(str(a)).join(str(b)),
  slice: ([s, a, b]) => str(s).slice(num(a), b === undefined ? undefined : num(b)),
  format: ([x]) => str(x),
  empty: ([x]) => x === null || x === '' || x === undefined,
  not: ([x]) => !truthy(x),
  and: (a) => a.every(truthy),
  or: (a) => a.some(truthy),
  now: () => fromTime(Date.now()),
  today: () => fromTime(Date.now()),
  dateAdd: ([d, n, u]) => { const t = toTime(d); if (Number.isNaN(t)) return null; const unit = str(u ?? 'days'); if (unit.startsWith('month') || unit.startsWith('year')) { const x = new Date(t); if (unit.startsWith('month')) x.setMonth(x.getMonth() + num(n)); else x.setFullYear(x.getFullYear() + num(n)); return fromTime(x.getTime()) } return fromTime(t + num(n) * (UNITS[unit] ?? 1) * dayMs) },
  dateSubtract: ([d, n, u]) => FNS.dateAdd([d, -num(n), u ?? 'days']),
  dateBetween: ([a, b, u]) => {
    const ta = toTime(a)
    const tb = toTime(b)
    if (Number.isNaN(ta) || Number.isNaN(tb)) return null
    const unit = str(u ?? 'days')
    if (unit.startsWith('month') || unit.startsWith('year')) {
      const x = new Date(ta); const y = new Date(tb)
      const months = (x.getFullYear() - y.getFullYear()) * 12 + x.getMonth() - y.getMonth()
      return unit.startsWith('year') ? Math.trunc(months / 12) : months
    }
    return Math.round((ta - tb) / dayMs / (UNITS[unit] ?? 1))
  },
  formatDate: ([d]) => { const t = toTime(d); return Number.isNaN(t) ? '' : new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) },
  year: ([d]) => { const t = toTime(d); return Number.isNaN(t) ? null : new Date(t).getFullYear() },
  month: ([d]) => { const t = toTime(d); return Number.isNaN(t) ? null : new Date(t).getMonth() + 1 },
  day: ([d]) => { const t = toTime(d); return Number.isNaN(t) ? null : new Date(t).getDate() },
  weekday: ([d]) => { const t = toTime(d); return Number.isNaN(t) ? null : new Date(t).getDay() }
}

export const FORMULA_FUNCTIONS = Object.keys(FNS).concat(['if', 'prop'])

function run(n: Node, get: (name: string) => FVal): FVal {
  switch (n.k) {
    case 'lit': return n.v
    case 'prop': return get(n.name)
    case 'if': return truthy(run(n.c, get)) ? run(n.a, get) : run(n.b, get)
    case 'un': { const a = run(n.a, get); return n.op === '-' ? -num(a) : !truthy(a) }
    case 'call': return FNS[n.fn](n.args.map((x) => run(x, get)))
    case 'bin': {
      if (n.op === '&&') return truthy(run(n.a, get)) && truthy(run(n.b, get))
      if (n.op === '||') return truthy(run(n.a, get)) || truthy(run(n.b, get))
      const a = run(n.a, get)
      const b = run(n.b, get)
      switch (n.op) {
        case '+':
          if (isDate(a) && typeof b === 'number') return FNS.dateAdd([a, b, 'days'])
          return typeof a === 'string' || typeof b === 'string' ? str(a) + str(b) : num(a) + num(b)
        case '-':
          if (isDate(a) && isDate(b)) return FNS.dateBetween([a, b, 'days'])
          if (isDate(a) && typeof b === 'number') return FNS.dateAdd([a, -b, 'days'])
          return num(a) - num(b)
        case '*': return num(a) * num(b)
        case '/': return num(b) === 0 ? null : num(a) / num(b)
        case '%': return num(b) === 0 ? null : num(a) % num(b)
        case '^': return num(a) ** num(b)
        case '==': return typeof a === 'number' || typeof b === 'number' ? num(a) === num(b) : str(a) === str(b)
        case '!=': return typeof a === 'number' || typeof b === 'number' ? num(a) !== num(b) : str(a) !== str(b)
        case '<': return typeof a === 'string' && typeof b === 'string' ? a < b : num(a) < num(b)
        case '<=': return typeof a === 'string' && typeof b === 'string' ? a <= b : num(a) <= num(b)
        case '>': return typeof a === 'string' && typeof b === 'string' ? a > b : num(a) > num(b)
        case '>=': return typeof a === 'string' && typeof b === 'string' ? a >= b : num(a) >= num(b)
      }
      return null
    }
  }
}

const cache = new Map<string, Node | Error>()
function compiled(src: string): Node | Error {
  let c = cache.get(src)
  if (!c) {
    try { c = parse(src) } catch (e: any) { c = new Error(e?.message ?? 'Formula error') }
    if (cache.size > 500) cache.clear()
    cache.set(src, c)
  }
  return c
}

/** The formula's result for one row, or an error message. */
export function evalFormula(src: string, get: (name: string) => FVal): { value: FVal; error?: string } {
  if (!src.trim()) return { value: null }
  const c = compiled(src)
  if (c instanceof Error) return { value: null, error: c.message }
  try {
    const v = run(c, get)
    return { value: typeof v === 'number' && !Number.isFinite(v) ? null : v }
  } catch (e: any) { return { value: null, error: e?.message ?? 'Formula error' } }
}

export const formulaText = (v: FVal): string => (v === null ? '' : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : typeof v === 'number' ? Number(v.toFixed(6)).toLocaleString() : v)
