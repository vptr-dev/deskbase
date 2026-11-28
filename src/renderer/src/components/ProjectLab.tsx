import { useState, type ReactNode } from 'react'
import { parseCsv } from '../../../shared/markdown'
import { act, openPage, toast, updatePage, useData } from '../store'
import { newPage } from '../lib/defaults'
import { emptyWishlist } from '../lib/wishlist'
import { pickImageData } from '../lib/image'
import { api } from '../lib/api'
import { today, uid } from '../lib/util'
import type { LabRun, Page, ProjectLab } from '../types'
import { Button, Sparkline } from './ui'

const emptyLab:ProjectLab={parts:[],pins:[],runs:[]}
const int=(value:number)=>Number.isFinite(value)?Math.min(100000,Math.max(0,Math.trunc(value))):0
const safe=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))

function LabField({label,value,change,type='text',min,max}:{label:string;value:string|number;change:(value:string)=>void;type?:string;min?:number;max?:number}) {
  return <label>{label}<input className="input input-sm" value={value} onChange={e=>change(e.target.value)} type={type} min={min} max={max}/></label>
}

function LabSection({title,children}:{title:string;children:ReactNode}) {
  return <details className="lab-section"><summary>{title}</summary><div className="doc-tool-dialog">{children}</div></details>
}

function Experiment({run,change}:{run:LabRun;change:(fn:(run:LabRun)=>void)=>void}) {
  const [reveal,setReveal]=useState(false)
  const [annotation,setAnnotation]=useState('')
  const [point,setPoint]=useState<{x:number;y:number}|null>(null)
  const [csv,setCsv]=useState('')
  const [error,setError]=useState('')
  const [prediction,setPrediction]=useState(run.prediction || '')
  const patch=(data:Partial<LabRun>)=>change(r=>Object.assign(r,data))
  function loadReadings(text:string):void {
    const rows=parseCsv(text)
    const measurements=rows.flatMap(([label,value,note],i)=>{
      if(i===0 && /^(value|reading|measurement)$/i.test(value?.trim() || ''))return []
      return label?.trim() && value?.trim() && Number.isFinite(Number(value))?[{label:label.trim(),value:Number(value),note:note?.trim()}]:[]
    })
    if(!measurements.length){setError('Use label,value,note columns.');return}
    patch({readings:measurements.slice(0,2500)})
    setError('')
  }
  const observations=<>
    <label>Measured result<textarea className="input" value={run.result || ''} onChange={e=>patch({result:e.target.value})}/></label>
    <div className="row gap-sm wrap"><Button small onClick={async()=>{const image=await pickImageData(1600,1200);if(image)patch({image,annotations:[]})}}>Attach breadboard photo</Button>
      <label><input type="checkbox" checked={!!run.open} onChange={e=>patch({open:e.target.checked})}/> Open test result</label></div>
    {run.image && <>
      <div className="study-diagram lab-photo" onClick={e=>{
        const bounds=e.currentTarget.getBoundingClientRect()
        if(bounds.width && bounds.height)setPoint({x:Math.max(0,Math.min(100,(e.clientX-bounds.left)*100/bounds.width)),y:Math.max(0,Math.min(100,(e.clientY-bounds.top)*100/bounds.height))})
      }}><img src={run.image} alt="Breadboard"/>
        {run.annotations.map((mark,i)=><span className="lab-marker" key={i} style={{left:mark.x+'%',top:mark.y+'%'}}>{i+1}</span>)}
        {point && <span className="lab-marker active" style={{left:point.x+'%',top:point.y+'%'}}>+</span>}
      </div>
      <p className="small muted">Select a point on the photo to mark a changed wire.</p>
      {point && <div className="row gap-sm wrap"><LabField label="Wire change" value={annotation} change={setAnnotation}/>
        <Button small disabled={!annotation.trim()} onClick={()=>{change(r=>r.annotations.push({...point,note:annotation.trim()}));setPoint(null);setAnnotation('')}}>Add marker</Button></div>}
      {run.annotations.map((mark,i)=><div className="row gap-xs" key={i}>{i+1}. {mark.note}<Button small title={'Remove marker '+(i+1)} onClick={()=>change(r=>r.annotations.splice(i,1))}>Remove</Button></div>)}
    </>}
    <details><summary>Sensor readings</summary>
      <label>Readings CSV<input type="file" accept=".csv,text/csv" onChange={async e=>{
        const file=e.target.files?.[0]
        if(!file)return
        if(file.size>2_000_000){setError('Choose a CSV smaller than 2 MB.');return}
        try { loadReadings(await file.text()) } catch {setError('Could not read measurements.')}
      }}/></label>
      <label>Paste label, value and optional note<textarea className="input" value={csv} maxLength={2_000_000} onChange={e=>setCsv(e.target.value)}/></label>
      <Button small disabled={!csv.trim()} onClick={()=>loadReadings(csv)}>Plot readings</Button>
      {error && <p role="alert">{error}</p>}
      {!!run.readings?.length && <><div className="lab-chart" aria-label="Sensor readings with calibration and hardware markers">
        <Sparkline width={260} height={85} values={run.readings.map(r=>r.value)}/>
        {run.readings.map((r,i)=>r.note && <span key={i} className="lab-chart-marker" style={{left:100*i/Math.max(1,run.readings!.length-1)+'%'}} title={r.label+' · '+r.note}/>)}
      </div>
        <ol className="lab-readings">{run.readings.map((r,i)=><li key={i}>{r.label} · {r.value}{r.note && ' · '+r.note}</li>)}</ol></>}
    </details>
  </>
  return <div className="doc-tool-dialog">
    <div className="purchase-budget">
      <LabField label="Run title" value={run.title} change={title=>patch({title})}/>
      <LabField label="Firmware version" value={run.firmware || ''} change={firmware=>patch({firmware})}/>
      <LabField label="Wiring revision" value={run.wiring || ''} change={wiring=>patch({wiring})}/>
    </div>
    <label>Prediction<textarea className="input" value={prediction} onChange={e=>setPrediction(e.target.value)}/></label>
    <Button small disabled={!prediction.trim()} onClick={()=>{patch({prediction:prediction.trim()});setReveal(true)}}>Save prediction and reveal observations</Button>
    {reveal || run.prediction ? observations : null}
  </div>
}

