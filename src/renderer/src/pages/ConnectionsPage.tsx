import { useEffect, useState } from 'react'
import { act, getData, openPage, toast, useData } from '../store'
import type { Connection, ConnectionKind } from '../types'
import type { NotionPageInfo } from '../../../shared/import-types'
import { MAIL_PRESETS, mailPreset, repoOf } from '../../../shared/feeds'
import { api, isDesktop } from '../lib/api'
import { CONN_COLORS, CONN_INFO, addConnection, loadFeed, notionPagesOf, useCalendarEvents, patchConnection, removeConnection, setSecret, useFeed, useFeeds } from '../lib/connections'
import { refreshFromNotion, syncFromNotionApi } from '../lib/importer'
import { timeAgo } from '../lib/util'
import { Button, ColorDots, ConfirmButton, Toggle } from '../components/ui'
import { Glyph, Icon } from '../components/Icon'
import { EventRow, FeedRow } from '../components/PanelKit5'

const KINDS: ConnectionKind[] = ['calendar', 'mail', 'todoist', 'rss', 'github', 'notion']

const KEY_LINKS: Partial<Record<ConnectionKind, { url: string; label: string }>> = {
  notion: { url: 'https://www.notion.so/profile/integrations', label: 'Create an integration' },
  github: { url: 'https://github.com/settings/personal-access-tokens/new', label: 'Create a token' },
  todoist: { url: 'https://app.todoist.com/app/settings/integrations/developer', label: 'Find your token' }
}

const ADDRESS_HINT: Partial<Record<ConnectionKind, string>> = {
  calendar: 'Google: calendar settings → Secret address in iCal format. Outlook: Settings → Calendar → Shared calendars → Publish → ICS. Apple: share the calendar as Public.',
  rss: 'A feed address, like https://example.com/feed'
}

function Field({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }): JSX.Element {
  return <div className="set-row"><div className="set-label"><div>{label}</div>{sub && <div className="muted small">{sub}</div>}</div><div className="set-control">{children}</div></div>
}

function statusOf(c: Connection, r: ReturnType<typeof useFeed>['result'], busy: boolean, notionPages: number): { text: string; bad?: boolean } {
  if (c.off) return { text: 'Paused' }
  if (busy) return { text: 'Checking…' }
  if (c.kind === 'notion') {
    if (r && !r.ok) return { text: r.error ?? 'Could not reach Notion', bad: true }
    return { text: notionPages ? `${notionPages} page${notionPages === 1 ? '' : 's'} in sync` : r?.ok ? r.title ?? 'Connected' : 'Not set up' }
  }
  if (!r) return { text: c.url || c.repos.length || c.account?.user ? '' : 'Not set up' }
  if (!r.ok) return { text: r.error ?? 'Could not load it', bad: true }
  const n = c.kind === 'calendar' ? `${r.events?.length ?? 0} events` : c.kind === 'github' ? `${r.items?.length ?? 0} open` : c.kind === 'mail' ? `${r.unread ?? 0} unread` : c.kind === 'todoist' ? `${r.items?.length ?? 0} tasks` : `${r.items?.length ?? 0} posts`
  return { text: `${n} · checked ${timeAgo(r.at)}` }
}

function SecretField({ c, label }: { c: Connection; label: string }): JSX.Element {
  const has = useFeeds((s) => s.secrets.includes(c.id))
  const [val, setVal] = useState('')
  const pw = c.kind === 'mail' ? mailPreset(c.account?.preset).passwordUrl : undefined
  const link = pw ? { url: pw, label: 'Create an app password' } : KEY_LINKS[c.kind]
  const save = async (v: string | null): Promise<void> => { await setSecret(c.id, v); setVal(''); void loadFeed(c, true) }
  return (
    <Field label={label} sub={has ? 'Saved and encrypted on this computer' : c.kind === 'github' ? 'Needed for private repositories and for what is assigned to you' : 'Stored encrypted on this computer, never in exports'}>
      <input type="password" className="input input-sm w-220" placeholder={has ? '••••••••••••' : 'Paste it here'} value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && val.trim()) void save(val.trim()) }} />
      <Button small disabled={!val.trim()} onClick={() => save(val.trim())}>Save</Button>
      {has && <Button small kind="ghost" onClick={() => save(null)}>Remove</Button>}
      {link && !has && <Button small kind="ghost" icon="external" onClick={() => api.openExternal(link.url)}>{link.label}</Button>}
    </Field>
  )
}

