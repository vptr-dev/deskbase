import type { AppData, Widget, DeskWidget } from '../types'
import { act, getData } from '../store'
import { newPage } from './defaults'

export interface WidgetSource { page: string | null; id: string }

export function sourceWidget(d: AppData, source: WidgetSource): Widget | DeskWidget | undefined {
  if (!source.page) return d.desktop.widgets.find(w => w.id === source.id)
  const p = d.pages[source.page]
  return p && !p.deletedAt ? p.widgets?.find(w => w.id === source.id) : undefined
}

export function ensureTaskPlanner(preferred?: string): string {
  const data = getData()
  const p = preferred ? data.pages[preferred] : undefined
  if (p && !p.deletedAt && ['tasks','board','project'].includes(p.type)) return p.id
  const first = Object.values(data.pages).find(p => !p.deletedAt && p.type === 'tasks')
  if (first) return first.id
  const page = newPage('tasks', 'To-do list')
  act(d => { d.pages[page.id] = page; d.rootOrder.push(page.id) })
  return page.id
}
