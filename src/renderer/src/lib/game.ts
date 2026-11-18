import type { AppData, Difficulty, Habit, StatKey } from '../types'
import { addDays, dayKey, today, weekStartOf } from './util'

export const DIFFICULTY: Record<Difficulty, { label: string; xp: number; gold: number }> = {
  trivial: { label: 'Trivial', xp: 5, gold: 1 },
  easy: { label: 'Easy', xp: 10, gold: 2 },
  medium: { label: 'Medium', xp: 25, gold: 5 },
  hard: { label: 'Hard', xp: 50, gold: 10 },
  epic: { label: 'Epic', xp: 100, gold: 25 }
}

export const STAT_KEYS: StatKey[] = ['str', 'int', 'wis', 'cha', 'vit', 'cre']

export const DEFAULT_STATS: Record<StatKey, { name: string; icon: string; xp: number }> = {
  str: { name: 'Strength', icon: '💪', xp: 0 },
  int: { name: 'Intelligence', icon: '🧠', xp: 0 },
  wis: { name: 'Wisdom', icon: '🦉', xp: 0 },
  cha: { name: 'Charisma', icon: '✨', xp: 0 },
  vit: { name: 'Vitality', icon: '❤️', xp: 0 },
  cre: { name: 'Creativity', icon: '🎨', xp: 0 }
}

/** Total XP needed to reach `level` (level 1 = 0 XP). */
export function xpForLevel(level: number): number {
  let total = 0
  for (let l = 1; l < level; l++) total += Math.round(80 * Math.pow(l, 1.35))
  return total
}

export function levelInfo(xp: number): { level: number; into: number; need: number; pct: number } {
  let level = 1
  while (xpForLevel(level + 1) <= xp) level++
  const base = xpForLevel(level)
  const need = xpForLevel(level + 1) - base
  const into = xp - base
  return { level, into, need, pct: need ? into / need : 0 }
}

/** Stat levels use a flatter curve. */
export function statLevel(xp: number): { level: number; pct: number } {
  const per = 60
  let level = 1
  let left = xp
  while (left >= per * level) {
    left -= per * level
    level++
  }
  return { level, pct: left / (per * level) }
}

const TITLES: [number, string][] = [
  [1, 'Novice'], [3, 'Apprentice'], [5, 'Adventurer'], [8, 'Journeyman'], [12, 'Veteran'],
  [16, 'Expert'], [20, 'Master'], [25, 'Champion'], [30, 'Hero'], [40, 'Legend'], [50, 'Mythic']
]
export function rankTitle(level: number): string {
  let t = TITLES[0][1]
  for (const [l, name] of TITLES) if (level >= l) t = name
  return t
}

// ---------- habits ----------
/** Week start used for weekly habits; kept in sync with settings by the app shell. */
export const habitWeek = { start: 1 as 0 | 1 }
export const isWeekly = (h: Habit): boolean => h.kind === 'good' && h.period === 'week'
/** Count needed on a single day for the day to count as done. */
export const habitDayTarget = (h: Habit): number => (isWeekly(h) ? 1 : Math.max(1, h.target))
export const habitWeekKey = (k: string): string => weekStartOf(k, habitWeek.start)
export function habitWeekCount(h: Habit, k: string): number {
  const s = habitWeekKey(k)
  let n = 0
  for (let i = 0; i < 7; i++) if ((h.log[addDays(s, i)] ?? 0) > 0) n++
  return n
}
export const habitWeekMet = (h: Habit, k: string): boolean => habitWeekCount(h, k) >= Math.max(1, h.target)
/** Should this habit show up as something to do today? */
export function habitDueToday(h: Habit, k: string): boolean {
  if (h.kind === 'bad') return true
  if (isWeekly(h)) return !habitWeekMet(h, k) || (h.log[k] ?? 0) > 0
  return habitScheduled(h, k)
}
const isFrozen = (h: Habit, k: string): boolean => !!h.frozen?.includes(k)

export function habitScheduled(h: Habit, k: string): boolean {
  if (isWeekly(h)) return true
  if (!h.days?.length || h.days.length === 7) return true
  const d = new Date(k + 'T00:00:00').getDay()
  return h.days.includes(d)
}

