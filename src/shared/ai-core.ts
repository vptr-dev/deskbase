// Provider-neutral pieces of the assistant. OpenAI-compatible servers (Ollama, LM Studio,
// OpenAI, anything custom) are called with fetch so this file runs in both the main process
// and a plain browser. Anthropic goes through the official SDK in the main process.

export type AiProvider = 'ollama' | 'lmstudio' | 'openai' | 'anthropic' | 'custom'

export interface AiConfig {
  provider: AiProvider
  baseUrl: string
  model: string
  hasKey: boolean
  enabled: boolean
}

export interface ChatMessage { role: 'user' | 'assistant'; content: string }

export const PROVIDERS: { id: AiProvider; name: string; baseUrl: string; local: boolean; needsKey: boolean; defaultModel: string }[] = [
  { id: 'ollama', name: 'Ollama (local)', baseUrl: 'http://localhost:11434', local: true, needsKey: false, defaultModel: '' },
  { id: 'lmstudio', name: 'LM Studio (local)', baseUrl: 'http://localhost:1234', local: true, needsKey: false, defaultModel: '' },
  { id: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com', local: false, needsKey: true, defaultModel: 'claude-opus-5-5' },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com', local: false, needsKey: true, defaultModel: '' },
  { id: 'custom', name: 'Other OpenAI-compatible', baseUrl: 'http://localhost:8080', local: false, needsKey: false, defaultModel: '' }
]

export const providerInfo = (p: AiProvider): (typeof PROVIDERS)[number] => PROVIDERS.find((x) => x.id === p) ?? PROVIDERS[0]

const trimUrl = (u: string): string => u.replace(/\/+$/, '').replace(/\/v1$/, '')

export async function listOpenAiModels(baseUrl: string, key?: string, provider?: AiProvider): Promise<string[]> {
  const base = trimUrl(baseUrl)
  if (provider === 'ollama') {
    try {
      const r = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(4000) })
      if (r.ok) {
        const j = await r.json()
        return (j.models ?? []).map((m: any) => m.name as string)
      }
    } catch { /* fall through to /v1/models */ }
  }
  const r = await fetch(`${base}/v1/models`, { headers: key ? { Authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(6000) })
  if (!r.ok) throw new Error(`Server answered ${r.status}`)
  const j = await r.json()
  return (j.data ?? []).map((m: any) => m.id as string).sort()
}

