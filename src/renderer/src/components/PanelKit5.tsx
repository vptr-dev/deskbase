// Panels from connections: calendar events, a news feed and GitHub issues and pull requests.
import { openView, useData } from '../store'
import type { ConnectionKind } from '../types'
import type { FeedItem } from '../../../shared/feeds'
import { api } from '../lib/api'
import { type CalEvent, CONN_INFO, useCalendarEvents, useFeed } from '../lib/connections'
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
    <button className="event-row" onClick={() => open(e.url)} disabled={!e.url} title={[e.title, e.location].filter(Boolean).join(' · ')}>
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
export function FeedRow({ item, summary, kind }: { item: FeedItem; summary?: boolean; kind: ConnectionKind }): JSX.Element {
  if (kind === 'github') {
    const icon = item.kind === 'pr' ? (item.state === 'merged' ? 'merged' : item.state === 'draft' ? 'prDraft' : 'pr') : 'issue'
    return (
      <button className="feed-row gh" onClick={() => open(item.url)} title={item.title}>
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
    <button className="feed-row" onClick={() => open(item.url)} title={item.title}>
      <span className="min0 grow">
        <span className={`d-block ${summary ? 'strong-ish' : 'ellipsis'}`}>{item.title}</span>
        {summary && item.summary && <span className="muted small feed-summary">{item.summary}</span>}
        <span className="muted small ellipsis d-block">{[item.author, item.date ? timeAgo(item.date) : ''].filter(Boolean).join(' · ')}</span>
      </span>
    </button>
  )
}

function ListPanel({ cfg, kind }: { cfg: Cfg; kind: 'rss' | 'github' }): JSX.Element {
  const first = useData((d) => d.connections.find((c) => c.kind === kind && !c.off)?.id)
  const id = cfg.conn && cfg.conn !== 'first' ? cfg.conn : first
  const { conn, result, busy } = useFeed(id)
  if (!conn) return <NoConnection kind={kind} />
  if (!result) return <div className="muted small pad">{busy ? 'Loading…' : ''}</div>
  if (!result.ok && !result.items?.length) return <div className="danger small pad">{result.error}</div>
  let items = result.items ?? []
  if (kind === 'github' && cfg.show === 'issues') items = items.filter((i) => i.kind === 'issue')
  if (kind === 'github' && cfg.show === 'prs') items = items.filter((i) => i.kind === 'pr')
  items = items.slice(0, Number(cfg.count) || (kind === 'rss' ? 6 : 8))
  if (!items.length) return <div className="muted small pad">{kind === 'github' ? 'Nothing open.' : 'No posts yet.'}</div>
  return <div className={`feed-panel ${kind}`}>{items.map((i) => <FeedRow key={i.id} item={i} kind={kind} summary={kind === 'rss' && cfg.summary !== false} />)}</div>
}

export const FeedWidget = ({ cfg }: { cfg: Cfg }): JSX.Element => <ListPanel cfg={cfg} kind="rss" />
export const GitHubWidget = ({ cfg }: { cfg: Cfg }): JSX.Element => <ListPanel cfg={cfg} kind="github" />
