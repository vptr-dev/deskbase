import { nextTaskDate, normalizeRepeat, shiftTaskReminder } from './lib/recurrence'
import { create } from 'zustand'
import { applyPatches, enablePatches, type Patch, produceWithPatches } from 'immer'
import type { AppData, Page, PageType, Task } from './types'
import { api } from './lib/api'
import { freshData, newPage, normalize } from './lib/defaults'
import { applyRules, revertRules, type ValueEvent } from './lib/values'
import { addDays, dayKey, friendlyDay, parseDay, today, uid } from './lib/util'

enablePatches()

export type Overlay = null | 'search' | 'trash' | 'newPage' | 'shortcuts' | 'notionImport' | 'movePage' | 'quickAdd' | 'values' | 'history'

export interface Toast { id: string; text: string; icon?: string; kind?: 'xp' | 'info' | 'level' | 'achievement' | 'error'; undo?: boolean }

interface Store {
  ready: boolean
  data: AppData
  current: string | null
  settingsTarget: 'top' | 'assistant' | null
  overlay: Overlay
  overlayArg: any
  toasts: Toast[]
  saving: 'saved' | 'saving' | 'error'
  loadError: string | null
  canUndo: boolean
  canRedo: boolean
}

export const useApp = create<Store>(() => ({
  ready: false,
  data: freshData(),
  current: null,
  overlay: null,
  overlayArg: null,
  settingsTarget: null,
  toasts: [],
  saving: 'saved',
  loadError: null,
  canUndo: false,
  canRedo: false
}))

export const useData = <T,>(sel: (d: AppData) => T): T => useApp((s) => sel(s.data))
export const getData = (): AppData => actionDraft ?? useApp.getState().data

// ---------- toasts ----------
export function toast(text: string, opts: Omit<Toast, 'id' | 'text'> = {}): void {
  const t: Toast = { id: uid(), text, ...opts }
  useApp.setState((s) => ({ toasts: [...s.toasts.slice(-3), t] }))
  setTimeout(() => useApp.setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) })), opts.undo ? 6000 : 3200)
}

// ---------- persistence ----------
let saveTimer: ReturnType<typeof setTimeout> | null = null
function scheduleSave(): void {
  useApp.setState({ saving: 'saving' })
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(flushSave, 450)
}
export async function flushSave(): Promise<void> {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
  try {
    await api.save(getData())
    useApp.setState({ saving: 'saved' })
  } catch {
    useApp.setState({ saving: 'error' })
  }
}
window.addEventListener('beforeunload', () => {
  if (saveTimer) api.saveSync(getData())
})

export async function boot(): Promise<void> {
  const res = await api.load()
  const data = normalize(res.data)
  const s = data.settings
  let current = s.startPage !== 'last' && data.pages[s.startPage] ? s.startPage : s.lastPage
  if (!current || !data.pages[current] || data.pages[current].deletedAt) current = data.rootOrder.find((id) => !data.pages[id]?.deletedAt) ?? null
  useApp.setState({ data, ready: true, current, loadError: res.error ?? null })
  if (!res.data) await api.save(data)
  if (res.error) toast(res.error, { kind: 'error' })
}

export function replaceData(raw: any, message: string): void {
  const data = normalize(raw)
  undoStack.length = 0
  redoStack.length = 0
  useApp.setState({ data, current: data.rootOrder[0] ?? null, canUndo: false, canRedo: false })
  scheduleSave()
  toast(message)
}

// ---------- mutations with undo ----------
interface HistoryEntry { patches: Patch[]; inverse: Patch[]; key?: string; at: number }
const undoStack: HistoryEntry[] = []
const redoStack: HistoryEntry[] = []
const effects: (() => void)[] = []

let actionDraft: AppData | null = null

/** Commit all synchronous data edits from one button click as one undoable operation. */
export function batchButtonEdits(run: () => void): void {
  act(d => {
    actionDraft = d
    try { run() } finally { actionDraft = null }
  })
}

