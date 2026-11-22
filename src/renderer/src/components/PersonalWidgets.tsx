import { useState } from 'react'
import { createPage, openPage, useData } from '../store'
import { metricValue, logMetric } from '../pages/TrackerPage'
import { WishlistPage } from '../pages/WishlistPage'
import { today } from '../lib/util'
import { Button, Progress } from './ui'
import { Glyph } from './Icon'
import { defaultAction, runButtonAction } from './ButtonActions'
import type { ButtonAction } from '../types'

export interface PanelButton { label?: string; action?: ButtonAction }
export function CustomButton({ config }: { config: PanelButton }): JSX.Element {
  return <button type="button" className="btn btn-primary panel-button" onClick={e => runButtonAction(config.action ?? defaultAction, e)}>{config.label?.trim() || 'Button'}</button>
}

export function WishlistWidget({ pageId, setPage }: { pageId?: string; setPage: (id: string) => void }): JSX.Element {
  const pages = useData(d => d.pages)
  const page = pageId ? pages[pageId] : Object.values(pages).find(p => !p.deletedAt && p.type === 'wishlist')
  if (page && !page.deletedAt && page.type === 'wishlist') return <div className="w-scroll"><WishlistPage key={page.id} page={page} compact /></div>
  return <Button small onClick={() => setPage(createPage('wishlist', null, 'Wishlist'))}>Create wishlist</Button>
}

export function TrackerWidget({ metricId, step = 1 }: { metricId?: string; step?: number }): JSX.Element {
  const [entry, setEntry] = useState('')
  const data = useData(d => d)
  const available = Object.values(data.metrics).filter(m => data.pages[m.pageId] && !data.pages[m.pageId].deletedAt)
  const metric = metricId ? available.find(m => m.id === metricId) : available[0]
  if (!metric) return <div className="w-missing">{available.length ? 'Choose a tracker in panel settings.' : <Button small onClick={() => {
    const page = Object.values(data.pages).find(p => p.type === 'tracker' && !p.deletedAt)
    if (page) openPage(page.id); else createPage('tracker', null, 'Trackers')
  }}>Set up a tracker</Button>}</div>
  const value = metricValue(metric, today())
  return <div className="tracker-widget">
    <div className="row gap-sm"><Glyph value={metric.icon} color={metric.color} fallback="activity" size={18} /><strong>{metric.name}</strong></div>
    <div><strong className="big">{value ?? 0}</strong> {metric.unit}</div>
    {metric.goal !== null && <div><Progress value={value === null || !metric.goal ? 0 : metric.direction === 'down' ? (value <= metric.goal ? 1 : metric.goal / value) : value / metric.goal} color={metric.color} /><span className="muted small">Daily goal {metric.goal} {metric.unit}</span></div>}
    <form className="row wrap gap-xs" onSubmit={e => { e.preventDefault(); if (entry.trim() && Number.isFinite(Number(entry))) { logMetric(metric.id, Number(entry)); setEntry('') } }}>
      {metric.aggregate === 'sum' && <button type="button" className="btn btn-sm" onClick={() => logMetric(metric.id, step)}>+{step}</button>}
      <input aria-label={'Log ' + metric.name} type="number" step="any" className="input input-sm grow" value={entry} placeholder={metric.unit || 'Amount'} onChange={e => setEntry(e.target.value)} />
      <button className="btn btn-primary btn-sm" disabled={!entry.trim()}>Log</button></form>
  </div>
}
