import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import type { FeedItem } from '../shared/feeds'

/** Read a bounded tail of the local CLI index. No session transcripts or tools are opened. */
export async function localSessions(kind: 'codex' | 'claude'): Promise<FeedItem[]> {
  const dir = kind === 'codex' ? process.env.CODEX_HOME || path.join(os.homedir(), '.codex') : process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
  const file = path.join(dir, kind === 'codex' ? 'session_index.jsonl' : 'history.jsonl')
  const handle = await fs.open(file, 'r').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (!handle) return []
  try {
    const { size } = await handle.stat()
    const bytes = Buffer.alloc(Math.min(size, 1024 * 1024))
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, size - bytes.length)
    const items = new Map<string, FeedItem>()
    for (const line of bytes.subarray(0, bytesRead).toString('utf8').split('\n').reverse()) {
      let r
      try { r = JSON.parse(line) } catch { continue }
      const id = kind === 'codex' ? r?.id : r?.sessionId
      if (typeof id !== 'string' || !/^[a-f0-9-]{32,36}$/i.test(id) || items.has(id)) continue
      const title = kind === 'codex' ? r.thread_name : path.basename(String(r.project || ''))
      const date = new Date(r.updated_at || r.timestamp || 0).getTime()
      items.set(id, { id, title: title || 'Session ' + id.slice(0, 8), url: '', date: date || undefined,
        resumeCommand: (kind === 'codex' ? 'codex resume ' : 'claude --resume ') + id })
      if (items.size >= 80) break
    }
    return [...items.values()].sort((a,b) => (b.date || 0) - (a.date || 0))
  } finally { await handle.close() }
}