export function act(recipe: (d: AppData) => void, opts: { key?: string; history?: boolean } = {}): void {
  if (actionDraft) { recipe(actionDraft); return }
  const prev = getData()
  const [next, patches, inverse] = produceWithPatches(prev, (d: AppData) => {
    recipe(d)
  })
  if (!patches.length) return
  if (opts.history !== false) {
    const last = undoStack[undoStack.length - 1]
    const now = Date.now()
    if (opts.key && last?.key === opts.key && now - last.at < 1200) {
      last.patches = [...last.patches, ...patches]
      last.inverse = [...inverse, ...last.inverse]
      last.at = now
    } else {
      undoStack.push({ patches, inverse, key: opts.key, at: now })
      if (undoStack.length > 200) undoStack.shift()
    }
    redoStack.length = 0
  }
  useApp.setState({ data: next as AppData, canUndo: undoStack.length > 0, canRedo: false })
  scheduleSave()
  const fx = effects.splice(0)
  fx.forEach((f) => f())
}

export function undo(): void {
  const e = undoStack.pop()
  if (!e) return
  redoStack.push(e)
  useApp.setState((s) => ({ data: applyPatches(s.data, e.inverse) as AppData, canUndo: undoStack.length > 0, canRedo: true }))
  scheduleSave()
}

export function redo(): void {
  const e = redoStack.pop()
  if (!e) return
  undoStack.push(e)
  useApp.setState((s) => ({ data: applyPatches(s.data, e.patches) as AppData, canUndo: true, canRedo: redoStack.length > 0 }))
  scheduleSave()
}

// ---------- custom values ----------
/** Run the user's value rules for something that happened. Call inside an act() recipe. */
export function emit(d: AppData, ev: ValueEvent): void {
  const fired = applyRules(d, ev)
  if (fired.length) effects.push(() => toast(fired.join('  ·  '), { kind: 'xp', icon: 'gem' }))
}
/** Undo what rules did for an event source (e.g. a task was un-checked). */
export const unemit = (d: AppData, src: string): void => revertRules(d, src)

let confettiHandler: (() => void) | null = null
export const onConfetti = (fn: () => void): void => { confettiHandler = fn }
export const fireConfetti = (): void => { if (!getData().settings.reduceMotion) confettiHandler?.() }

// ---------- navigation ----------
/** Views that aren't pages. */
export type View = '@desktop' | '@appearance' | '@assistant' | '@connections' | '@settings'
export const isView = (id: string | null): id is View => id === '@desktop' || id === '@appearance' || id === '@assistant' || id === '@connections' || id === '@settings'

/** Bring the main window forward when something is opened from a desktop widget. */
function reveal(): void {
  if (!document.hasFocus()) api.showMain().catch(() => {})
}

export function openView(view: View): void {
  reveal()
  useApp.setState({ current: view, overlay: null })
}

export function openSettings(target: 'top' | 'assistant' = 'top'): void {
  reveal()
  useApp.setState({ current: '@settings', overlay: null, settingsTarget: target })
}

export function openPage(id: string): void {
  const d = getData()
  if (!d.pages[id]) return
  reveal()
  useApp.setState({ current: id, overlay: null })
  act((dr) => {
    dr.settings.lastPage = id
    dr.recent = [id, ...dr.recent.filter((r) => r !== id)].slice(0, 12)
    // Expand ancestors so the page is visible in the sidebar.
    let p = dr.pages[id]?.parentId
    while (p && dr.pages[p]) { dr.pages[p].expanded = true; p = dr.pages[p].parentId }
  }, { history: false })
}

export const setOverlay = (overlay: Overlay, arg: any = null): void => useApp.setState({ overlay, overlayArg: arg })

