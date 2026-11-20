import { useEffect, useMemo, useRef, useState } from 'react'
import { openView, setOverlay, toast, useApp, useData } from '../store'
import type { AiConfig, AiProvider } from '../../../shared/ai-core'
import { PROVIDERS, extractActions, extractToolCalls, providerInfo } from '../../../shared/ai-core'
import type { AssistantChat } from '../types'
import { api } from '../lib/api'
import {
  applyActions, chatOf, deleteChat, describeAction, describeTool, newChat, openChat, patchChat, retry, send, stop, toggleAssistant, useAssistant, useRun
} from '../lib/assistant'
import { Glyph, Icon } from './Icon'
import { Button, Popover } from './ui'

export { toggleAssistant, useAssistant }

// ---------- tiny Markdown renderer (no HTML injection) ----------
function inline(s: string): (string | JSX.Element)[] {
  const out: (string | JSX.Element)[] = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**')) out.push(<strong key={k++}>{tok.slice(2, -2)}</strong>)
    else if (tok.startsWith('`')) out.push(<code key={k++}>{tok.slice(1, -1)}</code>)
    else out.push(<em key={k++}>{tok.slice(1, -1)}</em>)
    last = m.index + tok.length
  }
  if (last < s.length) out.push(s.slice(last))
  return out
}

