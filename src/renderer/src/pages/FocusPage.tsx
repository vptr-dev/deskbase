import { create } from 'zustand'
import { act, emit, getData, toast, useData } from '../store'
import { api } from '../lib/api'
import { DAYS_SHORT, addDays, dayKey, formatMinutes, parseDay, today, uid } from '../lib/util'
import { BarChart, Button, Ring, Segmented, Stat } from '../components/ui'
import { Icon } from '../components/Icon'
import { playChime } from '../lib/sound'
import { type NoiseKind, setNoise, setNoiseVolume } from '../lib/noise'

type Mode = 'focus' | 'break' | 'long' | 'stopwatch'
interface FocusState { mode: Mode; running: boolean; endsAt: number; remaining: number; total: number; label: string; taskId: string | null; cycle: number; startedAt: number; pinned: boolean; noise: NoiseKind; volume: number; now: number }

const minutesFor = (m: Mode): number => {
  const s = getData().settings
  return m === 'stopwatch' ? 0 : m === 'focus' ? s.focusMinutes : m === 'break' ? s.breakMinutes : s.longBreakMinutes
}

export const useFocus = create<FocusState>(() => ({ mode: 'focus', running: false, endsAt: 0, remaining: 25 * 60, total: 25 * 60, label: '', taskId: null, cycle: 0, startedAt: 0, pinned: false, noise: 'off', volume: 0.4, now: 0 }))

export const focusActions = {
  start(): void {
    const s = useFocus.getState()
    // Stopwatch: endsAt holds the virtual start time and `remaining` the elapsed seconds while paused.
    const endsAt = s.mode === 'stopwatch' ? Date.now() - s.remaining * 1000 : Date.now() + s.remaining * 1000
    useFocus.setState({ running: true, endsAt, startedAt: s.startedAt || Date.now() })
  },
  pause(): void {
    const s = useFocus.getState()
    useFocus.setState({ running: false, remaining: remainingSecs(s) })
  },
  reset(mode?: Mode): void {
    const m = mode ?? useFocus.getState().mode
    const secs = minutesFor(m) * 60
    useFocus.setState({ mode: m, running: false, remaining: secs, total: secs, startedAt: 0 })
  },
  finish(early = false): void {
    const s = useFocus.getState()
    const watch = s.mode === 'stopwatch'
    const elapsed = Math.round((watch ? remainingSecs(s) : s.total - remainingSecs(s)) / 60)
    if ((s.mode === 'focus' || watch) && elapsed >= 1) {
      act((d) => {
        const id = uid()
        d.focus.unshift({ id, start: s.startedAt || Date.now() - elapsed * 60000, minutes: elapsed, label: s.label, taskId: s.taskId, kind: 'focus' })
        emit(d, { on: 'focus', src: 'focus:' + id, label: `Focus ${elapsed}m${s.label ? ' · ' + s.label : ''}`, minutes: elapsed })
      })
    }
    const st = getData().settings
    if (watch) {
      focusActions.reset('stopwatch')
      if (elapsed >= 1) toast(`Logged ${formatMinutes(elapsed)} of focus`, { icon: 'timer' })
      return
    }
    if (!early) {
      if (st.sounds) playChime()
      if (st.notifications) api.notify(s.mode === 'focus' ? 'Focus session complete' : 'Break is over', s.mode === 'focus' ? 'Time for a break.' : 'Ready to focus again?')
    }
    const cycle = s.mode === 'focus' ? s.cycle + 1 : s.cycle
    const next: Mode = s.mode === 'focus' ? (cycle % Math.max(1, st.longBreakEvery) === 0 ? 'long' : 'break') : 'focus'
    useFocus.setState({ cycle })
    focusActions.reset(next)
    if (!early) toast(next === 'focus' ? 'Break over' : 'Session complete. Take a break.', { icon: next === 'focus' ? 'target' : 'coffee' })
  },
  tick(): void {
    const s = useFocus.getState()
    if (s.running) useFocus.setState({ now: Date.now() })
    if (s.running && s.mode !== 'stopwatch' && Date.now() >= s.endsAt) focusActions.finish()
  }
}

/** Seconds left (timer) or seconds elapsed (stopwatch). */
export function remainingSecs(s: FocusState): number {
  if (!s.running) return s.remaining
  return s.mode === 'stopwatch' ? Math.max(0, Math.round((Date.now() - s.endsAt) / 1000)) : Math.max(0, Math.round((s.endsAt - Date.now()) / 1000))
}

export const fmtClock = (secs: number): string => {
  const mm = `${String(Math.floor((secs % 3600) / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`
  return secs >= 3600 ? `${Math.floor(secs / 3600)}:${mm}` : `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`
}

