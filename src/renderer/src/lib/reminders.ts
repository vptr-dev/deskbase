// Reminders from @date mentions: "@2026-11-25 14:00" anywhere in a page notifies at that time;
// a to-do with a date and no time ("@2026-11-25") notifies at 9:00 that day until it is checked.
import type { AppData, Block, Page } from '../types'
import { api } from './api'
import { plainText } from './links'

const MENTION = /@(\d{4}-\d{2}-\d{2})(?: (\d{1,2}):(\d{2})(?![\d:]))?(?![\w-])/g
/** Reminders missed by up to this long (the app was closed or asleep) still come. */
const LATE = 15 * 60 * 1000
const FIRED_KEY = 'deskbase:reminders-fired'

export interface Reminder { key: string; at: number; pageId: string; text: string }

const cache = new WeakMap<Block[], Omit<Reminder, 'pageId'>[]>()

function remindersIn(page: Page): Omit<Reminder, 'pageId'>[] {
  const blocks = page.blocks ?? []
  const hit = cache.get(blocks)
  if (hit) return hit
  const out: Omit<Reminder, 'pageId'>[] = []
  const walk = (list: Block[]): void => {
    for (const b of list) {
      if (b.cols) b.cols.forEach(walk)
      if (!b.text || !b.text.includes('@')) continue
      if (b.type === 'todo' && b.checked) continue
      // matchAll works on its own copy of the pattern, so nothing below can restart the scan.
      const text = plainText(b.text.replace(MENTION, '')).replace(/\s+/g, ' ').trim()
      for (const m of b.text.matchAll(MENTION)) {
        const timed = m[2] !== undefined
        if (!timed && b.type !== 'todo') continue
        const [y, mo, d] = m[1].split('-').map(Number)
        const at = new Date(y, mo - 1, d, timed ? Number(m[2]) : 9, timed ? Number(m[3]) : 0).getTime()
        out.push({ key: `${b.id}@${m[0]}`, at, text })
      }
    }
  }
  walk(blocks)
  cache.set(blocks, out)
  return out
}

/** Every reminder in the workspace, soonest first. */
export function allReminders(d: AppData): Reminder[] {
  const out: Reminder[] = []
  for (const p of Object.values(d.pages)) if (!p.deletedAt && !p.template) for (const r of remindersIn(p)) out.push({ ...r, pageId: p.id })
  return out.sort((a, b) => a.at - b.at)
}

function fired(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(FIRED_KEY) ?? '[]')) } catch { return new Set() }
}

/** Shows the reminders that are due; called by the app's ticker. */
export function fireReminders(d: AppData): void {
  const now = Date.now()
  const due = allReminders(d).filter((r) => r.at <= now && r.at > now - LATE)
  if (!due.length) return
  const done = fired()
  let changed = false
  for (const r of due) {
    if (done.has(r.key)) continue
    done.add(r.key)
    changed = true
    const page = d.pages[r.pageId]
    api.notify(r.text || page?.title || 'Reminder', page ? `${page.title || 'Untitled'}${r.at < now - 60000 ? ' · ' + new Date(r.at).toTimeString().slice(0, 5) : ''}` : 'Reminder').catch(() => {})
  }
  if (changed) {
    const list = [...done].slice(-400)
    try { localStorage.setItem(FIRED_KEY, JSON.stringify(list)) } catch { /* private mode */ }
  }
}

