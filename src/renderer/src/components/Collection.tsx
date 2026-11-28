import { useState } from 'react'
import { parseCsv } from '../../../shared/markdown'
import type { ListEntry, Page } from '../types'
import { toast, updatePage } from '../store'
import { api } from '../lib/api'
import { today, uid } from '../lib/util'
import { Button, Modal } from './ui'

interface ListOptions { statuses:string[]; fields:string[] }
const presets:Record<string,ListOptions>={
  films:{statuses:['To watch','Watching','Watched'],fields:['Director','Release year','Streaming service']},
  games:{statuses:['To play','Playing','Finished'],fields:['Platform','Genre','Edition']},
  books:{statuses:['To read','Reading','Read'],fields:['Author','Format','ISBN']},
  custom:{statuses:[],fields:[]}
}
function listOptions(page:Page):ListOptions {
  const settings=page.view?.collection
  return {
    statuses:Array.isArray(settings?.statuses)?settings.statuses.filter((v:unknown)=>typeof v==='string'):[],
    fields:Array.isArray(settings?.fields)?settings.fields.filter((v:unknown)=>typeof v==='string'):[]
  }
}
const createEntry=(name:string,category='Unsorted'):ListEntry=>({id:uid(),name,category,target:1,done:0,unit:''})
const lines=(value:string)=>[...new Set(value.split('\n').map(x=>x.trim()).filter(Boolean))].slice(0,25)
const normalized=(value:string)=>value.trim().toLowerCase().replace(/\s+/g,' ')

function CollectionSettings({page,close}:{page:Page;close:()=>void}) {
  const prior=listOptions(page)
  const [statuses,setStatuses]=useState(prior.statuses.join('\n'))
  const [fields,setFields]=useState(prior.fields.join('\n'))
  return <Modal title="Collection fields" onClose={close}><div className="modal-body doc-tool-dialog">
    <label>Use a preset<select className="input" defaultValue="" onChange={e=>{
      const preset=presets[e.target.value];if(!preset)return
      setStatuses(preset.statuses.join('\n'));setFields(preset.fields.join('\n'))
    }}><option value="">Choose preset</option>{Object.keys(presets).map(id=><option key={id}>{id}</option>)}</select></label>
    <label>Statuses, one per line<textarea className="input" value={statuses} onChange={e=>setStatuses(e.target.value)}/></label>
    <label>Custom fields, one per line<textarea className="input" value={fields} onChange={e=>setFields(e.target.value)}/></label>
    <Button kind="primary" onClick={()=>{updatePage(page.id,p=>{p.view={...p.view,collection:{statuses:lines(statuses),fields:lines(fields)}}});close()}}>Save fields</Button>
  </div></Modal>
}

function CollectionCsv({page,close}:{page:Page;close:()=>void}) {
  const [raw,setRaw]=useState('')
  const [mapping,setMapping]=useState<Record<string,string>>(page.view?.csvMapping ?? {})
  const matrix=parseCsv(raw)
  const labels=matrix[0] || []
  const fields=['Title','Category','Status','Mood','Minutes','Series',...listOptions(page).fields.filter(name=>!['Title','Category','Status','Mood','Minutes','Series'].includes(name))]
  const index=(field:string)=>mapping[field] ? labels.indexOf(mapping[field]) : labels.findIndex(label=>normalized(label)===normalized(field) || (field==='Title' && normalized(label)==='name'))
  const converted=matrix.slice(1,10001).flatMap(row=>{
    const get=(field:string)=>row[index(field)]?.trim() || ''
    if(!get('Title'))return []
    return [{...createEntry(get('Title'),get('Category')||'Unsorted'),status:get('Status'),mood:get('Mood'),minutes:Number(get('Minutes'))>0?Number(get('Minutes')):undefined,series:get('Series'),
      fields:Object.fromEntries(listOptions(page).fields.map(field=>[field,get(field)]))}]
  })
  return <Modal title="Import collection CSV" onClose={close}><div className="modal-body doc-tool-dialog">
    <label>CSV file<input type="file" accept=".csv,text/csv" onChange={async e=>{
      const file=e.target.files?.[0];if(file && file.size<=5_000_000){try{setRaw(await file.text())}catch{toast('Could not read the CSV.')}}else if(file)toast('Choose a CSV smaller than 5 MB.')
    }}/></label>
    <label>Or paste CSV<textarea className="input" placeholder="Title,Category,Status" maxLength={5_000_000} value={raw} onChange={e=>setRaw(e.target.value)}/></label>
    {!!labels.length && <>{fields.map(field=><label key={field}>{field}<select className="input input-sm" value={labels[index(field)] || ''} onChange={e=>setMapping({...mapping,[field]:e.target.value||'-skip-'})}>
      <option value="">Skip field</option>{labels.map((label,i)=><option key={i}>{label}</option>)}
    </select></label>)}
      <div>{converted.length} rows ready</div><ul>{converted.slice(0,5).map(row=><li key={row.id}>{row.name} · {row.category}</li>)}</ul>
      <Button disabled={!converted.length} kind="primary" onClick={()=>{updatePage(page.id,p=>{
        ;(p.entries ??=[]).push(...converted)
        p.view={...p.view,csvMapping:Object.fromEntries(fields.map(field=>[field,labels[index(field)] || '-skip-']))}
      });toast('Collection imported',{undo:true});close()}}>Import rows</Button></>}
  </div></Modal>
}

