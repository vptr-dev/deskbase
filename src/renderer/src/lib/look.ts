import type { Look, Settings } from '../types'
import { DEFAULT_LOOK } from './defaults'

/** A starting point for the whole look. Picking one overwrites these settings; everything stays editable. */
export interface ThemePreset {
  id: string
  name: string
  theme: Settings['theme']
  accent: string
  backdrop: string
  glassStrength: number
  font: Settings['font']
  look: Partial<Look>
  /** colors for the preview swatch */
  swatch: [string, string, string]
}

export const PRESETS: ThemePreset[] = [
  { id: 'glass', name: 'Glass', theme: 'system', accent: '#0a84ff', backdrop: 'sky', glassStrength: 55, font: 'system', look: { radius: 16, blur: 28, shine: 70, shadow: 45, saturation: 160, motion: 'normal', sidebar: 'floating', headingWeight: 650 }, swatch: ['#bcdcff', '#e2d6ff', '#0a84ff'] },
  { id: 'clear', name: 'Clear', theme: 'system', accent: '#0a84ff', backdrop: 'mica', glassStrength: 30, font: 'system', look: { radius: 14, blur: 36, shine: 85, shadow: 25, saturation: 180, sidebar: 'floating' }, swatch: ['#d9dee7', '#f1f3f7', '#0a84ff'] },
  { id: 'ocean', name: 'Ocean', theme: 'light', accent: '#0a7cff', backdrop: 'ocean', glassStrength: 50, font: 'system', look: { radius: 18, blur: 30, shine: 75, shadow: 50, saturation: 170 }, swatch: ['#9fd8ff', '#7ce7ef', '#0a7cff'] },
  { id: 'sunset', name: 'Sunset', theme: 'light', accent: '#ff6b3d', backdrop: 'sunset', glassStrength: 52, font: 'system', look: { radius: 20, blur: 30, shine: 70, shadow: 45, saturation: 170 }, swatch: ['#ffc6a5', '#ffb3c7', '#ff6b3d'] },
  { id: 'rose', name: 'Rose', theme: 'light', accent: '#e84a8a', backdrop: 'rose', glassStrength: 55, font: 'system', look: { radius: 22, blur: 28, shine: 80, shadow: 40, headingWeight: 600 }, swatch: ['#ffd0e2', '#e9d4ff', '#e84a8a'] },
  { id: 'forest', name: 'Forest', theme: 'dark', accent: '#3ddc84', backdrop: 'forest', glassStrength: 50, font: 'system', look: { radius: 14, blur: 30, shine: 45, shadow: 60 }, swatch: ['#123a2c', '#1d5a44', '#3ddc84'] },
  { id: 'midnight', name: 'Midnight', theme: 'dark', accent: '#7a7cff', backdrop: 'midnight', glassStrength: 55, font: 'system', look: { radius: 16, blur: 32, shine: 40, shadow: 70, saturation: 150 }, swatch: ['#1d2a52', '#34204a', '#7a7cff'] },
  { id: 'aurora', name: 'Aurora', theme: 'dark', accent: '#30d1a0', backdrop: 'aurora', glassStrength: 50, font: 'system', look: { radius: 18, blur: 34, shine: 50, shadow: 60, saturation: 190 }, swatch: ['#0f5248', '#2c2470', '#30d1a0'] },
  { id: 'graphite', name: 'Graphite', theme: 'dark', accent: '#a1a1aa', backdrop: 'graphite', glassStrength: 60, font: 'system', look: { radius: 10, blur: 20, shine: 30, shadow: 55, saturation: 100, sidebar: 'attached', headingWeight: 600 }, swatch: ['#26272b', '#3a3b40', '#a1a1aa'] },
  { id: 'paper', name: 'Paper', theme: 'light', accent: '#c2410c', backdrop: 'paper', glassStrength: 90, font: 'serif', look: { surface: 'solid', radius: 8, blur: 0, shine: 20, shadow: 20, saturation: 100, sidebar: 'attached', headingWeight: 700, lineHeight: 1.6 }, swatch: ['#f6f1e7', '#ebe3d3', '#c2410c'] },
  { id: 'mono', name: 'Mono', theme: 'light', accent: '#111111', backdrop: 'paper', glassStrength: 95, font: 'mono', look: { surface: 'solid', radius: 4, blur: 0, shine: 0, shadow: 10, saturation: 100, sidebar: 'attached', headingWeight: 700, motion: 'subtle' }, swatch: ['#ffffff', '#e5e5e5', '#111111'] },
  { id: 'neon', name: 'Neon', theme: 'dark', accent: '#ff2fd6', backdrop: 'custom', glassStrength: 45, font: 'system', look: { radius: 18, blur: 40, shine: 60, shadow: 80, saturation: 220, motion: 'lively', gradient: { a: '#2b0a3d', b: '#0b1e4f', c: '#ff2fd6', angle: 140 } }, swatch: ['#2b0a3d', '#0b1e4f', '#ff2fd6'] }
]

