import { useEffect, useState } from 'react'
import { act, getData, useData } from '../store'
import { Button, Modal } from './ui'
import { api, type PageVersion } from '../lib/api'
import { findBlock } from './Blocks'
import { parseInline, pageByTitle } from '../lib/links'
import { copyArrangement, walkBlocks } from '../lib/documentTools'
import { uid } from '../lib/util'
import type { Block } from '../types'

export type EditorAction = 'save' | 'shelf' | 'history' | 'read' | 'links' | 'paste'
export interface EditorRequest { action: EditorAction; id: string; ref?: string; ids?: string[] }
export function DocumentTools({ pageId, request, close, insert, replace }: {
  pageId: string; request: EditorRequest; close: () => void; insert: (blocks: Block[]) => void; replace: (block: Block) => void
}) {
  const {action, id} = request
  const pages = useData(d => d.pages)
  const snippets = useData(d => d.settings.blockSnippets)
  const [name, setName] = useState('')
  const [versions, setVersions] = useState<PageVersion[]>([])
  const [version, selectVersion] = useState(0)
  const [compare, selectCompare] = useState(-1)
  const [replacements, setReplacements] = useState<Record<string,string>>({})
  const [error, setError] = useState('')
  useEffect(() => {
    if (action !== 'history') return
    let live = true
    api.history.list(pageId).then(list => { if(live) setVersions(list.filter(v => findBlock(v.blocks as Block[], id)).reverse()) })
      .catch(() => { if(live) setError('Could not load saved revisions.') })
    return () => {live = false}
  }, [pageId, id, action])
  const page = pages[pageId]
  const block = findBlock(page.blocks, id)
  const [sourcePage, sourceId] = (request.ref || '').split('/')
  const source = pages[sourcePage]
  const original = source && !source.deletedAt ? findBlock(source.blocks, sourceId) : undefined
  const headings = { save:'Save snippet', shelf:'Snippet shelf', history:'Paragraph history', read:'Page preview', links:'Resolve page links', paste:'Paste block link' }
  const missing = new Set<string>()
  if (action === 'links') walkBlocks(page.blocks, b => {
    for (const text of [b.text,b.body || '']) for (const part of parseInline(text)) {
      if (part.kind === 'page' && !pageByTitle({ pages },part.title)) missing.add(part.title)
    }
  })
  const revision = versions[version] && findBlock(versions[version].blocks as Block[], id)
  const target = block?.ref && pages[block.ref]
  return <Modal onClose={close} width={620}><div className="modal-head"><h3>{headings[action]}</h3></div><div className="modal-body doc-tool-dialog">
    {action === 'save' && <form onSubmit={e => {
      e.preventDefault()
      if (!name.trim()) return
      const selected = request.ids || [id]
      const found = selected.map(key => findBlock(page.blocks,key)).filter((b): b is Block => !!b)
      if (!found.length) return
      act(d => { (d.settings.blockSnippets ??= []).push({ id:uid(), name:name.trim(), pageId, blocks:JSON.parse(JSON.stringify(found)) }) })
      close()
    }}><label>Snippet name<input className="input" autoFocus value={name} onChange={e => setName(e.target.value)}/></label><Button kind="primary" disabled={!name.trim()} type="submit">Save</Button></form>}
    {action === 'shelf' && <>{!snippets?.length && <p>No snippets saved yet.</p>}{snippets?.map(s => <div className="row between" key={s.id}><button className="menu-item" onClick={() => {
      insert(copyArrangement(s.blocks,s.pageId,pageId)); close()
    }}>{s.name}</button><Button small onClick={() => act(d=>{d.settings.blockSnippets=d.settings.blockSnippets?.filter(x=>x.id!==s.id)})}>Remove</Button></div>)}</>}
    {action === 'paste' && <><Button onClick={()=>{replace({id,type:'synced',ref:request.ref,text:'',style:'reference'});close()}}>Reference</Button>
      <Button onClick={()=>{replace({id,type:'synced',ref:request.ref,text:''});close()}}>Synced preview</Button>
      <Button disabled={!original} onClick={()=>{if(original){replace(copyArrangement([original],sourcePage,pageId)[0]);close()}}}>Independent copy</Button></>}
    {action === 'history' && <>{versions.length ? <select className="input" aria-label="Saved revision" value={version} onChange={e=>selectVersion(Number(e.target.value))}>{versions.map((v,i)=><option key={i} value={i}>{new Date(v.at).toLocaleString()}</option>)}</select> : <p>{error || 'No saved revisions for this paragraph.'}</p>}
      {revision && <><div className="draft-pair"><section><strong>Saved revision</strong><p>{revision.text}</p></section><section><select className="input" aria-label="Compare revision" value={compare} onChange={e=>selectCompare(Number(e.target.value))}><option value={-1}>Current</option>{versions.map((v,i)=><option key={i} value={i}>{new Date(v.at).toLocaleString()}</option>)}</select><p>{compare<0 ? block?.text : findBlock(versions[compare].blocks as Block[],id)?.text}</p></section></div><Button onClick={()=>{act(d=>{const b=findBlock(d.pages[pageId].blocks,id);if(b&&!d.pages[pageId].locked)b.text=revision.text});close()}}>Restore paragraph text</Button></>}</>}
    {action==='read' && target && <><h3>{target.title}</h3>{(() => { const lines: string[]=[]; walkBlocks(target.blocks,b=>{if(b.text)lines.push(b.text)});return lines.map((s,i)=><p key={i}>{s}</p>)})()}</>}
    {action==='links' && <>{!missing.size && <p>All page links resolve.</p>}{Array.from(missing).map(title=><label key={title}>{title}<select className="input" value={replacements[title] || ''} onChange={e=>setReplacements({...replacements,[title]:e.target.value})}><option value="">Choose page</option>{Object.values(pages).filter(p=>p.title&&!p.deletedAt && pageByTitle({pages},p.title)?.id===p.id).map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label>)}
      {!!missing.size && <Button disabled={!Object.values(replacements).some(Boolean)} onClick={()=>{act(d=>{
        const p=d.pages[pageId]; if(p.locked)return
        const fix=(s:string)=>s.replace(/\[\[([^\]\n]+)\]\]/g,(token,title:string)=>{const target=getData().pages[replacements[title.trim()]];return target && !target.deletedAt ? '[['+target.title+']]':token})
        walkBlocks(p.blocks,b=>{b.text=fix(b.text);if(b.body)b.body=fix(b.body)});p.updatedAt=Date.now()
      });close()}}>Apply destinations</Button>}</>}
  </div></Modal>
}
