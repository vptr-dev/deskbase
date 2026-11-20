// Assistant backend. Settings live in ai.json next to the data folder; API keys are encrypted
// with the OS keychain (safeStorage) and never sent to the renderer or exports. Each provider
// keeps its own address, key and last model, so chats can switch between them.
import { app, ipcMain, safeStorage, type WebContents } from 'electron'
import fs from 'fs'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { type AiConfig, type AiProvider, type ChatMessage, type ChatOptions, PROVIDERS, listOpenAiModels, providerInfo, streamOllama, streamOpenAi } from '../shared/ai-core'

interface Slot { baseUrl: string; model: string; key?: string }
interface Stored { provider: AiProvider; enabled: boolean; autodetected?: boolean; slots: Partial<Record<AiProvider, Slot>> }
interface Legacy { provider?: AiProvider; baseUrl?: string; model?: string; key?: string; enabled?: boolean; autodetected?: boolean; slots?: Stored['slots'] }

const file = (): string => path.join(app.getPath('userData'), 'ai.json')
const running = new Map<string, AbortController>()

function read(): Stored {
  let raw: Legacy = {}
  try { raw = JSON.parse(fs.readFileSync(file(), 'utf8')) } catch { /* first run */ }
  const provider = PROVIDERS.some((p) => p.id === raw.provider) ? raw.provider! : 'ollama'
  const slots: Stored['slots'] = { ...(raw.slots ?? {}) }
  // Before 0.14 there was one provider with one key.
  if (!raw.slots && (raw.baseUrl || raw.model || raw.key)) slots[provider] = { baseUrl: raw.baseUrl || providerInfo(provider).baseUrl, model: raw.model ?? '', key: raw.key }
  return { provider, enabled: raw.enabled !== false, autodetected: raw.autodetected, slots }
}

function write(s: Stored): void {
  fs.writeFileSync(file(), JSON.stringify(s, null, 2))
}

function slot(s: Stored, p: AiProvider): Slot {
  const info = providerInfo(p)
  const x = s.slots[p] ?? { baseUrl: info.baseUrl, model: info.defaultModel }
  return { ...x, baseUrl: info.fixedUrl ? info.baseUrl : x.baseUrl || info.baseUrl }
}

function getKey(sl: Slot): string | undefined {
  if (!sl.key) return undefined
  try {
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(sl.key, 'base64')) : Buffer.from(sl.key, 'base64').toString('utf8')
  } catch {
    return undefined
  }
}

const sealKey = (key: string): string => (safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(key).toString('base64') : Buffer.from(key, 'utf8').toString('base64'))

function publicConfig(s: Stored): AiConfig {
  const d = slot(s, s.provider)
  const providers = Object.fromEntries(PROVIDERS.map((p) => { const x = slot(s, p.id); return [p.id, { baseUrl: x.baseUrl, model: x.model, hasKey: Boolean(x.key) }] })) as AiConfig['providers']
  return { provider: s.provider, baseUrl: d.baseUrl, model: d.model, enabled: s.enabled, hasKey: Boolean(d.key), providers }
}

/** First run: if Ollama or LM Studio is running locally, use it with its first model. */
async function autodetect(): Promise<void> {
  const s = read()
  if (slot(s, s.provider).model || s.autodetected) return
  for (const p of ['ollama', 'lmstudio'] as const) {
    try {
      const models = await listOpenAiModels(providerInfo(p).baseUrl, undefined, p)
      const chat = models.filter((m) => !/embed/i.test(m))
      if (chat.length) {
        write({ ...s, provider: p, autodetected: true, slots: { ...s.slots, [p]: { baseUrl: providerInfo(p).baseUrl, model: chat[0] } } })
        return
      }
    } catch { /* not running */ }
  }
  write({ ...s, autodetected: true })
}

async function listModels(s: Stored, p: AiProvider): Promise<string[]> {
  const sl = slot(s, p)
  if (p === 'anthropic') {
    const key = getKey(sl)
    if (!key) throw new Error('Add your Anthropic API key first.')
    const client = new Anthropic({ apiKey: key })
    const ids: string[] = []
    for await (const m of client.models.list()) ids.push(m.id)
    return ids
  }
  if (providerInfo(p).needsKey && !getKey(sl)) throw new Error(`Add your ${providerInfo(p).short} API key first.`)
  const list = await listOpenAiModels(sl.baseUrl, getKey(sl), p)
  return list.filter((m) => !/embed|whisper|tts|dall-e|moderation|image|audio|transcribe/i.test(m))
}

