// The assistant: chats, what the model is told, the lookups it can ask for, and the changes it can make.
// Lookups use a provider-neutral text protocol (```tool blocks) so local models work too; changes are
// ```actions blocks that the user approves, or that are applied straight away when access is "auto".
import { create } from 'zustand'
import { emojiToIcon } from '../../../shared/emoji-icons'
import { type AiAction, type AiToolCall, type ChatMessage, extractActions, extractToolCalls } from '../../../shared/ai-core'
import { markdownToBlocks } from '../../../shared/markdown'
import { act, addTask, getData, openPage, setTaskDone, toast, upsert, useApp } from '../store'
import type { AppData, AssistantChat, AssistantMessage, AssistantSettings, Page, PageType } from '../types'
import { api } from './api'
import { COLORS, newPage, typeInfo } from './defaults'
import { addOption, addRow, cellValue, datedRows, propText, rowsOf, setRowProp } from './db'
import { pageToMarkdown } from './exporters'
import { habitDoneOn, habitScheduled } from './habits'
import { plainText } from './links'
import { addDays, longDate, today, uid } from './util'
import { ensureEntry } from '../pages/JournalPage'

// ---------- chats ----------
export const chatOf = (d: AppData, id: string | null | undefined): AssistantChat | undefined => (id ? d.assistant.chats.find((c) => c.id === id) : undefined)

export function newChat(open = true): string {
  const id = uid()
  const now = Date.now()
  act((d) => {
    const cur = chatOf(d, d.assistant.active)
    // Reuse an empty chat instead of piling them up.
    if (cur && !cur.messages.length) { d.assistant.active = cur.id; return }
    d.assistant.chats.unshift({ id, title: 'New chat', createdAt: now, updatedAt: now, messages: [], provider: cur?.provider ?? null, model: cur?.model ?? null, preset: null })
    d.assistant.active = id
  }, { history: false })
  if (open) useAssistant.setState({ open: true })
  return getData().assistant.active ?? id
}

export const openChat = (id: string): void => act((d) => { d.assistant.active = id }, { history: false })
export const patchChat = (id: string, fn: (c: AssistantChat) => void): void => act((d) => { const c = chatOf(d, id); if (c) fn(c) }, { history: false })

export function deleteChat(id: string): void {
  act((d) => {
    d.assistant.chats = d.assistant.chats.filter((c) => c.id !== id)
    if (d.assistant.active === id) d.assistant.active = d.assistant.chats[0]?.id ?? null
  })
  toast('Chat deleted', { undo: true })
}

export const useAssistant = create<{ open: boolean }>(() => ({ open: false }))
export const toggleAssistant = (): void => useAssistant.setState((s) => ({ open: !s.open }))

/** A reply being written, per chat. */
export const useRun = create<{ runs: Record<string, { stream: string; text: string; thinking?: boolean; looking?: string; error?: string | null }> }>(() => ({ runs: {} }))
const setRun = (chatId: string, patch: Partial<{ stream: string; text: string; thinking?: boolean; looking?: string; error?: string | null }> | null): void =>
  useRun.setState((s) => {
    const runs = { ...s.runs }
    if (patch === null) delete runs[chatId]
    else runs[chatId] = { ...(runs[chatId] ?? { stream: '', text: '' }), ...patch }
    return { runs }
  })

let chunkWired = false
function wireChunks(): void {
  if (chunkWired) return
  chunkWired = true
  api.ai.onChunk((id, t, thinking) => useRun.setState((s) => {
    const entry = Object.entries(s.runs).find(([, r]) => r.stream === id)
    if (!entry) return s
    const [cid, r] = entry
    return { runs: { ...s.runs, [cid]: { ...r, text: r.text + t, thinking: r.thinking || !!thinking, looking: t ? undefined : r.looking } } }
  }))
}

// ---------- what the model is told ----------
const LENGTH_TOKENS = { short: 700, normal: null, long: 12000 } as const