// ---------- pages ----------
export function createPage(type: PageType, parentId: string | null = null, title?: string, index?: number): string {
  const page = newPage(type, title, parentId)
  act((d) => {
    d.pages[page.id] = page
    const list = parentId ? d.pages[parentId].children : d.rootOrder
    if (index === undefined) list.push(page.id)
    else list.splice(index, 0, page.id)
    if (parentId) d.pages[parentId].expanded = true
  })
  openPage(page.id)
  return page.id
}

export function updatePage(id: string, fn: (p: Page) => void, key?: string): void {
  act((d) => {
    const p = d.pages[id]
    if (!p) return
    fn(p)
    p.updatedAt = Date.now()
  }, { key })
}

/** Rows of a database page (pages that live inside it rather than in the sidebar). */
export const dbRows = (d: AppData, dbId: string): Page[] =>
  Object.values(d.pages).filter((p) => p.rowOf === dbId && !p.deletedAt).sort((a, b) => (a.rowOrder ?? a.createdAt) - (b.rowOrder ?? b.createdAt))

/** Subpages and database rows below a page, recursively. */
export function descendants(d: AppData, id: string): string[] {
  const out: string[] = []
  const walk = (pid: string): void => {
    for (const c of d.pages[pid]?.children ?? []) { out.push(c); walk(c) }
    if (d.pages[pid]?.type === 'database') for (const r of Object.values(d.pages)) if (r.rowOf === pid) { out.push(r.id); walk(r.id) }
  }
  walk(id)
  return out
}

export function trashPage(id: string): void {
  const title = getData().pages[id]?.title || 'Untitled'
  act((d) => {
    const now = Date.now()
    for (const pid of [id, ...descendants(d, id)]) if (d.pages[pid]) d.pages[pid].deletedAt = now
  })
  const s = useApp.getState()
  if (s.current && (s.current === id || descendants(s.data, id).includes(s.current))) {
    const next = s.data.rootOrder.find((r) => !s.data.pages[r]?.deletedAt)
    useApp.setState({ current: next ?? null })
  }
  toast(`Moved “${title}” to trash`, { undo: true })
}

export function restorePage(id: string): void {
  act((d) => {
    for (const pid of [id, ...descendants(d, id)]) if (d.pages[pid]) d.pages[pid].deletedAt = null
    const p = d.pages[id]
    if (p.rowOf && d.pages[p.rowOf]?.deletedAt) d.pages[p.rowOf].deletedAt = null
    if (!p.rowOf && p.parentId && d.pages[p.parentId]?.deletedAt) {
      // Parent is still in trash: move to root.
      d.pages[p.parentId].children = d.pages[p.parentId].children.filter((c) => c !== id)
      p.parentId = null
      d.rootOrder.push(id)
    }
  })
}

export function purgePage(id: string): void {
  act((d) => {
    const ids = [id, ...descendants(d, id)]
    const p = d.pages[id]
    if (p?.parentId && d.pages[p.parentId]) d.pages[p.parentId].children = d.pages[p.parentId].children.filter((c) => c !== id)
    d.rootOrder = d.rootOrder.filter((r) => r !== id)
    for (const pid of ids) {
      delete d.pages[pid]
      for (const coll of ['tasks', 'habits', 'journal', 'goals', 'metrics'] as const) {
        const c = d[coll] as Record<string, { pageId: string }>
        for (const [k, v] of Object.entries(c)) if (v.pageId === pid) delete c[k]
      }
    }
    d.recent = d.recent.filter((r) => !ids.includes(r))
  })
}

