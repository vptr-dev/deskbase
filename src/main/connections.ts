// Connections: calendar feeds, news feeds, GitHub and the Notion API. Tokens are encrypted with
// the OS keychain (safeStorage) in connections.json and never reach the renderer or exports.
// Fetched results are cached here for a few minutes so every panel can ask without extra requests.
import { app, ipcMain, net, safeStorage } from 'electron'
import fs from 'fs'
import path from 'path'
import { serviceFeed } from './service-feeds'
import { isService } from '../shared/services'
import {connectProvider,renewProvider,type Grant} from "./provider-auth"
import { authorizeMail, renewMail, matchesMail, type MailGrant, type MailProvider } from './mail-auth'
import { ImapFlow } from 'imapflow'
import { type ConnSpec, type FeedItem, type FeedResult, feedUrl, githubItems, mailPreset, parseFeed, parseIcs, todoistItems } from '../shared/feeds'
import type { ImportResult, NotionPageInfo } from '../shared/import-types'
import { notionApiImport, notionApiPush, notionApiSearch, type NotionPush } from './notion-api'

import { readTrelloBoard, editTrelloBoard } from './trello'
import type { TrelloAccess, TrelloEdit } from '../shared/trello'

const serviceKeysFile = (): string => path.join(app.getPath('userData'), 'service-keys.json')
const serviceKey = (kind: string, id: string): string => {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id) || !isService(kind)) throw new Error('Invalid connection')
  return kind + ':' + id
}
const grantsFile=()=>path.join(app.getPath("userData"),"mail-grants.json")
const providerFile=()=>path.join(app.getPath('userData'),'provider-grants.json')
const renewing=new Map<string,Promise<string>>()
async function credential(kind:string,id:string):Promise<string|undefined>{
 const encoded=secret(id,providerFile())
 if(!encoded)return isService(kind)?secret(serviceKey(kind,id),serviceKeysFile()):secret(id)
 const g:Grant=JSON.parse(encoded)
 if(g.kind!==kind)throw Error('Provider mismatch. Reconnect this account.')
 if(!g.expires||g.expires>Date.now()+60000)return g.access
 const pending=renewing.get(id);if(pending)return pending
 const work=renewProvider(g).then(next=>{if(secret(id,providerFile())!==encoded)throw Error('Connection changed. Retry.');writeSecrets({...readSecrets(providerFile()),[id]:seal(JSON.stringify(next))},providerFile());return next.access}).finally(()=>renewing.delete(id))
 renewing.set(id,work);return work
}
const attempts=new Map<string,symbol>()
const savedConnectionIds = (): string[] => [...Object.keys(readSecrets(providerFile())),...Object.keys(readSecrets(grantsFile())),...Object.keys(readSecrets()), ...Object.keys(readSecrets(serviceKeysFile())).map(k => k.split(':')[1])]

const file = (): string => path.join(app.getPath('userData'), 'connections.json')