function Preview({ c }: { c: Connection }): JSX.Element | null {
  const { result } = useFeed(c.id)
  const events = useCalendarEvents([c.id])
  if (c.kind === 'calendar') {
    const now = Date.now()
    const next = events.filter((e) => e.at + 3600000 > now || e.allDay).slice(0, 4)
    if (!next.length) return null
    return <div className="conn-preview">{next.map((e) => <EventRow key={e.id} e={e} showDay />)}</div>
  }
  const items = (result?.items ?? []).slice(0, 4)
  if (!items.length) return null
  return <div className="conn-preview">{items.map((i) => <FeedRow key={i.id} item={i} kind={c.kind} connId={c.id} />)}</div>
}

function NotionPages({ c }: { c: Connection }): JSX.Element {
  const has = useFeeds((s) => s.secrets.includes(c.id))
  const synced = useData((d) => notionPagesOf(d, c.id))
  const here = useData((d) => Object.values(d.pages).filter((p) => p.source?.via === c.id && !p.deletedAt).map((p) => p.source!.id).join(','))
  const ids = new Set(here.split(','))
  const [list, setList] = useState<NotionPageInfo[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const find = async (): Promise<void> => {
    setBusy('list')
    try { setList(await api.conn.notionList(c.id)) } catch (e: any) { toast(e?.message ?? 'Could not reach Notion', { kind: 'error' }) } finally { setBusy(null) }
  }
  useEffect(() => { if (has && isDesktop) void find() }, [has])
  const add = async (p: NotionPageInfo): Promise<void> => {
    setBusy(p.id)
    try {
      const r = await syncFromNotionApi(c.id, [p.id])
      if (!r.pages.length) toast(r.warnings[0] ?? 'Nothing came back from Notion', { kind: 'error' })
      else if (r.warnings.length) toast(r.warnings[0])
    } catch (e: any) { toast(e?.message ?? 'Could not reach Notion', { kind: 'error' }) } finally { setBusy(null) }
  }
  const stop = (pageId: string): void => act((d) => {
    const walk = (id: string): void => { const p = d.pages[id]; if (!p) return; if (p.source?.via === c.id) delete p.source.via; p.children.forEach(walk) }
    walk(pageId)
    for (const r of Object.values(d.pages)) if (r.rowOf === pageId && r.source?.via === c.id) delete r.source.via
  })
  if (!isDesktop) return <p className="muted small">Notion connections work in the desktop app.</p>
  if (!has) return <p className="muted small">In Notion, share the pages you want with the integration (••• → Connections), then paste its token above.</p>
  const shown = (list ?? []).filter((p) => !ids.has(p.id) && (!q || p.title.toLowerCase().includes(q.toLowerCase())))
  return (
    <div className="notion-sync">
      {synced.length > 0 && <>
        <div className="row between"><div className="section-label">In sync</div><Button small kind="ghost" icon="refresh" disabled={busy === 'all'} onClick={async () => { setBusy('all'); try { await refreshFromNotion(synced.map((p) => p.id)) } finally { setBusy(null) } }}>Refresh now</Button></div>
        {synced.map((p) => (
          <div key={p.id} className="notion-row">
            <Glyph value={p.icon} fallback={p.type === 'database' ? 'database' : 'file-text'} size={15} />
            <button className="link-btn grow ellipsis" onClick={() => openPage(p.id)}>{p.title || 'Untitled'}</button>
            <span className="muted small">{p.source?.syncedAt ? timeAgo(p.source.syncedAt) : ''}</span>
            <Button small kind="ghost" onClick={() => stop(p.id)}>Stop syncing</Button>
          </div>
        ))}
      </>}
      <div className="row between mt-sm">
        <div className="section-label">Shared with this connection</div>
        <Button small kind="ghost" icon="refresh" disabled={busy === 'list'} onClick={find}>{busy === 'list' ? 'Looking…' : 'Look again'}</Button>
      </div>
      {list && list.length > 8 && <input className="input input-sm" placeholder="Find a page" value={q} onChange={(e) => setQ(e.target.value)} />}
      {list && !shown.length && <p className="muted small">{list.length ? 'Everything shared is in sync.' : 'Nothing is shared yet. In Notion, open a page, then ••• → Connections → this integration.'}</p>}
      {shown.slice(0, 40).map((p) => (
        <div key={p.id} className="notion-row">
          <Glyph value={p.icon} fallback={p.kind === 'database' ? 'database' : 'file-text'} size={15} />
          <span className="grow ellipsis">{p.title}</span>
          {p.parent && <span className="muted small">{p.parent}</span>}
          <Button small icon="plus" disabled={!!busy} onClick={() => add(p)}>{busy === p.id ? 'Adding…' : 'Add'}</Button>
        </div>
      ))}
    </div>
  )
}

function MailFields({ c }: { c: Connection }): JSX.Element {
  const a = c.account ?? { preset: 'gmail', host: 'imap.gmail.com', port: 993, user: '' }
  const [user, setUser] = useState(a.user)
  const [host, setHost] = useState(a.host)
  const [port, setPort] = useState(String(a.port || 993))
  const save = (patch: Partial<NonNullable<Connection['account']>>): void => {
    patchConnection(c.id, (x) => { x.account = { ...a, ...patch } })
    setTimeout(() => { const now = getData().connections.find((x) => x.id === c.id); if (now?.account?.user && now.account.host) void loadFeed(now, true) }, 0)
  }
  return <>
    <Field label="Service">
      <select className="input input-sm" value={a.preset} onChange={(e) => { const p = mailPreset(e.target.value); setHost(p.host || host); setPort(String(p.port)); save({ preset: p.id, host: p.host || host, port: p.port }) }}>
        {MAIL_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </Field>
    <Field label="Email address"><input className="input input-sm w-220" autoFocus={!a.user} value={user} placeholder="you@gmail.com" onChange={(e) => setUser(e.target.value)} onBlur={() => { if (user.trim() !== a.user) save({ user: user.trim() }) }} /></Field>
    {a.preset === 'other' && (
      <Field label="IMAP server" sub="Over SSL, usually port 993">
        <input className="input input-sm w-220" value={host} placeholder="imap.example.com" onChange={(e) => setHost(e.target.value)} onBlur={() => { if (host.trim() !== a.host) save({ host: host.trim() }) }} />
        <input className="input input-sm w-60" value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))} onBlur={() => { const n = Number(port) || 993; if (n !== a.port) save({ port: n }) }} />
      </Field>
    )}
    <SecretField c={c} label="App password" />
  </>
}

