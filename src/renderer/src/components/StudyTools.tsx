import { useRef, useState } from 'react'
import type { DiagramMask, Page, StudyCard } from '../types'
import { updatePage, useData } from '../store'
import { addDays, DAYS_SHORT, diffDays, friendlyDay, parseDay, today, uid } from '../lib/util'
import { Button } from './ui'
import { api } from '../lib/api'
import { openFromClick } from '../lib/tabs'

export function StudyDiagram({card,revealed,draw}:{card:Pick<StudyCard,'diagram'|'masks'>;revealed?:boolean;draw?:(mask:DiagramMask)=>void}) {
  const start=useRef<{x:number;y:number}|null>(null)
  const [preview,setPreview]=useState<DiagramMask|null>(null)
  const region=(a:{x:number;y:number},b:{x:number;y:number}):DiagramMask=>({x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(a.x-b.x),height:Math.abs(a.y-b.y)})
  function point(e:React.PointerEvent<HTMLDivElement>) {
    const rect=e.currentTarget.getBoundingClientRect()
    return {x:Math.max(0,Math.min(100,(e.clientX-rect.left)*100/rect.width)),y:Math.max(0,Math.min(100,(e.clientY-rect.top)*100/rect.height))}
  }
  if(!card.diagram)return null
  return <div className={'study-diagram'+(draw?' editing':'')} onPointerDown={e=>{
    if(!draw || e.button!==0)return
    start.current=point(e);e.currentTarget.setPointerCapture(e.pointerId)
  }} onPointerMove={e=>{if(draw && start.current)setPreview(region(start.current,point(e)))}} onPointerUp={e=>{
    if(!draw || !start.current)return
    const mask=region(start.current,point(e));start.current=null;setPreview(null)
    if(mask.width>=2 && mask.height>=2)draw(mask)
  }} onPointerCancel={()=>{start.current=null;setPreview(null)}}>
    <img src={card.diagram} alt="Flashcard diagram" draggable={false}/>
    {(!revealed || draw) && [...card.masks??[],...preview?[preview]:[]].map((mask,i)=><span aria-hidden className="study-mask" key={i} style={{left:mask.x+'%',top:mask.y+'%',width:mask.width+'%',height:mask.height+'%'}}/>)}
  </div>
}