function Md({ text }: { text: string }): JSX.Element {
  const lines = text.split('\n')
  const out: JSX.Element[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let code: string[] | null = null
  const flush = (): void => {
    if (list) {
      const L = list.ordered ? 'ol' : 'ul'
      out.push(<L key={out.length}>{list.items.map((it, i) => <li key={i}>{inline(it)}</li>)}</L>)
      list = null
    }
  }
  for (const raw of lines) {
    if (raw.trim().startsWith('```')) {
      if (code) { out.push(<pre key={out.length}>{code.join('\n')}</pre>); code = null } else { flush(); code = [] }
      continue
    }
    if (code) { code.push(raw); continue }
    const t = raw.trim()
    let m: RegExpMatchArray | null
    if ((m = t.match(/^[-*]\s+(?:\[[ x]\]\s*)?(.*)$/))) { if (!list || list.ordered) { flush(); list = { ordered: false, items: [] } } list.items.push(m[1]); continue }
    if ((m = t.match(/^\d+[.)]\s+(.*)$/))) { if (!list || !list.ordered) { flush(); list = { ordered: true, items: [] } } list.items.push(m[1]); continue }
    flush()
    if (!t) continue
    if ((m = t.match(/^#{1,4}\s+(.*)$/))) out.push(<div key={out.length} className="md-h">{inline(m[1])}</div>)
    else out.push(<p key={out.length}>{inline(t)}</p>)
  }
  if (code) out.push(<pre key={out.length}>{(code as string[]).join('\n')}</pre>)
  flush()
  return <div className="md">{out}</div>
}

// ---------- model picker ----------
let cfgCache: AiConfig | null = null
function useAiConfig(): AiConfig | null {
  const [cfg, setCfg] = useState<AiConfig | null>(cfgCache)
  useEffect(() => { api.ai.getConfig().then((c) => { cfgCache = c; setCfg(c) }).catch(() => {}) }, [])
  return cfg
}

const usable = (cfg: AiConfig, p: AiProvider): boolean => providerInfo(p).local || p === 'custom' || cfg.providers[p]?.hasKey || (p === cfg.provider && cfg.hasKey)

function ModelPicker({ chat, cfg }: { chat: AssistantChat; cfg: AiConfig }): JSX.Element {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [open, setOpen] = useState<AiProvider | null>(null)
  const [models, setModels] = useState<Record<string, string[] | string>>({})
  const p = (chat.provider as AiProvider) || cfg.provider
  const model = chat.model || cfg.providers[p]?.model || (p === cfg.provider ? cfg.model : '')
  const load = (pr: AiProvider): void => {
    setOpen(open === pr ? null : pr)
    if (models[pr]) return
    api.ai.models(pr).then((m) => setModels((x) => ({ ...x, [pr]: m }))).catch((e) => setModels((x) => ({ ...x, [pr]: e?.message ?? 'Could not connect' })))
  }
  const pick = (pr: AiProvider, m: string): void => { patchChat(chat.id, (c) => { c.provider = pr; c.model = m }); void api.ai.setConfig({ target: pr, model: m }); setEl(null) }
  return (
    <>
      <button className="model-pick no-drag" title="Model for this chat" onClick={(e) => setEl(e.currentTarget)}>
        <span className="ellipsis">{providerInfo(p).short}{model ? ` · ${model}` : ''}</span><Icon name="down" size={12} />
      </button>
      {el && (
        <Popover anchor={el} onClose={() => setEl(null)} width={320}>
          <div className="model-menu">
            {PROVIDERS.filter((x) => usable(cfg, x.id)).map((x) => {
              const list = models[x.id]
              return (
                <div key={x.id} className="model-group">
                  <button className={`model-prov ${p === x.id ? 'active' : ''}`} onClick={() => load(x.id)}>
                    <span className="grow">{x.name}</span><Icon name={open === x.id ? 'up' : 'down'} size={12} />
                  </button>
                  {open === x.id && (
                    <div className="model-list">
                      {!list && <span className="muted small pad">Loading…</span>}
                      {typeof list === 'string' && <span className="danger small pad">{list}</span>}
                      {Array.isArray(list) && list.length === 0 && <span className="muted small pad">No models found</span>}
                      {Array.isArray(list) && list.slice(0, 60).map((m) => (
                        <button key={m} className={`model-item ${p === x.id && model === m ? 'active' : ''}`} onClick={() => pick(x.id, m)}>
                          <span className="ellipsis">{m}</span>{p === x.id && model === m && <Icon name="check" size={12} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            <button className="model-prov muted" onClick={() => { setEl(null); setOverlay('settings', 'assistant') }}><Icon name="settings" size={13} /> Add a provider or key</button>
          </div>
        </Popover>
      )}
    </>
  )
}

function PresetPicker({ chat }: { chat: AssistantChat }): JSX.Element {
  const presets = useData((d) => d.assistant.settings.presets)
  const [el, setEl] = useState<HTMLElement | null>(null)
  const cur = presets.find((p) => p.id === chat.preset)
  return (
    <>
      <button className={`model-pick no-drag ${cur ? 'on' : ''}`} title="Role for this chat" onClick={(e) => setEl(e.currentTarget)}>
        <Glyph value={cur?.icon ?? 'sparkle'} size={12} /><span className="ellipsis">{cur?.name ?? 'General'}</span>
      </button>
      {el && (
        <Popover anchor={el} onClose={() => setEl(null)} width={240}>
          <div className="model-menu">
            <button className={`model-item ${!cur ? 'active' : ''}`} onClick={() => { patchChat(chat.id, (c) => { c.preset = null }); setEl(null) }}><Icon name="sparkle" size={13} /><span className="grow">General</span></button>
            {presets.map((p) => (
              <button key={p.id} className={`model-item ${cur?.id === p.id ? 'active' : ''}`} title={p.instructions} onClick={() => { patchChat(chat.id, (c) => { c.preset = p.id }); setEl(null) }}>
                <Glyph value={p.icon} size={13} /><span className="grow ellipsis">{p.name}</span>
              </button>
            ))}
            <button className="model-prov muted" onClick={() => { setEl(null); setOverlay('settings', 'assistant') }}><Icon name="edit" size={13} /> Edit roles</button>
          </div>
        </Popover>
      )}
    </>
  )
}

// ---------- one chat ----------
const QUICK = [
  { label: 'Plan my day', prompt: 'Look at my tasks, habits and goals and plan my day. Suggest an order and time blocks. Add tasks only if something important is missing.' },
  { label: 'Summarize this page', prompt: 'Summarize the open page in a few bullet points.' },
  { label: 'Turn this page into tasks', prompt: 'Turn the actionable items on the open page into tasks with sensible due dates.' },
  { label: 'Weekly review', prompt: 'Give me a short weekly review: what I finished, what is overdue, and three priorities for next week.' },
  { label: 'What is coming up?', prompt: 'What do I have coming up in the next two weeks? Look at the calendar.' }
]

const ACCESS_NAME = { none: 'Sees nothing', read: 'Can read', ask: 'Asks before changes', auto: 'Makes changes' } as const

export function ChatView({ chatId, wide }: { chatId: string; wide?: boolean }): JSX.Element {
  const chat = useData((d) => chatOf(d, chatId))
  const access = useData((d) => d.assistant.settings.access)
  const current = useApp((s) => s.current)
  const pageTitle = useData((d) => (current && !current.startsWith('@') ? d.pages[current]?.title ?? null : null))
  const run = useRun((s) => s.runs[chatId])
  const cfg = useAiConfig()
  const [input, setInput] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50) }, [chatId])
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }) }, [chat?.messages.length, run?.text, run?.looking])
  if (!chat) return <div className="muted pad">This chat is gone.</div>
  const p = (chat.provider as AiProvider) || cfg?.provider || 'ollama'
  const hasModel = Boolean(chat.model || cfg?.providers[p]?.model || (cfg && p === cfg.provider && cfg.model))
  const ready = !!cfg && hasModel && usable(cfg, p)
  const busy = !!run?.stream
  const go = (text: string): void => { if (!text.trim() || busy) return; setInput(''); void send(chatId, text) }
  const visible = chat.messages.filter((m) => !m.tool)
  return (
    <div className={`chat ${wide ? 'wide' : ''}`}>
      <div className="chat-bar">
        {cfg && <ModelPicker chat={chat} cfg={cfg} />}
        <PresetPicker chat={chat} />
        <div className="spacer" />
        <button className="chat-access no-drag" title="What the assistant may see and do (Settings → Assistant)" onClick={() => setOverlay('settings', 'assistant')}>
          <Icon name={access === 'none' ? 'eye-off' : access === 'read' ? 'eye' : access === 'ask' ? 'shield' : 'zap'} size={12} />{ACCESS_NAME[access]}
        </button>
      </div>
      <div className="assistant-list" ref={listRef}>
        {cfg && !ready && (
          <div className="assistant-setup glass">
            <div className="strong">Connect a model</div>
            <p className="muted small">Use a local model with Ollama or LM Studio, or add a key for Anthropic, OpenAI, Gemini or OpenRouter.</p>
            <Button small kind="primary" onClick={() => setOverlay('settings', 'assistant')}>Open settings</Button>
          </div>
        )}
        {ready && visible.length === 0 && !busy && (
          <div className="assistant-quick">
            {QUICK.map((q) => <button key={q.label} className="chip-btn" onClick={() => go(q.prompt)}>{q.label}</button>)}
          </div>
        )}
        {visible.map((m) => {
          if (m.role === 'user') return <div key={m.id} className="msg user">{m.content}</div>
          const { calls, clean: noTools } = extractToolCalls(m.content)
          const { clean, actions } = extractActions(noTools)
          return (
            <div key={m.id} className="msg bot">
              {calls.length > 0 && <div className="tool-notes">{calls.map((c, i) => <span key={i} className="tool-note"><Icon name="search" size={11} />{describeTool(c)}</span>)}</div>}
              {clean && <Md text={clean} />}
              {actions.length > 0 && (
                <div className="actions-card">
                  {actions.map((a, i) => {
                    const dsc = describeAction(a)
                    const done = m.applied?.includes(i)
                    return (
                      <div key={i} className={`action-row ${done ? 'done' : ''}`}>
                        <Glyph value={dsc.icon} size={15} /><span className="grow ellipsis">{dsc.text}</span>
                        {done ? <Icon name="check" size={14} className="accent" /> : access === 'none' || access === 'read' ? null : <button className="link small" onClick={() => { applyActions(chatId, m.id, actions, [i]); toast('Done', { undo: true }) }}>Do it</button>}
                      </div>
                    )
                  })}
                  {actions.length > 1 && !actions.every((_, i) => m.applied?.includes(i)) && (access === 'ask' || access === 'auto') && (
                    <Button small kind="primary" onClick={() => { const n = applyActions(chatId, m.id, actions); toast(`Made ${n} changes`, { undo: true }) }}>Do all {actions.length}</Button>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {busy && (
          <div className="msg bot">
            {run.looking && <div className="tool-notes"><span className="tool-note live"><Icon name="search" size={11} />{run.looking}</span></div>}
            {run.text && !/^\s*```tool/.test(run.text) ? <Md text={extractActions(extractToolCalls(run.text).clean).clean.replace(/```(actions|tool)[\s\S]*$/, '')} /> : <div className="typing-row"><div className="typing"><span /><span /><span /></div>{run.thinking && <span className="muted small">Thinking…</span>}</div>}
          </div>
        )}
        {run?.error && <div className="msg error"><Icon name="x" size={13} /> {run.error} <button className="link small" onClick={() => retry(chatId)}>Try again</button></div>}
      </div>
      <div className="assistant-input glass">
        {pageTitle !== null && access !== 'none' && <div className="context-chip"><Icon name="note" size={12} /> {pageTitle || 'Untitled'}</div>}
        <textarea ref={inputRef} rows={2} placeholder={ready ? 'Ask anything, or tell me what to do' : 'Connect a model to start'} value={input} disabled={!ready}
          onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(input) } }} />
        <div className="row gap-sm">
          {visible.length > 1 && !busy && <button className="link small muted" onClick={() => retry(chatId)}>Answer again</button>}
          <div className="spacer" />
          {busy ? <Button small icon="stop" onClick={() => stop(chatId)}>Stop</Button> : <Button small kind="primary" icon="right" disabled={!input.trim() || !ready} onClick={() => go(input)}>Send</Button>}
        </div>
      </div>
    </div>
  )
}

// ---------- chat list ----------
function ChatRow({ c, active, onPick }: { c: AssistantChat; active: boolean; onPick: () => void }): JSX.Element {
  const [renaming, setRenaming] = useState(false)
  const running = useRun((s) => !!s.runs[c.id]?.stream)
  if (renaming) return <input className="input input-sm chat-rename" autoFocus defaultValue={c.title} onBlur={(e) => { const t = e.target.value.trim(); if (t) patchChat(c.id, (x) => { x.title = t }); setRenaming(false) }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur() }} />
  return (
    <div className={`chat-row ${active ? 'active' : ''}`} onClick={onPick} onDoubleClick={() => setRenaming(true)}>
      {c.pinned ? <Icon name="pin" size={12} className="accent" /> : running ? <span className="dot-live" /> : <Icon name="sparkle" size={12} className="muted" />}
      <span className="grow ellipsis">{c.title || 'New chat'}</span>
      <span className="chat-row-actions">
        <button className="icon-btn" title={c.pinned ? 'Unpin' : 'Pin'} onClick={(e) => { e.stopPropagation(); patchChat(c.id, (x) => { x.pinned = !x.pinned }) }}><Icon name="pin" size={12} /></button>
        <button className="icon-btn" title="Rename" onClick={(e) => { e.stopPropagation(); setRenaming(true) }}><Icon name="edit" size={12} /></button>
        <button className="icon-btn danger" title="Delete" onClick={(e) => { e.stopPropagation(); deleteChat(c.id) }}><Icon name="trash" size={12} /></button>
      </span>
    </div>
  )
}

export function ChatList({ onPick }: { onPick?: () => void }): JSX.Element {
  const chats = useData((d) => d.assistant.chats)
  const active = useData((d) => d.assistant.active)
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const ql = q.trim().toLowerCase()
    const hit = (c: AssistantChat): boolean => !ql || c.title.toLowerCase().includes(ql) || c.messages.some((m) => !m.tool && m.content.toLowerCase().includes(ql))
    return [...chats].filter(hit).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt)
  }, [chats, q])
  const pinned = list.filter((c) => c.pinned)
  const rest = list.filter((c) => !c.pinned)
  const pick = (id: string): void => { openChat(id); onPick?.() }
  return (
    <div className="chat-list">
      <div className="chat-search"><Icon name="search" size={13} /><input placeholder="Search chats" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {pinned.length > 0 && <><div className="section-label">Pinned</div>{pinned.map((c) => <ChatRow key={c.id} c={c} active={c.id === active} onPick={() => pick(c.id)} />)}</>}
      {rest.length > 0 && <>{pinned.length > 0 && <div className="section-label">Chats</div>}{rest.map((c) => <ChatRow key={c.id} c={c} active={c.id === active} onPick={() => pick(c.id)} />)}</>}
      {!list.length && <div className="muted small pad">{q ? 'No chats match.' : 'No chats yet.'}</div>}
    </div>
  )
}

function useActiveChat(): string | null {
  const active = useData((d) => d.assistant.active)
  const exists = useData((d) => d.assistant.chats.some((c) => c.id === d.assistant.active))
  useEffect(() => { if (!exists) newChat(false) }, [exists])
  return exists ? active : null
}

// ---------- side panel ----------
export function AssistantPanel(): JSX.Element | null {
  const open = useAssistant((s) => s.open)
  const current = useApp((s) => s.current)
  if (!open || current === '@assistant') return null
  return <SidePanel />
}

function SidePanel(): JSX.Element {
  const id = useActiveChat()
  const title = useData((d) => chatOf(d, d.assistant.active)?.title ?? '')
  const [listEl, setListEl] = useState<HTMLElement | null>(null)
  return (
    <aside className="assistant" aria-label="Assistant">
      <div className="assistant-head drag">
        <button className="chat-title no-drag" title="Chats" onClick={(e) => setListEl(e.currentTarget)}>
          <Icon name="sparkle" size={15} className="accent" /><span className="strong ellipsis">{title && title !== 'New chat' ? title : 'Assistant'}</span><Icon name="down" size={12} />
        </button>
        <div className="spacer" />
        <button className="icon-btn no-drag" title="New chat" onClick={() => newChat()}><Icon name="edit" size={14} /></button>
        <button className="icon-btn no-drag" title="Open as a page" onClick={() => openView('@assistant')}><Icon name="expand" size={14} /></button>
        <button className="icon-btn no-drag" title="Close (Ctrl+J)" onClick={toggleAssistant}><Icon name="x" size={14} /></button>
        <div className="caption-space" />
      </div>
      {listEl && <Popover anchor={listEl} onClose={() => setListEl(null)} width={300}><div className="chat-pop"><ChatList onPick={() => setListEl(null)} /></div></Popover>}
      {id && <ChatView key={id} chatId={id} />}
    </aside>
  )
}

// ---------- full page ----------
export function AssistantPage(): JSX.Element {
  const id = useActiveChat()
  return (
    <div className="page full page-assistant">
      <div className="assistant-page">
        <div className="assistant-side">
          <div className="row gap-sm">
            <Button small kind="primary" icon="plus" onClick={() => newChat(false)}>New chat</Button>
            <div className="spacer" />
            <button className="icon-btn" title="Assistant settings" onClick={() => setOverlay('settings', 'assistant')}><Icon name="settings" size={14} /></button>
          </div>
          <ChatList />
        </div>
        <div className="assistant-main glass">
          {id && <ChatView key={id} chatId={id} wide />}
        </div>
      </div>
    </div>
  )
}
