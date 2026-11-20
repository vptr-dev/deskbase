import { create } from 'zustand'
import { getData, isView, openPage, openView, useApp, type View } from '../store'
import { uid } from './util'

/** One open tab: the page it shows and its own back and forward history. */
export interface Tab { id: string; page: string | null; back: string[]; fwd: string[] }

interface TabState { tabs: Tab[]; active: string }

const KEY = 'deskbase:tabs'
const first: Tab = { id: uid(), page: null, back: [], fwd: [] }
export const useTabs = create<TabState>(() => ({ tabs: [first], active: first.id }))

let switching = false
/** Pages of recently closed tabs, for Ctrl+Shift+T. */
const closed: (string | null)[] = []
let instantTimer = 0

const activeTab = (): Tab => {
  const s = useTabs.getState()
  return s.tabs.find((t) => t.id === s.active) ?? s.tabs[0]
}
const patch = (id: string, fn: (t: Tab) => Tab): void =>
  useTabs.setState((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? fn(t) : t)) }))

const exists = (id: string | null): boolean => {
  if (!id) return false
  if (isView(id)) return true
  const p = getData().pages[id]
  return !!p && !p.deletedAt
}

/** Shows a page at once, without the entrance animation (back, forward and tab switches). */
function show(id: string | null): void {
  document.documentElement.dataset.nav = 'instant'
  clearTimeout(instantTimer)
  instantTimer = window.setTimeout(() => { delete document.documentElement.dataset.nav }, 500)
  switching = true
  if (!id || !exists(id)) useApp.setState({ current: null, overlay: null })
  else if (isView(id)) openView(id as View)
  else openPage(id)
  switching = false
}

// Every page change lands in the active tab; normal navigation also records history.
useApp.subscribe((s, prev) => {
  if (s.current === prev.current) return
  const tab = activeTab()
  if (switching) { patch(tab.id, (t) => ({ ...t, page: s.current })); return }
  patch(tab.id, (t) => ({
    ...t,
    page: s.current,
    back: prev.current ? [...t.back, prev.current].slice(-50) : t.back,
    fwd: []
  }))
})

// Remember the open tabs between runs.
let saveTimer = 0
useTabs.subscribe((s) => {
  clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ active: s.active, tabs: s.tabs.map((t) => ({ id: t.id, page: t.page })) })) } catch { /* storage unavailable */ }
  }, 300)
})

/** Called once the data has loaded: brings back the tabs from the last run. */
export function restoreTabs(): void {
  const current = useApp.getState().current
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null') as { active: string; tabs: { id: string; page: string | null }[] } | null
    if (raw && Array.isArray(raw.tabs) && raw.tabs.length) {
      const tabs: Tab[] = raw.tabs.filter((t) => t && typeof t.id === 'string').slice(0, 30)
        .map((t) => ({ id: t.id, page: exists(t.page) ? t.page : null, back: [], fwd: [] }))
      const active = tabs.find((t) => t.id === raw.active) ?? tabs[0]
      if (active && current) active.page = current
      if (tabs.length) { useTabs.setState({ tabs, active: active.id }); return }
    }
  } catch { /* ignore broken saved tabs */ }
  patch(activeTab().id, (t) => ({ ...t, page: current }))
}

export function goBack(): void {
  const tab = activeTab()
  const back = tab.back.filter(exists)
  const id = back.pop()
  if (!id) return
  patch(tab.id, (t) => ({ ...t, back, fwd: t.page ? [...t.fwd, t.page] : t.fwd }))
  show(id)
}

export function goForward(): void {
  const tab = activeTab()
  const fwd = tab.fwd.filter(exists)
  const id = fwd.pop()
  if (!id) return
  patch(tab.id, (t) => ({ ...t, fwd, back: t.page ? [...t.back, t.page] : t.back }))
  show(id)
}

export function switchTab(id: string): void {
  const s = useTabs.getState()
  const tab = s.tabs.find((t) => t.id === id)
  if (!tab || id === s.active) return
  useTabs.setState({ active: id })
  show(tab.page)
}

/** Opens a page (or nothing, for a start tab) in a new tab next to the active one. */
export function newTab(page: string | null = null, focus = true): void {
  const s = useTabs.getState()
  const tab: Tab = { id: uid(), page, back: [], fwd: [] }
  const at = s.tabs.findIndex((t) => t.id === s.active) + 1
  const tabs = [...s.tabs.slice(0, at), tab, ...s.tabs.slice(at)]
  useTabs.setState({ tabs })
  if (focus) { useTabs.setState({ active: tab.id }); show(page) }
}

export function closeTab(id = useTabs.getState().active): void {
  const s = useTabs.getState()
  if (s.tabs.length < 2) return
  const i = s.tabs.findIndex((t) => t.id === id)
  if (i < 0) return
  const tabs = s.tabs.filter((t) => t.id !== id)
  closed.push(s.tabs[i].page)
  if (closed.length > 20) closed.shift()
  if (id !== s.active) { useTabs.setState({ tabs }); return }
  const next = tabs[Math.min(i, tabs.length - 1)]
  useTabs.setState({ tabs, active: next.id })
  show(next.page)
}

export function reopenTab(): void {
  while (closed.length) {
    const page = closed.pop() ?? null
    if (page === null || exists(page)) { newTab(page); return }
  }
}

export function closeOtherTabs(id: string): void {
  const s = useTabs.getState()
  const keep = s.tabs.find((t) => t.id === id)
  if (!keep) return
  useTabs.setState({ tabs: [keep], active: keep.id })
  if (s.active !== id) show(keep.page)
}

export function cycleTab(dir: 1 | -1): void {
  const s = useTabs.getState()
  if (s.tabs.length < 2) return
  const i = s.tabs.findIndex((t) => t.id === s.active)
  switchTab(s.tabs[(i + dir + s.tabs.length) % s.tabs.length].id)
}

export function moveTab(id: string, to: number): void {
  const s = useTabs.getState()
  const from = s.tabs.findIndex((t) => t.id === id)
  if (from < 0) return
  const tabs = [...s.tabs]
  const [t] = tabs.splice(from, 1)
  tabs.splice(Math.max(0, Math.min(to > from ? to - 1 : to, tabs.length)), 0, t)
  useTabs.setState({ tabs })
}

/** Ctrl or middle click opens in a new tab; a plain click opens here. */
export function openFromClick(id: string, e?: { ctrlKey?: boolean; metaKey?: boolean; button?: number; shiftKey?: boolean }): void {
  if (e && (e.ctrlKey || e.metaKey || e.button === 1)) newTab(id, !!e.shiftKey || e.button !== 1)
  else if (isView(id)) openView(id as View)
  else openPage(id)
}
