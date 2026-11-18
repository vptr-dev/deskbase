import { useEffect, useRef, useState } from 'react'
import { act, boot, duplicatePage, flushSave, getData, onConfetti, openPage, redo, setOverlay, setSettings, trashPage, undo, updatePage, useApp, useData } from './store'
import { api } from './lib/api'
import { typeInfo } from './lib/defaults'
import { exportPageMarkdown } from './lib/exporters'
import { MovePageDialog } from './components/MovePage'
import { playLevelUp } from './lib/sound'
import { Sidebar } from './components/Sidebar'
import { Icon } from './components/Icon'
import { IconPickerButton, MenuButton } from './components/ui'
import { CommandPalette, NewPageDialog, SettingsDialog, ShortcutsDialog, TrashDialog } from './components/Overlays'
import { DocPage, BlockEditor } from './pages/DocPage'
import { BoardPage, TasksPage } from './pages/TasksPage'
import { HabitsPage } from './pages/HabitsPage'
import { JournalPage } from './pages/JournalPage'
import { GoalsPage, RewardsPage } from './pages/GoalsPage'
import { CharacterPage } from './pages/CharacterPage'
import { CalendarPage } from './pages/CalendarPage'
import { FocusMini, FocusPage, focusActions } from './pages/FocusPage'
import { GamesPage } from './pages/GamesPage'
import { TrackerPage } from './pages/TrackerPage'
import { TodayPage } from './pages/TodayPage'
import type { Page } from './types'
import { AssistantPanel, toggleAssistant, useAssistant } from './components/Assistant'
import { NotionImportDialog } from './components/NotionImport'
import { applyImport } from './lib/importer'
import { isDesktop } from './lib/api'

// Browser preview only: lets an import result be applied from the dev console for testing.
if (!isDesktop) (window as any).__plannerApplyImport = applyImport

// ---------- navigation history ----------
const back: string[] = []
const fwd: string[] = []
let navigating = false
useApp.subscribe((s, prev) => {
  if (s.current !== prev.current && prev.current && !navigating) {
    back.push(prev.current)
    if (back.length > 50) back.shift()
    fwd.length = 0
  }
})
function goBack(): void {
  const id = back.pop()
  const cur = useApp.getState().current
  if (!id) return
  if (cur) fwd.push(cur)
  navigating = true
  openPage(id)
  navigating = false
}
function goForward(): void {
  const id = fwd.pop()
  const cur = useApp.getState().current
  if (!id) return
  if (cur) back.push(cur)
  navigating = true
  openPage(id)
  navigating = false
}

function Breadcrumbs({ page }: { page: Page }): JSX.Element {
  const pages = useData((d) => d.pages)
  const trail: Page[] = []
  let p: Page | undefined = page
  while (p) { trail.unshift(p); p = p.parentId ? pages[p.parentId] : undefined }
  return (
    <div className="crumbs no-drag">
      {trail.map((c, i) => (
        <span key={c.id} className="crumb-wrap">
          {i > 0 && <span className="crumb-sep">/</span>}
          <button className="crumb" onClick={() => openPage(c.id)}>{c.icon || typeInfo(c.type).icon} {c.title || 'Untitled'}</button>
        </span>
      ))}
    </div>
  )
}

function SaveIndicator(): JSX.Element {
  const saving = useApp((s) => s.saving)
  return <span className={`save-dot ${saving}`} title={saving === 'saved' ? 'All changes saved' : saving === 'saving' ? 'Saving…' : 'Could not save'} />
}

function PageBody({ page }: { page: Page }): JSX.Element {
  switch (page.type) {
    case 'today': return <TodayPage pageId={page.id} />
    case 'tasks': return <TasksPage pageId={page.id} />
    case 'board': return <BoardPage pageId={page.id} />
    case 'calendar': return <CalendarPage pageId={page.id} />
    case 'habits': return <HabitsPage pageId={page.id} />
    case 'journal': return <JournalPage pageId={page.id} />
    case 'goals': return <GoalsPage pageId={page.id} />
    case 'character': return <CharacterPage />
    case 'rewards': return <RewardsPage pageId={page.id} />
    case 'focus': return <FocusPage />
    case 'games': return <GamesPage pageId={page.id} />
    case 'tracker': return <TrackerPage pageId={page.id} />
    default: return <DocPage pageId={page.id} />
  }
}