function ConnCard({ c, open, onToggle }: { c: Connection; open: boolean; onToggle: () => void }): JSX.Element {
  const { result, busy } = useFeed(c.id)
  const notionCount = useData((d) => (c.kind === 'notion' ? notionPagesOf(d, c.id).length : 0))
  const [url, setUrl] = useState(c.url)
  const [repos, setRepos] = useState(c.repos.join(', '))
  const info = CONN_INFO[c.kind]
  const st = statusOf(c, result, busy, notionCount)
  const title = c.name || (c.kind !== 'notion' && result?.ok ? result.title : '') || info.name
  const saveUrl = (): void => {
    const v = url.trim()
    if (v === c.url) return
    patchConnection(c.id, (x) => { x.url = v })
    if (v) setTimeout(() => { const now = getData().connections.find((x) => x.id === c.id); if (now) void loadFeed(now, true) }, 0)
  }
  const saveRepos = (): void => {
    const list = [...new Set(repos.split(/[\s,]+/).map(repoOf).filter((x): x is string => !!x))]
    setRepos(list.join(', '))
    if (list.join() === c.repos.join()) return
    patchConnection(c.id, (x) => { x.repos = list })
    setTimeout(() => { const now = getData().connections.find((x) => x.id === c.id); if (now) void loadFeed(now, true) }, 0)
  }
  return (
    <div className={`conn-card ${open ? 'open' : ''} ${c.off ? 'off' : ''}`}>
      <div className="conn-head">
        <button className="conn-head-main" onClick={onToggle}>
          <span className="conn-icon" style={{ color: c.color, background: `color-mix(in srgb, ${c.color} 14%, transparent)` }}><Icon name={info.icon} size={16} /></span>
          <span className="min0 grow">
            <span className="strong ellipsis d-block">{title}</span>
            <span className={`small ellipsis d-block ${st.bad ? 'danger' : 'muted'}`}>{st.text || info.name}</span>
          </span>
        </button>
        {c.kind !== 'notion' && <button className={`icon-btn ${busy ? 'spin' : ''}`} title="Check now" disabled={busy || c.off} onClick={() => loadFeed(c, true)}><Icon name="refresh" size={14} /></button>}
        <button className="icon-btn" title={open ? 'Close' : 'Settings'} onClick={onToggle}><Icon name={open ? 'up' : 'down'} size={14} /></button>
      </div>
      {open && (
        <div className="conn-body">
          <Field label="Name"><input className="input input-sm w-220" value={c.name} placeholder={(c.kind !== 'notion' && result?.title) || info.name} onChange={(e) => patchConnection(c.id, (x) => { x.name = e.target.value }, 'conn-name-' + c.id)} /></Field>
          {(c.kind === 'calendar' || c.kind === 'rss') && (
            <Field label="Address" sub={ADDRESS_HINT[c.kind]}>
              <input className="input input-sm w-320" autoFocus={!c.url} value={url} placeholder={c.kind === 'calendar' ? 'https://… .ics' : 'https://…'} onChange={(e) => setUrl(e.target.value)} onBlur={saveUrl} onKeyDown={(e) => { if (e.key === 'Enter') saveUrl() }} />
            </Field>
          )}
          {c.kind === 'github' && <>
            <Field label="Repositories" sub="owner/name, separated by commas. Leave empty for everything assigned to you.">
              <input className="input input-sm w-320" autoFocus={!c.repos.length} value={repos} placeholder="facebook/react, owner/name" onChange={(e) => setRepos(e.target.value)} onBlur={saveRepos} onKeyDown={(e) => { if (e.key === 'Enter') saveRepos() }} />
            </Field>
            <SecretField c={c} label="Token" />
          </>}
          {c.kind === 'notion' && <SecretField c={c} label="Integration token" />}
          {c.kind === 'todoist' && <SecretField c={c} label="API token" />}
          {c.kind === 'mail' && <MailFields c={c} />}
          {c.kind !== 'notion' && <Field label="Color"><ColorDots value={c.color} colors={CONN_COLORS} onChange={(v) => patchConnection(c.id, (x) => { x.color = v })} /></Field>}
          <Field label="On" sub={c.off ? 'Paused: not checked and not shown' : undefined}><Toggle checked={!c.off} onChange={(v) => patchConnection(c.id, (x) => { if (v) delete x.off; else x.off = true })} /></Field>
          {c.kind === 'notion' ? <NotionPages c={c} /> : !c.off && <Preview c={c} />}
          <div className="row end mt-sm"><ConfirmButton label="Remove connection" confirmLabel="Remove" onConfirm={() => removeConnection(c.id)} /></div>
        </div>
      )}
    </div>
  )
}

export function ConnectionsPage(): JSX.Element {
  const conns = useData((d) => d.connections)
  const [open, setOpen] = useState<string | null>(null)
  return (
    <div className="page full page-connections">
      <div className="page-header row between">
        <h1 className="page-title static">Connections</h1>
      </div>
      {conns.length > 0 && (
        <div className="conn-list">
          {conns.map((c) => <ConnCard key={c.id} c={c} open={open === c.id} onToggle={() => setOpen(open === c.id ? null : c.id)} />)}
        </div>
      )}
      <div className="section-label mt">Add a connection</div>
      <div className="conn-add">
        {KINDS.map((k) => (
          <button key={k} className="conn-tile" onClick={() => setOpen(addConnection(k))}>
            <Icon name={CONN_INFO[k].icon} size={18} />
            <span className="strong">{CONN_INFO[k].name}</span>
            <span className="muted small">{CONN_INFO[k].desc}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
