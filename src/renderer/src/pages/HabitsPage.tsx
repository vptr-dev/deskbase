import { useState } from 'react'
import { applyFreeze } from '../store'
import { act, award, pageItems, removeItem, revoke, upsert, useData, patch } from '../store'
import type { Difficulty, Habit, StatKey } from '../types'
import { DIFFICULTY, STAT_KEYS, freezableDay, habitBestStreak, habitDayTarget, habitDoneOn, habitDueToday, habitRate, habitScheduled, habitStreak, habitWeekCount, habitWeekKey, isWeekly } from '../lib/game'
import { COLORS } from '../lib/defaults'
import { DAYS_SHORT, addDays, friendlyDay, parseDay, today, uid } from '../lib/util'
import { Button, ColorDots, ConfirmButton, Empty, IconPickerButton, MenuButton, Modal, Ring, Segmented } from '../components/ui'
import { Icon } from '../components/Icon'

export function logHabit(id: string, day: string, delta: number): void {
  act((d) => {
    const h = d.habits[id]
    if (!h) return
    const before = h.log[day] ?? 0
    const after = Math.max(0, before + delta)
    if (after === 0) delete h.log[day]
    else h.log[day] = after
    const src = `${id}:${day}`
    if (h.kind === 'good') {
      const need = habitDayTarget(h)
      const wasDone = before >= need
      const isDone = after >= need
      const df = DIFFICULTY[h.difficulty] ?? DIFFICULTY.easy
      if (!wasDone && isDone) {
        const streak = habitStreak(h)
        const bonus = isWeekly(h) ? Math.min(20, streak * 2) : Math.min(20, Math.floor(streak / 7) * 2)
        award(d, { xp: df.xp + bonus, gold: df.gold, label: h.name, source: 'habit', sourceId: src, stat: h.stat })
      } else if (wasDone && !isDone) revoke(d, src)
      if (isWeekly(h)) {
        // Bonus for reaching the weekly target.
        const wk = `${id}:w:${habitWeekKey(day)}`
        const target = Math.max(1, h.target)
        const count = habitWeekCount(h, day)
        const had = d.xpLog.some((e) => e.sourceId === wk)
        if (count >= target && !had) award(d, { xp: df.xp * 2, gold: df.gold * 2, label: `${h.name}: weekly target`, source: 'habit', sourceId: wk, stat: h.stat })
        else if (count < target && had) revoke(d, wk)
      }
    }
  }, { key: 'habit:' + id + day })
}

function newHabit(pageId: string, order: number): Habit {
  return { id: uid(), pageId, name: '', icon: '✅', color: COLORS[order % COLORS.length], kind: 'good', target: 1, days: [0, 1, 2, 3, 4, 5, 6], log: {}, difficulty: 'easy', stat: null, createdAt: Date.now(), order, period: 'day', dayNotes: {}, frozen: [] }
}