export function habitDoneOn(h: Habit, k: string): boolean {
  const c = h.log[k] ?? 0
  return h.kind === 'good' ? c >= habitDayTarget(h) : c === 0
}

function weeklyStreak(h: Habit): number {
  const created = habitWeekKey(dayKey(new Date(h.createdAt)))
  let w = habitWeekKey(today())
  if (!habitWeekMet(h, w)) w = addDays(w, -7)
  let s = 0
  for (let i = 0; i < 520 && (w >= created || habitWeekMet(h, w)); i++) {
    if (!habitWeekMet(h, w)) break
    s++
    w = addDays(w, -7)
  }
  return s
}

/** Most recent missed scheduled day in the last week that a streak freeze could cover. */
export function freezableDay(h: Habit): string | null {
  if (h.kind !== 'good' || isWeekly(h)) return null
  const created = dayKey(new Date(h.createdAt))
  let k = addDays(today(), -1)
  for (let i = 0; i < 7 && k >= created; i++) {
    if (habitScheduled(h, k) && !isFrozen(h, k) && !habitDoneOn(h, k)) return k
    k = addDays(k, -1)
  }
  return null
}

/** Current streak (good: consecutive scheduled days met; bad: days since last slip). */
export function habitStreak(h: Habit): number {
  const t = today()
  if (h.kind === 'bad') {
    const slips = Object.keys(h.log).filter((k) => (h.log[k] ?? 0) > 0).sort()
    const last = slips[slips.length - 1]
    const start = last ?? dayKey(new Date(h.createdAt))
    const days = Math.round((new Date(t).getTime() - new Date(start).getTime()) / 86400000)
    return Math.max(0, last ? days : days + 1)
  }
  if (isWeekly(h)) return weeklyStreak(h)
  let streak = 0
  let k = t
  // Today not done yet doesn't break the streak.
  if (!habitDoneOn(h, k)) k = addDays(k, -1)
  for (let i = 0; i < 3650; i++) {
    if (!habitScheduled(h, k) || isFrozen(h, k)) { k = addDays(k, -1); continue }
    if (habitDoneOn(h, k)) { streak++; k = addDays(k, -1) } else break
  }
  return streak
}

export function habitBestStreak(h: Habit): number {
  if (h.kind === 'bad') return habitStreak(h)
  const keys = Object.keys(h.log).sort()
  if (!keys.length) return 0
  let best = 0
  let cur = 0
  const end = today()
  if (isWeekly(h)) {
    let w = habitWeekKey(keys[0])
    for (let i = 0; i < 520 && w <= end; i++) {
      if (habitWeekMet(h, w)) { cur++; best = Math.max(best, cur) } else if (w !== habitWeekKey(end)) cur = 0
      w = addDays(w, 7)
    }
    return best
  }
  let k = keys[0]
  for (let i = 0; i < 3650 && k <= end; i++) {
    if (habitScheduled(h, k) && !isFrozen(h, k)) {
      if (habitDoneOn(h, k)) { cur++; best = Math.max(best, cur) } else if (k !== end) cur = 0
    }
    k = addDays(k, 1)
  }
  return best
}

export function habitRate(h: Habit, days = 30): number {
  let done = 0
  let total = 0
  let k = today()
  const created = dayKey(new Date(h.createdAt))
  if (isWeekly(h)) {
    let w = habitWeekKey(k)
    const cw = habitWeekKey(created)
    for (let i = 0; i < Math.ceil(days / 7) && w >= cw; i++) {
      const met = habitWeekMet(h, w)
      if (i > 0 || met) { total++; if (met) done++ }
      w = addDays(w, -7)
    }
    return total ? done / total : 0
  }
  for (let i = 0; i < days && k >= created; i++) {
    if (habitScheduled(h, k)) {
      total++
      if (habitDoneOn(h, k)) done++
    }
    k = addDays(k, -1)
  }
  return total ? done / total : 0
}

// ---------- achievements ----------
export interface AchievementDef { id: string; name: string; desc: string; icon: string; test: (d: AppData) => boolean }

