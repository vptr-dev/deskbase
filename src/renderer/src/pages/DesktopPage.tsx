import { useEffect, useMemo, useRef, useState } from 'react'
import { act, getData, useData } from '../store'
import type { DeskWidget, WidgetStyle, WidgetType } from '../types'
import { api, type DisplayInfo, isDesktop } from '../lib/api'
import { addDeskSet, addDesktopWidget, addSpace, patchDesk, runCommand, setDeskEditing, switchSpace, useDesk } from '../lib/desktop'
import { fullStyle, surfaceMaterial, widgetClass, widgetVars } from '../lib/widgetStyle'
import { DEFAULT_WIDGET_STYLE } from '../lib/defaults'
import { WidgetBody, widgetDef, widgetTitle } from '../components/Widgets'
import { StyleFields, TitleField, WidgetConfigFields, Field } from '../components/WidgetConfig'
import { Button, Modal, Segmented, Toggle } from '../components/ui'
import { Glyph, Icon } from '../components/Icon'
import { initialConfig, WidgetGallery } from './DashboardPage'

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

/** The widget drawn inside the app, the same way it looks on the desktop. */
function Preview({ w, st }: { w: DeskWidget; st: WidgetStyle }): JSX.Element {
  const d = useData((x) => x)
  const displays = useDisplays()
  const r = rectOf(w, displays)
  const k = Math.min(1, 300 / r.width, 240 / r.height)
  const title = widgetTitle(w, d)
  return (
    <div className="desk-preview">
      <div className="desk-preview-scale" style={{ width: r.width, height: r.height, transform: `scale(${k})`, marginBottom: (r.height * k) - r.height, marginRight: (r.width * k) - r.width }}>
        <div className={`dw preview wt-${w.type} ${widgetClass(st)}`} data-theme={st.theme === 'auto' ? undefined : st.theme} style={widgetVars(st)}>
          {st.header && title && <div className="dw-head"><span className="widget-title ellipsis">{title}</span></div>}
          <div className="dw-body"><WidgetBody w={w} setConfig={(key, v) => patchDesk(w.id, (x) => { x.config[key] = v }, 'dcfg:' + w.id + key)} /></div>
        </div>
      </div>
    </div>
  )
}

function Inspector({ w, displays }: { w: DeskWidget; displays: DisplayInfo[] }): JSX.Element {
  const [tab, setTab] = useState<'content' | 'style' | 'place'>('content')
  const base = useData((d) => d.desktop.style)
  const data = useData((d) => d)
  const st = fullStyle(base, w.style, 'auto')
  const set = (k: string, v: any): void => patchDesk(w.id, (x) => { x.config[k] = v }, 'dcfg:' + w.id + k)
  const r = rectOf(w, displays)
  const num = (k: 'x' | 'y' | 'w' | 'h', v: number): void => patchDesk(w.id, (x) => {
    if (x.w <= 0 || x.h <= 0) { x.x = r.x; x.y = r.y; x.w = r.width; x.h = r.height }
    x[k] = k === 'w' ? Math.max(120, v) : k === 'h' ? Math.max(64, v) : v
  }, 'dnum:' + w.id + k)
  return (
    <div className="desk-inspector glass">
      <div className="row between gap-sm">
        <div className="row gap-sm min0"><span className="widget-pick-icon sm"><Icon name={widgetDef(w.type).icon} size={15} /></span><span className="strong ellipsis">{widgetTitle(w, data) || widgetDef(w.type).name}</span></div>
        <Segmented small value={tab} onChange={setTab} options={[{ value: 'content', label: 'Content' }, { value: 'style', label: 'Style' }, { value: 'place', label: 'Place' }]} />
      </div>
      <Preview w={w} st={fullStyle(base, w.style, surfaceMaterial(data.settings.look, true))} />
      {tab === 'content' && <>
        <TitleField w={w} setTitle={(t) => patchDesk(w.id, (x) => { x.title = t }, 'dtitle:' + w.id)} />
        <WidgetConfigFields w={w} set={set} patch={(fn) => patchDesk(w.id, fn as (x: DeskWidget) => void)} />
      </>}
      {tab === 'style' && <>
        <StyleFields desktop style={st} inherit={w.style} set={(p) => patchDesk(w.id, (x) => { x.style = { ...x.style, ...p } }, 'dstyle:' + w.id)} />
        <div className="row gap-sm wrap">
          {Object.keys(w.style).length > 0 && <Button small kind="ghost" icon="restore" onClick={() => patchDesk(w.id, (x) => { x.style = {} })}>Use the default style</Button>}
          <Button small kind="ghost" icon="layers" onClick={() => act((d) => { d.desktop.style = { ...d.desktop.style, ...w.style }; for (const x of d.desktop.widgets) x.style = {} })}>Make this the style for all</Button>
        </div>
      </>}
      {tab === 'place' && (
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
      )}
      <div className="row gap-sm wrap desk-actions">
        <Button small kind="ghost" icon={w.hidden ? 'eye' : 'eyeOff'} onClick={() => patchDesk(w.id, (x) => { x.hidden = !x.hidden })}>{w.hidden ? 'Show' : 'Hide'}</Button>
        <Button small kind="ghost" icon="copy" onClick={() => runCommand(w.id, 'duplicate')}>Duplicate</Button>
        <div className="spacer" />
        <Button small kind="ghost" icon="trash" onClick={() => { runCommand(w.id, 'remove'); useDesk.setState({ selected: null }) }}>Remove</Button>
      </div>
    </div>
  )
}