/** Streams a chat completion. Calls onText with each new piece and resolves with the full text. */
export async function streamOpenAi(opts: {
  baseUrl: string; key?: string; model: string; system: string; messages: ChatMessage[]; signal: AbortSignal; onText: (t: string) => void; onThinking?: () => void
}): Promise<string> {
  const r = await fetch(`${trimUrl(opts.baseUrl)}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(opts.key ? { Authorization: `Bearer ${opts.key}` } : {}) },
    body: JSON.stringify({ model: opts.model, stream: true, messages: [{ role: 'system', content: opts.system }, ...opts.messages] }),
    signal: opts.signal
  })
  if (!r.ok || !r.body) {
    const t = await r.text().catch(() => '')
    throw new Error(`The model server answered ${r.status}${t ? `: ${t.slice(0, 200)}` : ''}`)
  }
  const reader = r.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let full = ''
  let thought = false
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') return full || fallback(opts)
      try {
        const j = JSON.parse(data)
        const delta = j.choices?.[0]?.delta ?? {}
        const piece: string = delta.content ?? ''
        if (piece) { full += piece; opts.onText(piece) } else if (!thought && (delta.reasoning || delta.reasoning_content)) { thought = true; opts.onThinking?.() }
        if (j.choices?.[0]?.finish_reason === 'length' && !full) throw new Error('The model ran out of room before answering. Try a shorter page or a model with a larger context.')
        if (j.error) throw new Error(typeof j.error === 'string' ? j.error : j.error.message ?? 'The model server reported an error')
      } catch (e) { if (e instanceof Error && !(e instanceof SyntaxError)) throw e }
    }
  }
  return full || fallback(opts)
}

/** Ollama's native API lets us size the context window to fit the page (its default of 4096 is too small). */
export async function streamOllama(opts: {
  baseUrl: string; model: string; system: string; messages: ChatMessage[]; signal: AbortSignal; onText: (t: string) => void; onThinking?: () => void
}): Promise<string> {
  const chars = opts.system.length + opts.messages.reduce((n, m) => n + m.content.length, 0)
  let ctx = 8192
  while (ctx < chars / 3 + 6144 && ctx < 32768) ctx *= 2
  const r = await fetch(`${trimUrl(opts.baseUrl)}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: opts.model, stream: true, options: { num_ctx: ctx }, messages: [{ role: 'system', content: opts.system }, ...opts.messages] }),
    signal: opts.signal
  })
  if (!r.ok || !r.body) {
    const t = await r.text().catch(() => '')
    throw new Error(`Ollama answered ${r.status}${t ? `: ${t.slice(0, 200)}` : ''}`)
  }
  const reader = r.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let full = ''
  let thought = false
  let reason = ''
  const handle = (line: string): void => {
    if (!line.trim()) return
    let j: any
    try { j = JSON.parse(line) } catch { return }
    if (j.error) throw new Error(String(j.error))
    const piece: string = j.message?.content ?? ''
    if (piece) { full += piece; opts.onText(piece) } else if (!thought && j.message?.thinking) { thought = true; opts.onThinking?.() }
    if (j.done) reason = j.done_reason ?? ''
  }
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) { handle(buf.slice(0, nl)); buf = buf.slice(nl + 1) }
  }
  handle(buf)
  if (!full && reason === 'length') throw new Error('The model ran out of room before answering. Try a shorter page or a model with a larger context.')
  return full
}

/** Some servers stream only reasoning and never the answer; ask once more without streaming. */
async function fallback(opts: { baseUrl: string; key?: string; model: string; system: string; messages: ChatMessage[]; signal: AbortSignal; onText: (t: string) => void }): Promise<string> {
  if (opts.signal.aborted) return ''
  const r = await fetch(`${trimUrl(opts.baseUrl)}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(opts.key ? { Authorization: `Bearer ${opts.key}` } : {}) },
    body: JSON.stringify({ model: opts.model, stream: false, messages: [{ role: 'system', content: opts.system }, ...opts.messages] }),
    signal: opts.signal
  })
  if (!r.ok) throw new Error(`The model server answered ${r.status}`)
  const j = await r.json()
  const text: string = j.choices?.[0]?.message?.content ?? ''
  if (text) opts.onText(text)
  return text
}

/** Pulls ```actions fenced JSON blocks out of an assistant reply. */
export function extractActions(text: string): { clean: string; actions: AiAction[] } {
  const actions: AiAction[] = []
  const clean = text.replace(/```(?:actions|json)\s*\n([\s\S]*?)```/g, (whole, body) => {
    try {
      const parsed = JSON.parse(body)
      const list = Array.isArray(parsed) ? parsed : [parsed]
      const ok = list.filter((a) => a && typeof a === 'object' && typeof a.type === 'string')
      if (!ok.length) return whole
      actions.push(...ok)
      return ''
    } catch {
      return whole
    }
  })
  return { clean: clean.trim(), actions }
}

export type AiAction =
  | { type: 'add_task'; title: string; due?: string; time?: string; priority?: number; tags?: string[]; difficulty?: string; notes?: string; subtasks?: string[] }
  | { type: 'create_page'; title: string; pageType?: string; icon?: string; markdown?: string }
  | { type: 'append_to_page'; markdown: string }
  | { type: 'add_habit'; name: string; icon?: string; kind?: 'good' | 'bad' }
  | { type: 'add_goal'; title: string; milestones?: string[]; deadline?: string }
  | { type: 'add_journal'; text: string; mood?: number }
