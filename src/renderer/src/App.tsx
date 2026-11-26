import { useEffect, useRef, useState } from 'react'
import { act, boot, createPage, duplicatePage, flushSave, toast, getData, isView, onConfetti, openPage, openView, openSettings, redo, setOverlay, setSettings, trashPage, undo, updatePage, useApp, useData } from './store'
import { api } from './lib/api'
import { COVERS, coverStyle, typeInfo } from './lib/defaults'
import { pickImageData } from './lib/image'
import { WorkspacePassword } from './components/WorkspacePassword'
import { exportPageMarkdown } from './lib/exporters'
import { MovePageDialog } from './components/MovePage'
import { habitWeek } from './lib/habits'
import { playLevelUp } from './lib/sound'
import { uid } from './lib/util'
import { Sidebar } from './components/Sidebar'
import { Glyph, Icon } from './components/Icon'
import { IconPicker, IconPickerButton, MenuButton, Modal, Popover, Button } from './components/ui'
import { CommandPalette, NewPageDialog, QuickAddDialog, ShortcutsDialog, TrashDialog } from './components/Overlays'
import { AppMenu } from './components/AppMenu'
import { ToolBody } from './pages/ToolBody'
import { DocPage, BlockEditor } from './pages/DocPage'
import { FocusMini, focusActions } from './pages/FocusPage'
import { RowProps } from './pages/DatabasePage'
import { DesktopPage } from './pages/DesktopPage'
import { taskReminderAt } from './lib/recurrence'
import { SettingsPage } from './pages/SettingsPage'
import { AppearancePage } from './pages/AppearancePage'
import type { Page } from './types'
import { AssistantPage, AssistantPanel, toggleAssistant, useAssistant } from './components/Assistant'
import { NotionImportDialog } from './components/NotionImport'
import { ValuesDialog } from './components/Values'
import { HistoryDialog } from './components/History'
import { applyImport, refreshFromNotion } from './lib/importer'
import { loadFeed, startConnections, useFeeds, useMedia } from './lib/connections'
import { fireReminders } from './lib/reminders'
import { ConnectionsPage } from './pages/ConnectionsPage'
import { isDesktop } from './lib/api'
import { applyCustomCss, applyLook } from './lib/look'
import { addDeskSet, addDesktopWidget, addSpace, runCommand, startDesktop, switchSpace } from './lib/desktop'
import { watchHistory } from './lib/history'
import { WindowControls } from './components/WindowControls'
import { renameLinks } from './lib/links'
import { PagePicker, Backlinks } from './components/Blocks'
import { TabStrip, StartView } from './components/Tabs'
import { closeTab, cycleTab, goBack, goForward, newTab, openFromClick, reopenTab, restoreTabs, useTabs } from './lib/tabs'

// Browser preview only: lets an import result be applied from the dev console for testing.
if (!isDesktop) (window as any).__deskApplyImport = applyImport

function Breadcrumbs({ page }: { page: Page }): JSX.Element {
  const pages = useData((d) => d.pages)
  const trail: Page[] = []
  let p: Page | undefined = page
  while (p) { trail.unshift(p); p = p.parentId ? pages[p.parentId] : p.rowOf ? pages[p.rowOf] : undefined }
  return (
    <div className="crumbs">
      {trail.map((c, i) => (
        <span key={c.id} className="crumb-wrap">
          {i > 0 && <span className="crumb-sep">/</span>}
          <button className="crumb" onClick={(e) => openFromClick(c.id, e)} onAuxClick={(e) => { if (e.button === 1) openFromClick(c.id, e) }}><Glyph value={c.icon || typeInfo(c.type).icon} size={14} color={c.iconColor || undefined} /> {c.title || 'Untitled'}</button>
        </span>
      ))}
    </div>
  )
}

function SaveIndicator(): JSX.Element {
  const saving = useApp((s) => s.saving)
  return <span className={`save-dot ${saving}`} title={saving === 'saved' ? 'All changes saved' : saving === 'saving' ? 'Saving…' : 'Could not save'} />
}

