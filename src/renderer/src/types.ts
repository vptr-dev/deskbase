export type PageType =
  | 'doc'
  | 'today'
  | 'tasks'
  | 'board'
  | 'calendar'
  | 'habits'
  | 'journal'
  | 'goals'
  | 'focus'
  | 'tracker'
  | 'review'
  | 'database'
  | 'dashboard'

export type BlockType =
  | 'p'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'todo'
  | 'bullet'
  | 'number'
  | 'quote'
  | 'callout'
  | 'code'
  | 'toggle'
  | 'divider'
  | 'table'

export interface Block {
  id: string
  type: BlockType
  text: string
  checked?: boolean
  open?: boolean
  body?: string
  color?: string
  indent?: number
  rows?: string[][]
}

export interface Page {
  id: string
  title: string
  icon: string
  type: PageType
  parentId: string | null
  children: string[]
  favorite?: boolean
  createdAt: number
  updatedAt: number
  deletedAt?: number | null
  blocks: Block[]
  expanded?: boolean
  fullWidth?: boolean
  locked?: boolean
  cover?: string | null
  /** per-page view preferences (filters, sort, layout) */
  view?: Record<string, any>
  /** database pages: properties and views */
  db?: DbSchema
  /** set when this page is a row of the database page with this id (rows are hidden from the sidebar) */
  rowOf?: string | null
  /** row property values keyed by property id */
  props?: Record<string, any>
  /** manual row order inside its database */
  rowOrder?: number
  /** dashboard pages: widgets on the grid */
  widgets?: Widget[]
}

// ---------- databases ----------
export type PropType = 'text' | 'number' | 'select' | 'multi' | 'status' | 'date' | 'checkbox' | 'url' | 'progress'
export interface PropOption { id: string; name: string; color: string }
export interface DbProp {
  id: string
  name: string
  type: PropType
  options?: PropOption[]
  /** number display */
  format?: 'plain' | 'percent' | 'currency' | 'decimal'
  /** progress: maximum value (default 100) */
  max?: number
}
export type ViewType = 'table' | 'board' | 'gallery' | 'list' | 'calendar'
export interface DbFilter { id: string; prop: string; op: 'is' | 'not' | 'contains' | 'empty' | 'notEmpty' | 'gt' | 'lt' | 'checked' | 'unchecked'; value?: any }
export interface DbView {
  id: string
  name: string
  type: ViewType
  groupBy?: string | null
  dateProp?: string | null
  sort?: { prop: string; dir: 'asc' | 'desc' } | null
  filters?: DbFilter[]
  hidden?: string[]
  widths?: Record<string, number>
  /** gallery/board: properties shown on cards */
  cardProps?: string[]
}
export interface DbSchema { props: DbProp[]; views: DbView[] }

// ---------- dashboards ----------
export type WidgetType =
  | 'value' | 'chart' | 'progress' | 'tasks' | 'habits' | 'database' | 'calendar' | 'clock'
  | 'note' | 'countdown' | 'focus' | 'quickadd' | 'stat' | 'page' | 'goals'
export interface Widget {
  id: string
  type: WidgetType
  /** grid position in columns/rows */
  x: number
  y: number
  w: number
  h: number
  title?: string
  config: Record<string, any>
}

// ---------- custom values ----------
export interface ValueEntry { id: string; at: number; delta: number; note: string; src?: string }
export interface TrackedValue {
  id: string
  name: string
  icon: string
  color: string
  unit: string
  /** starting value when the value never resets */
  base: number
  goal?: number | null
  decimals: number
  /** 'day' etc: the shown value counts only changes since the start of that period */
  reset: 'never' | 'day' | 'week' | 'month'
  log: ValueEntry[]
  order: number
  createdAt: number
}
export type RuleTrigger = 'task' | 'habit' | 'focus' | 'journal' | 'row' | 'metric' | 'goal'
export interface ValueRule {
  id: string
  valueId: string
  on: RuleTrigger
  /** task: list page; habit: habit id; row: database page id; metric: metric id; empty = any */
  scope?: string | null
  /** task: only tasks with this tag */
  tag?: string | null
  /** row: property id that must change to `option` (status/select) or become checked (checkbox) */
  prop?: string | null
  option?: string | null
  mode: 'add' | 'set'
  amount: number
  /** focus: multiply the amount by minutes focused */
  perMinute?: boolean
  enabled: boolean
}

export type Difficulty = 'trivial' | 'easy' | 'medium' | 'hard' | 'epic'
export type Repeat = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly'
export type TaskStatus = 'todo' | 'doing' | 'done'
export type StatKey = 'str' | 'int' | 'wis' | 'cha' | 'vit' | 'cre'

