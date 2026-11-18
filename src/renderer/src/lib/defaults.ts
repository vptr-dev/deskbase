import type { AppData, Page, PageType, Settings } from '../types'
import { DEFAULT_STATS } from './game'
import { uid } from './util'

export const SCHEMA = 3

export const PAGE_TYPES: { type: PageType; name: string; icon: string; desc: string }[] = [
  { type: 'doc', name: 'Page', icon: '📄', desc: 'Notes and documents' },
  { type: 'tasks', name: 'To-do list', icon: '☑️', desc: 'Tasks and quests' },
  { type: 'board', name: 'Board', icon: '🗂️', desc: 'Kanban columns' },
  { type: 'today', name: 'Today', icon: '☀️', desc: 'Your day at a glance' },
  { type: 'calendar', name: 'Calendar', icon: '📅', desc: 'Month and week view' },
  { type: 'habits', name: 'Habits', icon: '🔁', desc: 'Daily habits and streaks' },
  { type: 'journal', name: 'Journal', icon: '📓', desc: 'Daily entries and mood' },
  { type: 'goals', name: 'Goals', icon: '🎯', desc: 'Goals and milestones' },
  { type: 'character', name: 'Character', icon: '🧙', desc: 'Level, stats, achievements' },
  { type: 'rewards', name: 'Rewards', icon: '🎁', desc: 'Spend the gold you earn' },
  { type: 'focus', name: 'Focus', icon: '⏱️', desc: 'Pomodoro timer' },
  { type: 'games', name: 'Game library', icon: '🎮', desc: 'Track the games you play' },
  { type: 'tracker', name: 'Tracker', icon: '📈', desc: 'Weight, sleep, water, anything' }
]

export const typeInfo = (t: PageType): (typeof PAGE_TYPES)[number] =>
  PAGE_TYPES.find((p) => p.type === t) ?? PAGE_TYPES[0]

export const ACCENTS: { name: string; value: string }[] = [
  { name: 'Blue', value: '#0a84ff' },
  { name: 'Indigo', value: '#5e5ce6' },
  { name: 'Purple', value: '#bf5af2' },
  { name: 'Pink', value: '#ff375f' },
  { name: 'Red', value: '#ff453a' },
  { name: 'Orange', value: '#ff9f0a' },
  { name: 'Yellow', value: '#e5b000' },
  { name: 'Green', value: '#30d158' },
  { name: 'Mint', value: '#00c7be' },
  { name: 'Teal', value: '#40c8e0' },
  { name: 'Graphite', value: '#8e8e93' }
]

export const COLORS = ['#0a84ff', '#5e5ce6', '#bf5af2', '#ff375f', '#ff453a', '#ff9f0a', '#e5b000', '#30d158', '#00c7be', '#40c8e0', '#8e8e93', '#a2845e']

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  accent: '#0a84ff',
  material: 'mica',
  fontSize: 14,
  density: 'comfortable',
  font: 'system',
  sidebarWidth: 248,
  sidebarCollapsed: false,
  weekStart: 1,
  use24h: false,
  startPage: 'last',
  lastPage: null,
  focusMinutes: 25,
  breakMinutes: 5,
  longBreakMinutes: 15,
  longBreakEvery: 4,
  autoUpdate: true,
  sounds: true,
  gamification: true,
  notifications: true,
  xpMultiplier: 1,
  showCompleted: true,
  confirmDelete: true,
  reduceMotion: false,
  spellcheck: true,
  glassStrength: 60,
  dailyXpGoal: 100
}

