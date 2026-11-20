import { createContext, type ReactNode, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Glyph, Icon } from './Icon'
import { ICON_GROUPS } from '../lib/icon-data'

/** The document UI renders into. Desktop widget windows provide their own. */
export const DocContext = createContext<Document>(document)
export const useDoc = (): Document => useContext(DocContext)

export function Button({ children, onClick, kind = 'default', icon, title, disabled, small, className = '', type = 'button' }: {
  children?: ReactNode; onClick?: (e: React.MouseEvent) => void; kind?: 'default' | 'primary' | 'ghost' | 'danger'; icon?: string; title?: string; disabled?: boolean; small?: boolean; className?: string; type?: 'button' | 'submit'
}): JSX.Element {
  return (
    <button type={type} className={`btn btn-${kind} ${small ? 'btn-sm' : ''} ${!children ? 'btn-icon' : ''} ${className}`} onClick={onClick} title={title} aria-label={title} disabled={disabled}>
      {icon && <Icon name={icon} size={small ? 14 : 16} />}
      {children}
    </button>
  )
}

/** Floating popover anchored to an element or a point. Closes on outside click / Esc. */
export function Popover({ anchor, onClose, children, align = 'start', width }: {
  anchor: Element | { x: number; y: number } | null; onClose: () => void; children: ReactNode; align?: 'start' | 'end'; width?: number
}): JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null)
  const doc = useDoc()
  const view = doc.defaultView ?? window
  const [pos, setPos] = useState<{ left: number; top: number; origin: string }>({ left: -9999, top: -9999, origin: 'top left' })
  useLayoutEffect(() => {
    if (!anchor || !ref.current) return
    const r = 'getBoundingClientRect' in anchor ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y }
    const el = ref.current.getBoundingClientRect()
    let left = align === 'end' ? r.right - el.width : r.left
    let top = r.bottom + 6
    let below = true
    if (top + el.height > view.innerHeight - 8) { top = Math.max(8, r.top - el.height - 6); below = false }
    left = Math.max(8, Math.min(left, view.innerWidth - el.width - 8))
    setPos({ left, top, origin: `${below ? 'top' : 'bottom'} ${align === 'end' ? 'right' : 'left'}` })
  }, [anchor, align])
  useEffect(() => {
    const down = (e: MouseEvent): void => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    const key = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    const t = setTimeout(() => doc.addEventListener('mousedown', down), 0)
    doc.addEventListener('keydown', key, true)
    return () => { clearTimeout(t); doc.removeEventListener('mousedown', down); doc.removeEventListener('keydown', key, true) }
  }, [onClose, doc])
  if (!anchor) return null
  return createPortal(
    <div ref={ref} className="popover glass" style={{ left: pos.left, top: pos.top, width, transformOrigin: pos.origin }} onMouseDown={(e) => e.stopPropagation()}>
      {children}
    </div>,
    doc.body
  )
}

export interface MenuItem { label: string; icon?: string; onClick?: () => void; danger?: boolean; hint?: string; divider?: boolean; checked?: boolean; disabled?: boolean }

export function Menu({ items, onClose }: { items: MenuItem[]; onClose: () => void }): JSX.Element {
  return (
    <div className="menu" role="menu">
      {items.map((it, i) =>
        it.divider ? <div key={i} className="menu-divider" /> : (
          <button key={i} role="menuitem" className={`menu-item ${it.danger ? 'danger' : ''}`} disabled={it.disabled} onClick={() => { onClose(); it.onClick?.() }}>
            <span className="menu-icon">{it.checked !== undefined ? (it.checked ? <Icon name="check" size={14} /> : null) : it.icon ? <Icon name={it.icon} size={15} /> : null}</span>
            <span className="menu-label">{it.label}</span>
            {it.hint && <span className="menu-hint">{it.hint}</span>}
          </button>
        )
      )}
    </div>
  )
}

/** Button that opens a menu. */
export function MenuButton({ items, icon = 'more', title = 'More', label, small = true, align = 'end' }: { items: MenuItem[]; icon?: string; title?: string; label?: ReactNode; small?: boolean; align?: 'start' | 'end' }): JSX.Element {
  const [el, setEl] = useState<HTMLElement | null>(null)
  return (
    <>
      <Button kind="ghost" small={small} icon={icon} title={title} onClick={(e) => setEl(e.currentTarget as HTMLElement)}>{label}</Button>
      {el && <Popover anchor={el} align={align} onClose={() => setEl(null)}><Menu items={items} onClose={() => setEl(null)} /></Popover>}
    </>
  )
}

export function Modal({ onClose, children, width = 560, className = '' }: { onClose: () => void; children: ReactNode; width?: number; className?: string }): JSX.Element {
  const doc = useDoc()
  useEffect(() => {
    const key = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    doc.addEventListener('keydown', key)
    return () => doc.removeEventListener('keydown', key)
  }, [onClose, doc])
  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className={`modal glass-strong ${className}`} style={{ width }} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {children}
      </div>
    </div>,
    doc.body
  )
}