function SubpageList({ page }: { page: Page }): JSX.Element | null {
  const pages = useData((d) => d.pages)
  const embedded = new Set<string>()
  const collect = (blocks: Page['blocks']): void => {
    for (const b of blocks) {
      if (b.type === 'tool' && b.ref) embedded.add(b.ref)
      b.cols?.forEach(collect)
    }
  }
  collect(page.blocks)
  const kids = page.children.filter(id => !embedded.has(id)).map((c) => pages[c]).filter((c) => c && !c.deletedAt)
  if (!kids.length) return null
  return (
    <div className="subpages">
      {kids.map((k) => (
        <button key={k.id} className="subpage" onClick={(e) => openFromClick(k.id, e)} onAuxClick={(e) => { if (e.button === 1) openFromClick(k.id, e) }} onMouseDown={(e) => { if (e.button === 1) e.preventDefault() }}>
          <Glyph value={k.icon || typeInfo(k.type).icon} size={15} color={k.iconColor || undefined} /><span className="subpage-title">{k.title || 'Untitled'}</span>
        </button>
      ))}
    </div>
  )
}

function CoverPicker({ value, onPick }: { value?: string | null; onPick: (c: string) => void }): JSX.Element {
  return (
    <div className="cover-grid">
      {COVERS.map((c) => <button key={c} title={c} aria-label={c + ' cover'} aria-pressed={c === value} className={`cover-swatch ${value === c ? 'active' : ''}`} style={{ background: `var(--cover-${c})` }} onClick={() => onPick(c)} />)}
      <CoverLink onPick={onPick} />
    </div>
  )
}

/** A cover from a web address or a picture on this computer. */
function CoverLink({ onPick }: { onPick: (c: string) => void }): JSX.Element {
  const [v, setV] = useState('')
  const use = (): void => { const t = v.trim(); if (/^https?:\/\/\S+$/i.test(t)) onPick(t) }
  const upload = async (): Promise<void> => {
    const image = await pickImageData()
    if (image) onPick(image)
  }
  return (
    <div className="cover-link">
      <input className="input input-sm" placeholder="Paste a picture's link" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') use() }} />
      <Button small onClick={use}>Use</Button>
      <Button small icon="imageUp" onClick={() => { void upload() }}>Upload</Button>
    </div>
  )
}

function PageCover({ page }: { page: Page }): JSX.Element | null {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const style = coverStyle(page.cover)
  if (!style) return null
  return (
    <div className="page-cover" data-picker-open={!!el} style={style}>
      {!page.locked && (
        <div className="page-cover-actions">
          <Button small onClick={(e) => setEl(e.currentTarget as HTMLElement)}>Change cover</Button>
          <Button small onClick={() => updatePage(page.id, (p) => { p.cover = null })}>Remove</Button>
        </div>
      )}
      {el && <Popover anchor={el} onClose={() => setEl(null)} width={300} align="end"><CoverPicker value={page.cover} onPick={(c) => { updatePage(page.id, (p) => { p.cover = c }); setEl(null) }} /></Popover>}
    </div>
  )
}

const randomCover = (): string => COVERS[Math.floor(Math.random() * COVERS.length)]

/** Icon and cover are optional: a page without them shows these buttons while hovering its top. */
function PageAdds({ page }: { page: Page }): JSX.Element | null {
  const [el, setEl] = useState<HTMLElement | null>(null)
  if (page.locked || (page.icon && page.cover)) return null
  return (
    <div className="page-adds">
      {!page.icon && <button className="page-add" onClick={(e) => setEl(e.currentTarget)}><Icon name="smile" size={14} /> Add icon</button>}
      {!page.cover && <button className="page-add" onClick={() => updatePage(page.id, (p) => { p.cover = randomCover() })}><Icon name="image" size={14} /> Add cover</button>}
      {el && (
        <Popover anchor={el} onClose={() => setEl(null)} width={340}>
          <IconPicker color={page.iconColor} onColor={(c) => updatePage(page.id, (p) => { p.iconColor = c || undefined })} onPick={(n) => { updatePage(page.id, (p) => { p.icon = n }); setEl(null) }} />
        </Popover>
      )}
    </div>
  )
}

