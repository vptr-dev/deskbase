import type { Block, Page } from '../types'
import { uid } from './util'
import { newPage } from './defaults'
import { act } from '../store'

export function walkBlocks(list: Block[], visit: (block: Block) => void): void {
  for (const block of list) {
    visit(block)
    block.cols?.forEach(column => walkBlocks(column, visit))
  }
}

function rewriteBlockLinks(block: Block, from: string, to: string, ids: Map<string, string>): void {
  if (block.type === 'synced' && block.ref?.startsWith(from + '/')) {
    const target = ids.get(block.ref.slice(from.length + 1))
    if (target) block.ref = to + '/' + target
  }
  const replace = (text: string) => text.replace(/deskbase:\/\/block\/([\w-]+)\/([\w-]+)/g, (url, page, id) =>
    page === from && ids.has(id) ? 'deskbase://block/' + to + '/' + ids.get(id) : url)
  block.text = replace(block.text)
  if (block.body) block.body = replace(block.body)
  if (block.url) block.url = replace(block.url)
}

export function copyArrangement(blocks: Block[], fromPage: string, toPage: string): Block[] {
  const copies: Block[] = JSON.parse(JSON.stringify(blocks))
  const ids = new Map<string, string>()
  walkBlocks(copies, block => { const fresh = uid(); ids.set(block.id, fresh); block.id = fresh })
  walkBlocks(copies, block => rewriteBlockLinks(block, fromPage, toPage, ids))
  return copies
}

export function splitAtHeading(pageId: string, blockId: string): void {
  act(d => {
    const page = d.pages[pageId]
    if (!page || page.locked) return
    const at = page.blocks.findIndex(b => b.id === blockId && /^(toggle-)?h[123]$/.test(b.type))
    if (at < 0) return
    const child = newPage('doc', page.blocks[at].text || 'Untitled', pageId)
    child.blocks = page.blocks.splice(at)
    const moved = new Map<string, string>()
    walkBlocks(child.blocks, b => moved.set(b.id, b.id))
    page.blocks.push({id: uid(), type: 'link', ref: child.id, text: ''})
    page.children.push(child.id)
    d.pages[child.id] = child
    for (const document of Object.values(d.pages)) walkBlocks(document.blocks, b => rewriteBlockLinks(b, pageId, child.id, moved))
    page.updatedAt = Date.now()
  })
}