function workspaceState(d: AppData): string {
  const t = today()
  const live = (pid: string): boolean => Boolean(d.pages[pid] && !d.pages[pid].deletedAt)
  const tasks = Object.values(d.tasks).filter((x) => !x.done && live(x.pageId))
  const fmt = (x: (typeof tasks)[number]): string => `- [${x.id}] ${x.title}${x.due ? ` (due ${x.due}${x.time ? ' ' + x.time : ''})` : ''}${x.priority ? ` [priority ${x.priority}]` : ''}${x.tags.length ? ' #' + x.tags.join(' #') : ''}`
  const overdue = tasks.filter((x) => x.due && x.due < t)
  const due = tasks.filter((x) => x.due === t)
  const soon = tasks.filter((x) => x.due && x.due > t && x.due <= addDays(t, 7))
  const habits = Object.values(d.habits).filter((h) => !h.archived && live(h.pageId) && habitScheduled(h, t))
  const goals = Object.values(d.goals).filter((g) => !g.done && live(g.pageId))
  const rows = datedRows(d.pages).filter((r) => !r.done && r.due >= addDays(t, -7) && r.due <= addDays(t, 7))
  const pages = Object.values(d.pages).filter((p) => !p.deletedAt && !p.rowOf && !p.template)
  return [
    '## Current state',
    overdue.length ? `Overdue tasks:\n${overdue.slice(0, 25).map(fmt).join('\n')}` : 'No overdue tasks.',
    due.length ? `Due today:\n${due.map(fmt).join('\n')}` : 'Nothing due today.',
    soon.length ? `Next 7 days:\n${soon.slice(0, 25).map(fmt).join('\n')}` : '',
    rows.length ? `Dated database rows:\n${rows.slice(0, 20).map((r) => `- ${r.title} (${r.db}, ${r.due})`).join('\n')}` : '',
    habits.length ? `Habits today:\n${habits.map((h) => `- ${h.name}: ${h.kind === 'bad' ? 'quitting' : habitDoneOn(h, t) ? 'done' : 'not yet'}`).join('\n')}` : '',
    goals.length ? `Active goals:\n${goals.map((g) => `- ${g.title}${g.deadline ? ` (by ${g.deadline})` : ''}`).join('\n')}` : '',
    `Pages (${pages.length}): ${pages.slice(0, 60).map((p) => `"${p.title || 'Untitled'}"${p.type === 'database' ? ' (database)' : ''}`).join(', ')}`
  ].filter(Boolean).join('\n')
}

const TOOL_TEXT = `## Looking things up
To read something that is not shown here, reply with only a fenced code block whose language is \`tool\` and stop; the app answers with the results and you continue. You may ask for several at once as a JSON array.
{"name":"search","args":{"query":"…"}}  pages, tasks and database rows that mention it
{"name":"read_page","args":{"page":"page title"}}  a page's content (a database lists its rows)
{"name":"list_tasks","args":{"filter":"today|overdue|week|undated|done|all","page":"optional page title"}}
{"name":"calendar","args":{"from":"YYYY-MM-DD","to":"YYYY-MM-DD"}}  tasks, dated rows and deadlines between two days
Never guess what a page says; look it up.`

const ACTION_TEXT = (auto: boolean): string => `## Making changes
When the user asks you to add, create, plan or change something, also include ONE fenced code block whose language is \`actions\`, containing a JSON array.${auto ? ' The app applies it right away (the user can undo).' : ' The user reviews it and applies it.'} Supported actions:
{"type":"add_task","title":"…","due":"YYYY-MM-DD","time":"HH:MM","priority":0-3,"tags":["…"],"notes":"…","subtasks":["…"]}
{"type":"complete_task","id":"task id"}
{"type":"update_task","id":"task id","title":"…","due":"YYYY-MM-DD or null","time":"HH:MM","priority":0-3,"notes":"…"}
{"type":"create_page","title":"…","pageType":"doc|tasks|habits|journal|goals|tracker","icon":"emoji","markdown":"page content in Markdown"}
{"type":"append_to_page","markdown":"…","page":"page title (leave out for the open page)"}
{"type":"rename_page","page":"current title","title":"new title"}
{"type":"add_row","database":"database title","title":"…","props":{"Property name":"value"}}
{"type":"add_habit","name":"…","icon":"emoji","kind":"good|bad"}
{"type":"add_goal","title":"…","milestones":["…"],"deadline":"YYYY-MM-DD"}
{"type":"add_journal","text":"…","mood":1-5}
Task ids are the [ids] shown in lists. Only include fields you know. Never invent changes the user did not ask for. Do not mention the JSON in your prose.`