export function FocusPage(): JSX.Element {
  const s = useFocus()
  const sessions = useData((d) => d.focus)
  const tasks = useData((d) => Object.values(d.tasks).filter((t) => !t.done))
  const settings = useData((d) => d.settings)
  const secs = remainingSecs(s)
  const watch = s.mode === 'stopwatch'
  const t = today()
  const todayMin = sessions.filter((f) => f.kind === 'focus' && dayKey(new Date(f.start)) === t).reduce((a, f) => a + f.minutes, 0)
  const weekMin = sessions.filter((f) => f.kind === 'focus' && dayKey(new Date(f.start)) > addDays(t, -7)).reduce((a, f) => a + f.minutes, 0)
  const chart = Array.from({ length: 7 }, (_, i) => {
    const k = addDays(t, i - 6)
    return { label: DAYS_SHORT[parseDay(k).getDay()][0], value: sessions.filter((f) => f.kind === 'focus' && dayKey(new Date(f.start)) === k).reduce((a, f) => a + f.minutes, 0) }
  })
  const setMin = (key: 'focusMinutes' | 'breakMinutes' | 'longBreakMinutes', v: number): void => {
    act((d) => { d.settings[key] = Math.max(1, Math.min(180, v)) }, { history: false })
    if (!s.running) setTimeout(() => focusActions.reset(), 0)
  }

  return (
    <div className="focus-page">
      <div className="focus-main glass">
        <Segmented value={s.mode} onChange={(m) => !s.running && focusActions.reset(m)} options={[{ value: 'focus', label: 'Focus' }, { value: 'break', label: 'Short break' }, { value: 'long', label: 'Long break' }, { value: 'stopwatch', label: 'Stopwatch' }]} />
        <Ring value={watch ? (secs % 3600) / 3600 : s.total ? 1 - secs / s.total : 0} size={240} stroke={10} color={s.mode === 'focus' || watch ? 'var(--accent)' : '#30d158'}>
          <div className="center">
            <div className="clock">{fmtClock(secs)}</div>
            <div className="muted small">{watch ? 'Stopwatch' : `Session ${s.cycle + 1}`}</div>
          </div>
        </Ring>
        <input id="focus-label" className="input focus-label" placeholder="What are you working on?" value={s.label} onChange={(e) => useFocus.setState({ label: e.target.value })} />
        <select id="focus-task" className="input input-sm" value={s.taskId ?? ''} onChange={(e) => {
          const task = tasks.find((x) => x.id === e.target.value)
          useFocus.setState({ taskId: e.target.value || null, label: task ? task.title : s.label })
        }}>
          <option value="">Link a task (optional)</option>
          {tasks.slice(0, 200).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
        </select>
        <div className="row gap-sm">
          {s.running ? <Button kind="primary" icon="pause" onClick={focusActions.pause}>Pause</Button> : <Button kind="primary" icon="play" onClick={focusActions.start}>{(watch ? secs > 0 : secs < s.total) ? 'Resume' : 'Start'}</Button>}
          <Button icon="skip" onClick={() => focusActions.finish(true)} title={watch ? 'Stop and log' : 'Finish now'}>{watch ? 'Log' : 'Finish'}</Button>
          <Button kind="ghost" icon="restore" onClick={() => focusActions.reset()} title="Reset" />
          <Button kind="ghost" icon="pin" title="Keep window on top" onClick={async () => { const on = !s.pinned; await api.alwaysOnTop(on); useFocus.setState({ pinned: on }) }} className={s.pinned ? 'active' : ''} />
        </div>
        <div className="row gap-sm wrap ambient">
          <span className="muted small">Ambient</span>
          <Segmented small value={s.noise} onChange={(n) => { useFocus.setState({ noise: n }); setNoise(n, s.volume) }} options={[{ value: 'off', label: 'Off' }, { value: 'white', label: 'White' }, { value: 'pink', label: 'Pink' }, { value: 'brown', label: 'Brown' }]} />
          {s.noise !== 'off' && <input id="noise-vol" type="range" min={0} max={1} step={0.05} value={s.volume} aria-label="Volume" onChange={(e) => { const v = Number(e.target.value); useFocus.setState({ volume: v }); setNoiseVolume(v) }} />}
        </div>
        {!watch && <div className="focus-settings">
          <label>Focus <input id="fm" type="number" className="input input-sm w-60" value={settings.focusMinutes} onChange={(e) => setMin('focusMinutes', Number(e.target.value))} /> min</label>
          <label>Break <input id="bm" type="number" className="input input-sm w-60" value={settings.breakMinutes} onChange={(e) => setMin('breakMinutes', Number(e.target.value))} /> min</label>
          <label>Long <input id="lm" type="number" className="input input-sm w-60" value={settings.longBreakMinutes} onChange={(e) => setMin('longBreakMinutes', Number(e.target.value))} /> min</label>
        </div>}
      </div>
      <div className="focus-side">
        <div className="stat-row">
          <Stat label="Today" value={formatMinutes(todayMin)} />
          <Stat label="This week" value={formatMinutes(weekMin)} />
          <Stat label="Sessions" value={sessions.filter((f) => f.kind === 'focus').length} />
        </div>
        <section className="panel glass">
          <div className="panel-head"><h3>Last 7 days</h3></div>
          <BarChart data={chart} height={120} format={formatMinutes} />
        </section>
        <section className="panel glass">
          <div className="panel-head"><h3>History</h3></div>
          <div className="history">
            {sessions.filter((f) => f.kind === 'focus').slice(0, 15).map((f) => (
              <div key={f.id} className="history-row"><span className="ellipsis">{f.label || 'Focus'}</span><span className="muted small">{new Date(f.start).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span><span>{f.minutes}m</span></div>
            ))}
            {sessions.length === 0 && <div className="muted small">Finished sessions appear here.</div>}
          </div>
        </section>
      </div>
    </div>
  )
}

export function FocusMini(): JSX.Element | null {
  const s = useFocus()
  if (!s.running && s.remaining === s.total) return null
  return (
    <button className="focus-mini no-drag" onClick={() => (s.running ? focusActions.pause() : focusActions.start())} title={s.running ? 'Pause' : 'Resume'}>
      <Icon name={s.running ? 'pause' : 'play'} size={12} />
      <span>{fmtClock(remainingSecs(s))}</span>
    </button>
  )
}
