import { useState } from 'react'
import type { HouseholdData } from '../types'
import { api } from '../lib/api'
import { addDays, diffDays, friendlyDay, today, uid } from '../lib/util'
import { toast } from '../store'
import { Button } from './ui'

type Change=(fn:(d:HouseholdData)=>void)=>void
export function HouseholdCare({data,change}:{data:HouseholdData;change:Change}) {
  const [label,setLabel]=useState('')
  const [reading,setReading]=useState('')
  const [meterDate,setMeterDate]=useState(today)
  const [plant,setPlant]=useState('')
  const [season,setSeason]=useState('')
  const [recurrence,setRecurrence]=useState('03-01')
  const [pet,setPet]=useState('')
  const [from,setFrom]=useState(today)
  const [to,setTo]=useState(today)
  const care=data.care
  const update=(fn:(c:NonNullable<HouseholdData['care']>)=>void)=>change(d=>fn(d.care??={meters:[],plants:[],seasonal:[],pets:[],binExceptions:[]}))
  const meters=care?.meters || []
  const monthDay=today().slice(5)
  const seasonYear=(date:string)=>Number(today().slice(0,4))-(monthDay<date?1:0)
  const bin=care?.bin
  const due = bin?.anchor ? Array.from({length:42},(_,i)=>addDays(today(),i)).flatMap(day=>{
    const delta=diffDays(day,bin.anchor)
    return delta>=0 && delta%(bin.every*7)===0 ? [{day,actual:care?.binExceptions.find(e=>e.from===day)?.to || day}] : []
  }) : []
  return <div className="doc-tool-dialog household-care">
    <details className="lab-section"><summary>Meter readings</summary><div className="doc-tool-dialog">
      <div className="row gap-xs wrap"><label>Meter name<input className="input input-sm" value={label} onChange={e=>setLabel(e.target.value)}/></label>
        <label>Date<input className="input input-sm" type="date" value={meterDate} onChange={e=>setMeterDate(e.target.value)}/></label>
        <label>Reading<input className="input input-sm" type="number" value={reading} onChange={e=>setReading(e.target.value)} min="0" step="any"/></label>
        <Button small disabled={!label.trim() || !meterDate || !reading || !Number.isFinite(+reading) || +reading<0} onClick={()=>{
          const name=label.trim()
          update(c=>{c.meters=c.meters.filter(m=>m.name!==name||m.date!==meterDate);c.meters.push({id:uid(),name,date:meterDate,value:+reading})})
          setReading('')
        }}>Log reading</Button></div>
      {[...new Set(meters.map(m=>m.name))].map(name=>{
        const series=meters.filter(m=>m.name===name).sort((a,b)=>b.date.localeCompare(a.date))
        return <section key={name}><strong>{name}</strong>{series.map((m,i)=>{
          const prior=series[i+1],prev=series[i+2]
          const usage=prior?m.value-prior.value:null
          return <div key={m.id}>{m.date} · {m.value}{usage!==null && ' · '+usage+' used'}{usage!==null&&prev&&' · Previous interval '+(prior.value-prev.value)}
            <Button small onClick={()=>update(c=>{c.meters=c.meters.filter(row=>row.id!==m.id)})}>Remove</Button></div>
        })}</section>
      })}
    </div></details>
    <details className="lab-section"><summary>Plant care</summary><div className="doc-tool-dialog">
      <label>Plant name<input className="input" value={plant} onChange={e=>setPlant(e.target.value)}/></label>
      <Button small disabled={!plant.trim()} onClick={()=>{update(c=>c.plants.push({id:uid(),name:plant.trim(),species:'',room:''}));setPlant('')}}>Add plant</Button>
      {(care?.plants || []).map(p=><details key={p.id}><summary>{p.name}{p.room && ' · '+p.room}</summary><div className="purchase-budget">
        {(['species','room','watered'] as const).map(field=><label key={field}>{field==='watered'?'Last watered':field==='room'?'Room':'Species'}
          <input className="input" value={p[field] || ''} type={field==='watered'?'date':'text'} onChange={e=>update(c=>{
            const row=c.plants.find(row=>row.id===p.id);if(row)row[field]=e.target.value
          })}/>
        </label>)}
        <Button small onClick={()=>update(c=>{const row=c.plants.find(row=>row.id===p.id);if(row)row.watered=today()})}>Watered today</Button>
        <Button small onClick={()=>update(c=>{c.plants=c.plants.filter(row=>row.id!==p.id)})}>Remove plant</Button>
      </div></details>)}
    </div></details>
    <details className="lab-section"><summary>Seasonal checklist</summary><div className="doc-tool-dialog">
      <label>Seasonal task<input className="input" value={season} onChange={e=>setSeason(e.target.value)}/></label>
      <label>Date every year<input type="date" className="input" value={today().slice(0,4)+'-'+recurrence} onChange={e=>setRecurrence(e.target.value.slice(5))}/></label>
      <Button small disabled={!season.trim() || !recurrence} onClick={()=>{update(c=>c.seasonal.push({id:uid(),name:season.trim(),monthDay:recurrence}));setSeason('')}}>Add seasonal task</Button>
      {(care?.seasonal || []).map(s=><div key={s.id} className="row wrap gap-xs"><label><input type="checkbox" checked={s.completedYear===seasonYear(s.monthDay)} onChange={e=>update(c=>{
        const row=c.seasonal.find(i=>i.id===s.id);if(row)row.completedYear=e.target.checked?seasonYear(s.monthDay):undefined
      })}/> {s.name} · annual date {s.monthDay}</label><Button small onClick={()=>update(c=>{c.seasonal=c.seasonal.filter(i=>i.id!==s.id)})}>Remove</Button></div>)}
    </div></details>
    <details className="lab-section"><summary>Pet sitter handover</summary><div className="doc-tool-dialog">
      <label>Pet name<input className="input" value={pet} onChange={e=>setPet(e.target.value)}/></label>
      <Button small disabled={!pet.trim()} onClick={()=>{update(c=>c.pets.push({id:uid(),name:pet.trim(),instructions:''}));setPet('')}}>Add pet</Button>
      {(care?.pets || []).map(p=><label key={p.id}>{p.name}<textarea className="input" value={p.instructions} onChange={e=>update(c=>{
        const row=c.pets.find(row=>row.id===p.id);if(row)row.instructions=e.target.value
      })}/></label>)}
      <Button small disabled={!care?.pets.length} onClick={()=>void api.exportFile('Pet care\n\n'+care?.pets.map(p=>p.name+'\n'+p.instructions).join('\n\n'),'pet-sitter-handover.txt').catch(()=>toast('Could not save handover.'))}>Save sitter handover</Button>
    </div></details>
    <details className="lab-section"><summary>Bin collection</summary><div className="doc-tool-dialog">
      <div className="purchase-budget"><label>Regular collection starts<input type="date" className="input" value={bin?.anchor || ''} onChange={e=>update(c=>{c.bin={anchor:e.target.value,every:c.bin?.every || 1}})}/></label>
        <label>Repeat every weeks<input type="number" className="input" min="1" max="12" value={bin?.every || 1} onChange={e=>update(c=>{c.bin={anchor:c.bin?.anchor || '',every:Math.max(1,Math.min(12,Math.trunc(+e.target.value || 1)))}})}/></label></div>
      {due.map(({day,actual})=><div key={day}>{friendlyDay(actual)}{day!==actual?' · moved from '+friendlyDay(day):''}</div>)}
      <div className="purchase-budget"><label>Regular date<input type="date" className="input" value={from} onChange={e=>setFrom(e.target.value)}/></label>
        <label>Holiday replacement<input type="date" className="input" value={to} onChange={e=>setTo(e.target.value)}/></label></div>
      <Button small disabled={!from || !to || from===to} onClick={()=>update(c=>{c.binExceptions=[...c.binExceptions.filter(x=>x.from!==from),{from,to}]})}>Save exception</Button>
      {care?.binExceptions.map(x=><div className="row gap-xs" key={x.from}>{x.from} → {x.to}<Button small onClick={()=>update(c=>{c.binExceptions=c.binExceptions.filter(row=>row.from!==x.from)})}>Remove exception</Button></div>)}
    </div></details>
  </div>
}
