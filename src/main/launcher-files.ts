import { promises as fs } from 'node:fs'
import path from 'node:path'
import { ipcMain, dialog, type BrowserWindow } from 'electron'

export interface LauncherFile { name: string; path: string; folder: boolean }

export function registerLauncherFiles(win: () => BrowserWindow | null): void {
  ipcMain.handle('launcher:pick', async (_event, mode: 'file' | 'folder') => {
    const window = win()
    if (!window) return null
    const picked = await dialog.showOpenDialog(window, { properties: [mode === 'folder' ? 'openDirectory' : 'openFile'] })
    return picked.canceled ? null : picked.filePaths[0] || null
  })
  ipcMain.handle('launcher:list', async (_event, directory: string, mode: 'browse' | 'recent' | 'shortcuts', excluded: string[]) => {
    if (typeof directory !== 'string' || !/^[a-z]:[\\/]/i.test(directory)) return []
    const blocked = (Array.isArray(excluded) ? excluded : []).filter(x=>typeof x==='string' && x.trim())
      .slice(0,50).map(x=>x.trim().replace(/\\/g,'/').toLowerCase())
    try {
      const entries = (await fs.readdir(directory,{withFileTypes:true})).filter(entry=>{
        if (entry.name.startsWith('.') || (!entry.isDirectory() && !entry.isFile())) return false
        if (blocked.some(word=>path.join(directory,entry.name).replace(/\\/g,'/').toLowerCase().includes(word))) return false
        if (mode === 'shortcuts') return entry.isFile() && /\.(lnk|url)$/i.test(entry.name)
        return mode !== 'recent' || entry.isFile()
      })
      const items: LauncherFile[] = entries.map(e=>({name:e.name,path:path.join(directory,e.name),folder:e.isDirectory()}))
      if (mode === 'recent') {
        const recent: { item: LauncherFile; modified: number }[] = []
        for (let i=0;i<items.length;i+=32) {
          recent.push(...await Promise.all(items.slice(i,i+32).map(async item=>{
            const modified = await fs.stat(item.path).then(s=>s.mtimeMs,()=>0)
            return {item,modified}
          })))
        }
        return recent.filter(x=>x.modified).sort((a,b)=>b.modified-a.modified).slice(0,20).map(x=>x.item)
      }
      return items.sort((a,b)=>Number(b.folder)-Number(a.folder) || a.name.localeCompare(b.name,undefined,{numeric:true})).slice(0,150)
    } catch { return [] }
  })
}