/** Inline two-step confirm (the app never uses window.confirm). */
export function ConfirmButton({ onConfirm, label = 'Delete', confirmLabel = 'Confirm', icon = 'trash', small = true }: { onConfirm: () => void; label?: string; confirmLabel?: string; icon?: string; small?: boolean }): JSX.Element {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <Button kind={armed ? 'danger' : 'ghost'} small={small} icon={icon} onClick={() => (armed ? onConfirm() : setArmed(true))}>
      {armed ? confirmLabel : label}
    </Button>
  )
}

export function Progress({ value, color, height = 6, className = '' }: { value: number; color?: string; height?: number; className?: string }): JSX.Element {
  return (
    <div className={`progress ${className}`} style={{ height }}>
      <div className="progress-fill" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color }} />
    </div>
  )
}

export function Ring({ value, size = 44, stroke = 5, color, children }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode }): JSX.Element {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color ?? 'var(--accent)'} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset .4s ease' }} />
      </svg>
      <div className="ring-label">{children}</div>
    </div>
  )
}

export function Segmented<T extends string | number>({ value, options, onChange, small }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; small?: boolean }): JSX.Element {
  return (
    <div className={`segmented ${small ? 'segmented-sm' : ''}`} role="tablist">
      {options.map((o) => (
        <button key={String(o.value)} role="tab" aria-selected={o.value === value} className={o.value === value ? 'active' : ''} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  )
}

export function Toggle({ checked, onChange, id }: { checked: boolean; onChange: (v: boolean) => void; id?: string }): JSX.Element {
  return (
    <button id={id} role="switch" aria-checked={checked} className={`toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}>
      <span className="toggle-knob" />
    </button>
  )
}

export function Checkbox({ checked, onChange, color, size = 18, round }: { checked: boolean; onChange: (v: boolean) => void; color?: string; size?: number; round?: boolean }): JSX.Element {
  return (
    <button role="checkbox" aria-checked={checked} className={`check ${checked ? 'on' : ''} ${round ? 'round' : ''}`} style={{ width: size, height: size, ['--c' as any]: color }} onClick={(e) => { e.stopPropagation(); onChange(!checked) }}>
      {checked && <Icon name="check" size={size - 6} stroke={3} />}
    </button>
  )
}

export const ICON_COLORS = ['', '#0a84ff', '#5e5ce6', '#bf5af2', '#ff375f', '#ff453a', '#ff9f0a', '#e5b000', '#30d158', '#00c7be', '#40c8e0', '#8e8e93']

/** Searchable grid of line icons. */
export function IconPicker({ onPick, onRemove, color, onColor }: { onPick: (name: string) => void; onRemove?: () => void; color?: string; onColor?: (c: string) => void }): JSX.Element {
  const groups = Object.keys(ICON_GROUPS)
  const [tab, setTab] = useState(groups[0])
  const [q, setQ] = useState('')
  const all = useMemo(() => [...new Set(Object.values(ICON_GROUPS).flat())], [])
  const shown = q.trim() ? all.filter((n) => n.includes(q.trim().toLowerCase().replace(/\s+/g, '-'))) : ICON_GROUPS[tab]
  return (
    <div className="icon-picker">
      <div className="icon-picker-top">
        <input className="input input-sm grow" autoFocus placeholder="Search icons" value={q} onChange={(e) => setQ(e.target.value)} />
        {onRemove && <Button small kind="ghost" onClick={onRemove}>Remove</Button>}
      </div>
      {!q.trim() && (
        <div className="icon-tabs">
          {groups.map((k) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{k}</button>)}
        </div>
      )}
      <div className="icon-grid">
        {shown.map((n) => <button key={n} title={n.replace(/-/g, ' ')} onClick={() => onPick(n)} style={color ? { color } : undefined}><Icon name={n} size={18} /></button>)}
        {shown.length === 0 && <div className="muted small pad">No icons match.</div>}
      </div>
      {onColor && (
        <div className="icon-colors">
          {ICON_COLORS.map((c) => (
            <button key={c || 'auto'} className={`color-dot ${(color ?? '') === c ? 'active' : ''} ${c ? '' : 'auto'}`} style={c ? { background: c } : undefined} title={c ? c : 'Default color'} onClick={() => onColor(c)} />
          ))}
        </div>
      )}
    </div>
  )
}

export function IconPickerButton({ value, onChange, size = 'md', placeholder = 'file-text', color, onColor }: { value: string; onChange: (v: string) => void; size?: 'sm' | 'md' | 'lg'; placeholder?: string; color?: string; onColor?: (c: string) => void }): JSX.Element {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const px = size === 'lg' ? 34 : size === 'sm' ? 15 : 20
  return (
    <>
      <button className={`icon-pick icon-pick-${size} ${value ? '' : 'empty'}`} onClick={(e) => setEl(e.currentTarget)} title="Change icon">
        <Glyph value={value || placeholder} size={px} color={color || undefined} />
      </button>
      {el && (
        <Popover anchor={el} onClose={() => setEl(null)} width={340}>
          <IconPicker color={color} onColor={onColor} onPick={(n) => { onChange(n); setEl(null) }} onRemove={() => { onChange(''); setEl(null) }} />
        </Popover>
      )}
    </>
  )
}

export function ColorDots({ value, colors, onChange }: { value: string; colors: string[]; onChange: (c: string) => void }): JSX.Element {
  return (
    <div className="color-dots">
      {colors.map((c) => <button key={c} className={`color-dot ${value === c ? 'active' : ''}`} style={{ background: c }} onClick={() => onChange(c)} aria-label={c} />)}
    </div>
  )
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }): JSX.Element {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon name={icon} size={26} /></div>
      <div className="empty-title">{title}</div>
      {children}
    </div>
  )
}

/** Auto-growing textarea. */
const FIELD_SIZING = typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content')

export interface AutoTextProps {
  value: string; onChange: (v: string) => void; className?: string; placeholder?: string; onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void; autoFocus?: boolean; id?: string; inputRef?: (el: HTMLTextAreaElement | null) => void; onFocus?: () => void; onBlur?: () => void; spellCheck?: boolean; onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void
}

export function AutoText({ value, onChange, className = '', placeholder, onKeyDown, autoFocus, id, inputRef, onFocus, onBlur, spellCheck, onPaste }: AutoTextProps): JSX.Element {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  // The height follows the text through CSS (field-sizing: content). Measuring each field in JS
  // forced a layout per block and made big pages take seconds to open.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || FIELD_SIZING) return
    el.style.height = '0px'
    el.style.height = el.scrollHeight + 'px'
  }, [value])
  return (
    <textarea
      id={id}
      ref={(el) => { ref.current = el; inputRef?.(el) }}
      className={`autotext ${className}`}
      rows={1}
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      spellCheck={spellCheck}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
      onPaste={onPaste}
    />
  )
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }): JSX.Element {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

export function Sparkline({ values, width = 120, height = 32, color = 'var(--accent)' }: { values: number[]; width?: number; height?: number; color?: string }): JSX.Element {
  if (values.length < 2) return <svg width={width} height={height} />
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (width - 4) + 2, height - 3 - ((v - min) / span) * (height - 6)])
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const last = pts[pts.length - 1]
  return (
    <svg width={width} height={height} className="spark">
      <path d={`${d} L${last[0]},${height} L2,${height} Z`} fill={color} opacity={0.12} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={2.6} fill={color} />
    </svg>
  )
}

export function BarChart({ data, height = 120, color = 'var(--accent)', format = (v: number) => String(v) }: { data: { label: string; value: number }[]; height?: number; color?: string; format?: (v: number) => string }): JSX.Element {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="bars" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="bar-col" title={`${d.label}: ${format(d.value)}`}>
          <div className="bar-track"><div className="bar" style={{ height: `${(d.value / max) * 100}%`, background: color }} /></div>
          <div className="bar-label">{d.label}</div>
        </div>
      ))}
    </div>
  )
}

/** A long page of settings with an index beside it: click a heading to go there; the one in view is marked. */
export function useSectionIndex(ids: string[], initial?: string): { body: React.RefObject<HTMLDivElement>; active: string; go: (id: string, smooth?: boolean) => void } {
  const body = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(initial && ids.includes(initial) ? initial : ids[0])
  const hold = useRef(0)
  const key = ids.join(',')
  const scroller = (): HTMLElement | null => {
    let el: HTMLElement | null = body.current
    while (el && !(el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY))) el = el.parentElement
    return el ?? body.current
  }
  const find = (id: string): HTMLElement | null => body.current?.querySelector<HTMLElement>(`[data-section="${id}"]`) ?? null
  const go = (id: string, smooth = true): void => {
    const sc = scroller()
    const el = find(id)
    if (!sc || !el) return
    hold.current = Date.now() + 700
    setActive(id)
    sc.scrollTo({ top: el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 8, behavior: smooth ? 'smooth' : 'auto' })
  }
  useEffect(() => {
    const spy = (): void => {
      if (Date.now() < hold.current) return
      const sc = scroller()
      if (!sc) return
      const top = sc.getBoundingClientRect().top
      let cur = ids[0]
      for (const id of ids) { const el = find(id); if (el && el.getBoundingClientRect().top - top <= 80) cur = id }
      if (sc.scrollTop > 0 && sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2) cur = ids[ids.length - 1]
      setActive(cur)
    }
    document.addEventListener('scroll', spy, true)
    return () => document.removeEventListener('scroll', spy, true)
  }, [key])
  useLayoutEffect(() => { if (initial && ids.includes(initial)) go(initial, false) }, [])
  useEffect(() => { if (!ids.includes(active)) setActive(ids[0]) }, [key])
  return { body, active, go }
}

export function SideIndex({ items, active, go, className = '' }: { items: { id: string; label: string; icon?: string }[]; active: string; go: (id: string) => void; className?: string }): JSX.Element {
  return (
    <nav className={`side-index ${className}`}>
      {items.map((it) => (
        <button key={it.id} className={active === it.id ? 'active' : ''} onClick={() => go(it.id)}>
          {it.icon && <Icon name={it.icon} size={14} />}<span>{it.label}</span>
        </button>
      ))}
    </nav>
  )
}