/** Common Windows fonts offered in the font picker (any installed font name can be typed too). */
export const FONT_CHOICES = [
  'Segoe UI Variable Text', 'Segoe UI', 'Aptos', 'Inter', 'Bahnschrift', 'Calibri', 'Candara', 'Corbel', 'Trebuchet MS', 'Verdana',
  'Georgia', 'Cambria', 'Palatino Linotype', 'Book Antiqua', 'Constantia', 'Sitka Text', 'Cascadia Code', 'Consolas', 'Lucida Console'
]

const MOTION_SPEED: Record<Look['motion'], number> = { off: 0, subtle: 0.65, normal: 1, lively: 1.25 }

function luminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})/i.exec(hex || '')
  if (!m) return null
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1]
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** The accent as text or icon color: deepened when it is too pale for a light background, lifted when too dark for a dark one. */
export function accentInk(hex: string, dark: boolean): string {
  const l = luminance(hex)
  if (l === null) return hex
  if (!dark && l > 0.4) return `color-mix(in oklab, ${hex} ${Math.round(100 - (l - 0.4) * 110)}%, #10213f)`
  if (dark && l < 0.06) return `color-mix(in oklab, ${hex} 60%, #ffffff)`
  return hex
}

/** Black or white, whichever reads better on a color. */
export function readableOn(hex: string): string {
  const l = luminance(hex)
  return l !== null && l > 0.42 ? '#14161c' : '#ffffff'
}

const quote = (f: string): string => (/^[\w-]+$/.test(f) ? f : `"${f.replace(/"/g, '')}"`)

