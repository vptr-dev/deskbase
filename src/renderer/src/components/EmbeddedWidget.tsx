import { useState } from 'react'
import type { Block } from '../types'
import { act, useData } from '../store'
import { sourceWidget, type WidgetSource } from '../lib/widgetSources'
import { fullStyle, widgetClass, widgetVars } from '../lib/widgetStyle'
import { PanelBody } from './PanelBody'
import { WidgetActionHost } from './WidgetActionHost'
import { WidgetBody, widgetDef, widgetTitle } from './Widgets'
import { Icon } from './Icon'

export function EmbeddedWidget({ block, locked, select }: { block: Block; locked?: boolean; select: (source: WidgetSource) => void }): JSX.Element {
  const data = useData(d => d)
  const [choosing, setChoosing] = useState(false)
  const source = block.widgetSource
  const w = source && sourceWidget(data,source)
  if (!w || !source || choosing) {
    const options = [
      ...data.desktop.widgets.map(w => ({ source:{page:null,id:w.id}, title:widgetTitle(w,data) || widgetDef(w.type).name, group:data.desktop.spaces.find(s => s.id === w.space)?.name || 'Desktop' })),
      ...Object.values(data.pages).filter(p => !p.deletedAt).flatMap(p => (p.widgets ?? []).map(w => ({ source:{page:p.id,id:w.id}, title:widgetTitle(w,data) || widgetDef(w.type).name, group:p.title || 'Dashboard' })))
    ]
    return <div className="embed-widget-picker">{locked ? 'Widget unavailable' : <label>Link a widget<select aria-label="Link a widget" className="input input-sm" value="" onChange={e => {
      const option = options[Number(e.target.value)]; if (option) { select(option.source); setChoosing(false) }
    }}><option value="">Choose a desktop or dashboard widget</option>{options.map((o,i) => <option key={o.source.id + o.group} value={i}>{o.group} / {o.title}</option>)}</select></label>}</div>
  }
  const st = fullStyle(source.page ? undefined : data.desktop.style,w.style)
  const name = widgetTitle(w,data) || widgetDef(w.type).name
  const patch = (recipe: (cfg: Record<string,any>) => void): void => act(d => {
    const origin = sourceWidget(d,source); if (origin) recipe(origin.config)
  })
  return <WidgetActionHost className={'widget embedded-widget wt-' + w.type + ' ' + widgetClass(st)} data-theme={st.theme === 'auto' ? undefined : st.theme}
    style={widgetVars(st)} widget={w} source={source} name={name} resetTimer={() => patch(c => { c.endsAt = null; c.left = null })}>
    <div className="widget-head"><Icon name={widgetDef(w.type).icon} size={14} /><strong className="grow">{name}</strong>
      {!locked && <button className="icon-btn" title="Choose a different widget" onClick={() => setChoosing(true)}><Icon name="link" size={13} /></button>}</div>
    <PanelBody><WidgetBody w={w} setConfig={(k,v) => patch(c => { c[k] = v })} /></PanelBody>
  </WidgetActionHost>
}
