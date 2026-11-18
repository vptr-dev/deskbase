import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { act, addTask, getData, openPage, setOverlay, toast, upsert, useApp, useData } from '../store'
import type { AiAction, AiConfig, ChatMessage } from '../../../shared/ai-core'
import { extractActions, providerInfo } from '../../../shared/ai-core'
import { markdownToBlocks } from '../../../shared/markdown'
import type { AppData, PageType } from '../types'
import { api } from '../lib/api'
import { COLORS, newPage, typeInfo } from '../lib/defaults'
import { pageToMarkdown } from '../lib/exporters'
import { habitDoneOn, habitScheduled } from '../lib/habits'
import { addDays, longDate, today, uid } from '../lib/util'
import { ensureEntry } from '../pages/JournalPage'
import { Icon } from './Icon'
import { Button } from './ui'

export const useAssistant = create<{ open: boolean }>(() => ({ open: false }))
export const toggleAssistant = (): void => useAssistant.setState((s) => ({ open: !s.open }))

// ---------- context ----------
function buildSystem(d: AppData, pageId: string | null): string {
  const t = today()
  const live = (pid: string): boolean => Boolean(d.pages[pid] && !d.pages[pid].deletedAt)
  const tasks = Object.values(d.tasks).filter((x) => !x.done && live(x.pageId))
  const fmt = (x: (typeof tasks)[number]): string => `- ${x.title}${x.due ? ` (due ${x.due}${x.time ? ' ' + x.time : ''})` : ''}${x.priority ? ` [priority ${x.priority}]` : ''}${x.tags.length ? ' #' + x.tags.join(' #') : ''}`
  const overdue = tasks.filter((x) => x.due && x.due < t)
  const due = tasks.filter((x) => x.due === t)
  const soon = tasks.filter((x) => x.due && x.due > t && x.due <= addDays(t, 7))
  const undated = tasks.filter((x) => !x.due).slice(0, 25)
  const habits = Object.values(d.habits).filter((h) => !h.archived && live(h.pageId) && habitScheduled(h, t))
  const goals = Object.values(d.goals).filter((g) => !g.done && live(g.pageId))
  const page = pageId ? d.pages[pageId] : undefined
  let pageText = page ? pageToMarkdown(page.id) : ''
  if (pageText.length > 12000) pageText = pageText.slice(0, 12000) + '\n…(page continues)'
  return [
    `You are the assistant inside Planner, a personal planner and life tracker app on the user's computer. Today is ${longDate(t)} (${t}). ${d.profile.name ? `The user's name is ${d.profile.name}.` : ''}`,
    'Be concise, warm and practical. Use short Markdown: brief paragraphs and bullet lists. No long preambles.',
    '',
    'When the user asks you to add, create, plan or change something in the app, also include ONE fenced code block whose language is `actions`, containing a JSON array. The user reviews and applies it. Supported actions:',
    '{"type":"add_task","title":"…","due":"YYYY-MM-DD","time":"HH:MM","priority":0-3,"tags":["…"],"notes":"…","subtasks":["…"]}',
    '{"type":"create_page","title":"…","pageType":"doc|tasks|habits|journal|goals|tracker","icon":"emoji","markdown":"page content in Markdown"}',
    '{"type":"append_to_page","markdown":"…"}  (adds to the page that is open now)',
    '{"type":"add_habit","name":"…","icon":"emoji","kind":"good|bad"}',
    '{"type":"add_goal","title":"…","milestones":["…"],"deadline":"YYYY-MM-DD"}',
    '{"type":"add_journal","text":"…","mood":1-5}',
    'Only include fields you know. Never invent actions the user did not ask for. Do not mention the JSON in your prose.',
    '',
    '## Current state',
    overdue.length ? `Overdue tasks:\n${overdue.slice(0, 25).map(fmt).join('\n')}` : 'No overdue tasks.',
    due.length ? `Due today:\n${due.map(fmt).join('\n')}` : 'Nothing due today.',
    soon.length ? `Next 7 days:\n${soon.slice(0, 25).map(fmt).join('\n')}` : '',
    undated.length ? `Tasks without a date:\n${undated.map(fmt).join('\n')}` : '',
    habits.length ? `Habits today:\n${habits.map((h) => `- ${h.name}: ${h.kind === 'bad' ? 'quitting' : habitDoneOn(h, t) ? 'done' : 'not yet'}`).join('\n')}` : '',
    goals.length ? `Active goals:\n${goals.map((g) => `- ${g.title}${g.deadline ? ` (by ${g.deadline})` : ''}`).join('\n')}` : '',
    page ? `\n## Open page: “${page.title || 'Untitled'}” (${typeInfo(page.type).name})\n${pageText}` : ''
  ].filter((x) => x !== '').join('\n')
}

