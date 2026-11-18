import { useMemo, useState } from 'react'
import { act, emit, getData, patch, removeItem, updatePage, useData } from '../store'
import type { JournalEntry } from '../types'
import { addDays, diffDays, longDate, parseDay, today, uid } from '../lib/util'
import { AutoText, Button, ConfirmButton, Empty, MenuButton, Ring } from '../components/ui'
import { Icon } from '../components/Icon'

export const MOODS = ['', '😞', '😕', '😐', '🙂', '😄']
const ENERGY = ['', 'Drained', 'Low', 'Okay', 'Good', 'Charged']

const PROMPTS = [
  'How was your day?', 'What made you smile today?', 'What did you learn today?', 'What drained your energy, and what gave it back?',
  'What are you looking forward to?', 'What would make tomorrow great?', 'What went better than expected?', 'What is on your mind right now?',
  'Who helped you recently?', 'What did you finish today?', 'What would you tell yourself a year ago?', 'What are you avoiding, and why?',
  'Describe a small win from today.', 'What did you play, read or watch, and what stuck with you?', 'Where did your time go today?',
  'What is one thing you want to remember about today?', 'What challenged you today?', 'What are you proud of this week?'
]
const promptFor = (date: string, shift: number): string => PROMPTS[(((diffDays(date, '2024-01-01') + shift) % PROMPTS.length) + PROMPTS.length) % PROMPTS.length]

function MoodChart({ entries }: { entries: JournalEntry[] }): JSX.Element | null {
  const t = today()
  const by: Record<string, JournalEntry> = {}
  for (const e of entries) by[e.date] = e
  const days = Array.from({ length: 30 }, (_, i) => addDays(t, i - 29))
  if (!days.some((k) => by[k]?.mood)) return null
  const W = 220, H = 64
  const pts = days.map((k, i) => ({ k, x: 4 + (i / 29) * (W - 8), m: by[k]?.mood ?? 0, en: by[k]?.energy ?? 0 }))
  const y = (v: number): number => H - 6 - ((v - 1) / 4) * (H - 12)
  const line = (key: 'm' | 'en'): string => {
    let d = ''
    let pen = false
    for (const p of pts) {
      const v = p[key]
      if (!v) { pen = false; continue }
      d += `${pen ? 'L' : 'M'}${p.x.toFixed(1)},${y(v).toFixed(1)} `
      pen = true
    }
    return d
  }
  return (
    <div className="mood-chart">
      <div className="section-label row between"><span>Mood · 30 days</span><span className="legend-inline"><i className="dot-accent" />mood <i className="dot-energy" />energy</span></div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
        {[1, 3, 5].map((v) => <line key={v} x1={0} x2={W} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} />)}
        <path d={line('en')} fill="none" stroke="var(--warning)" strokeWidth={1.4} strokeDasharray="3 3" opacity={0.8} />
        <path d={line('m')} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {pts.filter((p) => p.m).map((p) => <circle key={p.k} cx={p.x} cy={y(p.m)} r={2.4} fill="var(--accent)"><title>{`${p.k}: ${MOODS[p.m]}`}</title></circle>)}
      </svg>
    </div>
  )
}

export function ensureEntry(pageId: string, date: string): string {
  const existing = Object.values(getData().journal).find((j) => j.pageId === pageId && j.date === date)
  if (existing) return existing.id
  const id = uid()
  act((d) => {
    d.journal[id] = { id, pageId, date, title: '', mood: 0, energy: 0, text: '', tags: [], gratitude: ['', '', ''], createdAt: Date.now(), updatedAt: Date.now() }
  })
  return id
}

function Entry({ entry, wordGoal }: { entry: JournalEntry; wordGoal: number }): JSX.Element {
  const spell = useData((d) => d.settings.spellcheck)
  const [shift, setShift] = useState(0)
  const set = (fn: (j: JournalEntry) => void, key?: string): void => patch('journal', entry.id, (j) => { fn(j); j.updatedAt = Date.now() }, key)
  const words = entry.text.trim() ? entry.text.trim().split(/\s+/).length : 0
  const onBlur = (): void => {
    // Value rules fire once per entry, after the first 30 words.
    if (words >= 30) act((d) => emit(d, { on: 'journal', src: 'journal:' + entry.id, label: 'Journal entry', scope: entry.pageId }), { history: false })
  }
  return (
    <div className="journal-entry glass">
      <div className="journal-date">
        <div className="journal-day">{parseDay(entry.date).getDate()}</div>
        <div>
          <div className="strong">{longDate(entry.date)}</div>
          <div className="muted small">{wordGoal ? `${words} / ${wordGoal} words` : `${words} words`}</div>
        </div>
        <div className="spacer" />
        {wordGoal > 0 && <Ring value={words / wordGoal} size={26} stroke={3} color={words >= wordGoal ? 'var(--success)' : undefined}>{words >= wordGoal ? <span className="tiny">✓</span> : null}</Ring>}
        {!entry.text.trim() && <button className="icon-btn" title="Another prompt" onClick={() => setShift(shift + 1)}><Icon name="restore" size={14} /></button>}
        <button className={`icon-btn ${entry.pinned ? 'accent' : ''}`} title="Pin" onClick={() => set((j) => { j.pinned = !j.pinned })}><Icon name="pin" size={14} /></button>
        <ConfirmButton label="" onConfirm={() => removeItem('journal', entry.id, 'entry')} />
      </div>
      <input id={`jt-${entry.id}`} className="journal-title" placeholder="Title" value={entry.title} onChange={(e) => set((j) => { j.title = e.target.value }, 'jt:' + entry.id)} />
      <div className="mood-row">
        <span className="muted small">Mood</span>
        {MOODS.slice(1).map((m, i) => (
          <button key={m} className={`mood ${entry.mood === i + 1 ? 'active' : ''}`} onClick={() => set((j) => { j.mood = j.mood === i + 1 ? 0 : i + 1 })}>{m}</button>
        ))}
        <span className="muted small ml">Energy</span>
        {ENERGY.slice(1).map((e, i) => (
          <button key={e} title={e} className={`energy ${entry.energy >= i + 1 ? 'active' : ''}`} onClick={() => set((j) => { j.energy = j.energy === i + 1 ? 0 : i + 1 })} />
        ))}
      </div>
      <AutoText className="journal-text" spellCheck={spell} value={entry.text} placeholder={promptFor(entry.date, shift)} onChange={(v) => set((j) => { j.text = v }, 'jx:' + entry.id)} onBlur={onBlur} />
      <div className="gratitude">
        <div className="section-label">Grateful for</div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="grat-row"><span className="muted">{i + 1}.</span>
            <input id={`g-${entry.id}-${i}`} value={entry.gratitude[i] ?? ''} onChange={(e) => set((j) => { j.gratitude[i] = e.target.value }, `g:${entry.id}:${i}`)} />
          </div>
        ))}
      </div>
    </div>
  )
}