export function newPage(type: PageType, title?: string, parentId: string | null = null): Page {
  const info = typeInfo(type)
  const now = Date.now()
  return {
    id: uid(),
    title: title ?? (type === 'doc' ? '' : info.name),
    icon: type === 'doc' ? '' : info.icon,
    type,
    parentId,
    children: [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    blocks: [{ id: uid(), type: 'p', text: '' }],
    expanded: true,
    view: {}
  }
}

export function freshData(): AppData {
  const pages: Page[] = [
    newPage('today', 'Today'),
    newPage('tasks', 'To-do'),
    newPage('habits', 'Habits'),
    newPage('journal', 'Journal'),
    newPage('goals', 'Goals'),
    newPage('character', 'Character'),
    newPage('games', 'Games'),
    newPage('calendar', 'Calendar')
  ]
  const notes = newPage('doc', 'Notes')
  notes.icon = '📝'
  pages.push(notes)
  const map: Record<string, Page> = {}
  for (const p of pages) map[p.id] = p
  return {
    schema: SCHEMA,
    pages: map,
    rootOrder: pages.map((p) => p.id),
    tasks: {},
    habits: {},
    journal: {},
    goals: {},
    rewards: {},
    games: {},
    metrics: {},
    focus: [],
    xpLog: [],
    profile: {
      name: 'Player',
      avatar: '🧙',
      title: '',
      xp: 0,
      gold: 0,
      stats: structuredClone(DEFAULT_STATS),
      achievements: {}
    },
    settings: { ...DEFAULT_SETTINGS, lastPage: pages[0].id },
    recent: [],
    tags: {},
    assistant: { messages: [] }
  }
}

/** Fill in anything missing so older or hand-edited files always load. */
export function normalize(raw: any): AppData {
  if (!raw || typeof raw !== 'object' || !raw.pages) return freshData()
  const base = freshData()
  const d: AppData = {
    ...base,
    ...raw,
    pages: raw.pages ?? {},
    rootOrder: Array.isArray(raw.rootOrder) ? raw.rootOrder : Object.keys(raw.pages ?? {}),
    profile: {
      ...base.profile,
      ...(raw.profile ?? {}),
      stats: { ...base.profile.stats, ...(raw.profile?.stats ?? {}) },
      achievements: raw.profile?.achievements ?? {}
    },
    settings: { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) },
    focus: raw.focus ?? [],
    xpLog: raw.xpLog ?? [],
    recent: raw.recent ?? [],
    tags: raw.tags ?? {},
    assistant: { messages: Array.isArray(raw.assistant?.messages) ? raw.assistant.messages : [] }
  }
  for (const k of ['tasks', 'habits', 'journal', 'goals', 'rewards', 'games', 'metrics'] as const) {
    ;(d as any)[k] = raw[k] ?? {}
  }
  for (const p of Object.values(d.pages)) {
    p.children = p.children ?? []
    p.blocks = p.blocks?.length ? p.blocks : [{ id: uid(), type: 'p', text: '' }]
    p.view = p.view ?? {}
  }
  // Repair the tree: drop missing ids, re-attach orphans at the root.
  const exists = (id: string): boolean => Boolean(d.pages[id])
  d.rootOrder = d.rootOrder.filter(exists)
  for (const p of Object.values(d.pages)) {
    p.children = p.children.filter(exists)
    if (p.parentId && !exists(p.parentId)) p.parentId = null
    if (!p.parentId && !d.rootOrder.includes(p.id)) d.rootOrder.push(p.id)
  }
  for (const t of Object.values(d.tasks)) {
    t.tags = t.tags ?? []
    t.subtasks = t.subtasks ?? []
    t.repeat = t.repeat ?? 'none'
    t.status = t.status ?? (t.done ? 'done' : 'todo')
    t.difficulty = t.difficulty ?? 'easy'
    t.priority = t.priority ?? 0
  }
  for (const h of Object.values(d.habits)) {
    h.log = h.log ?? {}
    h.days = h.days ?? [0, 1, 2, 3, 4, 5, 6]
  }
  for (const g of Object.values(d.games)) {
    g.sessions = g.sessions ?? []
    g.goals = g.goals ?? []
    g.price = g.price ?? ''
    g.releaseDate = g.releaseDate ?? null
  }
  return d
}
