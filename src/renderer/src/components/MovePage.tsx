import { useMemo, useState } from 'react'
import { descendants, movePage, setOverlay, useApp, useData } from '../store'
import { typeInfo } from '../lib/defaults'
import type { AppData } from '../types'
import { Modal } from './ui'
import { Glyph, Icon } from './Icon'

export function pagePath(d: AppData, id: string): string {
  const parts: string[] = []
  let p = d.pages[id]?.parentId
  while (p && d.pages[p]) { parts.unshift(d.pages[p].title || 'Untitled'); p = d.pages[p].parentId }
  return parts.join(' / ')
}

/** "Move to…" picker: choose a new parent page (or the top level). */
export function MovePageDialog(): JSX.Element | null {
  const id = useApp((s) => s.overlayArg?.pageId as string | undefined)
  const data = useData((d) => d)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const page = id ? data.pages[id] : null
  const targets = useMemo(() => {
    if (!id) return []
    const blocked = new Set([id, ...descendants(data, id)])
    const list = Object.values(data.pages)
      .filter((p) => !p.deletedAt && !p.rowOf && !blocked.has(p.id) && p.id !== data.pages[id]?.parentId)
      .filter((p) => !q || (p.title || 'Untitled').toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 40)
      .map((p) => ({ id: p.id as string | null, title: p.title || 'Untitled', icon: p.icon || typeInfo(p.type).icon, path: pagePath(data, p.id) }))
    const root = data.pages[id]?.parentId && (!q || 'top level'.includes(q.toLowerCase())) ? [{ id: null, title: 'Top level', icon: '', path: '' }] : []
    return [...root, ...list]
  }, [data, id, q])
  if (!page || !id) return null
  const close = (): void => setOverlay(null)
  const choose = (target: string | null): void => {
    const d = useApp.getState().data
    movePage(id, target, target ? d.pages[target].children.length : d.rootOrder.length)
    close()
  }
  return (
    <Modal onClose={close} width={460} className="palette">
      <div className="palette-input">
        <Icon name="folder" size={16} className="muted" />
        <input id="move-search" autoFocus placeholder={`Move “${page.title || 'Untitled'}” to…`} value={q}
          onChange={(e) => { setQ(e.target.value); setSel(0) }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(targets.length - 1, s + 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)) }
            if (e.key === 'Enter' && targets[sel]) choose(targets[sel].id)
          }} />
      </div>
      <div className="palette-list">
        {targets.length === 0 && <div className="muted small pad">No pages found</div>}
        {targets.map((t, i) => (
          <button key={t.id ?? 'root'} className={`palette-item ${i === sel ? 'active' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => choose(t.id)}>
            <span className="palette-icon">{t.icon ? <Glyph value={t.icon} size={15} /> : <Icon name="home" size={15} />}</span>
            <span className="grow ellipsis">{t.title}</span>
            {t.path && <span className="muted small ellipsis move-path">{t.path}</span>}
          </button>
        ))}
      </div>
    </Modal>
  )
}
