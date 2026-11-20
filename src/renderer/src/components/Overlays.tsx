import { useEffect, useMemo, useRef, useState } from 'react'
import { newTab, reopenTab } from '../lib/tabs'
import { createPage, getData, openPage, openView, purgePage, replaceData, restorePage, setOverlay, setSettings, toast, useApp, useData, act, undo, redo } from '../store'
import { ACCENTS, DEFAULT_PRESETS, PAGE_TYPES, typeInfo } from '../lib/defaults'
import type { AssistantPreset, AssistantSettings as AssistantSettingsT } from '../types'
import { api, isDesktop, type AppInfo, type UpdateStatus } from '../lib/api'
import { exportAll, tasksToCsv } from '../lib/exporters'
import { pageFromTemplate } from '../lib/db'
import { timeAgo, today } from '../lib/util'
import { Button, ConfirmButton, Empty, IconPickerButton, Modal, Segmented, SideIndex, Toggle, useSectionIndex } from './ui'
import { Glyph, Icon } from './Icon'
import { PROVIDERS, type AiConfig } from '../../../shared/ai-core'
import { toggleAssistant } from './Assistant'
import { QuickAdd } from './TaskItems'
import { PlaceSearch } from './PanelKit'

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
                  {lists.map((p) => <option key={p.id} value={p.id}>{p.title || 'Untitled'}</option>)}
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
  const templates = useData((d) => Object.values(d.pages).filter((p) => p.template && !p.rowOf && !p.deletedAt))
  const make = (type: (typeof PAGE_TYPES)[number]['type']): void => {
    const id = createPage(type, arg?.parentId ?? null, title.trim() || undefined)
    ;(window as any).__lastCreated = id
    setOverlay(null)
  }
  const fromTemplate = (tplId: string): void => {
    const id = pageFromTemplate(tplId, arg?.parentId ?? null, title.trim() || undefined)
    openPage(id)
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
              <span className="type-icon"><Icon name={t.icon} size={18} /></span>
              <span className="strong">{t.name}</span>
              <span className="muted small">{t.desc}</span>
            </button>
          ))}
        </div>
        {templates.length > 0 && <>
          <div className="section-label">Templates</div>
          <div className="type-grid">
            {templates.map((t) => (
              <button key={t.id} className="type-card" onClick={() => fromTemplate(t.id)}>
                <span className="type-icon"><Glyph value={t.icon} fallback={typeInfo(t.type).icon} size={18} /></span>
                <span className="strong">{t.title || 'Untitled'}</span>
                <span className="muted small">{typeInfo(t.type).name}</span>
              </button>
            ))}
          </div>
        </>}
      </div>
    </Modal>
  )
}