function DefaultStyle(): JSX.Element {
  const desk = useData((d) => d.desktop)
  return (
    <div className="desk-inspector glass">
      <div className="row between"><span className="strong">Style for every panel</span>
        <Button small kind="ghost" icon="restore" onClick={() => act((d) => { d.desktop.style = { ...DEFAULT_WIDGET_STYLE } })}>Reset</Button>
      </div>
      <p className="muted small">Panels use this unless you change their own style.</p>
      <StyleFields desktop style={desk.style} set={(p) => act((d) => { d.desktop.style = { ...d.desktop.style, ...p } }, { key: 'deskstyle' })} />
      <div className="form-grid">
        <Field label="Snap while moving"><Toggle checked={desk.snap} onChange={(v) => act((d) => { d.desktop.snap = v })} /></Field>
        {desk.snap && <Field label="Grid"><Segmented small value={desk.grid} onChange={(v) => act((d) => { d.desktop.grid = v })} options={[1, 4, 8, 16, 24].map((n) => ({ value: n, label: n === 1 ? 'Off' : `${n}px` }))} /></Field>}
      </div>
    </div>
  )
}

export function DesktopPage(): JSX.Element {
  const desk = useData((d) => d.desktop)
  const data = useData((d) => d)
  const selected = useDesk((s) => s.selected)
  const editing = useDesk((s) => s.editing)
  const displays = useDisplays()
  const [adding, setAdding] = useState(false)
  const panels = desk.widgets.filter((w) => w.space === desk.active)
  const sel = panels.find((w) => w.id === selected)
  const add = async (type: WidgetType): Promise<void> => {
    setAdding(false)
    const id = await addDesktopWidget(type, { config: initialConfig(type, getData()) })
    useDesk.setState({ selected: id })
  }
  return (
    <div className="page full page-desktop">
      <div className="page-header">
        <h1 className="page-title static">Desktop</h1>
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
      <div className="desk-layout">
        <div className="desk-main">
          <ScreenMap widgets={panels} displays={displays} selected={selected} onSelect={(id) => useDesk.setState({ selected: id })} />
          <div className="desk-list">
            {panels.length === 0 && (
              <button className="dash-empty glass" onClick={() => setAdding(true)}>
                <Icon name="monitor" size={22} /><span>Put your first panel on the desktop</span>
              </button>
            )}
            {panels.map((w) => (
              <div key={w.id} className={`desk-item ${selected === w.id ? 'active' : ''} ${w.hidden ? 'is-hidden' : ''}`} onClick={() => useDesk.setState({ selected: w.id })}>
                <span className="widget-pick-icon sm"><Icon name={widgetDef(w.type).icon} size={15} /></span>
                <span className="grow min0">
                  <span className="ellipsis block">{widgetTitle(w, data) || widgetDef(w.type).name}</span>
                </span>
                {w.locked && <Icon name="lock" size={13} className="muted" />}
                <button className="icon-btn" title={w.hidden ? 'Show' : 'Hide'} onClick={(e) => { e.stopPropagation(); patchDesk(w.id, (x) => { x.hidden = !x.hidden }) }}><Icon name={w.hidden ? 'eyeOff' : 'eye'} size={14} /></button>
              </div>
            ))}
          </div>
        </div>
        <div className="desk-side">
          {sel ? <Inspector key={sel.id} w={sel} displays={displays} /> : <DefaultStyle />}
          {sel && <button className="link small desk-default-link" onClick={() => useDesk.setState({ selected: null })}>Style for every panel</button>}
        </div>
      </div>
      {adding && (
        <Modal onClose={() => setAdding(false)} width={720}>
          <div className="modal-head"><h3>Add a panel</h3></div>
          <div className="modal-body">
            <WidgetGallery onPick={add} extra={(
              <div>
                <div className="section-label">Sets</div>
                <div className="widget-gallery">
                  <button className="widget-pick glass" onClick={() => { addDeskSet(); setAdding(false) }}>
                    <span className="widget-pick-icon"><Icon name="layout" size={18} /></span>
                    <span className="strong">Desk set</span>
                    <span className="muted small">Clock, daylight, month, weather, system and four timers down the right side</span>
                  </button>
                </div>
              </div>
            )} />
          </div>
        </Modal>
      )}
    </div>
  )
}
