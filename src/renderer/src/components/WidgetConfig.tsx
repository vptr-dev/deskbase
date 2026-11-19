import type { ReactNode } from 'react'
import { useData } from '../store'
import type { DeskMaterial, Page, WidgetStyle } from '../types'
import { STATS, type AnyWidget, widgetTitle } from './Widgets'
import { createValue } from './Values'
import { Button, Segmented, Toggle } from './ui'
import { Icon } from './Icon'
import { pickImageData } from '../lib/image'
import { FONT_CHOICES } from '../lib/look'

export function Field({ label, children, sub }: { label: string; children: ReactNode; sub?: string }): JSX.Element {
  return (
    <>
      <label className="field-label">{label}{sub && <span className="muted small">{sub}</span>}</label>
      <div className="row gap-sm wrap field-body">{children}</div>
    </>
  )
}

function PagePicker({ value, onChange, pages, empty = 'Choose…' }: { value: string; onChange: (v: string | null) => void; pages: Page[]; empty?: string }): JSX.Element {
  const d = useData((x) => x)
  const label = (p: Page): string => {
    const parts: string[] = []
    let cur: Page | undefined = p
    while (cur) { parts.unshift(cur.title || 'Untitled'); cur = cur.parentId ? d.pages[cur.parentId] : undefined }
    return parts.join(' / ') + (p.source?.kind === 'notion' ? '  (Notion)' : '')
  }
  return (
    <select className="input input-sm grow" value={value} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{empty}</option>
      {pages.map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}
    </select>
  )
}