function EntryDetails({row,options,patch}:{row:ListEntry;options:ListOptions;patch:(fields:Partial<ListEntry>)=>void}) {
  const [date,setDate]=useState(today),[note,setNote]=useState('')
  return <div className="collection-details doc-tool-dialog">
    {options.statuses.length>0 && <label>Status<select className="input" value={row.status || ''} onChange={e=>patch({status:e.target.value})}>
      <option value="">None</option>{[...new Set([...options.statuses,...row.status?[row.status]:[]])].map(s=><option key={s}>{s}</option>)}
    </select></label>}
    <div className="purchase-budget">
      {(['mood','series','lender','handover','spoiler'] as const).map(field=><label key={field}>{field==='handover'?'Handover note':field==='spoiler'?'Spoiler note':field[0].toUpperCase()+field.slice(1)}
        <input className="input" value={row[field] || ''} onChange={e=>patch({[field]:e.target.value})}/></label>)}
      <label>Run time (minutes)<input className="input" type="number" min="1" value={row.minutes ?? ''} onChange={e=>patch({minutes:Number(e.target.value)||undefined})}/></label>
      <label>Instalment number<input className="input" type="number" min="1" value={row.installment ?? ''} onChange={e=>patch({installment:Number(e.target.value)||undefined})}/></label>
      <label>Return by<input className="input" type="date" value={row.returnBy || ''} onChange={e=>patch({returnBy:e.target.value})}/></label>
      {options.fields.map(field=><label key={field}>{field}<input className="input" value={row.fields?.[field] || ''} onChange={e=>patch({fields:{...row.fields,[field]:e.target.value}})}/></label>)}
    </div>
    <details><summary>Watches and playthroughs ({row.runs?.length || 0})</summary>
      {(row.runs || []).map(run=><div key={run.id} className="row gap-sm wrap">{run.date} · {run.notes || 'No notes'}
        <Button small onClick={()=>patch({runs:row.runs?.filter(r=>r.id!==run.id)})}>Remove</Button></div>)}
      <div className="row gap-sm wrap"><input aria-label="Run date" className="input" type="date" value={date} onChange={e=>setDate(e.target.value)}/><input aria-label="Run notes" className="input" value={note} onChange={e=>setNote(e.target.value)}/>
        <Button small disabled={!date} onClick={()=>{patch({runs:[...row.runs ?? [],{id:uid(),date,notes:note.trim()}]});setNote('')}}>Add run</Button>
      </div>
    </details>
  </div>
}

