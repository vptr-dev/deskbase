import { useMemo, useState } from 'react'
import { act, award, patch, removeItem, revoke, updatePage, upsert, useData } from '../store'
import type { Game, GameStatus } from '../types'
import { COLORS } from '../lib/defaults'
import { formatMinutes, today, uid } from '../lib/util'
import { AutoText, Button, Checkbox, ConfirmButton, Empty, MenuButton, Modal, Progress, Segmented, Stat } from '../components/ui'
import { Icon } from '../components/Icon'

export const GAME_STATUS: { v: GameStatus; label: string; color: string }[] = [
  { v: 'playing', label: 'Playing', color: '#0a84ff' },
  { v: 'backlog', label: 'Backlog', color: '#8e8e93' },
  { v: 'wishlist', label: 'Wishlist', color: '#bf5af2' },
  { v: 'paused', label: 'Paused', color: '#ff9f0a' },
  { v: 'completed', label: 'Completed', color: '#30d158' },
  { v: 'dropped', label: 'Dropped', color: '#ff453a' }
]
const PLATFORMS = ['PC', 'PlayStation 5', 'PlayStation 4', 'Xbox Series', 'Xbox One', 'Switch', 'Switch 2', 'Steam Deck', 'Mobile', 'Retro', 'Other']
const statusInfo = (s: GameStatus): (typeof GAME_STATUS)[number] => GAME_STATUS.find((x) => x.v === s) ?? GAME_STATUS[1]

function setGameStatus(id: string, status: GameStatus): void {
  act((d) => {
    const g = d.games[id]
    if (!g) return
    const was = g.status
    g.status = status
    if (status === 'playing' && !g.startedAt) g.startedAt = today()
    if (status === 'completed' && was !== 'completed') {
      g.finishedAt = today()
      award(d, { xp: 60, gold: 15, label: 'Finished ' + g.title, source: 'game', sourceId: 'game:' + g.id, stat: 'cre' })
    }
    if (was === 'completed' && status !== 'completed') revoke(d, 'game:' + g.id)
  })
}