// ---------- actions ----------
function findOrCreatePage(type: PageType, title: string): string {
  const d = getData()
  const found = Object.values(d.pages).find((p) => p.type === type && !p.deletedAt)
  if (found) return found.id
  const p = newPage(type, title)
  act((dr) => { dr.pages[p.id] = p; dr.rootOrder.push(p.id) })
  return p.id
}

function describe(a: AiAction): { icon: string; text: string } {
  switch (a.type) {
    case 'add_task': return { icon: '☑️', text: `Task: ${a.title}${a.due ? ` · ${a.due}${a.time ? ' ' + a.time : ''}` : ''}${a.subtasks?.length ? ` · ${a.subtasks.length} subtasks` : ''}` }
    case 'create_page': return { icon: a.icon || '📄', text: `New page: ${a.title}` }
    case 'append_to_page': return { icon: '➕', text: `Add to this page: ${a.markdown.split('\n')[0].slice(0, 60)}` }
    case 'add_habit': return { icon: a.icon || '🔁', text: `Habit: ${a.name}` }
    case 'add_goal': return { icon: '🎯', text: `Goal: ${a.title}${a.milestones?.length ? ` · ${a.milestones.length} milestones` : ''}` }
    case 'add_journal': return { icon: '📓', text: `Journal: ${a.text.slice(0, 60)}` }
    default: return { icon: '•', text: (a as any).type }
  }
}

