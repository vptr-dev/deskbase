import { type ReactNode, useEffect, useState } from 'react'
import { create } from 'zustand'
import { act, openView, setSettings, toast, useData } from '../store'
import type { Look, Settings, Surface } from '../types'
import { ACCENTS, BACKDROPS, DEFAULT_LOOK, DEFAULT_WIDGET_STYLE, normalizeLook } from '../lib/defaults'
import { FONT_CHOICES, PRESETS, TEXT_TONES, exportTheme, parseTheme, type ThemePreset } from '../lib/look'
import { api, isDesktop } from '../lib/api'
import { pickImageData } from '../lib/image'
import { Button, Checkbox, Segmented, SideIndex, Toggle, useSectionIndex } from '../components/ui'
import { Icon } from '../components/Icon'
import { DeskLookPicker, Field, StyleFields } from '../components/WidgetConfig'
import { fullStyle, widgetClass, widgetVars } from '../lib/widgetStyle'
import type { WidgetStyle } from '../types'

function Section({ id, title, icon, children, aside }: { id: string; title: string; icon: string; children: ReactNode; aside?: ReactNode }): JSX.Element {
  return (
    <section className="look-section glass" data-section={id}>
      <div className="look-section-head"><Icon name={icon} size={16} /><h3>{title}</h3><div className="spacer" />{aside}</div>
      <div className="look-rows">{children}</div>
    </section>
  )
}

function Row({ label, sub, children }: { label: string; sub?: string; children: ReactNode }): JSX.Element {
  return (
    <div className="look-row">
      <div className="look-label"><div>{label}</div>{sub && <div className="muted small">{sub}</div>}</div>
      <div className="look-control">{children}</div>
    </div>
  )
}

function Slider({ value, min, max, step = 1, onChange, unit = '' }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; unit?: string }): JSX.Element {
  return (
    <div className="slider">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="slider-val">{Number.isInteger(step) ? value : value.toFixed(2)}{unit}</span>
    </div>
  )
}

const setLook = (patch: Partial<Look>, key?: string): void => setSettings((s) => { s.look = { ...s.look, ...patch } }, key)

function applyPreset(p: ThemePreset): void {
  setSettings((s) => {
    s.theme = p.theme
    s.accent = p.accent
    s.backdrop = p.backdrop
    s.glassStrength = p.glassStrength
    s.font = p.font
    s.look = { ...DEFAULT_LOOK, surface: s.look.surface, panelSurface: s.look.panelSurface, backdropImage: s.look.backdropImage, customCss: s.look.customCss, fontFamily: '', headingFamily: '', ...p.look, preset: p.id }
  })
}

function PresetCard({ p, active }: { p: ThemePreset; active: boolean }): JSX.Element {
  const [a, b, c] = p.swatch
  return (
    <button className={`preset-card ${active ? 'active' : ''}`} onClick={() => applyPreset(p)}>
      <span className="preset-swatch" style={{ background: `radial-gradient(80% 90% at 0% 0%, ${a}, transparent), radial-gradient(80% 90% at 100% 100%, ${b}, transparent), ${p.theme === 'dark' ? '#14161f' : '#f4f5f8'}`, borderRadius: Math.min(14, (p.look.radius ?? 16) * 0.8) }}>
        <span className="preset-panel" style={{ borderRadius: Math.min(10, (p.look.radius ?? 16) * 0.55), background: p.theme === 'dark' ? 'rgba(30,32,44,.62)' : 'rgba(255,255,255,.66)' }}>
          <span className="preset-dot" style={{ background: c }} />
          <span className="preset-line" />
          <span className="preset-line short" />
        </span>
      </span>
      <span className="preset-name">{p.name}</span>
    </button>
  )
}

function FontInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }): JSX.Element {
  const [local, setLocal] = useState<string[]>([])
  const listId = 'fonts-' + placeholder.replace(/\W/g, '')
  const load = async (): Promise<void> => {
    try {
      const q = (window as any).queryLocalFonts
      if (!q) { toast('This version can only use the fonts in the list, or one you type.'); return }
      const fonts: { family: string }[] = await q()
      const fam = [...new Set(fonts.map((f) => f.family))].sort()
      setLocal(fam)
      toast(`Found ${fam.length} installed fonts`)
    } catch { toast('Could not read the installed fonts', { kind: 'error' }) }
  }
  return (
    <div className="row gap-sm grow">
      <input className="input input-sm grow" list={listId} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} style={value ? { fontFamily: `"${value}"` } : undefined} />
      <datalist id={listId}>{[...new Set([...FONT_CHOICES, ...local])].map((f) => <option key={f} value={f} />)}</datalist>
      <Button small kind="ghost" icon="search" title="Find installed fonts" onClick={load} />
      {value && <Button small kind="ghost" icon="x" title="Use the default" onClick={() => onChange('')} />}
    </div>
  )
}

const SURFACES: { value: Surface; name: string; sub: string }[] = [
  { value: 'glass', name: 'Glass', sub: 'Clear, with a light edge' },
  { value: 'blur', name: 'Blur', sub: 'Softens what is behind' },
  { value: 'frosted', name: 'Frosted', sub: 'Heavy blur' },
  { value: 'solid', name: 'Solid', sub: 'No see-through' }
]

const TONE_NAMES: [Look['textTone'], string][] = [['auto', 'Default'], ['soft', 'Soft'], ['ink', 'Ink'], ['warm', 'Warm'], ['cool', 'Cool'], ['custom', 'Your own']]

function SurfacePick({ value, onChange }: { value: Surface; onChange: (v: Surface) => void }): JSX.Element {
  return (
    <div className="surface-pick">
      {SURFACES.map((o) => (
        <button key={o.value} className={`surface-opt ${value === o.value ? 'active' : ''}`} onClick={() => onChange(o.value)}>
          <span className="surface-demo"><span className={`surface-demo-card s-${o.value}`}><i /><i /></span></span>
          <span className="surface-name">{o.name}</span>
          <span className="surface-sub">{o.sub}</span>
        </button>
      ))}
    </div>
  )
}

/** Which half of Appearance is open, and a section to jump to (the Desktop page links here). */
export const useLookPlace = create<{ place: 'app' | 'desktop'; section?: string }>(() => ({ place: 'app' }))
export function openLook(place: 'app' | 'desktop', section?: string): void {
  useLookPlace.setState({ place, section })
  openView('@appearance')
}

const APP_INDEX = [
  { id: 'themes', label: 'Themes', icon: 'palette' }, { id: 'color', label: 'Color', icon: 'droplet' }, { id: 'surface', label: 'Surface', icon: 'layers' },
  { id: 'background', label: 'Background', icon: 'image' }, { id: 'glass', label: 'Glass', icon: 'sliders-horizontal' }, { id: 'shape', label: 'Shape', icon: 'shapes' },
  { id: 'text', label: 'Text', icon: 'type' }, { id: 'motion', label: 'Motion', icon: 'activity' }, { id: 'preview', label: 'Preview', icon: 'eye' }, { id: 'css', label: 'Custom CSS', icon: 'code' }
]
const DESK_INDEX = [
  { id: 'd-looks', label: 'Looks', icon: 'wand-sparkles' }, { id: 'd-background', label: 'Background', icon: 'layers' }, { id: 'd-edges', label: 'Edges', icon: 'shapes' },
  { id: 'd-text', label: 'Text and titles', icon: 'type' }, { id: 'd-spacing', label: 'Spacing and arranging', icon: 'move' }, { id: 'd-reset', label: 'Reset', icon: 'restore' }
]

/** A sample panel in the shared panel style. */
function PanelSample({ st }: { st: WidgetStyle }): JSX.Element {
  return (
    <div className="look-panel-sample">
      <div className={`dw preview ${widgetClass(st)}`} data-theme={st.theme === 'auto' ? undefined : st.theme} style={widgetVars(st)}>
        {st.header && <div className="dw-head"><span className="widget-title ellipsis">Today</span></div>}
        <div className="dw-body">
          <div className="sample-row"><span className="sample-check on" />Plan the week</div>
          <div className="sample-row"><span className="sample-check" />Reply to Sam</div>
          <div className="sample-row"><span className="sample-check" />Gym at 6</div>
        </div>
      </div>
    </div>
  )
}

