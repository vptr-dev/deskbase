export type PageType =
  | 'doc'
  | 'today'
  | 'tasks'
  | 'board'
  | 'project'
  | 'calendar'
  | 'habits'
  | 'journal'
  | 'goals'
  | 'focus'
  | 'tracker'
  | 'wishlist'
  | 'list' | 'study' | 'reading' | 'workout'
  | 'review'
  | 'database'
  | 'dashboard'

export type BlockType =
  | 'studio'
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
  | 'toggle-h1'
  | 'toggle-h2'
  | 'toggle-h3'
  | 'toc'
  | 'bookmark'
  | 'image'
  | 'embed'
  | 'equation'
  | 'button'
  | 'columns'
  | 'link'
  | 'synced'
  | 'tabs'
  | 'database'
  | 'tool'
  | 'widget'

export interface StudioEntry {
  id: string; title: string; notes: string; image?: string; later?: string; credit?: string
  rating?: number; color?: string; x?: number; y?: number; done?: boolean; audio?: string
}
export interface Block {
  entries?: StudioEntry[]
  fullWidth?: boolean
  id: string
  type: BlockType
  text: string
  widgetSource?: { page: string | null; id: string }
  checked?: boolean
  open?: boolean
  body?: string
  color?: string
  indent?: number
  rows?: string[][]
  /** bookmark, image and embed address */
  url?: string
  /** what a bookmark found at its address */
  meta?: { title?: string; desc?: string; site?: string; icon?: string }
  /** columns and tabs: each column (or tab) holds its own blocks */
  cols?: Block[][]
  /** tabs: the name of each tab */
  labels?: string[]
  /** columns: each column's share of the width (equal when missing) */
  widths?: number[]
  /** To-do checkbox color. */
  iconColor?: string
  /** callout: its icon */
  icon?: string
  /** link, database and tool: the page id; synced: "pageId/blockId" of the original block */
  ref?: string
  /** background color behind the block (a color name or #hex) */
  bg?: string
  /** divider look, image width, button look */
  style?: string
  /** what a button does */
  action?: ButtonAction
  /** to-dos from the Notion API: the Notion block id, for sending checks back */
  nid?: string
}

export interface ButtonAction {
  kind: 'link' | 'page' | 'todos' | 'toggle' | 'addValue' | 'setValue' | 'task' | 'purchase' | 'expense'
  target: string
  pageId?: string
  amount?: number
  usePurchasePrice?: boolean
  then?: ButtonAction[]
  title?: string
}

export interface WishItem {
  id:string; name:string; cost:number|null; purchased:boolean; purchasedOn?:string; category?:string
  priority?:'high'|'medium'|'low'; url?:string; image?:string
  recipient?:string; privateNote?:string; quantity?:number; boughtQuantity?:number
  savingsId?:string; earmarked?:number
  preorder?:boolean; skipUntil?:string; skipReason?:string
  warrantyUntil?:string; returnBy?:string; receipt?:string
  variants?: {id:string; shop:string; size:string; color:string; price:number|null}[]
  prices?: {date:string; amount:number}[]
}
export interface WishCategory { id:string; name:string; color?:string; archived?:boolean }
export interface WishlistFilter { id:string; name:string; category:string; priority:string; tab:'wishlist'|'purchased' }
export interface PurchaseList {
  items: WishItem[]; budget: number | null; currency: string
  categories?: WishCategory[]
  delivery?: number
  discount?: number
  filters?: WishlistFilter[]
  trash?: { item: WishItem; deletedAt:number }[]
}