function applyAction(a: AiAction): boolean {
  const cur = useApp.getState().current
  const d = getData()
  const PAGE_TYPES: PageType[] = ['doc', 'tasks', 'board', 'habits', 'journal', 'goals', 'tracker', 'calendar', 'focus', 'today', 'database', 'dashboard']
  switch (a.type) {
    case 'add_task': {
      if (!a.title) return false
      const here = cur && ['tasks', 'board'].includes(d.pages[cur]?.type) ? cur : findOrCreatePage('tasks', 'To-do')
      const diff = ['trivial', 'easy', 'medium', 'hard', 'epic'].includes(a.difficulty ?? '') ? (a.difficulty as any) : 'easy'
      addTask(here, {
        title: a.title,
        due: /^\d{4}-\d{2}-\d{2}$/.test(a.due ?? '') ? a.due : null,
        time: /^\d{2}:\d{2}$/.test(a.time ?? '') ? a.time : null,
        priority: Math.max(0, Math.min(3, Number(a.priority) || 0)) as 0 | 1 | 2 | 3,
        tags: (a.tags ?? []).map((t) => String(t).toLowerCase().replace(/^#/, '').replace(/\s+/g, '-')),
        difficulty: diff,
        notes: a.notes ?? '',
        subtasks: (a.subtasks ?? []).map((s) => ({ id: uid(), title: String(s), done: false }))
      })
      return true
    }
    case 'create_page': {
      const type = PAGE_TYPES.includes(a.pageType as PageType) ? (a.pageType as PageType) : 'doc'
      const p = newPage(type, a.title || 'Untitled')
      if (a.icon) p.icon = a.icon
      else if (type === 'doc') p.icon = '📄'
      if (a.markdown) p.blocks = markdownToBlocks(a.markdown)
      act((dr) => { dr.pages[p.id] = p; dr.rootOrder.push(p.id) })
      openPage(p.id)
      return true
    }
    case 'append_to_page': {
      if (!cur || !a.markdown) return false
      const blocks = markdownToBlocks(a.markdown)
      act((dr) => {
        const p = dr.pages[cur]
        if (!p) return
        const last = p.blocks[p.blocks.length - 1]
        if (last && last.type === 'p' && !last.text) p.blocks.pop()
        p.blocks.push(...blocks)
        if (p.type !== 'doc') p.view = { ...(p.view ?? {}), notes: true }
      })
      return true
    }
    case 'add_habit': {
      if (!a.name) return false
      const pid = findOrCreatePage('habits', 'Habits')
      const n = Object.keys(getData().habits).length
      upsert('habits', { id: uid(), pageId: pid, name: a.name, icon: a.icon || '✅', color: COLORS[n % COLORS.length], kind: a.kind === 'bad' ? 'bad' : 'good', target: 1, days: [0, 1, 2, 3, 4, 5, 6], log: {}, difficulty: 'easy', stat: null, createdAt: Date.now(), order: n })
      return true
    }
    case 'add_goal': {
      if (!a.title) return false
      const pid = findOrCreatePage('goals', 'Goals')
      const n = Object.keys(getData().goals).length
      upsert('goals', { id: uid(), pageId: pid, title: a.title, why: '', icon: '🎯', deadline: /^\d{4}-\d{2}-\d{2}$/.test(a.deadline ?? '') ? a.deadline : null, milestones: (a.milestones ?? []).map((m) => ({ id: uid(), title: String(m), done: false })), progressMode: 'milestones', manual: 0, color: COLORS[n % COLORS.length], done: false, createdAt: Date.now(), category: '', difficulty: 'hard', order: n })
      return true
    }
    case 'add_journal': {
      if (!a.text) return false
      const pid = findOrCreatePage('journal', 'Journal')
      const id = ensureEntry(pid, today())
      act((dr) => {
        const j = dr.journal[id]
        j.text = j.text ? `${j.text}\n\n${a.text}` : a.text
        if (a.mood && a.mood >= 1 && a.mood <= 5) j.mood = a.mood
        j.updatedAt = Date.now()
      })
      return true
    }
  }
  return false
}

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

// ---------- panel ----------
const QUICK = [
  { label: 'Plan my day', prompt: 'Look at my tasks, habits and goals and plan my day. Suggest an order and time blocks. Add tasks only if something important is missing.' },
  { label: 'Summarize this page', prompt: 'Summarize the open page in a few bullet points.' },
  { label: 'Turn this page into tasks', prompt: 'Turn the actionable items on the open page into tasks with sensible due dates.' },
  { label: 'Weekly review', prompt: 'Give me a short weekly review: what I finished, what is overdue, and three priorities for next week.' }
]

export function AssistantPanel(): JSX.Element | null {
  const open = useAssistant((s) => s.open)
  const messages = useData((d) => d.assistant.messages)
  const current = useApp((s) => s.current)
  const pageTitle = useData((d) => (current ? d.pages[current]?.title : '') ?? '')
  const [cfg, setCfg] = useState<AiConfig | null>(null)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState<{ id: string; text: string; thinking?: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { if (open) { api.ai.getConfig().then(setCfg); setTimeout(() => inputRef.current?.focus(), 50) } }, [open])
  useEffect(() => api.ai.onChunk((id, t, thinking) => setStreaming((s) => (s && s.id === id ? { id, text: s.text + t, thinking: s.thinking || !!thinking } : s))), [])
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }) }, [messages.length, streaming?.text])

  if (!open) return null

  const send = async (text: string): Promise<void> => {
    const content = text.trim()
    if (!content || streaming) return
    setError(null)
    setInput('')
    const userMsg = { id: uid(), role: 'user' as const, content, at: Date.now() }
    act((d) => { d.assistant.messages.push(userMsg) }, { history: false })
    const history: ChatMessage[] = [...getData().assistant.messages].slice(-20).map((m) => ({ role: m.role, content: m.content }))
    const id = uid()
    setStreaming({ id, text: '' })
    try {
      const full = await api.ai.chat(id, buildSystem(getData(), useApp.getState().current), history)
      if (!full.trim()) setError('The model returned an empty reply. Try again or pick another model.')
      else act((d) => { d.assistant.messages.push({ id: uid(), role: 'assistant', content: full, at: Date.now() }); if (d.assistant.messages.length > 200) d.assistant.messages.splice(0, d.assistant.messages.length - 200) }, { history: false })
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setStreaming(null)
    }
  }

  const stop = (): void => { if (streaming) api.ai.abort(streaming.id) }
  const applyAll = (msgId: string, actions: AiAction[], idx?: number): void => {
    const which = idx === undefined ? actions.map((_, i) => i) : [idx]
    let ok = 0
    for (const i of which) if (applyAction(actions[i])) ok++
    act((d) => {
      const m = d.assistant.messages.find((x) => x.id === msgId)
      if (m) m.applied = [...new Set([...(m.applied ?? []), ...which])]
    }, { history: false })
    toast(ok === 1 ? 'Added' : `Added ${ok} items`)
  }

  const ready = cfg?.model && (!providerInfo(cfg.provider).needsKey || cfg.hasKey)

  return (
    <aside className="assistant" aria-label="Assistant">
      <div className="assistant-head drag">
        <Icon name="sparkle" size={16} className="accent" />
        <span className="strong">Assistant</span>
        <span className="muted small ellipsis">{cfg?.model ? cfg.model : ''}</span>
        <div className="spacer" />
        <button className="icon-btn no-drag" title="New chat" onClick={() => act((d) => { d.assistant.messages = [] }, { history: false })}><Icon name="edit" size={14} /></button>
        <button className="icon-btn no-drag" title="Assistant settings" onClick={() => setOverlay('settings', 'assistant')}><Icon name="settings" size={14} /></button>
        <button className="icon-btn no-drag" title="Close (Ctrl+J)" onClick={toggleAssistant}><Icon name="x" size={14} /></button>
      </div>

      <div className="assistant-list" ref={listRef}>
        {!ready && cfg && (
          <div className="assistant-setup glass">
            <div className="strong">Connect a model</div>
            <p className="muted small">Use a local model with Ollama or LM Studio, or add an API key.</p>
            <Button small kind="primary" onClick={() => setOverlay('settings', 'assistant')}>Open settings</Button>
          </div>
        )}
        {ready && messages.length === 0 && !streaming && (
          <div className="assistant-quick">
            {QUICK.map((q) => <button key={q.label} className="chip-btn" onClick={() => send(q.prompt)}>{q.label}</button>)}
          </div>
        )}
        {messages.map((m) => {
          if (m.role === 'user') return <div key={m.id} className="msg user">{m.content}</div>
          const { clean, actions } = extractActions(m.content)
          return (
            <div key={m.id} className="msg bot">
              <Md text={clean} />
              {actions.length > 0 && (
                <div className="actions-card">
                  {actions.map((a, i) => {
                    const dsc = describe(a)
                    const done = m.applied?.includes(i)
                    return (
                      <div key={i} className={`action-row ${done ? 'done' : ''}`}>
                        <span>{dsc.icon}</span><span className="grow ellipsis">{dsc.text}</span>
                        {done ? <Icon name="check" size={14} className="accent" /> : <button className="link small" onClick={() => applyAll(m.id, actions, i)}>Add</button>}
                      </div>
                    )
                  })}
                  {actions.length > 1 && !actions.every((_, i) => m.applied?.includes(i)) && (
                    <Button small kind="primary" onClick={() => applyAll(m.id, actions.map((a) => a), undefined)}>Add all {actions.length}</Button>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {streaming && (
          <div className="msg bot">
            {streaming.text ? <Md text={extractActions(streaming.text).clean.replace(/```actions[\s\S]*$/, '')} /> : <div className="typing-row"><div className="typing"><span /><span /><span /></div>{streaming.thinking && <span className="muted small">Thinking…</span>}</div>}
          </div>
        )}
        {error && <div className="msg error"><Icon name="x" size={13} /> {error}</div>}
      </div>

      <div className="assistant-input glass">
        {current && pageTitle !== undefined && <div className="context-chip"><Icon name="note" size={12} /> {pageTitle || 'Untitled'}</div>}
        <textarea
          ref={inputRef}
          id="assistant-input"
          rows={2}
          placeholder={ready ? 'Ask anything, or tell me what to add' : 'Connect a model to start'}
          value={input}
          disabled={!ready}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
        />
        <div className="row">
          <div className="spacer" />
          {streaming ? <Button small icon="stop" onClick={stop}>Stop</Button> : <Button small kind="primary" icon="right" disabled={!input.trim() || !ready} onClick={() => send(input)}>Send</Button>}
        </div>
      </div>
    </aside>
  )
}

