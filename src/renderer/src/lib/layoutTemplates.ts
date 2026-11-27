import type { AppData, Block, ButtonAction, DeskWidget, Page } from '../types'
import { act, getData } from '../store'
import { newPage } from './defaults'
import { uid } from './util'

export type TemplateMode = 'linked' | 'fresh'
type PanelConfig = Record<string, any>

// A single copy table per layout keeps two widgets pointed at the same new planner.
function layoutCopier(snapshot: AppData, d: AppData, mode: TemplateMode) {
  const pages = new Map<string, string>()
  const metrics = new Map<string, string>()
  const defaults = new Map<string, string>()
  function source(id: string, parent: string | null): string {
    if (!id || mode === 'linked' || !snapshot.pages[id] || snapshot.pages[id].deletedAt) return id
    return pages.get(id) ?? copyPage(id, parent)
  }
  function action(a: ButtonAction | undefined, parent: string | null): void {
    if (!a) return
    if (a.pageId) a.pageId = source(a.pageId, parent)
    if (a.kind === 'page') a.target = source(a.target, parent)
    a.then?.forEach(step => action(step, parent))
  }
  function config(c: PanelConfig, parent: string | null, type: DeskWidget['type']): void {
    if(Array.isArray(c.extraSources))c.extraSources=c.extraSources.map((id:string)=>source(id,parent))
    if(Array.isArray(c.extraPages))c.extraPages=c.extraPages.map((id:string)=>source(id,parent))
    if (mode === 'fresh' && !c.pageId && ['tasks','quickadd','wishlist','list','study','reading','workout'].includes(type)) {
      const kind = type === 'reading' || type === 'workout' || type === 'study' || type === 'list' || type === 'wishlist' ? type : 'tasks'
      const original = Object.values(snapshot.pages).find(p => p.type === kind && !p.deletedAt)
      if (original) c.pageId = original.id
      else {
        if (!defaults.has(kind)) {
          const p = newPage(kind, undefined, parent)
          d.pages[p.id] = p; (parent ? d.pages[parent].children : d.rootOrder).push(p.id); defaults.set(kind, p.id)
        }
        c.pageId = defaults.get(kind)
      }
    }
    if (mode === 'fresh' && type === 'tracker' && !c.metricId) c.metricId = Object.values(snapshot.metrics).find(m => snapshot.pages[m.pageId] && !snapshot.pages[m.pageId].deletedAt)?.id
    for (const key of ['pageId', 'dbId', 'sourcePageId']) if (c[key]) c[key] = source(c[key], parent)
    if (mode === 'fresh' && snapshot.metrics[c.metricId]) {
      source(snapshot.metrics[c.metricId].pageId, parent)
      c.metricId = metrics.get(c.metricId) ?? c.metricId
    }
    action(c.action, parent); action(c.footerButton?.action, parent)
  }
  function copyPage(id: string, parent: string | null, title?: string): string {
    const old = snapshot.pages[id]
    const newId = uid()
    pages.set(id, newId)
    const now = Date.now()
    const p: Page = { ...structuredClone(old), id: newId, title: title || old.title, parentId: parent, children: [],
      template: undefined, createdAt: now, updatedAt: now, source: null, favorite: false, rowOf: null, props: undefined }
    d.pages[newId] = p
    if(mode==="fresh"&&Array.isArray(p.view?.sourceIds))p.view.sourceIds=p.view.sourceIds.map((id:string)=>source(id,parent))
    if (parent && d.pages[parent]) d.pages[parent].children.push(newId)
    else d.rootOrder.push(newId)
    // Block ids are scoped to a page. Keeping them preserves references to the copied toggles.
    if (mode === 'fresh') {
      if (p.wishlist) p.wishlist.items = []
      if(p.workouts)p.workouts=[]
      if (p.entries) p.entries = p.entries.map(e=>({...e,done:0}))
      if (p.cards) p.cards = p.cards.map(c=>({...c,interval:0,due:''}))
      for (const m of Object.values(snapshot.metrics).filter(m => m.pageId === id)) {
        const mid = uid(); metrics.set(m.id, mid)
        d.metrics[mid] = { ...structuredClone(m), id: mid, pageId: newId, entries: [] }
      }
      for (const h of Object.values(snapshot.habits).filter(h => h.pageId === id)) {
        const hid = uid(); d.habits[hid] = { ...structuredClone(h), id: hid, pageId: newId, log: {} }
      }
    }
    const walk = (blocks: Block[]): void => {
      for (const b of blocks) {
        if ((b.type === 'tool' || b.type === 'database') && b.ref) b.ref = source(b.ref, newId)
        if (b.type === 'todo' && mode === 'fresh') b.checked = false
        if (b.action?.kind === 'toggle' && b.action.pageId === id) b.action.pageId = newId
        action(b.action, newId); b.cols?.forEach(walk)
      }
    }
    walk(p.blocks)
    for (const w of p.widgets ?? []) { w.id = uid(); config(w.config, newId, w.type) }
    if (p.db && mode === 'fresh') for (const row of Object.values(snapshot.pages).filter(r => r.rowOf === id && r.template && !r.deletedAt)) {
      const rid = uid(); d.pages[rid] = { ...structuredClone(row), id: rid, parentId: null, rowOf: newId, children: [], createdAt: now, updatedAt: now }
    }
    return newId
  }
  return { copyPage, config }
}

export function createFromPageLayout(templateId: string, parent: string | null, title: string | undefined, mode: TemplateMode): string {
  const snapshot = getData()
  let id = ''
  act(d => {
    const page = snapshot.pages[templateId]
    const copier = layoutCopier(snapshot, d, mode)
    id = copier.copyPage(templateId, parent, title)
    if (mode === 'linked' && !['doc','dashboard'].includes(page.type)) {
      const copy = d.pages[id]
      copy.type = 'doc'; delete copy.db; delete copy.wishlist
      copy.blocks = [{ id: uid(), type: page.type === 'database' ? 'database' : 'tool', text: '', ref: page.id }]
    }
  })
  return id
}

export function savePanelLayout(name: string): void {
  const desktop = getData().desktop
  const panels = structuredClone(desktop.widgets.filter(w => w.space === desktop.active))
  act(d => {
    d.desktop.templates ??= []
    d.desktop.templates.push({ id: uid(), name: name.trim(), panels })
  })
}

export function createFromPanelLayout(templateId: string, name: string, mode: TemplateMode): void {
  const snapshot = getData()
  const template = snapshot.desktop.templates?.find(t => t.id === templateId)
  if (!template) return
  act(d => {
    const space = uid(), groups = new Map<string, string>()
    d.desktop.spaces.push({ id: space, name: name.trim() || template.name, icon: 'layout' })
    const copier = layoutCopier(snapshot, d, mode)
    for (const original of template.panels) {
      const w: DeskWidget = structuredClone(original)
      w.id = uid(); w.space = space; w.createdAt = Date.now()
      if (w.group) { if (!groups.has(w.group)) groups.set(w.group, uid()); w.group = groups.get(w.group) }
      copier.config(w.config, null, w.type); d.desktop.widgets.push(w)
    }
    d.desktop.active = space; d.desktop.enabled = true
  })
}
