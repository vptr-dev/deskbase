import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

const scratch = await mkdtemp(path.join(tmpdir(), 'deskbase-connections-'))
const fixture = {
  trello: ['https://trello.com/b/12345678', { name: 'Board', lists: [{ id: '1', name: 'Doing', pos: 1 }], cards: [{ id: '2', idList: '1', name: 'Card', pos: 1, shortLink: 'abcd1234' }] }],
  asana: ['123', { data: [{ gid: '1', name: 'Plan', permalink_url: 'https://app.asana.com/0/1' }] }],
  clickup: ['123', { tasks: [{ id: '1', name: 'Plan', url: 'https://app.clickup.com/t/1', status: { status: 'open' } }] }],
  linear: ['', { data: { viewer: { assignedIssues: { nodes: [{ id: '1', identifier: 'APP-1', title: 'Plan', url: 'https://linear.app/team/issue/APP-1' }] } } } }],
  monday: ['3', { data: { boards: [{ items_page: { items: [{ id: '4', name: 'Plan', url: 'https://example.monday.com/boards/3/pulses/4' }] } }] } }],
  airtable: ['app123/tbl456', { records: [{ id: 'rec7', fields: { Name: 'Plan' } }] }],
  figma: ['123', { files: [{ key: 'abc', name: 'Design' }] }],
  slack: ['C123', { ok: true, messages: [{ ts: '1712345678.001', text: 'Message' }] }],
  raindrop: ['0', { items: [{ _id: 1, title: 'Bookmark', link: 'https://example.com' }] }],
  dropbox: ['', { entries: [{ id: 'id:1', name: 'File', '.tag': 'file', path_display: '/File' }] }],
  box: ['0', { entries: [{ id: '1', type: 'file', name: 'File' }] }],
  toggl: ['', [{ id: 1, description: 'Design', duration: 600 }]],
  clockify: ['123', [{ id: '1', name: 'Design' }]],
  gitlab: ['group/repo', [{ id: 1, title: 'Issue', web_url: 'https://gitlab.com/group/repo/-/issues/1' }]],
  bitbucket: ['team/repo', { values: [{ id: 1, title: 'Change', links: { html: { href: 'https://bitbucket.org/team/repo/pull-requests/1' } } }] }],
  dockerhub: ['library/node', { results: [{ name: 'lts' }] }],
  huggingface: ['model', [{ id: 'org/model' }]],
  npm: ['@scope/pkg', { time: { created: '2025-01-01', '1.0.0': '2025-01-03' } }],
  pypi: ['package', { releases: { '1.0': [{ upload_time_iso_8601: '2025-01-03' }] } }],
  crates: ['serde', { versions: [{ id: 1, num: '1.0' }] }],
  rubygems: ['rails', [{ number: '7.0', platform: 'ruby' }]],
  packagist: ['org/pkg', { packages: { 'org/pkg': [{ version: 'v1' }] } }],
  stackoverflow: ['js', { items: [{ question_id: 1, title: 'Question', creation_date: 1700000000, link: 'https://stackoverflow.com/q/1' }] }],
  hackernews: ['tech', { hits: [{ objectID: '1', title: 'Story' }] }],
  devto: ['js', [{ id: 1, title: 'Article', url: 'https://dev.to/a/article' }]],
  openlibrary: ['history', { docs: [{ key: '/works/OL1W', title: 'Book' }] }],
  crossref: ['energy', { message: { items: [{ DOI: '10.123/test', title: ['Paper'], URL: 'https://doi.org/10.123/test' }] } }],
  europepmc: ['science', { resultList: { result: [{ id: '1', source: 'MED', title: 'Paper' }] } }],
  datacite: ['data', { data: [{ id: '10.123/test', attributes: { titles: [{ title: 'Dataset' }] } }] }],
  zenodo: ['weather', { hits: { hits: [{ id: 1, metadata: { title: 'Dataset' }, links: {} }] } }]
}
const atom = '<feed xmlns="http://www.w3.org/2005/Atom"><title>Updates</title><entry><id>id1</id><title>Update</title><link href="https://example.com/item" rel="alternate"/><published>2025-01-03T00:00:00Z</published></entry></feed>'
fixture.youtube = ['UCchannel', atom]
fixture.arxiv = ['robotics', atom]
try {
  const out = path.join(scratch, 'modules')
  await build({ entryPoints: ['src/main/service-feeds.ts', 'src/shared/services.ts'], outdir: out, bundle: true, platform: 'node', format: 'cjs' })
  const require = createRequire(import.meta.url)
  const { serviceFeed } = require(path.join(out, 'main/service-feeds.js'))
  const { serviceIds, serviceInfo } = require(path.join(out, 'shared/services.js'))
  assert.deepEqual(serviceIds.filter(k => !['codex','claude'].includes(k)).sort(), Object.keys(fixture).sort())
  for (const [id, [setting, response]] of Object.entries(fixture)) {
    const token = id === 'trello' ? 'a'.repeat(32) + ':' + 'b'.repeat(44) : 'fixture-token'
    const read = async (url, init) => {
      assert.equal(new URL(url).protocol, 'https:')
      assert.ok(!url.includes(token))
      if (serviceInfo(id).secret) assert.equal(init.redirect, 'error')
      return new Response(typeof response === 'string' ? response : JSON.stringify(response))
    }
    const result = await serviceFeed(id, setting, token, read)
    assert.equal(result.items.length, 1, id)
    assert.ok(result.items[0].id && result.items[0].title, id)
    assert.match(result.items[0].url, /^https?:/, id)
  }
  await assert.rejects(serviceFeed('linear', '', '', () => { throw Error('unexpected request') }), /credential/)
  await assert.rejects(serviceFeed('figma', '123', 'token', async () => new Response('', { status: 403 })), /denied access/)
  for (const kind of ['codex', 'claude']) {
    const dir = path.join(scratch, kind)
    process.env[kind === 'codex' ? 'CODEX_HOME' : 'CLAUDE_CONFIG_DIR'] = dir
    await mkdir(dir)
    const id = '12345678-1234-1234-1234-123456789012'
    const entry = kind === 'codex' ? { id, thread_name: 'Planner', updated_at: '2025-01-01' } : { sessionId: id, project: '/work/Planner', timestamp: 1700000000000, display: 'private prompt' }
    await writeFile(path.join(dir, kind === 'codex' ? 'session_index.jsonl' : 'history.jsonl'), 'partial line\n' + JSON.stringify(entry) + '\n' + JSON.stringify(entry))
    const result = await serviceFeed(kind, '', '', () => { throw Error('unexpected network access') })
    assert.equal(result.items.length, 1)
    assert.equal(result.items[0].title, 'Planner')
    assert.ok(result.items[0].resumeCommand.endsWith(id))
    assert.ok(!JSON.stringify(result).includes('private prompt'))
  }
  console.log(serviceIds.length + ' connection adapters passed')
  if (process.argv.includes('--public')) {
    const publicSamples = {
      gitlab: 'gitlab-org/gitlab', bitbucket: 'tutorials/markdowndemo', dockerhub: 'library/node',
      huggingface: 'whisper', npm: 'is-number', pypi: 'six', crates: 'serde', rubygems: 'rake',
      packagist: 'symfony/console', stackoverflow: 'typescript', hackernews: 'engineering', devto: 'webdev',
      youtube: 'UC_x5XG1OV2P6uZZ5FSM9Ttw', openlibrary: 'electronics', crossref: 'telemetry',
      europepmc: 'sleep', arxiv: 'robotics', datacite: 'meteorology', zenodo: 'weather'
    }
    const queue = Object.entries(publicSamples)
    async function probe() {
      while (queue.length) {
        const [provider, input] = queue.shift()
        try {
          const r = await serviceFeed(provider, input, '', fetch)
          console.log('Live ' + provider + ': ' + r.items.length + ' items')
        } catch (error) {
          console.log('::warning::Live ' + provider + ': ' + error.message)
        }
      }
    }
    await Promise.all(Array.from({ length: 4 }, probe))
  }
} finally { await rm(scratch, { recursive: true, force: true }) }