function HabitEditor({ habit, onClose }: { habit: Habit; onClose: () => void }): JSX.Element {
  const [h, setH] = useState<Habit>(habit)
  const stats = useData((d) => d.profile.stats)
  const set = (p: Partial<Habit>): void => setH({ ...h, ...p })
  return (
    <Modal onClose={onClose} width={480}>
      <div className="modal-head"><h3>{habit.name ? 'Edit habit' : 'New habit'}</h3></div>
      <div className="modal-body form">
        <div className="row gap-sm">
          <IconPickerButton value={h.icon} onChange={(icon) => set({ icon })} />
          <input id="habit-name" className="input grow" autoFocus placeholder="e.g. Drink water, Read 20 pages" value={h.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
        <label>Type</label>
        <Segmented value={h.kind} onChange={(kind) => set({ kind })} options={[{ value: 'good', label: 'Build a habit' }, { value: 'bad', label: 'Quit a habit' }]} />
        {h.kind === 'good' && <>
          <label>Frequency</label>
          <Segmented small value={h.period ?? 'day'} onChange={(period) => set({ period, target: period === 'week' ? Math.min(7, Math.max(1, h.target > 1 ? h.target : 3)) : 1 })} options={[{ value: 'day', label: 'Daily' }, { value: 'week', label: 'Times per week' }]} />
          {h.period === 'week' ? <>
            <label>Times per week</label>
            <Segmented small value={Math.min(7, h.target)} onChange={(target) => set({ target })} options={[1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: String(n) }))} />
          </> : <>
            <label>Times per day</label>
            <input id="habit-target" type="number" min={1} max={50} className="input w-80" value={h.target} onChange={(e) => set({ target: Math.max(1, Number(e.target.value) || 1) })} />
            <label>Days</label>
            <div className="day-picker">
              {DAYS_SHORT.map((d, i) => (
                <button key={d} className={h.days.includes(i) ? 'active' : ''} onClick={() => set({ days: h.days.includes(i) ? h.days.filter((x) => x !== i) : [...h.days, i].sort() })}>{d[0]}</button>
              ))}
            </div>
          </>}
          <label>Difficulty</label>
          <Segmented small value={h.difficulty} onChange={(difficulty) => set({ difficulty: difficulty as Difficulty })} options={(Object.keys(DIFFICULTY) as Difficulty[]).map((k) => ({ value: k, label: DIFFICULTY[k].label }))} />
          <label>Stat</label>
          <select id="habit-stat" className="input" value={h.stat ?? ''} onChange={(e) => set({ stat: (e.target.value || null) as StatKey | null })}>
            <option value="">None</option>
            {STAT_KEYS.map((k) => <option key={k} value={k}>{stats[k].icon} {stats[k].name}</option>)}
          </select>
        </>}
        <label>Color</label>
        <ColorDots value={h.color} colors={COLORS} onChange={(color) => set({ color })} />
        <label>Notes</label>
        <textarea id="habit-notes" className="input" rows={2} value={h.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} />
      </div>
      <div className="modal-foot">
        {habit.name && <ConfirmButton onConfirm={() => { removeItem('habits', h.id, 'habit'); onClose() }} />}
        <div className="spacer" />
        <Button onClick={onClose}>Cancel</Button>
        <Button kind="primary" disabled={!h.name.trim()} onClick={() => { upsert('habits', { ...h, days: h.days.length ? h.days : [0, 1, 2, 3, 4, 5, 6] }); onClose() }}>Save</Button>
      </div>
    </Modal>
  )
}

function Heatmap({ habit, weeks = 26 }: { habit: Habit; weeks?: number }): JSX.Element {
  const t = today()
  const start = addDays(t, -(weeks * 7 - 1) - parseDay(t).getDay())
  const cells: { k: string; v: number }[] = []
  for (let i = 0; i < weeks * 7 + parseDay(t).getDay() + 1; i++) {
    const k = addDays(start, i)
    cells.push({ k, v: habit.log[k] ?? 0 })
  }
  return (
    <div className="heatmap" style={{ gridTemplateRows: 'repeat(7, 1fr)' }}>
      {cells.map((c) => {
        const lvl = habit.kind === 'bad' ? (c.v ? 1 : 0) : Math.min(1, c.v / habitDayTarget(habit))
        return <div key={c.k} className="heat-cell" title={`${c.k}: ${c.v}`} style={{ background: lvl ? habit.color : undefined, opacity: lvl ? 0.35 + lvl * 0.65 : undefined }} />
      })}
    </div>
  )
}

