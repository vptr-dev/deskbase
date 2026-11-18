import { useEffect, useMemo, useState } from 'react'
import { setOverlay, toast } from '../store'
import { api, isDesktop } from '../lib/api'
import { applyImport, describeImport } from '../lib/importer'
import type { ImportResult, NotionPageInfo } from '../../../shared/import-types'
import { Button, Empty, Modal } from './ui'
import { Icon } from './Icon'

export function NotionImportDialog(): JSX.Element {
  const [available, setAvailable] = useState<boolean | null>(null)
  const [pages, setPages] = useState<NotionPageInfo[]>([])
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  useEffect(() => {
    api.notion.available().then(async (ok) => {
      setAvailable(ok)
      if (ok) {
        try { setPages(await api.notion.list()) } catch (e: any) { toast(e?.message ?? 'Could not read Notion', { kind: 'error' }) }
      }
    })
  }, [])

  const shown = useMemo(() => pages.filter((p) => !q || (p.title + ' ' + p.parent).toLowerCase().includes(q.toLowerCase())), [pages, q])
  const toggle = (id: string): void => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const finish = (r: ImportResult | null): void => {
    if (!r) return
    if (!r.pages.length) { toast(r.warnings[0] ?? 'Nothing to import', { kind: 'error' }); return }
    applyImport(r)
    setResult(r)
  }

  const fromApp = async (): Promise<void> => {
    setBusy(true)
    try { finish(await api.notion.importPages([...picked])) } catch (e: any) { toast(e?.message ?? 'Import failed', { kind: 'error' }) } finally { setBusy(false) }
  }
  const fromExport = async (): Promise<void> => {
    setBusy(true)
    try { finish(await api.notion.importExport()) } catch (e: any) { toast(e?.message ?? 'Import failed', { kind: 'error' }) } finally { setBusy(false) }
  }

  return (
    <Modal onClose={() => setOverlay(null)} width={560}>
      <div className="modal-head"><h3>Import from Notion</h3></div>
      <div className="modal-body">
        {result ? (
          <div className="import-done">
            <div className="row gap-sm"><Icon name="check" size={18} className="accent" /><span className="strong">Imported {describeImport(result)}.</span></div>
            {result.warnings.map((w, i) => <p key={i} className="muted small">{w}</p>)}
          </div>
        ) : (
          <>
            {isDesktop && available && (
              <>
                <div className="section-label">From the Notion app on this computer</div>
                <div className="search-mini wide"><Icon name="search" size={14} /><input id="notion-q" autoFocus placeholder="Find a page" value={q} onChange={(e) => setQ(e.target.value)} /></div>
                <div className="notion-list">
                  {shown.map((p) => (
                    <label key={p.id} className={`notion-row ${picked.has(p.id) ? 'on' : ''}`}>
                      <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
                      <span className="notion-icon">{p.icon || (p.kind === 'database' ? '🗂️' : '📄')}</span>
                      <span className="grow ellipsis">{p.title}</span>
                      {p.parent && <span className="muted small ellipsis">in {p.parent}</span>}
                    </label>
                  ))}
                  {shown.length === 0 && <div className="muted small pad">No pages found</div>}
                </div>
                <p className="muted small">Subpages and databases inside the pages you pick come along.</p>
              </>
            )}
            {isDesktop && available === false && <Empty icon="📦" title="The Notion app isn't installed here" />}
            {!isDesktop && <p className="muted">Notion import is available in the desktop app.</p>}
            <div className="section-label mt">From a Notion export</div>
            <p className="muted small">In Notion: ••• → Export → Markdown & CSV. Then choose the .zip here.</p>
          </>
        )}
      </div>
      <div className="modal-foot">
        {result ? <><div className="spacer" /><Button kind="primary" onClick={() => setOverlay(null)}>Done</Button></> : (
          <>
            <Button icon="upload" disabled={busy || !isDesktop} onClick={fromExport}>Choose export…</Button>
            <div className="spacer" />
            <Button onClick={() => setOverlay(null)}>Cancel</Button>
            <Button kind="primary" disabled={busy || picked.size === 0} onClick={fromApp}>{busy ? 'Importing…' : `Import ${picked.size || ''}`.trim()}</Button>
          </>
        )}
      </div>
    </Modal>
  )
}