/** Settings for what a widget shows. `patch` changes the widget, `set` one config key. */
export function WidgetConfigFields({ w, set, patch, selfPageId }: {
  w: AnyWidget
  set: (key: string, value: any) => void
  patch: (fn: (w: AnyWidget) => void) => void
  selfPageId?: string
}): JSX.Element {
  const d = useData((x) => x)
  const c = w.config
  const live = Object.values(d.pages).filter((p) => !p.deletedAt && !p.rowOf)
  const values = Object.values(d.values).sort((a, b) => a.order - b.order)
  const dbs = live.filter((p) => p.type === 'database')
  const lists = live.filter((p) => p.type === 'tasks' || p.type === 'board')
  const docs = live.filter((p) => p.id !== selfPageId)
  const db = c.dbId ? d.pages[c.dbId]?.db : undefined
  const flagProps = db?.props.filter((p) => ['status', 'select', 'multi', 'checkbox'].includes(p.type)) ?? []
  const flagProp = flagProps.find((p) => p.id === c.prop)
  const page = c.pageId ? d.pages[c.pageId] : undefined
  const headings = page ? page.blocks.filter((b) => ['h1', 'h2', 'h3'].includes(b.type) && b.text.trim()).map((b) => b.text.trim()) : []

  const valuePicker = (
    <Field label="Value">
      <select className="input input-sm" value={c.valueId ?? ''} onChange={(e) => set('valueId', e.target.value || null)}>
        <option value="">Choose…</option>
        {values.map((v) => <option key={v.id} value={v.id}>{v.name || 'Untitled'}</option>)}
      </select>
      <Button small kind="ghost" icon="plus" onClick={() => { const id = createValue('New value'); set('valueId', id) }}>New value</Button>
    </Field>
  )
  const dbPicker = (withFlag: boolean): JSX.Element => (
    <>
      <Field label="Database">
        <PagePicker value={c.dbId ?? ''} pages={dbs} onChange={(v) => patch((x) => { x.config.dbId = v; x.config.viewId = null; x.config.prop = null; x.config.option = null })} />
      </Field>
      {withFlag && db && (
        <Field label="Count rows where">
          <select className="input input-sm" value={c.prop ?? ''} onChange={(e) => patch((x) => { x.config.prop = e.target.value || null; x.config.option = null })}>
            <option value="">{w.type === 'stat' ? 'All rows' : 'Choose a property'}</option>
            {flagProps.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {flagProp && flagProp.type !== 'checkbox' && (
            <select className="input input-sm" value={c.option ?? ''} onChange={(e) => set('option', e.target.value || null)}>
              <option value="">Choose…</option>
              {(flagProp.options ?? []).map((o) => <option key={o.id} value={o.id}>is {o.name}</option>)}
            </select>
          )}
          {flagProp?.type === 'checkbox' && <span className="muted small">is checked</span>}
        </Field>
      )}
    </>
  )
  const sectionPicker = page && headings.length > 0 && (
    <Field label="Section" sub="Only what's under one heading">
      <select className="input input-sm grow" value={c.section ?? ''} onChange={(e) => set('section', e.target.value || null)}>
        <option value="">Whole page</option>
        {[...new Set(headings)].map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
    </Field>
  )

  return (
    <div className="form-grid">
      {w.type === 'value' && <>{valuePicker}
        <Field label="Step"><input className="input input-sm w-80" type="number" step="any" value={c.step ?? 1} onChange={(e) => set('step', Number(e.target.value) || 1)} /></Field>
        <Field label="Small chart"><Toggle checked={c.showChart !== false} onChange={(v) => set('showChart', v)} /></Field>
      </>}
      {w.type === 'chart' && <>
        <Field label="Show">
          <select className="input input-sm" value={c.source ?? 'tasks'} onChange={(e) => set('source', e.target.value)}>
            <option value="tasks">Tasks completed</option>
            <option value="habits">Habits done</option>
            <option value="focus">Focus minutes</option>
            <option value="value">A value</option>
            <option value="metric">A tracker</option>
          </select>
        </Field>
        {c.source === 'value' && <>{valuePicker}<Field label="Running total"><Toggle checked={!!c.cumulative} onChange={(v) => set('cumulative', v)} /></Field></>}
        {c.source === 'metric' && (
          <Field label="Tracker">
            <select className="input input-sm" value={c.metricId ?? ''} onChange={(e) => set('metricId', e.target.value || null)}>
              <option value="">Choose…</option>
              {Object.values(d.metrics).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Days"><Segmented small value={c.days ?? 14} onChange={(v) => set('days', v)} options={[7, 14, 30, 90].map((n) => ({ value: n, label: String(n) }))} /></Field>
        <Field label="Style"><Segmented small value={c.kind ?? 'bar'} onChange={(v) => set('kind', v)} options={[{ value: 'bar', label: 'Bars' }, { value: 'line', label: 'Line' }]} /></Field>
      </>}
      {w.type === 'progress' && <>
        <Field label="Track"><Segmented small value={c.source ?? 'value'} onChange={(v) => set('source', v)} options={[{ value: 'value', label: 'Value vs goal' }, { value: 'db', label: 'Database rows' }]} /></Field>
        {(c.source ?? 'value') === 'value' ? valuePicker : dbPicker(true)}
      </>}
      {w.type === 'stat' && <>
        <Field label="Number">
          <select className="input input-sm" value={c.stat ?? 'tasksToday'} onChange={(e) => set('stat', e.target.value)}>
            {STATS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Field>
        {c.stat === 'rows' && dbPicker(true)}
        <Field label="Label"><input className="input input-sm" placeholder="Default" value={c.label ?? ''} onChange={(e) => set('label', e.target.value)} /></Field>
      </>}
      {w.type === 'tasks' && <>
        <Field label="Show"><Segmented small value={c.filter ?? 'today'} onChange={(v) => set('filter', v)} options={[{ value: 'today', label: 'Today' }, { value: 'overdue', label: 'Overdue' }, { value: 'upcoming', label: 'Next 7 days' }, { value: 'all', label: 'All open' }]} /></Field>
        <Field label="From"><PagePicker value={c.pageId ?? ''} pages={lists} empty="All lists" onChange={(v) => set('pageId', v)} /></Field>
        <Field label="Quick add"><Toggle checked={c.quickAdd !== false} onChange={(v) => set('quickAdd', v)} /></Field>
      </>}
      {w.type === 'agenda' && <Field label="Days"><Segmented small value={c.days ?? 5} onChange={(v) => set('days', v)} options={[3, 5, 7, 14].map((n) => ({ value: n, label: String(n) }))} /></Field>}
      {w.type === 'database' && <>{dbPicker(false)}
        {db && (
          <Field label="View">
            <select className="input input-sm" value={c.viewId ?? ''} onChange={(e) => set('viewId', e.target.value || null)}>
              <option value="">Show view tabs</option>
              {db.views.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </Field>
        )}
      </>}
      {(w.type === 'pageview' || w.type === 'checklist') && <>
        <Field label="Page"><PagePicker value={c.pageId ?? ''} pages={docs.filter((p) => p.type === 'doc')} onChange={(v) => patch((x) => { x.config.pageId = v; x.config.section = null })} /></Field>
        {sectionPicker}
        {w.type === 'checklist' && <Field label="Include subpages"><Toggle checked={!!c.subpages} onChange={(v) => set('subpages', v)} /></Field>}
        <Field label="Hide checked items"><Toggle checked={!!c.hideChecked} onChange={(v) => set('hideChecked', v)} /></Field>
        {page?.source?.kind === 'notion' && <div className="field-note"><Icon name="refresh" size={13} /> This page comes from Notion and refreshes on its own.</div>}
      </>}
      {w.type === 'dashboard' && <Field label="Dashboard"><PagePicker value={c.pageId ?? ''} pages={docs.filter((p) => p.type === 'dashboard')} onChange={(v) => set('pageId', v)} /></Field>}
      {w.type === 'clock' && <>
        <Field label="Style"><Segmented small value={c.style ?? 'digital'} onChange={(v) => set('style', v)} options={[{ value: 'digital', label: 'Digital' }, { value: 'big', label: 'Stacked' }, { value: 'analog', label: 'Analog' }]} /></Field>
        <Field label="Seconds"><Toggle checked={!!c.seconds} onChange={(v) => set('seconds', v)} /></Field>
      </>}
      {w.type === 'countdown' && <>
        <Field label="What"><input className="input input-sm" value={c.title ?? ''} placeholder="Trip, launch, birthday…" onChange={(e) => set('title', e.target.value)} /></Field>
        <Field label="Date"><input className="input input-sm" type="date" value={c.date ?? ''} onChange={(e) => set('date', e.target.value)} /></Field>
        <Field label="Every year"><Toggle checked={!!c.yearly} onChange={(v) => set('yearly', v)} /></Field>
      </>}
      {w.type === 'quickadd' && <Field label="Add to"><PagePicker value={c.pageId ?? ''} pages={lists} empty="First to-do list" onChange={(v) => set('pageId', v)} /></Field>}
      {w.type === 'page' && <Field label="Page"><PagePicker value={c.pageId ?? ''} pages={docs} onChange={(v) => set('pageId', v)} /></Field>}
      {w.type === 'text' && <>
        <Field label="Text"><textarea className="input input-area grow" rows={2} value={c.text ?? ''} placeholder="Stay curious" onChange={(e) => set('text', e.target.value)} /></Field>
        <Field label="Small line"><input className="input input-sm grow" value={c.sub ?? ''} placeholder="Optional" onChange={(e) => set('sub', e.target.value)} /></Field>
        <Field label="Size"><input type="range" min={12} max={96} value={c.size ?? 28} onChange={(e) => set('size', Number(e.target.value))} /><span className="muted small w-40">{c.size ?? 28}px</span></Field>
        <Field label="Weight"><Segmented small value={c.weight ?? 650} onChange={(v) => set('weight', v)} options={[{ value: 300, label: 'Light' }, { value: 450, label: 'Regular' }, { value: 650, label: 'Bold' }, { value: 800, label: 'Heavy' }]} /></Field>
        <Field label="Align"><Segmented small value={c.align ?? 'start'} onChange={(v) => set('align', v)} options={[{ value: 'start', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'end', label: 'Right' }]} /></Field>
        <Field label="Glass text"><Toggle checked={c.glass !== false} onChange={(v) => set('glass', v)} /></Field>
      </>}
      {w.type === 'image' && <>
        <Field label="Picture">
          <Button small icon="image" onClick={async () => { const src = await pickImageData(); if (src) set('src', src) }}>{c.src ? 'Replace…' : 'Choose…'}</Button>
          {c.src && <Button small kind="ghost" onClick={() => set('src', null)}>Remove</Button>}
        </Field>
        <Field label="Fit"><Segmented small value={c.fit ?? 'cover'} onChange={(v) => set('fit', v)} options={[{ value: 'cover', label: 'Fill' }, { value: 'contain', label: 'Fit' }]} /></Field>
      </>}
    </div>
  )
}

export function TitleField({ w, setTitle }: { w: AnyWidget; setTitle: (t: string | undefined) => void }): JSX.Element {
  const d = useData((x) => x)
  return (
    <div className="form-grid">
      <Field label="Title">
        <input className="input input-sm grow" placeholder={widgetTitle({ ...w, title: undefined }, d) || 'No title'} value={w.title ?? ''} onChange={(e) => setTitle(e.target.value || undefined)} />
      </Field>
    </div>
  )
}

const SWATCHES = ['', '#ffffff', '#f2f2f7', '#1c1c1e', '#000000', '#0a84ff', '#5e5ce6', '#bf5af2', '#ff375f', '#ff9f0a', '#30d158', '#40c8e0']

export function ColorField({ value, onChange, auto = 'Auto' }: { value: string; onChange: (v: string) => void; auto?: string }): JSX.Element {
  return (
    <div className="color-field">
      {SWATCHES.map((c) => (
        <button key={c || 'auto'} className={`color-dot ${value === c ? 'active' : ''} ${c ? '' : 'auto'}`} style={c ? { background: c } : undefined} title={c || auto} onClick={() => onChange(c)} />
      ))}
      <label className="color-dot custom" title="Custom color" style={value && !SWATCHES.includes(value) ? { background: value } : undefined}>
        <Icon name="palette" size={12} />
        <input type="color" value={value || '#888888'} onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  )
}

const MATERIALS: { value: DeskMaterial; label: string; icon: string }[] = [
  { value: 'blur', label: 'Glass', icon: 'droplet' },
  { value: 'acrylic', label: 'Frosted', icon: 'snowflake' },
  { value: 'tint', label: 'Solid', icon: 'square' },
  { value: 'clear', label: 'None', icon: 'eye-off' }
]

/** Look of a widget. `inherit` shows which values come from the shared default style. */
export function StyleFields({ style, set, desktop, inherit }: { style: WidgetStyle; set: (patch: Partial<WidgetStyle>) => void; desktop?: boolean; inherit?: Partial<WidgetStyle> }): JSX.Element {
  const own = (k: keyof WidgetStyle): string => (inherit && inherit[k] !== undefined ? 'own' : '')
  return (
    <div className="form-grid style-fields">
      <Field label="Background">
        <div className="material-pick">
          {MATERIALS.filter((m) => desktop || m.value !== 'acrylic').map((m) => (
            <button key={m.value} className={`material-opt ${style.material === m.value ? 'active' : ''} ${own('material')}`} onClick={() => set({ material: m.value })}>
              <span className={`material-swatch mat-${m.value}`}><Icon name={m.icon} size={14} /></span>
              {m.label}
            </button>
          ))}
        </div>
      </Field>
      {style.material !== 'clear' && <>
        <Field label="Tint"><ColorField value={style.tint} onChange={(v) => set({ tint: v })} auto="Theme" /></Field>
        <Field label="Tint strength"><input type="range" min={0} max={100} value={style.opacity} onChange={(e) => set({ opacity: Number(e.target.value) })} /><span className="muted small w-40">{style.opacity}%</span></Field>
        <Field label="Border"><input type="range" min={0} max={100} value={style.border} onChange={(e) => set({ border: Number(e.target.value) })} /><span className="muted small w-40">{style.border}%</span></Field>
      </>}
      <Field label="Corners"><input type="range" min={0} max={40} value={style.radius} onChange={(e) => set({ radius: Number(e.target.value) })} /><span className="muted small w-40">{style.radius}px</span></Field>
      <Field label="Padding"><input type="range" min={0} max={40} value={style.padding} onChange={(e) => set({ padding: Number(e.target.value) })} /><span className="muted small w-40">{style.padding}px</span></Field>
      <Field label="Size"><input type="range" min={60} max={200} step={5} value={style.scale} onChange={(e) => set({ scale: Number(e.target.value) })} /><span className="muted small w-40">{style.scale}%</span></Field>
      <Field label="Text color"><ColorField value={style.text} onChange={(v) => set({ text: v })} auto="Theme" /></Field>
      <Field label="Accent"><ColorField value={style.accent} onChange={(v) => set({ accent: v })} auto="App accent" /></Field>
      <Field label="Font">
        <select className="input input-sm grow" value={style.font} onChange={(e) => set({ font: e.target.value })}>
          <option value="">App font</option>
          {FONT_CHOICES.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
          {style.font && !FONT_CHOICES.includes(style.font) && <option value={style.font}>{style.font}</option>}
        </select>
      </Field>
      <Field label="Theme"><Segmented small value={style.theme} onChange={(v) => set({ theme: v })} options={[{ value: 'auto', label: 'Auto' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} /></Field>
      <Field label="Title bar"><Toggle checked={style.header} onChange={(v) => set({ header: v })} /></Field>
      <Field label="Align"><Segmented small value={style.align} onChange={(v) => set({ align: v })} options={[{ value: 'start', label: 'Left' }, { value: 'center', label: 'Center' }]} /></Field>
      {style.material === 'tint' && <Field label="Shadow"><Toggle checked={style.shadow} onChange={(v) => set({ shadow: v })} /></Field>}
    </div>
  )
}
