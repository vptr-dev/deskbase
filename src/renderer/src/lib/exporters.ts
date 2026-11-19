import { getData, pageItems, toast } from '../store'
import type { Block } from '../types'
import { api } from './api'
import { today } from './util'

function blockToMd(b: Block, n: number): string {
  const ind = '  '.repeat(b.indent ?? 0)
  switch (b.type) {
    case 'h1': return `# ${b.text}`
    case 'h2': return `## ${b.text}`
    case 'h3': return `### ${b.text}`
    case 'todo': return `${ind}- [${b.checked ? 'x' : ' '}] ${b.text}`
    case 'bullet': return `${ind}- ${b.text}`
    case 'number': return `${ind}${n}. ${b.text}`
    case 'quote': return `> ${b.text}`
    case 'callout': return `> **Note:** ${b.text}`
    case 'code': return '```\n' + b.text + '\n```'
    case 'toggle': return `<details><summary>${b.text}</summary>\n\n${b.body ?? ''}\n</details>`
    case 'divider': return '---'
    case 'table': {
      const rows = b.rows ?? []
      if (!rows.length) return ''
      const line = (r: string[]): string => '| ' + r.map((c) => c.replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ') + ' |'
      return [line(rows[0]), '| ' + rows[0].map(() => '---').join(' | ') + ' |', ...rows.slice(1).map(line)].join('\n')
    }
    default: return b.text
  }
}

export function pageToMarkdown(id: string): string {
  const d = getData()
  const p = d.pages[id]
  if (!p) return ''
  const out: string[] = [`# ${p.icon ? p.icon + ' ' : ''}${p.title || 'Untitled'}`, '']
  let n = 0
  for (const b of p.blocks) {
    n = b.type === 'number' ? n + 1 : 0
    if (b.text || b.type === 'divider' || b.type === 'table') out.push(blockToMd(b, n))
  }
  const tasks = pageItems(d.tasks, id)
  if (tasks.length) {
    out.push('', '## Tasks')
    for (const t of tasks) out.push(`- [${t.done ? 'x' : ' '}] ${t.title}${t.due ? ` (due ${t.due})` : ''}${t.tags.length ? ' ' + t.tags.map((x) => '#' + x).join(' ') : ''}`)
  }
  const habits = pageItems(d.habits, id)
  if (habits.length) {
    out.push('', '## Habits')
    for (const h of habits) out.push(`- ${h.name}`)
  }
  const journal = Object.values(d.journal).filter((j) => j.pageId === id).sort((a, b) => b.date.localeCompare(a.date))
  for (const j of journal) out.push('', `## ${j.date}${j.title ? ' — ' + j.title : ''}`, '', j.text)
  const goals = pageItems(d.goals, id)
  if (goals.length) {
    out.push('', '## Goals')
    for (const g of goals) {
      out.push(`- [${g.done ? 'x' : ' '}] ${g.title}${g.deadline ? ` (by ${g.deadline})` : ''}`)
      for (const m of g.milestones) out.push(`  - [${m.done ? 'x' : ' '}] ${m.title}`)
    }
  }
  return out.join('\n') + '\n'
}

export async function exportPageMarkdown(id: string): Promise<void> {
  const p = getData().pages[id]
  const name = `${(p?.title || 'Untitled').replace(/[\\/:*?"<>|]/g, '')}.md`
  const path = await api.exportFile(pageToMarkdown(id), name)
  if (path) toast('Exported page')
}

export async function exportAll(): Promise<void> {
  const path = await api.exportFile(JSON.stringify(getData(), null, 2), `backup-${today()}.json`)
  if (path) toast('Exported all data')
}

export function tasksToCsv(): string {
  const d = getData()
  const rows = [['Title', 'Page', 'Done', 'Due', 'Priority', 'Difficulty', 'Tags', 'Notes']]
  for (const t of Object.values(d.tasks)) {
    rows.push([t.title, d.pages[t.pageId]?.title ?? '', t.done ? 'yes' : 'no', t.due ?? '', String(t.priority), t.difficulty, t.tags.join(' '), t.notes])
  }
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
}
