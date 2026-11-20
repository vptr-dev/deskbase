// Page history: before a page is edited, the way it was is kept as a version (at most one every
// ten minutes per page, so an editing session makes one version). Versions are stored by the main
// process next to the data file.
import { act, getData, toast, useApp } from '../store'
import { api, type PageVersion } from './api'

const SPAN = 10 * 60 * 1000
const last = new Map<string, number>()

export function watchHistory(): () => void {
  let prev = getData().pages
  return useApp.subscribe((s) => {
    const pages = s.data.pages
    if (pages === prev) return
    const old = prev
    prev = pages
    const now = Date.now()
    for (const id in pages) {
      const a = old[id]
      const b = pages[id]
      if (!a || a === b || (a.blocks === b.blocks && a.title === b.title) || b.deletedAt) continue
      if (now - (last.get(id) ?? 0) < SPAN) continue
      last.set(id, now)
      void api.history.save(id, { at: a.updatedAt || now, title: a.title, icon: a.icon, blocks: a.blocks }).catch(() => {})
    }
  })
}

/** Puts a page back the way it was; the current state is kept as a version first. */
export async function restoreVersion(pageId: string, v: PageVersion): Promise<void> {
  const p = getData().pages[pageId]
  if (!p) return
  await api.history.save(pageId, { at: Date.now(), title: p.title, icon: p.icon, blocks: p.blocks }).catch(() => {})
  last.set(pageId, Date.now())
  act((d) => { const x = d.pages[pageId]; if (!x) return; x.blocks = structuredClone(v.blocks); x.title = v.title; x.updatedAt = Date.now() })
  toast('Page restored', { undo: true })
}
