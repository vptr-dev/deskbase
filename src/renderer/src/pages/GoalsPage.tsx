import { useState } from 'react'
import { act, award, getData as useDataSnapshot, pageItems, removeItem, revoke, toast, upsert, useData, patch, fireConfetti } from '../store'
import type { Difficulty, Goal, Reward } from '../types'
import { DIFFICULTY } from '../lib/game'
import { COLORS } from '../lib/defaults'
import { diffDays, today, uid } from '../lib/util'
import { Button, ColorDots, ConfirmButton, Empty, IconPickerButton, Modal, Ring, Segmented } from '../components/ui'
import { Icon } from '../components/Icon'

export const goalProgress = (g: Goal): number =>
  g.done ? 1 : g.progressMode === 'manual' ? g.manual / 100 : g.milestones.length ? g.milestones.filter((m) => m.done).length / g.milestones.length : 0

export function setGoalDone(id: string, done: boolean): void {
  act((d) => {
    const g = d.goals[id]
    if (!g || g.done === done) return
    g.done = done
    g.doneAt = done ? Date.now() : null
    const df = DIFFICULTY[g.difficulty] ?? DIFFICULTY.hard
    if (done) award(d, { xp: df.xp * 3, gold: df.gold * 3, label: 'Goal: ' + g.title, source: 'goal', sourceId: g.id })
    else revoke(d, g.id)
  })
  if (done) fireConfetti()
}

function GoalEditor({ goal, onClose }: { goal: Goal; onClose: () => void }): JSX.Element {
  const [g, setG] = useState(goal)
  const set = (p: Partial<Goal>): void => setG({ ...g, ...p })
  return (
    <Modal onClose={onClose} width={500}>
      <div className="modal-head"><h3>{goal.title ? 'Edit goal' : 'New goal'}</h3></div>
      <div className="modal-body form">
        <div className="row gap-sm">
          <IconPickerButton value={g.icon} onChange={(icon) => set({ icon })} />
          <input id="goal-title" autoFocus className="input grow" placeholder="What do you want to achieve?" value={g.title} onChange={(e) => set({ title: e.target.value })} />
        </div>
        <label>Why it matters</label>
        <textarea id="goal-why" className="input" rows={2} value={g.why} onChange={(e) => set({ why: e.target.value })} />
        <label>Category</label>
        <input id="goal-cat" className="input" placeholder="Health, Career, Skills…" value={g.category} onChange={(e) => set({ category: e.target.value })} />
        <label>Deadline</label>
        <input id="goal-deadline" type="date" className="input" value={g.deadline ?? ''} onChange={(e) => set({ deadline: e.target.value || null })} />
        <label>Progress</label>
        <Segmented small value={g.progressMode} onChange={(progressMode) => set({ progressMode })} options={[{ value: 'milestones', label: 'From milestones' }, { value: 'manual', label: 'Manual %' }]} />
        <label>Difficulty</label>
        <Segmented small value={g.difficulty} onChange={(difficulty) => set({ difficulty: difficulty as Difficulty })} options={(Object.keys(DIFFICULTY) as Difficulty[]).map((k) => ({ value: k, label: DIFFICULTY[k].label }))} />
        <label>Color</label>
        <ColorDots value={g.color} colors={COLORS} onChange={(color) => set({ color })} />
      </div>
      <div className="modal-foot">
        <div className="spacer" />
        <Button onClick={onClose}>Cancel</Button>
        <Button kind="primary" disabled={!g.title.trim()} onClick={() => { upsert('goals', g); onClose() }}>Save</Button>
      </div>
    </Modal>
  )
}