export function duplicatePage(id: string): void {
  const snapshot = getData()
  const src = snapshot.pages[id]
  if (!src) return
  let newId = ''
  act((d) => {
    const copies = new Map<string, string>()
    const clone = (pid: string, parent: string | null): string => {
      const o = snapshot.pages[pid]
      const nid = uid()
      const copy: Page = { ...structuredClone(o), id: nid, parentId: parent, children: [], createdAt: Date.now(), updatedAt: Date.now(), favorite: false }
      copies.set(pid, nid)
      const renew = (blocks: Page['blocks']): void => {
        for (const b of blocks) { b.id = uid(); b.cols?.forEach(renew) }
      }
      renew(copy.blocks)
      d.pages[nid] = copy
      for (const coll of ['tasks', 'habits', 'goals', 'metrics', 'journal'] as const) {
        const c = d[coll] as Record<string, any>
        for (const v of Object.values(snapshot[coll]).filter(x => x.pageId === pid)) {
          const cid = uid()
          c[cid] = { ...structuredClone(v), id: cid, pageId: nid }
        }
      }
      copy.children = o.children.filter((c) => !d.pages[c]?.deletedAt).map((c) => clone(c, nid))
      if (o.type === 'database') {
        for (const r of Object.values(d.pages).filter((x) => x.rowOf === pid && !x.deletedAt)) {
          const rid = clone(r.id, null)
          d.pages[rid].rowOf = nid
          d.pages[rid].favorite = false
        }
      }
      return nid
    }
    newId = clone(id, src.parentId)
    const relink = (blocks: Page['blocks']): void => {
      for (const b of blocks) {
        if ((b.type === 'tool' || b.type === 'database') && b.ref) b.ref = copies.get(b.ref) ?? b.ref
        b.cols?.forEach(relink)
      }
    }
    for (const copied of copies.values()) relink(d.pages[copied].blocks)
    d.pages[newId].title = (src.title || 'Untitled') + ' (copy)'
    const list = src.parentId ? d.pages[src.parentId].children : d.rootOrder
    list.splice(list.indexOf(id) + 1, 0, newId)
  })
  if (newId) openPage(newId)
}

/** Move page `id` to be a child of `parentId` (null = root) at `index`. */
export function movePage(id: string, parentId: string | null, index: number): void {
  act((d) => {
    if (id === parentId) return
    if (parentId && descendants(d, id).includes(parentId)) return
    const p = d.pages[id]
    p.rowOf = null
    const fromList = p.parentId ? d.pages[p.parentId].children : d.rootOrder
    const fromIdx = fromList.indexOf(id)
    if (fromIdx >= 0) fromList.splice(fromIdx, 1)
    const toList = parentId ? d.pages[parentId].children : d.rootOrder
    let i = index
    if (fromList === toList && fromIdx >= 0 && fromIdx < index) i -= 1
    toList.splice(Math.max(0, Math.min(i, toList.length)), 0, id)
    p.parentId = parentId
    if (parentId) d.pages[parentId].expanded = true
  })
}

// ---------- tasks ----------
export function addTask(pageId: string, partial: Partial<Task> & { title: string }): string {
  const id = uid()
  act((d) => {
    const orders = Object.values(d.tasks).filter((t) => t.pageId === pageId).map((t) => t.order)
    d.tasks[id] = {
      id,
      pageId,
      notes: '',
      status: 'todo',
      done: false,
      createdAt: Date.now(),
      due: null,
      time: null,
      priority: 0,
      difficulty: 'easy',
      stat: null,
      tags: [],
      subtasks: [],
      repeat: 'none',
      order: orders.length ? Math.max(...orders) + 1 : 0,
      ...partial
    }
    for (const t of partial.tags ?? []) if (!d.tags[t]) d.tags[t] = '#8e8e93'
  })
  return id
}

export function updateTask(id: string, fn: (t: Task) => void, key?: string): void {
  act((d) => { if (d.tasks[id]) fn(d.tasks[id]) }, { key })
}

