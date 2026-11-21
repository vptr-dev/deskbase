import { useEffect, useMemo, useRef, useState } from 'react'
import { act, getData, useData } from '../store'
import type { DeskWidget, WidgetStyle, WidgetType } from '../types'
import { api, type DisplayInfo, isDesktop } from '../lib/api'
import { addDeskSet, addDesktopWidget, addSpace, panelSize, patchDesk, runCommand, setDeskEditing, switchSpace, useDesk } from '../lib/desktop'
import { fullStyle, surfaceMaterial, widgetClass, widgetVars } from '../lib/widgetStyle'
import { WidgetBody, WIDGETS, widgetDef, widgetTitle } from '../components/Widgets'
import { DeskLookPicker, StyleFields, TitleField, WidgetConfigFields, Field } from '../components/WidgetConfig'
import { Button, Modal, Segmented, Toggle } from '../components/ui'
import { Glyph, Icon } from '../components/Icon'
import { initialConfig } from './DashboardPage'
import { openLook } from './AppearancePage'

type Rect = { x: number; y: number; width: number; height: number }

function useDisplays(): DisplayInfo[] {
  const [list, setList] = useState<DisplayInfo[]>([])
  useEffect(() => {
    let alive = true
    const load = (): void => { api.displays().then((l) => { if (alive) setList(l) }).catch(() => {}) }
    load()
    const id = setInterval(load, 5000)
    return () => { alive = false; clearInterval(id) }
  }, [])
  return list
}

function rectOf(w: DeskWidget, displays: DisplayInfo[]): Rect {
  if (w.w > 0 && w.h > 0) return { x: w.x, y: w.y, width: w.w, height: w.h }
  const d = displays.find((x) => x.id === w.config.displayId) ?? displays.find((x) => !x.primary) ?? displays[0]
  return d ? d.workArea : { x: 0, y: 0, width: 800, height: 600 }
}

