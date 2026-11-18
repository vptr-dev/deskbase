// Assistant backend. Settings live in ai.json next to the data folder; the API key is
// encrypted with the OS keychain (safeStorage) and never sent to the renderer or exports.
import { app, ipcMain, safeStorage, type WebContents } from 'electron'
import fs from 'fs'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { type AiConfig, type AiProvider, type ChatMessage, listOpenAiModels, providerInfo, streamOllama, streamOpenAi } from '../shared/ai-core'

interface Stored { provider: AiProvider; baseUrl: string; model: string; enabled: boolean; key?: string; autodetected?: boolean }

const file = (): string => path.join(app.getPath('userData'), 'ai.json')
const running = new Map<string, AbortController>()

function read(): Stored {
  try {
    return { provider: 'ollama', baseUrl: providerInfo('ollama').baseUrl, model: '', enabled: true, ...JSON.parse(fs.readFileSync(file(), 'utf8')) }
  } catch {
    return { provider: 'ollama', baseUrl: providerInfo('ollama').baseUrl, model: '', enabled: true }
  }
}

function write(s: Stored): void {
  fs.writeFileSync(file(), JSON.stringify(s, null, 2))
}

function getKey(s: Stored): string | undefined {
  if (!s.key) return undefined
  try {
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(s.key, 'base64')) : Buffer.from(s.key, 'base64').toString('utf8')
  } catch {
    return undefined
  }
}

function setKey(s: Stored, key: string | null): void {
  if (!key) { delete s.key; return }
  s.key = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(key).toString('base64') : Buffer.from(key, 'utf8').toString('base64')
}

const publicConfig = (s: Stored): AiConfig => ({ provider: s.provider, baseUrl: s.baseUrl, model: s.model, enabled: s.enabled, hasKey: Boolean(s.key) })

/** First run: if Ollama or LM Studio is running locally, use it with its first model. */
async function autodetect(): Promise<void> {
  const s = read()
  if (s.model || s.autodetected) return
  for (const p of ['ollama', 'lmstudio'] as const) {
    try {
      const models = await listOpenAiModels(providerInfo(p).baseUrl, undefined, p)
      const chat = models.filter((m) => !/embed/i.test(m))
      if (chat.length) {
        write({ ...s, provider: p, baseUrl: providerInfo(p).baseUrl, model: chat[0], autodetected: true })
        return
      }
    } catch { /* not running */ }
  }
  write({ ...s, autodetected: true })
}

async function listModels(s: Stored): Promise<string[]> {
  if (s.provider === 'anthropic') {
    const key = getKey(s)
    if (!key) throw new Error('Add your Anthropic API key first.')
    const client = new Anthropic({ apiKey: key })
    const ids: string[] = []
    for await (const m of client.models.list()) ids.push(m.id)
    return ids
  }
  return listOpenAiModels(s.baseUrl, getKey(s), s.provider)
}

async function chat(wc: WebContents, id: string, system: string, messages: ChatMessage[]): Promise<string> {
  const s = read()
  if (!s.model) throw new Error('Choose a model in Settings → Assistant.')
  const ctrl = new AbortController()
  running.set(id, ctrl)
  const onText = (t: string): void => { if (!wc.isDestroyed()) wc.send('ai:chunk', id, t) }
  const onThinking = (): void => { if (!wc.isDestroyed()) wc.send('ai:chunk', id, '', true) }
  try {
    if (s.provider === 'anthropic') {
      const key = getKey(s)
      if (!key) throw new Error('Add your Anthropic API key in Settings → Assistant.')
      const client = new Anthropic({ apiKey: key })
      const stream = client.beta.messages.stream(
        {
          model: s.model,
          max_tokens: 64000,
          system,
          messages,
          output_config: { effort: 'medium' },
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
    if (s.provider === 'ollama') return await streamOllama({ baseUrl: s.baseUrl, model: s.model, system, messages, signal: ctrl.signal, onText, onThinking })
    return await streamOpenAi({ baseUrl: s.baseUrl, key: getKey(s), model: s.model, system, messages, signal: ctrl.signal, onText, onThinking })
  } catch (e: any) {
    if (ctrl.signal.aborted) return ''
    if (e instanceof Anthropic.AuthenticationError) throw new Error('The Anthropic API key was rejected. Check it in Settings → Assistant.')
    if (e instanceof Anthropic.RateLimitError) throw new Error('Anthropic is rate limiting requests. Try again in a moment.')
    if (e instanceof Anthropic.APIError) throw new Error(`Anthropic error ${e.status ?? ''}: ${e.message}`)
    if (e?.cause?.code === 'ECONNREFUSED' || /fetch failed/i.test(String(e?.message))) {
      throw new Error(`Can't reach ${providerInfo(s.provider).name} at ${s.baseUrl}. Is it running?`)
    }
    throw e
  } finally {
    running.delete(id)
  }
}

export function registerAi(): void {
  autodetect().catch(() => {})
  ipcMain.handle('ai:getConfig', () => publicConfig(read()))
  ipcMain.handle('ai:setConfig', (_e, patch: Partial<AiConfig> & { key?: string | null }) => {
    const s = read()
    const { key, hasKey: _h, ...rest } = patch as any
    Object.assign(s, rest)
    if (key !== undefined) setKey(s, key)
    write(s)
    return publicConfig(s)
  })
  ipcMain.handle('ai:models', async () => listModels(read()))
  ipcMain.handle('ai:detect', async () => {
    const found: { provider: AiProvider; models: string[] }[] = []
    for (const p of ['ollama', 'lmstudio'] as const) {
      try { found.push({ provider: p, models: await listOpenAiModels(providerInfo(p).baseUrl, undefined, p) }) } catch { /* not running */ }
    }
    return found
  })
  ipcMain.handle('ai:chat', (e, id: string, system: string, messages: ChatMessage[]) => chat(e.sender, id, system, messages))
  ipcMain.handle('ai:abort', (_e, id: string) => { running.get(id)?.abort() })
}