function GoalCard({ g, onEdit }: { g: Goal; onEdit: () => void }): JSX.Element {
  const [ms, setMs] = useState('')
  const p = goalProgress(g)
  const left = g.deadline ? diffDays(g.deadline, today()) : null
  return (
    <div className={`goal-card glass ${g.done ? 'done' : ''}`}>
      <div className="goal-head">
        <Ring value={p} color={g.color} size={52} stroke={5}><span className="goal-icon">{g.icon || '🎯'}</span></Ring>
        <div className="grow min0">
          <div className="goal-title">{g.title}</div>
          <div className="muted small">
            {g.category && <span>{g.category} · </span>}
            {Math.round(p * 100)}%
            {left !== null && !g.done && <span className={left < 0 ? 'danger' : ''}> · {left < 0 ? `${-left}d overdue` : left === 0 ? 'due today' : `${left}d left`}</span>}
            {g.done && g.doneAt && <span> · done {new Date(g.doneAt).toLocaleDateString()}</span>}
          </div>
        </div>
        <Button small kind="ghost" icon="edit" title="Edit" onClick={onEdit} />
      </div>
      {g.why && <p className="goal-why">{g.why}</p>}
      {g.progressMode === 'manual' ? (
        <input id={`gm-${g.id}`} type="range" min={0} max={100} value={g.manual} onChange={(e) => patch('goals', g.id, (x) => { x.manual = Number(e.target.value) }, 'gm:' + g.id)} style={{ accentColor: g.color }} />
      ) : (
        <div className="milestones">
          {g.milestones.map((m, i) => (
            <label key={m.id} className={`milestone ${m.done ? 'done' : ''}`}>
              <input type="checkbox" checked={m.done} style={{ accentColor: g.color }} onChange={(e) => {
                const v = e.target.checked
                act((d) => {
                  const x = d.goals[g.id]
                  x.milestones[i].done = v
                  const src = 'ms:' + m.id
                  if (v) award(d, { xp: 15, gold: 3, label: 'Milestone: ' + m.title, source: 'milestone', sourceId: src })
                  else revoke(d, src)
                })
              }} />
              <span className="grow">{m.title}</span>
              <button className="icon-btn" onClick={(e) => { e.preventDefault(); patch('goals', g.id, (x) => { x.milestones.splice(i, 1) }) }}><Icon name="x" size={12} /></button>
            </label>
          ))}
          <input id={`ms-${g.id}`} className="input input-sm" placeholder="Add milestone" value={ms} onChange={(e) => setMs(e.target.value)} onKeyDown={(e) => {
            if (e.key === 'Enter' && ms.trim()) { patch('goals', g.id, (x) => { x.milestones.push({ id: uid(), title: ms.trim(), done: false }) }); setMs('') }
          }} />
        </div>
      )}
      <div className="goal-foot">
        <Button small kind={g.done ? 'default' : 'primary'} icon={g.done ? 'undo' : 'trophy'} onClick={() => setGoalDone(g.id, !g.done)}>{g.done ? 'Reopen' : 'Complete goal'}</Button>
        <div className="spacer" />
        <ConfirmButton onConfirm={() => removeItem('goals', g.id, 'goal')} label="" />
      </div>
    </div>
  )
}

