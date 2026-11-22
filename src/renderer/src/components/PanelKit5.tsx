import { isService, type ServiceId } from '../../../shared/services'
// Panels from connections: calendar events, a news feed and GitHub issues and pull requests.
import { openView, toast, useData } from '../store'
import type { ConnectionKind } from '../types'
import type { FeedItem } from '../../../shared/feeds'
import { api } from '../lib/api'
import { type CalEvent, CONN_INFO, closeTodoist, useCalendarEvents, useFeed, useNowPlaying } from '../lib/connections'
import { mailPreset } from '../../../shared/feeds'
import { useEffect, useState } from 'react'
import { MONTHS_LONG, addDays, friendlyDay, parseDay, timeAgo, today } from '../lib/util'
import { Icon } from './Icon'

type Cfg = Record<string, any>

const open = (url?: string): void => { if (url) void api.openExternal(url) }

function NoConnection({ kind }: { kind: ConnectionKind }): JSX.Element {
  return (
    <div className="conn-empty">
      <Icon name={CONN_INFO[kind].icon} size={18} className="muted" />
      <button className="link-btn small" onClick={() => { openView('@connections'); void api.showMain() }}>Add a {CONN_INFO[kind].name.toLowerCase()} connection</button>
    </div>
  )
}

// ---------- events ----------
export function EventRow({ e, showDay }: { e: CalEvent; showDay?: boolean }): JSX.Element {
  const d = parseDay(e.start)
  return (
    <button data-widget-item={e.title} data-item-url={e.url} data-item-summary={[e.start,e.time,e.location].filter(Boolean).join(" ")} className="event-row" onClick={() => open(e.url)} aria-disabled={!e.url} title={[e.title, e.location].filter(Boolean).join(' · ')}>
      <span className="event-bar" style={{ background: e.color }} />
      <span className="event-time">{e.allDay ? 'All day' : e.time}{!e.allDay && e.endTime ? <span className="muted"> – {e.endTime}</span> : null}</span>
      <span className="min0 grow">
        <span className="ellipsis d-block">{e.title}</span>
        {(showDay || e.location) && <span className="muted small ellipsis d-block">{showDay ? `${d.getDate()} ${MONTHS_LONG[d.getMonth()].slice(0, 3)}` : ''}{showDay && e.location ? ' · ' : ''}{e.location ?? ''}</span>}
      </span>
    </button>
  )
}

export function EventsWidget({ cfg }: { cfg: Cfg }): JSX.Element {
  const has = useData((d) => d.connections.some((c) => c.kind === 'calendar' && !c.off))
  const events = useCalendarEvents(cfg.conns)
  if (!has) return <NoConnection kind="calendar" />
  const t = today()
  const until = addDays(t, Number(cfg.days) || 14)
  const now = Date.now()
  const list = events.filter((e) => (e.end ?? e.start) >= t && e.start <= until && (e.allDay || e.at + 3600000 > now || (e.end ?? e.start) > t)).slice(0, Number(cfg.count) || 8)
  if (!list.length) return <div className="muted small pad">No events in the next {Number(cfg.days) || 14} days.</div>
  const days: [string, CalEvent[]][] = []
  for (const e of list) {
    const k = e.start < t ? t : e.start
    const last = days[days.length - 1]
    if (last && last[0] === k) last[1].push(e)
    else days.push([k, [e]])
  }
  return (
    <div className="events-panel">
      {days.map(([k, es]) => (
        <div key={k} className="events-day">
          <div className={`events-day-head ${k === t ? 'accent' : ''}`}>{friendlyDay(k)}</div>
          {es.map((e) => <EventRow key={e.id + e.conn} e={e} />)}
        </div>
      ))}
    </div>
  )
}