function PageView({ id }: { id: string }): JSX.Element | null {
  const page = useData((d) => d.pages[id])
  const titleRef = useRef<HTMLInputElement>(null)
  const titleWas = useRef<string | null>(null)
  useEffect(() => {
    if ((window as any).__lastCreated === id && page && !page.title) titleRef.current?.focus()
  }, [id])
  if (!page) return null
  const info = typeInfo(page.type)
  const showNotes = page.type !== 'doc' && page.view?.notes
  return (
    <div style={page.accent ? { "--accent":page.accent, "--accent-ink":page.accent } as React.CSSProperties : undefined} className={`page ${page.fullWidth || ['calendar', 'board', 'project', 'database', 'dashboard'].includes(page.type) ? 'full' : ''} page-${page.type} ${page.cover ? 'page-has-cover' : ''}`}>
      <PageCover page={page} />
      <div className="page-top">
      <PageAdds page={page} />
      <div className="page-header">
        {page.icon && <IconPickerButton size="lg" value={page.icon} placeholder={info.icon} color={page.iconColor} onColor={(c) => updatePage(id, (p) => { p.iconColor = c || undefined })} onChange={(icon) => updatePage(id, (p) => { p.icon = icon })} />}
        <input
          ref={titleRef}
          id={`title-${id}`}
          className="page-title"
          placeholder="Untitled"
          value={page.title}
          readOnly={page.locked}
          onChange={(e) => updatePage(id, (p) => { p.title = e.target.value }, 'title:' + id)}
          onFocus={(e) => { titleWas.current = e.currentTarget.value }}
          onBlur={(e) => { const was = titleWas.current; titleWas.current = null; if (was !== null && was !== e.currentTarget.value) renameLinks(was || 'Untitled', e.currentTarget.value || 'Untitled') }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && page.type === 'doc') {
              e.preventDefault()
              document.querySelector<HTMLTextAreaElement>('.blocks textarea')?.focus()
            }
          }}
        />
      </div>
      </div>
      {page.rowOf && <RowProps rowId={page.id} />}
      <SubpageList page={page} />
      {showNotes && <div className="page-notes glass"><BlockEditor pageId={id} locked={page.locked} /></div>}
      {page.type === 'doc' ? <DocPage pageId={page.id} /> : <ToolBody page={page} />}
      {page.type !== 'dashboard' && <Backlinks pageId={id} />}
    </div>
  )
}

