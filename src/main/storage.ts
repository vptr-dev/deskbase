import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { CURRENT_SCHEMA, migrate } from './migrations'

/**
 * All user data lives in %APPDATA%/Planner/data, outside the install folder,
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

export const dataFile = (): string => path.join(dataDir(), 'planner.json')

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

function writeAtomic(file: string, text: string): void {
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, text, 'utf8')
  fs.renameSync(tmp, file)
}

export interface LoadResult {
  data: Record<string, any> | null
  migratedFrom: number | null
  path: string
  error?: string
}

export function loadData(): LoadResult {
  const file = dataFile()
  if (!fs.existsSync(file)) {
    // Recover from an interrupted write.
    if (fs.existsSync(`${file}.tmp`)) fs.renameSync(`${file}.tmp`, file)
    else return { data: null, migratedFrom: null, path: file }
  }
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (typeof raw.schema === 'number' && raw.schema > CURRENT_SCHEMA) {
      // Data from a newer version: keep a copy so nothing is lost.
      createBackup(`newer-schema-${raw.schema}`)
      return { data: raw, migratedFrom: null, path: file }
    }
    const { data, from, changed } = migrate(raw)
    if (changed) {
      createBackup(`before-migration-v${from}`)
      writeAtomic(file, JSON.stringify(data))
    }
    autoBackup()
    return { data, migratedFrom: changed ? from : null, path: file }
  } catch (e: any) {
    // Corrupt file: move it aside and try the newest backup.
    const bad = path.join(dataDir(), `planner-corrupt-${stamp()}.json`)
    try { fs.copyFileSync(file, bad) } catch { /* ignore */ }
    const latest = listBackups()[0]
    if (latest) {
      const restored = JSON.parse(fs.readFileSync(path.join(backupDir(), latest.name), 'utf8'))
      const { data } = migrate(restored)
      writeAtomic(file, JSON.stringify(data))
      return { data, migratedFrom: null, path: file, error: `Your data file was damaged. Restored the backup from ${latest.date}.` }
    }
    return { data: null, migratedFrom: null, path: file, error: `Your data file could not be read (${e?.message}). A copy was kept at ${bad}.` }
  }
}

export function saveData(data: unknown): void {
  const obj = data as Record<string, any>
  obj.schema = CURRENT_SCHEMA
  writeAtomic(dataFile(), JSON.stringify(obj))
}

export function createBackup(label = 'manual'): string | null {
  const file = dataFile()
  if (!fs.existsSync(file)) return null
  const name = `planner-${stamp()}-${label}.json`
  fs.copyFileSync(file, path.join(backupDir(), name))
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
  const raw = JSON.parse(fs.readFileSync(path.join(backupDir(), safe), 'utf8'))
  return migrate(raw).data
}

export function parseImport(text: string): Record<string, any> {
  const raw = JSON.parse(text)
  if (!raw || typeof raw !== 'object' || !raw.pages) throw new Error('This file is not a Planner export.')
  return migrate(raw).data
}