export function HabitsPage({ pageId }: { pageId: string }): JSX.Element {
  const all = useData((d) => d.habits)
  const [editing, setEditing] = useState<Habit | null>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState<{ id: string; text: string } | null>(null)
  const freezes = useData((d) => d.inventory.freezes)
  const gamified = useData((d) => d.settings.gamification)
  const habits = pageItems(all, pageId).filter((h) => !!h.archived === showArchived)
  const t = today()
  const days = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6))
  const scheduledToday = habits.filter((h) => h.kind === 'good' && habitDueToday(h, t))
  const doneToday = scheduledToday.filter((h) => habitDoneOn(h, t)).length
  const reorder = (from: string, to: string): void => {
    if (from === to) return
    act((d) => {
      const list = pageItems(d.habits, pageId).filter((h) => !!h.archived === showArchived)
      const ids = list.map((h) => h.id)
      const fi = ids.indexOf(from)
      const ti = ids.indexOf(to)
      if (fi < 0 || ti < 0) return
      ids.splice(ti, 0, ids.splice(fi, 1)[0])
      ids.forEach((id, i) => { d.habits[id].order = i })
    })
  }

  return (
    <div className="habits-page">
      <div className="toolbar">
        <Ring value={scheduledToday.length ? doneToday / scheduledToday.length : 0} size={40} stroke={4}><span className="small">{doneToday}/{scheduledToday.length}</span></Ring>
        <div className="toolbar-text"><div className="strong">Today</div><div className="muted small">{scheduledToday.length - doneToday} left</div></div>
        <div className="spacer" />
        <Button kind="ghost" small icon={showArchived ? 'eye' : 'eyeOff'} onClick={() => setShowArchived(!showArchived)}>{showArchived ? 'Active' : 'Archived'}</Button>
        <Button kind="primary" small icon="plus" onClick={() => setEditing(newHabit(pageId, habits.length))}>New habit</Button>
      </div>

      {habits.length === 0 ? <Empty icon="🔁" title={showArchived ? 'No archived habits' : 'No habits yet'} /> : (
        <div className="habit-table glass">
          <div className="habit-head">
            <div />
            {days.map((k) => <div key={k} className={`habit-day ${k === t ? 'today' : ''}`}><span>{DAYS_SHORT[parseDay(k).getDay()][0]}</span><span>{parseDay(k).getDate()}</span></div>)}
            <div className="habit-day">Streak</div>
          </div>
          {habits.map((h) => {
            const streak = habitStreak(h)
            const weekly = isWeekly(h)
            const need = habitDayTarget(h)
            const frozen = new Set(h.frozen ?? [])
            const freezeDay = gamified ? freezableDay(h) : null
            const note = h.dayNotes?.[t] ?? ''
            const recentNotes = Object.entries(h.dayNotes ?? {}).filter(([, v]) => v.trim()).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 5)
            return (
              <div key={h.id} className={`habit-row ${overId === h.id && dragId !== h.id ? 'drag-over' : ''}`}
                onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverId(h.id) } }}
                onDrop={(e) => { e.preventDefault(); if (dragId) reorder(dragId, h.id); setDragId(null); setOverId(null) }}>
                <button className="habit-name" draggable onDragStart={(e) => { setDragId(h.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', h.id) }} onDragEnd={() => { setDragId(null); setOverId(null) }} onClick={() => setDetail(detail === h.id ? null : h.id)}>
                  <span className="habit-icon" style={{ background: h.color + '26' }}>{h.icon}</span>
                  <span className="habit-title">{h.name}{h.kind === 'bad' && <span className="muted small"> · quitting</span>}{weekly && <span className="muted small"> · {habitWeekCount(h, t)}/{h.target} this week</span>}</span>
                </button>
                {days.map((k) => {
                  const v = h.log[k] ?? 0
                  const sched = habitScheduled(h, k)
                  const done = h.kind === 'good' ? v >= need : v > 0
                  const partial = h.kind === 'good' && v > 0 && v < need
                  const isFrozen = frozen.has(k) && !done
                  const dn = h.dayNotes?.[k]
                  return (
                    <button
                      key={k}
                      className={`habit-cell ${done ? (h.kind === 'bad' ? 'slip' : 'done') : ''} ${partial ? 'partial' : ''} ${sched ? '' : 'off'} ${isFrozen ? 'frozen' : ''}`}
                      style={{ ['--c' as any]: h.color }}
                      title={(h.kind === 'bad' ? (v ? `${v} slip(s). Right-click to undo.` : 'Click to log a slip') : isFrozen ? 'Covered by a streak freeze' : `${v}/${need}. Right-click to undo.`) + (dn ? `\n${dn}` : '')}
                      onClick={() => logHabit(h.id, k, h.kind === 'good' && v >= need ? -v : 1)}
                      onContextMenu={(e) => { e.preventDefault(); logHabit(h.id, k, -1) }}
                    >
                      {done ? (h.kind === 'bad' ? <Icon name="x" size={14} stroke={3} /> : <Icon name="check" size={14} stroke={3} />) : partial ? <span className="small">{v}</span> : isFrozen ? <span className="small">❄</span> : null}
                      {dn && <span className="cell-note-dot" />}
                    </button>
                  )
                })}
                <div className="habit-streak">{streak > 0 ? `🔥 ${streak}${weekly ? 'w' : ''}` : '–'}</div>
                {detail === h.id && (
                  <div className="habit-detail">
                    <div className="row gap-lg wrap">
                      <div><div className="muted small">Current</div><div className="big">{streak}{weekly ? 'w' : 'd'}</div></div>
                      <div><div className="muted small">Best</div><div className="big">{habitBestStreak(h)}{weekly ? 'w' : 'd'}</div></div>
                      <div><div className="muted small">{weekly ? '8-week rate' : '30-day rate'}</div><div className="big">{Math.round(habitRate(h, weekly ? 56 : 30) * 100)}%</div></div>
                      <div><div className="muted small">Total</div><div className="big">{Object.values(h.log).reduce((a, b) => a + b, 0)}</div></div>
                      <div className="spacer" />
                      <Button small kind="ghost" icon="edit" onClick={() => setEditing(h)}>Edit</Button>
                      <MenuButton items={[
                        { label: h.archived ? 'Unarchive' : 'Archive', icon: 'folder', onClick: () => patch('habits', h.id, (x) => { x.archived = !x.archived }) },
                        { label: 'Delete', icon: 'trash', danger: true, onClick: () => removeItem('habits', h.id, 'habit') }
                      ]} />
                    </div>
                    {freezeDay && (
                      <div className="row gap-sm freeze-row">
                        <span className="small">Missed {friendlyDay(freezeDay).toLowerCase() === 'yesterday' ? 'yesterday' : friendlyDay(freezeDay)}</span>
                        <Button small disabled={freezes < 1} title={freezes < 1 ? 'Buy streak freezes in the item shop on the Character page' : undefined} onClick={() => applyFreeze(h.id, freezeDay)}>❄ Use streak freeze ({freezes})</Button>
                      </div>
                    )}
                    <Heatmap habit={h} />
                    <div className="row gap-sm">
                      <input id={`hnote-${h.id}`} className="input input-sm grow" placeholder="Note for today" value={noteDraft?.id === h.id ? noteDraft.text : note}
                        onChange={(e) => setNoteDraft({ id: h.id, text: e.target.value })}
                        onBlur={() => { if (noteDraft?.id === h.id) { const text = noteDraft.text.trim(); patch('habits', h.id, (x) => { x.dayNotes = { ...(x.dayNotes ?? {}) }; if (text) x.dayNotes[t] = text; else delete x.dayNotes[t] }); setNoteDraft(null) } }}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
                    </div>
                    {recentNotes.length > 0 && (
                      <div className="history">
                        {recentNotes.map(([k, v]) => <div key={k} className="history-row"><span className="ellipsis">{v}</span><span /><span className="muted small">{friendlyDay(k)}</span></div>)}
                      </div>
                    )}
                    {h.notes && <p className="muted">{h.notes}</p>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {editing && <HabitEditor habit={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
