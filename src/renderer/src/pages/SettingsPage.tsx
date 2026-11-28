import { useFeeds } from '../lib/connections'
import { useEffect, useLayoutEffect, useState } from 'react'
import { openView, flushSave, replaceData, setOverlay, setSettings, toast, useApp, useData, act } from '../store'
import { WorkspacePassword } from '../components/WorkspacePassword'
import { markdownToBlocks } from '../../../shared/markdown'
import { newPage, DEFAULT_PRESETS } from '../lib/defaults'
import type { AssistantPreset, AssistantSettings as AssistantSettingsT } from '../types'
import { api, isDesktop, type AppInfo, type UpdateStatus } from '../lib/api'
import { exportAll, tasksToCsv } from '../lib/exporters'
import { today } from '../lib/util'
import { Button, Modal, ConfirmButton, IconPickerButton, Segmented, SideIndex, Toggle, useSectionIndex } from '../components/ui'
import { Icon } from '../components/Icon'
import { PROVIDERS, type AiConfig } from '../../../shared/ai-core'
import { PlaceSearch } from '../components/PanelKit'
import { useAssistant } from '../lib/assistant'

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

function StorageBreakdown() {
  const [stats,setStats]=useState<Awaited<ReturnType<typeof api.storageBreakdown>>|null>(null)
  const [error,setError]=useState(false)
  const results=useFeeds(s=>s.results)
  const format=(size:number)=>new Intl.NumberFormat(undefined,{style:'unit',unit:'megabyte',maximumFractionDigits:2}).format(size/1_048_576)
  const feeds=Object.keys(results).length?new TextEncoder().encode(JSON.stringify(results)).length:0
  return <details onToggle={e=>{
    if (e.currentTarget.open)void api.storageBreakdown().then(value=>{setStats(value);setError(false)}).catch(()=>setError(true))
  }}>
    <summary>Storage breakdown</summary>
    {error ? <p>Could not read local storage sizes.</p> : !stats ? <p className="muted">Reading local sizes…</p> :
      <dl className="storage-breakdown">{Object.entries({'Local records':stats.records,Attachments:stats.attachments,'Page history':stats.history,Backups:stats.backups,'Feed cache (current session)':feeds}).map(([label,size])=>
        <div key={label}><dt>{label}</dt><dd>{format(size)}</dd></div>)}</dl>}
  </details>
}

