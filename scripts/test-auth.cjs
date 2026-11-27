const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const Module = require('node:module')
const esbuild = require('esbuild')

async function test() {
  const build = await esbuild.build({
    stdin: { contents: "export * from './src/main/provider-auth'; export * from './src/main/mail-auth'; export * from './src/shared/provider-auth'", resolveDir: process.cwd() },
    bundle: true, write: false, platform: 'node', external: ['electron']
  })
  let challenge, cancel = false
  const shell = { async openExternal(address) {
    const params = new URL(address).searchParams
    challenge = params.get('code_challenge')
    const callback = new URL(params.get('redirect_uri'))
    callback.searchParams.set('state', 'wrong-state')
    assert.equal((await fetch(callback)).status, 404)
    callback.searchParams.set('state', params.get('state'))
    callback.searchParams.set(cancel ? 'error' : 'code', cancel ? 'access_denied' : 'fixture')
    assert.equal((await fetch(callback)).status, 200)
  } }
  const net = { async fetch(address, options) {
    const fields = options.body.startsWith('{') ? JSON.parse(options.body) : Object.fromEntries(new URLSearchParams(options.body))
    const refreshing = fields.grant_type === 'refresh_token'
    if (refreshing) assert.equal(fields.refresh_token, 'refresh')
    else {
      assert.equal(fields.code, 'fixture')
      assert.equal(fields.code_verifier ? createHash('sha256').update(fields.code_verifier).digest('base64url') : null, challenge)
    }
    return { ok: true, json: async () => ({ access_token: refreshing ? 'renewed' : 'first', ...(refreshing ? {} : { refresh_token: 'refresh' }) }) }
  } }
  const entry = new Module('auth-test', module)
  entry.require = id => id === 'electron' ? { shell, net } : require(id)
  entry._compile(build.outputFiles[0].text, 'auth-test.cjs')
  const auth = entry.exports
  for (const provider of Object.keys(auth.AUTH_PROVIDERS)) {
    const grant = await auth.connectProvider(provider, 'client', 'secret')
    assert.equal(grant.access, 'first')
    const renewed = await auth.renewProvider(grant)
    assert.equal(renewed.access, 'renewed')
    assert.equal(renewed.refresh, 'refresh')
  }
  for (const provider of ['gmail', 'outlook']) {
    const grant = await auth.authorizeMail(provider, 'fixture@example.com', 'client', '')
    assert.ok(challenge)
    assert.equal((await auth.renewMail(grant)).refresh, 'refresh')
  }
  cancel = true
  await assert.rejects(auth.connectProvider('github', 'client', ''), /cancelled/)
  console.log('Provider and mail callback, cancellation and refresh checks passed')
}
test().catch(error => { console.error(error); process.exitCode = 1 })
