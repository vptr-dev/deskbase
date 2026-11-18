import type { AppData, Quest, QuestKind } from '../types'
import { dayKey, today, uid } from './util'
import { habitDayTarget, habitDueToday } from './game'

const isToday = (ts?: number | null): boolean => !!ts && dayKey(new Date(ts)) === today()
const hasPage = (d: AppData, type: string): boolean => Object.values(d.pages).some((p) => p.type === type && !p.deletedAt)
const tasksDoneToday = (d: AppData): AppData['tasks'][string][] => Object.values(d.tasks).filter((t) => t.done && isToday(t.doneAt))
const liveHabits = (d: AppData): AppData['habits'][string][] => Object.values(d.habits).filter((h) => !h.archived && h.kind === 'good' && d.pages[h.pageId] && !d.pages[h.pageId].deletedAt)
const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)]

interface QuestDef {
  kind: QuestKind
  icon: string
  make: (d: AppData) => { title: string; target: number } | null
  progress: (d: AppData) => number
  xp: number
  gold: number
}

export const QUEST_DEFS: QuestDef[] = [
  {
    kind: 'tasks', icon: '✅', xp: 20, gold: 5,
    make: (d) => {
      const open = Object.values(d.tasks).filter((t) => !t.done).length
      const n = open >= 5 ? pick([3, 5]) : Math.max(1, Math.min(3, open || 1))
      return { title: `Complete ${n} task${n === 1 ? '' : 's'}`, target: n }
    },
    progress: (d) => tasksDoneToday(d).length
  },
  {
    kind: 'habits', icon: '🔁', xp: 20, gold: 5,
    make: (d) => {
      const n = liveHabits(d).filter((h) => habitDueToday(h, today())).length
      if (n < 1) return null
      const target = Math.min(3, n)
      return { title: `Check off ${target} habit${target === 1 ? '' : 's'}`, target }
    },
    progress: (d) => liveHabits(d).filter((h) => (h.log[today()] ?? 0) >= habitDayTarget(h)).length
  },
  {
    kind: 'focus', icon: '⏱️', xp: 25, gold: 6,
    make: (d) => {
      if (!hasPage(d, 'focus')) return null
      const m = pick([25, 50])
      return { title: `Focus for ${m} minutes`, target: m }
    },
    progress: (d) => Math.round(d.focus.filter((f) => f.kind === 'focus' && isToday(f.start)).reduce((a, f) => a + f.minutes, 0))
  },
  {
    kind: 'journal', icon: '📓', xp: 15, gold: 4,
    make: (d) => (hasPage(d, 'journal') ? { title: 'Write in your journal', target: 1 } : null),
    progress: (d) => (Object.values(d.journal).some((j) => j.date === today() && j.text.trim().length > 0) ? 1 : 0)
  },
  {
    kind: 'early', icon: '🌅', xp: 20, gold: 5,
    make: () => (new Date().getHours() < 10 ? { title: 'Finish a task before noon', target: 1 } : null),
    progress: (d) => (tasksDoneToday(d).some((t) => new Date(t.doneAt!).getHours() < 12) ? 1 : 0)
  },
  {
    kind: 'priority', icon: '🚩', xp: 25, gold: 6,
    make: (d) => (Object.values(d.tasks).some((t) => !t.done && t.priority >= 2) ? { title: 'Complete a high-priority task', target: 1 } : null),
    progress: (d) => (tasksDoneToday(d).some((t) => t.priority >= 2) ? 1 : 0)
  },
  {
    kind: 'tracker', icon: '📈', xp: 10, gold: 3,
    make: (d) => (Object.keys(d.metrics).length ? { title: 'Log a tracker entry', target: 1 } : null),
    progress: (d) => (Object.values(d.metrics).some((m) => m.entries.some((e) => e.date === today())) ? 1 : 0)
  },
  {
    kind: 'game', icon: '🎮', xp: 15, gold: 4,
    make: (d) => (Object.values(d.games).some((g) => g.status === 'playing') ? { title: 'Log a gaming session', target: 1 } : null),
    progress: (d) => (Object.values(d.games).some((g) => g.sessions.some((s) => s.date === today())) ? 1 : 0)
  },
  {
    kind: 'xp', icon: '✦', xp: 15, gold: 5,
    make: (d) => ({ title: `Earn ${d.settings.dailyXpGoal} XP today`, target: d.settings.dailyXpGoal }),
    progress: (d) => d.xpLog.filter((e) => isToday(e.at) && !e.source.startsWith('quest')).reduce((a, e) => a + Math.max(0, e.xp), 0)
  }
]

export const questDef = (k: QuestKind): QuestDef => QUEST_DEFS.find((q) => q.kind === k) ?? QUEST_DEFS[0]
export const questProgress = (d: AppData, q: Quest): number => Math.min(q.target, questDef(q.kind).progress(d))

/** Three random quests for today, favouring the parts of the app that are in use. */
export function generateQuests(d: AppData): Quest[] {
  const pool = QUEST_DEFS.map((def) => ({ def, made: def.make(d) })).filter((x) => x.made)
  const out: Quest[] = []
  while (out.length < 3 && pool.length) {
    const i = Math.floor(Math.random() * pool.length)
    const { def, made } = pool.splice(i, 1)[0]
    out.push({ id: uid(), kind: def.kind, title: made!.title, target: made!.target, xp: def.xp, gold: def.gold, claimed: false })
  }
  return out
}