export interface ListEntry {
  category?:string; id:string; name:string; done:number; target:number; unit:string
  status?:string; mood?:string; minutes?:number; series?:string; installment?:number
  lender?:string; returnBy?:string; handover?:string; spoiler?:string
  runs?:{id:string;date:string;notes:string}[]
  fields?:Record<string,string>
}
export interface WorkoutSet { id:string; date:string; exercise:string; sets:number; reps:number; weight:number; unit:string }
export interface StudyCard { id: string; question: string; answer: string; due: string; interval: number }
export interface Page {
  accent?: string
  workouts?: WorkoutSet[]
  entries?: ListEntry[]
  removedEntries?: ListEntry[]
  cards?: StudyCard[]
  wishlist?: PurchaseList
  id: string
  title: string
  icon: string
  /** icon color; empty = default */
  iconColor?: string
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
  trelloBoard?: string
  db?: DbSchema
  /** set when this page is a row of the database page with this id (rows are hidden from the sidebar) */
  rowOf?: string | null
  /** row property values keyed by property id */
  props?: Record<string, any>
  /** manual row order inside its database */
  rowOrder?: number
  /** dashboard pages: widgets on the grid */
  widgets?: Widget[]
  /** where the page was imported from, for refreshing it later */
  source?: PageSource | null
  /** a template: new pages (or rows of its database) can start as a copy of it */
  template?: boolean
}

/** `via`: the Notion connection it comes through (the API); missing for the Notion app import */
export interface PageSource { kind: 'notion'; id: string; syncedAt: number; via?: string }

// ---------- databases ----------
export type PropType = 'text' | 'number' | 'select' | 'multi' | 'status' | 'date' | 'checkbox' | 'url' | 'progress' | 'relation' | 'rollup' | 'formula'
export type RollupFn = 'count' | 'sum' | 'avg' | 'min' | 'max' | 'checked' | 'list' | 'earliest' | 'latest'
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
  /** relation: the database whose rows this links to */
  relation?: string | null
  /** rollup: a value from the linked rows of one of this database's relations */
  rollup?: { rel: string; prop: string; fn: RollupFn } | null
  /** formula: an expression over the other properties, e.g. prop("Price") * 2 */
  formula?: string
}
export type ViewType = 'table' | 'board' | 'gallery' | 'list' | 'calendar' | 'timeline' | 'chart' | 'form'
export interface DbChart { kind: 'bar' | 'hbar' | 'line' | 'donut'; by: string | null; value: string | null; fn: 'count' | 'sum' | 'avg' }
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
  /** timeline: where a row ends (dateProp is where it starts) */
  endProp?: string | null
  chart?: DbChart
}
export interface DbSchema { props: DbProp[]; views: DbView[] }

// ---------- dashboards ----------
export type WidgetType =
  | import('../../shared/services').ServiceId
  | 'value' | 'chart' | 'progress' | 'tasks' | 'habits' | 'database' | 'calendar' | 'clock'
  | 'note' | 'countdown' | 'focus' | 'quickadd' | 'stat' | 'page' | 'goals'
  | 'pageview' | 'checklist' | 'dashboard' | 'image' | 'text' | 'agenda' | 'week'
  | 'weather' | 'daylight' | 'system' | 'timer' | 'sections' | 'table'
  | 'worldclock' | 'stopwatch' | 'timeleft' | 'moon' | 'workspaces' | 'launcher' | 'search' | 'quote' | 'battery'
  | 'tracker' | 'wishlist' | 'button' | 'list' | 'study' | 'reading' | 'workout'
  | 'network' | 'calculator' | 'recent' | 'dbchart' | 'activity' | 'deadlines' | 'events' | 'feed' | 'github' | 'mail' | 'todoist' | 'media'
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
  /** look overrides for this widget */
  style?: Partial<WidgetStyle>
}

