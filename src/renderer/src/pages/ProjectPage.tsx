import { useEffect, useRef, useState } from 'react'
import type { Page } from '../types'
import { toast, updatePage } from '../store'
import { api, isDesktop } from '../lib/api'
import { boardKey, type TrelloAccess, type TrelloBoard, type TrelloCard, type TrelloEdit } from '../../../shared/trello'
import { Button, ConfirmButton, Modal, Segmented } from '../components/ui'
import { TasksPage } from './TasksPage'

export function ProjectPage({ page }: { page: Page }): JSX.Element {
  const tab = page.view?.projectTab === 'trello' ? 'trello' : 'tasks'
  return <div className="project-page">
    <Segmented value={tab} options={[{ value: 'tasks', label: 'Project tasks' }, { value: 'trello', label: 'Trello board' }]}
      onChange={projectTab => updatePage(page.id, p => { p.view = { ...p.view, projectTab } })} />
    {tab === 'tasks' ? <TasksPage pageId={page.id} /> : <TrelloWorkspace page={page} />}
  </div>
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '') : 'Could not reach Trello.'
}

function ConnectBoard({ page, onClose, onConnected }: { page: Page; onClose: () => void; onConnected: (key: string, board: TrelloBoard) => void }): JSX.Element {
  const [address, setAddress] = useState(page.trelloBoard ? 'https://trello.com/b/' + page.trelloBoard : '')
  const [key, setKey] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const board = boardKey(address)
  const apiKey = key.trim()
  const validKey = /^[a-z\d]{32}$/i.test(apiKey)
  const submitting = useRef(false)
  const connect = async (): Promise<void> => {
    if (!board || !validKey || !token.trim() || submitting.current) return
    submitting.current = true; setBusy(true); setError('')
    try {
      const access: TrelloAccess = { key: apiKey, token: token.trim() }
      const result = await api.trello.connect(page.id, board, access)
      onConnected(board, result)
    } catch (e) { setError(errorText(e)) } finally { submitting.current = false; setBusy(false) }
  }
  return <Modal title="Connect Trello board" width={490} onClose={() => { if (!submitting.current) onClose() }}>
    <form className="project-form" onSubmit={e => { e.preventDefault(); void connect() }}>
      <div className="modal-body form">
        <label htmlFor="project-board-url">Board link</label>
        <input id="project-board-url" className="input" autoFocus placeholder="https://trello.com/b/…" value={address} onChange={e => setAddress(e.target.value)} />
        {address && !board && <small className="danger">Paste a board link containing /b/, or its eight-character short link.</small>}
        <div className="row between"><label htmlFor="project-api-key">Trello API key</label>
          <Button small kind="ghost" icon="external" onClick={() => api.openExternal('https://trello.com/apps/admin')}>Get API key</Button></div>
        <small className="muted">Open or create a Power-Up, then copy its key from Trello Auth.</small>
        <input id="project-api-key" className="input" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} />
        <div className="row between"><label htmlFor="project-token">Trello token</label>
          <Button small kind="ghost" icon="external" disabled={!validKey} onClick={() => {
            const params = new URLSearchParams({ key: apiKey, name: 'Deskbase', scope: 'read,write', expiration: '30days', response_type: 'token' })
            void api.openExternal('https://trello.com/1/authorize?' + params)
          }}>Authorize token</Button></div>
        <input id="project-token" className="input" type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} />
        <small className="muted">Paste the token Trello gives you. Creating and moving cards requires write access. Credentials stay encrypted on this computer.</small>
        {error && <p role="alert" className="danger">{error}</p>}
      </div>
      <div className="modal-foot"><div className="spacer" /><Button disabled={busy} onClick={onClose}>Cancel</Button><Button kind="primary" type="submit" disabled={busy || !board || !validKey || !token.trim()}>{busy ? 'Connecting…' : 'Connect board'}</Button></div>
    </form>
  </Modal>
}

type CardEditor = { kind: 'create'; list: string } | { kind: 'move'; card: TrelloCard }

