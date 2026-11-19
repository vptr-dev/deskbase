import type { CSSProperties } from 'react'
import type { WidgetStyle } from '../types'
import { DEFAULT_WIDGET_STYLE } from './defaults'
import { accentInk, readableOn } from './look'

const quote = (f: string): string => (/^[\w-]+$/.test(f) ? f : `"${f.replace(/"/g, '')}"`)

/** CSS variables for a widget's look (dashboard cards and desktop widgets share them). */
export function widgetVars(st: WidgetStyle): CSSProperties {
  const v: Record<string, string> = {
    '--w-radius': st.radius + 'px',
    '--w-pad': st.padding + 'px',
    '--w-border': String(st.border / 100),
    '--w-alpha': String(st.opacity / 100),
    '--w-zoom': String(st.scale / 100)
  }
  if (st.tint) v['--w-tint'] = st.tint
  if (st.accent) {
    const dark = st.theme === 'dark' || (st.theme === 'auto' && document.documentElement.dataset.theme === 'dark')
    v['--accent'] = st.accent
    v['--on-accent'] = readableOn(st.accent)
    v['--accent-ink'] = accentInk(st.accent, dark)
  }
  if (st.text) {
    v['--fg'] = st.text
    v['--fg-2'] = `color-mix(in srgb, ${st.text} 86%, transparent)`
    v['--muted'] = `color-mix(in srgb, ${st.text} 62%, transparent)`
    v['--faint'] = `color-mix(in srgb, ${st.text} 32%, transparent)`
    v['--glass-text'] = `linear-gradient(180deg, ${st.text} 35%, color-mix(in srgb, ${st.text} 70%, transparent) 100%)`
  }
  if (st.font) { v['--font'] = `${quote(st.font)}, var(--font-base)`; v['--font-display'] = `${quote(st.font)}, var(--font-display-base)` }
  return v as CSSProperties
}

export const fullStyle = (base: Partial<WidgetStyle> | undefined, own: Partial<WidgetStyle> | undefined): WidgetStyle => ({ ...DEFAULT_WIDGET_STYLE, ...(base ?? {}), ...(own ?? {}) })

/** Class names for a widget's look. */
export const widgetClass = (st: WidgetStyle): string => `mat-${st.material} ${st.shadow ? 'w-shadow' : ''} ${st.align === 'center' ? 'w-center' : ''} ${st.header ? '' : 'w-nohead'}`