/** Everything about how the desktop panels look. Edits the style every panel shares. */
function DesktopPlace(): JSX.Element {
  const desk = useData((d) => d.desktop)
  const st = fullStyle(undefined, desk.style, 'auto')
  const shown = fullStyle(undefined, desk.style, 'glass')
  const own = desk.widgets.filter((w) => Object.keys(w.style ?? {}).length > 0).length
  const set = (p: Partial<WidgetStyle>): void => act((d) => { d.desktop.style = { ...d.desktop.style, ...p } }, { key: 'deskstyle' })
  return <>
    <Section id="d-looks" title="Looks" icon="wand-sparkles">
      <p className="muted small">Every panel on the desktop uses this style unless it has its own. Pick a look, then fine-tune it below.</p>
      <PanelSample st={shown} />
      <DeskLookPicker style={st} onPick={(p) => act((d) => { d.desktop.style = { ...d.desktop.style, ...p } })} />
    </Section>
    <Section id="d-background" title="Background" icon="layers"><StyleFields desktop part="background" style={st} set={set} /></Section>
    <Section id="d-edges" title="Edges" icon="shapes"><StyleFields desktop part="edges" style={st} set={set} /></Section>
    <Section id="d-text" title="Text and titles" icon="type"><StyleFields desktop part="text" style={st} set={set} /></Section>
    <Section id="d-spacing" title="Spacing and arranging" icon="move">
      <StyleFields desktop part="spacing" style={st} set={set} />
      <div className="form-grid style-fields">
        <Field label="Snap while moving"><Toggle checked={desk.snap} onChange={(v) => act((d) => { d.desktop.snap = v })} /></Field>
        {desk.snap && <Field label="Grid"><Segmented small value={desk.grid} onChange={(v) => act((d) => { d.desktop.grid = v })} options={[1, 4, 8, 16, 24].map((n) => ({ value: n, label: n === 1 ? 'Off' : `${n}px` }))} /></Field>}
      </div>
    </Section>
    <Section id="d-reset" title="Reset" icon="restore">
      <Row label="Panel style" sub="Back to the default look"><Button small kind="ghost" icon="restore" onClick={() => act((d) => { d.desktop.style = { ...DEFAULT_WIDGET_STYLE } })}>Reset</Button></Row>
      <Row label="Panels with their own style" sub={own ? `${own} panel${own === 1 ? '' : 's'} look different from the rest` : 'None'}>
        <Button small kind="ghost" icon="layers" disabled={!own} onClick={() => act((d) => { for (const w of d.desktop.widgets) w.style = {} })}>Use this style for all</Button>
      </Row>
    </Section>
  </>
}