// ---------- news feed ----------
export function FeedRow({ item, summary, kind, connId }: { item: FeedItem; summary?: boolean; kind: ConnectionKind; connId?: string }): JSX.Element {
  const meta = { 'data-widget-item': item.title, 'data-item-url': item.url, 'data-item-summary': item.summary }
  if (isService(kind) && item.resumeCommand) return <button {...meta} data-item-action="Copy resume command" className="feed-row" title={'Copy ' + item.resumeCommand} onClick={() => {
    void navigator.clipboard.writeText(item.resumeCommand!).then(() => toast('Resume command copied')).catch(() => toast('Clipboard unavailable', { kind: 'error' }))
  }}><span className="ellipsis grow">{item.title}</span><Icon name="copy" size={13} /></button>
  if (kind === 'mail') {
    return (
      <button {...meta} className={`feed-row mail ${item.unread ? 'unread' : ''}`} onClick={() => open(item.url)} title={item.title}>
        <span className="mail-dot" />
        <span className="min0 grow">
          <span className="row gap-sm"><span className="ellipsis grow mail-from">{item.author ?? ''}</span><span className="muted small nowrap">{item.date ? timeAgo(item.date) : ''}</span></span>
          <span className="ellipsis d-block mail-subject">{item.title}</span>
        </span>
      </button>
    )
  }
  if (kind === 'todoist') {
    const late = item.due && item.due < today()
    return (
      <div {...meta} className={`feed-row task p${item.priority ?? 1}`}>
        <button data-item-action="Complete in Todoist" className="todo-ring" title="Complete" disabled={!connId} onClick={() => { if (connId) void closeTodoist(connId, item.id) }}><Icon name="check" size={11} /></button>
        <button className="min0 grow text-left" onClick={() => open(item.url)} title={item.title}>
          <span className="ellipsis d-block">{item.title}</span>
          {(item.due || item.project) && <span className={`small ellipsis d-block ${late ? 'danger' : 'muted'}`}>{item.due ? friendlyDay(item.due) + (item.dueTime ? ' ' + item.dueTime : '') : ''}{item.due && item.project ? ' · ' : ''}{item.project ?? ''}</span>}
        </button>
      </div>
    )
  }
  if (kind === 'github') {
    const icon = item.kind === 'pr' ? (item.state === 'merged' ? 'merged' : item.state === 'draft' ? 'prDraft' : 'pr') : 'issue'
    return (
      <button {...meta} className="feed-row gh" onClick={() => open(item.url)} title={item.title}>
        <Icon name={icon} size={14} className={`gh-state ${item.state ?? 'open'}`} />
        <span className="min0 grow">
          <span className="ellipsis d-block">{item.title}</span>
          <span className="muted small ellipsis d-block">{item.repo}#{item.number}{item.author ? ` · ${item.author}` : ''}{item.date ? ` · ${timeAgo(item.date)}` : ''}</span>
        </span>
        {!!item.comments && <span className="muted small gh-comments"><Icon name="comment" size={12} /> {item.comments}</span>}
      </button>
    )
  }
  return (
    <button {...meta} className="feed-row" onClick={() => open(item.url)} title={item.title}>
      <span className="min0 grow">
        <span className={`d-block ${summary ? 'strong-ish' : 'ellipsis'}`}>{item.title}</span>
        {summary && item.summary && <span className="muted small feed-summary">{item.summary}</span>}
        <span className="muted small ellipsis d-block">{[item.author, item.date ? timeAgo(item.date) : ''].filter(Boolean).join(' · ')}</span>
      </span>
    </button>
  )
}

export function ListPanel({ cfg, kind }: { cfg: Cfg; kind: ServiceId | 'rss' | 'github' | 'mail' | 'todoist' }): JSX.Element {
  const first = useData((d) => d.connections.find((c) => c.kind === kind && !c.off)?.id)
  const id = cfg.conn && cfg.conn !== 'first' ? cfg.conn : first
  const { conn, result, busy } = useFeed(id)
  if (!conn || conn.kind !== kind) return <NoConnection kind={kind} />
  if (conn.off) return <div className="muted small pad">Paused</div>
  if (!result) return <div className="muted small pad">{busy ? 'Loading…' : ''}</div>
  if (!result.ok && !result.items?.length) return <div className="danger small pad">{result.error}</div>
  let items = result.items ?? []
  if (kind === 'github' && cfg.show === 'issues') items = items.filter((i) => i.kind === 'issue')
  if (kind === 'github' && cfg.show === 'prs') items = items.filter((i) => i.kind === 'pr')
  if (kind === 'mail' && cfg.unreadOnly) items = items.filter((i) => i.unread)
  if (kind === 'todoist' && (cfg.show ?? 'today') === 'today') { const t = today(); items = items.filter((i) => i.due && i.due <= t) }
  if (kind === 'todoist' && cfg.show === 'week') { const w = addDays(today(), 7); items = items.filter((i) => i.due && i.due <= w) }
  if (cfg.textFilter) { const query = String(cfg.textFilter).toLowerCase(); items = items.filter(i => [i.title, i.summary, i.author].some(s => s?.toLowerCase().includes(query))) }
  items = items.slice(0, Number(cfg.count) || (kind === 'rss' ? 6 : 8))
  const head = kind === 'mail' && cfg.count !== 0 ? (
    <button className="mail-head" onClick={() => open(mailPreset(conn.account?.preset).web || items[0]?.url)}>
      <strong>{result.unread ?? 0}</strong><span className="muted small">unread</span>
      {!result.ok && <Icon name="alert" size={13} className="danger" />}
    </button>
  ) : null
  if (!items.length) return <div className="feed-panel">{head}</div>
  return <div className={`feed-panel ${kind}`}>{head}{items.map((i) => <FeedRow key={i.id} item={i} kind={kind} connId={conn.id} summary={(kind === 'rss' || isService(kind)) && cfg.summary !== false} />)}</div>
}

