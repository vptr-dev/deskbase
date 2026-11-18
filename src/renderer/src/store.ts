import { create } from 'zustand'
import { applyPatches, enablePatches, type Patch, produceWithPatches } from 'immer'
import type { AppData, Difficulty, Page, PageType, StatKey, Task } from './types'
import { api } from './lib/api'
import { freshData, newPage, normalize } from './lib/defaults'
import { ACHIEVEMENTS, DIFFICULTY, levelInfo } from './lib/game'
import { addDays, addMonths, parseDay, today, uid } from './lib/util'

enablePatches()

export type Overlay = null | 'search' | 'settings' | 'trash' | 'newPage' | 'shortcuts'

export interface Toast { id: string; text: string; icon?: string; kind?: 'xp' | 'info' | 'level' | 'achievement' | 'error'; undo?: boolean }

interface Store {
  ready: boolean
  data: AppData
  current: string | null
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
  toasts: [],
  saving: 'saved',
  loadError: null,
  canUndo: false,
  canRedo: false
}))

export const useData = <T,>(sel: (d: AppData) => T): T => useApp((s) => sel(s.data))
export const getData = (): AppData => useApp.getState().data

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

export function act(recipe: (d: AppData) => void, opts: { key?: string; history?: boolean } = {}): void {
  const prev = getData()
  const [next, patches, inverse] = produceWithPatches(prev, (d: AppData) => {
    recipe(d)
    checkAchievements(d)
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

// ---------- gamification ----------
export function award(d: AppData, opts: { xp: number; gold?: number; label: string; source: string; sourceId: string; stat?: StatKey | null }): void {
  if (!d.settings.gamification) return
  const mult = d.settings.xpMultiplier || 1
  const xp = Math.round(opts.xp * mult)
  const gold = Math.round((opts.gold ?? 0) * mult)
  const before = levelInfo(d.profile.xp).level
  d.profile.xp = Math.max(0, d.profile.xp + xp)
  d.profile.gold = Math.max(0, d.profile.gold + gold)
  if (opts.stat && d.profile.stats[opts.stat]) d.profile.stats[opts.stat].xp = Math.max(0, d.profile.stats[opts.stat].xp + xp)
  d.xpLog.unshift({ id: uid(), at: Date.now(), xp, gold, label: opts.label, source: opts.source, sourceId: opts.sourceId, stat: opts.stat ?? null })
  if (d.xpLog.length > 5000) d.xpLog.length = 5000
  const after = levelInfo(d.profile.xp).level
  effects.push(() => {
    if (xp > 0) toast(`+${xp} XP${gold ? `  ·  +${gold} gold` : ''}`, { kind: 'xp', icon: '✦' })
    if (after > before) {
      toast(`Level ${after} reached`, { kind: 'level', icon: '⬆' })
      fireConfetti()
    }
  })
}

/** Reverse the XP given for a source (e.g. un-checking a task). */
export function revoke(d: AppData, sourceId: string): void {
  const idx = d.xpLog.findIndex((e) => e.sourceId === sourceId && e.xp > 0)
  if (idx < 0) return
  const e = d.xpLog[idx]
  d.profile.xp = Math.max(0, d.profile.xp - e.xp)
  d.profile.gold = Math.max(0, d.profile.gold - e.gold)
  if (e.stat && d.profile.stats[e.stat]) d.profile.stats[e.stat].xp = Math.max(0, d.profile.stats[e.stat].xp - e.xp)
  d.xpLog.splice(idx, 1)
}

function checkAchievements(d: AppData): void {
  for (const a of ACHIEVEMENTS) {
    if (d.profile.achievements[a.id]) continue
    try {
      if (a.test(d)) {
        d.profile.achievements[a.id] = Date.now()
        effects.push(() => toast(`Achievement unlocked: ${a.name}`, { kind: 'achievement', icon: a.icon }))
      }
    } catch { /* ignore */ }
  }
}

let confettiHandler: (() => void) | null = null
export const onConfetti = (fn: () => void): void => { confettiHandler = fn }
export const fireConfetti = (): void => { if (!getData().settings.reduceMotion) confettiHandler?.() }

// ---------- navigation ----------
export function openPage(id: string): void {
  const d = getData()
  if (!d.pages[id]) return
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

export function descendants(d: AppData, id: string): string[] {
  const out: string[] = []
  const walk = (pid: string): void => {
    for (const c of d.pages[pid]?.children ?? []) { out.push(c); walk(c) }
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
    if (p.parentId && d.pages[p.parentId]?.deletedAt) {
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
      for (const coll of ['tasks', 'habits', 'journal', 'goals', 'rewards', 'games', 'metrics'] as const) {
        const c = d[coll] as Record<string, { pageId: string }>
        for (const [k, v] of Object.entries(c)) if (v.pageId === pid) delete c[k]
      }
    }
    d.recent = d.recent.filter((r) => !ids.includes(r))
  })
}

export function duplicatePage(id: string): void {
  const src = getData().pages[id]
  if (!src) return
  let newId = ''
  act((d) => {
    const clone = (pid: string, parent: string | null): string => {
      const o = d.pages[pid]
      const nid = uid()
      const copy: Page = { ...structuredClone(o), id: nid, parentId: parent, children: [], createdAt: Date.now(), updatedAt: Date.now(), favorite: false }
      copy.blocks = copy.blocks.map((b) => ({ ...b, id: uid() }))
      d.pages[nid] = copy
      for (const coll of ['tasks', 'habits', 'goals', 'rewards', 'games', 'metrics'] as const) {
        const c = d[coll] as Record<string, any>
        for (const v of Object.values(c).filter((x: any) => x.pageId === pid)) {
          const cid = uid()
          c[cid] = { ...structuredClone(v), id: cid, pageId: nid }
        }
      }
      copy.children = o.children.filter((c) => !d.pages[c]?.deletedAt).map((c) => clone(c, nid))
      return nid
    }
    newId = clone(id, src.parentId)
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

function nextDue(due: string, repeat: Task['repeat']): string {
  switch (repeat) {
    case 'daily': return addDays(due, 1)
    case 'weekdays': {
      let n = addDays(due, 1)
      while ([0, 6].includes(parseDay(n).getDay())) n = addDays(n, 1)
      return n
    }
    case 'weekly': return addDays(due, 7)
    case 'monthly': return addMonths(due, 1)
    case 'yearly': return addMonths(due, 12)
    default: return due
  }
}

export function setTaskDone(id: string, done: boolean): void {
  act((d) => {
    const t = d.tasks[id]
    if (!t || t.done === done) return
    t.done = done
    t.status = done ? 'done' : 'todo'
    t.doneAt = done ? Date.now() : null
    if (done) {
      const diff = DIFFICULTY[t.difficulty as Difficulty] ?? DIFFICULTY.easy
      const bonus = t.priority * 2 + (t.due && t.due < today() ? -Math.ceil(diff.xp * 0.2) : 0)
      award(d, { xp: diff.xp + bonus, gold: diff.gold, label: t.title || 'Task', source: 'task', sourceId: t.id, stat: t.stat })
      if (t.repeat !== 'none') {
        const nid = uid()
        const base = t.due && t.due > today() ? t.due : t.due ?? today()
        let nd = nextDue(base, t.repeat)
        while (nd <= today()) nd = nextDue(nd, t.repeat)
        d.tasks[nid] = { ...structuredClone(t), id: nid, done: false, status: 'todo', doneAt: null, due: nd, createdAt: Date.now(), reminded: false, subtasks: t.subtasks.map((s) => ({ ...s, done: false })) }
        t.repeat = 'none'
      }
    } else {
      revoke(d, t.id)
    }
  })
}

export function deleteTask(id: string): void {
  const title = getData().tasks[id]?.title
  act((d) => { delete d.tasks[id] })
  toast(`Deleted “${title || 'task'}”`, { undo: true })
}

// ---------- generic collections ----------
type Coll = 'habits' | 'journal' | 'goals' | 'rewards' | 'games' | 'metrics'
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

export function setSettings(fn: (s: AppData['settings']) => void): void {
  act((d) => fn(d.settings), { history: false })
}

export function pageItems<T extends { pageId: string; order?: number }>(c: Record<string, T>, pageId: string): T[] {
  return Object.values(c).filter((x) => x.pageId === pageId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}
