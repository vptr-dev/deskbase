import { workspaceQuiet } from './reminders'
// Connections in the renderer: what each one fetched (cached in the main process too), calendar
// events for the calendar and panels, keeping things fresh, and sending Notion checks back.
import { useEffect, useMemo } from 'react'
import { create } from 'zustand'
import type { ConnSpec, FeedEvent, FeedItem, FeedResult } from '../../../shared/feeds'
import type { AppData, Block, Connection, ConnectionKind, Page } from '../types'
import { act, getData, toast, useApp, useData } from '../store'
import { type MediaState, api, isDesktop } from './api'
import { refreshFromNotion } from './importer'
import { uid } from './util'

import { SERVICES } from '../../../shared/services'

export const CONN_INFO: Record<ConnectionKind, { name: string; icon: string; desc: string }> = {
  ...SERVICES,
  calendar: { name: 'Calendar', icon: 'calendarSync', desc: 'Google, Outlook or Apple calendar through its ICS link' },
  rss: { name: 'News feed', icon: 'rss', desc: 'Any RSS or Atom feed: blogs, news, YouTube channels' },
  github: { name: 'GitHub', icon: 'pr', desc: 'Open issues and pull requests' },
  notion: { name: 'Notion', icon: 'notion', desc: 'Pages and databases kept in sync, to-dos both ways' },
  mail: { name: 'Mail', icon: 'mail', desc: 'Gmail, iCloud, Yahoo or any IMAP inbox with an app password' },
  todoist: { name: 'Todoist', icon: 'checkSquare', desc: 'Your Todoist tasks, checked off from here' }
}

export const CONN_COLORS = ['#0a84ff', '#30d158', '#ff9f0a', '#ff375f', '#bf5af2', '#64d2ff', '#ffd60a', '#ac8e68']

const FRESH = 5 * 60 * 1000
const REFRESH = 5 * 60 * 1000
/** how old fetched things may get before the next refresh, by kind */
const MAX_AGE: Partial<Record<ConnectionKind, number>> = { mail: 4 * 60 * 1000, todoist: 4 * 60 * 1000 }

export const useFeeds = create<{ results: Record<string, FeedResult>; busy: Record<string, boolean>; secrets: string[] }>(() => ({ results: {}, busy: {}, secrets: [] }))

export const specOf = (c: Connection): ConnSpec => ({ id: c.id, kind: c.kind, url: c.url, repos: c.repos, ...(c.account ? { account: { ...c.account } } : {}) })

const latestRequest = new Map<string, symbol>()
export async function loadFeed(c: Connection, force = false): Promise<FeedResult> {
  const request = Symbol()
  latestRequest.set(c.id, request)
  useFeeds.setState(s => ({ busy: { ...s.busy, [c.id]: true } }))
  let result: FeedResult
  try { result = await api.conn.fetch(specOf(c), force) }
  catch { result = { ok: false, at: Date.now(), error: 'Could not reach this connection.' } }
  if (latestRequest.get(c.id) === request) {
    latestRequest.delete(c.id)
    useFeeds.setState(s => ({ results: { ...s.results, [c.id]: result }, busy: { ...s.busy, [c.id]: false } }))
  }
  return result
}

export async function loadSecrets(): Promise<string[]> {
  const list = await api.conn.secrets().catch(() => [])
  useFeeds.setState({ secrets: list })
  return list
}

export async function setSecret(id: string, value: string | null): Promise<void> {
  useFeeds.setState({ secrets: await api.conn.setSecret(id, value, getData().connections.find(c => c.id === id)?.kind) })
}

/** One connection and what it fetched; fetches when nothing recent is there. */
export function useFeed(id: string | undefined): { conn?: Connection; result?: FeedResult; busy: boolean } {
  const conn = useData((d) => d.connections.find((c) => c.id === id))
  const result = useFeeds((s) => (id ? s.results[id] : undefined))
  const busy = useFeeds((s) => (id ? !!s.busy[id] : false))
  useEffect(() => {
    if (!conn || conn.off || conn.kind === 'notion') return
    const r = useFeeds.getState().results[conn.id]
    if (!r || Date.now() - r.at > FRESH) void loadFeed(conn)
  }, [conn?.id, conn?.url, conn?.repos.join(','), conn?.off, JSON.stringify(conn?.account ?? null)])
  return { conn, result, busy }
}