function GameEditor({ game, onClose }: { game: Game; onClose: () => void }): JSX.Element {
  const [g, setG] = useState(game)
  const set = (p: Partial<Game>): void => setG({ ...g, ...p })
  return (
    <Modal onClose={onClose} width={520}>
      <div className="modal-head"><h3>{game.title ? 'Edit game' : 'Add game'}</h3></div>
      <div className="modal-body form">
        <input id="game-title" autoFocus className="input" placeholder="Game title" value={g.title} onChange={(e) => set({ title: e.target.value })} />
        <div className="form-2">
          <div><label>Platform</label>
            <input id="game-platform" className="input" list="platforms" value={g.platform} onChange={(e) => set({ platform: e.target.value })} />
            <datalist id="platforms">{PLATFORMS.map((p) => <option key={p} value={p} />)}</datalist>
          </div>
          <div><label>Genre</label><input id="game-genre" className="input" placeholder="RPG, Shooter…" value={g.genre} onChange={(e) => set({ genre: e.target.value })} /></div>
        </div>
        <label>Status</label>
        <select id="game-status" className="input" value={g.status} onChange={(e) => set({ status: e.target.value as GameStatus })}>
          {GAME_STATUS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
        </select>
        <div className="form-2">
          <div><label>Hours played</label><input id="game-hours" type="number" min={0} step={0.5} className="input" value={g.hours} onChange={(e) => set({ hours: Math.max(0, Number(e.target.value) || 0) })} /></div>
          <div><label>Completion %</label><input id="game-comp" type="number" min={0} max={100} className="input" value={g.completion} onChange={(e) => set({ completion: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} /></div>
        </div>
        <label>Rating</label>
        <div className="stars">
          {Array.from({ length: 10 }, (_, i) => (
            <button key={i} className={g.rating > i ? 'on' : ''} onClick={() => set({ rating: g.rating === i + 1 ? 0 : i + 1 })}>★</button>
          ))}
          <span className="muted small">{g.rating ? `${g.rating}/10` : 'Not rated'}</span>
        </div>
        <div className="form-2">
          <div><label>Started</label><input id="game-start" type="date" className="input" value={g.startedAt ?? ''} onChange={(e) => set({ startedAt: e.target.value || null })} /></div>
          <div><label>Finished</label><input id="game-end" type="date" className="input" value={g.finishedAt ?? ''} onChange={(e) => set({ finishedAt: e.target.value || null })} /></div>
        </div>
        <label>Notes</label>
        <textarea id="game-notes" className="input" rows={3} value={g.notes} onChange={(e) => set({ notes: e.target.value })} />
      </div>
      <div className="modal-foot">
        {game.title && <ConfirmButton onConfirm={() => { removeItem('games', g.id, 'game'); onClose() }} />}
        <div className="spacer" />
        <Button onClick={onClose}>Cancel</Button>
        <Button kind="primary" disabled={!g.title.trim()} onClick={() => {
          const was = game.status
          upsert('games', { ...g, status: was })
          if (g.status !== was) setGameStatus(g.id, g.status)
          onClose()
        }}>Save</Button>
      </div>
    </Modal>
  )
}

function GameDetail({ id, onEdit, onClose }: { id: string; onEdit: () => void; onClose: () => void }): JSX.Element | null {
  const g = useData((d) => d.games[id])
  const [mins, setMins] = useState(60)
  const [note, setNote] = useState('')
  const [goal, setGoal] = useState('')
  if (!g) return null
  const st = statusInfo(g.status)
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer glass-strong" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div className="game-cover sm" style={{ background: g.color }}>{g.title.slice(0, 1).toUpperCase()}</div>
          <div className="grow min0"><div className="drawer-title">{g.title}</div><div className="muted small">{[g.platform, g.genre].filter(Boolean).join(' · ')}</div></div>
          <Button kind="ghost" small icon="edit" title="Edit" onClick={onEdit} />
          <Button kind="ghost" small icon="x" title="Close" onClick={onClose} />
        </div>
        <div className="drawer-body">
          <div className="row gap-sm wrap">
            {GAME_STATUS.map((s) => <button key={s.v} className={`chip-btn ${g.status === s.v ? 'active' : ''}`} style={{ ['--c' as any]: s.color }} onClick={() => setGameStatus(g.id, s.v)}>{s.label}</button>)}
          </div>
          <div className="stat-row">
            <Stat label="Played" value={`${g.hours}h`} />
            <Stat label="Completion" value={`${g.completion}%`} />
            <Stat label="Rating" value={g.rating ? `${g.rating}/10` : '–'} />
          </div>
          <Progress value={g.completion / 100} color={st.color} />
          <div className="drawer-section">
            <div className="section-label">Log a session</div>
            <div className="row gap-sm">
              <input id="sess-min" type="number" min={1} className="input input-sm w-80" value={mins} onChange={(e) => setMins(Number(e.target.value) || 0)} />
              <span className="muted small">min</span>
              <input id="sess-note" className="input input-sm grow" placeholder="What happened?" value={note} onChange={(e) => setNote(e.target.value)} />
              <Button small kind="primary" onClick={() => {
                if (mins <= 0) return
                patch('games', g.id, (x) => {
                  x.sessions.unshift({ id: uid(), date: today(), minutes: mins, note })
                  x.hours = Math.round((x.hours + mins / 60) * 10) / 10
                  if (x.status === 'backlog' || x.status === 'paused') x.status = 'playing'
                  if (!x.startedAt) x.startedAt = today()
                })
                setNote('')
              }}>Log</Button>
            </div>
            {g.sessions.slice(0, 12).map((s) => <div key={s.id} className="history-row"><span>{s.date}</span><span className="muted ellipsis">{s.note}</span><span>{formatMinutes(s.minutes)}</span></div>)}
          </div>
          <div className="drawer-section">
            <div className="section-label">Goals & trophies</div>
            {g.goals.map((x, i) => (
              <div key={x.id} className="subtask">
                <Checkbox size={16} checked={x.done} onChange={(v) => act((d) => {
                  d.games[g.id].goals[i].done = v
                  if (v) award(d, { xp: 10, gold: 2, label: `${g.title}: ${x.title}`, source: 'game-goal', sourceId: 'gg:' + x.id, stat: 'cre' })
                  else revoke(d, 'gg:' + x.id)
                })} />
                <span className={`grow ${x.done ? 'strike' : ''}`}>{x.title}</span>
                <button className="icon-btn" onClick={() => patch('games', g.id, (y) => { y.goals.splice(i, 1) })}><Icon name="x" size={12} /></button>
              </div>
            ))}
            <input id="game-goal" className="input input-sm" placeholder="e.g. Beat the final boss, Platinum trophy" value={goal} onChange={(e) => setGoal(e.target.value)} onKeyDown={(e) => {
              if (e.key === 'Enter' && goal.trim()) { patch('games', g.id, (y) => { y.goals.push({ id: uid(), title: goal.trim(), done: false }) }); setGoal('') }
            }} />
          </div>
          <div className="drawer-section">
            <div className="section-label">Notes</div>
            <AutoText className="notes" value={g.notes} placeholder="Builds, codes, thoughts…" onChange={(v) => patch('games', g.id, (y) => { y.notes = v }, 'gn:' + g.id)} />
          </div>
        </div>
      </div>
    </div>
  )
}

export function GamesPage({ pageId }: { pageId: string }): JSX.Element {
  const all = useData((d) => d.games)
  const view = useData((d) => d.pages[pageId]?.view ?? {})
  const [editing, setEditing] = useState<Game | null>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const tab: GameStatus | 'all' = view.tab ?? 'all'
  const layout: 'grid' | 'list' = view.layout ?? 'grid'
  const sort: string = view.sort ?? 'recent'
  const setView = (k: string, v: unknown): void => updatePage(pageId, (p) => { p.view = { ...(p.view ?? {}), [k]: v } })
  const games = useMemo(() => Object.values(all).filter((g) => g.pageId === pageId), [all, pageId])
  const shown = games
    .filter((g) => (tab === 'all' || g.status === tab) && (!q || (g.title + g.platform + g.genre).toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title) : sort === 'hours' ? b.hours - a.hours : sort === 'rating' ? b.rating - a.rating : b.createdAt - a.createdAt)
  const blank = (): Game => ({ id: uid(), pageId, title: '', platform: 'PC', genre: '', status: 'backlog', hours: 0, rating: 0, completion: 0, notes: '', color: COLORS[games.length % COLORS.length], createdAt: Date.now(), sessions: [], goals: [] })
  const totalHours = games.reduce((a, g) => a + g.hours, 0)
  const rated = games.filter((g) => g.rating)
  return (
    <div className="games-page">
      <div className="stat-row">
        <Stat label="Games" value={games.length} />
        <Stat label="Playing" value={games.filter((g) => g.status === 'playing').length} />
        <Stat label="Completed" value={games.filter((g) => g.status === 'completed').length} />
        <Stat label="Hours" value={Math.round(totalHours)} />
        <Stat label="Avg rating" value={rated.length ? (rated.reduce((a, g) => a + g.rating, 0) / rated.length).toFixed(1) : '–'} />
      </div>
      <div className="toolbar">
        <Segmented small value={tab} onChange={(v) => setView('tab', v)} options={[{ value: 'all', label: 'All' }, ...GAME_STATUS.map((s) => ({ value: s.v, label: s.label }))]} />
        <div className="spacer" />
        <div className="search-mini"><Icon name="search" size={14} /><input id={`gsearch-${pageId}`} placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <MenuButton icon="sort" title="Sort" items={['recent', 'title', 'hours', 'rating'].map((s) => ({ label: 'Sort: ' + s, checked: sort === s, onClick: () => setView('sort', s) }))} />
        <Button small kind="ghost" icon={layout === 'grid' ? 'list' : 'grid'} title="Toggle layout" onClick={() => setView('layout', layout === 'grid' ? 'list' : 'grid')} />
        <Button small kind="primary" icon="plus" onClick={() => setEditing(blank())}>Add game</Button>
      </div>
      {shown.length === 0 ? <Empty icon="🎮" title={games.length ? 'No games match' : 'Your library is empty'} /> : layout === 'grid' ? (
        <div className="game-grid">
          {shown.map((g) => {
            const st = statusInfo(g.status)
            return (
              <button key={g.id} className="game-card glass" onClick={() => setDetail(g.id)}>
                <div className="game-cover" style={{ background: `linear-gradient(135deg, ${g.color}, ${g.color}88)` }}>{g.title.slice(0, 1).toUpperCase()}</div>
                <div className="game-info">
                  <div className="game-title ellipsis">{g.title}</div>
                  <div className="muted small ellipsis">{g.platform}{g.hours ? ` · ${g.hours}h` : ''}</div>
                  <div className="row between">
                    <span className="status-pill" style={{ ['--c' as any]: st.color }}>{st.label}</span>
                    {g.rating ? <span className="small">★ {g.rating}</span> : null}
                  </div>
                  {g.completion > 0 && <Progress value={g.completion / 100} height={3} color={st.color} />}
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="table glass">
          <div className="tr th"><span>Title</span><span>Platform</span><span>Status</span><span>Hours</span><span>%</span><span>Rating</span></div>
          {shown.map((g) => (
            <button key={g.id} className="tr" onClick={() => setDetail(g.id)}>
              <span className="strong ellipsis">{g.title}</span><span>{g.platform}</span>
              <span><span className="status-pill" style={{ ['--c' as any]: statusInfo(g.status).color }}>{statusInfo(g.status).label}</span></span>
              <span>{g.hours}</span><span>{g.completion}</span><span>{g.rating || ''}</span>
            </button>
          ))}
        </div>
      )}
      {detail && !editing && <GameDetail id={detail} onEdit={() => setEditing(all[detail])} onClose={() => setDetail(null)} />}
      {editing && <GameEditor game={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