export function AppearancePage(): JSX.Element {
  const s = useData((d) => d.settings)
  const l = s.look
  const isDark = document.documentElement.dataset.theme === 'dark'
  const blurs = [l.surface, l.panelSurface].some((x) => x === 'blur' || x === 'frosted')
  const set = (fn: (x: Settings) => void, key?: string): void => setSettings(fn, key)
  const [cssDraft, setCssDraft] = useState<string | null>(null)
  const place = useLookPlace((x) => x.place)
  const [mica, setMica] = useState<boolean | null>(null)
  useEffect(() => { api.info().then((i) => setMica(i.micaSupported)).catch(() => {}) }, [])
  const items = place === 'app' ? APP_INDEX : DESK_INDEX
  const { body, active, go } = useSectionIndex(items.map((x) => x.id), useLookPlace.getState().section)
  useEffect(() => { const sec = useLookPlace.getState().section; if (sec) requestAnimationFrame(() => go(sec)) }, [place])

  const importTheme = async (): Promise<void> => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async () => {
      const f = input.files?.[0]
      if (!f) return
      const t = parseTheme(await f.text())
      if (!t) { toast('That file is not a theme', { kind: 'error' }); return }
      setSettings((x) => { Object.assign(x, t); x.look = normalizeLook({ ...x.look, ...(t.look ?? {}) }) })
      toast('Theme applied')
    }
    input.click()
  }

  return (
    <div className="page page-appearance">
      <div className="page-header row between">
        <h1 className="page-title static">Appearance</h1>
        <Segmented value={place} onChange={(v) => useLookPlace.setState({ place: v, section: undefined })} options={[{ value: 'app', label: 'App' }, { value: 'desktop', label: 'Desktop panels' }]} />
      </div>
      <div className="look-layout">
        <SideIndex className="look-index" items={items} active={active} go={go} />
        <div className="look-main" ref={body} key={place}>
          {place === 'desktop' ? <DesktopPlace /> : <>
          <Section id="themes" title="Themes" icon="palette" aside={<>
            <Button small kind="ghost" icon="upload" onClick={importTheme}>Import</Button>
            <Button small kind="ghost" icon="download" onClick={() => api.exportFile(exportTheme(s), 'theme.json')}>Export</Button>
          </>}>
            <div className="preset-grid">
              {PRESETS.map((p) => <PresetCard key={p.id} p={p} active={l.preset === p.id} />)}
            </div>
          </Section>

          <Section id="color" title="Color" icon="droplet">
            <Row label="Mode"><Segmented small value={s.theme} onChange={(v) => set((x) => { x.theme = v })} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} /></Row>
            <Row label="Accent">
              <div className="color-dots">
                {ACCENTS.map((a) => <button key={a.value} title={a.name} className={`color-dot ${s.accent === a.value ? 'active' : ''}`} style={{ background: a.value }} onClick={() => set((x) => { x.accent = a.value })} />)}
                <label className="color-dot custom" title="Custom accent" style={!ACCENTS.some((a) => a.value === s.accent) ? { background: s.accent } : undefined}>
                  <Icon name="palette" size={12} />
                  <input type="color" value={s.accent} onChange={(e) => { const v = e.target.value; set((x) => { x.accent = v }, 'accent') }} />
                </label>
              </div>
            </Row>
          </Section>

          <Section id="surface" title="Surface" icon="layers">
            <SurfacePick value={l.surface} onChange={(v) => setLook({ surface: v })} />
            <Row label="Borders" sub="Edges of the app window and its cards"><Slider value={l.border} min={0} max={100} unit="%" onChange={(v) => setLook({ border: v }, 'border')} /></Row>
            <Row label="Border width"><Segmented small value={l.borderWidth} onChange={(v) => setLook({ borderWidth: v })} options={[{ value: 0, label: 'None' }, { value: 1, label: 'Thin' }, { value: 1.5, label: 'Medium' }, { value: 2, label: 'Thick' }]} /></Row>
          </Section>

          <Section id="background" title="Background" icon="image">
            <div className="backdrop-picker big">
              {BACKDROPS.map((b) => (
                <button key={b.id} title={b.name} className={`backdrop-swatch ${s.backdrop === b.id ? 'active' : ''}`} data-swatch={b.id}
                  style={b.id === 'image' && l.backdropImage ? { backgroundImage: `url("${l.backdropImage}")`, backgroundSize: 'cover' } : undefined}
                  onClick={async () => {
                    if (b.id === 'image' && !l.backdropImage) {
                      const src = await pickImageData(2560, 1600, 0.82)
                      if (!src) return
                      setSettings((x) => { x.look = { ...x.look, backdropImage: src }; x.backdrop = 'image' })
                      return
                    }
                    set((x) => { x.backdrop = b.id })
                  }}>
                  {b.id === 'mica' && <Icon name="monitor" size={14} />}
                  {b.id === 'image' && !l.backdropImage && <Icon name="image" size={14} />}
                  <span className="backdrop-name">{b.name}</span>
                </button>
              ))}
            </div>
            {s.backdrop === 'mica' && <p className="muted small">Shows your desktop through the window (Windows 11).</p>}
            {isDesktop && <Row label="Window material" sub={mica === false ? 'Mica needs Windows 11' : 'Used with the Desktop background'}>
              <Segmented small value={s.material} onChange={(v) => { set((x) => { x.material = v }); api.setMaterial(v) }} options={[{ value: 'mica', label: 'Mica' }, { value: 'acrylic', label: 'Acrylic' }, { value: 'none', label: 'Solid' }]} />
            </Row>}
            {s.backdrop === 'custom' && <>
              <Row label="Colors">
                <div className="row gap-sm">
                  {(['a', 'b', 'c'] as const).map((k) => (
                    <label key={k} className="color-dot custom big" style={{ background: l.gradient[k] }}>
                      <input type="color" value={l.gradient[k]} onChange={(e) => { const v = e.target.value; setLook({ gradient: { ...l.gradient, [k]: v } }, 'grad' + k) }} />
                    </label>
                  ))}
                </div>
              </Row>
              <Row label="Angle"><Slider value={l.gradient.angle} min={0} max={360} unit="°" onChange={(v) => setLook({ gradient: { ...l.gradient, angle: v } }, 'gangle')} /></Row>
            </>}
            {s.backdrop === 'image' && <>
              <Row label="Picture">
                <Button small icon="image" onClick={async () => { const src = await pickImageData(2560, 1600, 0.82); if (src) setLook({ backdropImage: src }) }}>Replace…</Button>
                <Button small kind="ghost" onClick={() => setSettings((x) => { x.look = { ...x.look, backdropImage: null }; x.backdrop = 'sky' })}>Remove</Button>
              </Row>
              <Row label="Blur"><Slider value={l.backdropBlur} min={0} max={60} unit="px" onChange={(v) => setLook({ backdropBlur: v }, 'bblur')} /></Row>
              <Row label="Dim" sub="Left lightens, right darkens"><Slider value={l.backdropDim} min={-60} max={60} onChange={(v) => setLook({ backdropDim: v }, 'bdim')} /></Row>
            </>}
          </Section>

          <Section id="glass" title="Glass" icon="sliders-horizontal">
            <Row label="Opacity"><Slider value={s.glassStrength} min={10} max={100} unit="%" onChange={(v) => set((x) => { x.glassStrength = v }, 'glass')} /></Row>
            {blurs && <>
              <Row label="Blur"><Slider value={l.blur} min={0} max={80} unit="px" onChange={(v) => setLook({ blur: v }, 'blur')} /></Row>
              <Row label="Color through glass"><Slider value={l.saturation} min={100} max={220} unit="%" onChange={(v) => setLook({ saturation: v }, 'sat')} /></Row>
            </>}
            <Row label="Top highlight"><Slider value={l.shine} min={0} max={100} unit="%" onChange={(v) => setLook({ shine: v }, 'shine')} /></Row>
            <Row label="Shadow depth"><Slider value={l.shadow} min={0} max={100} unit="%" onChange={(v) => setLook({ shadow: v }, 'shadow')} /></Row>
          </Section>

          <Section id="shape" title="Shape" icon="shapes">
            <Row label="Corner roundness"><Slider value={l.radius} min={0} max={32} unit="px" onChange={(v) => setLook({ radius: v }, 'radius')} /></Row>
            <Row label="Sidebar"><Segmented small value={l.sidebar} onChange={(v) => setLook({ sidebar: v })} options={[{ value: 'floating', label: 'Floating' }, { value: 'attached', label: 'Attached' }]} /></Row>
            <Row label="Density"><Segmented small value={s.density} onChange={(v) => set((x) => { x.density = v })} options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} /></Row>
            <Row label="Icon weight"><Slider value={l.iconStroke} min={1} max={2.75} step={0.25} onChange={(v) => setLook({ iconStroke: v }, 'stroke')} /></Row>
          </Section>

          <Section id="text" title="Text" icon="type">
            <Row label="Font"><Segmented small value={s.font} onChange={(v) => set((x) => { x.font = v })} options={[{ value: 'system', label: 'Default' }, { value: 'serif', label: 'Serif' }, { value: 'mono', label: 'Mono' }]} /></Row>
            <Row label="Custom font" sub="Any font installed on this PC"><FontInput value={l.fontFamily} placeholder="Body font" onChange={(v) => setLook({ fontFamily: v }, 'ff')} /></Row>
            <Row label="Heading font"><FontInput value={l.headingFamily} placeholder="Heading font" onChange={(v) => setLook({ headingFamily: v }, 'hf')} /></Row>
            <Row label="Heading weight"><Slider value={l.headingWeight} min={400} max={900} step={50} onChange={(v) => setLook({ headingWeight: v }, 'hw')} /></Row>
            <Row label="Text size"><Slider value={s.fontSize} min={12} max={18} unit="px" onChange={(v) => set((x) => { x.fontSize = v }, 'fs')} /></Row>
            <Row label="Line height"><Slider value={l.lineHeight} min={1.2} max={2} step={0.05} onChange={(v) => setLook({ lineHeight: v }, 'lh')} /></Row>
            <Row label="Letter spacing"><Slider value={l.letterSpacing} min={-4} max={8} onChange={(v) => setLook({ letterSpacing: v }, 'ls')} /></Row>
            <Row label="Text color">
              <div className="tone-row">
                {TONE_NAMES.map(([id, name]) => {
                  const c = id === 'custom' ? (isDark ? l.textDark : l.textLight) : TEXT_TONES[id][isDark ? 1 : 0]
                  return (
                    <button key={id} className={`tone-chip ${l.textTone === id ? 'active' : ''}`} onClick={() => setLook({ textTone: id })} title={name}>
                      <span className="tone-sample" style={{ color: c }}>Aa</span>{name}
                    </button>
                  )
                })}
              </div>
            </Row>
            {l.textTone === 'custom' && (
              <Row label="Your colors" sub="One for light mode, one for dark mode">
                <div className="row gap-8">
                  <label className="tone-pick"><input type="color" value={l.textLight} onChange={(e) => setLook({ textLight: e.target.value }, 'tl')} /> Light</label>
                  <label className="tone-pick"><input type="color" value={l.textDark} onChange={(e) => setLook({ textDark: e.target.value }, 'td')} /> Dark</label>
                </div>
              </Row>
            )}
            <Row label="Soft edges" sub="Softens the edges of letters"><Slider value={l.textSoft} min={0} max={100} unit="%" onChange={(v) => setLook({ textSoft: v }, 'tsoft')} /></Row>
          </Section>

          <Section id="motion" title="Motion" icon="activity">
            <Row label="Animations"><Segmented small value={l.motion} onChange={(v) => setLook({ motion: v })} options={[{ value: 'off', label: 'Off' }, { value: 'subtle', label: 'Subtle' }, { value: 'normal', label: 'Smooth' }, { value: 'lively', label: 'Lively' }]} /></Row>
            <Row label="Page change"><Segmented small value={l.pageTransition} onChange={(v) => setLook({ pageTransition: v })} options={[{ value: 'rise', label: 'Rise' }, { value: 'fade', label: 'Fade' }, { value: 'slide', label: 'Slide' }, { value: 'none', label: 'None' }]} /></Row>
            <Row label="Reduce motion" sub="Overrides everything above"><Toggle checked={s.reduceMotion} onChange={(v) => set((x) => { x.reduceMotion = v })} /></Row>
          </Section>

          <Section id="preview" title="Preview" icon="eye">
            <div className="look-specimen">
              <div className="specimen-card glass">
                <div className="specimen-title">Weekly planning</div>
                <p className="muted">Glass panels, corners, fonts and colors update as you change them.</p>
                <div className="row gap-sm wrap">
                  <Button kind="primary" small icon="plus">Primary</Button>
                  <Button small>Default</Button>
                  <Toggle checked onChange={() => {}} />
                  <Checkbox checked onChange={() => {}} />
                  <span className="status-pill" style={{ ['--c' as any]: 'var(--accent)' }}>In progress</span>
                </div>
              </div>
              <div className="specimen-card glass center">
                <div className="specimen-num glass-text">42</div>
                <div className="muted small">tasks done</div>
              </div>
            </div>
          </Section>

          <Section id="css" title="Custom CSS" icon="code" aside={<Button small kind="ghost" onClick={() => setLook({ customCss: '' })}>Clear</Button>}>
            <p className="muted small">For anything the settings don't cover. Applies to the app and the desktop panels (panels use the class <code>.dw</code>).</p>
            <textarea className="input input-area css-editor" spellCheck={false} rows={8} placeholder={'.sidebar { border-radius: 28px; }\n.dw .widget-title { letter-spacing: .1em; }'}
              value={cssDraft ?? l.customCss} onChange={(e) => setCssDraft(e.target.value)} />
            <div className="row gap-sm">
              <Button small kind="primary" disabled={cssDraft === null || cssDraft === l.customCss} onClick={() => { setLook({ customCss: cssDraft ?? '' }); setCssDraft(null) }}>Apply</Button>
              {cssDraft !== null && cssDraft !== l.customCss && <Button small kind="ghost" onClick={() => setCssDraft(null)}>Discard</Button>}
            </div>
          </Section>

          <div className="row gap-sm look-foot">
            <Button kind="ghost" icon="restore" onClick={() => applyPreset(PRESETS[0])}>Reset the app to the default look</Button>
          </div>
          </>}
        </div>
      </div>
    </div>
  )
}
