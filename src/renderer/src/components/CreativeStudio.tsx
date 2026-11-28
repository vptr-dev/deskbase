import { useEffect, useRef, useState } from 'react'
import { imageFromFile } from './Blocks'
import { Button } from './ui'
import type { Block, StudioEntry } from '../types'
import { uid } from '../lib/util'
import { toast } from '../store'

async function palette(url: string): Promise<string[]> {
  const img = new Image()
  img.src = url
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = 64; canvas.height = 64
  const context = canvas.getContext('2d')!
  context.drawImage(img,0,0,64,64)
  const pixels = context.getImageData(0,0,64,64).data
  const counts = new Map<string,number>()
  for(let i=0;i<pixels.length;i+=4){
    if(pixels[i+3]<128)continue
    const hex = '#' + [pixels[i],pixels[i+1],pixels[i+2]].map(n=>(Math.min(255,Math.round(n/32)*32)).toString(16).padStart(2,'0')).join('')
    counts.set(hex,(counts.get(hex)||0)+1)
  }
  return [...counts].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([color])=>color)
}

function VoiceCapture({ save }: { save: (url:string)=>void }) {
  const [busy,setBusy]=useState(false)
  const [recording,setRecording]=useState(false)
  const recorder=useRef<MediaRecorder|null>(null)
  const live=useRef(true)
  const timeout=useRef<ReturnType<typeof setTimeout>>()
  useEffect(()=>{live.current=true;return ()=>{
    live.current=false;clearTimeout(timeout.current)
    if(recorder.current?.state==='recording')recorder.current.stop()
  }},[])
  const record=async()=>{
    if(recorder.current?.state==='recording'){recorder.current.stop();return}
    setBusy(true)
    let stream:MediaStream|undefined
    try {
      stream=await navigator.mediaDevices.getUserMedia({audio:true})
      if(!live.current){stream.getTracks().forEach(t=>t.stop());return}
      const session=new MediaRecorder(stream,{audioBitsPerSecond:48000})
      recorder.current=session
      const chunks:Blob[]=[]
      session.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)}
      session.onstop=()=>{
        clearTimeout(timeout.current);stream?.getTracks().forEach(t=>t.stop());recorder.current=null
        if(!live.current)return
        setRecording(false)
        const reader=new FileReader()
        reader.onload=()=>{if(live.current)save(String(reader.result))}
        reader.readAsDataURL(new Blob(chunks,{type:session.mimeType}));setBusy(false)
      }
      session.start()
      setRecording(true)
      timeout.current=setTimeout(()=>{if(session.state==='recording')session.stop()},60000)
      setBusy(false)
    } catch {stream?.getTracks().forEach(t=>t.stop());if(live.current){setBusy(false);toast('Microphone unavailable. Check microphone access in Windows.')} }
  }
  return <Button small disabled={busy} onClick={()=>void record()}>{recording?'Stop recording':'Record up to one minute'}</Button>
}