function Toasts(): JSX.Element {
  const toasts = useApp((s) => s.toasts)
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast glass-strong toast-${t.kind ?? 'info'}`}>
          {t.icon && <span className="toast-icon"><Icon name={t.icon} size={15} /></span>}
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
      // shown only while it plays: an idle full-window canvas would block dragging the window
      c.classList.add('on')
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
        else { ctx.clearRect(0, 0, c.width, c.height); c.classList.remove('on') }
      }
      step()
    })
  }, [])
  return <canvas ref={ref} className="confetti" />
}

function useAppearance(): void {
  const s = useData((d) => d.settings)
  habitWeek.start = s.weekStart
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const fn = (e: MediaQueryListEvent): void => setSystemDark(e.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])
  useEffect(() => { api.setTheme(s.theme) }, [s.theme])
  useEffect(() => { api.setShell({ closeToTray: s.closeToTray, quickAddHotkey: s.quickAddHotkey, quickAddKey:s.quickAddKey }).catch(() => {}) }, [s.closeToTray, s.quickAddHotkey,s.quickAddKey])
  useEffect(() => api.onQuickAdd(() => setOverlay('quickAdd')), [])
  useEffect(() => { api.info().then((i) => { if (i.micaSupported && i.material !== s.material) api.setMaterial(s.material) }) }, [])
  useEffect(() => api.onOpenPage((id) => openPage(id)), [])
  const dark = s.theme === 'dark' || (s.theme === 'system' && systemDark)
  useEffect(() => { applyLook(document.documentElement, s, dark) }, [dark, s])
  useEffect(() => { applyCustomCss(document, s.look.customCss) }, [s.look.customCss])
  useEffect(() => {
    api.info().then((i) => document.documentElement.classList.toggle('mica', i.micaSupported && s.material !== 'none' && s.backdrop === 'mica'))
  }, [s.material, s.backdrop])
}

/** Keeps pages imported from the Notion app up to date. */
function useNotionSync(): void {
  const on = useData((d) => d.settings.notionSync)
  const ready = useApp((s) => s.ready)
  useEffect(() => {
    if (!on || !ready || !isDesktop) return
    const run = (): void => {
      const d = getData()
      // Pages from the Notion app; pages from a Notion connection refresh with the connection.
      const ids = Object.values(d.pages).filter((p) => p.source?.kind === 'notion' && !p.source.via && !p.deletedAt && !p.rowOf && (!p.parentId || !d.pages[p.parentId]?.source)).map((p) => p.id)
      if (ids.length) refreshFromNotion(ids, true).catch(() => {})
    }
    const first = setTimeout(run, 4000)
    const id = setInterval(run, 30 * 60 * 1000)
    return () => { clearTimeout(first); clearInterval(id) }
  }, [on, ready])
}

function useConnections(): void {
  const ready = useApp((s) => s.ready)
  useEffect(() => (ready ? startConnections() : undefined), [ready])
}

function useDesktopWidgets(): void {
  const ready = useApp((s) => s.ready)
  useEffect(() => (ready ? startDesktop() : undefined), [ready])
  useEffect(() => (ready ? watchHistory() : undefined), [ready])
  // Unpackaged runs and the browser preview only: lets automated checks drive the app.
  useEffect(() => {
    api.info().then((i) => { if (!i.packaged) (window as any).__desk = { act, getData, addDesktopWidget, addDeskSet, runCommand, addSpace, switchSpace, applyImport, api, openView, setOverlay, openPage, useFeeds, useMedia, loadFeed } }).catch(() => {})
  }, [])
}

function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.ctrlKey || e.metaKey
      const typing = (e.target as HTMLElement)?.closest?.('input, textarea, [contenteditable]')
      const k = e.key.toLowerCase()
      if (mod && k === (getData().settings.searchKey||'k')) { e.preventDefault(); setOverlay(useApp.getState().overlay === 'search' ? null : 'search') }
      else if (mod && k === 'n') { e.preventDefault(); setOverlay('newPage', { parentId: null }) }
      else if (mod && k === ',') { e.preventDefault(); openSettings() }
      else if (mod && k === '/') { e.preventDefault(); setOverlay('shortcuts') }
      else if (mod && k === 'j') { e.preventDefault(); toggleAssistant() }
      else if (mod && k === '\\') { e.preventDefault(); setSettings((s) => { s.sidebarCollapsed = !s.sidebarCollapsed }) }
      else if (mod && e.shiftKey && k === 'l') { e.preventDefault(); const dark = document.documentElement.dataset.theme === 'dark'; setSettings((s) => { s.theme = dark ? 'light' : 'dark' }) }
      else if (mod && e.shiftKey && k === 't') { e.preventDefault(); reopenTab() }
      else if (mod && k === 't') { e.preventDefault(); newTab() }
      else if (mod && k === 'w') { e.preventDefault(); closeTab() }
      else if (mod && e.key === 'Tab') { e.preventDefault(); cycleTab(e.shiftKey ? -1 : 1) }
      else if (mod && e.key === 'PageDown') { e.preventDefault(); cycleTab(1) }
      else if (mod && e.key === 'PageUp') { e.preventDefault(); cycleTab(-1) }
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
    let n = 0
    const id = setInterval(() => {
      focusActions.tick()
      const d = getData()
      if (!d.settings.notifications) return
      if (n++ % 15 === 0) fireReminders(d)
      const now = Date.now()
      const due = Object.values(d.tasks).filter(t => {
        if (t.done) return false
        const at = taskReminderAt(t)
        return at != null && at <= now && (!t.reminded || (t.reminderBeforeMinutes != null && t.remindedFor !== at))
      })
      if (due.length) {
        for (const t of due) api.notify('Reminder', t.title)
        act((dr) => { for (const t of due) {
          const task = dr.tasks[t.id]
          if (task) { task.reminded = true; task.remindedFor = taskReminderAt(t) ?? undefined }
        } }, { history: false })
      }
    }, 1000)
    return () => clearInterval(id)
  }, [])
}

export function App(): JSX.Element {
  return <MainApp />
}


function MainApp(): JSX.Element {
  const ready = useApp((s) => s.ready)
  const current = useApp((s) => s.current)
  const overlay = useApp((s) => s.overlay)
  const [embedId, setEmbedId] = useState<string | null>(null)
  const embedIn = (id: string): void => {
    if (!embedId) return
    if (getData().pages[id]?.locked) { toast('Unlock this page to add a tool'); return }
    updatePage(id, p => {
      const at = p.blocks.at(-1)
      p.blocks.splice(at?.type === 'p' && !at.text ? p.blocks.length - 1 : p.blocks.length, 0, { id: uid(), type: 'tool', text: '', ref: embedId })
      if (p.blocks.at(-1)?.type !== 'p') p.blocks.push({ id: uid(), type: 'p', text: '' })
    })
    setEmbedId(null); openPage(id)
  }
  const collapsed = useData((d) => d.settings.sidebarCollapsed)
  const page = useData((d) => (current ? d.pages[current] : undefined))
  const canUndo = useApp((s) => s.canUndo)
  const canRedo = useApp((s) => s.canRedo)
  const assistantOpen = useAssistant((s) => s.open)
  const assistantVisible = assistantOpen && current !== '@assistant'
  const [locked,setLocked]=useState(false),[bootError,setBootError]=useState('')
  const load=():void=>{setBootError('');api.vaultStatus().then(async v=>{setLocked(v.locked);if(!v.locked)await boot()}).catch(e=>setBootError(e.message))}
  useEffect(load, [])
  useEffect(() => { if (ready) restoreTabs() }, [ready])
  const tabCount = useTabs((s) => s.tabs.length)
  useAppearance()
  useShortcuts()
  useTicker()
  useNotionSync()
  useConnections()
  useDesktopWidgets()
  if (!ready) return <main className="boot">{locked?<section className="panel glass"><h2>Unlock Deskbase</h2><WorkspacePassword mode="unlock" onDone={load}/></section>:bootError?<section role="alert">{bootError}<button className="btn" onClick={load}>Retry</button></section>:null}</main>
  const view = isView(current) ? current : null

  return (
    <div className={`app ${collapsed ? 'sidebar-collapsed' : ''} ${assistantVisible ? 'assistant-open' : ''}`}>
      <Sidebar />
      <main className="main">
        {tabCount > 1 && <TabStrip captionSpace={!assistantVisible} />}
        <header className={`topbar drag ${tabCount > 1 ? 'under-tabs' : ''}`}>
          {collapsed && <AppMenu />}
          {collapsed && <button className="icon-btn no-drag" title="Show sidebar (Ctrl+\)" onClick={() => setSettings((s) => { s.sidebarCollapsed = false })}><Icon name="sidebar" size={16} /></button>}
          <button className="icon-btn no-drag" title="Back (Ctrl+[)" onClick={goBack}><Icon name="left" size={15} stroke={2} /></button>
          <button className="icon-btn no-drag" title="Forward (Ctrl+])" onClick={goForward}><Icon name="right" size={15} stroke={2} /></button>
          {view ? <div className="crumbs"><span className="crumb"><Icon name={view === '@settings' ? 'settings' : view === '@desktop' ? 'monitor' : view === '@assistant' ? 'sparkle' : view === '@connections' ? 'plug' : 'palette'} size={14} /> {view === '@settings' ? 'Settings' : view === '@desktop' ? 'Desktop' : view === '@assistant' ? 'Assistant' : view === '@connections' ? 'Connections' : 'Appearance'}</span></div> : page && <Breadcrumbs page={page} />}
          <div className="spacer" />
          <FocusMini />
          <SaveIndicator />
          <button className="icon-btn no-drag" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}><Icon name="undo" size={15} /></button>
          <button className="icon-btn no-drag" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}><Icon name="redo" size={15} /></button>
          <button className={`icon-btn no-drag ${assistantOpen ? 'accent' : ''}`} title="Assistant (Ctrl+J)" onClick={toggleAssistant}><Icon name="sparkle" size={15} /></button>
          {page && !view && (
            <span className="no-drag">
              <MenuButton items={[
                { label: page.favorite ? 'Remove from favorites' : 'Add to favorites', icon: 'star', onClick: () => updatePage(page.id, (p) => { p.favorite = !p.favorite }) },
                { label: page.cover ? 'Remove cover' : 'Add cover', icon: 'grid', onClick: () => updatePage(page.id, (p) => { p.cover = p.cover ? null : randomCover() }) },
                { label: 'Full width', checked: !!page.fullWidth, onClick: () => updatePage(page.id, (p) => { p.fullWidth = !p.fullWidth }) },
                { label: 'Lock page', checked: !!page.locked, onClick: () => updatePage(page.id, (p) => { p.locked = !p.locked }) },
                { label: page.rowOf ? 'Template for new rows' : 'Use as a template', checked: !!page.template, onClick: () => updatePage(page.id, (p) => { p.template = !p.template || undefined }) },
                ...(page.type !== 'doc' ? [{ label: 'Show notes area', checked: !!page.view?.notes, onClick: () => updatePage(page.id, (p) => { p.view = { ...(p.view ?? {}), notes: !p.view?.notes } }) }] : []),
                { divider: true, label: '' },
                ...(page.type !== 'doc' ? [{ label: 'Add to a normal page…', icon: 'pageLink', onClick: () => setEmbedId(page.id) }] : []),
                { label: 'Add subpage', icon: 'plus', onClick: () => setOverlay('newPage', { parentId: page.id }) },
                { label: 'Duplicate', icon: 'copy', onClick: () => duplicatePage(page.id) },
                { label: 'Move to…', icon: 'folder', onClick: () => setOverlay('movePage', { pageId: page.id }) },
                { label: 'Page accent', icon: 'palette', onClick: () => {const input=document.createElement('input'); input.type='color'; input.value=page.accent||'#6488cc'; input.onchange=()=>updatePage(page.id,p=>{p.accent=input.value}); input.click()} },
                ...(page.accent?[{ label:'Reset page accent',onClick:()=>updatePage(page.id,p=>{delete p.accent}) }]:[]),
                { label: 'Print or save PDF', icon: 'download', onClick: () => window.print() },
                { label: 'Export as Markdown', icon: 'download', onClick: () => exportPageMarkdown(page.id) },
                { label: 'Page history', icon: 'history', onClick: () => setOverlay('history', { pageId: page.id }) },
                ...(page.source?.kind === 'notion' ? [{ label: 'Refresh from Notion', icon: 'refresh', onClick: () => { refreshFromNotion([page.id]) } }] : []),
                ...(isDesktop && page.type === 'doc' ? [{ label: 'Show on desktop', icon: 'monitor', onClick: () => { addDesktopWidget(page.blocks.some((b) => b.type === 'todo') ? 'checklist' : 'pageview', { config: { pageId: page.id, hideChecked: true }, w: 340, h: 420 }) } }] : []),
                { divider: true, label: '' },
                { label: `Edited ${new Date(page.updatedAt).toLocaleString()}`, disabled: true },
                { label: 'Move to trash', icon: 'trash', danger: true, onClick: () => trashPage(page.id) }
              ]} />
            </span>
          )}
          {!assistantVisible && tabCount < 2 && <div className="caption-space" />}
        </header>
        <div className="scroll" tabIndex={view === '@settings' ? 0 : undefined} key={view === '@settings' ? 'settings' : 'workspace'}>
          {view === '@settings' ? <SettingsPage /> : view === '@desktop' ? <DesktopPage key="desktop" /> : view === '@appearance' ? <AppearancePage key="appearance" /> : view === '@assistant' ? <AssistantPage key="assistant" /> : view === '@connections' ? <ConnectionsPage key="connections" /> : page && !page.deletedAt ? <PageView key={page.id} id={page.id} /> : (
            <StartView />
          )}
        </div>
      </main>
      <AssistantPanel />
      {embedId && <Modal title="Add to a normal page" width={390} onClose={() => setEmbedId(null)}>
        <div className="erase-confirm"><Button small onClick={() => embedIn(createPage('doc'))}>New normal page</Button><PagePicker only="doc" onPick={embedIn} /></div>
      </Modal>}
      <WindowControls />
      {overlay === 'search' && <CommandPalette />}
      {overlay === 'notionImport' && <NotionImportDialog />}
      {overlay === 'newPage' && <NewPageDialog />}
      {overlay === 'trash' && <TrashDialog />}
      {overlay === 'shortcuts' && <ShortcutsDialog />}
      {overlay === 'movePage' && <MovePageDialog />}
      {overlay === 'quickAdd' && <QuickAddDialog />}
      {overlay === 'values' && <ValuesDialog />}
      {overlay === 'history' && <HistoryDialog />}
      <Toasts />
      <Confetti />
    </div>
  )
}