function readSecrets(location = file()): Record<string, string> {
  try { return JSON.parse(fs.readFileSync(location, 'utf8')).secrets ?? {} } catch { return {} }
}
function writeSecrets(s: Record<string, string>, location = file()): void {
  const tmp=location+'.tmp';fs.writeFileSync(tmp, JSON.stringify({ secrets: s }, null, 2));fs.renameSync(tmp,location)
}
function secret(id: string, location = file()): string | undefined {
  const v = readSecrets(location)[id]
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
  const token = await credential(spec.kind,spec.id)
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

async function connectMailbox(spec:ConnSpec){
  const pass = secret(spec.id)
  const a = spec.account
  if (!a?.host || !a.user) throw new Error('Fill in the email address and the server.')
  const saved=secret(spec.id,grantsFile())
  let auth:{user:string;pass:string}|{user:string;accessToken:string}
  if(saved){
    let grant:MailGrant=JSON.parse(saved)
    if((a.port||993)!==993||!matchesMail(grant,a.host,a.user))throw Error('Sign in again for this mailbox.')
    if(grant.expires<Date.now()+60000){
      grant=await renewMail(grant)
      if(secret(spec.id,grantsFile())!==saved)throw Error('Connection changed during refresh. Retry.')
      writeSecrets({...readSecrets(grantsFile()),[spec.id]:seal(JSON.stringify(grant))},grantsFile())
    }
    auth={user:a.user,accessToken:grant.access}
  }else {
    if(!pass)throw Error('Sign in or enter an app password.')
    auth={user:a.user,pass}
  }
  const client = new ImapFlow({ host: a.host, port: a.port || 993, secure: true, auth, logger: false, connectionTimeout: 20000, greetingTimeout: 20000, socketTimeout: 60000 })
  client.on('error', () => { /* reported through the calls below */ })
  try {
    await client.connect()
  } catch (e: any) {
    if (e?.authenticationFailed) throw new Error('The server did not accept the address and app password.')
    const msg = String(e?.message ?? '')
    throw new Error(e?.code === 'ENOTFOUND' ? `Could not find the server ${a.host}.` : e?.code === 'ECONNREFUSED' ? `${a.host} refused the connection.` : /SSL|TLS|certificate/i.test(msg) ? `${a.host} did not answer over a secure connection on port ${a.port || 993}.` : e?.code === 'ETIMEDOUT' || /timeout/i.test(msg) ? `${a.host} did not answer in time.` : msg || 'Could not connect to the mail server.')
  }
  return client
}
async function mail(spec:ConnSpec):Promise<FeedResult>{
  const a=spec.account!,client=await connectMailbox(spec)
  try {
    const status = await client.status('INBOX', { unseen: true, messages: true })
    const gmail = /gmail|googlemail/i.test(a.host)
    const web = mailPreset(a.preset).web
    const lock = await client.getMailboxLock('INBOX')
    let items: FeedItem[] = []
    try {
      const mailboxRevision=client.mailbox?String(client.mailbox.uidValidity):undefined
      const total = typeof client.mailbox === 'object' && client.mailbox ? client.mailbox.exists : 0
      if (total) {
        const msgs = await client.fetchAll(`${Math.max(1, total - 29)}:*`, { uid: true, envelope: true, flags: true, internalDate: true, ...(gmail ? { emailId: true } : {}) })
        items = msgs.reverse().map((m) => {
          const from = m.envelope?.from?.[0]
          const date = m.internalDate ? new Date(m.internalDate as any).getTime() : m.envelope?.date ? new Date(m.envelope.date as any).getTime() : undefined
          let url = web
          if (gmail && m.emailId) { try { url = `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(a.user)}#all/${BigInt(m.emailId).toString(16)}` } catch { /* keep the inbox */ } }
          return { id: String(m.uid), mailboxRevision, title: (m.envelope?.subject ?? '').trim() || '(no subject)', url, kind: 'mail' as const, author: from?.name || from?.address, ...(date ? { date } : {}), unread: !m.flags?.has('\\Seen') }
        })
      }
    } finally { lock.release() }
    return { ok: true, at: Date.now(), title: a.user, unread: status ? status.unseen ?? 0 : items.filter((i) => i.unread).length, items }
  } finally {
    await client.logout().catch(() => { client.close() })
  }
}

async function todoist(spec: ConnSpec): Promise<FeedResult> {
  const token = await credential(spec.kind,spec.id)
  if (!token) throw new Error('Paste the API token first.')
  const h = { Authorization: `Bearer ${token}` }
  const get = async (p: string): Promise<any> => {
    const r = await net.fetch('https://api.todoist.com/api/v1' + p, { headers: { 'User-Agent': UA, ...h } })
    if (r.status === 401 || r.status === 403) throw new Error('Todoist did not accept the token.')
    if (!r.ok) throw new Error(`Todoist answered ${r.status}.`)
    return r.json()
  }
  const all = async (p: string): Promise<any[]> => {
    const out: any[] = []
    let cursor: string | null = null
    for (let i = 0; i < 10; i++) {
      const j = await get(`${p}${p.includes('?') ? '&' : '?'}limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
      if (Array.isArray(j)) return j
      out.push(...(j.results ?? []))
      cursor = j.next_cursor ?? null
      if (!cursor) break
    }
    return out
  }
  const [tasks, projects] = await Promise.all([all('/tasks'), all('/projects').catch(() => [])])
  const names = Object.fromEntries(projects.map((p: any) => [String(p.id), String(p.name ?? '')]))
  return { ok: true, at: Date.now(), title: 'Todoist', items: todoistItems(tasks, names) }
}

async function todoistClose(id: string, task: string): Promise<void> {
  const token = await credential('todoist',id)
  if (!token) throw new Error('This Todoist connection has no token.')
  const r = await net.fetch(`https://api.todoist.com/api/v1/tasks/${encodeURIComponent(task)}/close`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'User-Agent': UA } })
  if (!r.ok) throw new Error(`Todoist answered ${r.status}.`)
  for (const [k, v] of cache) if (k.startsWith(JSON.stringify([id]).slice(0, -1)) && v.items) cache.set(k, { ...v, items: v.items.filter((i) => i.id !== task) })
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
    if (isService(spec.kind)) return await serviceFeed(spec.kind, spec.url, await credential(spec.kind,spec.id) || '', (url, init) => net.fetch(url, init), Boolean(readSecrets(providerFile())[spec.id]))
    if (spec.kind === 'github') return await github(spec)
    if (spec.kind === 'mail') return await mail(spec)
    if (spec.kind === 'todoist') return await todoist(spec)
    if (spec.kind === 'notion') {
      const token = await credential(spec.kind,spec.id)
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
  const key = JSON.stringify([spec.id, spec.kind, spec.url, spec.repos, spec.account ?? null])
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

async function token(id: string): Promise<string> {
  const t = await credential('notion',id)
  if (!t) throw new Error('This Notion connection has no token.')
  return t
}

const trelloRequest = (url: string, init: RequestInit): Promise<Response> => net.fetch(url, init)
const trelloFile = (): string => path.join(app.getPath('userData'), 'trello.json')

function trelloSecretId(page: string): string {
  if (typeof page !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(page)) throw new Error('Invalid project.')
  return 'trello:' + page
}

function trelloAccess(page: string, board: string): TrelloAccess {
  const value = secret(trelloSecretId(page), trelloFile())
  const saved = value ? JSON.parse(value) : null
  if (!saved || saved.board !== board) throw new Error('Connect your Trello account for this board on this computer.')
  return saved
}

export function registerConnections(): void {
  ipcMain.handle('trello:read', (_e, page: string, board: string) => readTrelloBoard(board, trelloAccess(page, board), trelloRequest))
  ipcMain.handle('trello:edit', (_e, page: string, board: string, edit: TrelloEdit) => editTrelloBoard(board, trelloAccess(page, board), edit, trelloRequest))
  ipcMain.handle('trello:connect', async (_e, page: string, board: string, access: TrelloAccess) => {
    const id = trelloSecretId(page)
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure storage is unavailable on this computer.')
    const data = await readTrelloBoard(board, access, trelloRequest)
    writeSecrets({ ...readSecrets(trelloFile()), [id]: seal(JSON.stringify({ board, key: access.key, token: access.token })) }, trelloFile())
    return data
  })
  ipcMain.handle('trello:disconnect', (_e, page: string) => {
    const values = readSecrets(trelloFile())
    delete values[trelloSecretId(page)]
    writeSecrets(values, trelloFile())
  })
  ipcMain.handle('conn:secrets', savedConnectionIds)
  ipcMain.handle('conn:mailSeen',async (_e,spec:ConnSpec,uid:string,revision:string,seen:boolean)=>{
    if(spec.kind!=='mail'||!/^[1-9]\d*$/.test(uid)||!revision||typeof seen!=='boolean')throw Error('Invalid mail item')
    const key=JSON.stringify([spec.id,spec.kind,spec.url,spec.repos,spec.account??null])
    const previous=cache.get(key)
    if(!previous?.items?.some(item=>item.id===uid&&item.mailboxRevision===revision))throw Error('Refresh this inbox before changing the message')
    const client=await connectMailbox(spec)
    try{
      const lock=await client.getMailboxLock('INBOX')
      try{
        if(!client.mailbox||String(client.mailbox.uidValidity)!==revision)throw Error('Inbox changed. Refresh and try again.')
        const flags=['\\Seen']
        if(seen)await client.messageFlagsAdd(uid,flags,{uid:true});else await client.messageFlagsRemove(uid,flags,{uid:true})
        cache.delete(key)
      }finally{lock.release()}
    }finally{await client.logout().catch(()=>{})}
  })
  ipcMain.handle('conn:authorizeProvider',async(_e,id:string,kind:string,client:string,key:string)=>{
    if(!/^[a-zA-Z0-9_-]{1,128}$/.test(id)||!safeStorage.isEncryptionAvailable())throw Error('Secure connection storage unavailable')
    const attempt=Symbol();attempts.set(id,attempt)
    try{const grant=await connectProvider(kind,client,key)
      if(attempts.get(id)!==attempt)throw Error('Connection changed during sign-in')
      writeSecrets({...readSecrets(providerFile()),[id]:seal(JSON.stringify(grant))},providerFile())
      return savedConnectionIds()
    }finally{if(attempts.get(id)===attempt)attempts.delete(id)}
  })
  ipcMain.handle('conn:mailGrant',(_e,id:string)=>Boolean(readSecrets(grantsFile())[id]))
  ipcMain.handle('conn:authorizeMail',async (_e,id:string,provider:MailProvider,user:string,client:string,clientSecret:string)=>{
    if(!safeStorage.isEncryptionAvailable()||!/^[\w-]{1,128}$/.test(id))throw Error('Secure connection storage unavailable')
    const attempt=Symbol();attempts.set(id,attempt)
    try {
      const grant=await authorizeMail(provider,user,client,clientSecret)
      if(attempts.get(id)!==attempt)throw Error('Connection changed while signing in')
      writeSecrets({...readSecrets(grantsFile()),[id]:seal(JSON.stringify(grant))},grantsFile())
      const passwords=readSecrets();delete passwords[id];writeSecrets(passwords)
      return savedConnectionIds()
    }finally{if(attempts.get(id)===attempt)attempts.delete(id)}
  })
  ipcMain.handle('conn:setSecret', (_e, id: string, value: string | null, kind?: string) => {
    const scoped = kind && isService(kind)
    const location = scoped ? serviceKeysFile() : file()
    const key = scoped ? serviceKey(kind, id) : id
    const s = readSecrets(location)
    if (value?.trim() && !safeStorage.isEncryptionAvailable()) throw new Error('Secure storage is unavailable on this device.')
    if (value && value.trim()) s[key] = seal(value.trim())
    else delete s[key]
    writeSecrets(s, location)
    attempts.delete(id)
    const grants=readSecrets(providerFile());if(Object.hasOwn(grants,id)){delete grants[id];writeSecrets(grants,providerFile())}
    if(kind==='mail'){
      attempts.delete(id)
      const grants=readSecrets(grantsFile());delete grants[id];writeSecrets(grants,grantsFile())
    }
    for (const k of [...cache.keys()]) if (k.startsWith(JSON.stringify([id]).slice(0, -1))) cache.delete(k)
    return savedConnectionIds()
  })
  ipcMain.handle('conn:fetch', (_e, spec: ConnSpec, force?: boolean) => fetchConn(spec, !!force))
  ipcMain.handle('conn:notionList', async (_e, id: string): Promise<NotionPageInfo[]> => notionApiSearch(await token(id)))
  ipcMain.handle('conn:notionImport', async (_e, id: string, ids: string[]): Promise<ImportResult> => notionApiImport(await token(id), ids, id))
  ipcMain.handle('conn:todoistClose', (_e, id: string, task: string) => todoistClose(id, task))
  ipcMain.handle('conn:notionPush', async (_e, id: string, op: NotionPush) => notionApiPush(await token(id), op))
}