export type CalEvent = FeedEvent & { color: string; conn: string; connName: string }

/** Events from every calendar connection (or the chosen ones), sorted by time. */
export function useCalendarEvents(only?: string[], cancelled=false): CalEvent[] {
  const conns = useData((d) => d.connections)
  const results = useFeeds((s) => s.results)
  const cals = conns.filter((c) => c.kind === 'calendar' && !c.off && (!only?.length || only.includes(c.id)))
  const key = cals.map((c) => c.id + c.url).join('|')
  useEffect(() => {
    for (const c of cals) { const r = useFeeds.getState().results[c.id]; if (!r || Date.now() - r.at > FRESH) void loadFeed(c) }
  }, [key])
  return useMemo(() => {
    const out: CalEvent[] = []
    for (const c of cals) for (const e of (cancelled ? results[c.id]?.cancelledEvents : results[c.id]?.events) ?? []) out.push({ ...e, color: c.color, conn: c.id, connName: c.name || results[c.id]?.title || 'Calendar' })
    return out.sort((a, b) => a.at - b.at || Number(b.allDay) - Number(a.allDay))
  }, [key, results, conns, cancelled])
}

/** Events by day (YYYY-MM-DD); events over several days are on each of them. */
export function eventsByDay(events: CalEvent[]): Record<string, CalEvent[]> {
  const m: Record<string, CalEvent[]> = {}
  for (const e of events) {
    if (!e.end) { (m[e.start] ??= []).push(e); continue }
    const d = new Date(e.start + 'T00:00')
    for (let i = 0; i < 62; i++) {
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      ;(m[k] ??= []).push(e)
      if (k >= e.end) break
      d.setDate(d.getDate() + 1)
    }
  }
  return m
}

export function addConnection(kind: ConnectionKind, init: Partial<Connection> = {}): string {
  const id = uid()
  act((d) => {
    const used = new Set(d.connections.map((c) => c.color))
    d.connections.push({ id, kind, name: '', url: '', color: CONN_COLORS.find((c) => !used.has(c)) ?? CONN_COLORS[0], repos: [], createdAt: Date.now(), ...(kind === 'mail' ? { account: { preset: 'gmail', host: 'imap.gmail.com', port: 993, user: '' } } : {}), ...init })
  })
  return id
}

export function patchConnection(id: string, fn: (c: Connection) => void, key?: string): void {
  act((d) => { const c = d.connections.find((x) => x.id === id); if (c) fn(c) }, key ? { key } : {})
}

export function removeConnection(id: string): void {
  latestRequest.delete(id)
  const kind = getData().connections.find(c => c.id === id)?.kind
  act((d) => {
    d.connections = d.connections.filter((c) => c.id !== id)
    // Pages from a Notion connection stay, as plain pages.
    for (const p of Object.values(d.pages)) if (p.source?.via === id) delete p.source.via
  })
  void api.conn.setSecret(id, null, kind).then((s) => useFeeds.setState({ secrets: s })).catch(() => {})
  useFeeds.setState((s) => { const r = { ...s.results }; delete r[id]; return { results: r } })
}

export const notionPagesOf = (d: AppData, connId: string): Page[] =>
  Object.values(d.pages).filter((p) => p.source?.via === connId && !p.deletedAt && !p.rowOf && (!p.parentId || d.pages[p.parentId]?.source?.via !== connId))

// ---------- sending Notion checks back ----------

type Snap = { ref: Page; synced: number; checks: Map<string, boolean>; boxes: Record<string, boolean> }

function checksOf(blocks: Block[], out = new Map<string, boolean>()): Map<string, boolean> {
  for (const b of blocks) {
    if (b.type === 'todo' && b.nid) out.set(b.nid, !!b.checked)
    b.cols?.forEach((c) => checksOf(c, out))
  }
  return out
}

function boxesOf(d: AppData, p: Page): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  const db = p.rowOf ? d.pages[p.rowOf]?.db : undefined
  if (!db) return out
  for (const prop of db.props) if (prop.type === 'checkbox') out[prop.name] = !!p.props?.[prop.id]
  return out
}