export function ProjectLabPage({page}:{page:Page}) {
  const pages=useData(d=>d.pages)
  const lab=page.lab || emptyLab
  const [part,setPart]=useState('')
  const [runName,setRunName]=useState('')
  const [wishlist,setWishlist]=useState('')
  const [compare,setCompare]=useState<[string,string]>(['',''])
  const [packet,setPacket]=useState<string[]>([])
  const [packName,setPackName]=useState('')
  const [includeDecisions,setIncludeDecisions]=useState(true)
  const [includeResults,setIncludeResults]=useState(true)
  const change=(fn:(lab:ProjectLab)=>void)=>updatePage(page.id,p=>fn(p.lab??={parts:[],pins:[],runs:[]}))
  const missing=lab.parts.map(p=>({...p,missing:Math.max(0,p.needed-p.stock)})).filter(p=>p.missing)
  const duplicates=new Set(lab.pins.map(p=>p.pin.trim().toLowerCase()).filter((pin,i,all)=>pin && all.indexOf(pin)!==i))
  const updatePart=(id:string,fields:Partial<ProjectLab['parts'][number]>)=>change(l=>{
    const p=l.parts.find(p=>p.id===id);if(!p)return
    Object.assign(p,fields);p.reserved=Math.min(p.stock,p.reserved)
  })
  function shoppingList():void {
    if(!missing.length)return
    let target=''
    act(d=>{
      let list=d.pages[wishlist]
      if(!list || list.deletedAt || list.type!=='wishlist') {
        list=newPage('wishlist',(page.title || 'Project')+' parts',page.id)
        d.pages[list.id]=list;d.pages[page.id].children.push(list.id)
      }
      const data=(list.wishlist??=emptyWishlist())
      for(const p of missing){
        const name=p.name+(p.number?' · '+p.number:'')
        const existing=data.items.find(i=>!i.purchased && i.category==='Project parts' && i.name===name)
        if(existing)existing.quantity=Math.max(existing.quantity || 1,p.missing)
        else data.items.push({id:uid(),name,cost:null,quantity:p.missing,purchased:false,category:'Project parts',image:p.image})
      }
      target=list.id
    })
    setWishlist(target);toast('Missing parts added',{undo:true})
  }
  async function exportPacket():Promise<void> {
    const selected = lab.runs.filter(r=>packet.includes(r.id) || (includeResults && r.open))
    const paragraphs=(text:string)=>'<p>'+safe(text)+'</p>'
    const rows=selected.map(run=>'<section><h2>'+safe(run.title)+'</h2>'+
      paragraphs([run.firmware,run.wiring].filter(Boolean).join(' · '))+
      (includeResults && run.open?paragraphs(run.result || 'Open test'):'')+
      (packet.includes(run.id) && run.image && /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(run.image)?
        '<figure><img alt="Breadboard diagram" src="'+run.image+'">'+run.annotations.map((mark,index)=>'<b style="left:'+Math.max(0,Math.min(100,Number(mark.x)||0))+'%;top:'+Math.max(0,Math.min(100,Number(mark.y)||0))+'%">'+(index+1)+'</b>').join('')+'</figure><ol>'+run.annotations.map(a=>'<li>'+safe(a.note)+'</li>').join('')+'</ol>':'')+'</section>').join('')
    const html='<!doctype html><html lang="en"><meta charset="utf-8"><title>Design review</title><style>body{margin:36px;font:16px system-ui}img{max-width:100%;display:block}figure{width:fit-content;max-width:100%;position:relative;margin:0}figure b{position:absolute;transform:translate(-50%,-50%);border:1px solid #444;background:white;border-radius:50%;text-align:center;min-width:1.2em}p{white-space:pre-wrap}section{break-inside:avoid}</style><h1>'+safe(page.title || 'Project')+' · Design review</h1>'+
      (includeDecisions?'<h2>Decisions</h2>'+paragraphs(lab.decisions || ''):'')+rows+'</html>'
    try{const file=await api.exportFile(html,'design-review.html');if(file)toast('Design review saved')}
    catch{toast('Could not save the design review')}
  }
  return <div className="doc-tool-dialog project-lab">
    <LabSection title={'Components ('+lab.parts.length+')'}>
      <form className="row wrap gap-sm" onSubmit={e=>{e.preventDefault();if(!part.trim())return;change(l=>l.parts.push({id:uid(),name:part.trim(),number:'',stock:0,needed:1,reserved:0}));setPart('')}}>
        <LabField label="Part name" value={part} change={setPart}/><Button small type="submit" disabled={!part.trim()}>Add part</Button>
      </form>
      {lab.parts.map(p=><details key={p.id}><summary>{p.name} · {p.stock} in stock · {p.reserved} reserved</summary>
        <div className="purchase-budget">
          <LabField label="Part name" value={p.name} change={name=>updatePart(p.id,{name})}/>
          <LabField label="Part number" value={p.number} change={number=>updatePart(p.id,{number})}/>
          <LabField label="In stock" type="number" min={0} value={p.stock} change={v=>updatePart(p.id,{stock:int(+v)})}/>
          <LabField label="Needed for build" type="number" min={0} value={p.needed} change={v=>updatePart(p.id,{needed:int(+v)})}/>
          <LabField label="Reserved for build" type="number" min={0} max={p.stock} value={p.reserved} change={v=>updatePart(p.id,{reserved:int(+v)})}/>
        </div>
        {p.image && <img className="wish-receipt" src={p.image} alt={p.name}/>}
        <div className="row gap-xs"><Button small onClick={async()=>{const image=await pickImageData(800,600);if(image)updatePart(p.id,{image})}}>Choose part photo</Button>
          <Button small onClick={()=>change(l=>{l.parts=l.parts.filter(row=>row.id!==p.id)})}>Remove part</Button></div>
      </details>)}
      {missing.length>0 && <div className="doc-tool-dialog"><p>Missing · {missing.map(p=>p.name+' × '+p.missing).join(', ')}</p>
        <label>Shopping wishlist<select className="input" value={wishlist} onChange={e=>setWishlist(e.target.value)}><option value="">Create a new wishlist</option>
          {Object.values(pages).filter(p=>p.type==='wishlist'&&!p.deletedAt).map(p=><option key={p.id} value={p.id}>{p.title || 'Untitled'}</option>)}</select></label>
        <div className="row gap-sm"><Button small onClick={shoppingList}>Add missing parts</Button>{wishlist && <Button small onClick={()=>openPage(wishlist)}>Open wishlist</Button>}</div>
      </div>}
    </LabSection>
    <LabSection title="Pin assignments">
      {lab.pins.map(p=><div key={p.id} className="row gap-sm wrap">
        <LabField label="Pin" value={p.pin} change={pin=>change(l=>{const row=l.pins.find(x=>x.id===p.id);if(row)row.pin=pin})}/>
        <LabField label="Peripheral or purpose" value={p.use} change={use=>change(l=>{const row=l.pins.find(x=>x.id===p.id);if(row)row.use=use})}/>
        {duplicates.has(p.pin.trim().toLowerCase()) && <strong className="danger" role="status">Pin conflict</strong>}
        <Button small onClick={()=>change(l=>{l.pins=l.pins.filter(row=>row.id!==p.id)})}>Remove pin</Button>
      </div>)}
      <Button small onClick={()=>change(l=>l.pins.push({id:uid(),pin:'',use:''}))}>Add pin</Button>
    </LabSection>
    <LabSection title={'Test runs ('+lab.runs.length+')'}>
      <form className="row gap-sm wrap" onSubmit={e=>{e.preventDefault();if(!runName.trim())return;change(l=>l.runs.push({id:uid(),title:runName.trim(),annotations:[],open:true}));setRunName('')}}>
        <LabField label="New run" value={runName} change={setRunName}/><Button small type="submit" disabled={!runName.trim()}>Add run</Button>
      </form>
      {lab.runs.map(run=><details key={run.id}><summary>{run.title || 'Untitled run'}</summary><Experiment run={run} change={fn=>change(l=>{const current=l.runs.find(r=>r.id===run.id);if(current)fn(current)})}/></details>)}
      {lab.runs.length>1 && <div className="draft-pair">{compare.map((id,index)=>{
        const current=lab.runs.find(r=>r.id===id)
        return <div key={index}><label>{index?'Compare with':'Compare run'}<select className="input" value={id} onChange={e=>setCompare(old=>index?[old[0],e.target.value]:[e.target.value,old[1]])}>
          <option value="">Select run</option>{lab.runs.map(r=><option key={r.id} value={r.id}>{r.title || 'Untitled'}</option>)}</select></label>
          {current && <dl><dt>Firmware</dt><dd>{current.firmware || '—'}</dd><dt>Wiring revision</dt><dd>{current.wiring || '—'}</dd><dt>Measured result</dt><dd>{current.result || '—'}</dd></dl>}</div>
      })}</div>}
    </LabSection>
    <LabSection title="Loaned tools">
      {(lab.loans || []).map(loan=><div className="purchase-budget" key={loan.id}>
        {(['tool','borrower','returnBy'] as const).map(field=><LabField key={field} label={field==='returnBy'?'Expected return':field==='tool'?'Tool':'Borrower'} type={field==='returnBy'?'date':'text'} value={loan[field]}
          change={value=>change(l=>{const row=l.loans?.find(r=>r.id===loan.id);if(row)row[field]=value})}/>)}
        <label><input type="checkbox" checked={!!loan.returned} onChange={e=>change(l=>{const row=l.loans?.find(r=>r.id===loan.id);if(row)row.returned=e.target.checked})}/> Returned</label>
      </div>)}
      <Button small onClick={()=>change(l=>{(l.loans??=[]).push({id:uid(),tool:'',borrower:'',returnBy:today()})})}>Add loan</Button>
    </LabSection>
    <LabSection title="Field-test packing">
      <div className="row gap-sm wrap"><LabField label="Equipment or spare" value={packName} change={setPackName}/>
        <Button small disabled={!packName.trim()} onClick={()=>{change(l=>{(l.packing??=[]).push({id:uid(),name:packName.trim(),quantity:1})});setPackName('')}}>Add equipment</Button>
        <Button small disabled={!lab.parts.length} onClick={()=>change(l=>{for(const part of l.parts){
          if(!part.needed || l.packing?.some(p=>p.name===part.name))continue
          ;(l.packing??=[]).push({id:uid(),name:part.name,quantity:part.needed})
        }})}>Add build parts</Button></div>
      {(lab.packing || []).map(row=><div key={row.id} className="row gap-sm wrap"><label><input type="checkbox" checked={!!row.packed} onChange={e=>change(l=>{const item=l.packing?.find(p=>p.id===row.id);if(item)item.packed=e.target.checked})}/> {row.name}</label>
        <input className="input input-sm w-80" aria-label={'Quantity for '+row.name} type="number" min="1" value={row.quantity} onChange={e=>change(l=>{const item=l.packing?.find(p=>p.id===row.id);if(item)item.quantity=Math.max(1,int(e.target.valueAsNumber))})}/>
        <Button small onClick={()=>change(l=>{l.packing=l.packing?.filter(p=>p.id!==row.id)})}>Remove</Button>
      </div>)}
    </LabSection>
    <LabSection title="Design review packet">
      <label>Decisions<textarea className="input" value={lab.decisions || ''} onChange={e=>change(l=>{l.decisions=e.target.value})}/></label>
      <label><input type="checkbox" checked={includeDecisions} onChange={e=>setIncludeDecisions(e.target.checked)}/> Include decisions</label>
      <label><input type="checkbox" checked={includeResults} onChange={e=>setIncludeResults(e.target.checked)}/> Include open test results</label>
      {lab.runs.filter(r=>r.image).map(r=><label key={r.id}><input type="checkbox" checked={packet.includes(r.id)} onChange={e=>setPacket(current=>e.target.checked?[...current,r.id]:current.filter(id=>id!==r.id))}/> Diagram · {r.title}</label>)}
      <Button small onClick={()=>void exportPacket()}>Save design review HTML</Button>
    </LabSection>
  </div>
}