function SubpageList({ page }: { page: Page }): JSX.Element | null {
  const pages = useData((d) => d.pages)
  const kids = page.children.map((c) => pages[c]).filter((c) => c && !c.deletedAt)
  if (!kids.length) return null
  return (
    <div className="subpages">
      {kids.map((k) => (
        <button key={k.id} className="subpage" onClick={() => openPage(k.id)}>
          <span>{k.icon || typeInfo(k.type).icon}</span><span className="subpage-title">{k.title || 'Untitled'}</span>
        </button>
      ))}
    </div>
  )
}

function PageView({ id }: { id: string }): JSX.Element | null {
  const page = useData((d) => d.pages[id])
  const titleRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if ((window as any).__lastCreated === id && page && !page.title) titleRef.current?.focus()
  }, [id])
  if (!page) return null
  const info = typeInfo(page.type)
  const showNotes = page.type !== 'doc' && page.view?.notes
  return (
    <div className={`page ${page.fullWidth || ['calendar', 'board', 'games'].includes(page.type) ? 'full' : ''} page-${page.type}`}>
      <div className="page-header">
        <IconPickerButton size="lg" value={page.icon} placeholder={info.icon} onChange={(icon) => updatePage(id, (p) => { p.icon = icon })} />
        <input
          ref={titleRef}
          id={`title-${id}`}
          className="page-title"
          placeholder="Untitled"
          value={page.title}
          readOnly={page.locked}
          onChange={(e) => updatePage(id, (p) => { p.title = e.target.value }, 'title:' + id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && page.type === 'doc') {
              e.preventDefault()
              document.querySelector<HTMLTextAreaElement>('.blocks textarea')?.focus()
            }
          }}
        />
      </div>
      <SubpageList page={page} />
      {showNotes && <div className="page-notes glass"><BlockEditor pageId={id} locked={page.locked} /></div>}
      <PageBody page={page} />
    </div>
  )
}