export function wouldCycle(tasks:AppData['tasks'], id:string, parent:string):boolean {
  const seen=new Set([id])
  for(let next:string|undefined=parent;next;next=tasks[next]?.blockedBy){if(seen.has(next))return true;seen.add(next)}
  return false
}
export function setTaskDone(id: string, done: boolean): void {
  const data=getData(), parent=data.tasks[data.tasks[id]?.blockedBy??'']
  if(done&&parent&&!parent.done&&!parent.archived&&!data.pages[parent.pageId]?.deletedAt){toast('Complete '+parent.title+' first');return}
  act((d) => {
    const t = d.tasks[id]
    if (!t || t.done === done) return
    t.done = done
    t.status = done ? 'done' : 'todo'
    t.doneAt = done ? Date.now() : null
    if (done) {
      emit(d, { on: 'task', src: 'task:' + t.id, label: t.title || 'Task', scope: t.pageId, tags: t.tags })
      if (t.repeat !== 'none') {
        const due = t.due ?? today()
        const next = nextTaskDate(t.repeat, due, today())
        if (next) {
          const nid = uid()
          d.tasks[nid] = {
            ...t, id: nid, done: false, status: 'todo', doneAt: null, due: next, createdAt: Date.now(),
            remindAt: shiftTaskReminder(t.remindAt, due, next), reminded: false,
            tags: [...t.tags], repeat: normalizeRepeat(typeof t.repeat==='object'&&t.repeat.remaining?{...t.repeat,remaining:t.repeat.remaining-1}:t.repeat),
            subtasks: t.subtasks.map(s => ({ ...s, done: false }))
          }
        }
        t.repeat = 'none'
      }
    } else {
      unemit(d, 'task:' + t.id)
    }
  })
}

/** Move every open overdue task (optionally only on one page) to today. */
export function moveOverdueToToday(pageId?: string): number {
  const t0 = today()
  const ids = Object.values(getData().tasks).filter((t) => !t.done && !t.archived && t.due && t.due < t0 && (!pageId || t.pageId === pageId)).map((t) => t.id)
  if (!ids.length) return 0
  act((d) => {
    for (const id of ids) {
      const t = d.tasks[id]
      if (t.remindAt) {
        t.remindAt = shiftTaskReminder(t.remindAt, t.due ?? dayKey(new Date(t.remindAt)), t0)
        t.reminded = false
      }
      t.due = t0
    }
  })
  toast(`Moved ${ids.length} task${ids.length === 1 ? '' : 's'} to today`, { undo: true })
  return ids.length
}

export function snoozeTask(id: string, due: string): void {
  act((d) => {
    const t = d.tasks[id]
    if (!t) return
    if (t.remindAt) {
      t.remindAt = shiftTaskReminder(t.remindAt, t.due ?? dayKey(new Date(t.remindAt)), due)
      t.reminded = false
    }
    t.due = due
  })
  toast(`Snoozed to ${friendlyDay(due).toLowerCase() === 'tomorrow' ? 'tomorrow' : friendlyDay(due)}`, { undo: true })
}

export function deleteTask(id: string): void {
  const title = getData().tasks[id]?.title
  act((d) => { delete d.tasks[id] })
  toast(`Deleted “${title || 'task'}”`, { undo: true })
}

// ---------- generic collections ----------
type Coll = 'habits' | 'journal' | 'goals' | 'metrics'
export function upsert<K extends Coll>(coll: K, item: AppData[K][string]): void {
  act((d) => { (d[coll] as any)[(item as any).id] = item })
}
export function patch<K extends Coll>(coll: K, id: string, fn: (x: AppData[K][string]) => void, key?: string): void {
  act((d) => { const x = (d[coll] as any)[id]; if (x) fn(x) }, { key })
}
export function removeItem(coll: Coll, id: string, label = 'item'): void {
  act((d) => { delete (d[coll] as any)[id] })
  toast(`Deleted ${label}`, { undo: true })
}

export function setSettings(fn: (s: AppData['settings']) => void, _key?: string): void {
  act((d) => fn(d.settings), { history: false })
}

export function pageItems<T extends { pageId: string; order?: number }>(c: Record<string, T>, pageId: string): T[] {
  return Object.values(c).filter((x) => x.pageId === pageId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}