function CollectionExport({page,close}:{page:Page;close:()=>void}) {
  const [privateFields,setPrivate]=useState(false)
  const settings=listOptions(page)
  const fields=['name','category','status','series','installment','mood','minutes','runs','fields',...privateFields?['lender','returnBy','handover','spoiler']:[]]
  const items=(page.entries || []).map(entry=>({
    name:entry.name,category:entry.category,status:entry.status,series:entry.series,installment:entry.installment,mood:entry.mood,minutes:entry.minutes,runs:entry.runs,
    fields:Object.fromEntries(settings.fields.map(field=>[field,entry.fields?.[field] || ''])),
    ...(privateFields ? {lender:entry.lender,returnBy:entry.returnBy,handover:entry.handover,spoiler:entry.spoiler} : {})
  }))
  const title=page.title || 'Collection'
  return <Modal title="Collection export preview" onClose={close}><div className="modal-body doc-tool-dialog">
    <label><input type="checkbox" checked={privateFields} onChange={e=>setPrivate(e.target.checked)}/> Include borrowing and spoiler notes</label>
    <p>{items.length} entries · {fields.join(', ')}</p><ul>{items.slice(0,10).map((i,index)=><li key={index}>{i.name}</li>)}</ul>
    <Button kind="primary" onClick={()=>void api.exportFile(JSON.stringify({kind:'deskbase-collection',title,settings,items},null,2),(title.replace(/[^\w -]+/g,'').trim()||'Collection')+'.json')
      .then(file=>{if(file)close()}).catch(()=>toast('Could not save the export.'))}>Export JSON</Button>
  </div></Modal>
}