export function buildSystem(d: AppData, chat: AssistantChat, pageId: string | null): string {
  const st = d.assistant.settings
  const t = today()
  const preset = st.presets.find((p) => p.id === chat.preset)
  const page = pageId && !pageId.startsWith('@') ? d.pages[pageId] : undefined
  let pageText = page && st.access !== 'none' ? pageToMarkdown(page.id) : ''
  if (pageText.length > 12000) pageText = pageText.slice(0, 12000) + '\n…(page continues; use read_page for the rest)'
  return [
    `You are the assistant inside Deskbase, the user's personal workspace app on their computer (pages, tasks, databases, habits, notes and desktop panels). Today is ${longDate(t)} (${t}).`,
    `Be warm and practical. Use short Markdown: brief paragraphs and bullet lists. No long preambles.${st.length === 'short' ? ' Keep answers very short.' : st.length === 'long' ? ' Give full, detailed answers when it helps.' : ''}`,
    st.instructions.trim() ? `## About the user and how to answer\n${st.instructions.trim()}` : '',
    preset?.instructions ? `## Role\n${preset.instructions}` : '',
    st.access === 'none' ? 'You cannot see the user\'s workspace; answer from the conversation only.' : workspaceState(d),
    st.access !== 'none' ? TOOL_TEXT : '',
    st.access === 'ask' || st.access === 'auto' ? ACTION_TEXT(st.access === 'auto') : st.access === 'read' ? 'You can read but not change anything; tell the user what to do instead.' : '',
    page ? `\n## Open page: “${page.title || 'Untitled'}” (${typeInfo(page.type).name})\n${pageText}` : ''
  ].filter(Boolean).join('\n\n')
}

// ---------- lookups ----------
const norm = (s: string): string => plainText(s ?? '').toLowerCase().trim()
function findPage(d: AppData, name: unknown, type?: PageType): Page | undefined {
  const n = norm(String(name ?? ''))
  if (!n) return undefined
  const live = Object.values(d.pages).filter((p) => !p.deletedAt && !p.template && (!type || p.type === type))
  return d.pages[String(name)] && !d.pages[String(name)].deletedAt ? d.pages[String(name)] : live.find((p) => norm(p.title) === n) ?? live.find((p) => norm(p.title).includes(n))
}

function rowsText(d: AppData, db: Page, limit = 60): string {
  const props = db.db?.props ?? []
  const rows = rowsOf(d, db.id)
  return [`Database "${db.title}" with ${rows.length} rows. Columns: Name, ${props.map((p) => `${p.name} (${p.type})`).join(', ')}`,
    ...rows.slice(0, limit).map((r) => `- ${r.title || 'Untitled'}${props.map((p) => { const v = propText(p, cellValue(d, r, p)); return v ? ` | ${p.name}: ${v}` : '' }).join('')}`),
    rows.length > limit ? `…and ${rows.length - limit} more` : ''].filter(Boolean).join('\n')
}

