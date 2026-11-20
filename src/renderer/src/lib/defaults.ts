import type { AppData, AssistantChat, AssistantMessage, AssistantPreset, AssistantSettings, Block, Connection, DbSchema, Desktop, Look, Page, PageType, Settings, WidgetStyle } from '../types'
import { emojiToIcon } from '../../../shared/emoji-icons'
import { uid } from './util'

/** Matches CURRENT_SCHEMA in src/main/migrations.ts (saving stamps that value anyway). */
export const SCHEMA = 16

export const PAGE_TYPES: { type: PageType; name: string; icon: string; desc: string }[] = [
  { type: 'doc', name: 'Page', icon: 'file-text', desc: 'Notes and documents' },
  { type: 'database', name: 'Database', icon: 'database', desc: 'Table, board, gallery, calendar' },
  { type: 'dashboard', name: 'Dashboard', icon: 'layout-dashboard', desc: 'Panels you arrange on a grid' },
  { type: 'tasks', name: 'To-do list', icon: 'square-check-big', desc: 'Tasks with dates and reminders' },
  { type: 'board', name: 'Board', icon: 'square-kanban', desc: 'Kanban columns' },
  { type: 'calendar', name: 'Calendar', icon: 'calendar', desc: 'Month, week and agenda' },
  { type: 'habits', name: 'Habits', icon: 'repeat', desc: 'Daily habits and streaks' },
  { type: 'journal', name: 'Journal', icon: 'notebook-pen', desc: 'Daily entries and mood' },
  { type: 'goals', name: 'Goals', icon: 'target', desc: 'Goals and milestones' },
  { type: 'tracker', name: 'Tracker', icon: 'chart-line', desc: 'Weight, sleep, water, anything' },
  { type: 'focus', name: 'Focus', icon: 'timer', desc: 'Pomodoro timer' },
  { type: 'today', name: 'Today', icon: 'sun', desc: 'Your day at a glance' },
  { type: 'review', name: 'Weekly review', icon: 'calendar-days', desc: 'Your week at a glance' }
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

/** How a cover paints: one of the built-in gradients, or a picture from the web or this computer. */
export function coverStyle(c: string | null | undefined): React.CSSProperties | null {
  if (!c) return null
  if (COVERS.includes(c)) return { background: `var(--cover-${c})` }
  if (/^(https?:|data:image\/)/.test(c)) return { backgroundImage: `url("${c.replace(/"/g, '%22')}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
  return null
}

/** Backdrops behind the glass; colors live in styles.css as --backdrop-<id>. 'mica' = the Windows material only. */
export const BACKDROPS: { id: string; name: string }[] = [
  { id: 'mica', name: 'Desktop' },
  { id: 'sky', name: 'Sky' },
  { id: 'peach', name: 'Peach' },
  { id: 'lilac', name: 'Lilac' },
  { id: 'mint', name: 'Mint' },
  { id: 'ocean', name: 'Ocean' },
  { id: 'sunset', name: 'Sunset' },
  { id: 'rose', name: 'Rose' },
  { id: 'forest', name: 'Forest' },
  { id: 'aurora', name: 'Aurora' },
  { id: 'midnight', name: 'Midnight' },
  { id: 'graphite', name: 'Graphite' },
  { id: 'paper', name: 'Paper' },
  { id: 'custom', name: 'Gradient' },
  { id: 'image', name: 'Picture' }
]

export const DEFAULT_LOOK: Look = {
  preset: 'glass',
  surface: 'glass',
  panelSurface: 'same',
  border: 60,
  borderWidth: 1,
  radius: 16,
  blur: 28,
  shine: 70,
  shadow: 45,
  saturation: 160,
  fontFamily: '',
  headingFamily: '',
  headingWeight: 650,
  lineHeight: 1.5,
  letterSpacing: 0,
  motion: 'normal',
  pageTransition: 'rise',
  sidebar: 'floating',
  iconStroke: 1.75,
  backdropImage: null,
  backdropBlur: 0,
  backdropDim: 0,
  gradient: { a: '#7ab8ff', b: '#c9b6ff', c: '#ffd1dc', angle: 135 },
  customCss: '',
  textTone: 'auto',
  textLight: '#2b2d33',
  textDark: '#f2f3f8',
  textSoft: 35
}

export const DEFAULT_WIDGET_STYLE: WidgetStyle = {
  material: 'auto',
  tint: '',
  opacity: 50,
  radius: 18,
  text: '',
  accent: '',
  font: '',
  scale: 100,
  padding: 14,
  border: 60,
  borderWidth: 1,
  borderColor: '',
  titleStyle: 'caps',
  shadow: false,
  header: true,
  align: 'start',
  theme: 'auto',
  blur: 28
}

export const MAIN_SPACE = { id: 'main', name: 'Main', icon: 'monitor' }
export const DEFAULT_DESKTOP: Desktop = { enabled: true, spaces: [MAIN_SPACE], active: 'main', style: { ...DEFAULT_WIDGET_STYLE }, widgets: [], snap: true, grid: 8 }

export const COLORS = ['#0a84ff', '#5e5ce6', '#bf5af2', '#ff375f', '#ff453a', '#ff9f0a', '#e5b000', '#30d158', '#00c7be', '#40c8e0', '#8e8e93', '#a2845e']

/** New data follows the system clock: 24-hour unless the locale writes 12-hour times. */
function localUses24h(): boolean {
  try {
    const hc = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle
    return hc === 'h23' || hc === 'h24'
  } catch {
    return false
  }
}

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
  use24h: localUses24h(),
  place: null,
  fahrenheit: false,
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
  look: { ...DEFAULT_LOOK },
  notionSync: true,
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
    settings: { ...DEFAULT_SETTINGS },
    recent: [],
    tags: {},
    assistant: { chats: [], active: null, settings: { ...DEFAULT_AI_SETTINGS, presets: DEFAULT_PRESETS.map((p) => ({ ...p })) } },
    countdowns: [],
    values: {},
    rules: [],
    desktop: { ...DEFAULT_DESKTOP, spaces: [{ ...MAIN_SPACE }], style: { ...DEFAULT_WIDGET_STYLE }, widgets: [] },
    connections: []
  }
}

const obj = (x: any): Record<string, any> => (x && typeof x === 'object' && !Array.isArray(x) ? x : {})

/** Fill in anything missing so older or hand-edited files always load. */
/** Keeps blocks well formed: an id and a text string each; columns hold lists of blocks. */
function normBlocks(list: any[]): Block[] {
  return list.filter((b) => b && typeof b === 'object').map((b) => {
    const out: Block = { ...b, id: typeof b.id === 'string' && b.id ? b.id : uid(), type: typeof b.type === 'string' ? b.type : 'p', text: typeof b.text === 'string' ? b.text : '' }
    if (out.type === 'columns' || out.type === 'tabs') {
      const min = out.type === 'columns' ? 2 : 1
      const cols = Array.isArray(b.cols) ? b.cols.filter(Array.isArray).map((c: any[]) => normBlocks(c)) : []
      while (cols.length < min) cols.push([])
      const filled: Block[][] = cols.map((c: Block[]) => (c.length ? c : [{ id: uid(), type: 'p', text: '' }]))
      out.cols = filled
      if (out.type === 'tabs') out.labels = filled.map((_, i) => (Array.isArray(b.labels) && typeof b.labels[i] === 'string' ? b.labels[i] : ''))
      if (out.type === 'columns') {
        const w = Array.isArray(b.widths) && b.widths.length === filled.length && b.widths.every((x: any) => Number(x) > 0) ? b.widths.map(Number) : undefined
        if (w) out.widths = w
        else delete out.widths
      }
    }
    return out
  })
}

export const DEFAULT_PRESETS: AssistantPreset[] = [
  { id: 'planner', name: 'Planner', icon: 'calendar-check', instructions: 'Act as a calm planning coach. Turn plans into dated tasks with realistic times, keep days light, and point out what can wait.' },
  { id: 'writer', name: 'Writer', icon: 'pen-line', instructions: 'Act as an editor. Keep the user\'s voice, make writing clearer and shorter, and show changed text in full.' },
  { id: 'study', name: 'Study coach', icon: 'graduation-cap', instructions: 'Act as a study coach. Explain simply, quiz the user with short questions, and plan revision in small sessions.' },
  { id: 'brainstorm', name: 'Brainstorm', icon: 'lightbulb', instructions: 'Give many varied ideas quickly as a list, then say which three look best and why.' }
]
export const DEFAULT_AI_SETTINGS: AssistantSettings = { instructions: '', access: 'ask', temperature: null, length: 'normal', effort: 'medium', presets: [] }

const CONN_KINDS = ['notion', 'calendar', 'rss', 'github', 'mail', 'todoist']
function normalizeConnections(raw: any): Connection[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((c) => c && typeof c === 'object' && typeof c.id === 'string' && CONN_KINDS.includes(c.kind)).map((c) => ({
    id: c.id, kind: c.kind, name: typeof c.name === 'string' ? c.name : '', url: typeof c.url === 'string' ? c.url : '',
    color: typeof c.color === 'string' ? c.color : '#0a84ff', repos: Array.isArray(c.repos) ? c.repos.filter((r: any) => typeof r === 'string') : [],
    createdAt: Number(c.createdAt) || Date.now(), ...(c.off ? { off: true } : {}),
    ...(c.account && typeof c.account === 'object' ? { account: { preset: String(c.account.preset ?? 'other'), host: String(c.account.host ?? ''), port: Number(c.account.port) || 993, user: String(c.account.user ?? '') } } : {})
  }))
}

function normalizeAssistant(raw: any): AppData['assistant'] {
  const r = obj(raw)
  const msg = (m: any): AssistantMessage | null => (m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant') ? { id: String(m.id ?? uid()), role: m.role, content: m.content, at: Number(m.at) || Date.now(), ...(Array.isArray(m.applied) ? { applied: m.applied } : {}), ...(m.tool ? { tool: true } : {}) } : null)
  let chats: AssistantChat[] = Array.isArray(r.chats) ? r.chats.filter((c: any) => c && c.id).map((c: any) => ({
    id: String(c.id), title: typeof c.title === 'string' ? c.title : 'Chat', pinned: Boolean(c.pinned), createdAt: Number(c.createdAt) || Date.now(), updatedAt: Number(c.updatedAt) || Date.now(),
    messages: (Array.isArray(c.messages) ? c.messages : []).map(msg).filter(Boolean), provider: c.provider ?? null, model: c.model ?? null, preset: c.preset ?? null
  })) : []
  // Data saved before chats existed had one list of messages.
  if (!Array.isArray(r.chats) && Array.isArray(r.messages) && r.messages.length) {
    const messages = r.messages.map(msg).filter(Boolean) as AssistantMessage[]
    const first = messages.find((m) => m.role === 'user')
    chats = [{ id: uid(), title: first ? first.content.slice(0, 48) : 'Chat', createdAt: messages[0]?.at ?? Date.now(), updatedAt: messages[messages.length - 1]?.at ?? Date.now(), messages }]
  }
  const st = obj(r.settings)
  const presets = Array.isArray(st.presets) ? st.presets.filter((p: any) => p && p.id && typeof p.name === 'string').map((p: any) => ({ id: String(p.id), name: p.name, icon: typeof p.icon === 'string' ? p.icon : 'sparkle', instructions: typeof p.instructions === 'string' ? p.instructions : '' })) : DEFAULT_PRESETS.map((p) => ({ ...p }))
  const settings: AssistantSettings = {
    instructions: typeof st.instructions === 'string' ? st.instructions.slice(0, 8000) : '',
    access: ['none', 'read', 'ask', 'auto'].includes(st.access) ? st.access : 'ask',
    temperature: typeof st.temperature === 'number' ? Math.max(0, Math.min(1.5, st.temperature)) : null,
    length: st.length === 'short' || st.length === 'long' ? st.length : 'normal',
    effort: st.effort === 'low' || st.effort === 'high' ? st.effort : 'medium',
    presets
  }
  const active = typeof r.active === 'string' && chats.some((c) => c.id === r.active) ? r.active : chats[0]?.id ?? null
  return { chats, active, settings }
}

export function normalize(raw: any): AppData {
  if (!raw || typeof raw !== 'object' || !raw.pages) return freshData()
  const base = freshData()
  const d: AppData = {
    ...base,
    ...raw,
    pages: obj(raw.pages),
    rootOrder: Array.isArray(raw.rootOrder) ? raw.rootOrder : Object.keys(raw.pages ?? {}),
    settings: normalizeSettings(raw.settings),
    focus: Array.isArray(raw.focus) ? raw.focus : [],
    recent: Array.isArray(raw.recent) ? raw.recent : [],
    tags: obj(raw.tags),
    assistant: normalizeAssistant(raw.assistant),
    countdowns: Array.isArray(raw.countdowns) ? raw.countdowns.filter((c: any) => c && typeof c === 'object' && c.id).map((c: any) => ({ title: '', date: '', color: '#0a84ff', ...c, icon: emojiToIcon(c.icon, 'calendar') })) : [],
    values: obj(raw.values),
    rules: Array.isArray(raw.rules) ? raw.rules.filter((r: any) => r && typeof r === 'object' && r.id && r.valueId) : [],
    desktop: normalizeDesktop(raw.desktop),
    connections: normalizeConnections(raw.connections)
  }
  for (const k of ['tasks', 'habits', 'journal', 'goals', 'metrics'] as const) {
    ;(d as any)[k] = obj(raw[k])
  }
  for (const p of Object.values(d.pages)) {
    p.icon = p.icon ? emojiToIcon(p.icon, typeInfo(p.type).icon) : ''
    p.children = Array.isArray(p.children) ? [...new Set(p.children.filter((c: unknown) => typeof c === 'string'))] : []
    p.blocks = Array.isArray(p.blocks) ? normBlocks(p.blocks) : []
    if (!p.blocks.length) p.blocks = [{ id: uid(), type: 'p', text: '' }]
    p.view = p.view ?? {}
    if (p.type === 'database') {
      const db = obj(p.db)
      p.db = { props: Array.isArray(db.props) ? db.props.filter((x: any) => x && x.id) : [], views: Array.isArray(db.views) ? db.views.filter((x: any) => x && x.id) : [] }
      for (const pr of p.db.props) if (['select', 'multi', 'status'].includes(pr.type)) pr.options = Array.isArray(pr.options) ? pr.options : []
      for (const pr of p.db.props) {
        if (pr.type === 'formula') pr.formula = typeof pr.formula === 'string' ? pr.formula : ''
        if (pr.type === 'rollup') pr.rollup = pr.rollup && typeof pr.rollup === 'object' && pr.rollup.rel ? pr.rollup : null
      }
      if (!p.db.views.length) p.db.views.push({ id: uid(), name: 'Table', type: 'table', filters: [], hidden: [] })
    }
    if (p.type === 'dashboard') p.widgets = Array.isArray(p.widgets) ? p.widgets.filter((w) => w && w.id && w.type).map((w) => ({ ...w, config: obj(w.config), style: normalizeStyle(w.style, true) })) : []
    if (p.source && (p.source.kind !== 'notion' || typeof p.source.id !== 'string')) p.source = null
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
    h.icon = emojiToIcon(h.icon, 'circle-check')
  }
  for (const g of Object.values(d.goals)) g.icon = emojiToIcon(g.icon, 'target')
  for (const m of Object.values(d.metrics)) m.icon = emojiToIcon(m.icon, 'activity')
  delete (d as any).profile
  for (const v of Object.values(d.values)) {
    v.log = Array.isArray(v.log) ? v.log : []
    v.base = Number(v.base) || 0
    v.decimals = Math.max(0, Math.min(4, Number(v.decimals) || 0))
    v.reset = ['day', 'week', 'month'].includes(v.reset) ? v.reset : 'never'
    v.unit = v.unit ?? ''
    v.icon = emojiToIcon(v.icon, 'gem')
    v.color = v.color ?? '#0a84ff'
  }
  d.rules = d.rules.filter((r) => d.values[r.valueId])
  relinkReplaced(d)
  return d
}

/**
 * A page imported again used to arrive as a new copy while the old one went to the trash, leaving
 * panels and dashboard cards pointing at the trashed copy. They now follow the live copy.
 */
export function relinkReplaced(d: AppData): void {
  const live = new Map<string, string>()
  for (const p of Object.values(d.pages)) {
    if (p.deletedAt || !p.source?.id) continue
    const had = live.get(p.source.id)
    if (!had || d.pages[had].createdAt < p.createdAt) live.set(p.source.id, p.id)
  }
  if (!live.size) return
  const follow = (id: unknown): string | undefined => {
    if (typeof id !== 'string') return undefined
    const p = d.pages[id]
    if (p && !p.deletedAt) return undefined
    const to = p?.source?.id ? live.get(p.source.id) : undefined
    return to && to !== id ? to : undefined
  }
  const fix = (cfg: Record<string, any> | undefined): void => {
    if (!cfg) return
    for (const k of ['pageId', 'dbId', 'page']) { const to = follow(cfg[k]); if (to) cfg[k] = to }
  }
  for (const w of d.desktop?.widgets ?? []) fix(w.config)
  for (const p of Object.values(d.pages)) for (const w of p.widgets ?? []) fix(w.config)
}

const num = (v: any, lo: number, hi: number, dflt: number): number => {
  const n = Number(v)
  return v !== null && v !== '' && Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt
}
const color = (v: any, dflt: string): string => (typeof v === 'string' && /^(#[0-9a-fA-F]{3,8})?$/.test(v) ? v : dflt)

const SURFACES = ['glass', 'blur', 'frosted', 'solid']
export function normalizeLook(raw: any): Look {
  const l = { ...DEFAULT_LOOK, ...obj(raw) }
  const g = obj(raw?.gradient)
  const D = DEFAULT_LOOK
  return {
    preset: typeof l.preset === 'string' ? l.preset : D.preset,
    surface: SURFACES.includes(l.surface) ? l.surface : D.surface,
    panelSurface: l.panelSurface === 'same' || SURFACES.includes(l.panelSurface) ? l.panelSurface : 'same',
    border: num(l.border, 0, 100, D.border),
    borderWidth: num(l.borderWidth, 0, 3, D.borderWidth),
    radius: num(l.radius, 0, 32, D.radius),
    blur: num(l.blur, 0, 80, D.blur),
    shine: num(l.shine, 0, 100, D.shine),
    shadow: num(l.shadow, 0, 100, D.shadow),
    saturation: num(l.saturation, 100, 220, D.saturation),
    fontFamily: typeof l.fontFamily === 'string' ? l.fontFamily.slice(0, 80) : '',
    headingFamily: typeof l.headingFamily === 'string' ? l.headingFamily.slice(0, 80) : '',
    headingWeight: num(l.headingWeight, 400, 900, D.headingWeight),
    lineHeight: num(l.lineHeight, 1.2, 2, D.lineHeight),
    letterSpacing: num(l.letterSpacing, -4, 8, 0),
    motion: ['off', 'subtle', 'normal', 'lively'].includes(l.motion) ? l.motion : D.motion,
    pageTransition: ['fade', 'slide', 'rise', 'none'].includes(l.pageTransition) ? l.pageTransition : D.pageTransition,
    sidebar: l.sidebar === 'attached' ? 'attached' : 'floating',
    iconStroke: num(l.iconStroke, 1, 2.75, D.iconStroke),
    backdropImage: typeof l.backdropImage === 'string' && l.backdropImage.startsWith('data:image/') ? l.backdropImage : null,
    backdropBlur: num(l.backdropBlur, 0, 60, 0),
    backdropDim: num(l.backdropDim, -60, 60, 0),
    gradient: { a: color(g.a, D.gradient.a) || D.gradient.a, b: color(g.b, D.gradient.b) || D.gradient.b, c: color(g.c, D.gradient.c) || D.gradient.c, angle: num(g.angle, 0, 360, 135) },
    customCss: typeof l.customCss === 'string' ? l.customCss.slice(0, 50000) : '',
    textTone: ['auto', 'soft', 'ink', 'warm', 'cool', 'custom'].includes(l.textTone) ? l.textTone : 'auto',
    textLight: color(l.textLight, D.textLight) || D.textLight,
    textDark: color(l.textDark, D.textDark) || D.textDark,
    textSoft: num(l.textSoft, 0, 100, D.textSoft)
  }
}

function normalizeSettings(raw: any): Settings {
  const s = { ...DEFAULT_SETTINGS, ...obj(raw) } as Settings & { widget?: unknown }
  delete s.widget
  s.look = normalizeLook(raw?.look)
  s.notionSync = s.notionSync !== false
  const pl = raw?.place
  s.place = pl && typeof pl === 'object' && Number.isFinite(pl.lat) && Number.isFinite(pl.lon) ? { name: String(pl.name ?? '').slice(0, 80), lat: Number(pl.lat), lon: Number(pl.lon) } : null
  s.fahrenheit = s.fahrenheit === true
  s.backdrop = BACKDROPS.some((b) => b.id === s.backdrop) ? s.backdrop : 'sky'
  return s
}

const MATERIALS = ['auto', 'glass', 'blur', 'acrylic', 'tint', 'clear']

/** Cleans a widget style. With `partial`, only keys that are present are kept (overrides). */
export function normalizeStyle(raw: any, partial: true): Partial<WidgetStyle>
export function normalizeStyle(raw: any, partial?: false): WidgetStyle
export function normalizeStyle(raw: any, partial = false): Partial<WidgetStyle> | WidgetStyle {
  const r = obj(raw)
  const d = DEFAULT_WIDGET_STYLE
  const out: Partial<WidgetStyle> = {}
  const has = (k: string): boolean => !partial || r[k] !== undefined
  if (has('material')) out.material = MATERIALS.includes(r.material) ? r.material : d.material
  if (has('tint')) out.tint = color(r.tint, '')
  if (has('opacity')) out.opacity = num(r.opacity, 0, 100, d.opacity)
  if (has('radius')) out.radius = num(r.radius, 0, 40, d.radius)
  if (has('text')) out.text = color(r.text, '')
  if (has('accent')) out.accent = color(r.accent, '')
  if (has('font')) out.font = typeof r.font === 'string' ? r.font.slice(0, 80) : ''
  if (has('scale')) out.scale = num(r.scale, 60, 200, 100)
  if (has('padding')) out.padding = num(r.padding, 0, 40, d.padding)
  if (has('border')) out.border = num(r.border, 0, 100, d.border)
  if (has('borderWidth')) out.borderWidth = num(r.borderWidth, 0, 4, d.borderWidth)
  if (has('borderColor')) out.borderColor = color(r.borderColor, '')
  if (has('titleStyle')) out.titleStyle = r.titleStyle === 'plain' || r.titleStyle === 'large' ? r.titleStyle : 'caps'
  if (has('shadow')) out.shadow = r.shadow === undefined ? d.shadow : Boolean(r.shadow)
  if (has('header')) out.header = r.header === undefined ? d.header : Boolean(r.header)
  if (has('align')) out.align = r.align === 'center' ? 'center' : 'start'
  if (has('theme')) out.theme = r.theme === 'light' || r.theme === 'dark' ? r.theme : 'auto'
  if (has('blur')) out.blur = num(r.blur, 0, 80, d.blur)
  return out
}

function normalizeDesktop(raw: any): Desktop {
  const r = obj(raw)
  const spaces = (Array.isArray(r.spaces) ? r.spaces : [])
    .filter((s: any) => s && typeof s.id === 'string' && s.id)
    .map((s: any) => ({ id: s.id, name: typeof s.name === 'string' && s.name.trim() ? s.name : 'Workspace', icon: typeof s.icon === 'string' && s.icon ? emojiToIcon(s.icon, 'monitor') : 'monitor' }))
  if (!spaces.length) spaces.push({ ...MAIN_SPACE })
  const active = spaces.some((s: any) => s.id === r.active) ? r.active : spaces[0].id
  const known = new Set(spaces.map((s: any) => s.id))
  return {
    enabled: r.enabled !== false,
    spaces,
    active,
    snap: r.snap !== false,
    grid: num(r.grid, 1, 64, 8),
    style: normalizeStyle(r.style),
    widgets: (Array.isArray(r.widgets) ? r.widgets : [])
      .filter((w: any) => w && typeof w === 'object' && w.id && w.type)
      .map((w: any) => ({
        id: String(w.id),
        type: w.type,
        ...(typeof w.title === 'string' ? { title: w.title } : {}),
        config: obj(w.config),
        x: num(w.x, -100000, 100000, 0),
        y: num(w.y, -100000, 100000, 0),
        // Panels are always a set size now (no full-screen panels).
        w: Number(w.w) > 0 ? num(w.w, 120, 20000, 300) : 900,
        h: Number(w.h) > 0 ? num(w.h, 64, 20000, 200) : 600,
        style: normalizeStyle(w.style, true),
        layer: 'desktop',
        locked: Boolean(w.locked),
        group: typeof w.group === 'string' && w.group ? w.group : null,
        hidden: Boolean(w.hidden),
        space: known.has(w.space) ? w.space : active,
        createdAt: Number(w.createdAt) || Date.now()
      }))
  }
}