// ---------- desktop widgets ----------
/** auto: follows the surface picked in Appearance; glass: clear tinted card; blur / acrylic: real blur of what is behind; tint: solid card; clear: no card at all */
export type DeskMaterial = 'auto' | 'glass' | 'blur' | 'acrylic' | 'tint' | 'clear'
/** The look of every window, card and panel: clear glass, blurred glass, heavily frosted glass or solid. */
export type Surface = 'glass' | 'blur' | 'frosted' | 'solid'
export interface WidgetStyle {
  material: DeskMaterial
  /** card color; '' follows the theme */
  tint: string
  /** card opacity 0-100 */
  opacity: number
  radius: number
  /** text color; '' follows the theme */
  text: string
  /** accent color; '' uses the app accent */
  accent: string
  /** font family; '' uses the app font */
  font: string
  /** content size in percent */
  scale: number
  padding: number
  /** border strength 0-100 */
  border: number
  /** border width in px (desktop panels) */
  borderWidth: number
  /** border color; '' is a light edge on glass and a line on solid */
  borderColor: string
  /** title: small caps, plain or large */
  titleStyle: 'caps' | 'plain' | 'large'
  shadow: boolean
  /** how much Blur and Frosted panels blur what is behind them, px */
  blur: number
  header: boolean
  align: 'start' | 'center'
  theme: 'auto' | 'light' | 'dark'
}
export type DeskLayer = 'desktop' | 'normal' | 'top'
export interface DeskWidget {
  id: string
  type: WidgetType
  title?: string
  config: Record<string, any>
  /** screen position and size in device-independent pixels; w <= 0 fills the display in config.displayId */
  x: number
  y: number
  w: number
  h: number
  style: Partial<WidgetStyle>
  layer: DeskLayer
  locked?: boolean
  hidden?: boolean
  /** panels sharing a group id move together */
  group?: string | null
  /** workspace this panel belongs to */
  space: string
  createdAt: number
}
/** A workspace: its own set of panels on the screen. Pages are shared by all workspaces. */
export interface PanelPlacement { x: number; y: number; w: number; h: number }
export interface WorkspaceArrangement { id: string; name: string; positions: Record<string, PanelPlacement> }
export interface DeskSpace {
  landingPage?: string
  arrangements?: WorkspaceArrangement[]
  archived?: boolean
  quietFrom?: string
  quietUntil?: string
  switchAt?: string
  iconColor?: string
  id: string
  name: string
  icon: string
}
export interface Desktop {
  templates?: { id: string; name: string; panels: DeskWidget[] }[]
  enabled: boolean
  spaces: DeskSpace[]
  /** id of the workspace on screen */
  active: string
  /** style every widget starts from */
  style: WidgetStyle
  widgets: DeskWidget[]
  /** snap to edges and other widgets while moving */
  snap: boolean
  /** grid step in px when snapping */
  grid: number
}

