import { useEffect, useState } from 'react'
import type { HouseholdData } from '../types'
import { today, uid } from '../lib/util'
import { Button } from './ui'

type Change=(fn:(data:HouseholdData)=>void)=>void
type Routine=NonNullable<HouseholdData['routine']>
const empty=():Routine=>({containers:[],fields:[],checkins:[],breaks:[]})
function nightlyHours(start?:string,end?:string):string {
  if(!start || !end)return ''
  const minutes=(time:string)=>Number(time.slice(0,2))*60+Number(time.slice(3))
  return ((minutes(end)-minutes(start)+1440)%1440/60).toFixed(2)+' h'
}
const number=(s:string)=>Math.max(0,Math.min(1_000_000,Number(s)||0))
const label={workday:'Workday',rest:'Rest day',holiday:'Holiday'}

export function HomeRoutines({data,change}: {data:HouseholdData;change:Change}) {
  const routine=data.routine || empty()
  const [day,setDay]=useState(today)
  const [newName,setName]=useState('')
  const [fieldName,setFieldName]=useState('')
  const [breakName,setBreakName]=useState('')
  const [running,run]=useState<{index:number;ends:number}|null>(null)
  const [now,setNow]=useState(Date.now)
  const [finished,setFinished]=useState(false)
  const update=(fn:(profile:Routine)=>void)=>change(d=>fn(d.routine??=empty()))
  const check=routine.checkins.find(c=>c.day===day)
  const entry=check || {day,time:'20:00',kind:'workday' as const,water:0,notes:'',values:{}}
  const patch=(changes:Partial<Routine['checkins'][number]>)=>{
    if(!day)return
    update(profile=>{
      const previous=profile.checkins.find(c=>c.day===day)
      if(previous)Object.assign(previous,changes)
      else profile.checkins.push({...entry,...changes})
    })
  }
  const active=running ? routine.breaks[running.index] : undefined
  useEffect(()=>{
    if(!running || !active)return
    const tick=()=>{
      const time=Date.now()
      setNow(time)
      if(time<running.ends)return
      const next=routine.breaks[running.index+1]
      if(next)run({index:running.index+1,ends:time+next.minutes*60000})
      else{run(null);setFinished(true)}
    }
    const id=setInterval(tick,250)
    return ()=>clearInterval(id)
  },[running,active,routine.breaks])
  const remaining=running?Math.ceil(Math.max(0,running.ends-now)/1000):0
  return <div className="doc-tool-dialog">
    <div className="purchase-budget">
      <label>Check-in date<input className="input" type="date" value={day} onChange={e=>setDay(e.target.value)}/></label>
      <label>Time<input className="input" type="time" value={entry.time} disabled={!day} onChange={e=>patch({time:e.target.value})}/></label>
      <label>Day type<select className="input" value={entry.kind} disabled={!day} onChange={e=>patch({kind:e.target.value as keyof typeof label})}>
        {Object.entries(label).map(([key,text])=><option key={key} value={key}>{text}</option>)}
      </select></label>
    </div>
    <details className="lab-section" open><summary>Water and sleep</summary><div className="doc-tool-dialog">
      <label>Water (ml)<input className="input" type="number" min="0" value={entry.water} disabled={!day} onChange={e=>patch({water:number(e.target.value)})}/></label>
      <div className="row gap-xs wrap">{routine.containers.map(c=><Button key={c.id} small disabled={!day} onClick={()=>patch({water:Math.round((entry.water+c.volume*(c.unit==='ml'?1:29.5735295625))*100)/100})}>
        + {c.name} ({c.volume} {c.unit})
      </Button>)}</div>
      <div className="purchase-budget">
        <label>Sleep started<input type="time" className="input" value={entry.sleepFrom || ''} disabled={!day} onChange={e=>patch({sleepFrom:e.target.value})}/></label>
        <label>Sleep ended<input type="time" className="input" value={entry.sleepTo || ''} disabled={!day} onChange={e=>patch({sleepTo:e.target.value})}/></label>
        <div role="status">{nightlyHours(entry.sleepFrom,entry.sleepTo)}</div>
      </div>
      <small className="muted">For sleep across midnight, use the date you want to log it under.</small>
      <details><summary>Favourite containers</summary><div className="row gap-xs">
        <input className="input" aria-label="Container name" value={newName} onChange={e=>setName(e.target.value)}/>
        <Button small disabled={!newName.trim()} onClick={()=>{update(r=>r.containers.push({id:uid(),name:newName.trim(),volume:250,unit:'ml'}));setName('')}}>Add container</Button></div>
        {routine.containers.map(c=><div className="row gap-xs wrap" key={c.id}>{c.name}
          <label>Volume<input type="number" min="1" className="input input-sm w-80" value={c.volume} onChange={e=>update(r=>{const x=r.containers.find(x=>x.id===c.id);if(x)x.volume=Math.max(1,number(e.target.value))})}/></label>
          <label>Unit<select className="input input-sm" value={c.unit} onChange={e=>update(r=>{const x=r.containers.find(x=>x.id===c.id);if(x)x.unit=e.target.value==='fl oz'?'fl oz':'ml'})}><option>ml</option><option>fl oz</option></select></label>
          <Button small onClick={()=>update(r=>{r.containers=r.containers.filter(x=>x.id!==c.id)})}>Remove</Button>
        </div>)}
      </details>
    </div></details>
    <details className="lab-section"><summary>Evening tracker values</summary><div className="doc-tool-dialog">
      {routine.fields.map(field=><div key={field.id} className="purchase-budget">
        <label>{field.name}{field.unit && ' ('+field.unit+')'}<input type="number" min="0" step="any" className="input" disabled={!day} value={entry.values[field.id]??''} onChange={e=>patch({values:{...entry.values,[field.id]:number(e.target.value)}})}/></label>
        <span className="small">{label[entry.kind]} goal · {field.goals[entry.kind] ?? 'No goal set'}</span>
        <details><summary>Goals and unit</summary>
          <label>Unit<input className="input" value={field.unit} onChange={e=>update(r=>{const f=r.fields.find(f=>f.id===field.id);if(f)f.unit=e.target.value})}/></label>
          {Object.entries(label).map(([key,name])=><label key={key}>{name} goal<input type="number" min="0" step="any" className="input" value={field.goals[key as keyof typeof label]??''} onChange={e=>update(r=>{
            const f=r.fields.find(f=>f.id===field.id);if(f)f.goals[key as keyof typeof label]=e.target.value?number(e.target.value):undefined
          })}/></label>)}
        </details>
      </div>)}
      <div className="row gap-xs"><input className="input" aria-label="New tracker name" value={fieldName} onChange={e=>setFieldName(e.target.value)}/>
        <Button small disabled={!fieldName.trim()} onClick={()=>{update(r=>r.fields.push({id:uid(),name:fieldName.trim(),unit:'',goals:{}}));setFieldName('')}}>Add tracker field</Button></div>
    </div></details>
    <details className="lab-section"><summary>Energy notes</summary><div className="doc-tool-dialog">
      <label>Energy (1 to 5)<input type="number" min="1" max="5" className="input" disabled={!day} value={entry.energy ?? ''} onChange={e=>patch({energy:e.target.value?Math.min(5,Math.max(1,Math.trunc(number(e.target.value)))):undefined})}/></label>
      <label>Notes<textarea className="input" disabled={!day} value={entry.notes} onChange={e=>patch({notes:e.target.value})}/></label>
      {[['Morning',0,12],['Afternoon',12,18],['Evening',18,24]].map(([name,from,to])=>{
        const group=routine.checkins.filter(c=>c.energy && +c.time.slice(0,2)>=Number(from) && +c.time.slice(0,2)<Number(to))
        return <section key={name}><strong>{name}</strong>{group.length>0 && <span> · Mean {(group.reduce((n,c)=>n+(c.energy||0),0)/group.length).toFixed(1)}</span>}
          {group.slice(-5).map(c=><div key={c.day}>{c.day} {c.time} · {c.energy}/5 {c.notes}</div>)}</section>
      })}
    </div></details>
    <details className="lab-section"><summary>Seated break</summary><div className="doc-tool-dialog">
      {routine.breaks.map((step,i)=><div key={step.id} className="row gap-xs wrap">
        <span>{i+1}. {step.name}</span><label>Minutes<input type="number" min="0.1" step="0.1" className="input input-sm w-80" disabled={!!running} value={step.minutes} onChange={e=>update(r=>{
          const item=r.breaks.find(x=>x.id===step.id);if(item)item.minutes=Math.max(.1,Math.min(120,number(e.target.value)))
        })}/></label>
        <Button small disabled={!!running} onClick={()=>update(r=>{r.breaks=r.breaks.filter(x=>x.id!==step.id)})}>Remove step</Button>
      </div>)}
      <div className="row gap-xs"><input className="input" aria-label="Break step name" value={breakName} disabled={!!running} onChange={e=>setBreakName(e.target.value)}/>
        <Button small disabled={!!running || !breakName.trim()} onClick={()=>{update(r=>r.breaks.push({id:uid(),name:breakName.trim(),minutes:1}));setBreakName('')}}>Add step</Button></div>
      {active ? <div className="row gap-sm"><span role="timer">{active.name} · {Math.floor(remaining/60)}:{String(remaining%60).padStart(2,'0')}</span><Button small onClick={()=>run(null)}>Stop break</Button></div> :
        <Button small disabled={!routine.breaks.length} onClick={()=>{const start=Date.now();setNow(start);setFinished(false);run({index:0,ends:start+routine.breaks[0].minutes*60000})}}>Start seated break</Button>}
      {finished && <span role="status">Break complete.</span>}
    </div></details>
    {routine.checkins.length>0 && <details><summary>Past check-ins</summary>{routine.checkins.slice().sort((a,b)=>b.day.localeCompare(a.day)).slice(0,30).map(c=>
      <div key={c.day} className="row gap-sm"><span>{c.day} · {label[c.kind]}</span><Button small onClick={()=>setDay(c.day)}>Edit check-in</Button></div>
    )}</details>}
  </div>
}