export function SettingsPage(): JSX.Element {
  const s = useData((d) => d.settings)
  const pages = useData((d) => d.pages)
  const [protectedFiles,setProtectedFiles]=useState(false)
  useEffect(()=>{if(isDesktop)void api.vaultStatus().then(s=>setProtectedFiles(s.enabled))},[])
  const target = useApp((st) => st.settingsTarget)
  const SECTIONS = [
    { id: 'general', label: 'General', icon: 'settings' },
    ...(isDesktop ? [{ id: 'widget', label: 'Desktop', icon: 'monitor' }] : []),
    { id: 'assistant', label: 'Assistant', icon: 'sparkles' },
    { id: 'data', label: 'Data & backups', icon: 'database' },
    { id: 'about', label: 'About & updates', icon: 'info' }
  ]
  const { body, active, go } = useSectionIndex(SECTIONS.map((x) => x.id))
  useLayoutEffect(() => {
    if (!target) return
    if (window.matchMedia('(max-width: 1060px)').matches) useAssistant.setState({ open: false })
    const scroll = body.current?.closest<HTMLElement>('.scroll')
    scroll?.focus({ preventScroll: true })
    if (target === 'top') scroll?.scrollTo(0, 0)
    else go(target)
    useApp.setState({ settingsTarget: null })
  }, [target, body, go])
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [backups, setBackups] = useState<{ name: string; date: string; size: number }[]>([])
  const [upd, setUpd] = useState<UpdateStatus>({ state: 'idle' })
  const [confirmErase, setConfirmErase] = useState(false)
  const [erasing, setErasing] = useState(false)
  const erase = async (): Promise<void> => {
    if (erasing) return
    setErasing(true)
    try {
      await flushSave()
      if (useApp.getState().saving === 'error') throw new Error('Save failed')
      const backup = await api.createBackup()
      if (isDesktop && !backup) throw new Error('Could not create the backup')
      replaceData(null, 'Started fresh')
      setConfirmErase(false)
    } catch {
      toast('Could not back up your workspace. Your data was kept.', { kind: 'error' })
    } finally { setErasing(false) }
  }
  useEffect(() => { api.info().then(setInfo); api.updater.status().then(setUpd); api.listBackups().then(setBackups).catch(() => {}); return api.updater.onStatus(setUpd) }, [])
  const set = setSettings
  return (
    <div className="page page-settings">
      <div className="page-header"><h1 className="page-title static">Settings</h1></div>
      <div className="look-layout">
        <SideIndex className="look-index" items={SECTIONS} active={active} go={go} />
        <div className="settings-content" ref={body}>
          <section className="set-section glass" data-section="general">
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
            <Row label="Search shortcut"><select className="input" value={s.searchKey||'k'} onChange={e=>set(x=>{x.searchKey=e.target.value})}>{['k','p','f'].map(k=><option key={k} value={k}>Ctrl + {k.toUpperCase()}</option>)}</select></Row>
            {isDesktop&&s.quickAddHotkey&&<Row label="Quick add shortcut"><select className="input" value={s.quickAddKey||'CommandOrControl+Shift+Space'} onChange={e=>set(x=>{x.quickAddKey=e.target.value})}>{['CommandOrControl+Shift+Space','CommandOrControl+Alt+Q','Alt+Shift+Q'].map(k=><option key={k} value={k}>{k.replace('CommandOrControl','Ctrl')}</option>)}</select></Row>}
            {isDesktop && <Row label="Quick add hotkey" sub="Add a task from anywhere"><Toggle checked={s.quickAddHotkey} onChange={(v) => set((x) => { x.quickAddHotkey = v })} /></Row>}
          </section>
          {isDesktop && <section className="set-section glass" data-section="widget"><DesktopSettings /></section>}
          <section className="set-section glass" data-section="assistant"><AssistantSettings /></section>
          <section className="set-section glass" data-section="data">
            <TagManager/>
            {isDesktop&&<details><summary>Workspace password</summary><p className="small muted">Protects local pages, images, history and backups. Keep your password safe. Exported files are readable without it.</p><WorkspacePassword mode={protectedFiles?'disable':'enable'} onDone={()=>setProtectedFiles(!protectedFiles)}/></details>}
            <h3>Data & backups</h3>
            {isDesktop && <StorageBreakdown/>}
            <p className="muted small">Everything is stored on this computer{info?.dataPath ? <> in <code>{info.dataPath}</code></> : null}. Updates never touch your data, and a backup is made every day.</p>
            <Row label="Import Markdown pages"><label className="btn btn-sm">Choose files<input type="file" accept=".md,.markdown" multiple hidden onChange={async e=>{
              const files=Array.from(e.target.files??[]);e.target.value=''
              try {const pages=await Promise.all(files.map(async f=>{const p=newPage('doc',f.name.replace(/\.(md|markdown)$/i,''));p.blocks=markdownToBlocks(await f.text());return p}))
              act(d=>{for(const p of pages){d.pages[p.id]=p;d.rootOrder.push(p.id)}});if(pages.length)toast('Imported '+pages.length+' pages')}catch{toast('Could not read Markdown',{kind:'error'})}
            }}/></label></Row>
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
              <div className="backup-list">
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
              <Button small kind="ghost" icon="trash" onClick={() => setConfirmErase(true)}>Erase</Button>
                {confirmErase && <Modal title="Erase all data?" width={410} onClose={() => { if (!erasing) setConfirmErase(false) }}>
                  <div className="erase-confirm"><p>Are you sure you want to erase all pages, tasks, and workspace settings on this device?</p>
                    <div className="row end gap-sm"><Button disabled={erasing} onClick={() => setConfirmErase(false)}>Cancel</Button>
                    <Button kind="danger" disabled={erasing} onClick={() => void erase()}>{erasing ? 'Erasing…' : 'Erase all data'}</Button></div>
                  </div>
                </Modal>}
            </Row>
          </section>
          <section className="set-section glass" data-section="about">
            <h3>About &amp; updates</h3>
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
    </div>
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

function TagManager():JSX.Element {
 const d=useData(x=>x), names=[...new Set([...Object.keys(d.tags),...Object.values(d.tasks).flatMap(t=>t.tags),...Object.values(d.journal).flatMap(j=>j.tags)])].sort()
 const [selected,setSelected]=useState(''),[name,setName]=useState(''),[color,setColor]=useState('#5279c5')
 return <details><summary>Manage tags</summary><form className="row gap-sm wrap" onSubmit={e=>{e.preventDefault();const next=name.trim().replace(/^#+/,'');if(!next||Object.hasOwn(Object.prototype,next))return
 act(data=>{if(selected&&next!==selected){
 for(const record of [...Object.values(data.tasks),...Object.values(data.journal)]) record.tags=[...new Set(record.tags.map(t=>t===selected?next:t))]
 for(const rule of data.rules)if(rule.tag===selected)rule.tag=next
 for(const page of Object.values(data.pages)){if(page.view?.tag===selected)page.view.tag=next;for(const view of page.view?.taskViews??[])if(view.options?.tag===selected)view.options.tag=next}
 delete data.tags[selected]
 };data.tags[next]=color});setSelected(next);setName(next)
 }}><label>Tag<select className="input" value={selected} onChange={e=>{const tag=e.target.value;setSelected(tag);setName(tag);setColor(d.tags[tag]||'#5279c5')}}><option value="">New tag</option>{names.map(t=><option key={t}>{t}</option>)}</select></label>
 <label>Name<input required className="input" value={name} onChange={e=>setName(e.target.value)}/></label><label>Color<input type="color" value={color} onChange={e=>setColor(e.target.value)}/></label><button className="btn btn-sm">Save tag</button></form></details>
}