// ---------- Search / command palette ----------
interface Result { id: string; icon: string; title: string; sub?: string; run: () => void; page?: string }

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
      out.push({ id: 'p' + p.id, icon: p.icon || typeInfo(p.type).icon, title: p.title || 'Untitled', sub: hit ? hit.slice(0, 80) : p.rowOf ? `in ${data.pages[p.rowOf]?.title || 'Untitled'}` : typeInfo(p.type).name, page: p.id, run: () => openPage(p.id) })
    }
    if (ql) {
      for (const t of Object.values(data.tasks).filter((t) => t.title.toLowerCase().includes(ql) || t.notes.toLowerCase().includes(ql)).slice(0, 8)) {
        out.push({ id: 't' + t.id, icon: t.done ? 'circle-check' : 'circle', title: t.title, sub: data.pages[t.pageId]?.title, run: () => openPage(t.pageId) })
      }
      for (const j of Object.values(data.journal).filter((j) => (j.title + j.text).toLowerCase().includes(ql)).slice(0, 5)) {
        out.push({ id: 'j' + j.id, icon: 'notebook-pen', title: j.title || j.date, sub: j.text.slice(0, 80), run: () => openPage(j.pageId) })
      }
      for (const h of Object.values(data.habits).filter((h) => h.name.toLowerCase().includes(ql)).slice(0, 5)) {
        out.push({ id: 'h' + h.id, icon: h.icon, title: h.name, sub: 'Habit', run: () => openPage(h.pageId) })
      }
    }
    const cmds: Result[] = [
      { id: 'c-new', icon: 'plus', title: 'New page', sub: 'Ctrl N', run: () => setOverlay('newPage', { parentId: null }) },
      { id: 'c-tab', icon: 'app-window', title: 'New tab', sub: 'Ctrl T', run: () => newTab() },
      { id: 'c-reopen', icon: 'rotate-ccw', title: 'Reopen closed tab', sub: 'Ctrl Shift T', run: () => reopenTab() },
      { id: 'c-desktop', icon: 'monitor', title: 'Desktop', sub: 'Panels and workspaces', run: () => openView('@desktop') },
      { id: 'c-look', icon: 'palette', title: 'Appearance', sub: 'Themes, surface, fonts', run: () => openView('@appearance') },
      { id: 'c-assistant', icon: 'sparkle', title: 'Assistant', sub: 'Chats', run: () => openView('@assistant') },
      { id: 'c-connections', icon: 'plug', title: 'Connections', sub: 'Calendars, feeds, GitHub, Notion', run: () => openView('@connections') },
      ...(['glass', 'blur', 'frosted', 'solid'] as const).map((v) => ({ id: 'c-surface-' + v, icon: 'layers', title: 'Surface: ' + v[0].toUpperCase() + v.slice(1), run: () => setSettings((x) => { x.look = { ...x.look, surface: v } }) })),
      { id: 'c-values', icon: 'gem', title: 'Values and rules', sub: 'Your own numbers', run: () => setOverlay('values') },
      { id: 'c-quickadd', icon: 'square-check-big', title: 'Quick add task', sub: 'Ctrl Shift Space', run: () => setOverlay('quickAdd') },
      { id: 'c-settings', icon: 'settings', title: 'Open settings', sub: 'Ctrl ,', run: () => setOverlay('settings') },
      { id: 'c-trash', icon: 'trash', title: 'Open trash', run: () => setOverlay('trash') },
      { id: 'c-theme', icon: 'contrast', title: 'Toggle dark mode', run: () => { const dark = document.documentElement.dataset.theme === 'dark'; setSettings((s) => { s.theme = dark ? 'light' : 'dark' }) } },
      { id: 'c-sidebar', icon: 'sidebar', title: 'Toggle sidebar', sub: 'Ctrl \\', run: () => setSettings((s) => { s.sidebarCollapsed = !s.sidebarCollapsed }) },
      { id: 'c-export', icon: 'download', title: 'Export all data', run: () => exportAll() },
      { id: 'c-ai', icon: 'sparkles', title: 'Ask the assistant', sub: 'Ctrl J', run: () => toggleAssistant() },
      { id: 'c-notion', icon: 'file-input', title: 'Import from Notion', run: () => setTimeout(() => setOverlay('notionImport'), 0) },
      { id: 'c-undo', icon: 'undo', title: 'Undo', sub: 'Ctrl Z', run: undo },
      { id: 'c-redo', icon: 'redo', title: 'Redo', sub: 'Ctrl Shift Z', run: redo },
      { id: 'c-keys', icon: 'keyboard', title: 'Keyboard shortcuts', sub: 'Ctrl /', run: () => setOverlay('shortcuts') },
      ...PAGE_TYPES.map((t) => ({ id: 'c-new-' + t.type, icon: t.icon, title: `New ${t.name.toLowerCase()} page`, run: () => { createPage(t.type, null); setOverlay(null) } }))
    ]
    out.push(...cmds.filter((c) => !ql || c.title.toLowerCase().includes(ql)).slice(0, ql ? 6 : 4))
    return out
  }, [q, data])
  useEffect(() => setSel(0), [q])
  useEffect(() => { listRef.current?.querySelector('.active')?.scrollIntoView({ block: 'nearest' }) }, [sel])
  const run = (r?: Result, inTab = false): void => { if (!r) return; setOverlay(null); if (inTab && r.page) newTab(r.page); else r.run() }
  return (
    <Modal onClose={() => setOverlay(null)} width={600} className="palette">
      <div className="palette-input">
        <Icon name="search" size={18} />
        <input id="palette-q" autoFocus placeholder="Search pages, tasks, journal, or run a command" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)) }
          if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)) }
          if (e.key === 'Enter') run(results[sel], e.ctrlKey || e.metaKey)
        }} />
      </div>
      <div className="palette-list" ref={listRef}>
        {!q && <div className="palette-section">Recent</div>}
        {results.map((r, i) => (
          <button key={r.id} className={`palette-item ${i === sel ? 'active' : ''}`} onMouseEnter={() => setSel(i)} onClick={(e) => run(r, e.ctrlKey || e.metaKey)} onAuxClick={(e) => { if (e.button === 1) run(r, true) }}>
            <span className="palette-icon"><Glyph value={r.icon} size={16} /></span>
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
        {deleted.length === 0 ? <Empty icon="trash" title="Trash is empty" /> : deleted.map((p) => (
          <div key={p.id} className="trash-row">
            <Glyph value={p.icon || typeInfo(p.type).icon} size={15} />
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
  ['Ctrl J', 'Assistant'], ['Ctrl Z / Ctrl Shift Z', 'Undo / redo'], ['Ctrl [ / Ctrl ]', 'Back / forward'], ['Ctrl T / Ctrl W', 'New tab / close tab'], ['Ctrl Tab', 'Next tab'], ['Ctrl Shift T', 'Reopen closed tab'], ['Ctrl or middle click', 'Open a page in a new tab'], ['Ctrl /', 'Shortcuts'], ['Ctrl Shift L', 'Toggle dark mode'], ['Ctrl Shift Space', 'Quick add task (anywhere)'], ['Ctrl / Shift click', 'Select several tasks'],
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

function DesktopSettings(): JSX.Element {
  const desk = useData((d) => d.desktop)
  const place = useData((d) => d.settings.place)
  const fahrenheit = useData((d) => d.settings.fahrenheit)
  return <>
    <h3>Desktop</h3>
    <p className="muted small set-intro">Your tasks, pages and notes as panels on the Windows desktop. Each workspace keeps its own layout.</p>
    <Row label="Show panels on the desktop"><Toggle checked={desk.enabled} onChange={(v) => act((d) => { d.desktop.enabled = v })} /></Row>
    <Row label="Panels" sub={`${desk.widgets.filter((w) => !w.hidden && w.space === desk.active).length} in this workspace, ${desk.spaces.length} workspace${desk.spaces.length === 1 ? '' : 's'}`}><Button small icon="monitor" onClick={() => openView('@desktop')}>Open Desktop</Button></Row>
    <StartWithWindows sub="Starts in the tray with just your panels showing" />
    <Row label="Weather place" sub={place ? place.name : 'For weather and daylight panels'}><PlaceSearch compact /></Row>
    <Row label="Temperature"><Segmented small value={fahrenheit ? 'f' : 'c'} onChange={(v) => setSettings((s) => { s.fahrenheit = v === 'f' })} options={[{ value: 'c', label: '°C' }, { value: 'f', label: '°F' }]} /></Row>
    <p className="muted small">While panels are showing, closing the window keeps it running in the tray. Right-click a panel for its options; switch workspaces from the tray or the top of the sidebar.</p>
  </>
}

function StartWithWindows({ sub }: { sub?: string }): JSX.Element {
  const [on, setOn] = useState(false)
  useEffect(() => { api.loginItem().then(setOn).catch(() => {}) }, [])
  return <Row label="Start with Windows" sub={sub}><Toggle checked={on} onChange={(v) => { setOn(v); api.loginItem(v).then(setOn).catch(() => {}) }} /></Row>
}

export function SettingsDialog(): JSX.Element {
  const s = useData((d) => d.settings)
  const pages = useData((d) => d.pages)
  const initialTab = useApp((st) => st.overlayArg)
  const SECTIONS = [
    { id: 'general', label: 'General', icon: 'settings' },
    ...(isDesktop ? [{ id: 'widget', label: 'Desktop', icon: 'monitor' }] : []),
    { id: 'assistant', label: 'Assistant', icon: 'sparkles' },
    { id: 'data', label: 'Data & backups', icon: 'database' },
    { id: 'about', label: 'About & updates', icon: 'info' }
  ]
  const { body, active, go } = useSectionIndex(SECTIONS.map((x) => x.id), initialTab)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [backups, setBackups] = useState<{ name: string; date: string; size: number }[]>([])
  const [upd, setUpd] = useState<UpdateStatus>({ state: 'idle' })
  const [resetArmed, setResetArmed] = useState(false)
  useEffect(() => { api.info().then(setInfo); api.updater.status().then(setUpd); api.listBackups().then(setBackups).catch(() => {}); return api.updater.onStatus(setUpd) }, [])
  const set = setSettings
  return (
    <Modal onClose={() => setOverlay(null)} width={760} className="settings">
      <div className="settings-layout">
        <SideIndex className="settings-nav" items={SECTIONS} active={active} go={go} />
        <div className="settings-body" ref={body}>
          <section className="set-section" data-section="general">
            <h3>General</h3>
            <Row label="Open on start"><select id="set-start" className="input input-sm" value={s.startPage} onChange={(e) => set((x) => { x.startPage = e.target.value })}>
              <option value="last">Last opened page</option>
              {Object.values(pages).filter((p) => !p.deletedAt && !p.rowOf).map((p) => <option key={p.id} value={p.id}>{p.title || 'Untitled'}</option>)}
            </select></Row>
            <Row label="Week starts on"><Segmented small value={s.weekStart} onChange={(v) => set((x) => { x.weekStart = v })} options={[{ value: 1, label: 'Monday' }, { value: 0, label: 'Sunday' }]} /></Row>
            <Row label="Time format"><Segmented small value={s.use24h ? 1 : 0} onChange={(v) => set((x) => { x.use24h = v === 1 })} options={[{ value: 0, label: '12-hour' }, { value: 1, label: '24-hour' }]} /></Row>
            <Row label="Show completed tasks"><Toggle checked={s.showCompleted} onChange={(v) => set((x) => { x.showCompleted = v })} /></Row>
            <Row label="Spellcheck"><Toggle checked={s.spellcheck} onChange={(v) => set((x) => { x.spellcheck = v })} /></Row>
            <Row label="Notifications" sub="Reminders and focus timer"><Toggle checked={s.notifications} onChange={(v) => set((x) => { x.notifications = v })} /></Row>
            <Row label="Sounds"><Toggle checked={s.sounds} onChange={(v) => set((x) => { x.sounds = v })} /></Row>
            {isDesktop && <StartWithWindows />}
            {isDesktop && <Row label="Close to tray" sub="Closing the window keeps it running in the tray"><Toggle checked={s.closeToTray} onChange={(v) => set((x) => { x.closeToTray = v })} /></Row>}
            {isDesktop && <Row label="Quick add hotkey" sub="Ctrl Shift Space adds a task from anywhere"><Toggle checked={s.quickAddHotkey} onChange={(v) => set((x) => { x.quickAddHotkey = v })} /></Row>}
          </section>
          {isDesktop && <section className="set-section" data-section="widget"><DesktopSettings /></section>}
          <section className="set-section" data-section="assistant"><AssistantSettings /></section>
          <section className="set-section" data-section="data">
            <h3>Data & backups</h3>
            <p className="muted small">Everything is stored on this computer{info?.dataPath ? <> in <code>{info.dataPath}</code></> : null}. Updates never touch your data, and a backup is made every day.</p>
            <Row label="Import from Notion" sub="From the Notion app on this computer, or an export"><Button small icon="upload" onClick={() => setOverlay('notionImport')}>Import</Button></Row>
            {isDesktop && <Row label="Keep Notion pages updated" sub="Pages imported from the Notion app refresh on start and every 30 minutes"><Toggle checked={s.notionSync} onChange={(v) => set((x) => { x.notionSync = v })} /></Row>}
            <Row label="Export everything" sub="A single JSON file you can import later"><Button small icon="download" onClick={() => exportAll()}>Export</Button></Row>
            <Row label="Export tasks as CSV"><Button small icon="download" onClick={() => api.exportFile(tasksToCsv(), `tasks-${today()}.csv`)}>CSV</Button></Row>
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
                    <span className="grow ellipsis small">{b.date}<span className="muted"> · {b.name.replace(/^(?:planner|deskbase)-[\dT-]+-?/, '').replace('.json', '')} · {(b.size / 1024).toFixed(0)} KB</span></span>
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
          </section>
          <section className="set-section" data-section="about">
            <h3>About</h3>
            <Row label="Version"><span>{info?.version ?? '…'}</span></Row>
            <Row label="Updates" sub={updText(upd)}>
              {upd.state === 'ready' ? <Button small kind="primary" icon="download" onClick={() => api.updater.install()}>Restart and update</Button>
                : <Button small icon="restore" disabled={upd.state === 'checking' || upd.state === 'downloading' || upd.state === 'dev'} onClick={() => api.updater.check()}>Check now</Button>}
            </Row>
            <Row label="Source code"><Button small kind="ghost" icon="external" onClick={() => api.openExternal('https://github.com/vptr-dev/deskbase')}>GitHub</Button></Row>
            <Row label="Keyboard shortcuts"><Button small kind="ghost" icon="keyboard" onClick={() => setOverlay('shortcuts')}>View</Button></Row>
          </section>
        </div>
      </div>
    </Modal>
  )
}

function ProviderRow({ p, cfg, onSaved }: { p: (typeof PROVIDERS)[number]; cfg: AiConfig; onSaved: (c: AiConfig) => void }): JSX.Element {
  const slot = cfg.providers[p.id]
  const [key, setKey] = useState('')
  const [url, setUrl] = useState(slot?.baseUrl ?? p.baseUrl)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [open, setOpen] = useState(false)
  const check = async (): Promise<void> => {
    setStatus({ ok: true, text: 'Checking…' })
    try {
      const m = await api.ai.models(p.id)
      setStatus({ ok: true, text: m.length ? `Connected · ${m.length} model${m.length === 1 ? '' : 's'}` : 'Connected, but no models are installed' })
      if (m.length && !cfg.providers[p.id]?.model) onSaved(await api.ai.setConfig({ target: p.id, model: m[0] }))
    } catch (e: any) { setStatus({ ok: false, text: e?.message ?? 'Could not connect' }) }
  }
  const save = async (patch: { key?: string | null; baseUrl?: string }): Promise<void> => { onSaved(await api.ai.setConfig({ target: p.id, ...patch })); setTimeout(check, 0) }
  const ready = p.local || p.id === 'custom' ? true : !!slot?.hasKey
  return (
    <div className={`provider-row ${open ? 'open' : ''}`}>
      <button className="provider-head" onClick={() => { setOpen(!open); if (!open && ready) check() }}>
        <span className={`provider-dot ${slot?.hasKey || (p.local && status?.ok) ? 'on' : ''}`} />
        <span className="grow">{p.name}</span>
        <span className="muted small ellipsis">{slot?.model || (p.needsKey ? (slot?.hasKey ? 'Key saved' : 'No key') : '')}</span>
        {cfg.provider === p.id && <span className="provider-default">Default</span>}
        <Icon name={open ? 'up' : 'down'} size={13} />
      </button>
      {open && (
        <div className="provider-body">
          {!p.fixedUrl && <Row label="Server address"><input className="input input-sm w-220" value={url} onChange={(e) => setUrl(e.target.value)} onBlur={() => save({ baseUrl: url })} /></Row>}
          {(p.needsKey || p.id === 'custom') && (
            <Row label="API key" sub={slot?.hasKey ? 'Saved and encrypted on this computer' : 'Stored encrypted on this computer, never in exports'}>
              <input type="password" className="input input-sm w-220" placeholder={slot?.hasKey ? '••••••••••••' : 'Paste key'} value={key} onChange={(e) => setKey(e.target.value)} />
              <Button small disabled={!key.trim()} onClick={async () => { await save({ key: key.trim() }); setKey('') }}>Save</Button>
              {slot?.hasKey && <Button small kind="ghost" onClick={() => save({ key: null })}>Remove</Button>}
              {p.keyUrl && !slot?.hasKey && <Button small kind="ghost" icon="external" onClick={() => api.openExternal(p.keyUrl!)}>Get a key</Button>}
            </Row>
          )}
          <Row label="Use for new chats"><Toggle checked={cfg.provider === p.id} onChange={async (v) => { if (v) onSaved(await api.ai.setConfig({ provider: p.id })) }} /></Row>
          {status && <p className={`small ${status.ok ? 'muted' : 'danger'}`}>{status.text}</p>}
          {p.local && status && !status.ok && <p className="muted small">Install {p.id === 'ollama' ? <><b>Ollama</b> from ollama.com and run <code>ollama pull llama3.2</code></> : <><b>LM Studio</b> from lmstudio.ai and start its server</>}; it shows up here.</p>}
        </div>
      )}
    </div>
  )
}

function PresetEditor(): JSX.Element {
  const presets = useData((d) => d.assistant.settings.presets)
  const set = (fn: (list: AssistantPreset[]) => void): void => act((d) => { fn(d.assistant.settings.presets) }, { key: 'aipresets' })
  return (
    <div className="preset-list">
      {presets.map((p) => (
        <div key={p.id} className="preset-edit">
          <div className="row gap-sm">
            <IconPickerButton size="sm" value={p.icon} onChange={(v) => set((l) => { const x = l.find((y) => y.id === p.id); if (x) x.icon = v })} />
            <input className="input input-sm grow" value={p.name} placeholder="Name" onChange={(e) => set((l) => { const x = l.find((y) => y.id === p.id); if (x) x.name = e.target.value })} />
            <button className="icon-btn" title="Delete" onClick={() => set((l) => { l.splice(l.findIndex((y) => y.id === p.id), 1) })}><Icon name="trash" size={13} /></button>
          </div>
          <textarea className="input input-area" rows={2} value={p.instructions} placeholder="How the assistant should act in this role" onChange={(e) => set((l) => { const x = l.find((y) => y.id === p.id); if (x) x.instructions = e.target.value })} />
        </div>
      ))}
      <div className="row gap-sm">
        <Button small kind="ghost" icon="plus" onClick={() => set((l) => { l.push({ id: Math.random().toString(36).slice(2, 10), name: 'New role', icon: 'sparkle', instructions: '' }) })}>Add a role</Button>
        <Button small kind="ghost" icon="restore" onClick={() => act((d) => { d.assistant.settings.presets = DEFAULT_PRESETS.map((p) => ({ ...p })) })}>Built-in roles</Button>
      </div>
    </div>
  )
}

function AssistantSettings(): JSX.Element {
  const [cfg, setCfg] = useState<AiConfig | null>(null)
  const st = useData((d) => d.assistant.settings)
  useEffect(() => { api.ai.getConfig().then(setCfg).catch(() => {}) }, [])
  const set = (fn: (s: AssistantSettingsT) => void, key?: string): void => act((d) => { fn(d.assistant.settings) }, key ? { key } : undefined)
  return (
    <>
      <h3>Assistant</h3>
      <p className="muted small">Chat in the side panel (Ctrl J) or on the Assistant page. Each chat can use its own provider and model. Local models keep everything on this computer.</p>
      <div className="section-label">Providers</div>
      {!cfg ? <div className="muted small">Loading…</div> : <div className="provider-list">{PROVIDERS.map((p) => <ProviderRow key={p.id} p={p} cfg={cfg} onSaved={setCfg} />)}</div>}
      <div className="section-label mt">What it may see and do</div>
      <Row label="Access" sub={{ none: 'Only what you type in the chat', read: 'Reads your pages, tasks and databases; changes nothing', ask: 'Reads, and suggests changes for you to approve', auto: 'Reads and makes changes right away (you can undo)' }[st.access]}>
        <Segmented small value={st.access} onChange={(v) => set((s) => { s.access = v })} options={[{ value: 'none', label: 'Nothing' }, { value: 'read', label: 'Read' }, { value: 'ask', label: 'Ask first' }, { value: 'auto', label: 'Do it' }]} />
      </Row>
      <div className="section-label mt">How it answers</div>
      <Row label="About you" sub="Sent with every chat: who you are, what you are working on, how you like answers">
        <textarea className="input input-area w-320" rows={3} value={st.instructions} placeholder="I'm a student; keep plans light and use 24-hour times." onChange={(e) => set((s) => { s.instructions = e.target.value }, 'aiinstr')} />
      </Row>
      <Row label="Length"><Segmented small value={st.length} onChange={(v) => set((s) => { s.length = v })} options={[{ value: 'short', label: 'Short' }, { value: 'normal', label: 'Normal' }, { value: 'long', label: 'Long' }]} /></Row>
      <Row label="Creativity" sub="Local, OpenAI, Gemini and OpenRouter models; Claude models choose their own">
        <Toggle checked={st.temperature !== null} onChange={(v) => set((s) => { s.temperature = v ? 0.7 : null })} />
        {st.temperature !== null && <><input type="range" min={0} max={1.5} step={0.1} value={st.temperature} onChange={(e) => set((s) => { s.temperature = Number(e.target.value) }, 'aitemp')} /><span className="muted small w-40">{st.temperature.toFixed(1)}</span></>}
      </Row>
      <Row label="Thinking" sub="How hard Claude models think before answering"><Segmented small value={st.effort} onChange={(v) => set((s) => { s.effort = v })} options={[{ value: 'low', label: 'Quick' }, { value: 'medium', label: 'Normal' }, { value: 'high', label: 'Deep' }]} /></Row>
      <div className="section-label mt">Roles</div>
      <p className="muted small">Pick a role for a chat from the top of the chat.</p>
      <PresetEditor />
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
