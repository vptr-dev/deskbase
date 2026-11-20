import type { Block, DbSchema, PageType } from '../renderer/src/types'

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
  /** a web address or one of Deskbase's covers */
  cover?: string
  fullWidth?: boolean
  /** database pages: properties and views, and the rows with their own content */
  db?: DbSchema
  rows?: ImportRow[]
}

/** A database row: a page of its own with property values keyed by property id. */
export interface ImportRow {
  notionId?: string
  title: string
  icon: string
  props: Record<string, any>
  blocks: Block[]
  cover?: string
  fullWidth?: boolean
}

export interface ImportResult {
  pages: ImportPage[]
  stats: { pages: number; blocks: number; todos: number; tasks: number; tables: number; databases: number; rows: number; skipped: number; missing: number }
  warnings: string[]
}

export interface NotionPageInfo { id: string; title: string; icon: string; parent: string; kind: 'page' | 'database' }
