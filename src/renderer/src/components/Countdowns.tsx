import { useState } from 'react'
import { act, toast, useData } from '../store'
import type { Countdown } from '../types'
import { COLORS } from '../lib/defaults'
import { diffDays, friendlyDay, today, uid } from '../lib/util'
import { Button, IconPickerButton, Modal, ColorDots, Toggle } from './ui'
import { Glyph, Icon } from './Icon'

/** Next occurrence of a countdown (yearly ones roll over to next year). */
export function nextDate(c: Pick<Countdown, 'date' | 'yearly'>, from = today()): string {
  if (!c.yearly || !c.date) return c.date
  const md = c.date.slice(5)
  let y = Number(from.slice(0, 4))
  let d = `${y}-${md}`
  if (d < from) { y += 1; d = `${y}-${md}` }
  return d
}

interface Row { id: string; title: string; icon: string; color: string; date: string; days: number; game?: boolean; src?: Countdown }

export function CountdownsPanel(): JSX.Element {
  const list = useData((d) => d.countdowns)
  const [editing, setEditing] = useState<Countdown | null>(null)
  const [showPast, setShowPast] = useState(false)
  const t = today()
  const rows: Row[] = [
    ...list.filter((c) => c.date).map((c) => { const date = nextDate(c, t); return { id: c.id, title: c.title, icon: c.icon, color: c.color, date, days: diffDays(date, t), src: c } })
  ].sort((a, b) => a.date.localeCompare(b.date))
  const upcoming = rows.filter((r) => r.days >= 0)
  const past = rows.filter((r) => r.days < 0)
  const blank = (): Countdown => ({ id: uid(), title: '', date: '', icon: 'calendar', color: COLORS[list.length % COLORS.length], yearly: false })

  return (
    <section className="panel glass countdowns">
      <div className="panel-head">
        <h3>Countdowns</h3>
        <button className="icon-btn" title="Add countdown" onClick={() => setEditing(blank())}><Icon name="plus" size={14} /></button>
      </div>
      {upcoming.length === 0 && <div className="muted small">Nothing to count down to.</div>}
      {upcoming.slice(0, 6).map((r) => <CountdownRow key={r.id} r={r} onEdit={() => r.src && setEditing(r.src)} />)}
      {past.length > 0 && (
        <>
          <button className="link small" onClick={() => setShowPast(!showPast)}>{showPast ? 'Hide past' : `${past.length} past`}</button>
          {showPast && past.map((r) => <CountdownRow key={r.id} r={r} onEdit={() => r.src && setEditing(r.src)} />)}
        </>
      )}
      {editing && <CountdownEditor c={editing} isNew={!list.some((x) => x.id === editing.id)} onClose={() => setEditing(null)} />}
    </section>
  )
}

function CountdownRow({ r, onEdit }: { r: Row; onEdit: () => void }): JSX.Element {
  return (
    <button className={`countdown-row ${r.days < 0 ? 'past' : ''}`} onClick={onEdit} disabled={r.game} title={r.game ? 'Wishlist release date' : 'Edit'}>
      <span className="countdown-icon" style={{ ['--c' as any]: r.color }}><Glyph value={r.icon} fallback="calendar" size={16} /></span>
      <span className="grow min0">
        <span className="ellipsis d-block">{r.title || 'Untitled'}</span>
        <span className="muted small">{friendlyDay(r.date)}</span>
      </span>
      <span className="countdown-days">
        {r.days === 0 ? <span className="accent strong">Today</span> : <><span className="strong tabular">{Math.abs(r.days)}</span><span className="muted small">{r.days < 0 ? ' days ago' : r.days === 1 ? ' day' : ' days'}</span></>}
      </span>
    </button>
  )
}

function CountdownEditor({ c, isNew, onClose }: { c: Countdown; isNew: boolean; onClose: () => void }): JSX.Element {
  const [v, setV] = useState(c)
  const set = (p: Partial<Countdown>): void => setV((x) => ({ ...x, ...p }))
  const save = (): void => {
    if (!v.title.trim() || !v.date) return
    act((d) => {
      const i = d.countdowns.findIndex((x) => x.id === v.id)
      if (i >= 0) d.countdowns[i] = { ...v, title: v.title.trim() }
      else d.countdowns.push({ ...v, title: v.title.trim() })
    })
    onClose()
  }
  return (
    <Modal onClose={onClose} width={420}>
      <div className="modal-head"><h3>{isNew ? 'New countdown' : 'Edit countdown'}</h3></div>
      <div className="modal-body form" onKeyDown={(e) => { if (e.key === 'Enter') save() }}>
        <div className="row gap-sm">
          <IconPickerButton value={v.icon} placeholder="calendar" onChange={(icon) => set({ icon: icon || 'calendar' })} />
          <input id="cd-title" autoFocus className="input grow" placeholder="Trip, birthday, launch…" value={v.title} onChange={(e) => set({ title: e.target.value })} />
        </div>
        <label>Date</label>
        <input id="cd-date" type="date" className="input" value={v.date} onChange={(e) => set({ date: e.target.value })} />
        <div className="row between"><label htmlFor="cd-yearly">Repeats every year</label><Toggle id="cd-yearly" checked={!!v.yearly} onChange={(y) => set({ yearly: y })} /></div>
        <ColorDots value={v.color} colors={COLORS} onChange={(color) => set({ color })} />
      </div>
      <div className="modal-foot">
        {!isNew && <Button kind="ghost" icon="trash" onClick={() => { act((d) => { d.countdowns = d.countdowns.filter((x) => x.id !== c.id) }); toast('Deleted countdown', { undo: true }); onClose() }}>Delete</Button>}
        <div className="spacer" />
        <Button onClick={onClose}>Cancel</Button>
        <Button kind="primary" disabled={!v.title.trim() || !v.date} onClick={save}>Save</Button>
      </div>
    </Modal>
  )
}
