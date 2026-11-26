// Earlier versions of pages, one small file per page in the data folder. Kept apart from the main
// data file so it stays small; the newest 40 versions of each page are kept.
import fs from 'fs'
import {readStored,writeStored,lockedData} from './vault'
import path from 'path'
import { dataDir } from './storage'

export interface PageVersion { at: number; title: string; icon: string; blocks: unknown[] }

const KEEP = 40
const dir = (): string => path.join(dataDir(), 'history')
const file = (id: string): string => path.join(dir(), id.replace(/[^\w-]/g, '_') + '.json')

export async function listVersions(id: string): Promise<PageVersion[]> {
  try {
    const list = JSON.parse(readStored(dataDir(),file(id)))
    return Array.isArray(list) ? list.filter((v) => v && typeof v.at === 'number' && Array.isArray(v.blocks)) : []
  } catch { return [] }
}

export async function saveVersion(id: string, v: PageVersion): Promise<void> {
  if(lockedData(dataDir()))throw Error('Workspace is locked')
  if (!v || typeof v.at !== 'number' || !Array.isArray(v.blocks)) return
  const list = await listVersions(id)
  const last = list[list.length - 1]
  if (last && JSON.stringify(last.blocks) === JSON.stringify(v.blocks) && last.title === v.title) return
  list.push({ at: v.at, title: String(v.title ?? ''), icon: String(v.icon ?? ''), blocks: v.blocks })
  fs.mkdirSync(dir(), { recursive: true })
  writeStored(dataDir(),file(id), JSON.stringify(list.slice(-KEEP)))
}
