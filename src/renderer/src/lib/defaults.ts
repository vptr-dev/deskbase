import type { AppData, DbSchema, Page, PageType, Settings } from '../types'
import { uid } from './util'

export const SCHEMA = 5

export const PAGE_TYPES: { type: PageType; name: string; icon: string; desc: string }[] = [
  { type: 'doc', name: 'Page', icon: '📄', desc: 'Notes and documents' },
  { type: 'database', name: 'Database', icon: '🗃️', desc: 'Table, board, gallery, calendar' },
  { type: 'dashboard', name: 'Dashboard', icon: '📊', desc: 'Widgets you arrange yourself' },
  { type: 'tasks', name: 'To-do list', icon: '☑️', desc: 'Tasks with dates and reminders' },
  { type: 'board', name: 'Board', icon: '🗂️', desc: 'Kanban columns' },
  { type: 'calendar', name: 'Calendar', icon: '📅', desc: 'Month, week and agenda' },
  { type: 'habits', name: 'Habits', icon: '🔁', desc: 'Daily habits and streaks' },
  { type: 'journal', name: 'Journal', icon: '📓', desc: 'Daily entries and mood' },
  { type: 'goals', name: 'Goals', icon: '🎯', desc: 'Goals and milestones' },
  { type: 'tracker', name: 'Tracker', icon: '📈', desc: 'Weight, sleep, water, anything' },
  { type: 'focus', name: 'Focus', icon: '⏱️', desc: 'Pomodoro timer' },
  { type: 'today', name: 'Today', icon: '☀️', desc: 'Your day at a glance' },
  { type: 'review', name: 'Weekly review', icon: '🗓️', desc: 'Your week at a glance' }
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

/** Page cover gradients; the colors live in styles.css as --cover-<id>. */
export const COVERS = ['dawn', 'ocean', 'forest', 'sunset', 'aurora', 'dusk', 'peach', 'slate', 'mint', 'berry', 'sand', 'night']

/** Backdrops behind the glass; colors live in styles.css as --backdrop-<id>. 'mica' = the Windows material only. */
export const BACKDROPS: { id: string; name: string }[] = [
  { id: 'mica', name: 'Desktop' },
  { id: 'sky', name: 'Sky' },
  { id: 'peach', name: 'Peach' },
  { id: 'lilac', name: 'Lilac' },
  { id: 'mint', name: 'Mint' },
  { id: 'aurora', name: 'Aurora' },
  { id: 'midnight', name: 'Midnight' }
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
  notifications: true,
  showCompleted: true,
  confirmDelete: true,
  reduceMotion: false,
  spellcheck: true,
  glassStrength: 55,
  backdrop: 'sky',
  widget: { enabled: false, displayId: null, pageId: null, opacity: 100 },
  closeToTray: false,
  quickAddHotkey: true
}

export function newDatabase(): DbSchema {
  return {
    props: [
      { id: uid(), name: 'Status', type: 'status', options: [
        { id: uid(), name: 'Not started', color: '#8e8e93' },
        { id: uid(), name: 'In progress', color: '#0a84ff' },
        { id: uid(), name: 'Done', color: '#30d158' }
      ] },
      { id: uid(), name: 'Tags', type: 'multi', options: [] },
      { id: uid(), name: 'Date', type: 'date' }
    ],
    views: [{ id: uid(), name: 'Table', type: 'table', filters: [], hidden: [] }]
  }
}

export function newPage(type: PageType, title?: string, parentId: string | null = null): Page {
  const info = typeInfo(type)
  const now = Date.now()
  const page: Page = {
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
  if (type === 'database') page.db = newDatabase()
  if (type === 'dashboard') page.widgets = []
  return page
}

/** A brand new workspace is empty: no pages until you make them. */
export function freshData(): AppData {
  return {
    schema: SCHEMA,
    pages: {},
    rootOrder: [],
    tasks: {},
    habits: {},
    journal: {},
    goals: {},
    metrics: {},
    focus: [],
    profile: { name: '', avatar: '' },
    settings: { ...DEFAULT_SETTINGS },
    recent: [],
    tags: {},
    assistant: { messages: [] },
    countdowns: [],
    values: {},
    rules: []
  }
}

const obj = (x: any): Record<string, any> => (x && typeof x === 'object' && !Array.isArray(x) ? x : {})

/** Fill in anything missing so older or hand-edited files always load. */
export function normalize(raw: any): AppData {
  if (!raw || typeof raw !== 'object' || !raw.pages) return freshData()
  const base = freshData()
  const d: AppData = {
    ...base,
    ...raw,
    pages: obj(raw.pages),
    rootOrder: Array.isArray(raw.rootOrder) ? raw.rootOrder : Object.keys(raw.pages ?? {}),
    profile: { name: typeof raw.profile?.name === 'string' ? raw.profile.name : '', avatar: typeof raw.profile?.avatar === 'string' ? raw.profile.avatar : '' },
    settings: { ...DEFAULT_SETTINGS, ...obj(raw.settings), widget: { ...DEFAULT_SETTINGS.widget, ...obj(raw.settings?.widget) } },
    focus: Array.isArray(raw.focus) ? raw.focus : [],
    recent: Array.isArray(raw.recent) ? raw.recent : [],
    tags: obj(raw.tags),
    assistant: { messages: Array.isArray(raw.assistant?.messages) ? raw.assistant.messages : [] },
    countdowns: Array.isArray(raw.countdowns) ? raw.countdowns.filter((c: any) => c && typeof c === 'object' && c.id).map((c: any) => ({ title: '', date: '', icon: '📅', color: '#0a84ff', ...c })) : [],
    values: obj(raw.values),
    rules: Array.isArray(raw.rules) ? raw.rules.filter((r: any) => r && typeof r === 'object' && r.id && r.valueId) : []
  }
  for (const k of ['tasks', 'habits', 'journal', 'goals', 'metrics'] as const) {
    ;(d as any)[k] = obj(raw[k])
  }
  for (const p of Object.values(d.pages)) {
    p.children = Array.isArray(p.children) ? p.children : []
    p.blocks = p.blocks?.length ? p.blocks : [{ id: uid(), type: 'p', text: '' }]
    p.view = p.view ?? {}
    if (p.type === 'database') {
      const db = obj(p.db)
      p.db = { props: Array.isArray(db.props) ? db.props.filter((x: any) => x && x.id) : [], views: Array.isArray(db.views) ? db.views.filter((x: any) => x && x.id) : [] }
      for (const pr of p.db.props) if (['select', 'multi', 'status'].includes(pr.type)) pr.options = Array.isArray(pr.options) ? pr.options : []
      if (!p.db.views.length) p.db.views.push({ id: uid(), name: 'Table', type: 'table', filters: [], hidden: [] })
    }
    if (p.type === 'dashboard') p.widgets = Array.isArray(p.widgets) ? p.widgets.filter((w) => w && w.id && w.type).map((w) => ({ ...w, config: obj(w.config) })) : []
    if (p.rowOf) p.props = obj(p.props)
  }
  // Rows whose database is gone become normal pages again.
  for (const p of Object.values(d.pages)) {
    if (p.rowOf && d.pages[p.rowOf]?.type !== 'database') { p.rowOf = null; p.parentId = null }
  }
  // Repair the tree: drop missing ids and rows, re-attach orphans at the root.
  const inTree = (id: string): boolean => Boolean(d.pages[id]) && !d.pages[id].rowOf
  d.rootOrder = [...new Set(d.rootOrder.filter(inTree))]
  for (const p of Object.values(d.pages)) {
    p.children = p.children.filter(inTree)
    if (p.rowOf) continue
    if (p.parentId && !inTree(p.parentId)) p.parentId = null
    if (!p.parentId && !d.rootOrder.includes(p.id)) d.rootOrder.push(p.id)
  }
  for (const t of Object.values(d.tasks)) {
    t.tags = t.tags ?? []
    t.subtasks = t.subtasks ?? []
    t.repeat = t.repeat ?? 'none'
    t.status = t.status ?? (t.done ? 'done' : 'todo')
    t.difficulty = t.difficulty ?? 'easy'
    t.priority = t.priority ?? 0
    t.goalId = t.goalId && d.goals[t.goalId] ? t.goalId : null
  }
  for (const h of Object.values(d.habits)) {
    h.log = h.log ?? {}
    h.days = h.days ?? [0, 1, 2, 3, 4, 5, 6]
    h.period = h.period === 'week' ? 'week' : 'day'
    h.dayNotes = h.dayNotes ?? {}
    h.frozen = Array.isArray(h.frozen) ? h.frozen : []
  }
  for (const v of Object.values(d.values)) {
    v.log = Array.isArray(v.log) ? v.log : []
    v.base = Number(v.base) || 0
    v.decimals = Math.max(0, Math.min(4, Number(v.decimals) || 0))
    v.reset = ['day', 'week', 'month'].includes(v.reset) ? v.reset : 'never'
    v.unit = v.unit ?? ''
    v.icon = v.icon ?? '◆'
    v.color = v.color ?? '#0a84ff'
  }
  d.rules = d.rules.filter((r) => d.values[r.valueId])
  return d
}