/** CSS variables and data attributes for a look. Applied to the main document and every widget window. */
export function applyLook(root: HTMLElement, s: Settings, dark: boolean): void {
  const l: Look = { ...DEFAULT_LOOK, ...(s.look ?? {}) }
  const set = (k: string, v: string): void => root.style.setProperty(k, v)
  root.dataset.theme = dark ? 'dark' : 'light'
  root.dataset.density = s.density
  root.dataset.font = s.font
  root.dataset.backdrop = s.backdrop || 'sky'
  root.dataset.motion = s.reduceMotion ? 'off' : l.motion
  root.dataset.transition = l.pageTransition
  root.dataset.sidebar = l.sidebar
  root.classList.toggle('reduce-motion', s.reduceMotion || l.motion === 'off')
  set('--accent', s.accent)
  set('--on-accent', readableOn(s.accent))
  set('--accent-ink', accentInk(s.accent, dark))
  set('--fs', s.fontSize + 'px')
  set('--sidebar-w', s.sidebarWidth + 'px')
  set('--glass', String(s.glassStrength / 100))
  set('--radius', l.radius + 'px')
  set('--radius-sm', Math.round(l.radius * 0.62) + 'px')
  set('--radius-panel', Math.round(l.radius + 4) + 'px')
  // Surface: glass and solid have no blur, frosted doubles it. Cards that pick blur themselves use the -base values.
  const surface = l.surface || 'glass'
  const k = surface === 'blur' ? 1 : surface === 'frosted' ? 1.8 : 0
  root.dataset.surface = surface
  set('--solid', surface === 'solid' ? '1' : '0')
  set('--blur-base', l.blur + 'px')
  set('--sat-base', (l.saturation / 100).toFixed(2))
  set('--blur', Math.round(l.blur * k) + 'px')
  set('--blur-strong', Math.round(l.blur * 1.4 * k) + 'px')
  set('--sat', k ? (l.saturation / 100).toFixed(2) : '1')
  set('--shine', (l.shine / 100).toFixed(2))
  set('--depth', (l.shadow / 100).toFixed(2))
  set('--h-weight', String(l.headingWeight))
  set('--lh', String(l.lineHeight))
  set('--ls', (l.letterSpacing / 100).toFixed(3) + 'em')
  set('--icon-stroke', String(l.iconStroke))
  set('--speed', String(MOTION_SPEED[s.reduceMotion ? 'off' : l.motion] || 0.001))
  if (l.fontFamily) set('--font-custom', `${quote(l.fontFamily)}, `)
  else root.style.removeProperty('--font-custom')
  if (l.headingFamily) set('--font-heading', `${quote(l.headingFamily)}, `)
  else root.style.removeProperty('--font-heading')
  const g = l.gradient
  set('--backdrop-custom', `radial-gradient(1100px 800px at 0% 0%, ${g.a} 0%, transparent 62%), radial-gradient(900px 800px at 100% 100%, ${g.c} 0%, transparent 60%), linear-gradient(${g.angle}deg, ${g.a}, ${g.b} 55%, ${g.c})`)
  if (l.backdropImage) set('--backdrop-image', `url("${l.backdropImage}")`)
  else root.style.removeProperty('--backdrop-image')
  set('--backdrop-blur', l.backdropBlur + 'px')
  set('--backdrop-dim', String(l.backdropDim / 100))
}

/** Keeps a <style> element with the user's own CSS in a document. */
export function applyCustomCss(doc: Document, css: string): void {
  let el = doc.getElementById('custom-css') as HTMLStyleElement | null
  if (!css.trim()) { el?.remove(); return }
  if (!el) {
    el = doc.createElement('style')
    el.id = 'custom-css'
    doc.head.appendChild(el)
  }
  if (el.textContent !== css) el.textContent = css
}

/** Look settings worth saving or sharing as a theme file. */
export function exportTheme(s: Settings): string {
  return JSON.stringify({ deskbase: 'theme', version: 1, theme: s.theme, accent: s.accent, backdrop: s.backdrop, glassStrength: s.glassStrength, font: s.font, fontSize: s.fontSize, density: s.density, look: s.look }, null, 2)
}

export function parseTheme(text: string): Partial<Settings> | null {
  try {
    const t = JSON.parse(text)
    if (!t || (t.deskbase !== 'theme' && t.planner !== 'theme')) return null
    const out: Partial<Settings> = {}
    if (['system', 'light', 'dark'].includes(t.theme)) out.theme = t.theme
    if (typeof t.accent === 'string' && /^#[0-9a-f]{3,8}$/i.test(t.accent)) out.accent = t.accent
    if (typeof t.backdrop === 'string') out.backdrop = t.backdrop
    if (typeof t.glassStrength === 'number') out.glassStrength = Math.max(10, Math.min(100, t.glassStrength))
    if (['system', 'serif', 'mono'].includes(t.font)) out.font = t.font
    if (typeof t.fontSize === 'number') out.fontSize = Math.max(12, Math.min(18, t.fontSize))
    if (t.density === 'compact' || t.density === 'comfortable') out.density = t.density
    if (t.look && typeof t.look === 'object') out.look = t.look
    return out
  } catch {
    return null
  }
}