export const FeedWidget = ({ cfg }: { cfg: Cfg }): JSX.Element => <ListPanel cfg={cfg} kind="rss" />
export const GitHubWidget = ({ cfg }: { cfg: Cfg }): JSX.Element => <ListPanel cfg={cfg} kind="github" />
export const MailWidget = ({ cfg }: { cfg: Cfg }): JSX.Element => <ListPanel cfg={cfg} kind="mail" />
export const TodoistWidget = ({ cfg }: { cfg: Cfg }): JSX.Element => <ListPanel cfg={cfg} kind="todoist" />

// ---------- now playing ----------
const APP_NAMES: [RegExp, string][] = [[/spotify/i, 'Spotify'], [/chrome/i, 'Chrome'], [/msedge|edge/i, 'Edge'], [/firefox|308046B0AF4A39CB/i, 'Firefox'], [/zunemusic|mediaplayer/i, 'Media Player'], [/vlc/i, 'VLC'], [/itunes|applemusic/i, 'Apple Music'], [/brave/i, 'Brave'], [/opera/i, 'Opera'], [/foobar/i, 'foobar2000'], [/tidal/i, 'TIDAL'], [/deezer/i, 'Deezer'], [/youtube/i, 'YouTube Music']]
export const appName = (id?: string): string => (id ? APP_NAMES.find(([re]) => re.test(id))?.[1] ?? id.replace(/\.exe$/i, '').replace(/_.*$/, '').split(/[!.]/).pop() ?? '' : '')
const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export function MediaWidget({ cfg }: { cfg: Cfg }): JSX.Element {
  const m = useNowPlaying()
  const [, tick] = useState(0)
  useEffect(() => { if (!m.playing) return; const id = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(id) }, [m.playing])
  if (m.none || !m.title) return <div className="media-panel empty"><Icon name="music" size={20} className="muted" /><span className="muted small">Nothing playing</span></div>
  const pos = Math.min(m.dur ?? 0, (m.pos ?? 0) + (m.playing && m.at ? (Date.now() - m.at) / 1000 : 0))
  const look = cfg.look ?? 'card'
  return (
    <div className={`media-panel look-${look}`}>
      {look !== 'line' && (m.thumb ? <img className="media-art" src={m.thumb} alt="" /> : <span className="media-art none"><Icon name="music" size={22} /></span>)}
      <div className="media-info min0">
        <div className="media-title ellipsis" title={m.title}>{m.title}</div>
        <div className="media-artist muted ellipsis">{[m.artist, cfg.app !== false ? appName(m.app) : ''].filter(Boolean).join(' · ')}</div>
        {cfg.progress !== false && !!m.dur && <div className="media-bar"><span style={{ width: `${(pos / m.dur) * 100}%` }} /><em>{mmss(pos)}</em><em>{mmss(m.dur)}</em></div>}
        <div className="media-ctl">
          <button data-widget-action="Previous track" title="Previous" disabled={m.canPrev === false} onClick={() => api.media.control('prev')}><Icon name="skipBack" size={16} /></button>
          <button data-widget-action={m.playing ? 'Pause playback' : 'Play'} className="main" title={m.playing ? 'Pause' : 'Play'} onClick={() => api.media.control('toggle')}><Icon name={m.playing ? 'pause' : 'play'} size={18} /></button>
          <button data-widget-action="Next track" title="Next" disabled={m.canNext === false} onClick={() => api.media.control('next')}><Icon name="skip" size={16} /></button>
        </div>
      </div>
    </div>
  )
}