async function chat(wc: WebContents, id: string, system: string, messages: ChatMessage[], opts: ChatOptions & { effort?: 'low' | 'medium' | 'high' } = {}): Promise<string> {
  const s = read()
  const p = opts.provider && PROVIDERS.some((x) => x.id === opts.provider) ? opts.provider : s.provider
  const sl = slot(s, p)
  const model = opts.model || sl.model
  if (!model) throw new Error(`Choose a ${providerInfo(p).short} model first.`)
  const ctrl = new AbortController()
  running.set(id, ctrl)
  const onText = (t: string): void => { if (!wc.isDestroyed()) wc.send('ai:chunk', id, t) }
  const onThinking = (): void => { if (!wc.isDestroyed()) wc.send('ai:chunk', id, '', true) }
  try {
    if (p === 'anthropic') {
      const key = getKey(sl)
      if (!key) throw new Error('Add your Anthropic API key in Settings → Assistant.')
      const client = new Anthropic({ apiKey: key })
      // Newer Claude models take no temperature; length and effort are what can be set.
      const stream = client.beta.messages.stream(
        {
          model,
          max_tokens: opts.maxTokens || 64000,
          system,
          messages,
          output_config: { effort: opts.effort ?? 'medium' },
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default'
        },
        { signal: ctrl.signal }
      )
      stream.on('text', (t) => onText(t))
      let thought = false
      stream.on('thinking', () => { if (!thought) { thought = true; onThinking() } })
      const msg = await stream.finalMessage()
      if (msg.stop_reason === 'refusal') onText('\n\n_The model declined this request._')
      return msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
    }
    const common = { model, system, messages, signal: ctrl.signal, onText, onThinking, temperature: opts.temperature, maxTokens: opts.maxTokens }
    if (p === 'ollama') return await streamOllama({ baseUrl: sl.baseUrl, ...common })
    return await streamOpenAi({ baseUrl: sl.baseUrl, key: getKey(sl), ...common })
  } catch (e: any) {
    if (ctrl.signal.aborted) return ''
    if (e instanceof Anthropic.AuthenticationError) throw new Error('The Anthropic API key was rejected. Check it in Settings → Assistant.')
    if (e instanceof Anthropic.RateLimitError) throw new Error('Anthropic is rate limiting requests. Try again in a moment.')
    if (e instanceof Anthropic.APIError) throw new Error(`Anthropic error ${e.status ?? ''}: ${e.message}`)
    if (e?.cause?.code === 'ECONNREFUSED' || /fetch failed/i.test(String(e?.message))) {
      throw new Error(`Can't reach ${providerInfo(p).name} at ${sl.baseUrl}. Is it running?`)
    }
    throw e
  } finally {
    running.delete(id)
  }
}

type Patch = Partial<Pick<AiConfig, 'provider' | 'baseUrl' | 'model' | 'enabled'>> & { key?: string | null; target?: AiProvider }

export function registerAi(): void {
  autodetect().catch(() => {})
  ipcMain.handle('ai:getConfig', () => publicConfig(read()))
  // `target` picks the provider whose address, key or model changes; `provider` alone sets the default.
  ipcMain.handle('ai:setConfig', (_e, patch: Patch) => {
    const s = read()
    if (patch.provider && PROVIDERS.some((p) => p.id === patch.provider)) s.provider = patch.provider
    if (typeof patch.enabled === 'boolean') s.enabled = patch.enabled
    const t = patch.target ?? s.provider
    const sl = { ...slot(s, t), ...(s.slots[t] ?? {}) }
    if (typeof patch.baseUrl === 'string' && !providerInfo(t).fixedUrl) sl.baseUrl = patch.baseUrl.trim()
    if (typeof patch.model === 'string') sl.model = patch.model.trim()
    if (patch.key === null) delete sl.key
    else if (typeof patch.key === 'string' && patch.key.trim()) sl.key = sealKey(patch.key.trim())
    s.slots[t] = sl
    write(s)
    return publicConfig(s)
  })
  ipcMain.handle('ai:models', async (_e, p?: AiProvider) => listModels(read(), p ?? read().provider))
  ipcMain.handle('ai:detect', async () => {
    const found: { provider: AiProvider; models: string[] }[] = []
    for (const p of ['ollama', 'lmstudio'] as const) {
      try { found.push({ provider: p, models: await listOpenAiModels(providerInfo(p).baseUrl, undefined, p) }) } catch { /* not running */ }
    }
    return found
  })
  ipcMain.handle('ai:chat', (e, id: string, system: string, messages: ChatMessage[], opts?: ChatOptions) => chat(e.sender, id, system, messages, opts ?? {}))
  ipcMain.handle('ai:abort', (_e, id: string) => { running.get(id)?.abort() })
}
