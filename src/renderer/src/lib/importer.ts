import type { ImportPage, ImportResult } from '../../../shared/import-types'
import type { Page } from '../types'
import { act, openPage } from '../store'
import { newPage } from './defaults'
import { uid } from './util'

/** Adds an imported page tree to the store. Returns the id of the first top-level page. */
export function applyImport(result: ImportResult, parentId: string | null = null): string | null {
  let first: string | null = null
  act((d) => {
    const add = (ip: ImportPage, parent: string | null): string => {
      const p: Page = newPage(ip.type, ip.title, parent)
      p.icon = ip.icon || (ip.type === 'doc' ? '📄' : p.icon)
      p.blocks = ip.blocks.length ? ip.blocks.map((b) => ({ ...b, id: uid() })) : p.blocks
      p.expanded = false
      d.pages[p.id] = p
      if (parent) d.pages[parent].children.push(p.id)
      else d.rootOrder.push(p.id)
      ;(ip.tasks ?? []).forEach((t, i) => {
        const id = uid()
        d.tasks[id] = {
          id, pageId: p.id, title: t.title, notes: t.notes ?? '', status: t.done ? 'done' : 'todo', done: t.done,
          doneAt: t.done ? Date.now() : null, createdAt: Date.now(), due: t.due ?? null, time: null, priority: 0,
          difficulty: 'easy', stat: null, tags: t.tags, subtasks: [], repeat: 'none', order: i
        }
        for (const tag of t.tags) if (!d.tags[tag]) d.tags[tag] = '#8e8e93'
      })
      for (const c of ip.children) add(c, p.id)
      return p.id
    }
    for (const ip of result.pages) {
      const id = add(ip, parentId)
      if (!first) first = id
    }
  })
  if (first) openPage(first)
  return first
}

export function describeImport(r: ImportResult): string {
  const s = r.stats
  const parts = [`${s.pages} page${s.pages === 1 ? '' : 's'}`, `${s.blocks} blocks`]
  if (s.todos) parts.push(`${s.todos} to-dos`)
  if (s.tasks) parts.push(`${s.tasks} database rows as tasks`)
  if (s.tables) parts.push(`${s.tables} tables`)
  return parts.join(', ')
}