export interface Subtask { id: string; title: string; done: boolean }

export interface Task {
  id: string
  pageId: string
  title: string
  notes: string
  status: TaskStatus
  done: boolean
  doneAt?: number | null
  createdAt: number
  due?: string | null
  time?: string | null
  priority: 0 | 1 | 2 | 3
  difficulty: Difficulty
  stat?: StatKey | null
  tags: string[]
  subtasks: Subtask[]
  repeat: Repeat
  order: number
  estimate?: number | null
  pinned?: boolean
  archived?: boolean
  remindAt?: number | null
  reminded?: boolean
  /** goal this task counts toward */
  goalId?: string | null
}

export interface Habit {
  id: string
  pageId: string
  name: string
  icon: string
  color: string
  kind: 'good' | 'bad'
  target: number
  days: number[]
  log: Record<string, number>
  difficulty: Difficulty
  stat?: StatKey | null
  createdAt: number
  order: number
  archived?: boolean
  notes?: string
  /** 'week': `target` is times per week, any day counts */
  period?: 'day' | 'week'
  dayNotes?: Record<string, string>
  /** days covered by a streak freeze */
  frozen?: string[]
}

export interface JournalEntry {
  id: string
  pageId: string
  date: string
  title: string
  mood: number
  energy: number
  text: string
  tags: string[]
  gratitude: string[]
  createdAt: number
  updatedAt: number
  pinned?: boolean
}

export interface Milestone { id: string; title: string; done: boolean }

export interface Goal {
  id: string
  pageId: string
  title: string
  why: string
  icon: string
  deadline?: string | null
  milestones: Milestone[]
  progressMode: 'milestones' | 'manual' | 'tasks'
  manual: number
  color: string
  done: boolean
  doneAt?: number | null
  createdAt: number
  category: string
  difficulty: Difficulty
  order: number
}

export interface Metric {
  id: string
  pageId: string
  name: string
  icon: string
  unit: string
  goal?: number | null
  direction: 'up' | 'down' | 'none'
  color: string
  entries: { date: string; value: number }[]
  aggregate: 'last' | 'sum'
  order: number
}

export interface FocusSession {
  id: string
  start: number
  minutes: number
  label: string
  taskId?: string | null
  kind: 'focus' | 'break'
}

export interface Profile {
  /** workspace / greeting name */
  name: string
  /** workspace icon */
  avatar: string
}

export interface Settings {
  theme: 'system' | 'light' | 'dark'
  accent: string
  material: 'mica' | 'acrylic' | 'none'
  fontSize: number
  density: 'comfortable' | 'compact'
  font: 'system' | 'serif' | 'mono'
  sidebarWidth: number
  sidebarCollapsed: boolean
  weekStart: 0 | 1
  use24h: boolean
  startPage: string
  lastPage: string | null
  focusMinutes: number
  breakMinutes: number
  longBreakMinutes: number
  longBreakEvery: number
  autoUpdate: boolean
  sounds: boolean
  notifications: boolean
  showCompleted: boolean
  confirmDelete: boolean
  reduceMotion: boolean
  spellcheck: boolean
  glassStrength: number
  /** backdrop behind the glass: 'mica' shows the desktop tint, others are gradients from styles.css */
  backdrop: string
  /** desktop widget window on another monitor */
  widget: {
    enabled: boolean
    displayId: number | null
    pageId: string | null
    opacity: number
    /** 'clear' = see-through window, 'acrylic' = blurred Windows material */
    background: 'clear' | 'acrylic'
    /** 'desktop' = behind other windows, 'top' = above them */
    layer: 'desktop' | 'top'
  }
  closeToTray: boolean
  quickAddHotkey: boolean
}

export interface Countdown { id: string; title: string; date: string; icon: string; color: string; yearly?: boolean }

export interface AssistantMessage { id: string; role: 'user' | 'assistant'; content: string; at: number; applied?: number[] }

export interface AppData {
  schema: number
  pages: Record<string, Page>
  rootOrder: string[]
  tasks: Record<string, Task>
  habits: Record<string, Habit>
  journal: Record<string, JournalEntry>
  goals: Record<string, Goal>
  metrics: Record<string, Metric>
  focus: FocusSession[]
  profile: Profile
  settings: Settings
  recent: string[]
  tags: Record<string, string>
  assistant: { messages: AssistantMessage[] }
  countdowns: Countdown[]
  values: Record<string, TrackedValue>
  rules: ValueRule[]
  /** data from removed features, kept so nothing is ever lost */
  legacy?: Record<string, any>
}
