import { useEffect, useState } from 'react'
import type { Page } from '../types'
import { updatePage } from '../store'
import { today } from '../lib/util'
import { Button } from './ui'

export const mistakeReasons=['Timing','Arithmetic','Missing concept','Misread question','Other']
interface Mark { question:string; earned:number; total:number; reason:string }
export function StudyPaper({page,onActive}:{page:Page;onActive:(value:boolean)=>void}) {
  const [minutes,setMinutes]=useState(30)
  const [deadline,setDeadline]=useState(0)
  const [now,setNow]=useState(0)
  const [marking,finish]=useState(false)
  const [marks,setMarks]=useState<Mark[]>([])
  const [answers,setAnswers]=useState<Record<number,string>>({})
  const cards=page.cards || []
  useEffect(()=>{
    if (!deadline || marking)return
    const tick=()=>{
      const time=Date.now();setNow(time)
      if(time>=deadline)finish(true)
    }
    const id=setInterval(tick,250)
    return ()=>clearInterval(id)
  },[deadline,marking])
  const left=Math.ceil(Math.max(0,deadline-now)/1000)
  const patch=(index:number,changes:Partial<Mark>)=>setMarks(m=>m.map((row,i)=>i===index?{...row,...changes}:row))
  if (!deadline) return <div className="doc-tool-dialog">
    <label>Paper length (minutes)<input type="number" className="input input-sm" min="1" max="360" value={minutes} onChange={e=>setMinutes(Math.max(1,Math.min(360,Math.round(+e.target.value||1))))}/></label>
    <Button disabled={!cards.length} onClick={()=>{
      const time=Date.now()
      onActive(true);setNow(time);setDeadline(time+minutes*60_000)
      setMarks(cards.map(c=>({question:c.question,earned:0,total:1,reason:''})))
    }}>Start past paper</Button>
    {page.study?.lastPaper && <details><summary>Last paper · {page.study.lastPaper.date}</summary>{page.study.lastPaper.marks.map((mark,index)=><div key={index}>{mark.question} · {mark.earned}/{mark.total}{mark.reason && ' · '+mark.reason}</div>)}</details>}
  </div>
  return <section className="doc-tool-dialog">
    {!marking && <div className="row between"><span role="timer">{Math.floor(left/60)}:{String(left%60).padStart(2,'0')} remaining</span>
      <Button small onClick={()=>finish(true)}>Finish paper</Button></div>}
    {marks.map((mark,index)=><article className="study-prompt" key={index}><h4>{index+1}. {mark.question}</h4>
      <textarea aria-label={'Response to question '+(index+1)} readOnly={marking} className="input" value={answers[index] || ''} onChange={e=>setAnswers({...answers,[index]:e.target.value})}/>
      {marking && <><div className="muted">Answer · {cards[index]?.answer ?? ''}</div>
        <div className="row gap-sm wrap">
          <label>Marks available<input type="number" className="input input-sm w-80" min="1" max="100" value={mark.total} onChange={e=>{
            const total=Math.max(1,Math.min(100,Number(e.target.value)||1));patch(index,{total,earned:Math.min(mark.earned,total)})
          }}/></label>
          <label>Marks earned<input type="number" className="input input-sm w-80" min="0" max={mark.total} value={mark.earned} onChange={e=>patch(index,{earned:Math.max(0,Math.min(mark.total,Number(e.target.value)||0))})}/></label>
          {mark.earned<mark.total && <label>Reason for lost marks<select className="input input-sm" value={mark.reason} onChange={e=>patch(index,{reason:e.target.value})}>
            <option value="">Choose reason</option>{mistakeReasons.map(reason=><option key={reason}>{reason}</option>)}
          </select></label>}
        </div></>}
    </article>)}
    {marking && <div className="row gap-sm wrap"><strong>{marks.reduce((n,m)=>n+m.earned,0)} / {marks.reduce((n,m)=>n+m.total,0)} marks</strong>
      <Button kind="primary" onClick={()=>{updatePage(page.id,p=>{(p.study??={}).lastPaper={date:today(),marks}});onActive(false);setDeadline(0);finish(false);setAnswers({});setMarks([])}}>Save mark review</Button>
    </div>}
  </section>
}