function watchNotionChecks(): () => void {
  const snaps = new Map<string, Snap>()
  const take = (d: AppData, p: Page): Snap => ({ ref: p, synced: p.source?.syncedAt ?? 0, checks: checksOf(p.blocks ?? []), boxes: boxesOf(d, p) })
  const d0 = getData()
  for (const p of Object.values(d0.pages)) if (p.source?.via) snaps.set(p.id, take(d0, p))
  let lastPages = d0.pages
  const send = (via: string, op: Parameters<typeof api.conn.notionPush>[1]): void => {
    api.conn.notionPush(via, op).catch((e) => toast(`Could not send that to Notion: ${e?.message ?? e}`, { kind: 'error' }))
  }
  return useApp.subscribe((s) => {
    const d = s.data
    if (d.pages === lastPages) return
    lastPages = d.pages
    for (const p of Object.values(d.pages)) {
      const via = p.source?.via
      if (!via) continue
      const prev = snaps.get(p.id)
      if (prev && prev.ref === p) continue
      const next = take(d, p)
      snaps.set(p.id, next)
      // A refresh from Notion brings Notion's own values; nothing to send.
      if (!prev || prev.synced !== next.synced || p.deletedAt) continue
      for (const [nid, checked] of next.checks) if (prev.checks.has(nid) && prev.checks.get(nid) !== checked) send(via, { kind: 'todo', block: nid, checked })
      for (const [name, value] of Object.entries(next.boxes)) if (name in prev.boxes && prev.boxes[name] !== value) send(via, { kind: 'checkbox', page: p.source!.id, prop: name, value })
    }
  })
}

// ---------- keeping things fresh ----------

/** Started once by the app: refreshes feeds and Notion pages, and sends checks to Notion. */
export function startConnections(): () => void {
  void loadSecrets()
  const offWatch = watchNotionChecks()
  const tick = (): void => {
    const d = getData()
    if (workspaceQuiet(d)) return
    for (const c of d.connections) {
      const r = useFeeds.getState().results[c.id]
      if (!c.off && c.kind !== 'notion' && r && Date.now() - r.at >= (MAX_AGE[c.kind] ?? 14 * 60 * 1000)) void loadFeed(c, true)
    }
    notionTicks++
    if (notionTicks % 3) return
    const api = Object.values(d.pages).filter((p) => p.source?.via && !p.deletedAt && !p.rowOf && (!p.parentId || !d.pages[p.parentId]?.source)).map((p) => p.id)
    if (api.length && isDesktop) refreshFromNotion(api, true).catch(() => {})
  }
  let notionTicks = 0
  const first = setTimeout(() => {
    const d = getData()
    if (workspaceQuiet(d)) return
    const ids = Object.values(d.pages).filter((p) => p.source?.via && !p.deletedAt && !p.rowOf && (!p.parentId || !d.pages[p.parentId]?.source)).map((p) => p.id)
    if (ids.length && isDesktop) refreshFromNotion(ids, true).catch(() => {})
  }, 6000)
  const id = setInterval(tick, REFRESH)
  return () => { clearTimeout(first); clearInterval(id); offWatch() }
}

export const itemsOf = (r: FeedResult | undefined): FeedItem[] => r?.items ?? []

/** Closes a Todoist task; it leaves the list right away. */
export async function closeTodoist(connId: string, taskId: string): Promise<void> {
  useFeeds.setState((s) => {
    const r = s.results[connId]
    return r?.items ? { results: { ...s.results, [connId]: { ...r, items: r.items.filter((i) => i.id !== taskId) } } } : {}
  })
  try { await api.conn.todoistClose(connId, taskId) } catch (e: any) {
    toast(e?.message ?? 'Could not reach Todoist', { kind: 'error' })
    const c = getData().connections.find((x) => x.id === connId)
    if (c) void loadFeed(c, true)
  }
}

// ---------- now playing ----------
export const useMedia = create<{ state: MediaState; watchers: number }>(() => ({ state: { none: true }, watchers: 0 }))
let offMedia: (() => void) | null = null

/** What is playing in Windows; listens only while something shows it. */
export function useNowPlaying(): MediaState {
  useEffect(() => {
    if (!offMedia) offMedia = api.media.onState((s) => useMedia.setState({ state: s }))
    void api.media.watch(true)
    return () => { void api.media.watch(false) }
  }, [])
  return useMedia((s) => s.state)
}
