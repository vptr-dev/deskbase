export type PageType =
  | 'doc'
  | 'today'
  | 'tasks'
  | 'board'
  | 'calendar'
  | 'habits'
  | 'journal'
  | 'goals'
  | 'character'
  | 'rewards'
  | 'focus'
  | 'games'
  | 'tracker'

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
  progressMode: 'milestones' | 'manual'
  manual: number
  color: string
  done: boolean
  doneAt?: number | null
  createdAt: number
  category: string
  difficulty: Difficulty
  order: number
}

export interface Reward {
  id: string
  pageId: string
  name: string
  icon: string
  cost: number
  notes: string
  purchases: number[]
  repeatable: boolean
  order: number
}

export type GameStatus = 'playing' | 'backlog' | 'wishlist' | 'paused' | 'completed' | 'dropped'

export interface Game {
  id: string
  pageId: string
  title: string
  platform: string
  genre: string
  status: GameStatus
  hours: number
  rating: number
  completion: number
  startedAt?: string | null
  finishedAt?: string | null
  notes: string
  color: string
  favorite?: boolean
  createdAt: number
  sessions: { id: string; date: string; minutes: number; note: string }[]
  goals: Subtask[]
  /** wishlist: price / deal notes */
  price?: string
  releaseDate?: string | null
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

export interface XpEvent {
  id: string
  at: number
  xp: number
  gold: number
  label: string
  source: string
  sourceId: string
  stat?: StatKey | null
}

export interface StatInfo { name: string; icon: string; xp: number }

export interface Profile {
  name: string
  avatar: string
  title: string
  xp: number
  gold: number
  stats: Record<StatKey, StatInfo>
  achievements: Record<string, number>
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
  gamification: boolean
  notifications: boolean
  xpMultiplier: number
  showCompleted: boolean
  confirmDelete: boolean
  reduceMotion: boolean
  spellcheck: boolean
  glassStrength: number
  dailyXpGoal: number
}

export interface AssistantMessage { id: string; role: 'user' | 'assistant'; content: string; at: number; applied?: number[] }

export interface AppData {
  schema: number
  pages: Record<string, Page>
  rootOrder: string[]
  tasks: Record<string, Task>
  habits: Record<string, Habit>
  journal: Record<string, JournalEntry>
  goals: Record<string, Goal>
  rewards: Record<string, Reward>
  games: Record<string, Game>
  metrics: Record<string, Metric>
  focus: FocusSession[]
  xpLog: XpEvent[]
  profile: Profile
  settings: Settings
  recent: string[]
  tags: Record<string, string>
  assistant: { messages: AssistantMessage[] }
}