function runTool(d: AppData, c: AiToolCall): string {
  const a = c.args ?? {}
  const t = today()
  const live = (pid: string): boolean => Boolean(d.pages[pid] && !d.pages[pid].deletedAt)
  const taskLine = (x: AppData['tasks'][string]): string => `- [${x.id}] ${x.done ? '(done) ' : ''}${x.title}${x.due ? ` (due ${x.due}${x.time ? ' ' + x.time : ''})` : ''}${x.notes ? ` — ${x.notes.slice(0, 120)}` : ''} [page: ${d.pages[x.pageId]?.title ?? ''}]`
  switch (c.name) {
    case 'search': {
      const q = norm(String(a.query ?? ''))
      if (!q) return 'search needs a query.'
      const out: string[] = []
      for (const p of Object.values(d.pages)) {
        if (p.deletedAt || p.template) continue
        const inTitle = norm(p.title).includes(q)
        const hit = p.blocks.find((b) => norm(b.text ?? '').includes(q))
        if (inTitle || hit) out.push(`- ${p.rowOf ? `Row of "${d.pages[p.rowOf]?.title}": ` : 'Page: '}"${p.title || 'Untitled'}"${hit ? ` — …${plainText(hit.text ?? '').slice(0, 160)}…` : ''}`)
        if (out.length >= 15) break
      }
      for (const x of Object.values(d.tasks)) if (live(x.pageId) && (norm(x.title).includes(q) || norm(x.notes).includes(q))) { out.push(taskLine(x)); if (out.length >= 25) break }
      return out.length ? `Results for "${a.query}":\n${out.join('\n')}` : `Nothing mentions "${a.query}".`
    }
    case 'read_page': {
      const p = findPage(d, a.page)
      if (!p) return `There is no page called "${a.page}".`
      if (p.type === 'database') return rowsText(d, p)
      const body = pageToMarkdown(p.id)
      const tasks = Object.values(d.tasks).filter((x) => x.pageId === p.id)
      return `Page "${p.title || 'Untitled'}" (${typeInfo(p.type).name}):\n${body.slice(0, 16000)}${tasks.length ? `\nTasks on this page:\n${tasks.slice(0, 60).map(taskLine).join('\n')}` : ''}`
    }
    case 'list_tasks': {
      const f = String(a.filter ?? 'all')
      const pg = a.page ? findPage(d, a.page) : undefined
      let list = Object.values(d.tasks).filter((x) => live(x.pageId) && (!pg || x.pageId === pg.id))
      list = f === 'done' ? list.filter((x) => x.done) : list.filter((x) => !x.done)
      if (f === 'today') list = list.filter((x) => x.due === t)
      if (f === 'overdue') list = list.filter((x) => x.due && x.due < t)
      if (f === 'week') list = list.filter((x) => x.due && x.due >= t && x.due <= addDays(t, 7))
      if (f === 'undated') list = list.filter((x) => !x.due)
      list.sort((x, y) => (x.due ?? '9').localeCompare(y.due ?? '9'))
      return list.length ? `${list.length} tasks:\n${list.slice(0, 80).map(taskLine).join('\n')}` : 'No tasks match.'
    }
    case 'calendar': {
      const from = /^\d{4}-\d{2}-\d{2}$/.test(a.from) ? a.from : t
      const to = /^\d{4}-\d{2}-\d{2}$/.test(a.to) ? a.to : addDays(from, 7)
      const items: [string, string][] = []
      for (const x of Object.values(d.tasks)) if (live(x.pageId) && x.due && x.due >= from && x.due <= to) items.push([x.due, `${x.due}${x.time ? ' ' + x.time : ''} task ${x.done ? '(done) ' : ''}[${x.id}] ${x.title}`])
      for (const r of datedRows(d.pages)) if (r.due >= from && r.due <= to) items.push([r.due, `${r.due} ${r.db}: ${r.title}${r.done ? ' (done)' : ''}`])
      for (const c2 of d.countdowns) if (c2.date >= from && c2.date <= to) items.push([c2.date, `${c2.date} deadline: ${c2.title}`])
      items.sort((x, y) => x[0].localeCompare(y[0]))
      return items.length ? `${from} to ${to}:\n${items.map((x) => '- ' + x[1]).join('\n')}` : `Nothing between ${from} and ${to}.`
    }
    default: return `There is no lookup called "${c.name}".`
  }
}

export const describeTool = (c: AiToolCall): string => {
  const a = c.args ?? {}
  switch (c.name) {
    case 'search': return `Searched “${a.query ?? ''}”`
    case 'read_page': return `Read ${a.page ?? 'a page'}`
    case 'list_tasks': return `Listed ${a.filter && a.filter !== 'all' ? a.filter + ' ' : ''}tasks`
    case 'calendar': return 'Looked at the calendar'
    default: return c.name
  }
}