export function GoalsPage({ pageId }: { pageId: string }): JSX.Element {
  const all = useData((d) => d.goals)
  const [editing, setEditing] = useState<Goal | null>(null)
  const [tab, setTab] = useState<'active' | 'done'>('active')
  const goals = pageItems(all, pageId)
  const list = goals.filter((g) => (tab === 'done' ? g.done : !g.done))
  const blank = (): Goal => ({ id: uid(), pageId, title: '', why: '', icon: '🎯', deadline: null, milestones: [], progressMode: 'milestones', manual: 0, color: COLORS[goals.length % COLORS.length], done: false, createdAt: Date.now(), category: '', difficulty: 'hard', order: goals.length })
  return (
    <div className="goals-page">
      <div className="toolbar">
        <Segmented small value={tab} onChange={setTab} options={[{ value: 'active', label: `Active ${goals.filter((g) => !g.done).length}` }, { value: 'done', label: `Completed ${goals.filter((g) => g.done).length}` }]} />
        <div className="spacer" />
        <Button kind="primary" small icon="plus" onClick={() => setEditing(blank())}>New goal</Button>
      </div>
      {list.length === 0 ? <Empty icon="🎯" title={tab === 'done' ? 'No completed goals yet' : 'No active goals'} /> : (
        <div className="card-grid">{list.map((g) => <GoalCard key={g.id} g={g} onEdit={() => setEditing(g)} />)}</div>
      )}
      {editing && <GoalEditor goal={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

// ---------- Rewards ----------
export function buyReward(id: string): void {
  const d0 = useDataSnapshot()
  const r = d0.rewards[id]
  if (!r) return
  if (d0.profile.gold < r.cost) { toast(`You need ${r.cost - d0.profile.gold} more gold`, { kind: 'error' }); return }
  act((d) => {
    const x = d.rewards[id]
    d.profile.gold -= x.cost
    x.purchases.push(Date.now())
    d.xpLog.unshift({ id: uid(), at: Date.now(), xp: 0, gold: -x.cost, label: 'Bought ' + x.name, source: 'reward', sourceId: x.id })
  })
  toast(`Enjoy: ${r.name}`, { icon: r.icon, kind: 'info', undo: true })
}


function RewardEditor({ reward, onClose }: { reward: Reward; onClose: () => void }): JSX.Element {
  const [r, setR] = useState(reward)
  return (
    <Modal onClose={onClose} width={440}>
      <div className="modal-head"><h3>{reward.name ? 'Edit reward' : 'New reward'}</h3></div>
      <div className="modal-body form">
        <div className="row gap-sm">
          <IconPickerButton value={r.icon} onChange={(icon) => setR({ ...r, icon })} />
          <input id="reward-name" autoFocus className="input grow" placeholder="e.g. 1 hour of gaming, Order takeout" value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} />
        </div>
        <label>Cost in gold</label>
        <input id="reward-cost" type="number" min={1} className="input w-120" value={r.cost} onChange={(e) => setR({ ...r, cost: Math.max(1, Number(e.target.value) || 1) })} />
        <label>Notes</label>
        <textarea id="reward-notes" className="input" rows={2} value={r.notes} onChange={(e) => setR({ ...r, notes: e.target.value })} />
        <label className="row gap-sm"><input type="checkbox" checked={r.repeatable} onChange={(e) => setR({ ...r, repeatable: e.target.checked })} /> Can be bought more than once</label>
      </div>
      <div className="modal-foot">
        {reward.name && <ConfirmButton onConfirm={() => { removeItem('rewards', r.id, 'reward'); onClose() }} />}
        <div className="spacer" />
        <Button onClick={onClose}>Cancel</Button>
        <Button kind="primary" disabled={!r.name.trim()} onClick={() => { upsert('rewards', r); onClose() }}>Save</Button>
      </div>
    </Modal>
  )
}

export function RewardsPage({ pageId }: { pageId: string }): JSX.Element {
  const all = useData((d) => d.rewards)
  const gold = useData((d) => d.profile.gold)
  const log = useData((d) => d.xpLog.filter((e) => e.source === 'reward').slice(0, 20))
  const [editing, setEditing] = useState<Reward | null>(null)
  const rewards = pageItems(all, pageId)
  const blank = (): Reward => ({ id: uid(), pageId, name: '', icon: '🎁', cost: 50, notes: '', purchases: [], repeatable: true, order: rewards.length })
  return (
    <div className="rewards-page">
      <div className="toolbar">
        <div className="gold-balance"><Icon name="coin" size={20} /> <span className="big">{gold}</span> <span className="muted">gold</span></div>
        <div className="spacer" />
        <Button kind="primary" small icon="plus" onClick={() => setEditing(blank())}>New reward</Button>
      </div>
      {rewards.length === 0 ? <Empty icon="🎁" title="No rewards yet" /> : (
        <div className="card-grid small-cards">
          {rewards.map((r) => {
            const owned = !r.repeatable && r.purchases.length > 0
            return (
              <div key={r.id} className={`reward-card glass ${owned ? 'owned' : ''}`}>
                <button className="reward-edit icon-btn" onClick={() => setEditing(r)} title="Edit"><Icon name="edit" size={13} /></button>
                <div className="reward-icon">{r.icon}</div>
                <div className="reward-name">{r.name}</div>
                {r.notes && <div className="muted small">{r.notes}</div>}
                <div className="muted small">{r.purchases.length ? `Bought ${r.purchases.length}×` : 'Never bought'}</div>
                <Button small kind={gold >= r.cost && !owned ? 'primary' : 'default'} disabled={owned} onClick={() => buyReward(r.id)}>
                  {owned ? 'Owned' : <><Icon name="coin" size={13} /> {r.cost}</>}
                </Button>
              </div>
            )
          })}
        </div>
      )}
      {log.length > 0 && (
        <div className="history">
          <div className="section-label">Purchase history</div>
          {log.map((e) => <div key={e.id} className="history-row"><span>{e.label}</span><span className="muted">{new Date(e.at).toLocaleString()}</span><span className="danger">{e.gold}</span></div>)}
        </div>
      )}
      {editing && <RewardEditor reward={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}


