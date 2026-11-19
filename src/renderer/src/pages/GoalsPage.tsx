import { useState } from 'react'
import { act, emit, pageItems, removeItem, unemit, upsert, useData, patch, fireConfetti } from '../store'
import type { Goal, Task } from '../types'
import { COLORS } from '../lib/defaults'
import { diffDays, friendlyDay, parseQuickAdd, today, uid } from '../lib/util'
import { addTask, setTaskDone } from '../store'
import { Button, ColorDots, ConfirmButton, Empty, IconPickerButton, Modal, Ring, Segmented } from '../components/ui'
import { Glyph, Icon } from '../components/Icon'

export const goalTasks = (g: Goal, tasks: Record<string, Task>): Task[] => Object.values(tasks).filter((t) => t.goalId === g.id)

export const goalProgress = (g: Goal, tasks: Record<string, Task> = {}): number => {
  if (g.done) return 1
  if (g.progressMode === 'manual') return g.manual / 100
  if (g.progressMode === 'tasks') {
    const list = goalTasks(g, tasks)
    return list.length ? list.filter((t) => t.done).length / list.length : 0
  }
  return g.milestones.length ? g.milestones.filter((m) => m.done).length / g.milestones.length : 0
}

export function setGoalDone(id: string, done: boolean): void {
  act((d) => {
    const g = d.goals[id]
    if (!g || g.done === done) return
    g.done = done
    g.doneAt = done ? Date.now() : null
    if (done) emit(d, { on: 'goal', src: 'goal:' + g.id, label: g.title, scope: g.pageId })
    else unemit(d, 'goal:' + g.id)
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
          <IconPickerButton value={g.icon} placeholder="target" color={g.color} onChange={(icon) => set({ icon: icon || 'target' })} />
          <input id="goal-title" autoFocus className="input grow" placeholder="What do you want to achieve?" value={g.title} onChange={(e) => set({ title: e.target.value })} />
        </div>
        <label>Why it matters</label>
        <textarea id="goal-why" className="input" rows={2} value={g.why} onChange={(e) => set({ why: e.target.value })} />
        <label>Category</label>
        <input id="goal-cat" className="input" placeholder="Health, Career, Skills…" value={g.category} onChange={(e) => set({ category: e.target.value })} />
        <label>Deadline</label>
        <input id="goal-deadline" type="date" className="input" value={g.deadline ?? ''} onChange={(e) => set({ deadline: e.target.value || null })} />
        <label>Progress</label>
        <Segmented small value={g.progressMode} onChange={(progressMode) => set({ progressMode })} options={[{ value: 'milestones', label: 'Milestones' }, { value: 'tasks', label: 'Linked tasks' }, { value: 'manual', label: 'Manual %' }]} />
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
  const listPage = useData((d) => Object.values(d.pages).find((p) => p.type === 'tasks' && !p.deletedAt)?.id)
  const [ms, setMs] = useState('')
  const tasks = useData((d) => d.tasks)
  const linked = goalTasks(g, tasks).sort((a, b) => Number(a.done) - Number(b.done) || (a.due ?? '9').localeCompare(b.due ?? '9'))
  const p = goalProgress(g, tasks)
  const left = g.deadline ? diffDays(g.deadline, today()) : null
  return (
    <div className={`goal-card glass ${g.done ? 'done' : ''}`}>
      <div className="goal-head">
        <Ring value={p} color={g.color} size={52} stroke={5}><span className="goal-icon"><Glyph value={g.icon} fallback="target" size={20} color={g.color} /></span></Ring>
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
      {g.progressMode === 'tasks' ? (
        <div className="milestones">
          {linked.length === 0 && <div className="muted small">No linked tasks</div>}
          {linked.slice(0, 8).map((t) => (
            <label key={t.id} className={`milestone ${t.done ? 'done' : ''}`}>
              <input type="checkbox" checked={t.done} style={{ accentColor: g.color }} onChange={(e) => setTaskDone(t.id, e.target.checked)} />
              <span className="grow ellipsis">{t.title}</span>
              {t.due && <span className="muted small">{friendlyDay(t.due)}</span>}
            </label>
          ))}
          {linked.length > 8 && <div className="muted small">+{linked.length - 8} more</div>}
          {listPage && <input id={`gt-${g.id}`} className="input input-sm" placeholder="Add a task for this goal" value={ms} onChange={(e) => setMs(e.target.value)} onKeyDown={(e) => {
            if (e.key === 'Enter' && ms.trim()) {
              const q = parseQuickAdd(ms.trim())
              addTask(listPage, { title: q.title || ms.trim(), due: q.due ?? null, time: q.time ?? null, priority: q.priority ?? 0, tags: q.tags, repeat: q.repeat ?? 'none', goalId: g.id })
              setMs('')
            }
          }} />}
        </div>
      ) : g.progressMode === 'manual' ? (
        <input id={`gm-${g.id}`} type="range" min={0} max={100} value={g.manual} onChange={(e) => patch('goals', g.id, (x) => { x.manual = Number(e.target.value) }, 'gm:' + g.id)} style={{ accentColor: g.color }} />
      ) : (
        <div className="milestones">
          {g.milestones.map((m, i) => (
            <label key={m.id} className={`milestone ${m.done ? 'done' : ''}`}>
              <input type="checkbox" checked={m.done} style={{ accentColor: g.color }} onChange={(e) => {
                const v = e.target.checked
                act((d) => {
                  d.goals[g.id].milestones[i].done = v
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
  const blank = (): Goal => ({ id: uid(), pageId, title: '', why: '', icon: 'target', deadline: null, milestones: [], progressMode: 'milestones', manual: 0, color: COLORS[goals.length % COLORS.length], done: false, createdAt: Date.now(), category: '', difficulty: 'hard', order: goals.length })
  return (
    <div className="goals-page">
      <div className="toolbar">
        <Segmented small value={tab} onChange={setTab} options={[{ value: 'active', label: `Active ${goals.filter((g) => !g.done).length}` }, { value: 'done', label: `Completed ${goals.filter((g) => g.done).length}` }]} />
        <div className="spacer" />
        <Button kind="primary" small icon="plus" onClick={() => setEditing(blank())}>New goal</Button>
      </div>
      {list.length === 0 ? <Empty icon="target" title={tab === 'done' ? 'No completed goals yet' : 'No active goals'} /> : (
        <div className="card-grid">{list.map((g) => <GoalCard key={g.id} g={g} onEdit={() => setEditing(g)} />)}</div>
      )}
      {editing && <GoalEditor goal={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

