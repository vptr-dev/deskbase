// Connections: calendar feeds, news feeds, GitHub and the Notion API. Tokens are encrypted with
// the OS keychain (safeStorage) in connections.json and never reach the renderer or exports.
// Fetched results are cached here for a few minutes so every panel can ask without extra requests.
import { app, ipcMain, net, safeStorage } from 'electron'
import fs from 'fs'
import path from 'path'
import { type ConnSpec, type FeedResult, feedUrl, githubItems, parseFeed, parseIcs } from '../shared/feeds'
import type { ImportResult, NotionPageInfo } from '../shared/import-types'
import { notionApiImport, notionApiPush, notionApiSearch, type NotionPush } from './notion-api'

const file = (): string => path.join(app.getPath('userData'), 'connections.json')

function readSecrets(): Record<string, string> {
  try { return JSON.parse(fs.readFileSync(file(), 'utf8')).secrets ?? {} } catch { return {} }
}
function writeSecrets(s: Record<string, string>): void {
  fs.writeFileSync(file(), JSON.stringify({ secrets: s }, null, 2))
}
function secret(id: string): string | undefined {
  const v = readSecrets()[id]
  if (!v) return undefined
  try {
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(v, 'base64')) : Buffer.from(v, 'base64').toString('utf8')
  } catch { return undefined }
}
const seal = (s: string): string => (safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(s).toString('base64') : Buffer.from(s, 'utf8').toString('base64'))

const UA = 'Deskbase'
const cache = new Map<string, FeedResult>()
const inflight = new Map<string, Promise<FeedResult>>()
const FRESH = 5 * 60 * 1000

async function text(url: string, headers: Record<string, string> = {}): Promise<string> {
  const r = await net.fetch(url, { headers: { 'User-Agent': UA, ...headers } })
  if (!r.ok) throw new Error(r.status === 404 ? 'Not found (404). Check the address.' : r.status === 401 || r.status === 403 ? `Not allowed (${r.status}). The link or token may be wrong or expired.` : `The server answered ${r.status}.`)
  return r.text()
}

async function github(spec: ConnSpec): Promise<FeedResult> {
  const token = secret(spec.id)
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  const get = async (p: string): Promise<any> => JSON.parse(await text('https://api.github.com' + p, headers))
  let title: string | undefined
  if (token) { try { title = (await get('/user')).login } catch (e: any) { throw new Error(e?.message?.includes('401') ? 'GitHub did not accept the token.' : e?.message) } }
  const repos = spec.repos.filter(Boolean)
  if (!repos.length && !token) throw new Error('Add a repository, or a token to see what is assigned to you.')
  const items = repos.length
    ? (await Promise.all(repos.map(async (r) => githubItems(await get(`/repos/${r}/issues?state=open&per_page=40&sort=updated`), r)))).flat()
    : githubItems(await get('/issues?filter=all&state=open&per_page=60&sort=updated'))
  items.sort((a, b) => (b.date ?? 0) - (a.date ?? 0))
  return { ok: true, at: Date.now(), title: title ?? repos.join(', '), items }
}

async function fetchSpec(spec: ConnSpec): Promise<FeedResult> {
  try {
    if (spec.kind === 'calendar') {
      const body = await text(feedUrl(spec.url))
      if (!/BEGIN:VCALENDAR/i.test(body)) throw new Error('That address is not a calendar (ICS) feed.')
      const now = Date.now()
      const r = parseIcs(body, now - 62 * 86400000, now + 400 * 86400000)
      return { ok: true, at: now, title: r.title, events: r.events }
    }
    if (spec.kind === 'rss') {
      const body = await text(feedUrl(spec.url), { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' })
      if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(body)) throw new Error('That address is not an RSS or Atom feed.')
      const r = parseFeed(body)
      return { ok: true, at: Date.now(), title: r.title, items: r.items.slice(0, 80) }
    }
    if (spec.kind === 'github') return await github(spec)
    if (spec.kind === 'notion') {
      const token = secret(spec.id)
      if (!token) throw new Error('Paste the integration token first.')
      const pages = await notionApiSearch(token)
      return { ok: true, at: Date.now(), title: `${pages.length} page${pages.length === 1 ? '' : 's'} shared`, items: [] }
    }
    throw new Error('Unknown connection')
  } catch (e: any) {
    return { ok: false, at: Date.now(), error: e?.message ?? String(e) }
  }
}

async function fetchConn(spec: ConnSpec, force: boolean): Promise<FeedResult> {
  const key = JSON.stringify([spec.id, spec.kind, spec.url, spec.repos])
  const hit = cache.get(key)
  if (!force && hit && Date.now() - hit.at < FRESH) return hit
  const running = inflight.get(key)
  if (running) return running
  const p = fetchSpec(spec).then((r) => {
    // Keep the last good result when a refresh fails, with the error on it.
    const out = !r.ok && hit?.ok ? { ...hit, ok: false, error: r.error, at: r.at } : r
    cache.set(key, out)
    return out
  }).finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

function token(id: string): string {
  const t = secret(id)
  if (!t) throw new Error('This Notion connection has no token.')
  return t
}

export function registerConnections(): void {
  ipcMain.handle('conn:secrets', () => Object.keys(readSecrets()))
  ipcMain.handle('conn:setSecret', (_e, id: string, value: string | null) => {
    const s = readSecrets()
    if (value && value.trim()) s[id] = seal(value.trim())
    else delete s[id]
    writeSecrets(s)
    for (const k of [...cache.keys()]) if (k.startsWith(JSON.stringify([id]).slice(0, -1))) cache.delete(k)
    return Object.keys(s)
  })
  ipcMain.handle('conn:fetch', (_e, spec: ConnSpec, force?: boolean) => fetchConn(spec, !!force))
  ipcMain.handle('conn:notionList', async (_e, id: string): Promise<NotionPageInfo[]> => notionApiSearch(token(id)))
  ipcMain.handle('conn:notionImport', async (_e, id: string, ids: string[]): Promise<ImportResult> => notionApiImport(token(id), ids, id))
  ipcMain.handle('conn:notionPush', async (_e, id: string, op: NotionPush) => notionApiPush(token(id), op))
}