export function CreativeStudio({block,locked,set}:{block:Block;locked?:boolean;set:(fn:(b:Block)=>void)=>void}){
  const entries=block.entries || []
  const mode=block.style || 'Mood board'
  const mood=mode==='Mood board', sheet=mode==='Reference sheet', sketch=mode==='Sketch practice', drafts=mode==='Draft comparison', experiments=mode==='Experiments', voice=mode==='Voice ideas'
  const [selected,select]=useState(''), [second,setSecond]=useState('')
  const [unfinished,filter]=useState(true)
  const current=entries.find(e=>e.id===selected) || entries[0]
  const board=useRef<HTMLDivElement>(null)
  const drag=useRef<{id:string;dx:number;dy:number}|null>(null)
  const patch=(id:string,fields:Partial<StudioEntry>)=>{if(!locked)set(b=>{const e=b.entries?.find(e=>e.id===id);if(e)Object.assign(e,fields)})}
  const add=(fields:Partial<StudioEntry>={})=>{
    if(locked)return
    const id=uid()
    set(b=>{(b.entries??=[]).push({id,title:'',notes:'',x:12,y:12,...fields})});select(id)
  }
  const file=async(f:File|undefined,later=false)=>{
    if(!f || locked)return
    try{const image=await imageFromFile(f);if(sketch && current)patch(current.id,later?{later:image}:{image});else add({image,title:f.name})}
    catch{toast('Could not open that image.')}
  }
  const display=experiments && unfinished ? entries.filter(e=>!e.done) : entries
  const option=(e:StudioEntry)=><option value={e.id} key={e.id}>{e.title || 'Untitled'}</option>
  const alt=entries.find(e=>e.id===second && e.id!==current?.id) || entries.find(e=>e.id!==current?.id)
  return <section className="creative-studio" aria-label={mode}>
    <div className="row wrap gap-sm">
      {!locked && <Button small onClick={()=>add(mood?{color:'#7098ab'}:{})}>{mood?'Add swatch':drafts?'New draft':experiments?'New experiment':sketch?'New sketch pair':voice?'New voice note':'New reference'}</Button>}
      {!locked && (mood||sheet||sketch) && <label className="btn btn-sm">{sketch?'Early sketch':'Add image'}<input type="file" accept="image/*" onChange={e=>{void file(e.target.files?.[0]);e.target.value=''}}/></label>}
      {sketch && current && !locked && <label className="btn btn-sm">Later sketch<input type="file" accept="image/*" onChange={e=>{void file(e.target.files?.[0],true);e.target.value=''}}/></label>}
      {experiments && <><label><input type="checkbox" checked={unfinished} onChange={e=>filter(e.target.checked)}/> Unfinished only</label><Button small disabled={!entries.some(e=>!e.done)} onClick={()=>{const open=entries.filter(e=>!e.done);select(open[Math.floor(Math.random()*open.length)].id)}}>Pick one to revisit</Button></>}
    </div>
    {(mood||sheet) && <div ref={board} className={mood?'mood-canvas':'reference-sheet'}>{entries.map(entry=><button key={entry.id} type="button" aria-label={entry.title || entry.color || 'Reference'} aria-pressed={current?.id===entry.id}
      style={mood?{left:(entry.x||0)+'%',top:(entry.y||0)+'%',background:entry.color}:undefined}
      onClick={()=>select(entry.id)} onPointerDown={e=>{
        if(!mood||locked)return
        const tile=e.currentTarget.getBoundingClientRect();drag.current={id:entry.id,dx:e.clientX-tile.left,dy:e.clientY-tile.top};e.currentTarget.setPointerCapture(e.pointerId)
      }} onPointerUp={e=>{
        const move=drag.current;drag.current=null
        if(!move || !board.current || locked)return
        const rect=board.current.getBoundingClientRect(),tile=e.currentTarget.getBoundingClientRect()
        patch(move.id,{x:Math.max(0,Math.min(rect.width-tile.width,e.clientX-move.dx-rect.left))*100/rect.width,y:Math.max(0,Math.min(rect.height-tile.height,e.clientY-move.dy-rect.top))*100/rect.height})
      }} onPointerCancel={()=>drag.current=null} onKeyDown={e=>{
        if(sheet && !locked && /^[0-5]$/.test(e.key)){e.preventDefault();patch(entry.id,{rating:Number(e.key)});select(entry.id)}
      }}>
      {entry.image && <img draggable={false} src={entry.image} alt=""/>}<span>{sheet ? (entry.title||'Reference')+' · '+(entry.rating||0)+'/5' : entry.title || entry.color}</span>
    </button>)}</div>}
    {entries.length>0 && <><label>Entry<select className="input" value={display.some(e=>e.id===current?.id)?current?.id:''} onChange={e=>select(e.target.value)}><option value="" disabled>Select entry</option>{display.map(option)}</select></label>
      {current && display.some(e=>e.id===current.id) && <div className="studio-entry">
        <label>Name<input className="input" value={current.title} readOnly={locked} onChange={e=>patch(current.id,{title:e.target.value})}/></label>
        {(mood||sheet) && <label>Source credit<input className="input" value={current.credit||''} readOnly={locked} onChange={e=>patch(current.id,{credit:e.target.value})}/></label>}
        {mood && !locked && <><input type="color" aria-label="Swatch colour" value={current.color || '#7098ab'} onChange={e=>patch(current.id,{color:e.target.value})}/>
          {current.image && <Button small onClick={async()=>{try{const colors=await palette(current.image!);set(b=>{colors.forEach((color,i)=>b.entries?.push({id:uid(),color,title:color,notes:'',credit:current.credit || current.title,x:i*18,y:65}))})}catch{toast('Could not extract colours.')}}}>Extract palette</Button>}</>}
        {sheet && <label>Rating<input type="number" min="0" max="5" value={current.rating||0} readOnly={locked} onChange={e=>patch(current.id,{rating:Math.min(5,Math.max(0,Number(e.target.value)))})}/></label>}
        {sketch && <div className="draft-pair">{[current.image,current.later].map((url,i)=><figure key={i}><figcaption>{i?'Later':'Early'}</figcaption>{url && <img src={url} alt={i?'Later sketch':'Early sketch'}/>}</figure>)}</div>}
        {voice && <>{!locked && <VoiceCapture key={current.id} save={audio=>patch(current.id,{audio})}/>} {current.audio && <audio controls src={current.audio}/>}</>}
        <div className={drafts?'draft-pair':''}><label>{drafts?'Draft text':voice?'Summary':'Notes'}<textarea className="input" readOnly={locked} value={current.notes} onChange={e=>patch(current.id,{notes:e.target.value})}/></label>
        {drafts && alt && <label>Compare with<select className="input" value={alt.id} onChange={e=>setSecond(e.target.value)}>{entries.filter(e=>e.id!==current.id).map(option)}</select><textarea className="input" readOnly value={alt.notes}/></label>}</div>
        {experiments && <label><input type="checkbox" checked={!!current.done} disabled={locked} onChange={e=>patch(current.id,{done:e.target.checked})}/> Finished</label>}
        {!locked && <Button small onClick={()=>set(b=>{b.entries=b.entries?.filter(e=>e.id!==current.id)})}>Remove entry</Button>}
      </div>}</>}
  </section>
}