function TrelloWorkspace({ page }: { page: Page }): JSX.Element {
  const key = page.trelloBoard
  const [data, setData] = useState<TrelloBoard | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [editor, setEditor] = useState<CardEditor | null>(null)
  const [title, setTitle] = useState('')
  const [destination, setDestination] = useState('')
  const [editError, setEditError] = useState('')
  const pending = useRef(false)
  const generation = useRef(0)
  const justConnected = useRef<string | undefined>(undefined)
  const refresh = async (board: string): Promise<void> => {
    const seq = ++generation.current
    setBusy(true); setError('')
    try {
      const boardData = await api.trello.read(page.id, board)
      if (seq === generation.current) setData(boardData)
    } catch (e) { if (seq === generation.current) setError(errorText(e)) }
    finally { if (seq === generation.current) setBusy(false) }
  }
  useEffect(() => {
    if (key && justConnected.current === key) justConnected.current = undefined
    else {
      setData(null); setError('')
      if (key && isDesktop) void refresh(key)
    }
    return () => { ++generation.current }
  }, [key, page.id])

  const disconnect = async (): Promise<void> => {
    if (pending.current) return
    pending.current = true; setBusy(true)
    try {
      await api.trello.disconnect(page.id)
      ++generation.current; setData(null); setError('')
      updatePage(page.id, p => { delete p.trelloBoard })
    } catch (e) { setError(errorText(e)) } finally { pending.current = false; setBusy(false) }
  }
  const saveCard = async (): Promise<void> => {
    if (!key || !editor || !destination || pending.current || (editor.kind === 'create' && !title.trim())) return
    pending.current = true; setBusy(true); setEditError('')
    const change: TrelloEdit = editor.kind === 'create' ? { kind: 'create', list: destination, name: title.trim() } : { kind: 'move', list: destination, card: editor.card.id }
    try {
      await api.trello.edit(page.id, key, change)
      setEditor(null); toast(change.kind === 'create' ? 'Card created in Trello' : 'Card moved in Trello')
      await refresh(key)
    } catch (e) { setEditError(errorText(e)) } finally { pending.current = false; setBusy(false) }
  }
  const openEditor = (value: CardEditor): void => {
    setTitle(''); setEditError(''); setDestination(value.kind === 'create' ? value.list : value.card.list); setEditor(value)
  }
  return <section className="project-trello">
    <div className="project-board-head">
      <div><h2>{data?.name || 'Trello board'}</h2>
        {!key && <p className="muted">{isDesktop ? 'Connect a board to see its lists and work on cards here.' : 'Open this project in the Windows app to connect a Trello board.'}</p>}
      </div>
      <div className="row wrap gap-sm">
        {key && <Button small icon="external" onClick={() => api.openExternal('https://trello.com/b/' + key)}>Open in Trello</Button>}
        {isDesktop && key && <Button small icon="refresh" disabled={busy} onClick={() => void refresh(key)}>{busy ? 'Working…' : 'Refresh'}</Button>}
        {isDesktop && <Button small kind={key ? 'ghost' : 'primary'} icon="plug" disabled={busy} onClick={() => setConnecting(true)}>{key ? 'Connection' : 'Connect board'}</Button>}
        {key && isDesktop && !busy && <ConfirmButton label="Unlink" confirmLabel="Unlink board" icon="unlink" onConfirm={() => void disconnect()} />}
      </div>
    </div>
    {error && <p role="alert" className="danger">{error}</p>}
    {data && (!data.lists.length ? <p className="muted">This board has no open lists. Add a list in Trello to start creating cards here.</p> :
      <div className="project-columns" role="region" aria-label="Trello lists" tabIndex={0}>
        {data.lists.map(list => {
          const cards = data.cards.filter(c => c.list === list.id)
          return <section className="project-column glass" key={list.id}>
            <div className="project-column-head"><h3>{list.name}</h3><span className="muted small">{cards.length}</span></div>
            {cards.map(card => <div key={card.id} className="project-card">
              <button className="project-card-title" disabled={!card.shortLink} title="Open card in Trello" onClick={() => api.openExternal('https://trello.com/c/' + card.shortLink)}>{card.name}</button>
              <div className="row between">
                <span className="small muted">{card.due && (card.done ? 'Completed · ' : 'Due ') + new Date(card.due).toLocaleDateString()}</span>
                {data.lists.length > 1 && <button className="project-move" disabled={busy} aria-label={'Move ' + card.name} onClick={() => openEditor({ kind: 'move', card })}>Move</button>}
              </div>
            </div>)}
            <Button small kind="ghost" icon="plus" disabled={busy} onClick={() => openEditor({ kind: 'create', list: list.id })}>Add card</Button>
          </section>
        })}
      </div>)}
    {connecting && <ConnectBoard page={page} onClose={() => setConnecting(false)} onConnected={(board, value) => {
      ++generation.current; justConnected.current = board !== key ? board : undefined; setData(value); setError(''); setBusy(false); setConnecting(false)
      updatePage(page.id, p => { p.trelloBoard = board })
    }} />}
    {editor && data && <Modal title={editor.kind === 'create' ? 'Create Trello card' : 'Move Trello card'} width={440} onClose={() => { if (!pending.current) setEditor(null) }}>
      <form className="project-form" onSubmit={e => { e.preventDefault(); void saveCard() }}>
        <div className="modal-body form">
          {editor.kind === 'create' ? <><label htmlFor="project-card-name">Card title</label>
            <input id="project-card-name" autoFocus className="input" maxLength={16384} value={title} onChange={e => setTitle(e.target.value)} /></> : <strong>{editor.card.name}</strong>}
          <label htmlFor="project-list">List</label><select id="project-list" className="input" value={destination} onChange={e => setDestination(e.target.value)}>{data.lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          {editError && <p role="alert" className="danger">{editError}</p>}
        </div>
        <div className="modal-foot"><div className="spacer" /><Button disabled={busy} onClick={() => setEditor(null)}>Cancel</Button>
          <Button type="submit" kind="primary" disabled={busy || (editor.kind === 'create' ? !title.trim() : destination === editor.card.list)}>{busy ? 'Saving…' : editor.kind === 'create' ? 'Create card' : 'Move card'}</Button></div>
      </form>
    </Modal>}
  </section>
}