const doneTasks = (d: AppData): number => Object.values(d.tasks).filter((t) => t.done).length
const maxStreak = (d: AppData): number => Math.max(0, ...Object.values(d.habits).map((h) => habitStreak(h) * (isWeekly(h) ? 7 : 1)))
const lvl = (d: AppData): number => levelInfo(d.profile.xp).level
const focusMin = (d: AppData): number => d.focus.filter((f) => f.kind === 'focus').reduce((a, f) => a + f.minutes, 0)

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-task', name: 'First Step', desc: 'Complete your first task', icon: '👣', test: (d) => doneTasks(d) >= 1 },
  { id: 'tasks-10', name: 'Getting Things Done', desc: 'Complete 10 tasks', icon: '✅', test: (d) => doneTasks(d) >= 10 },
  { id: 'tasks-50', name: 'Workhorse', desc: 'Complete 50 tasks', icon: '🐎', test: (d) => doneTasks(d) >= 50 },
  { id: 'tasks-100', name: 'Centurion', desc: 'Complete 100 tasks', icon: '🛡️', test: (d) => doneTasks(d) >= 100 },
  { id: 'tasks-500', name: 'Unstoppable', desc: 'Complete 500 tasks', icon: '🚀', test: (d) => doneTasks(d) >= 500 },
  { id: 'epic-task', name: 'Dragon Slayer', desc: 'Complete an epic task', icon: '🐉', test: (d) => Object.values(d.tasks).some((t) => t.done && t.difficulty === 'epic') },
  { id: 'streak-3', name: 'Warming Up', desc: 'Reach a 3-day habit streak', icon: '🔥', test: (d) => maxStreak(d) >= 3 },
  { id: 'streak-7', name: 'One Week Strong', desc: 'Reach a 7-day habit streak', icon: '📅', test: (d) => maxStreak(d) >= 7 },
  { id: 'streak-30', name: 'Iron Will', desc: 'Reach a 30-day habit streak', icon: '⛓️', test: (d) => maxStreak(d) >= 30 },
  { id: 'streak-100', name: 'Habit Master', desc: 'Reach a 100-day habit streak', icon: '🏔️', test: (d) => maxStreak(d) >= 100 },
  { id: 'level-5', name: 'Rising Star', desc: 'Reach level 5', icon: '⭐', test: (d) => lvl(d) >= 5 },
  { id: 'level-10', name: 'Seasoned', desc: 'Reach level 10', icon: '🌟', test: (d) => lvl(d) >= 10 },
  { id: 'level-25', name: 'Elite', desc: 'Reach level 25', icon: '💫', test: (d) => lvl(d) >= 25 },
  { id: 'level-50', name: 'Living Legend', desc: 'Reach level 50', icon: '👑', test: (d) => lvl(d) >= 50 },
  { id: 'journal-1', name: 'Dear Diary', desc: 'Write a journal entry', icon: '📓', test: (d) => Object.keys(d.journal).length >= 1 },
  { id: 'journal-30', name: 'Chronicler', desc: 'Write 30 journal entries', icon: '📚', test: (d) => Object.keys(d.journal).length >= 30 },
  { id: 'focus-1', name: 'In the Zone', desc: 'Finish a focus session', icon: '🎯', test: (d) => d.focus.some((f) => f.kind === 'focus') },
  { id: 'focus-600', name: 'Deep Worker', desc: 'Focus for 10 hours total', icon: '⏳', test: (d) => focusMin(d) >= 600 },
  { id: 'focus-3000', name: 'Monk Mode', desc: 'Focus for 50 hours total', icon: '🧘', test: (d) => focusMin(d) >= 3000 },
  { id: 'goal-1', name: 'Goal Getter', desc: 'Complete a goal', icon: '🏆', test: (d) => Object.values(d.goals).some((g) => g.done) },
  { id: 'goal-5', name: 'Visionary', desc: 'Complete 5 goals', icon: '🔭', test: (d) => Object.values(d.goals).filter((g) => g.done).length >= 5 },
  { id: 'reward-1', name: 'Treat Yourself', desc: 'Buy a reward', icon: '🎁', test: (d) => Object.values(d.rewards).some((r) => r.purchases.length > 0) },
  { id: 'gold-500', name: 'Treasure Hoard', desc: 'Hold 500 gold', icon: '💰', test: (d) => d.profile.gold >= 500 },
  { id: 'game-done', name: 'Credits Rolled', desc: 'Finish a game', icon: '🎮', test: (d) => Object.values(d.games).some((g) => g.status === 'completed') },
  { id: 'game-10', name: 'Collector', desc: 'Finish 10 games', icon: '🕹️', test: (d) => Object.values(d.games).filter((g) => g.status === 'completed').length >= 10 },
  { id: 'game-100', name: 'Completionist', desc: 'Get 100% in a game', icon: '💯', test: (d) => Object.values(d.games).some((g) => g.completion >= 100) },
  { id: 'pages-10', name: 'Architect', desc: 'Create 10 pages', icon: '🏗️', test: (d) => Object.values(d.pages).filter((p) => !p.deletedAt).length >= 10 },
  { id: 'tracker-30', name: 'Data Driven', desc: 'Log 30 tracker entries', icon: '📈', test: (d) => Object.values(d.metrics).reduce((a, m) => a + m.entries.length, 0) >= 30 },
  { id: 'stat-5', name: 'Specialist', desc: 'Raise any stat to level 5', icon: '🎖️', test: (d) => Object.values(d.profile.stats).some((s) => s.xp >= 600) },
  { id: 'all-stats', name: 'Well Rounded', desc: 'Earn XP in every stat', icon: '🌈', test: (d) => Object.values(d.profile.stats).every((s) => s.xp > 0) },
  { id: 'early-bird', name: 'Early Bird', desc: 'Complete a task before 7 AM', icon: '🌅', test: (d) => Object.values(d.tasks).some((t) => t.done && t.doneAt && new Date(t.doneAt).getHours() < 7) },
  { id: 'night-owl', name: 'Night Owl', desc: 'Complete a task after midnight', icon: '🌙', test: (d) => Object.values(d.tasks).some((t) => t.done && t.doneAt && new Date(t.doneAt).getHours() < 4) },
  { id: 'quest-1', name: 'Quest Taker', desc: 'Claim a daily quest', icon: '📜', test: (d) => d.xpLog.some((e) => e.source === 'quest') },
  { id: 'quest-clear', name: 'Full Clear', desc: 'Finish all daily quests in a day', icon: '🗝️', test: (d) => d.xpLog.some((e) => e.source === 'quest-bonus') },
  { id: 'quest-25', name: 'Errand Runner', desc: 'Claim 25 daily quests', icon: '🧭', test: (d) => d.xpLog.filter((e) => e.source === 'quest').length >= 25 },
  { id: 'loot-1', name: 'Lucky Find', desc: 'Get a loot drop', icon: '🍀', test: (d) => d.xpLog.some((e) => e.source === 'loot') },
  { id: 'freeze-1', name: 'Ice Cold', desc: 'Save a streak with a freeze', icon: '❄️', test: (d) => Object.values(d.habits).some((h) => (h.frozen?.length ?? 0) > 0) },
  { id: 'weekly-4', name: 'Steady Rhythm', desc: 'Hit a weekly habit target 4 weeks in a row', icon: '🥁', test: (d) => Object.values(d.habits).some((h) => isWeekly(h) && habitStreak(h) >= 4) },
  { id: 'big-day', name: 'Big Day', desc: 'Earn 300 XP in a single day', icon: '⚡', test: (d) => {
    const by: Record<string, number> = {}
    for (const e of d.xpLog) { const k = dayKey(new Date(e.at)); by[k] = (by[k] ?? 0) + e.xp }
    return Object.values(by).some((v) => v >= 300)
  } }
]

export function xpToday(d: AppData): number {
  const t = today()
  return d.xpLog.filter((e) => dayKey(new Date(e.at)) === t).reduce((a, e) => a + e.xp, 0)
}

export function xpByDay(d: AppData): Record<string, number> {
  const by: Record<string, number> = {}
  for (const e of d.xpLog) {
    const k = dayKey(new Date(e.at))
    by[k] = (by[k] ?? 0) + Math.max(0, e.xp)
  }
  return by
}
