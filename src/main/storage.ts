import { app } from 'electron'
import fs from 'fs'
import { createHash } from 'node:crypto'
import { lockedData, readStored, writeStored } from './vault'
import path from 'path'
import { CURRENT_SCHEMA, migrate } from './migrations'

/**
 * All user data lives in %APPDATA%/Deskbase/data, outside the install folder,
 * so installing an update never touches it. Writes are atomic (temp file +
 * rename) and a rolling daily backup is kept.
 */

const MAX_BACKUPS = 20

export function dataDir(): string {
  const dir = path.join(app.getPath('userData'), 'data')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function backupDir(): string {
  const dir = path.join(dataDir(), 'backups')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function dataFile(): string {
  const file = path.join(dataDir(), 'deskbase.json')
  // Files from before the rename
  const old = path.join(dataDir(), 'planner.json')
  if (!fs.existsSync(file) && fs.existsSync(old)) {
    try { fs.renameSync(old, file) } catch { return old }
  }
  return file
}

export async function storageBreakdown(): Promise<{ records:number; attachments:number; history:number; backups:number }> {
  const root = dataDir()
  const bytes = async (file:string):Promise<number> => fs.promises.stat(file).then(s=>s.isFile()?s.size:0,()=>0)
  const directory = async (name:string):Promise<number> => {
    const dir=path.join(root,name)
    const entries=await fs.promises.readdir(dir,{withFileTypes:true}).catch(()=>[])
    const sizes=await Promise.all(entries.filter(e=>e.isFile()).map(e=>bytes(path.join(dir,e.name))))
    return sizes.reduce((a,b)=>a+b,0)
  }
  const [records,attachments,history,backups]=await Promise.all([
    bytes(path.join(root,'deskbase.json')),directory('images'),directory('history'),directory('backups')
  ])
  return {records,attachments,history,backups}
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

function writeAtomic(file: string, text: string): void {
  writeStored(dataDir(),file,text)
}

const imageDir=():string=>path.join(dataDir(),'images')
function saveImage(_field:string,value:unknown):unknown{
  if(typeof value!=='string'||value.length<64*1024||!/^data:image\/(jpeg|png|webp|gif);base64,/i.test(value))return value
  const hash=createHash('sha256').update(value).digest('hex')
  fs.mkdirSync(imageDir(),{recursive:true})
  const file=path.join(imageDir(),hash)
  if(!fs.existsSync(file))writeStored(dataDir(),file,value)
  return {deskbaseImage:hash}
}
function loadFile(file:string):any{
  return JSON.parse(readStored(dataDir(),file),(_field,v)=>{
    if(v&&typeof v==='object'&&Object.keys(v).length===1&&typeof v.deskbaseImage==='string'&&/^[a-f0-9]{64}$/.test(v.deskbaseImage))
      return readStored(dataDir(),path.join(imageDir(),v.deskbaseImage))
    return v
  })
}
export interface LoadResult {
  data: Record<string, any> | null
  migratedFrom: number | null
  path: string
  error?: string
}

export function loadData(): LoadResult {
  if(lockedData(dataDir()))throw Error("Workspace is locked")
  const file = dataFile()
  if (!fs.existsSync(file)) {
    const interrupted = [file+'.writing',file+'.tmp'].find(f=>fs.existsSync(f))
    if(interrupted)fs.renameSync(interrupted,file)
    else if(!listBackups().length)return {data:null,migratedFrom:null,path:file}
  }
  let raw:Record<string,any>, recovered:string|undefined
  try {
    raw=loadFile(file)
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||(Number(raw.schema)>=6&&(!raw.pages||typeof raw.pages!=='object')))throw Error('Workspace pages are missing')
  } catch {
    if(fs.existsSync(file))fs.copyFileSync(file,path.join(dataDir(),'deskbase-corrupt-'+Date.now()+'.json'))
    let candidate:Record<string,any>|undefined
    for(const backup of listBackups()){
      try {
        const content=loadFile(path.join(backupDir(),backup.name))
        if(!content?.pages||typeof content.pages!=='object')continue
        candidate=content;recovered='Restored the backup from '+backup.date;break
      } catch { /* Continue to the next older snapshot. */ }
    }
    if(!candidate)throw Error('Deskbase could not read the workspace or any backup. Your existing files have been kept.')
    raw=candidate
  }
  if(typeof raw.schema==='number'&&raw.schema>CURRENT_SCHEMA)throw Error('This workspace was saved by a newer Deskbase version. Update Deskbase to open it.')
  const { data,from,changed }=migrate(raw)
  if(changed&&!recovered)createBackup('before-migration-v'+from)
  if(changed||recovered)writeAtomic(file,JSON.stringify(data,saveImage))
  autoBackup()
  return {data,migratedFrom:changed?from:null,path:file,error:recovered}
}

export function saveData(data: unknown): void {
  if(lockedData(dataDir()))throw Error("Workspace is locked")
  const obj = data as Record<string, any>
  if(!obj?.pages || typeof obj.pages!=='object'||Number(obj.schema)>CURRENT_SCHEMA)throw Error('Unsupported workspace data')
  obj.schema = CURRENT_SCHEMA
  writeAtomic(dataFile(), JSON.stringify(obj,saveImage))
}

export function createBackup(label = 'manual'): string | null {
  const file = dataFile()
  if (!fs.existsSync(file)) return null
  const name = `deskbase-${stamp()}-${label}.json`
  // Portable snapshots carry their images even when the live file references the image store.
  writeStored(dataDir(),path.join(backupDir(),name),JSON.stringify(loadFile(file)))
  pruneBackups()
  return name
}

function autoBackup(): void {
  const recent = listBackups().find((b) => b.name.endsWith('-auto.json'))
  if (!recent || Date.now() - recent.mtime > 24 * 3600 * 1000) createBackup('auto')
}

function pruneBackups(): void {
  const all = listBackups()
  for (const b of all.slice(MAX_BACKUPS)) {
    try { fs.unlinkSync(path.join(backupDir(), b.name)) } catch { /* ignore */ }
  }
}

export function listBackups(): { name: string; date: string; size: number; mtime: number }[] {
  const dir = backupDir()
  return fs
    .readdirSync(dir)
    .filter((n) => n.endsWith('.json'))
    .map((name) => {
      const s = fs.statSync(path.join(dir, name))
      return { name, date: s.mtime.toLocaleString(), size: s.size, mtime: s.mtimeMs }
    })
    .sort((a, b) => b.mtime - a.mtime)
}

export function readBackup(name: string): Record<string, any> {
  const safe = path.basename(name)
  const raw = loadFile(path.join(backupDir(),safe))
  if(Number(raw.schema)>CURRENT_SCHEMA)throw Error('Update Deskbase before importing this workspace')
  return migrate(raw).data
}

export function parseImport(text: string): Record<string, any> {
  const raw = JSON.parse(text)
  if (!raw || typeof raw !== 'object' || !raw.pages) throw new Error('This file is not a backup or export from this app.')
  if(Number(raw.schema)>CURRENT_SCHEMA)throw Error('Update Deskbase before importing this workspace')
  return migrate(raw).data
}