export function JournalPage({ pageId }: { pageId: string }): JSX.Element {
  const all = useData((d) => d.journal)
  const wordGoal: number = useData((d) => d.pages[pageId]?.view?.wordGoal ?? 0)
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<string>(today())
  const entries = useMemo(() => Object.values(all).filter((j) => j.pageId === pageId).sort((a, b) => b.date.localeCompare(a.date)), [all, pageId])
  const shown = q ? entries.filter((e) => (e.title + ' ' + e.text + ' ' + e.gratitude.join(' ')).toLowerCase().includes(q.toLowerCase())) : entries.filter((e) => e.date === selected)
  const current = shown[0]
  // streak of consecutive days with entries
  let streak = 0
  for (let k = today(); entries.some((e) => e.date === k && e.text.trim()); k = addDays(k, -1)) streak++
  const avgMood = (() => {
    const m = entries.slice(0, 30).filter((e) => e.mood)
    return m.length ? m.reduce((a, e) => a + e.mood, 0) / m.length : 0
  })()
  const onThisDay = entries.filter((e) => e.date !== today() && e.date.slice(5) === today().slice(5))

  return (
    <div className="journal-page">
      <div className="toolbar">
        <Button small kind="ghost" icon="left" title="Previous day" onClick={() => setSelected(addDays(selected, -1))} />
        <input id={`jdate-${pageId}`} type="date" className="input input-sm" value={selected} onChange={(e) => e.target.value && setSelected(e.target.value)} />
        <Button small kind="ghost" icon="right" title="Next day" onClick={() => setSelected(addDays(selected, 1))} />
        {selected !== today() && <Button small kind="ghost" onClick={() => setSelected(today())}>Today</Button>}
        <div className="spacer" />
        <span className="muted small">{entries.length} entries · {streak}-day streak{avgMood ? ` · avg mood ${MOODS[Math.round(avgMood)]}` : ''}</span>
        <MenuButton icon="edit" title="Word goal" items={[0, 100, 250, 500, 750].map((n) => ({ label: n ? `Word goal: ${n}` : 'No word goal', checked: wordGoal === n, onClick: () => updatePage(pageId, (p) => { p.view = { ...(p.view ?? {}), wordGoal: n } }) }))} />
        <div className="search-mini"><Icon name="search" size={14} /><input id={`jsearch-${pageId}`} placeholder="Search entries" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>

      <div className="journal-layout">
        <div className="journal-main">
          {q ? (
            shown.length ? shown.map((e) => <Entry key={e.id} entry={e} wordGoal={wordGoal} />) : <Empty icon="🔍" title="No matching entries" />
          ) : current ? <Entry entry={current} wordGoal={wordGoal} /> : (
            <div className="journal-empty glass">
              <div className="strong">{longDate(selected)}</div>
              <Button kind="primary" icon="edit" onClick={() => ensureEntry(pageId, selected)}>Write entry</Button>
            </div>
          )}
          {!q && onThisDay.length > 0 && selected === today() && (
            <div className="on-this-day">
              <div className="section-label">On this day</div>
              {onThisDay.map((e) => (
                <button key={e.id} className="otd glass" onClick={() => setSelected(e.date)}>
                  <span className="strong">{parseDay(e.date).getFullYear()}</span> {MOODS[e.mood]} <span className="muted">{(e.title || e.text).slice(0, 90)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="journal-side">
          <MoodChart entries={entries} />
          <div className="section-label">Recent</div>
          {entries.slice(0, 40).map((e) => (
            <button key={e.id} className={`journal-li ${e.date === selected && !q ? 'active' : ''}`} onClick={() => { setQ(''); setSelected(e.date) }}>
              <span className="journal-li-mood">{MOODS[e.mood] || '·'}</span>
              <span className="journal-li-text"><span className="strong small">{e.date}</span><span className="muted small ellipsis">{e.title || e.text.slice(0, 40) || 'Empty'}</span></span>
              {e.pinned && <Icon name="pin" size={12} />}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
