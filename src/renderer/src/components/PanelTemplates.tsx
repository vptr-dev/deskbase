import { useState } from 'react'
import { act, toast, useData } from '../store'
import { savePanelLayout, createFromPanelLayout, type TemplateMode } from '../lib/layoutTemplates'
import { Button, Modal } from './ui'

export function PanelTemplates(): JSX.Element {
  const desktop = useData(d => d.desktop)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [mode, setMode] = useState<TemplateMode>('linked')
  const [id, setId] = useState('')
  const templates = desktop.templates ?? []
  return <><Button small onClick={() => { setOpen(true); setId(''); setName('') }}>Layout templates</Button>
    {open && <Modal width={430} onClose={() => setOpen(false)}><div className="modal-head"><h3>Panel layout templates</h3></div>
      <form onSubmit={e => { e.preventDefault()
        if (id) createFromPanelLayout(id, name, mode); else savePanelLayout(name)
        toast(id ? 'Workspace created' : 'Layout saved'); setOpen(false)
      }}><div className="modal-body form"><label>Layout<select className="input" value={id} onChange={e => {setId(e.target.value); setName(templates.find(t => t.id === e.target.value)?.name ?? '')}}>
        <option value="">Save current layout</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label>{id ? 'New workspace name' : 'Template name'}<input autoFocus className="input" value={name} onChange={e => setName(e.target.value)} /></label>
        {id && <label>Lists<select className="input" value={mode} onChange={e => setMode(e.target.value as TemplateMode)}><option value="linked">Link to existing lists</option><option value="fresh">Start with fresh lists</option></select></label>}</div>
        <div className="modal-foot">{id && <button type="button" className="btn" onClick={() => {act(d => {d.desktop.templates = d.desktop.templates?.filter(t => t.id !== id)}); setId(''); setName(''); toast('Template removed', {undo:true})}}>Remove template</button>}
        <button className="btn btn-primary" disabled={!name.trim()}>{id ? 'Create workspace' : 'Save layout'}</button></div></form></Modal>}</>
}
