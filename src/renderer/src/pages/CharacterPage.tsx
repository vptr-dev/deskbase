import { useState } from 'react'
import { act, award, useData } from '../store'
import type { StatKey } from '../types'
import { ACHIEVEMENTS, STAT_KEYS, levelInfo, rankTitle, statLevel, xpByDay, xpToday } from '../lib/game'
import { DAYS_SHORT, addDays, dayKey, parseDay, timeAgo, today } from '../lib/util'
import { BarChart, Button, IconPickerButton, Progress, Ring, Segmented, Stat } from '../components/ui'
import { Icon } from '../components/Icon'

function ActivityHeatmap(): JSX.Element {
  const by = useData(xpByDay)
  const weeks = 26
  const t = today()
  const start = addDays(t, -(weeks * 7 - 1) - parseDay(t).getDay())
  const cells = Array.from({ length: weeks * 7 + parseDay(t).getDay() + 1 }, (_, i) => addDays(start, i))
  const max = Math.max(50, ...Object.values(by))
  return (
    <div className="heatmap" style={{ gridTemplateRows: 'repeat(7, 1fr)' }}>
      {cells.map((k) => {
        const v = by[k] ?? 0
        return <div key={k} className="heat-cell" title={`${k}: ${v} XP`} style={{ background: v ? 'var(--accent)' : undefined, opacity: v ? 0.25 + Math.min(1, v / max) * 0.75 : undefined }} />
      })}
    </div>
  )
}

export function CharacterPage(): JSX.Element {
  const profile = useData((d) => d.profile)
  const log = useData((d) => d.xpLog)
  const todayXp = useData(xpToday)
  const goal = useData((d) => d.settings.dailyXpGoal)
  const tasksDone = useData((d) => Object.values(d.tasks).filter((t) => t.done).length)
  const habitsCount = useData((d) => Object.keys(d.habits).length)
  const focusMin = useData((d) => d.focus.filter((f) => f.kind === 'focus').reduce((a, f) => a + f.minutes, 0))
  const [range, setRange] = useState<'week' | 'month'>('week')
  const [editStat, setEditStat] = useState<StatKey | null>(null)
  const lv = levelInfo(profile.xp)
  const unlocked = Object.keys(profile.achievements).length
  const by = xpByDay(useData((d) => d))
  const n = range === 'week' ? 7 : 30
  const chart = Array.from({ length: n }, (_, i) => {
    const k = addDays(today(), i - n + 1)
    return { label: range === 'week' ? DAYS_SHORT[parseDay(k).getDay()][0] : String(parseDay(k).getDate()), value: by[k] ?? 0 }
  })

  return (
    <div className="character">
      <div className="hero glass">
        <IconPickerButton size="lg" value={profile.avatar} onChange={(avatar) => act((d) => { d.profile.avatar = avatar || '🧙' })} />
        <div className="hero-main">
          <input id="profile-name" className="hero-name" value={profile.name} onChange={(e) => act((d) => { d.profile.name = e.target.value }, { key: 'pname' })} />
          <input id="profile-title" className="hero-title" placeholder={rankTitle(lv.level)} value={profile.title} onChange={(e) => act((d) => { d.profile.title = e.target.value }, { key: 'ptitle' })} />
          <div className="hero-level">
            <span className="level-badge">Level {lv.level}</span>
            <Progress value={lv.pct} height={8} className="grow" />
            <span className="muted small">{lv.into} / {lv.need} XP</span>
          </div>
        </div>
        <div className="hero-side">
          <Ring value={goal ? todayXp / goal : 0} size={72} stroke={6}><div className="center"><div className="strong">{todayXp}</div><div className="muted tiny">of {goal}</div></div></Ring>
          <div className="muted small">XP today</div>
        </div>
      </div>

      <div className="stat-row">
        <Stat label="Total XP" value={profile.xp.toLocaleString()} />
        <Stat label="Gold" value={<span className="row gap-xs"><Icon name="coin" size={16} />{profile.gold}</span>} />
        <Stat label="Tasks done" value={tasksDone} />
        <Stat label="Habits" value={habitsCount} />
        <Stat label="Focus time" value={`${Math.round(focusMin / 60)}h`} />
        <Stat label="Achievements" value={`${unlocked}/${ACHIEVEMENTS.length}`} />
      </div>

      <div className="two-col">
        <section className="panel glass">
          <div className="panel-head"><h3>Attributes</h3></div>
          <div className="attrs">
            {STAT_KEYS.map((k) => {
              const s = profile.stats[k]
              const sl = statLevel(s.xp)
              return (
                <div key={k} className="attr">
                  <span className="attr-icon">{s.icon}</span>
                  <div className="grow">
                    <div className="row between">
                      {editStat === k ? (
                        <input id={`stat-${k}`} autoFocus className="input input-sm" defaultValue={s.name} onBlur={(e) => { act((d) => { d.profile.stats[k].name = e.target.value || s.name }); setEditStat(null) }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
                      ) : <button className="attr-name" onDoubleClick={() => setEditStat(k)} title="Double-click to rename">{s.name}</button>}
                      <span className="muted small">Lv {sl.level}</span>
                    </div>
                    <Progress value={sl.pct} height={5} />
                  </div>
                </div>
              )
            })}
          </div>
        </section>
        <section className="panel glass">
          <div className="panel-head">
            <h3>XP earned</h3>
            <Segmented small value={range} onChange={setRange} options={[{ value: 'week', label: '7 days' }, { value: 'month', label: '30 days' }]} />
          </div>
          <BarChart data={chart} height={150} format={(v) => `${v} XP`} />
        </section>
      </div>

      <section className="panel glass">
        <div className="panel-head"><h3>Activity</h3><span className="muted small">Last 6 months</span></div>
        <ActivityHeatmap />
      </section>

      <section className="panel glass">
        <div className="panel-head"><h3>Achievements</h3><span className="muted small">{unlocked} unlocked</span></div>
        <div className="achievements">
          {ACHIEVEMENTS.map((a) => {
            const at = profile.achievements[a.id]
            return (
              <div key={a.id} className={`achievement ${at ? 'unlocked' : ''}`} title={at ? `Unlocked ${new Date(at).toLocaleDateString()}` : 'Locked'}>
                <div className="ach-icon">{at ? a.icon : '🔒'}</div>
                <div className="ach-name">{a.name}</div>
                <div className="ach-desc">{a.desc}</div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="panel glass">
        <div className="panel-head"><h3>Recent activity</h3>
          <Button small kind="ghost" icon="plus" onClick={() => act((d) => award(d, { xp: 10, gold: 0, label: 'Bonus XP', source: 'manual', sourceId: 'manual:' + Date.now() }))}>Bonus 10 XP</Button>
        </div>
        {log.length === 0 ? <div className="muted">Complete tasks and habits to earn XP.</div> : (
          <div className="history">
            {log.slice(0, 30).map((e) => (
              <div key={e.id} className="history-row">
                <span className="ellipsis">{e.label}</span>
                <span className="muted small">{timeAgo(e.at)}</span>
                <span className={e.xp >= 0 ? 'accent' : 'danger'}>{e.xp ? `${e.xp > 0 ? '+' : ''}${e.xp} XP` : ''}{e.gold ? ` ${e.gold > 0 ? '+' : ''}${e.gold}g` : ''}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export { dayKey }
