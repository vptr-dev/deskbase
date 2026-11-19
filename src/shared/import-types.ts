import type { Block, PageType } from '../renderer/src/types'

/** A page tree produced by an importer, applied to the store by the renderer. */
export interface ImportTask { title: string; done: boolean; due?: string | null; tags: string[]; notes?: string }

export interface ImportPage {
  /** id in the Notion app, when imported from it (used to refresh the page later) */
  notionId?: string
  title: string
  icon: string
  type: PageType
  blocks: Block[]
  tasks?: ImportTask[]
  children: ImportPage[]
}

export interface ImportResult {
  pages: ImportPage[]
  stats: { pages: number; blocks: number; todos: number; tasks: number; tables: number; skipped: number; missing: number }
  warnings: string[]
}

export interface NotionPageInfo { id: string; title: string; icon: string; parent: string; kind: 'page' | 'database' }
