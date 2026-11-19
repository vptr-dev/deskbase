import { type ReactNode, useState } from 'react'
import { setSettings, toast, useData } from '../store'
import type { Look, Settings } from '../types'
import { ACCENTS, BACKDROPS, DEFAULT_LOOK, normalizeLook } from '../lib/defaults'
import { FONT_CHOICES, PRESETS, exportTheme, parseTheme, type ThemePreset } from '../lib/look'
import { api } from '../lib/api'
import { pickImageData } from '../lib/image'
import { Button, Checkbox, Segmented, Toggle } from '../components/ui'
import { Icon } from '../components/Icon'

function Section({ title, icon, children, aside }: { title: string; icon: string; children: ReactNode; aside?: ReactNode }): JSX.Element {
  return (
    <section className="look-section glass">
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
    s.look = { ...DEFAULT_LOOK, backdropImage: s.look.backdropImage, customCss: s.look.customCss, fontFamily: '', headingFamily: '', ...p.look, preset: p.id }
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

export function AppearancePage(): JSX.Element {
  const s = useData((d) => d.settings)
  const l = s.look
  const set = (fn: (x: Settings) => void, key?: string): void => setSettings(fn, key)
  const [cssDraft, setCssDraft] = useState<string | null>(null)

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
      <div className="page-header"><h1 className="page-title static">Appearance</h1></div>

      <Section title="Themes" icon="palette" aside={<>
        <Button small kind="ghost" icon="upload" onClick={importTheme}>Import</Button>
        <Button small kind="ghost" icon="download" onClick={() => api.exportFile(exportTheme(s), 'theme.json')}>Export</Button>
      </>}>
        <div className="preset-grid">
          {PRESETS.map((p) => <PresetCard key={p.id} p={p} active={l.preset === p.id} />)}
        </div>
      </Section>

      <Section title="Color" icon="droplet">
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

      <Section title="Background" icon="image">
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

      <Section title="Glass" icon="layers">
        <Row label="Panel opacity"><Slider value={s.glassStrength} min={10} max={100} unit="%" onChange={(v) => set((x) => { x.glassStrength = v }, 'glass')} /></Row>
        <Row label="Blur"><Slider value={l.blur} min={0} max={80} unit="px" onChange={(v) => setLook({ blur: v }, 'blur')} /></Row>
        <Row label="Color through glass"><Slider value={l.saturation} min={100} max={220} unit="%" onChange={(v) => setLook({ saturation: v }, 'sat')} /></Row>
        <Row label="Edge shine"><Slider value={l.shine} min={0} max={100} unit="%" onChange={(v) => setLook({ shine: v }, 'shine')} /></Row>
        <Row label="Shadow depth"><Slider value={l.shadow} min={0} max={100} unit="%" onChange={(v) => setLook({ shadow: v }, 'shadow')} /></Row>
      </Section>

      <Section title="Shape" icon="shapes">
        <Row label="Corner roundness"><Slider value={l.radius} min={0} max={32} unit="px" onChange={(v) => setLook({ radius: v }, 'radius')} /></Row>
        <Row label="Sidebar"><Segmented small value={l.sidebar} onChange={(v) => setLook({ sidebar: v })} options={[{ value: 'floating', label: 'Floating' }, { value: 'attached', label: 'Attached' }]} /></Row>
        <Row label="Density"><Segmented small value={s.density} onChange={(v) => set((x) => { x.density = v })} options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} /></Row>
        <Row label="Icon weight"><Slider value={l.iconStroke} min={1} max={2.75} step={0.25} onChange={(v) => setLook({ iconStroke: v }, 'stroke')} /></Row>
      </Section>

      <Section title="Text" icon="type">
        <Row label="Font"><Segmented small value={s.font} onChange={(v) => set((x) => { x.font = v })} options={[{ value: 'system', label: 'Default' }, { value: 'serif', label: 'Serif' }, { value: 'mono', label: 'Mono' }]} /></Row>
        <Row label="Custom font" sub="Any font installed on this PC"><FontInput value={l.fontFamily} placeholder="Body font" onChange={(v) => setLook({ fontFamily: v }, 'ff')} /></Row>
        <Row label="Heading font"><FontInput value={l.headingFamily} placeholder="Heading font" onChange={(v) => setLook({ headingFamily: v }, 'hf')} /></Row>
        <Row label="Heading weight"><Slider value={l.headingWeight} min={400} max={900} step={50} onChange={(v) => setLook({ headingWeight: v }, 'hw')} /></Row>
        <Row label="Text size"><Slider value={s.fontSize} min={12} max={18} unit="px" onChange={(v) => set((x) => { x.fontSize = v }, 'fs')} /></Row>
        <Row label="Line height"><Slider value={l.lineHeight} min={1.2} max={2} step={0.05} onChange={(v) => setLook({ lineHeight: v }, 'lh')} /></Row>
        <Row label="Letter spacing"><Slider value={l.letterSpacing} min={-4} max={8} onChange={(v) => setLook({ letterSpacing: v }, 'ls')} /></Row>
      </Section>

      <Section title="Motion" icon="activity">
        <Row label="Animations"><Segmented small value={l.motion} onChange={(v) => setLook({ motion: v })} options={[{ value: 'off', label: 'Off' }, { value: 'subtle', label: 'Subtle' }, { value: 'normal', label: 'Smooth' }, { value: 'lively', label: 'Lively' }]} /></Row>
        <Row label="Page change"><Segmented small value={l.pageTransition} onChange={(v) => setLook({ pageTransition: v })} options={[{ value: 'rise', label: 'Rise' }, { value: 'fade', label: 'Fade' }, { value: 'slide', label: 'Slide' }, { value: 'none', label: 'None' }]} /></Row>
        <Row label="Reduce motion" sub="Overrides everything above"><Toggle checked={s.reduceMotion} onChange={(v) => set((x) => { x.reduceMotion = v })} /></Row>
      </Section>

      <Section title="Preview" icon="eye">
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

      <Section title="Custom CSS" icon="code" aside={<Button small kind="ghost" onClick={() => setLook({ customCss: '' })}>Clear</Button>}>
        <p className="muted small">For anything the settings don't cover. Applies to the app and desktop panels (desktop panels use the class <code>.dw</code>).</p>
        <textarea className="input input-area css-editor" spellCheck={false} rows={8} placeholder={'.sidebar { border-radius: 28px; }\n.dw .widget-title { letter-spacing: .1em; }'}
          value={cssDraft ?? l.customCss} onChange={(e) => setCssDraft(e.target.value)} />
        <div className="row gap-sm">
          <Button small kind="primary" disabled={cssDraft === null || cssDraft === l.customCss} onClick={() => { setLook({ customCss: cssDraft ?? '' }); setCssDraft(null) }}>Apply</Button>
          {cssDraft !== null && cssDraft !== l.customCss && <Button small kind="ghost" onClick={() => setCssDraft(null)}>Discard</Button>}
        </div>
      </Section>

      <div className="row gap-sm look-foot">
        <Button kind="ghost" icon="restore" onClick={() => applyPreset(PRESETS[0])}>Reset everything to the default look</Button>
      </div>
    </div>
  )
}