export function StudyPlan({ page }: { page:Page }) {
  const pages=useData(d=>d.pages)
  const [title,setTitle]=useState('')
  const [perDay,setPerDay]=useState(5)
  const [applied,setApplied]=useState(false)
  const study=page.study || {}
  const free=study.freeDays || []
  const topics=study.topics || []
  const choices=Object.values(pages).filter(p=>!p.deletedAt&&p.id!==page.id&&!p.rowOf)
  const order=page.cards || []
  const dates:string[]=[]
  if(study.examDate && order.length)for(let day=addDays(study.examDate,-1);day>=today() && diffDays(study.examDate,day)<=366 && free.length<7;day=addDays(day,-1)) {
    if (!free.includes(parseDay(day).getDay())) dates.push(day)
    if(dates.length>=Math.ceil(order.length/perDay))break
  }
  dates.reverse()
  const plan=dates.map((date,index)=>({date,cards:order.slice(index*perDay,(index+1)*perDay)}))
  return <section className="study-planning">
    <div className="purchase-budget">
      <label>Exam date<input className="input" type="date" value={study.examDate || ''} onChange={e=>{updatePage(page.id,p=>{(p.study??={}).examDate=e.target.value||undefined});setApplied(false)}}/></label>
      <label>Cards per day<input className="input" type="number" min="1" max="200" value={perDay} onChange={e=>{setPerDay(Math.min(200,Math.max(1,Math.trunc(+e.target.value || 1))));setApplied(false)}}/></label>
      <label>Pause new cards above this review queue<input className="input" type="number" min="1" aria-label="Due review limit" value={study.queueLimit ?? ''} onChange={e=>updatePage(page.id,p=>{(p.study??={}).queueLimit=e.target.value?Math.max(1,Math.trunc(+e.target.value)):undefined})}/></label>
    </div>
    <div className="repeat-days" role="group" aria-label="Days off">
      {DAYS_SHORT.map((label,day)=><button type="button" className="chip-btn" key={label} aria-pressed={free.includes(day)} onClick={()=>{
        updatePage(page.id,p=>{(p.study??={}).freeDays=free.includes(day)?free.filter(d=>d!==day):[...free,day]});setApplied(false)
      }}>{label}</button>)}
    </div>
    {order.length>0 && study.examDate && <>
      {plan.length>0 && <ol className="study-plan-dates">{plan.map(({date,cards})=><li key={date}>{friendlyDay(date)} · {cards.length} cards</li>)}</ol>}
      {plan.reduce((n,v)=>n+v.cards.length,0)<order.length && <p className="small muted">Some cards don’t fit before this exam date.</p>}
      <Button small disabled={!plan.length} onClick={()=>{updatePage(page.id,p=>{
        const due=new Map(plan.flatMap(({date,cards})=>cards.map(c=>[c.id,date] as const)))
        for(const card of p.cards || [])if(due.has(card.id))card.due=due.get(card.id)!
      });setApplied(true)}}>{applied?'Revision dates applied':'Apply revision dates'}</Button>
    </>}
    <h4>Syllabus coverage ({topics.filter(t=>t.covered).length}/{topics.length})</h4>
    <div className="row gap-xs"><input className="input" aria-label="Syllabus topic" value={title} onChange={e=>setTitle(e.target.value)}/>
      <Button small disabled={!title.trim()} onClick={()=>{updatePage(page.id,p=>{((p.study??={}).topics??=[]).push({id:uid(),title:title.trim()})});setTitle('')}}>Add topic</Button></div>
    {topics.map(topic=><details key={topic.id}><summary>{topic.title}{topic.covered?' ✓':''}</summary>
      <div className="purchase-budget">
        <label><input type="checkbox" checked={!!topic.covered} onChange={e=>updatePage(page.id,p=>{const t=p.study?.topics?.find(t=>t.id===topic.id);if(t)t.covered=e.target.checked})}/> Covered</label>
        {(['notePage','exercisePage'] as const).map(field=><label key={field}>{field==='notePage'?'Notes':'Exercises'}<select className="input" value={topic[field] || ''} onChange={e=>updatePage(page.id,p=>{
          const t=p.study?.topics?.find(t=>t.id===topic.id);if(t)t[field]=e.target.value||undefined
        })}><option value="">Choose page</option>{choices.map(p=><option key={p.id} value={p.id}>{p.title||'Untitled'}</option>)}</select>
          {topic[field] && pages[topic[field]!]?.title && <button className="link" type="button" onClick={e=>openFromClick(topic[field]!,e)}>Open {pages[topic[field]!].title}</button>}
        </label>)}
        <label>Exam date<input className="input" type="date" value={topic.examDate || ''} onChange={e=>updatePage(page.id,p=>{
          const t=p.study?.topics?.find(t=>t.id===topic.id);if(t)t.examDate=e.target.value||undefined
        })}/></label>
      </div>
      <Button small onClick={()=>updatePage(page.id,p=>{if(p.study)p.study.topics=p.study.topics?.filter(t=>t.id!==topic.id)})}>Remove topic</Button>
    </details>)}
    <label>Formula sheet<select className="input" value={study.formulaPage || ''} onChange={e=>updatePage(page.id,p=>{(p.study??={}).formulaPage=e.target.value||undefined})}>
      <option value="">None</option>{choices.map(p=><option key={p.id} value={p.id}>{p.title||'Untitled'}</option>)}
    </select></label>
  </section>
}

const escaped=(text:string)=>text.replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]!))
export async function saveStudySheet(page:Page,answerKey:boolean):Promise<void> {
  const title=(page.title || 'Study deck')+(answerKey?' · Answer key':' · Questions')
  const rows=(page.cards || []).map(card=>'<li><strong>'+escaped(card.question)+'</strong>'+
    (answerKey?'<p>'+escaped(card.answer)+'</p>':'<div class="answer"></div>')+'</li>').join('')
  const html='<!doctype html><html lang="en"><meta charset="utf-8"><title>'+escaped(title)+'</title><style>body{font:17px system-ui;margin:32px}li{break-inside:avoid;padding:8px}.answer{height:3em;border-bottom:1px solid #aaa}p{white-space:pre-wrap}</style><h1>'+escaped(title)+'</h1><ol>'+rows+'</ol></html>'
  await api.exportFile(html,answerKey?'study-answer-key.html':'study-questions.html')
}
