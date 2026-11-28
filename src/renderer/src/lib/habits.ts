import { occurrence } from './recurrence'
import type { Habit } from '../types'
import { addDays, dayKey, today, weekStartOf } from './util'

// ---------- habits ----------
/** Week start used for weekly habits; kept in sync with settings by the app shell. */
export const habitWeek = { start: 1 as 0 | 1 }
export const isWeekly = (h: Habit): boolean => h.kind === 'good' && h.period === 'week'
/** Count needed on a single day for the day to count as done. */
export const habitDayTarget = (h: Habit): number => (isWeekly(h) ? 1 : Math.max(1, h.target))
export const habitWeekKey = (k: string): string => weekStartOf(k, habitWeek.start)
export const habitPaused = (h: Habit, day: string): boolean =>
  !!h.pauses?.some(p=>day>=p.from && day<=p.until)

function weeklyTarget(h:Habit, day:string):number {
  const start=habitWeekKey(day)
  return Math.min(Math.max(1,h.target),Array.from({length:7},(_,i)=>addDays(start,i)).filter(d=>!habitPaused(h,d)).length)
}

export function habitWeekCount(h: Habit, k: string): number {
  const s = habitWeekKey(k)
  let n = 0
  for (let i = 0; i < 7; i++) if (!habitPaused(h,addDays(s,i)) && (h.log[addDays(s, i)] ?? 0) > 0) n++
  return n
}
export const habitWeekMet = (h: Habit, k: string): boolean => habitWeekCount(h, k) >= weeklyTarget(h,k)
/** Should this habit show up as something to do today? */
export function habitDueToday(h: Habit, k: string): boolean {
  if (habitPaused(h,k)) return false
  if (h.kind === 'bad') return true
  if (isWeekly(h)) return !habitWeekMet(h, k) || (h.log[k] ?? 0) > 0
  return habitScheduled(h, k)
}
const isFrozen = (h: Habit, k: string): boolean => !!h.frozen?.includes(k)

export function habitScheduled(h: Habit, k: string): boolean {
  if(habitPaused(h,k))return false
  if (isWeekly(h)) return true
  if (h.schedule && h.kind === 'good') return k >= h.schedule.start && occurrence(h.schedule, k) === k
  if (!h.days?.length || h.days.length === 7) return true
  const d = new Date(k + 'T00:00:00').getDay()
  return h.days.includes(d)
}

export function habitDoneOn(h: Habit, k: string): boolean {
  const c = h.log[k] ?? 0
  return h.kind === 'good' ? c >= habitDayTarget(h) : c === 0
}

function weeklyStreak(h: Habit): number {
  const created = habitWeekKey(h.restartOn || dayKey(new Date(h.createdAt)))
  let w = habitWeekKey(today())
  if (!habitWeekMet(h, w)) w = addDays(w, -7)
  let s = 0
  for (let i = 0; i < 520 && (w >= created || (!h.restartOn && habitWeekMet(h,w))); i++) {
    if (!habitWeekMet(h, w)) break
    if(weeklyTarget(h,w)>0)s++
    w = addDays(w, -7)
  }
  return s
}

/** Most recent missed scheduled day in the last week that a streak freeze could cover. */
export function freezableDay(h: Habit): string | null {
  if (h.kind !== 'good' || isWeekly(h)) return null
  const created = h.restartOn || dayKey(new Date(h.createdAt))
  let k = addDays(today(), -1)
  for (let i = 0; i < 7 && k >= created; i++) {
    if (habitScheduled(h, k) && !isFrozen(h, k) && !habitDoneOn(h, k)) return k
    k = addDays(k, -1)
  }
  return null
}

export function habitNeedsCatchUp(h:Habit, day:string):boolean {
  if(h.kind!=='good' || habitPaused(h,day))return false
  if(!isWeekly(h))return !!freezableDay(h)
  const previous=addDays(habitWeekKey(day),-7)
  const first=habitWeekKey(h.restartOn || dayKey(new Date(h.createdAt)))
  return previous>=first && !habitWeekMet(h,previous)
}

/** Current streak (good: consecutive scheduled days met; bad: days since last slip). */
export function habitStreak(h: Habit): number {
  const t = today()
  if (h.kind === 'bad') {
    const first = h.restartOn || dayKey(new Date(h.createdAt))
    const last = Object.keys(h.log).filter(k=>k>=first && k<=t && !habitPaused(h,k) && h.log[k]>0).sort().at(-1)
    let k=last?addDays(last,1):first
    let days=0
    for(let i=0;i<36500 && k<=t;i++,k=addDays(k,1))if(!habitPaused(h,k))days++
    return days
  }
  if (isWeekly(h)) return weeklyStreak(h)
  let streak = 0
  let k = t
  // Today not done yet doesn't break the streak.
  if (!habitDoneOn(h, k)) k = addDays(k, -1)
  for (let i = 0; i < 3650 && (!h.schedule || k >= h.schedule.start) && (!h.restartOn || k>=h.restartOn); i++) {
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
      if(!weeklyTarget(h,w)){w=addDays(w,7);continue}
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
      if (weeklyTarget(h,w)>0 && (i > 0 || met)) { total++; if (met) done++ }
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