function Toasts(): JSX.Element {
  const toasts = useApp((s) => s.toasts)
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast glass-strong toast-${t.kind ?? 'info'}`}>
          {t.icon && <span className="toast-icon">{t.icon}</span>}
          <span>{t.text}</span>
          {t.undo && <button className="link" onClick={() => { undo(); useApp.setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) })) }}>Undo</button>}
        </div>
      ))}
    </div>
  )
}

function Confetti(): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    onConfetti(() => {
      const c = ref.current
      if (!c) return
      if (getData().settings.sounds) playLevelUp()
      const ctx = c.getContext('2d')!
      c.width = window.innerWidth
      c.height = window.innerHeight
      const colors = ['#0a84ff', '#30d158', '#ff9f0a', '#ff375f', '#bf5af2', '#ffd60a']
      const parts = Array.from({ length: 140 }, () => ({ x: c.width / 2, y: c.height / 3, vx: (Math.random() - 0.5) * 14, vy: Math.random() * -12 - 3, r: Math.random() * 5 + 3, c: colors[Math.floor(Math.random() * colors.length)], a: Math.random() * Math.PI }))
      let frame = 0
      const step = (): void => {
        ctx.clearRect(0, 0, c.width, c.height)
        for (const p of parts) {
          p.x += p.vx; p.y += p.vy; p.vy += 0.35; p.vx *= 0.99; p.a += 0.1
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6); ctx.restore()
        }
        if (++frame < 150) requestAnimationFrame(step)
        else ctx.clearRect(0, 0, c.width, c.height)
      }
      step()
    })
  }, [])
  return <canvas ref={ref} className="confetti" />
}

function useAppearance(): void {
  const s = useData((d) => d.settings)
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const fn = (e: MediaQueryListEvent): void => setSystemDark(e.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])
  useEffect(() => { api.setTheme(s.theme) }, [s.theme])
  useEffect(() => { api.info().then((i) => { if (i.micaSupported && i.material !== s.material) api.setMaterial(s.material) }) }, [])
  const dark = s.theme === 'dark' || (s.theme === 'system' && systemDark)
  useEffect(() => {
    const r = document.documentElement
    r.dataset.theme = dark ? 'dark' : 'light'
    r.dataset.density = s.density
    r.dataset.font = s.font
    r.classList.toggle('reduce-motion', s.reduceMotion)
    r.style.setProperty('--accent', s.accent)
    r.style.setProperty('--fs', s.fontSize + 'px')
    r.style.setProperty('--sidebar-w', s.sidebarWidth + 'px')
    r.style.setProperty('--glass', String(s.glassStrength / 100))
  }, [dark, s.accent, s.fontSize, s.sidebarWidth, s.density, s.font, s.reduceMotion, s.glassStrength])
  useEffect(() => {
    api.info().then((i) => document.documentElement.classList.toggle('mica', i.micaSupported && s.material !== 'none'))
  }, [s.material])
}

function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.ctrlKey || e.metaKey
      const typing = (e.target as HTMLElement)?.closest?.('input, textarea, [contenteditable]')
      const k = e.key.toLowerCase()
      if (mod && k === 'k') { e.preventDefault(); setOverlay(useApp.getState().overlay === 'search' ? null : 'search') }
      else if (mod && k === 'n') { e.preventDefault(); setOverlay('newPage', { parentId: null }) }
      else if (mod && k === ',') { e.preventDefault(); setOverlay('settings') }
      else if (mod && k === '/') { e.preventDefault(); setOverlay('shortcuts') }
      else if (mod && k === 'j') { e.preventDefault(); toggleAssistant() }
      else if (mod && k === '\\') { e.preventDefault(); setSettings((s) => { s.sidebarCollapsed = !s.sidebarCollapsed }) }
      else if (mod && e.shiftKey && k === 'l') { e.preventDefault(); const dark = document.documentElement.dataset.theme === 'dark'; setSettings((s) => { s.theme = dark ? 'light' : 'dark' }) }
      else if (mod && k === '[') { e.preventDefault(); goBack() }
      else if (mod && k === ']') { e.preventDefault(); goForward() }
      else if (mod && (k === '=' || k === '+')) { e.preventDefault(); setSettings((s) => { s.fontSize = Math.min(18, s.fontSize + 1) }) }
      else if (mod && k === '-') { e.preventDefault(); setSettings((s) => { s.fontSize = Math.max(12, s.fontSize - 1) }) }
      else if (mod && k === '0') { e.preventDefault(); setSettings((s) => { s.fontSize = 14 }) }
      else if (mod && k === 's') { e.preventDefault(); flushSave() }
      else if (mod && /^[1-9]$/.test(k)) {
        e.preventDefault()
        const d = getData()
        const id = d.rootOrder.filter((r) => !d.pages[r]?.deletedAt)[Number(k) - 1]
        if (id) openPage(id)
      }
      else if (mod && k === 'z' && !typing) { e.preventDefault(); if (e.shiftKey) redo(); else undo() }
      else if (mod && k === 'y' && !typing) { e.preventDefault(); redo() }
      else if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); goBack() }
      else if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); goForward() }
    }
    window.addEventListener('keydown', onKey)
    const onMouse = (e: MouseEvent): void => { if (e.button === 3) goBack(); if (e.button === 4) goForward() }
    window.addEventListener('mouseup', onMouse)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mouseup', onMouse) }
  }, [])
}

/** Fires task reminders and the focus timer once per second. */
function useTicker(): void {
  useEffect(() => {
    const id = setInterval(() => {
      focusActions.tick()
      const d = getData()
      if (!d.settings.notifications) return
      const now = Date.now()
      const due = Object.values(d.tasks).filter((t) => !t.done && t.remindAt && !t.reminded && t.remindAt <= now)
      if (due.length) {
        for (const t of due) api.notify('Reminder', t.title)
        act((dr) => { for (const t of due) if (dr.tasks[t.id]) dr.tasks[t.id].reminded = true }, { history: false })
      }
    }, 1000)
    return () => clearInterval(id)
  }, [])
}

export function App(): JSX.Element {
  const ready = useApp((s) => s.ready)
  const current = useApp((s) => s.current)
  const overlay = useApp((s) => s.overlay)
  const collapsed = useData((d) => d.settings.sidebarCollapsed)
  const page = useData((d) => (current ? d.pages[current] : undefined))
  const canUndo = useApp((s) => s.canUndo)
  const canRedo = useApp((s) => s.canRedo)
  const assistantOpen = useAssistant((s) => s.open)
  useEffect(() => { boot() }, [])
  useAppearance()
  useShortcuts()
  useTicker()
  if (!ready) return <div className="boot" />

  return (
    <div className={`app ${collapsed ? 'sidebar-collapsed' : ''} ${assistantOpen ? 'assistant-open' : ''}`}>
      <Sidebar />
      <main className="main">
        <header className="topbar drag">
          {collapsed && <button className="icon-btn no-drag" title="Show sidebar (Ctrl+\)" onClick={() => setSettings((s) => { s.sidebarCollapsed = false })}><Icon name="sidebar" size={16} /></button>}
          <button className="icon-btn no-drag" title="Back (Ctrl+[)" onClick={goBack}><Icon name="left" size={15} stroke={2} /></button>
          <button className="icon-btn no-drag" title="Forward (Ctrl+])" onClick={goForward}><Icon name="right" size={15} stroke={2} /></button>
          {page && <Breadcrumbs page={page} />}
          <div className="spacer" />
          <FocusMini />
          <SaveIndicator />
          <button className="icon-btn no-drag" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}><Icon name="undo" size={15} /></button>
          <button className="icon-btn no-drag" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}><Icon name="redo" size={15} /></button>
          <button className={`icon-btn no-drag ${assistantOpen ? 'accent' : ''}`} title="Assistant (Ctrl+J)" onClick={toggleAssistant}><Icon name="sparkle" size={15} /></button>
          {page && (
            <span className="no-drag">
              <MenuButton items={[
                { label: page.favorite ? 'Remove from favorites' : 'Add to favorites', icon: 'star', onClick: () => updatePage(page.id, (p) => { p.favorite = !p.favorite }) },
                { label: 'Full width', checked: !!page.fullWidth, onClick: () => updatePage(page.id, (p) => { p.fullWidth = !p.fullWidth }) },
                { label: 'Lock page', checked: !!page.locked, onClick: () => updatePage(page.id, (p) => { p.locked = !p.locked }) },
                ...(page.type !== 'doc' ? [{ label: 'Show notes area', checked: !!page.view?.notes, onClick: () => updatePage(page.id, (p) => { p.view = { ...(p.view ?? {}), notes: !p.view?.notes } }) }] : []),
                { divider: true, label: '' },
                { label: 'Add subpage', icon: 'plus', onClick: () => setOverlay('newPage', { parentId: page.id }) },
                { label: 'Duplicate', icon: 'copy', onClick: () => duplicatePage(page.id) },
                { label: 'Move to…', icon: 'folder', onClick: () => setOverlay('movePage', { pageId: page.id }) },
                { label: 'Export as Markdown', icon: 'download', onClick: () => exportPageMarkdown(page.id) },
                { divider: true, label: '' },
                { label: `Edited ${new Date(page.updatedAt).toLocaleString()}`, disabled: true },
                { label: 'Move to trash', icon: 'trash', danger: true, onClick: () => trashPage(page.id) }
              ]} />
            </span>
          )}
          {!assistantOpen && <div className="caption-space" />}
        </header>
        <div className="scroll">
          {page && !page.deletedAt ? <PageView key={page.id} id={page.id} /> : (
            <div className="no-page">
              <div className="muted">No page open</div>
              <button className="btn btn-primary" onClick={() => setOverlay('newPage', { parentId: null })}><Icon name="plus" size={15} /> New page</button>
            </div>
          )}
        </div>
      </main>
      <AssistantPanel />
      {overlay === 'search' && <CommandPalette />}
      {overlay === 'notionImport' && <NotionImportDialog />}
      {overlay === 'newPage' && <NewPageDialog />}
      {overlay === 'settings' && <SettingsDialog />}
      {overlay === 'trash' && <TrashDialog />}
      {overlay === 'shortcuts' && <ShortcutsDialog />}
      {overlay === 'movePage' && <MovePageDialog />}
      <Toasts />
      <Confetti />
    </div>
  )
}
