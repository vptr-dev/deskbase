import type { ReactNode } from 'react'
import { setSettings, useData } from '../store'
import type { Place } from '../types'

const setSettingsPlace = (p: Place): void => setSettings((s) => { s.place = p })
const setFahrenheit = (f: boolean): void => setSettings((s) => { s.fahrenheit = f })
import type { DeskMaterial, Page, WidgetStyle } from '../types'
import { STATS, type AnyWidget, widgetTitle } from './Widgets'
import { createValue } from './Values'
import { Button, Segmented, Toggle } from './ui'
import { Icon } from './Icon'
import { pickImageData } from '../lib/image'
import { FONT_CHOICES } from '../lib/look'
import { PlaceSearch } from './PanelKit'
import { fullStyle, widgetClass, widgetVars } from '../lib/widgetStyle'

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
  const headings = page ? page.blocks.filter((b) => ['h1', 'h2', 'h3', 'toggle'].includes(b.type) && b.text.trim()).map((b) => b.text.trim()) : []
  const tables = page ? page.blocks.filter((b) => b.type === 'table' && b.rows?.length) : []
  const table = tables[Number(c.table) || 0]
  const placeField = (
    <Field label="Place" sub={c.place ? '' : d.settings.place ? `Same as other panels: ${d.settings.place.name}` : ''}>
      {c.place && <span className="chip">{c.place.name}</span>}
      {c.place && <Button small kind="ghost" onClick={() => set('place', null)}>Use the shared place</Button>}
      <PlaceSearch compact onPick={(p) => (d.settings.place ? set('place', p) : setSettingsPlace(p))} />
    </Field>
  )

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
    <Field label="Section" sub="Only what's under one heading or toggle">
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
        <Field label="Only today" sub="The part that starts with today's weekday"><Toggle checked={!!c.today} onChange={(v) => set('today', v)} /></Field>
        {w.type === 'checklist' && <Field label="Include subpages"><Toggle checked={!!c.subpages} onChange={(v) => set('subpages', v)} /></Field>}
        <Field label="Hide checked items"><Toggle checked={!!c.hideChecked} onChange={(v) => set('hideChecked', v)} /></Field>
        {page?.source?.kind === 'notion' && <div className="field-note"><Icon name="refresh" size={13} /> This page comes from Notion and refreshes on its own.</div>}
      </>}
      {w.type === 'dashboard' && <Field label="Dashboard"><PagePicker value={c.pageId ?? ''} pages={docs.filter((p) => p.type === 'dashboard')} onChange={(v) => set('pageId', v)} /></Field>}
      {w.type === 'clock' && <>
        <Field label="Style"><Segmented small value={c.style ?? 'digital'} onChange={(v) => set('style', v)} options={[{ value: 'ring', label: 'Ring' }, { value: 'digital', label: 'Digital' }, { value: 'big', label: 'Stacked' }, { value: 'analog', label: 'Analog' }]} /></Field>
        {c.style === 'ring' ? <Field label="Date"><Toggle checked={c.date !== false} onChange={(v) => set('date', v)} /></Field> : <Field label="Seconds"><Toggle checked={!!c.seconds} onChange={(v) => set('seconds', v)} /></Field>}
      </>}
      {w.type === 'calendar' && <>
        <Field label="Today's list"><Toggle checked={c.list !== false} onChange={(v) => set('list', v)} /></Field>
        <Field label="Month name"><Toggle checked={c.title !== false} onChange={(v) => set('title', v)} /></Field>
      </>}
      {w.type === 'weather' && <>
        {placeField}
        <Field label="Days ahead"><Segmented small value={Number(c.days ?? 4)} onChange={(v) => set('days', v)} options={[0, 3, 4, 5, 6].map((n) => ({ value: n, label: n ? String(n) : 'None' }))} /></Field>
        <Field label="Chance of rain"><Toggle checked={!!c.rain} onChange={(v) => set('rain', v)} /></Field>
        <Field label="Units"><Segmented small value={d.settings.fahrenheit ? 'f' : 'c'} onChange={(v) => setFahrenheit(v === 'f')} options={[{ value: 'c', label: '°C' }, { value: 'f', label: '°F' }]} /></Field>
      </>}
      {w.type === 'daylight' && <>
        {placeField}
        <Field label="Other time" sub="Sunrise or sunset under the horizon"><Toggle checked={c.other !== false} onChange={(v) => set('other', v)} /></Field>
        <Field label="Place name"><Toggle checked={!!c.showPlace} onChange={(v) => set('showPlace', v)} /></Field>
      </>}
      {w.type === 'system' && <>
        <Field label="Show">
          <label className="row gap-xs small"><Toggle checked={c.cpu !== false} onChange={(v) => set('cpu', v)} />CPU</label>
          <label className="row gap-xs small"><Toggle checked={c.ram !== false} onChange={(v) => set('ram', v)} />Memory</label>
          <label className="row gap-xs small"><Toggle checked={c.disk !== false} onChange={(v) => set('disk', v)} />Disk</label>
        </Field>
        <Field label="Look"><Segmented small value={c.look ?? 'rings'} onChange={(v) => set('look', v)} options={[{ value: 'rings', label: 'Rings' }, { value: 'bars', label: 'Bars' }]} /></Field>
        <Field label="Details"><Toggle checked={!!c.details} onChange={(v) => set('details', v)} /></Field>
        <Field label="Disk"><input className="input input-sm w-60" maxLength={1} placeholder="C" value={c.drive ?? ''} onChange={(e) => set('drive', e.target.value.replace(/[^a-z]/gi, '').toUpperCase())} /><input className="input input-sm w-80" placeholder="SSD" value={c.diskLabel ?? ''} onChange={(e) => set('diskLabel', e.target.value)} /></Field>
      </>}
      {w.type === 'timer' && <>
        <Field label="Minutes"><input className="input input-sm w-80" type="number" min={1} max={600} value={c.minutes ?? 5} onChange={(e) => patch((x) => { x.config.minutes = Math.max(1, Math.min(600, Number(e.target.value) || 1)); x.config.endsAt = null; x.config.left = null })} /></Field>
        <Field label="Label"><input className="input input-sm grow" placeholder="Optional" value={c.label ?? ''} onChange={(e) => set('label', e.target.value)} /></Field>
      </>}
      {(w.type === 'sections' || w.type === 'table') && (
        <Field label="Page"><PagePicker value={c.pageId ?? ''} pages={docs.filter((p) => p.type === 'doc' && (w.type === 'sections' || p.blocks.some((b) => b.type === 'table')))} onChange={(v) => patch((x) => { x.config.pageId = v; x.config.section = null; x.config.table = 0; x.config.sumCol = -1; x.config.dayCol = -1 })} /></Field>
      )}
      {w.type === 'sections' && <>
        {sectionPicker}
        <Field label="Show next" sub="To-dos when you open a section"><Segmented small value={Number(c.next ?? 3)} onChange={(v) => set('next', v)} options={[1, 3, 5, 8].map((n) => ({ value: n, label: String(n) }))} /></Field>
        <Field label="Overall %"><Toggle checked={c.total !== false} onChange={(v) => set('total', v)} /></Field>
      </>}
      {w.type === 'table' && page && <>
        {tables.length > 1 && (
          <Field label="Table">
            <select className="input input-sm grow" value={Number(c.table) || 0} onChange={(e) => patch((x) => { x.config.table = Number(e.target.value); x.config.sumCol = -1; x.config.dayCol = -1 })}>
              {tables.map((t, i) => <option key={t.id} value={i}>{(t.rows?.[0] ?? []).filter(Boolean).join(', ') || `Table ${i + 1}`}</option>)}
            </select>
          </Field>
        )}
        {table && <>
          <Field label="Total of">
            <select className="input input-sm" value={c.sumCol ?? -1} onChange={(e) => set('sumCol', Number(e.target.value))}>
              <option value={-1}>No total</option>
              {(table.rows?.[0] ?? []).map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
            </select>
            <input className="input input-sm w-60" placeholder="£" value={c.prefix ?? ''} onChange={(e) => set('prefix', e.target.value.slice(0, 3))} />
          </Field>
          <Field label="Day of month" sub="Sort by the next date in this column">
            <select className="input input-sm" value={c.dayCol ?? -1} onChange={(e) => set('dayCol', Number(e.target.value))}>
              <option value={-1}>None</option>
              {(table.rows?.[0] ?? []).map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
            </select>
          </Field>
        </>}
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
  { value: 'auto', label: 'Match app', icon: 'blend' },
  { value: 'glass', label: 'Glass', icon: 'droplet' },
  { value: 'blur', label: 'Blur', icon: 'aperture' },
  { value: 'acrylic', label: 'Frosted', icon: 'snowflake' },
  { value: 'tint', label: 'Solid', icon: 'square' },
  { value: 'clear', label: 'None', icon: 'eye-off' }
]

export const BORDER_WIDTHS = [{ value: 0, label: 'None' }, { value: 1, label: 'Thin' }, { value: 1.5, label: 'Medium' }, { value: 2.5, label: 'Thick' }]
export const TITLE_STYLES: { value: WidgetStyle['titleStyle']; label: string }[] = [{ value: 'caps', label: 'Small caps' }, { value: 'plain', label: 'Plain' }, { value: 'large', label: 'Large' }]

/** Ready-made looks for every desktop panel (they set the shared panel style). */
export const DESK_LOOKS: { id: string; name: string; style: Partial<WidgetStyle> }[] = [
  { id: 'match', name: 'Match app', style: { material: 'auto', tint: '', opacity: 50, border: 60, borderWidth: 1, borderColor: '', radius: 18, text: '', titleStyle: 'caps', header: true } },
  { id: 'glass', name: 'Clear glass', style: { material: 'glass', tint: '', opacity: 42, border: 70, borderWidth: 1, borderColor: '', radius: 18, text: '', titleStyle: 'caps', header: true } },
  { id: 'blur', name: 'Blur', style: { material: 'blur', tint: '', opacity: 30, border: 50, borderWidth: 1, borderColor: '', radius: 18, text: '', titleStyle: 'caps', header: true } },
  { id: 'frosted', name: 'Frosted', style: { material: 'acrylic', tint: '', opacity: 55, border: 40, borderWidth: 1, borderColor: '', radius: 20, text: '', titleStyle: 'plain', header: true } },
  { id: 'outline', name: 'Outline', style: { material: 'glass', tint: '', opacity: 0, border: 85, borderWidth: 1.5, borderColor: '', radius: 16, text: '', titleStyle: 'caps', header: true } },
  { id: 'solid', name: 'Solid', style: { material: 'tint', tint: '', opacity: 100, border: 30, borderWidth: 1, borderColor: '', radius: 16, text: '', titleStyle: 'plain', header: true } },
  { id: 'midnight', name: 'Midnight', style: { material: 'tint', tint: '#0d1224', opacity: 80, border: 35, borderWidth: 1, borderColor: '#7c8cff', radius: 22, text: '#e9ecff', titleStyle: 'large', header: true } },
  { id: 'paper', name: 'Paper', style: { material: 'tint', tint: '#fbf8f1', opacity: 95, border: 45, borderWidth: 1, borderColor: '#d9cfbd', radius: 10, text: '#2b2620', titleStyle: 'plain', header: true } },
  { id: 'minimal', name: 'Minimal', style: { material: 'clear', tint: '', opacity: 0, border: 0, borderWidth: 0, borderColor: '', radius: 18, text: '', titleStyle: 'caps', header: false } }
]

/** Preset cards for the desktop look; `style` is the current shared panel style. */
export function DeskLookPicker({ style, onPick }: { style: WidgetStyle; onPick: (p: Partial<WidgetStyle>) => void }): JSX.Element {
  const active = DESK_LOOKS.find((l) => Object.entries(l.style).every(([k, v]) => (style as any)[k] === v))?.id
  return (
    <div className="desk-looks">
      {DESK_LOOKS.map((l) => {
        const st = fullStyle(style, l.style, 'glass')
        return (
          <button key={l.id} className={`desk-look ${active === l.id ? 'active' : ''}`} onClick={() => onPick(l.style)}>
            <span className="desk-look-scene">
              <span className={`dw ${widgetClass(st)}`} style={widgetVars(st)}>
                {st.header && <span className="dw-head"><span className="widget-title">Today</span></span>}
                <span className="desk-look-lines"><i /><i /><i /></span>
              </span>
            </span>
            <span className="desk-look-name">{l.name}</span>
          </button>
        )
      })}
    </div>
  )
}

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
        {desktop && <Field label="Border width"><Segmented small value={style.borderWidth} onChange={(v) => set({ borderWidth: v })} options={BORDER_WIDTHS} /></Field>}
        <Field label="Border color"><ColorField value={style.borderColor} onChange={(v) => set({ borderColor: v })} auto="Auto" /></Field>
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
      {style.header && <Field label="Title style"><Segmented small value={style.titleStyle} onChange={(v) => set({ titleStyle: v })} options={TITLE_STYLES} /></Field>}
      <Field label="Align"><Segmented small value={style.align} onChange={(v) => set({ align: v })} options={[{ value: 'start', label: 'Left' }, { value: 'center', label: 'Center' }]} /></Field>
      {style.material === 'tint' && <Field label="Shadow"><Toggle checked={style.shadow} onChange={(v) => set({ shadow: v })} /></Field>}
    </div>
  )
}