// ---------- changes ----------
function findOrCreatePage(type: PageType, title: string): string {
  const d = getData()
  const found = Object.values(d.pages).find((p) => p.type === type && !p.deletedAt && !p.template)
  if (found) return found.id
  const p = newPage(type, title)
  act((dr) => { dr.pages[p.id] = p; dr.rootOrder.push(p.id) })
  return p.id
}

export function describeAction(a: AiAction): { icon: string; text: string } {
  const d = getData()
  switch (a.type) {
    case 'add_task': return { icon: 'square-check-big', text: `Task: ${a.title}${a.due ? ` · ${a.due}${a.time ? ' ' + a.time : ''}` : ''}${a.subtasks?.length ? ` · ${a.subtasks.length} subtasks` : ''}` }
    case 'complete_task': return { icon: 'check', text: `Done: ${d.tasks[a.id]?.title ?? 'a task'}` }
    case 'update_task': return { icon: 'edit', text: `Change: ${d.tasks[a.id]?.title ?? 'a task'}${a.due ? ` → ${a.due}` : ''}${a.title ? ` → “${a.title}”` : ''}` }
    case 'create_page': return { icon: a.icon || 'file-text', text: `New page: ${a.title}` }
    case 'append_to_page': return { icon: 'plus', text: `Add to ${a.page ? `“${a.page}”` : 'this page'}: ${a.markdown.split('\n')[0].slice(0, 60)}` }
    case 'rename_page': return { icon: 'edit', text: `Rename “${a.page}” to “${a.title}”` }
    case 'add_row': return { icon: 'database', text: `Row in ${a.database}: ${a.title}` }
    case 'add_habit': return { icon: a.icon || 'repeat', text: `Habit: ${a.name}` }
    case 'add_goal': return { icon: 'target', text: `Goal: ${a.title}${a.milestones?.length ? ` · ${a.milestones.length} milestones` : ''}` }
    case 'add_journal': return { icon: 'notebook-pen', text: `Journal: ${a.text.slice(0, 60)}` }
    default: return { icon: 'circle', text: (a as any).type }
  }
}

const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