/** Miniature of all screens with every widget; drag to move, drag the corner to resize. */
function ScreenMap({ widgets, displays, selected, onSelect }: { widgets: DeskWidget[]; displays: DisplayInfo[]; selected: string | null; onSelect: (id: string) => void }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const box = useMemo(() => {
    if (!displays.length) return { x: 0, y: 0, width: 1920, height: 1080 }
    const xs = displays.flatMap((d) => [d.bounds.x, d.bounds.x + d.bounds.width])
    const ys = displays.flatMap((d) => [d.bounds.y, d.bounds.y + d.bounds.height])
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }
  }, [displays])
  const k = Math.min((width - 24) / box.width, 340 / box.height)
  const px = (r: Rect): React.CSSProperties => ({ left: (r.x - box.x) * k, top: (r.y - box.y) * k, width: r.width * k, height: r.height * k })

  const drag = (e: React.PointerEvent, w: DeskWidget, mode: 'move' | 'resize'): void => {
    e.preventDefault()
    e.stopPropagation()
    onSelect(w.id)
    if (w.locked && mode === 'move') return
    const start = rectOf(w, displays)
    const sx = e.clientX
    const sy = e.clientY
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent): void => {
      const dx = Math.round((ev.clientX - sx) / k / 8) * 8
      const dy = Math.round((ev.clientY - sy) / k / 8) * 8
      patchDesk(w.id, (x) => {
        if (mode === 'move') { x.x = start.x + dx; x.y = start.y + dy; x.w = start.width; x.h = start.height }
        else { x.x = start.x; x.y = start.y; x.w = Math.max(120, start.width + dx); x.h = Math.max(64, start.height + dy) }
      }, 'deskmap:' + w.id)
    }
    const up = (): void => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up) }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }

  return (
    <div className="screen-map" ref={ref}>
      <div className="screen-map-inner" style={{ width: box.width * k, height: box.height * k }}>
        {displays.map((d, i) => (
          <div key={d.id} className={`screen-tile ${d.primary ? 'primary' : ''}`} style={px(d.bounds)}>
            <span className="screen-label">{i + 1}{d.primary ? ' · Main' : ''}</span>
          </div>
        ))}
        {widgets.map((w) => {
          const r = rectOf(w, displays)
          return (
            <div key={w.id} className={`map-widget ${selected === w.id ? 'active' : ''} ${w.hidden ? 'hidden' : ''}`} style={px(r)} onPointerDown={(e) => drag(e, w, 'move')} title={widgetDef(w.type).name}>
              <Icon name={widgetDef(w.type).icon} size={Math.max(10, Math.min(18, r.height * k * 0.4))} />
              {selected === w.id && <span className="map-resize" onPointerDown={(e) => drag(e, w, 'resize')} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

type Patch = (fn: (x: DeskWidget) => void, key?: string) => void

/** The panel drawn inside the app, the same way it looks on the desktop. */
function Preview({ w, st, patch, max = 300 }: { w: DeskWidget; st: WidgetStyle; patch: Patch; max?: number }): JSX.Element {
  const d = useData((x) => x)
  const displays = useDisplays()
  const r = rectOf(w, displays)
  const k = Math.min(1, max / r.width, 240 / r.height)
  const title = widgetTitle(w, d)
  return (
    <div className="desk-preview">
      <div className="desk-preview-scale" style={{ width: r.width, height: r.height, transform: `scale(${k})`, marginBottom: (r.height * k) - r.height, marginRight: (r.width * k) - r.width }}>
        <div className={`dw preview wt-${w.type} ${widgetClass(st)}`} data-theme={st.theme === 'auto' ? undefined : st.theme} style={widgetVars(st)}>
          {st.header && title && <div className="dw-head"><span className="widget-title ellipsis">{title}</span></div>}
          <div className="dw-body"><WidgetBody w={w} setConfig={(key, v) => patch((x) => { x.config[key] = v }, 'dcfg:' + w.id + key)} /></div>
        </div>
      </div>
    </div>
  )
}

/** Title and the settings of what the panel shows. */
function ContentFields({ w, patch }: { w: DeskWidget; patch: Patch }): JSX.Element {
  return <>
    <TitleField w={w} setTitle={(t) => patch((x) => { x.title = t }, 'dtitle:' + w.id)} />
    <WidgetConfigFields w={w} set={(k, v) => patch((x) => { x.config[k] = v }, 'dcfg:' + w.id + k)} patch={(fn) => patch(fn as (x: DeskWidget) => void)} />
  </>
}

/** This panel's own look on top of the shared panel style (set in Appearance). */
function LookFields({ w, patch }: { w: DeskWidget; patch: Patch }): JSX.Element {
  const base = useData((d) => d.desktop.style)
  const st = fullStyle(base, w.style, 'auto')
  const own = Object.keys(w.style).length > 0
  return <>
    <div className="row gap-sm wrap">
      <button className={`choice ${own ? '' : 'active'}`} onClick={() => patch((x) => { x.style = {} })}>Shared style</button>
      <button className="link small" onClick={() => openLook('desktop')}>Change the shared style</button>
    </div>
    <DeskLookPicker style={st} onPick={(p) => patch((x) => { x.style = { ...x.style, ...p } })} />
    <StyleFields desktop style={st} inherit={w.style} set={(p) => patch((x) => { x.style = { ...x.style, ...p } }, 'dstyle:' + w.id)} />
  </>
}

function PlaceFields({ w, displays }: { w: DeskWidget; displays: DisplayInfo[] }): JSX.Element {
  const r = rectOf(w, displays)
  const set = (k: string, v: any): void => patchDesk(w.id, (x) => { x.config[k] = v }, 'dcfg:' + w.id + k)
  const num = (k: 'x' | 'y' | 'w' | 'h', v: number): void => patchDesk(w.id, (x) => {
    if (x.w <= 0 || x.h <= 0) { x.x = r.x; x.y = r.y; x.w = r.width; x.h = r.height }
    x[k] = k === 'w' ? Math.max(120, v) : k === 'h' ? Math.max(64, v) : v
  }, 'dnum:' + w.id + k)
  return (
    <div className="form-grid">
      {w.group && (
        <Field label="Group" sub="Moves together with the panels it was combined with">
          <Button small kind="ghost" icon="ungroup" onClick={() => runCommand(w.id, 'ungroup')}>Separate</Button>
        </Field>
      )}
      <Field label="Lock position"><Toggle checked={!!w.locked} onChange={(v) => patchDesk(w.id, (x) => { x.locked = v })} /></Field>
      <Field label="Click-through" sub="Clicks go to what's behind"><Toggle checked={!!w.config.clickThrough} onChange={(v) => set('clickThrough', v)} /></Field>
      <Field label="Position">
        <span className="muted small">X</span><input className="input input-sm w-80" type="number" value={Math.round(r.x)} onChange={(e) => num('x', Number(e.target.value) || 0)} />
        <span className="muted small">Y</span><input className="input input-sm w-80" type="number" value={Math.round(r.y)} onChange={(e) => num('y', Number(e.target.value) || 0)} />
      </Field>
      <Field label="Size">
        <span className="muted small">W</span><input className="input input-sm w-80" type="number" value={Math.round(r.width)} onChange={(e) => num('w', Number(e.target.value) || 0)} />
        <span className="muted small">H</span><input className="input input-sm w-80" type="number" value={Math.round(r.height)} onChange={(e) => num('h', Number(e.target.value) || 0)} />
      </Field>
      {displays.length > 0 && (
        <Field label="Screen">
          {displays.map((dp, i) => (
            <Button key={dp.id} small kind="ghost" onClick={() => patchDesk(w.id, (x) => {
              const a = dp.workArea
              const ww = Math.min(r.width, a.width - 48)
              const hh = Math.min(r.height, a.height - 48)
              x.w = ww; x.h = hh; x.x = Math.round(a.x + (a.width - ww) / 2); x.y = Math.round(a.y + (a.height - hh) / 2)
            })}>{`${i + 1}${dp.primary ? ' (main)' : ''}`}</Button>
          ))}
          <Button small kind="ghost" icon="expand" onClick={() => {
            const dp = displays.find((x) => r.x >= x.bounds.x && r.x < x.bounds.x + x.bounds.width) ?? displays[0]
            patchDesk(w.id, (x) => { const a = dp.workArea; x.x = a.x + 12; x.y = a.y + 12; x.w = a.width - 24; x.h = a.height - 24 })
          }}>Fill screen</Button>
        </Field>
      )}
    </div>
  )
}

/** Settings of one panel, opened right under its row. */
function Inspector({ w, displays }: { w: DeskWidget; displays: DisplayInfo[] }): JSX.Element {
  const [tab, setTab] = useState<'content' | 'style' | 'place'>('content')
  const base = useData((d) => d.desktop.style)
  const look = useData((d) => d.settings.look)
  const patch: Patch = (fn, key) => patchDesk(w.id, fn, key)
  return (
    <div className="desk-inspector">
      <div className="desk-inspector-preview">
        <Preview w={w} st={fullStyle(base, w.style, surfaceMaterial(look, true))} patch={patch} />
      </div>
      <div className="desk-inspector-fields">
        <Segmented small value={tab} onChange={setTab} options={[{ value: 'content', label: 'Content' }, { value: 'style', label: 'Style' }, { value: 'place', label: 'Place' }]} />
        {tab === 'content' && <ContentFields w={w} patch={patch} />}
        {tab === 'style' && <>
          <LookFields w={w} patch={patch} />
          <div className="row gap-sm wrap">
            <Button small kind="ghost" icon="layers" onClick={() => act((d) => { d.desktop.style = { ...d.desktop.style, ...w.style }; for (const x of d.desktop.widgets) x.style = {} })}>Use this look for every panel</Button>
          </div>
        </>}
        {tab === 'place' && <PlaceFields w={w} displays={displays} />}
      </div>
    </div>
  )
}

function removePanel(id: string): void {
  runCommand(id, 'remove')
  if (useDesk.getState().selected === id) useDesk.setState({ selected: null })
}

function PanelRow({ w, open, displays }: { w: DeskWidget; open: boolean; displays: DisplayInfo[] }): JSX.Element {
  const data = useData((d) => d)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (open) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [open])
  const title = widgetTitle(w, data)
  const def = widgetDef(w.type)
  const stop = (fn: () => void) => (e: React.MouseEvent): void => { e.stopPropagation(); fn() }
  return (
    <div ref={ref} className={`desk-entry ${open ? 'open' : ''} ${w.hidden ? 'is-hidden' : ''}`}>
      <div className="desk-item" onClick={() => useDesk.setState({ selected: open ? null : w.id })}>
        <span className="widget-pick-icon sm"><Icon name={def.icon} size={15} /></span>
        <span className="grow min0">
          <span className="ellipsis d-block">{title || def.name}</span>
          {title && title !== def.name && <span className="muted small ellipsis d-block">{def.name}</span>}
        </span>
        {w.locked && <Icon name="lock" size={13} className="muted" />}
        <span className="desk-item-actions">
          <button className={`icon-btn ${open ? 'on' : ''}`} title="Settings" onClick={stop(() => useDesk.setState({ selected: open ? null : w.id }))}><Icon name="settings" size={14} /></button>
          <button className="icon-btn" title={w.hidden ? 'Show' : 'Hide'} onClick={stop(() => patchDesk(w.id, (x) => { x.hidden = !x.hidden }))}><Icon name={w.hidden ? 'eyeOff' : 'eye'} size={14} /></button>
          <button className="icon-btn" title="Duplicate" onClick={stop(() => runCommand(w.id, 'duplicate'))}><Icon name="copy" size={14} /></button>
          <button className="icon-btn danger" title="Remove (Delete)" onClick={stop(() => removePanel(w.id))}><Icon name="trash" size={14} /></button>
        </span>
        <Icon name="chevron-down" size={14} className={`desk-chev muted ${open ? 'open' : ''}`} />
      </div>
      {open && <Inspector key={w.id} w={w} displays={displays} />}
    </div>
  )
}

// ---------- adding panels ----------

type Cat = 'All' | 'Work' | 'Plan' | 'Track' | 'More' | 'Sets'
const CATS: { id: Cat; icon: string }[] = [
  { id: 'All', icon: 'layout-grid' }, { id: 'Work', icon: 'briefcase' }, { id: 'Plan', icon: 'calendar' }, { id: 'Track', icon: 'chart-column' }, { id: 'More', icon: 'shapes' }, { id: 'Sets', icon: 'layout' }
]
const SIZES = [{ value: 0.75, label: 'Small' }, { value: 1, label: 'Medium' }, { value: 1.35, label: 'Large' }]

function draftOf(type: WidgetType, scale: number): DeskWidget {
  const [w, h] = panelSize(type)
  return { id: 'draft', type, config: initialConfig(type, getData()), style: {}, x: 0, y: 0, w: Math.round(w * scale), h: Math.round(h * scale), layer: 'desktop', space: getData().desktop.active, createdAt: Date.now() } as DeskWidget
}

/** Pick a panel, set it up while seeing it, then put it on the desktop. Double-click adds one right away. */
function AddPanel({ onClose }: { onClose: () => void }): JSX.Element {
  const base = useData((d) => d.desktop.style)
  const look = useData((d) => d.settings.look)
  const displays = useDisplays()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<Cat>('All')
  const [scale, setScale] = useState(1)
  const [screen, setScreen] = useState<number | undefined>(undefined)
  const [tab, setTab] = useState<'content' | 'style'>('content')
  const [draft, setDraft] = useState<DeskWidget>(() => draftOf('tasks', 1))
  const [count, setCount] = useState(0)
  const patch: Patch = (fn) => setDraft((d) => { const c: DeskWidget = JSON.parse(JSON.stringify(d)); fn(c); return c })
  const list = WIDGETS.filter((w) => w.type !== 'dashboard' && (cat === 'All' || w.group === cat) && (!q.trim() || (w.name + ' ' + w.desc).toLowerCase().includes(q.trim().toLowerCase())))
  const pick = (type: WidgetType): void => { setDraft(draftOf(type, scale)); setTab('content') }
  const resize = (k: number): void => { setScale(k); const [w, h] = panelSize(draft.type); patch((x) => { x.w = Math.round(w * k); x.h = Math.round(h * k) }) }
  const add = async (d: DeskWidget, close: boolean): Promise<void> => {
    const { id: _id, x: _x, y: _y, createdAt: _c, space: _s, ...init } = d
    const id = await addDesktopWidget(d.type, init, screen)
    setCount((n) => n + 1)
    if (close) { useDesk.setState({ selected: id }); onClose() }
  }
  const def = widgetDef(draft.type)
  return (
    <Modal onClose={onClose} width={1080} className="add-panel" title="Add a panel">
      <div className="add-panel-layout">
        <nav className="add-panel-cats">
          <div className="add-panel-search"><Icon name="search" size={14} /><input autoFocus className="input-bare" placeholder="Search panels" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {CATS.map((c) => (
            <button key={c.id} className={cat === c.id ? 'active' : ''} onClick={() => setCat(c.id)}>
              <Icon name={c.icon} size={14} /><span className="grow">{c.id}</span>
              <span className="muted small">{c.id === 'Sets' ? 1 : WIDGETS.filter((w) => w.type !== 'dashboard' && (c.id === 'All' || w.group === c.id)).length}</span>
            </button>
          ))}
        </nav>
        <div className="add-panel-list">
          {cat === 'Sets' ? (
            <button className="widget-pick glass" onClick={() => { addDeskSet(); onClose() }}>
              <span className="widget-pick-icon"><Icon name="layout" size={18} /></span>
              <span className="strong">Desk set</span>
              <span className="muted small">Clock, daylight, month, weather, system and four timers down the right side</span>
            </button>
          ) : list.map((w) => (
            <button key={w.type} className={`widget-pick glass ${draft.type === w.type ? 'active' : ''}`} onClick={() => pick(w.type)} onDoubleClick={() => { void add(draftOf(w.type, scale), true) }}>
              <span className="widget-pick-icon"><Icon name={w.icon} size={18} /></span>
              <span className="strong">{w.name}</span>
              <span className="muted small">{w.desc}</span>
            </button>
          ))}
          {cat !== 'Sets' && list.length === 0 && <div className="muted small add-panel-none">No panels match “{q}”.</div>}
        </div>
        <div className="add-panel-setup">
          <Preview w={draft} st={fullStyle(base, draft.style, surfaceMaterial(look, true))} patch={patch} max={320} />
          <div className="row between gap-sm">
            <span className="strong">{def.name}</span>
            <Segmented small value={tab} onChange={setTab} options={[{ value: 'content', label: 'Content' }, { value: 'style', label: 'Style' }]} />
          </div>
          <div className="add-panel-fields">
            {tab === 'content' ? <ContentFields w={draft} patch={patch} /> : <LookFields w={draft} patch={patch} />}
            <div className="form-grid">
              <Field label="Size"><Segmented small value={scale} onChange={resize} options={SIZES} /></Field>
              {displays.length > 1 && (
                <Field label="Screen">
                  <Segmented small value={screen ?? -1} onChange={(v) => setScreen(v === -1 ? undefined : v)} options={[{ value: -1, label: 'Main' }, ...displays.filter((x) => !x.primary).map((x) => ({ value: x.id, label: String(displays.indexOf(x) + 1) }))]} />
                </Field>
              )}
            </div>
          </div>
          <div className="row gap-sm add-panel-go">
            {count > 0 && <span className="muted small">{count} added</span>}
            <div className="spacer" />
            <Button small kind="ghost" icon="plus" onClick={() => { void add(draft, false) }}>Add another</Button>
            <Button small kind="primary" icon="check" onClick={() => { void add(draft, true) }}>Add to desktop</Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export function DesktopPage(): JSX.Element {
  const desk = useData((d) => d.desktop)
  const selected = useDesk((s) => s.selected)
  const editing = useDesk((s) => s.editing)
  const displays = useDisplays()
  const adding = useDesk((s) => !!s.adding)
  const setAdding = (v: boolean): void => useDesk.setState({ adding: v })
  const panels = desk.widgets.filter((w) => w.space === desk.active)
  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement
      if (e.key !== 'Delete' || adding || t.closest('input, textarea, select, [contenteditable="true"]')) return
      const id = useDesk.getState().selected
      if (id && getData().desktop.widgets.some((x) => x.id === id)) { e.preventDefault(); removePanel(id) }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [adding])
  return (
    <div className="page full page-desktop">
      <div className="page-header row between">
        <h1 className="page-title static">Desktop</h1>
        <Button small kind="ghost" icon="palette" onClick={() => openLook('desktop')}>Panel style</Button>
      </div>
      <div className="space-tabs">
        {desk.spaces.map((s) => (
          <button key={s.id} className={`space-tab ${s.id === desk.active ? 'active' : ''}`} onClick={() => switchSpace(s.id)}>
            <Glyph value={s.icon} fallback="monitor" size={14} />
            <span>{s.name}</span>
            <span className="space-tab-count">{desk.widgets.filter((w) => w.space === s.id && !w.hidden).length}</span>
          </button>
        ))}
        <button className="space-tab add" title="New workspace" onClick={() => addSpace(false)}><Icon name="plus" size={14} /></button>
      </div>
      <div className="desk-toolbar">
        <Button kind="primary" small icon="plus" onClick={() => setAdding(true)}>Add panel</Button>
        {isDesktop && <Button small kind={editing ? 'primary' : 'default'} icon={editing ? 'check' : 'move'} onClick={() => setDeskEditing(!editing)}>{editing ? 'Done arranging' : 'Arrange on desktop'}</Button>}
        <div className="spacer" />
        <span className="muted small">Show on desktop</span>
        <Toggle checked={desk.enabled} onChange={(v) => act((d) => { d.desktop.enabled = v })} />
      </div>
      {!isDesktop && <div className="field-note"><Icon name="info" size={13} /> Panels open on your Windows desktop in the installed app. Here you can set them up and preview them.</div>}
      <ScreenMap widgets={panels} displays={displays} selected={selected} onSelect={(id) => useDesk.setState({ selected: id })} />
      <div className="desk-list">
        {panels.length === 0 && (
          <button className="dash-empty glass" onClick={() => setAdding(true)}>
            <Icon name="monitor" size={22} /><span>Put your first panel on the desktop</span>
          </button>
        )}
        {panels.map((w) => <PanelRow key={w.id} w={w} open={selected === w.id} displays={displays} />)}
      </div>
      {adding && <AddPanel onClose={() => setAdding(false)} />}
    </div>
  )
}
