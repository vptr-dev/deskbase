import { useEffect, useState } from 'react'
import { setOverlay, useApp, useData } from '../store'
import { api, type PageVersion } from '../lib/api'
import { restoreVersion } from '../lib/history'
import { plainText } from '../lib/links'
import type { Block } from '../types'
import { flatBlocks } from './Widgets'
import { Button, Empty, Modal } from './ui'
import { Glyph } from './Icon'

/** A plain look at a version's blocks. */
function VersionText({ blocks }: { blocks: Block[] }): JSX.Element {
  const list = flatBlocks(blocks)
  return (
    <div className="version-text">
      {list.map((b) => {
        const t = plainText(b.text ?? '')
        if (b.type === 'divider') return <hr key={b.id} />
        if (/^h1|toggle-h1/.test(b.type)) return <h2 key={b.id}>{t}</h2>
        if (/^h[23]|toggle-h[23]/.test(b.type)) return <h4 key={b.id}>{t}</h4>
        if (b.type === 'todo') return <div key={b.id} className="version-todo">{b.checked ? '☑' : '☐'} {t}</div>
        if (b.type === 'bullet' || b.type === 'number') return <div key={b.id} className="version-li">• {t}</div>
        if (!t) return null
        return <p key={b.id}>{t}</p>
      })}
    </div>
  )
}

export function HistoryDialog(): JSX.Element {
  const arg = useApp((s) => s.overlayArg) as { pageId: string } | null
  const page = useData((d) => (arg ? d.pages[arg.pageId] : undefined))
  const [list, setList] = useState<PageVersion[] | null>(null)
  const [pick, setPick] = useState(0)
  useEffect(() => { if (arg) api.history.list(arg.pageId).then((l) => setList([...l].reverse())).catch(() => setList([])) }, [arg?.pageId])
  const v = list?.[pick]
  return (
    <Modal onClose={() => setOverlay(null)} width={860} className="history">
      <div className="modal-head"><h3>Page history</h3></div>
      {!page || !list ? <div className="modal-body muted">…</div> : list.length === 0 ? (
        <div className="modal-body"><Empty icon="history" title="No earlier versions yet" /></div>
      ) : (
        <div className="history-layout">
          <div className="history-list">
            {list.map((x, i) => (
              <button key={x.at + ':' + i} className={pick === i ? 'active' : ''} onClick={() => setPick(i)}>
                <span className="strong">{new Date(x.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                <span className="muted small ellipsis">{x.title || 'Untitled'}</span>
              </button>
            ))}
          </div>
          <div className="history-view">
            {v && <>
              <div className="row between gap-sm history-head">
                <span className="row gap-sm min0"><Glyph value={v.icon} fallback="file-text" size={16} /><span className="strong ellipsis">{v.title || 'Untitled'}</span></span>
                <Button small kind="primary" icon="restore" onClick={async () => { await restoreVersion(page.id, v); setOverlay(null) }}>Restore this version</Button>
              </div>
              <div className="history-body"><VersionText blocks={v.blocks as Block[]} /></div>
            </>}
          </div>
        </div>
      )}
    </Modal>
  )
}