// ---------- appearance ----------
export type Motion = 'off' | 'subtle' | 'normal' | 'lively'
export interface Look {
  /** id of the theme preset this look started from */
  preset: string
  /** surface of the app and, unless panelSurface says otherwise, the desktop panels */
  surface: Surface
  panelSurface: 'same' | Surface
  /** border strength 0-100 for windows, cards and panels */
  border: number
  /** border width in px (0 hides borders) */
  borderWidth: number
  radius: number
  /** blur of glass panels in px */
  blur: number
  /** border highlight 0-100 */
  shine: number
  /** shadow depth 0-100 */
  shadow: number
  /** saturation boost behind glass, percent */
  saturation: number
  /** custom font family names; '' = the choice in settings.font */
  fontFamily: string
  headingFamily: string
  headingWeight: number
  lineHeight: number
  /** letter spacing in hundredths of an em */
  letterSpacing: number
  motion: Motion
  pageTransition: 'fade' | 'slide' | 'rise' | 'none'
  sidebarIconColor?: string
  sidebarSubtitleColor?: string
  pagesSubtitle?: string
  iconStroke: number
  /** picture behind the glass (data URL) */
  backdropImage: string | null
  backdropBlur: number
  /** -60 (lighter) to 60 (darker) */
  backdropDim: number
  gradient: { a: string; b: string; c: string; angle: number }
  /** extra CSS applied to the app and widgets */
  customCss: string
  /** text color: a ready-made tone or your own colors for light and dark */
  textTone: 'auto' | 'soft' | 'ink' | 'warm' | 'cool' | 'custom'
  textLight: string
  textDark: string
  /** 0-100: how soft the edges of letters look */
  textSoft: number
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
export interface CustomRepeat {
  excludedDates?: string[]
  afterCompletion?: boolean
  rotation?: string[]
  remaining?: number
  unit: 'day' | 'week' | 'month' | 'year'
  interval: number
  start: string
  days: number[]
  weekStart: 0 | 1
  until?: string
}
export type RepeatPreset = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly'
export type Repeat = RepeatPreset | CustomRepeat
export type TaskStatus = 'todo' | 'doing' | 'done'
export type StatKey = 'str' | 'int' | 'wis' | 'cha' | 'vit' | 'cre'

export interface Subtask { id: string; title: string; done: boolean; minutes?: number; startedAt?: number; elapsedMs?: number }

export interface Task {
  scheduledFor?: string
  assignee?: string
  energy?: 1 | 2 | 3
  deferredUntilProject?: string
  calendarFollowup?: string
  blockedBy?: string
  textColor?: string
  iconColor?: string
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
  reminderBeforeMinutes?: number
  remindedFor?: number
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
  schedule?: CustomRepeat
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


/** A place for weather and daylight. */
export interface Place { name: string; lat: number; lon: number }
export interface Settings {
  blockSnippets?: { id:string; name:string; pageId:string; blocks:Block[] }[]
  repeatPatterns?: {name:string;rule:CustomRepeat}[]
  panelViews?: {name:string;type:WidgetType;config:Record<string,any>}[]
  savedThemes?: {name:string; json:string; panels?:WidgetStyle}[]
  searchKey?: string
  quickAddKey?: string
  theme: 'system' | 'light' | 'dark'
  /** where weather and daylight panels look, unless a panel picks its own place */
  place: Place | null
  fahrenheit: boolean
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
  look: Look
  /** refresh pages imported from the Notion app when the app starts and every 30 minutes */
  notionSync: boolean
  closeToTray: boolean
  quickAddHotkey: boolean
}

export interface Countdown { id: string; title: string; date: string; icon: string; color: string; yearly?: boolean }

export interface AssistantMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  at: number
  /** actions in this reply that were applied */
  applied?: number[]
  /** results of lookups the assistant asked for; sent to the model, shown only as a note */
  tool?: boolean
}
/** Nothing: no workspace data. Read: can look things up. Ask: suggests changes to approve. Auto: makes changes itself (with undo). */
export type AiAccess = 'none' | 'read' | 'ask' | 'auto'
export interface AssistantChat {
  id: string
  title: string
  pinned?: boolean
  createdAt: number
  updatedAt: number
  messages: AssistantMessage[]
  /** provider and model for this chat; empty uses the default */
  provider?: string | null
  model?: string | null
  preset?: string | null
}
export interface AssistantPreset { id: string; name: string; icon: string; instructions: string }
export interface AssistantSettings {
  /** always sent: who the user is, how to answer */
  instructions: string
  access: AiAccess
  /** 0–1.5; null leaves it to the model (Claude models take none) */
  temperature: number | null
  length: 'short' | 'normal' | 'long'
  /** how hard Claude models think */
  effort: 'low' | 'medium' | 'high'
  presets: AssistantPreset[]
}

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
  settings: Settings
  recent: string[]
  tags: Record<string, string>
  assistant: { chats: AssistantChat[]; active: string | null; settings: AssistantSettings }
  countdowns: Countdown[]
  values: Record<string, TrackedValue>
  rules: ValueRule[]
  desktop: Desktop
  connections: Connection[]
  /** data from removed features, kept so nothing is ever lost */
  legacy?: Record<string, any>
}

// ---------- connections ----------
export type ConnectionKind = import('../../shared/feeds').ConnKind
export interface Connection {
  id: string
  kind: ConnectionKind
  name: string
  /** calendar (ICS) or feed address */
  url: string
  color: string
  /** GitHub: owner/name of each repository; none = what is assigned to you */
  repos: string[]
  /** mail: the IMAP account (the app password is kept encrypted elsewhere) */
  account?: { preset: string; host: string; port: number; user: string }
  createdAt: number
  /** paused: not fetched or shown */
  off?: boolean
}
