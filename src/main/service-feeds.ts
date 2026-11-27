import { parseFeed, type FeedItem, type FeedResult } from '../shared/feeds'
import { serviceInfo, type ServiceId } from '../shared/services'
import { boardKey } from '../shared/trello'
import { readTrelloBoard } from './trello'
import { localSessions } from './session-index'

type Request = (url: string, init: RequestInit) => Promise<Response>
type Row = Record<string, any>
const enc = encodeURIComponent
function item(id: string | number, title: string, link?: string, summary?: string, when?: string): FeedItem {
  const date = when ? Date.parse(when) : NaN
  return { id: String(id), title: String(title || id), url: link && /^https?:\/\//i.test(link) ? link : '',
    summary: typeof summary === 'string' ? summary : undefined, date: Number.isFinite(date) ? date : undefined }
}

export async function serviceFeed(kind: ServiceId, value: string, token: string, request: Request, oauth=false): Promise<FeedResult> {
  const info = serviceInfo(kind)
  const v = value.trim()
  if (info.field && !v && kind !== 'dropbox') throw new Error('Enter ' + info.field.toLowerCase() + ' in Connections.')
  if (info.secret && !token && kind !== 'gitlab') throw new Error('Save the credential in Connections first.')
  const q = enc(v)
  const path = v.split('/').map(enc).join('/')
  const bearer = { Authorization: 'Bearer ' + token }
  async function fetchData(url: string, headers: Record<string, string> = {}, body?: object): Promise<Response> {
    const res = await request(url, {
      method: body ? 'POST' : 'GET', redirect: Object.keys(headers).length ? 'error' : 'follow',
      headers: { 'User-Agent': 'Deskbase (https://github.com/vptr-dev/deskbase)', ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000)
    })
    if (!res.ok) throw new Error(info.name + (res.status === 429 ? ' rate limit reached. Try again later.' : [401,403].includes(res.status) ? ' denied access. Check the token and its permissions.' : ' returned HTTP ' + res.status + '. Check your connection settings.'))
    return res
  }
  const json = async (url: string, headers?: Record<string, string>, body?: object): Promise<any> => (await fetchData(url, headers, body)).json()
  async function read(): Promise<FeedItem[]> {
    switch (kind) {
      case 'trello': {
        const board = boardKey(v)
        if (!board) throw new Error('Enter a Trello board link.')
        const [key, accessToken] = token.split(':').map(x => x.trim())
        const data = await readTrelloBoard(board, { key, token: accessToken }, request)
        return data.cards.map(c => item(c.id, c.name, 'https://trello.com/c/' + c.shortLink, data.lists.find(l => l.id === c.list)?.name))
      }
      case 'asana': {
        const data = await json('https://app.asana.com/api/1.0/projects/' + q + '/tasks?limit=60&opt_fields=name,permalink_url,completed', bearer)
        return data.data.map((r: Row) => item(r.gid, r.name, r.permalink_url, r.completed ? 'Completed' : 'Open'))
      }
      case 'clickup': {
        const data = await json('https://api.clickup.com/api/v2/list/' + q + '/task', { Authorization: token })
        return data.tasks.map((r: Row) => item(r.id, r.name, r.url, r.status?.status))
      }
      case 'linear': {
        const data = await json('https://api.linear.app/graphql', { Authorization: oauth?'Bearer '+token:token }, { query: '{ viewer { assignedIssues(first: 50) { nodes { id identifier title url state { name } } } } }' })
        if (data.errors) throw new Error('Linear could not read your assigned issues.')
        return data.data.viewer.assignedIssues.nodes.map((r: Row) => item(r.id, r.identifier + ' ' + r.title, r.url, r.state?.name))
      }
      case 'monday': {
        const data = await json('https://api.monday.com/v2', { Authorization: token }, {
          query: 'query($ids:[ID!]!) { boards(ids:$ids) { items_page(limit:50) { items { id name url } } } }', variables: { ids: [v] }
        })
        if (data.errors || !data.data?.boards?.length) throw new Error('Check the board ID and token access.')
        return data.data.boards[0].items_page.items.map((r: Row) => item(r.id, r.name, r.url))
      }
      case 'airtable': {
        const [base, table] = v.split('/').map(s => s.trim())
        if (!/^app\w+$/.test(base) || !/^tbl\w+$/.test(table || '')) throw new Error('Enter a base ID and table ID separated by /.')
        const data = await json('https://api.airtable.com/v0/' + base + '/' + table + '?pageSize=60', bearer)
        return data.records.map((r: Row) => item(r.id, Object.values(r.fields).find((x): x is string => typeof x === 'string') ?? r.id, 'https://airtable.com/' + base + '/' + table + '/' + r.id, undefined, r.createdTime))
      }
      case 'figma': {
        const data = await json('https://api.figma.com/v1/projects/' + q + '/files', oauth?bearer:{ 'X-Figma-Token': token })
        return data.files.map((r: Row) => item(r.key, r.name, 'https://www.figma.com/design/' + r.key, undefined, r.last_modified))
      }
      case 'slack': {
        const data = await json('https://slack.com/api/conversations.history?limit=15&channel=' + q, bearer)
        if (!data.ok) throw new Error('Slack: ' + String(data.error || 'Could not read this channel'))
        return data.messages.map((r: Row) => item(r.ts, r.text || 'Message', 'https://slack.com/app_redirect?channel=' + q, undefined, new Date(Number(r.ts) * 1000).toISOString()))
      }
      case 'raindrop': {
        const data = await json('https://api.raindrop.io/rest/v1/raindrops/' + q + '?perpage=50', bearer)
        return data.items.map((r: Row) => item(r._id, r.title, r.link, r.excerpt, r.created))
      }
      case 'dropbox': {
        const data = await json('https://api.dropboxapi.com/2/files/list_folder', bearer, { path: v === '/' ? '' : v, limit: 100 })
        return data.entries.map((r: Row) => {
          const segments = String(r.path_display).split('/').map(enc)
          const file = r['.tag'] === 'file' ? segments.pop() : undefined
          const url = 'https://www.dropbox.com/home' + segments.join('/') + (file ? '?preview=' + file : '')
          return item(r.id, r.name, url, r['.tag'], r.server_modified)
        })
      }
      case 'box': {
        const data = await json('https://api.box.com/2.0/folders/' + q + '/items?limit=80&fields=id,name,type,modified_at', bearer)
        return data.entries.map((r: Row) => item(r.id, r.name, 'https://app.box.com/' + r.type + '/' + r.id, r.type, r.modified_at))
      }
      case 'toggl': {
        const data = await json('https://api.track.toggl.com/api/v9/me/time_entries', { Authorization: 'Basic ' + Buffer.from(token + ':api_token').toString('base64') })
        return data.map((r: Row) => item(r.id, r.description || 'Time entry', 'https://track.toggl.com/timer', r.duration < 0 ? 'Running' : Math.round(r.duration / 60) + ' minutes', r.start))
      }
      case 'clockify': {
        const data = await json('https://api.clockify.me/api/v1/workspaces/' + q + '/projects?page-size=60', { 'X-Api-Key': token })
        return data.map((r: Row) => item(r.id, r.name, 'https://app.clockify.me/projects/' + r.id, r.clientName))
      }
      case 'codex': case 'claude': return localSessions(kind)
      case 'gitlab': {
        const data = await json('https://gitlab.com/api/v4/projects/' + q + '/issues?state=opened&per_page=50', oauth?bearer:token ? { 'PRIVATE-TOKEN': token } : {})
        return data.map((r: Row) => item(r.id, r.title, r.web_url, r.author?.name, r.updated_at))
      }
      case 'bitbucket': {
        const data = await json('https://api.bitbucket.org/2.0/repositories/' + path + '/pullrequests?state=OPEN',oauth?bearer:{})
        return data.values.map((r: Row) => item(r.id, r.title, r.links?.html?.href, r.author?.display_name, r.updated_on))
      }
      case 'dockerhub': {
        const [ns, image] = v.split('/')
        if (!image) throw new Error('Enter namespace/image.')
        const data = await json('https://hub.docker.com/v2/namespaces/' + enc(ns) + '/repositories/' + enc(image) + '/tags?page_size=50')
        return data.results.map((r: Row) => item(r.name, r.name, 'https://hub.docker.com/r/' + path + '/tags?name=' + enc(r.name), r.tag_status, r.last_updated))
      }
      case 'huggingface': {
        const data = await json('https://huggingface.co/api/models?limit=50&search=' + q)
        return data.map((r: Row) => item(r.id, r.id, 'https://huggingface.co/' + r.id, r.pipeline_tag))
      }
      case 'npm': {
        const data = await json('https://registry.npmjs.org/' + q)
        return Object.entries(data.time || {}).filter(([ver]) => ver !== 'created' && ver !== 'modified').reverse().map(([ver, date]) => item(ver, v + ' ' + ver, 'https://www.npmjs.com/package/' + path + '/v/' + enc(ver), undefined, String(date)))
      }
      case 'pypi': {
        const data = await json('https://pypi.org/pypi/' + q + '/json')
        return Object.entries(data.releases).map(([ver, builds]) => item(ver, v + ' ' + ver, 'https://pypi.org/project/' + q + '/' + enc(ver) + '/', undefined, (builds as Row[])[0]?.upload_time_iso_8601)).sort((a,b) => (b.date || 0) - (a.date || 0))
      }
      case 'crates': {
        const data = await json('https://crates.io/api/v1/crates/' + q + '/versions')
        return data.versions.map((r: Row) => item(r.id, v + ' ' + r.num, 'https://crates.io/crates/' + q + '/' + enc(r.num), undefined, r.created_at))
      }
      case 'rubygems': {
        const data = await json('https://rubygems.org/api/v1/versions/' + q + '.json')
        return data.map((r: Row) => item(r.number + '-' + r.platform, v + ' ' + r.number, 'https://rubygems.org/gems/' + q + '/versions/' + enc(r.number), r.platform, r.created_at))
      }
      case 'packagist': {
        const data = await json('https://repo.packagist.org/p2/' + path + '.json')
        return data.packages[v].map((r: Row) => item(r.version, v + ' ' + r.version, 'https://packagist.org/packages/' + path + '#' + enc(r.version), undefined, r.time))
      }
      case 'stackoverflow': {
        const data = await json('https://api.stackexchange.com/2.3/questions?site=stackoverflow&sort=creation&order=desc&tagged=' + q)
        return data.items.map((r: Row) => item(r.question_id, r.title, r.link, r.owner?.display_name, new Date(r.creation_date * 1000).toISOString()))
      }
      case 'hackernews': {
        const data = await json('https://hn.algolia.com/api/v1/search_by_date?tags=story&query=' + q)
        return data.hits.map((r: Row) => item(r.objectID, r.title, r.url || 'https://news.ycombinator.com/item?id=' + r.objectID, r.author, r.created_at))
      }
      case 'devto': {
        const data = await json('https://dev.to/api/articles?per_page=50&tag=' + q)
        return data.map((r: Row) => item(r.id, r.title, r.url, r.description, r.published_at))
      }
      case 'youtube': case 'arxiv': {
        const url = kind === 'youtube' ? 'https://www.youtube.com/feeds/videos.xml?channel_id=' + q : 'https://export.arxiv.org/api/query?sortBy=submittedDate&sortOrder=descending&max_results=40&search_query=' + enc('all:' + v)
        return parseFeed(await (await fetchData(url)).text()).items
      }
      case 'openlibrary': {
        const data = await json('https://openlibrary.org/search.json?limit=40&q=' + q)
        return data.docs.map((r: Row) => item(r.key, r.title, 'https://openlibrary.org' + r.key, r.author_name?.join(', ')))
      }
      case 'crossref': {
        const data = await json('https://api.crossref.org/works?rows=40&query=' + q)
        return data.message.items.map((r: Row) => item(r.DOI, r.title?.[0] || r.DOI, r.URL, r.publisher))
      }
      case 'europepmc': {
        const data = await json('https://www.ebi.ac.uk/europepmc/webservices/rest/search?format=json&pageSize=40&query=' + q)
        return data.resultList.result.map((r: Row) => item(r.source + '/' + r.id, r.title, 'https://europepmc.org/article/' + r.source + '/' + r.id, r.authorString, r.firstPublicationDate))
      }
      case 'datacite': {
        const data = await json('https://api.datacite.org/dois?page[size]=40&query=' + q)
        return data.data.map((r: Row) => item(r.id, r.attributes.titles?.[0]?.title, 'https://doi.org/' + r.id, r.attributes.publisher, r.attributes.published))
      }
      case 'zenodo': {
        const data = await json('https://zenodo.org/api/records?size=25&q=' + q)
        return data.hits.hits.map((r: Row) => item(r.id, r.metadata.title, r.links.self_html || 'https://zenodo.org/records/' + r.id, undefined, r.created))
      }
    }
  }
  return { ok: true, at: Date.now(), title: info.name, items: (await read()).slice(0, 80) }
}
