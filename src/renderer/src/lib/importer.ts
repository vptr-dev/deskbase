import type { ImportPage, ImportResult } from '../../../shared/import-types'
import { emojiToIcon } from '../../../shared/emoji-icons'
import type { AppData, Block, Page } from '../types'
import { act, getData, openPage, toast } from '../store'
import { api } from './api'
import { newPage, typeInfo } from './defaults'
import { uid } from './util'

const iconFor = (ip: ImportPage): string => (ip.icon ? emojiToIcon(ip.icon, typeInfo(ip.type).icon) : ip.type === 'doc' ? 'file-text' : typeInfo(ip.type).icon)

function addTasks(d: AppData, pageId: string, ip: ImportPage): void {
  ;(ip.tasks ?? []).forEach((t, i) => {
    const id = uid()
    d.tasks[id] = {
      id, pageId, title: t.title, notes: t.notes ?? '', status: t.done ? 'done' : 'todo', done: t.done,
      doneAt: t.done ? Date.now() : null, createdAt: Date.now(), due: t.due ?? null, time: null, priority: 0,
      difficulty: 'easy', stat: null, tags: t.tags, subtasks: [], repeat: 'none', order: i
    }
    for (const tag of t.tags) if (!d.tags[tag]) d.tags[tag] = '#8e8e93'
  })
}

function addPage(d: AppData, ip: ImportPage, parent: string | null): string {
  const p: Page = newPage(ip.type, ip.title, parent)
  p.icon = iconFor(ip)
  p.blocks = ip.blocks.length ? ip.blocks.map((b) => ({ ...b, id: uid() })) : p.blocks
  p.expanded = false
  if (ip.notionId) p.source = { kind: 'notion', id: ip.notionId, syncedAt: Date.now() }
  d.pages[p.id] = p
  if (parent) d.pages[parent].children.push(p.id)
  else d.rootOrder.push(p.id)
  addTasks(d, p.id, ip)
  for (const c of ip.children) addPage(d, c, p.id)
  return p.id
}

/** Adds an imported page tree to the store. Returns the id of the first top-level page. */
export function applyImport(result: ImportResult, parentId: string | null = null): string | null {
  let first: string | null = null
  act((d) => {
    for (const ip of result.pages) {
      const id = addPage(d, ip, parentId)
      if (!first) first = id
    }
  })
  if (first) openPage(first)
  return first
}

const norm = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase()

/** New blocks from Notion, keeping to-dos you checked off here checked. */
function mergeBlocks(old: Block[], next: Block[]): Block[] {
  const checked = new Set(old.filter((b) => b.type === 'todo' && b.checked).map((b) => norm(b.text)))
  const open = new Map(old.filter((b) => b.type === 'toggle').map((b) => [norm(b.text), b.open]))
  return next.map((b) => ({
    ...b,
    id: uid(),
    ...(b.type === 'todo' && !b.checked && checked.has(norm(b.text)) ? { checked: true } : {}),
    ...(b.type === 'toggle' && open.has(norm(b.text)) ? { open: open.get(norm(b.text)) } : {})
  }))
}

function updateTree(d: AppData, pageId: string, ip: ImportPage): number {
  const p = d.pages[pageId]
  if (!p) return 0
  let n = 1
  p.title = ip.title || p.title
  if (ip.icon) p.icon = iconFor(ip)
  if (p.type === 'doc' && ip.type === 'doc') p.blocks = mergeBlocks(p.blocks, ip.blocks.length ? ip.blocks : [{ id: uid(), type: 'p', text: '' }])
  if (ip.tasks && p.type === 'tasks') {
    const have = new Set(Object.values(d.tasks).filter((t) => t.pageId === pageId).map((t) => norm(t.title)))
    addTasks(d, pageId, { ...ip, tasks: ip.tasks.filter((t) => !have.has(norm(t.title))) })
  }
  p.source = { kind: 'notion', id: ip.notionId ?? p.source?.id ?? '', syncedAt: Date.now() }
  p.updatedAt = Date.now()
  const byNotion = new Map(p.children.filter((c) => d.pages[c]?.source?.id).map((c) => [d.pages[c].source!.id, c]))
  for (const child of ip.children) {
    const existing = child.notionId ? byNotion.get(child.notionId) : undefined
    if (existing) n += updateTree(d, existing, child)
    else { addPage(d, child, pageId); n++ }
  }
  return n
}

/** Re-reads pages imported from the Notion app. Returns how many pages were updated. */
export async function refreshFromNotion(pageIds?: string[], quiet = false): Promise<number> {
  const d0 = getData()
  // Only top-most synced pages; their subpages update with them.
  const synced = Object.values(d0.pages).filter((p) => p.source?.kind === 'notion' && !p.deletedAt && (!p.parentId || !d0.pages[p.parentId]?.source))
  const targets = pageIds ? pageIds.map((id) => d0.pages[id]).filter((p): p is Page => Boolean(p?.source)) : synced
  if (!targets.length) return 0
  if (!(await api.notion.available())) { if (!quiet) toast('The Notion app was not found on this computer', { kind: 'error' }); return 0 }
  const res = await api.notion.importPages(targets.map((p) => p.source!.id))
  let n = 0
  act((d) => {
    for (const ip of res.pages) {
      const target = targets.find((p) => p.source!.id === ip.notionId)
      if (target) n += updateTree(d, target.id, ip)
    }
  }, { history: false })
  if (!quiet) toast(n ? `Updated ${n} page${n === 1 ? '' : 's'} from Notion` : 'Nothing to update from Notion')
  return n
}

export function describeImport(r: ImportResult): string {
  const s = r.stats
  const parts = [`${s.pages} page${s.pages === 1 ? '' : 's'}`, `${s.blocks} blocks`]
  if (s.todos) parts.push(`${s.todos} to-dos`)
  if (s.tasks) parts.push(`${s.tasks} database rows as tasks`)
  if (s.tables) parts.push(`${s.tables} tables`)
  return parts.join(', ')
}
