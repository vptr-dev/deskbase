import { useEffect, useMemo, useRef, useState } from 'react'
import { createPage, getData, openPage, purgePage, replaceData, restorePage, setOverlay, setSettings, toast, useApp, useData, act, undo, redo } from '../store'
import { ACCENTS, PAGE_TYPES, typeInfo } from '../lib/defaults'
import { api, isDesktop, type AppInfo, type UpdateStatus } from '../lib/api'
import { exportAll, tasksToCsv } from '../lib/exporters'
import { timeAgo, today } from '../lib/util'
import { Button, ConfirmButton, Empty, Modal, Segmented, Toggle } from './ui'
import { Icon } from './Icon'
import { PROVIDERS, providerInfo, type AiConfig, type AiProvider } from '../../../shared/ai-core'
import { toggleAssistant } from './Assistant'
import { QuickAdd } from './TaskItems'

// ---------- Quick add (global hotkey / tray) ----------
export function QuickAddDialog(): JSX.Element {
  const lists = useData((d) => Object.values(d.pages).filter((p) => !p.deletedAt && (p.type === 'tasks' || p.type === 'board')))
  const last = useData((d) => d.settings.lastPage)
  const [pageId, setPageId] = useState(() => (lists.find((p) => p.id === last) ?? lists[0])?.id ?? '')
  const added = useRef(0)
  const close = (): void => { setOverlay(null); api.quickAddDone(added.current > 0) }
  return (
    <Modal onClose={close} width={560} className="quickadd-modal">
      <div className="modal-body form">
        {lists.length === 0 ? (
          <div className="row between"><span className="muted">No to-do list yet.</span><Button small kind="primary" onClick={() => { setOverlay(null); createPage('tasks', null, 'To-do') }}>Create one</Button></div>
        ) : (
          <>
            <QuickAdd key={pageId} pageId={pageId} autoFocus placeholder="Add a task  ·  Enter to save, Esc to close" onAdded={(id) => { added.current++; const t = getData().tasks[id]; toast(`Added “${t?.title ?? 'task'}”`) }} onEscape={close} />
            {lists.length > 1 && (
              <div className="row gap-sm">
                <span className="muted small">Add to</span>
                <select id="quickadd-list" className="input input-sm" value={pageId} onChange={(e) => setPageId(e.target.value)}>
                  {lists.map((p) => <option key={p.id} value={p.id}>{p.icon} {p.title || 'Untitled'}</option>)}
                </select>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}

// ---------- New page ----------
export function NewPageDialog(): JSX.Element {
  const arg = useApp((s) => s.overlayArg) as { parentId: string | null } | null
  const [title, setTitle] = useState('')
  const make = (type: (typeof PAGE_TYPES)[number]['type']): void => {
    const id = createPage(type, arg?.parentId ?? null, title.trim() || undefined)
    ;(window as any).__lastCreated = id
    setOverlay(null)
  }
  return (
    <Modal onClose={() => setOverlay(null)} width={620}>
      <div className="modal-head"><h3>New page</h3></div>
      <div className="modal-body">
        <input id="newpage-title" className="input" autoFocus placeholder="Page name (optional)" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') make('doc') }} />
        <div className="type-grid">
          {PAGE_TYPES.map((t) => (
            <button key={t.type} className="type-card" onClick={() => make(t.type)}>
              <span className="type-icon">{t.icon}</span>
              <span className="strong">{t.name}</span>
              <span className="muted small">{t.desc}</span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}

// ---------- Search / command palette ----------
interface Result { id: string; icon: string; title: string; sub?: string; run: () => void }

export function CommandPalette(): JSX.Element {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const data = useApp((s) => s.data)
  const listRef = useRef<HTMLDivElement>(null)
  const results = useMemo<Result[]>(() => {
    const ql = q.trim().toLowerCase()
    const out: Result[] = []
    const pages = Object.values(data.pages).filter((p) => !p.deletedAt)
    const pageMatch = (ql ? pages.filter((p) => (p.title || 'untitled').toLowerCase().includes(ql) || p.blocks.some((b) => b.text.toLowerCase().includes(ql))) : data.recent.map((id) => data.pages[id]).filter((p) => p && !p.deletedAt))
    for (const p of pageMatch.slice(0, 10)) {
      const hit = ql && !(p.title || '').toLowerCase().includes(ql) ? p.blocks.find((b) => b.text.toLowerCase().includes(ql))?.text : undefined
      out.push({ id: 'p' + p.id, icon: p.icon || typeInfo(p.type).icon, title: p.title || 'Untitled', sub: hit ? hit.slice(0, 80) : typeInfo(p.type).name, run: () => openPage(p.id) })
    }
    if (ql) {
      for (const t of Object.values(data.tasks).filter((t) => t.title.toLowerCase().includes(ql) || t.notes.toLowerCase().includes(ql)).slice(0, 8)) {
        out.push({ id: 't' + t.id, icon: t.done ? '✅' : '⬜', title: t.title, sub: data.pages[t.pageId]?.title, run: () => openPage(t.pageId) })
      }
      for (const j of Object.values(data.journal).filter((j) => (j.title + j.text).toLowerCase().includes(ql)).slice(0, 5)) {
        out.push({ id: 'j' + j.id, icon: '📓', title: j.title || j.date, sub: j.text.slice(0, 80), run: () => openPage(j.pageId) })
      }
      for (const g of Object.values(data.games).filter((g) => g.title.toLowerCase().includes(ql)).slice(0, 5)) {
        out.push({ id: 'g' + g.id, icon: '🎮', title: g.title, sub: g.platform, run: () => openPage(g.pageId) })
      }
      for (const h of Object.values(data.habits).filter((h) => h.name.toLowerCase().includes(ql)).slice(0, 5)) {
        out.push({ id: 'h' + h.id, icon: h.icon, title: h.name, sub: 'Habit', run: () => openPage(h.pageId) })
      }
    }
    const cmds: Result[] = [
      { id: 'c-new', icon: '➕', title: 'New page', sub: 'Ctrl N', run: () => setOverlay('newPage', { parentId: null }) },
      { id: 'c-quickadd', icon: '✅', title: 'Quick add task', sub: 'Ctrl Shift Space', run: () => setOverlay('quickAdd') },
      { id: 'c-settings', icon: '⚙️', title: 'Open settings', sub: 'Ctrl ,', run: () => setOverlay('settings') },
      { id: 'c-trash', icon: '🗑️', title: 'Open trash', run: () => setOverlay('trash') },
      { id: 'c-theme', icon: '🌓', title: 'Toggle dark mode', run: () => { const dark = document.documentElement.dataset.theme === 'dark'; setSettings((s) => { s.theme = dark ? 'light' : 'dark' }) } },
      { id: 'c-sidebar', icon: '📑', title: 'Toggle sidebar', sub: 'Ctrl \\', run: () => setSettings((s) => { s.sidebarCollapsed = !s.sidebarCollapsed }) },
      { id: 'c-export', icon: '💾', title: 'Export all data', run: () => exportAll() },
      { id: 'c-ai', icon: '✨', title: 'Ask the assistant', sub: 'Ctrl J', run: () => toggleAssistant() },
      { id: 'c-notion', icon: '📥', title: 'Import from Notion', run: () => setTimeout(() => setOverlay('notionImport'), 0) },
      { id: 'c-undo', icon: '↩️', title: 'Undo', sub: 'Ctrl Z', run: undo },
      { id: 'c-redo', icon: '↪️', title: 'Redo', sub: 'Ctrl Shift Z', run: redo },
      { id: 'c-keys', icon: '⌨️', title: 'Keyboard shortcuts', sub: 'Ctrl /', run: () => setOverlay('shortcuts') },
      ...PAGE_TYPES.map((t) => ({ id: 'c-new-' + t.type, icon: t.icon, title: `New ${t.name.toLowerCase()} page`, run: () => { createPage(t.type, null); setOverlay(null) } }))
    ]
    out.push(...cmds.filter((c) => !ql || c.title.toLowerCase().includes(ql)).slice(0, ql ? 6 : 4))
    return out
  }, [q, data])
  useEffect(() => setSel(0), [q])
  useEffect(() => { listRef.current?.querySelector('.active')?.scrollIntoView({ block: 'nearest' }) }, [sel])
  const run = (r?: Result): void => { if (!r) return; setOverlay(null); r.run() }
  return (
    <Modal onClose={() => setOverlay(null)} width={600} className="palette">
      <div className="palette-input">
        <Icon name="search" size={18} />
        <input id="palette-q" autoFocus placeholder="Search pages, tasks, journal, games, or run a command" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)) }
          if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)) }
          if (e.key === 'Enter') run(results[sel])
        }} />
      </div>
      <div className="palette-list" ref={listRef}>
        {!q && <div className="palette-section">Recent</div>}
        {results.map((r, i) => (
          <button key={r.id} className={`palette-item ${i === sel ? 'active' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => run(r)}>
            <span className="palette-icon">{r.icon}</span>
            <span className="palette-title">{r.title}</span>
            {r.sub && <span className="palette-sub">{r.sub}</span>}
          </button>
        ))}
        {results.length === 0 && <div className="muted pad">No results</div>}
      </div>
    </Modal>
  )
}

// ---------- Trash ----------
export function TrashDialog(): JSX.Element {
  const pages = useData((d) => d.pages)
  const deleted = Object.values(pages).filter((p) => p.deletedAt && !(p.parentId && pages[p.parentId]?.deletedAt)).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
  return (
    <Modal onClose={() => setOverlay(null)} width={520}>
      <div className="modal-head"><h3>Trash</h3>{deleted.length > 0 && <ConfirmButton label="Empty trash" confirmLabel="Delete forever" onConfirm={() => deleted.forEach((p) => purgePage(p.id))} />}</div>
      <div className="modal-body">
        {deleted.length === 0 ? <Empty icon="🗑️" title="Trash is empty" /> : deleted.map((p) => (
          <div key={p.id} className="trash-row">
            <span>{p.icon || typeInfo(p.type).icon}</span>
            <span className="grow ellipsis">{p.title || 'Untitled'}</span>
            <span className="muted small">{timeAgo(p.deletedAt!)}</span>
            <Button small kind="ghost" icon="restore" onClick={() => restorePage(p.id)}>Restore</Button>
            <ConfirmButton label="" confirmLabel="Delete" onConfirm={() => purgePage(p.id)} />
          </div>
        ))}
      </div>
    </Modal>
  )
}

// ---------- Shortcuts ----------
export const SHORTCUTS: [string, string][] = [
  ['Ctrl K', 'Search and commands'], ['Ctrl N', 'New page'], ['Ctrl \\', 'Toggle sidebar'], ['Ctrl ,', 'Settings'],
  ['Ctrl J', 'Assistant'], ['Ctrl Z / Ctrl Shift Z', 'Undo / redo'], ['Ctrl [ / Ctrl ]', 'Back / forward'], ['Ctrl /', 'Shortcuts'], ['Ctrl Shift L', 'Toggle dark mode'], ['Ctrl Shift Space', 'Quick add task (anywhere)'], ['Ctrl / Shift click', 'Select several tasks'],
  ['Ctrl + / Ctrl -', 'Zoom text'], ['Ctrl 1…9', 'Open sidebar page 1…9'], ['/', 'Block menu (in a page)'], ['# , ## , ###', 'Headings'], ['- or *', 'Bulleted list'],
  ['[]', 'To-do block'], ['1.', 'Numbered list'], ['>>', 'Toggle block'], ['"', 'Quote'], ['---', 'Divider'], ['Tab / Shift Tab', 'Indent block'],
  ['Alt ↑ / Alt ↓', 'Move block'], ['Ctrl D', 'Duplicate block'], ['Ctrl Enter', 'Check a to-do block'], ['F2', 'Rename page in sidebar']
]
export function ShortcutsDialog(): JSX.Element {
  return (
    <Modal onClose={() => setOverlay(null)} width={520}>
      <div className="modal-head"><h3>Keyboard shortcuts</h3></div>
      <div className="modal-body shortcuts">
        {SHORTCUTS.map(([k, v]) => <div key={k} className="shortcut"><span>{v}</span><kbd>{k}</kbd></div>)}
      </div>
    </Modal>
  )
}

// ---------- Settings ----------
function Row({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }): JSX.Element {
  return <div className="set-row"><div className="set-label"><div>{label}</div>{sub && <div className="muted small">{sub}</div>}</div><div className="set-control">{children}</div></div>
}

function StartWithWindows(): JSX.Element {
  const [on, setOn] = useState(false)
  useEffect(() => { api.loginItem().then(setOn).catch(() => {}) }, [])
  return <Row label="Start with Windows"><Toggle checked={on} onChange={(v) => { setOn(v); api.loginItem(v).then(setOn).catch(() => {}) }} /></Row>
}

export function SettingsDialog(): JSX.Element {
  const s = useData((d) => d.settings)
  const profile = useData((d) => d.profile)
  const pages = useData((d) => d.pages)
  const initialTab = useApp((st) => st.overlayArg)
  const [tab, setTab] = useState<'general' | 'appearance' | 'game' | 'assistant' | 'data' | 'about'>(['general', 'appearance', 'game', 'assistant', 'data', 'about'].includes(initialTab) ? initialTab : 'general')
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [backups, setBackups] = useState<{ name: string; date: string; size: number }[]>([])
  const [upd, setUpd] = useState<UpdateStatus>({ state: 'idle' })
  const [resetArmed, setResetArmed] = useState(false)
  useEffect(() => { api.info().then(setInfo); api.updater.status().then(setUpd); return api.updater.onStatus(setUpd) }, [])
  useEffect(() => { if (tab === 'data') api.listBackups().then(setBackups) }, [tab])
  const set = setSettings
  return (
    <Modal onClose={() => setOverlay(null)} width={720} className="settings">
      <div className="settings-layout">
        <nav className="settings-nav">
          {(['general', 'appearance', 'game', 'assistant', 'data', 'about'] as const).map((t) => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{{ general: 'General', appearance: 'Appearance', game: 'Game', assistant: 'Assistant', data: 'Data & backups', about: 'About & updates' }[t]}</button>
          ))}
        </nav>
        <div className="settings-body">
          {tab === 'general' && <>
            <h3>General</h3>
            <Row label="Your name"><input id="set-name" className="input input-sm" value={profile.name} onChange={(e) => act((d) => { d.profile.name = e.target.value }, { key: 'pname' })} /></Row>
            <Row label="Open on start"><select id="set-start" className="input input-sm" value={s.startPage} onChange={(e) => set((x) => { x.startPage = e.target.value })}>
              <option value="last">Last opened page</option>
              {Object.values(pages).filter((p) => !p.deletedAt).map((p) => <option key={p.id} value={p.id}>{p.icon} {p.title || 'Untitled'}</option>)}
            </select></Row>
            <Row label="Week starts on"><Segmented small value={s.weekStart} onChange={(v) => set((x) => { x.weekStart = v })} options={[{ value: 1, label: 'Monday' }, { value: 0, label: 'Sunday' }]} /></Row>
            <Row label="Time format"><Segmented small value={s.use24h ? 1 : 0} onChange={(v) => set((x) => { x.use24h = v === 1 })} options={[{ value: 0, label: '12-hour' }, { value: 1, label: '24-hour' }]} /></Row>
            <Row label="Show completed tasks"><Toggle checked={s.showCompleted} onChange={(v) => set((x) => { x.showCompleted = v })} /></Row>
            <Row label="Spellcheck"><Toggle checked={s.spellcheck} onChange={(v) => set((x) => { x.spellcheck = v })} /></Row>
            <Row label="Notifications" sub="Reminders and focus timer"><Toggle checked={s.notifications} onChange={(v) => set((x) => { x.notifications = v })} /></Row>
            <Row label="Sounds"><Toggle checked={s.sounds} onChange={(v) => set((x) => { x.sounds = v })} /></Row>
            {isDesktop && <StartWithWindows />}
            {isDesktop && <Row label="Close to tray" sub="Closing the window keeps Planner running in the tray"><Toggle checked={s.closeToTray} onChange={(v) => set((x) => { x.closeToTray = v })} /></Row>}
            {isDesktop && <Row label="Quick add hotkey" sub="Ctrl Shift Space adds a task from anywhere"><Toggle checked={s.quickAddHotkey} onChange={(v) => set((x) => { x.quickAddHotkey = v })} /></Row>}
          </>}
          {tab === 'appearance' && <>
            <h3>Appearance</h3>
            <Row label="Theme"><Segmented small value={s.theme} onChange={(v) => set((x) => { x.theme = v })} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} /></Row>
            <Row label="Accent color"><div className="color-dots">{ACCENTS.map((a) => <button key={a.value} title={a.name} className={`color-dot ${s.accent === a.value ? 'active' : ''}`} style={{ background: a.value }} onClick={() => set((x) => { x.accent = a.value })} />)}
              <label title="Custom color" className={`color-dot custom-dot ${ACCENTS.some((a) => a.value === s.accent) ? '' : 'active'}`} style={ACCENTS.some((a) => a.value === s.accent) ? undefined : { ['--custom' as any]: s.accent }}>
                <input id="accent-custom" type="color" value={s.accent} onChange={(e) => { const v = e.target.value; set((x) => { x.accent = v }) }} />
              </label>
            </div></Row>
            <Row label="Window material" sub={info && !info.micaSupported ? 'Mica needs Windows 11' : 'Mica tints the window with your wallpaper'}>
              <Segmented small value={s.material} onChange={(v) => { set((x) => { x.material = v }); api.setMaterial(v) }} options={[{ value: 'mica', label: 'Mica' }, { value: 'acrylic', label: 'Acrylic' }, { value: 'none', label: 'Solid' }]} />
            </Row>
            <Row label="Glass strength"><input id="set-glass" type="range" min={20} max={95} value={s.glassStrength} onChange={(e) => set((x) => { x.glassStrength = Number(e.target.value) })} /></Row>
            <Row label="Text size"><input id="set-font" type="range" min={12} max={18} value={s.fontSize} onChange={(e) => set((x) => { x.fontSize = Number(e.target.value) })} /><span className="muted small w-40">{s.fontSize}px</span></Row>
            <Row label="Font"><Segmented small value={s.font} onChange={(v) => set((x) => { x.font = v })} options={[{ value: 'system', label: 'Default' }, { value: 'serif', label: 'Serif' }, { value: 'mono', label: 'Mono' }]} /></Row>
            <Row label="Density"><Segmented small value={s.density} onChange={(v) => set((x) => { x.density = v })} options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} /></Row>
            <Row label="Reduce motion"><Toggle checked={s.reduceMotion} onChange={(v) => set((x) => { x.reduceMotion = v })} /></Row>
          </>}
          {tab === 'game' && <>
            <h3>Game</h3>
            <Row label="XP, gold and levels" sub="Turn off for a plain planner"><Toggle checked={s.gamification} onChange={(v) => set((x) => { x.gamification = v })} /></Row>
            <Row label="Daily XP goal"><input id="set-xpgoal" type="number" min={10} step={10} className="input input-sm w-80" value={s.dailyXpGoal} onChange={(e) => set((x) => { x.dailyXpGoal = Math.max(10, Number(e.target.value) || 100) })} /></Row>
            <Row label="Loot drops" sub="Random gold bonus when finishing tasks"><Toggle checked={s.lootDrops} onChange={(v) => set((x) => { x.lootDrops = v })} /></Row>
            <Row label="XP multiplier"><Segmented small value={s.xpMultiplier} onChange={(v) => set((x) => { x.xpMultiplier = v })} options={[{ value: 0.5, label: '0.5×' }, { value: 1, label: '1×' }, { value: 1.5, label: '1.5×' }, { value: 2, label: '2×' }]} /></Row>
            <Row label="Reset progress" sub="Sets XP, gold, stats and achievements to zero. Tasks are kept.">
              <ConfirmButton label="Reset" confirmLabel="Reset progress" icon="restore" onConfirm={() => act((d) => {
                d.profile.xp = 0; d.profile.gold = 0; d.profile.achievements = {}; d.xpLog = []
                for (const k of Object.keys(d.profile.stats)) (d.profile.stats as any)[k].xp = 0
              })} />
            </Row>
          </>}
          {tab === 'assistant' && <AssistantSettings />}
          {tab === 'data' && <>
            <h3>Data & backups</h3>
            <p className="muted small">Everything is stored on this computer{info?.dataPath ? <> in <code>{info.dataPath}</code></> : null}. Updates never touch your data, and a backup is made every day.</p>
            <Row label="Import from Notion" sub="From the Notion app on this computer, or an export"><Button small icon="upload" onClick={() => setOverlay('notionImport')}>Import</Button></Row>
            <Row label="Export everything" sub="A single JSON file you can import later"><Button small icon="download" onClick={() => exportAll()}>Export</Button></Row>
            <Row label="Export tasks as CSV"><Button small icon="download" onClick={() => api.exportFile(tasksToCsv(), `planner-tasks-${today()}.csv`)}>CSV</Button></Row>
            <Row label="Import" sub="Replaces current data. A backup is made first."><Button small icon="upload" onClick={async () => {
              try { const d = await api.importFile(); if (d) { replaceData(d, 'Import complete') } } catch (e: any) { toast(e?.message ?? 'Import failed', { kind: 'error' }) }
            }}>Import</Button></Row>
            {isDesktop && <Row label="Data folder"><Button small icon="folder" onClick={() => api.openDataFolder()}>Open</Button></Row>}
            {isDesktop && <>
              <div className="row between mt"><div className="section-label">Backups</div><Button small kind="ghost" icon="plus" onClick={async () => { await api.createBackup(); setBackups(await api.listBackups()); toast('Backup created') }}>Back up now</Button></div>
              <div className="backups">
                {backups.length === 0 && <div className="muted small">No backups yet.</div>}
                {backups.map((b) => (
                  <div key={b.name} className="trash-row">
                    <span className="grow ellipsis small">{b.date}<span className="muted"> · {b.name.replace(/^planner-[\dT-]+-?/, '').replace('.json', '')} · {(b.size / 1024).toFixed(0)} KB</span></span>
                    <ConfirmButton label="Restore" confirmLabel="Restore this" icon="restore" onConfirm={async () => { const d = await api.readBackup(b.name); if (d) replaceData(d, 'Backup restored') }} />
                  </div>
                ))}
              </div>
            </>}
            <Row label="Erase all data" sub="Starts fresh. A backup is made first.">
              <Button small kind={resetArmed ? 'danger' : 'ghost'} icon="trash" onClick={async () => {
                if (!resetArmed) { setResetArmed(true); setTimeout(() => setResetArmed(false), 3000); return }
                await api.createBackup()
                replaceData(null, 'Started fresh')
                setOverlay(null)
              }}>{resetArmed ? 'Erase everything' : 'Erase'}</Button>
            </Row>
          </>}
          {tab === 'about' && <>
            <h3>About</h3>
            <Row label="Version"><span>{info?.version ?? '…'}</span></Row>
            <Row label="Updates" sub={updText(upd)}>
              {upd.state === 'ready' ? <Button small kind="primary" icon="download" onClick={() => api.updater.install()}>Restart and update</Button>
                : <Button small icon="restore" disabled={upd.state === 'checking' || upd.state === 'downloading' || upd.state === 'dev'} onClick={() => api.updater.check()}>Check now</Button>}
            </Row>
            <Row label="Source code"><Button small kind="ghost" icon="external" onClick={() => api.openExternal('https://github.com/vptr-dev/planner')}>GitHub</Button></Row>
            <Row label="Keyboard shortcuts"><Button small kind="ghost" icon="keyboard" onClick={() => setOverlay('shortcuts')}>View</Button></Row>
          </>}
        </div>
      </div>
    </Modal>
  )
}

function AssistantSettings(): JSX.Element {
  const [cfg, setCfg] = useState<AiConfig | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [key, setKey] = useState('')
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { api.ai.getConfig().then((c) => { setCfg(c); refresh() }) }, [])
  const refresh = async (): Promise<void> => {
    setBusy(true)
    try {
      const m = await api.ai.models()
      setModels(m)
      setStatus({ ok: true, text: m.length ? `Connected · ${m.length} model${m.length === 1 ? '' : 's'} available` : 'Connected, but no models are installed' })
    } catch (e: any) {
      setModels([])
      setStatus({ ok: false, text: e?.message ?? 'Could not connect' })
    } finally { setBusy(false) }
  }
  const save = async (patch: Partial<AiConfig> & { key?: string | null }): Promise<void> => {
    const c = await api.ai.setConfig(patch)
    setCfg(c)
  }
  if (!cfg) return <div className="muted">Loading…</div>
  const info = providerInfo(cfg.provider)
  return (
    <>
      <h3>Assistant</h3>
      <p className="muted small">Chat with an AI that can see the open page and your tasks, and add tasks, pages, habits and goals for you. Press Ctrl J to open it. Local models keep everything on this computer.</p>
      <Row label="Provider">
        <select id="ai-provider" className="input input-sm" value={cfg.provider} onChange={async (e) => {
          const p = e.target.value as AiProvider
          await save({ provider: p, baseUrl: providerInfo(p).baseUrl, model: providerInfo(p).defaultModel })
          setStatus(null); setModels([]); setTimeout(refresh, 0)
        }}>
          {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Row>
      {cfg.provider !== 'anthropic' && cfg.provider !== 'openai' && (
        <Row label="Server address"><input id="ai-url" className="input input-sm w-220" value={cfg.baseUrl} onChange={(e) => setCfg({ ...cfg, baseUrl: e.target.value })} onBlur={() => save({ baseUrl: cfg.baseUrl }).then(refresh)} /></Row>
      )}
      {(info.needsKey || cfg.provider === 'custom') && (
        <Row label="API key" sub={cfg.hasKey ? 'Saved and encrypted on this computer' : 'Stored encrypted on this computer, never in exports'}>
          <input id="ai-key" type="password" className="input input-sm w-220" placeholder={cfg.hasKey ? '••••••••••••' : 'Paste key'} value={key} onChange={(e) => setKey(e.target.value)} />
          <Button small disabled={!key.trim()} onClick={async () => { await save({ key: key.trim() }); setKey(''); refresh() }}>Save</Button>
          {cfg.hasKey && <Button small kind="ghost" onClick={() => save({ key: null })}>Remove</Button>}
        </Row>
      )}
      <Row label="Model">
        <input id="ai-model" className="input input-sm w-220" list="ai-models" value={cfg.model} placeholder="Model name" onChange={(e) => setCfg({ ...cfg, model: e.target.value })} onBlur={() => save({ model: cfg.model })} />
        <datalist id="ai-models">{models.map((m) => <option key={m} value={m} />)}</datalist>
        <Button small kind="ghost" icon="restore" title="Refresh" disabled={busy} onClick={refresh} />
      </Row>
      {models.length > 0 && (
        <div className="row wrap gap-xs mt-sm">
          {models.slice(0, 12).map((m) => <button key={m} className={`chip-btn ${cfg.model === m ? 'active' : ''}`} onClick={() => save({ model: m })}>{m}</button>)}
        </div>
      )}
      {status && <p className={`small ${status.ok ? 'muted' : 'danger'}`}>{status.ok ? '● ' : ''}{status.text}</p>}
      {info.local && !status?.ok && (
        <p className="muted small">Install <b>Ollama</b> from ollama.com, run <code>ollama pull llama3.2</code>, and it will appear here.</p>
      )}
    </>
  )
}

function updText(u: UpdateStatus): string {
  switch (u.state) {
    case 'checking': return 'Checking…'
    case 'none': return 'You have the latest version'
    case 'available': return `Version ${u.version} found, downloading`
    case 'downloading': return `Downloading ${u.percent}%`
    case 'ready': return `Version ${u.version} is ready to install`
    case 'error': return `Could not check: ${u.message}`
    case 'dev': return 'Updates are off in development builds'
    default: return 'Checks automatically on start'
  }
}

export { getData }