export function applyAction(a: AiAction): boolean {
  const cur = useApp.getState().current
  const d = getData()
  const PAGE_TYPES: PageType[] = ['doc', 'tasks', 'board', 'habits', 'journal', 'goals', 'tracker', 'calendar', 'focus', 'today', 'database', 'dashboard']
  switch (a.type) {
    case 'add_task': {
      if (!a.title) return false
      const here = cur && ['tasks', 'board'].includes(d.pages[cur]?.type) ? cur : findOrCreatePage('tasks', 'To-do')
      const diff = ['trivial', 'easy', 'medium', 'hard', 'epic'].includes(a.difficulty ?? '') ? (a.difficulty as any) : 'easy'
      addTask(here, {
        title: a.title, due: isDay(a.due) ? a.due : null, time: /^\d{2}:\d{2}$/.test(a.time ?? '') ? a.time : null,
        priority: Math.max(0, Math.min(3, Number(a.priority) || 0)) as 0 | 1 | 2 | 3,
        tags: (a.tags ?? []).map((t) => String(t).toLowerCase().replace(/^#/, '').replace(/\s+/g, '-')),
        difficulty: diff, notes: a.notes ?? '', subtasks: (a.subtasks ?? []).map((s) => ({ id: uid(), title: String(s), done: false }))
      })
      return true
    }
    case 'complete_task': if (!d.tasks[a.id]) return false; setTaskDone(a.id, true); return true
    case 'update_task': {
      if (!d.tasks[a.id]) return false
      act((dr) => {
        const x = dr.tasks[a.id]
        if (a.title) x.title = a.title
        if (a.due === null || isDay(a.due)) x.due = a.due
        if (a.time === null || /^\d{2}:\d{2}$/.test(a.time ?? '')) x.time = a.time ?? null
        if (a.priority !== undefined) x.priority = Math.max(0, Math.min(3, Number(a.priority) || 0)) as 0 | 1 | 2 | 3
        if (typeof a.notes === 'string') x.notes = a.notes
      })
      return true
    }
    case 'create_page': {
      const type = PAGE_TYPES.includes(a.pageType as PageType) ? (a.pageType as PageType) : 'doc'
      const p = newPage(type, a.title || 'Untitled')
      if (a.icon) p.icon = emojiToIcon(a.icon, 'file-text')
      if (a.markdown) p.blocks = markdownToBlocks(a.markdown)
      act((dr) => { dr.pages[p.id] = p; dr.rootOrder.push(p.id) })
      openPage(p.id)
      return true
    }
    case 'append_to_page': {
      const target = a.page ? findPage(d, a.page)?.id : cur && !cur.startsWith('@') ? cur : null
      if (!target || !a.markdown) return false
      const blocks = markdownToBlocks(a.markdown)
      act((dr) => {
        const p = dr.pages[target]
        if (!p) return
        const last = p.blocks[p.blocks.length - 1]
        if (last && last.type === 'p' && !last.text) p.blocks.pop()
        p.blocks.push(...blocks)
        if (p.type !== 'doc') p.view = { ...(p.view ?? {}), notes: true }
      })
      return true
    }
    case 'rename_page': {
      const p = findPage(d, a.page)
      if (!p || !a.title) return false
      act((dr) => { dr.pages[p.id].title = a.title; dr.pages[p.id].updatedAt = Date.now() })
      return true
    }
    case 'add_row': {
      const db = findPage(d, a.database, 'database')
      if (!db?.db) return false
      const id = addRow(db.id, {}, a.title || '')
      for (const [name, raw] of Object.entries(a.props ?? {})) {
        const prop = getData().pages[db.id]?.db?.props.find((p) => norm(p.name) === norm(name))
        if (!prop || raw === null || raw === undefined) continue
        const v = String(raw)
        if (prop.type === 'number' || prop.type === 'progress') { const n = Number(v); if (Number.isFinite(n)) setRowProp(id, prop.id, n) }
        else if (prop.type === 'checkbox') setRowProp(id, prop.id, raw === true || /^(true|yes|1|done)$/i.test(v))
        else if (prop.type === 'date') { if (isDay(v)) setRowProp(id, prop.id, v) }
        else if (prop.type === 'select' || prop.type === 'status') {
          const o = prop.options?.find((x) => norm(x.name) === norm(v))
          setRowProp(id, prop.id, o?.id ?? addOption(db.id, prop.id, v))
        } else if (prop.type === 'multi') {
          const ids = (Array.isArray(raw) ? raw : v.split(',')).map((x) => String(x).trim()).filter(Boolean).map((n) => getData().pages[db.id]?.db?.props.find((p) => p.id === prop.id)?.options?.find((o) => norm(o.name) === norm(n))?.id ?? addOption(db.id, prop.id, n))
          setRowProp(id, prop.id, ids)
        } else if (prop.type === 'text' || prop.type === 'url') setRowProp(id, prop.id, v)
      }
      return true
    }
    case 'add_habit': {
      if (!a.name) return false
      const pid = findOrCreatePage('habits', 'Habits')
      const n = Object.keys(getData().habits).length
      upsert('habits', { id: uid(), pageId: pid, name: a.name, icon: emojiToIcon(a.icon, 'circle-check'), color: COLORS[n % COLORS.length], kind: a.kind === 'bad' ? 'bad' : 'good', target: 1, days: [0, 1, 2, 3, 4, 5, 6], log: {}, difficulty: 'easy', stat: null, createdAt: Date.now(), order: n })
      return true
    }
    case 'add_goal': {
      if (!a.title) return false
      const pid = findOrCreatePage('goals', 'Goals')
      const n = Object.keys(getData().goals).length
      upsert('goals', { id: uid(), pageId: pid, title: a.title, why: '', icon: 'target', deadline: isDay(a.deadline) ? a.deadline : null, milestones: (a.milestones ?? []).map((m) => ({ id: uid(), title: String(m), done: false })), progressMode: 'milestones', manual: 0, color: COLORS[n % COLORS.length], done: false, createdAt: Date.now(), category: '', difficulty: 'hard', order: n })
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

/** Applies some of a reply's actions and marks them done on the message. */
export function applyActions(chatId: string, msgId: string, actions: AiAction[], which?: number[]): number {
  const list = which ?? actions.map((_, i) => i)
  let ok = 0
  for (const i of list) if (actions[i] && applyAction(actions[i])) ok++
  act((d) => {
    const m = chatOf(d, chatId)?.messages.find((x) => x.id === msgId)
    if (m) m.applied = [...new Set([...(m.applied ?? []), ...list])]
  }, { history: false })
  return ok
}

// ---------- sending ----------
const MAX_LOOKUPS = 5

function push(chatId: string, m: AssistantMessage): void {
  act((d) => {
    const c = chatOf(d, chatId)
    if (!c) return
    c.messages.push(m)
    c.updatedAt = Date.now()
    if (c.messages.length > 400) c.messages.splice(0, c.messages.length - 400)
    if (m.role === 'user' && !m.tool && (c.title === 'New chat' || !c.title)) c.title = m.content.replace(/\s+/g, ' ').slice(0, 48)
  }, { history: false })
}

export async function send(chatId: string, text: string, settings?: Partial<AssistantSettings>): Promise<void> {
  wireChunks()
  const content = text.trim()
  if (!content || useRun.getState().runs[chatId]?.stream) return
  push(chatId, { id: uid(), role: 'user', content, at: Date.now() })
  setRun(chatId, { error: null })
  try {
    for (let round = 0; round <= MAX_LOOKUPS; round++) {
      const d = getData()
      const chat = chatOf(d, chatId)
      if (!chat) break
      const st = { ...d.assistant.settings, ...(settings ?? {}) }
      const history: ChatMessage[] = chat.messages.slice(-30).map((m) => ({ role: m.role, content: m.content }))
      const stream = uid()
      setRun(chatId, { stream, text: '', thinking: false })
      const full = await api.ai.chat(stream, buildSystem(d, chat, useApp.getState().current), history, {
        provider: (chat.provider as any) || undefined, model: chat.model || undefined,
        temperature: st.temperature, maxTokens: LENGTH_TOKENS[st.length], effort: st.effort
      })
      if (!useRun.getState().runs[chatId]?.stream) return
      if (!full.trim()) { setRun(chatId, { stream: '', error: 'The model returned an empty reply. Try again or pick another model.' }); return }
      const { calls } = extractToolCalls(full)
      push(chatId, { id: uid(), role: 'assistant', content: full, at: Date.now() })
      if (calls.length && st.access !== 'none' && round < MAX_LOOKUPS) {
        setRun(chatId, { looking: calls.map(describeTool).join(', ') })
        const now = getData()
        push(chatId, { id: uid(), role: 'user', tool: true, content: `Lookup results (from the app, not the user):\n\n${calls.map((c) => `### ${describeTool(c)}\n${runTool(now, c)}`).join('\n\n')}`, at: Date.now() })
        continue
      }
      // Changes: applied at once with access "auto", otherwise shown to approve.
      const { actions } = extractActions(full)
      if (actions.length && st.access === 'auto') {
        const last = chatOf(getData(), chatId)?.messages.slice(-1)[0]
        if (last) { const n = applyActions(chatId, last.id, actions); if (n) toast(n === 1 ? 'Done' : `Made ${n} changes`, { undo: true }) }
      }
      break
    }
    setRun(chatId, null)
  } catch (e: any) {
    setRun(chatId, { stream: '', error: e?.message ?? String(e) })
  }
}

export function stop(chatId: string): void {
  const r = useRun.getState().runs[chatId]
  if (r?.stream) void api.ai.abort(r.stream)
  setRun(chatId, null)
}

export function retry(chatId: string): void {
  const c = chatOf(getData(), chatId)
  if (!c) return
  let i = c.messages.length - 1
  while (i >= 0 && (c.messages[i].role !== 'user' || c.messages[i].tool)) i--
  if (i < 0) return
  const text = c.messages[i].content
  act((d) => { const x = chatOf(d, chatId); if (x) x.messages.splice(i) }, { history: false })
  void send(chatId, text)
}
