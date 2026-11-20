import { create } from 'zustand'
import type { Block } from '../types'

/** Blocks picked with the selection box (top-level blocks of one page). */
export const useSelection = create<{ page: string | null; ids: string[] }>(() => ({ page: null, ids: [] }))

export function clearSelection(): void {
  if (useSelection.getState().ids.length) useSelection.setState({ ids: [] })
}

/** Plain text of blocks, Markdown style, for the clipboard. */
export function blocksToText(blocks: Block[]): string {
  let n = 0
  const lines: string[] = []
  for (const b of blocks) {
    n = b.type === 'number' ? n + 1 : 0
    const pad = '  '.repeat(b.indent ?? 0)
    switch (b.type) {
      case 'h1': case 'toggle-h1': lines.push('# ' + b.text); break
      case 'h2': case 'toggle-h2': lines.push('## ' + b.text); break
      case 'h3': case 'toggle-h3': lines.push('### ' + b.text); break
      case 'todo': lines.push(`${pad}- [${b.checked ? 'x' : ' '}] ${b.text}`); break
      case 'bullet': lines.push(`${pad}- ${b.text}`); break
      case 'number': lines.push(`${pad}${n}. ${b.text}`); break
      case 'quote': case 'callout': lines.push('> ' + b.text); break
      case 'code': lines.push('```\n' + b.text + '\n```'); break
      case 'divider': lines.push('---'); break
      case 'equation': lines.push('$$' + b.text + '$$'); break
      case 'table': for (const r of b.rows ?? []) lines.push('| ' + r.join(' | ') + ' |'); break
      case 'columns': for (const c of b.cols ?? []) lines.push(blocksToText(c)); break
      case 'bookmark': case 'embed': case 'image': lines.push(b.url ? (b.text ? `${b.text} ${b.url}` : b.url) : ''); break
      default: lines.push(pad + b.text)
    }
    if (b.body) lines.push(pad + '  ' + b.body)
  }
  return lines.join('\n')
}
