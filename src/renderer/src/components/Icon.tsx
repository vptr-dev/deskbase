import { createElement } from 'react'
import { ICON_DATA, UI_ICONS } from '../lib/icon-data'
import { emojiToIcon } from '../../../shared/emoji-icons'

/** Resolves an interface name ("trash") or icon name ("trash-2") to drawable data. */
export function iconNode(name: string): (typeof ICON_DATA)[string] | null {
  return ICON_DATA[UI_ICONS[name] ?? name] ?? null
}

export const hasIcon = (name: string): boolean => Boolean(iconNode(name))

/** Line icon. Stroke width follows the appearance setting unless `stroke` is given. */
export function Icon({ name, size = 16, stroke, className = '', fill, color, title }: {
  name: string; size?: number; stroke?: number; className?: string; fill?: boolean; color?: string; title?: string
}): JSX.Element {
  const node = iconNode(name) ?? iconNode('file-text')!
  return (
    <svg
      className={`ic ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ ...(stroke ? { strokeWidth: stroke } : {}), ...(color ? { color } : {}) }}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      {node.map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
    </svg>
  )
}

/** A user-chosen icon (page, habit, goal…). Old emoji values are shown as the closest line icon. */
export function Glyph({ value, fallback = 'file-text', size = 16, color, className = '' }: { value?: string | null; fallback?: string; size?: number; color?: string; className?: string }): JSX.Element {
  const name = emojiToIcon(value, fallback)
  return <Icon name={hasIcon(name) ? name : fallback} size={size} color={color} className={`glyph ${className}`} />
}
