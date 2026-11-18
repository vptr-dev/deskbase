import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'

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
  anchor: HTMLElement | { x: number; y: number } | null; onClose: () => void; children: ReactNode; align?: 'start' | 'end'; width?: number
}): JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: -9999, top: -9999 })
  useLayoutEffect(() => {
    if (!anchor || !ref.current) return
    const r = anchor instanceof HTMLElement ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y }
    const el = ref.current.getBoundingClientRect()
    let left = align === 'end' ? r.right - el.width : r.left
    let top = r.bottom + 6
    if (top + el.height > window.innerHeight - 8) top = Math.max(8, r.top - el.height - 6)
    left = Math.max(8, Math.min(left, window.innerWidth - el.width - 8))
    setPos({ left, top })
  }, [anchor, align])
  useEffect(() => {
    const down = (e: MouseEvent): void => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    const key = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    const t = setTimeout(() => document.addEventListener('mousedown', down), 0)
    document.addEventListener('keydown', key, true)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key, true) }
  }, [onClose])
  if (!anchor) return null
  return createPortal(
    <div ref={ref} className="popover glass" style={{ left: pos.left, top: pos.top, width }} onMouseDown={(e) => e.stopPropagation()}>
      {children}
    </div>,
    document.body
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
  useEffect(() => {
    const key = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [onClose])
  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className={`modal glass-strong ${className}`} style={{ width }} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {children}
      </div>
    </div>,
    document.body
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

export const EMOJI_SETS: Record<string, string[]> = {
  Common: '📄 📝 📓 📒 📕 📗 📘 📙 📚 🗂️ 📁 📌 📎 ✏️ 🖊️ 📅 🗓️ ⏰ ⏱️ ✅ ☑️ 🎯 🏆 🥇 ⭐ 🌟 ✨ 💡 🔥 ⚡ 💎 🧭 🗺️ 🏠 💼 💰 🛒 🎁 🔁 📈 📊 🔒 🔑 🧩'.split(' '),
  Games: '🎮 🕹️ 👾 🎲 ♟️ 🃏 🧙 🧝 🧛 🐉 ⚔️ 🗡️ 🛡️ 🏹 🪄 🔮 🧪 💀 👑 🏰 🗝️ 🪙 💣 🚀 🛸 🤖 🦸 🥷 🐲 🧟'.split(' '),
  Life: '❤️ 💪 🧠 🦉 🎨 🎵 🎧 📷 🏃 🚴 🏋️ 🧘 🍎 🥗 💧 😴 🛏️ 🌱 🌳 🌞 🌙 ☕ 🍳 🐶 🐱 ✈️ 🚗 💊 🩺 🧹'.split(' '),
  Faces: '😀 😄 😊 🙂 😐 😕 😢 😭 😡 😴 🤩 😎 🤓 🥳 😌 🤔 😬 🥲 😇 🤯'.split(' '),
  Symbols: '🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🟥 🟧 🟨 🟩 🟦 🟪 ⬛ ⬜ ❗ ❓ ➕ ➖ ✖️ ♾️ 💯 🔔 🚩 🏁 🔺 🔻 ⭕ ❌'.split(' ')
}

export function EmojiPicker({ onPick, onRemove }: { onPick: (e: string) => void; onRemove?: () => void }): JSX.Element {
  const [tab, setTab] = useState('Common')
  const [custom, setCustom] = useState('')
  return (
    <div className="emoji-picker">
      <div className="emoji-tabs">
        {Object.keys(EMOJI_SETS).map((k) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{k}</button>)}
      </div>
      <div className="emoji-grid">
        {EMOJI_SETS[tab].map((e) => <button key={e} onClick={() => onPick(e)}>{e}</button>)}
      </div>
      <div className="emoji-foot">
        <input id="emoji-custom" className="input input-sm" placeholder="Type or paste any emoji" value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && custom.trim()) onPick(custom.trim()) }} />
        {onRemove && <Button small kind="ghost" onClick={onRemove}>Remove</Button>}
      </div>
    </div>
  )
}

export function IconPickerButton({ value, onChange, size = 'md', placeholder = '📄' }: { value: string; onChange: (v: string) => void; size?: 'sm' | 'md' | 'lg'; placeholder?: string }): JSX.Element {
  const [el, setEl] = useState<HTMLElement | null>(null)
  return (
    <>
      <button className={`icon-pick icon-pick-${size}`} onClick={(e) => setEl(e.currentTarget)} title="Change icon">{value || placeholder}</button>
      {el && (
        <Popover anchor={el} onClose={() => setEl(null)} width={320}>
          <EmojiPicker onPick={(e) => { onChange(e); setEl(null) }} onRemove={() => { onChange(''); setEl(null) }} />
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
      <div className="empty-icon">{icon}</div>
      <div className="empty-title">{title}</div>
      {children}
    </div>
  )
}

/** Auto-growing textarea. */
export function AutoText({ value, onChange, className = '', placeholder, onKeyDown, autoFocus, id, inputRef, onFocus, onBlur, spellCheck }: {
  value: string; onChange: (v: string) => void; className?: string; placeholder?: string; onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void; autoFocus?: boolean; id?: string; inputRef?: (el: HTMLTextAreaElement | null) => void; onFocus?: () => void; onBlur?: () => void; spellCheck?: boolean
}): JSX.Element {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
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