export function Collection({page}:{page:Page}):JSX.Element{
  const rows=page.entries ?? []
  const categories=[...new Set(rows.map(r=>r.category||'Unsorted'))]
  const options=listOptions(page)
  const [title,setTitle]=useState(''),[category,setCategory]=useState(''),[filter,setFilter]=useState(''),[edit,setEdit]=useState('')
  const [status,setStatus]=useState(''),[mood,setMood]=useState(''),[time,setTime]=useState('')
  const [selection,select]=useState<string[]>([]),[moveTo,setMoveTo]=useState('')
  const [duplicate,confirm]=useState(false),[picked,pick]=useState('')
  const [modal,setModal]=useState<'fields'|'csv'|'export'|null>(null)
  const [group,groupBySeries]=useState(false)
  const clear=()=>{setTitle('');setCategory('');setEdit('');confirm(false)}
  const editRow=(id:string,fields:Partial<ListEntry>)=>updatePage(page.id,p=>{const row=p.entries?.find(r=>r.id===id);if(row)Object.assign(row,fields)})
  const visible=rows.filter(r=>(!filter || (r.category||'Unsorted')===filter) && (!status || r.status===status) &&
    (!mood || normalized(r.mood||'').includes(normalized(mood))) && (!time || (!!r.minutes && r.minutes<=Number(time))))
  const key=(row:ListEntry)=>group?row.series || 'Standalone':row.category || 'Unsorted'
  const groups=[...new Set(visible.map(key))]
  function saveEntry():void {
    const name=title.trim()
    if(!name)return
    if(!duplicate && rows.some(r=>r.id!==edit && normalized(r.name)===normalized(name))){confirm(true);return}
    const cat=category.trim() || filter || 'Unsorted'
    if(edit){editRow(edit,{name,category:cat});clear();return}
    const item=createEntry(name,cat)
    updatePage(page.id,p=>{(p.entries??=[]).push(item)});clear()
  }
  return <section className="list-tracker">
    <div className="row wrap gap-sm"><label>Show category<select className="input input-sm" value={filter} onChange={e=>setFilter(e.target.value)}><option value="">All categories</option>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
      {!!options.statuses.length && <label>Status<select className="input input-sm" value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option>{options.statuses.map(v=><option key={v}>{v}</option>)}</select></label>}
      <Button small onClick={()=>setModal('fields')}>Fields</Button><Button small onClick={()=>setModal('csv')}>Import CSV</Button><Button small onClick={()=>setModal('export')}>Export</Button>
    </div>
    <details><summary>Pick something to try</summary><div className="row wrap gap-xs">
      <input className="input input-sm" aria-label="Mood filter" placeholder="Mood" value={mood} onChange={e=>setMood(e.target.value)}/>
      <input className="input input-sm w-80" type="number" aria-label="Available minutes" min="1" placeholder="Min" value={time} onChange={e=>setTime(e.target.value)}/>
      <Button small disabled={!visible.length} onClick={()=>pick(visible[Math.floor(Math.random()*visible.length)].id)}>Pick an entry</Button>
      {visible.some(r=>r.id===picked) && <strong>{visible.find(r=>r.id===picked)?.name}</strong>}
    </div></details>
    <label><input type="checkbox" checked={group} onChange={e=>groupBySeries(e.target.checked)}/> Group by series</label>
    <form className="tracker-add" onSubmit={e=>{e.preventDefault();saveEntry()}}>
      <label>Title<input className="input" aria-label="List item" required value={title} onChange={e=>{setTitle(e.target.value);confirm(false)}}/></label>
      <label>Category<input className="input" list={'categories-'+page.id} placeholder="e.g. To play" value={category} onChange={e=>setCategory(e.target.value)}/></label>
      <datalist id={'categories-'+page.id}>{categories.map(c=><option key={c}>{c}</option>)}</datalist>
      <button className="btn btn-sm">{duplicate?'Save anyway':edit?'Save':'Add'}</button>{edit&&<Button small onClick={clear}>Cancel</Button>}
      {duplicate && <span className="danger small" role="alert">An entry already has that title.</span>}
    </form>
    {!!selection.length && <div className="row gap-sm wrap"><span>{selection.length} selected</span><input className="input" aria-label="Move selection to category" value={moveTo} onChange={e=>setMoveTo(e.target.value)}/>
      <Button small disabled={!moveTo.trim()} onClick={()=>{updatePage(page.id,p=>{for(const r of p.entries || [])if(selection.includes(r.id))r.category=moveTo.trim()});select([]);setMoveTo('');toast('Entries moved',{undo:true})}}>Move selected</Button>
    </div>}
    {groups.map(name=>{
      const entries=visible.filter(r=>key(r)===name)
      if(group)entries.sort((a,b)=>(a.installment ?? Infinity)-(b.installment ?? Infinity))
      const next=group && name!=='Standalone' ? entries.find(r=>r.status!==options.statuses.at(-1) || !r.status) : undefined
      return <section key={name}><h3>{name}</h3>{entries.map(row=><div key={row.id} data-widget-item={row.name}>
        <div className="list-entry">
          <input type="checkbox" aria-label={'Select '+row.name} checked={selection.includes(row.id)} onChange={e=>select(old=>e.target.checked?[...old,row.id]:old.filter(id=>id!==row.id))}/>
          <span className="grow">{row.installment && group ? '#'+row.installment+' · ' : ''}{row.name}{next?.id===row.id && <small> · Up next</small>}{row.status && <small> · {row.status}</small>}{row.lender && <small> · From {row.lender}{row.returnBy?' · due '+row.returnBy:''}</small>}</span>
          <Button small icon="edit" title={'Edit '+row.name} onClick={()=>{setEdit(row.id);setTitle(row.name);setCategory(row.category || '')}}/>
          <Button small icon="trash" title={'Remove '+row.name} onClick={()=>{updatePage(page.id,p=>{
            ;(p.removedEntries ??=[]).push(row);p.entries=p.entries?.filter(r=>r.id!==row.id)
          });if(edit===row.id)clear();select(old=>old.filter(id=>id!==row.id));toast('Entry moved to Recently removed',{undo:true})}}/>
        </div>
        {row.spoiler && <details><summary>Reveal spoiler</summary>{row.spoiler}</details>}
        {edit===row.id && <EntryDetails key={row.id} row={row} options={options} patch={fields=>editRow(row.id,fields)}/>}
      </div>)}</section>
    })}
    {!!page.removedEntries?.length && <details><summary>Recently removed ({page.removedEntries.length})</summary>{page.removedEntries.map(row=><div className="row between" key={row.id}>
      {row.name}<Button small onClick={()=>updatePage(page.id,p=>{
        if(!p.entries?.some(r=>r.id===row.id))(p.entries??=[]).push(row)
        p.removedEntries=p.removedEntries?.filter(r=>r.id!==row.id)
      })}>Restore {row.name}</Button></div>)}</details>}
    {modal==='fields' && <CollectionSettings page={page} close={()=>setModal(null)}/>}
    {modal==='csv' && <CollectionCsv page={page} close={()=>setModal(null)}/>}
    {modal==='export' && <CollectionExport page={page} close={()=>setModal(null)}/>}
  </section>
}
