import { Collection } from '../components/Collection'
import { useState } from 'react'
import type { ListEntry, Page, StudyCard } from '../types'
import { updatePage } from '../store'
import { addDays, today, uid } from '../lib/util'
import { Button, Checkbox, Progress, Segmented } from '../components/ui'

export function ListTracker({ page }: {page: Page}): JSX.Element {
  return page.type==='reading'?<ReadingProgress page={page}/>:<Collection page={page}/>
}
function ReadingProgress({page}:{page:Page}):JSX.Element {
  const [filter,setFilter] = useState<'all'|'open'|'done'>('all')
  const [name,setName] = useState('')
  const [quantity,setQuantity] = useState(page.type==='reading'?'100':'1')
  const [unit,setUnit] = useState(page.type==='reading'?'pages':'')
  const [editing,setEditing] = useState<string | null>(null)
  const rows = page.entries ?? []
  const visible = rows.filter(r => filter === 'all' || (r.done >= r.target) === (filter === 'done'))
  function update(id: string, fn: (r: ListEntry)=>void): void {
    updatePage(page.id,p => {const row=p.entries?.find(e=>e.id===id); if(row)fn(row)})
  }
  function clear(): void { setName('');setUnit(page.type==='reading'?'pages':'');setQuantity(page.type==='reading'?'100':'1');setEditing(null) }
  return <section className="list-tracker">
    <div className="row between wrap gap-sm"><Segmented small value={filter} onChange={setFilter} options={[{value:'all',label:'All'},{value:'open',label:'In progress'},{value:'done',label:'Done'}]} />
      {rows.length>0 && <span className="muted small">{rows.filter(r=>r.done>=r.target).length} of {rows.length} complete</span>}</div>
    <form className="tracker-add" onSubmit={e=>{e.preventDefault();const target=Number(quantity);if(!name.trim()||!Number.isFinite(target)||target<1)return
      if(editing) update(editing,r=>{r.name=name.trim();r.unit=unit.trim();r.target=target;r.done=Math.min(r.done,target)})
      else updatePage(page.id,p=>{(p.entries??=[]).push({id:uid(),name:name.trim(),unit:unit.trim(),done:0,target})})
      clear()
    }}>
      <label>{page.type==='reading'?'Book title':'Item'}<input aria-label="List item" required className="input input-sm" value={name} onChange={e=>setName(e.target.value)} /></label>
      <label>{page.type==='reading'?'Total pages':'Target'}<input className="input input-sm" type="number" min="1" value={quantity} onChange={e=>setQuantity(e.target.value)} /></label>
      <label>Unit<input className="input input-sm" placeholder="e.g. pages" value={unit} onChange={e=>setUnit(e.target.value)} /></label>
      <button className="btn btn-primary btn-sm" disabled={!name.trim()}>{editing?'Save':'Add'}</button>{editing&&<button type="button" className="btn btn-sm" onClick={clear}>Cancel</button>}
    </form>
    {visible.map(row=><div key={row.id} data-widget-item={row.name} className="list-entry">
      <Checkbox checked={row.done>=row.target} onChange={on=>update(row.id,r=>{r.done=on?r.target:0})}/>
      <div className="grow"><strong>{row.name}</strong>{row.target>1 && <><div className="small muted">{row.done} / {row.target} {row.unit}</div><Progress value={row.done/row.target}/></>}</div>
      {page.type==='reading'&&<label className="small">Page <input className="input input-sm" style={{width:'6em'}} aria-label={'Current page of '+row.name} type="number" min="0" max={row.target} value={row.done} onChange={e=>{const n=e.target.valueAsNumber;if(Number.isFinite(n))update(row.id,r=>{r.done=Math.min(r.target,Math.max(0,n))})}}/></label>}
      {row.target>1 && <button className="btn btn-sm" data-item-action="Add one" disabled={row.done>=row.target} onClick={()=>update(row.id,r=>{r.done=Math.min(r.target,r.done+1)})}>+1</button>}
      <Button small kind="ghost" icon="edit" title={'Edit '+row.name} onClick={()=>{setEditing(row.id);setName(row.name);setQuantity(String(row.target));setUnit(row.unit)}}/>
      <Button small kind="ghost" icon="trash" title={'Remove '+row.name} onClick={()=>{updatePage(page.id,p=>{p.entries=p.entries?.filter(r=>r.id!==row.id)});if(editing===row.id)clear()}}/>
    </div>)}
  </section>
}

export function StudyDeck({page}: {page:Page}): JSX.Element {
  const [tab,setTab]=useState<'review'|'cards'>('review')
  const [shown,setShown]=useState<string|null>(null)
  const [front,setFront]=useState('')
  const [back,setBack]=useState('')
  const [edit,setEdit]=useState<string|null>(null)
  const [paste,setPaste]=useState('')
  const date=today()
  const cards=page.cards??[]
  const due=cards.filter(c=>!c.due||c.due<=date).sort((a,b)=>a.due.localeCompare(b.due))
  const card=due[0]
  const clear=():void=>{setFront('');setBack('');setEdit(null)}
  const grade=(current:StudyCard,remembered:boolean):void=>{
    updatePage(page.id,p=>{const c=p.cards?.find(x=>x.id===current.id);if(!c)return
      c.interval=remembered?Math.min(365,Math.max(2,2*c.interval)):1
      c.due=addDays(date,c.interval)
    });setShown(null)
  }
  return <section className="study-deck"><div className="row between wrap gap-sm"><Segmented small value={tab} onChange={setTab} options={[{value:'review',label:'Review'},{value:'cards',label:'Cards'}]}/>
    <span className="small muted">{due.length} due · {cards.length} cards</span></div>
    {tab==='review' ? card ? <article className="study-prompt"><h3>{card.question}</h3>
      {shown===card.id ? <><p>{card.answer}</p><div className="row wrap gap-xs"><Button small onClick={()=>grade(card,false)}>Again tomorrow</Button><Button small kind="primary" onClick={()=>grade(card,true)}>Remembered</Button></div></>:
        <Button small kind="primary" onClick={()=>setShown(card.id)}>Reveal answer</Button>}</article> :
      <div className="row wrap gap-sm">{cards.length>0 && <span>Next review {cards.map(c=>c.due).sort()[0]}</span>}<Button small onClick={()=>setTab('cards')}>Add cards</Button></div> :
      <><form className="form study-form" onSubmit={e=>{e.preventDefault();if(!front.trim()||!back.trim())return
        updatePage(page.id,p=>{p.cards??=[];const card=p.cards.find(c=>c.id===edit)
          if(card){card.question=front.trim();card.answer=back.trim()}else p.cards.push({id:uid(),question:front.trim(),answer:back.trim(),due:date,interval:0})
        });clear()
      }}><label>Question<input required className="input input-sm" value={front} onChange={e=>setFront(e.target.value)}/></label>
        <label>Answer<textarea required className="input input-sm" value={back} onChange={e=>setBack(e.target.value)}/></label>
        <div className="row gap-sm"><button className="btn btn-primary btn-sm" disabled={!front.trim()||!back.trim()}>{edit?'Save card':'Add card'}</button>{edit&&<button type="button" className="btn btn-sm" onClick={clear}>Cancel</button>}</div></form>
      <details><summary>Import flashcards</summary><form className="form" onSubmit={e=>{e.preventDefault()
        const lines=paste.trim().split(/\r?\n/).map(s=>s.split('\t').map(v=>v.trim()))
        if(lines.some(line=>line.length!==2||line.some(v=>!v)))return
        updatePage(page.id,p=>{(p.cards??=[]).push(...lines.map(([question,answer])=>({id:uid(),question,answer,due:date,interval:0})))})
        setPaste('')
      }}><label>Paste two spreadsheet columns, question and answer<textarea className="input" value={paste} onChange={e=>setPaste(e.target.value)}/></label>
        <button className="btn btn-sm" disabled={!paste.trim()||paste.trim().split(/\r?\n/).some(s=>s.split('\t').length!==2||s.split('\t').some(v=>!v.trim()))}>Import cards</button></form></details>
      {cards.map(c=><div className="list-entry" key={c.id}><span className="grow">{c.question}</span>
        <Button small kind="ghost" icon="edit" title="Edit card" onClick={()=>{setEdit(c.id);setFront(c.question);setBack(c.answer)}}/>
        <Button small kind="ghost" icon="trash" title="Remove card" onClick={()=>{updatePage(page.id,p=>{p.cards=p.cards?.filter(x=>x.id!==c.id)});if(edit===c.id)clear()}}/></div>)}</>}
  </section>
}

export function WorkoutLog({page}:{page:Page}):JSX.Element {
 const [exercise,setExercise]=useState(''),[date,setDate]=useState(today()),[sets,setSets]=useState('3'),[reps,setReps]=useState('8'),[weight,setWeight]=useState('0'),[unit,setUnit]=useState('kg')
 const log=[...(page.workouts??[])].sort((a,b)=>b.date.localeCompare(a.date))
 const last=log.find(w=>w.exercise.toLowerCase()===exercise.trim().toLowerCase())
 return <section><form className="tracker-add" onSubmit={e=>{e.preventDefault();if(!exercise.trim()||!date||![sets,reps,weight].every(x=>x.trim()&&Number.isFinite(+x))||+sets<1||+reps<1||+weight<0)return
  updatePage(page.id,p=>{(p.workouts??=[]).unshift({id:uid(),exercise:exercise.trim(),date,sets:+sets,reps:+reps,weight:+weight,unit})})
 }}><label>Exercise<input required className="input" value={exercise} onChange={e=>setExercise(e.target.value)}/></label>
 <label>Date<input required type="date" className="input" value={date} onChange={e=>setDate(e.target.value)}/></label>
 <label>Sets<input required className="input" type="number" min="1" value={sets} onChange={e=>setSets(e.target.value)}/></label>
 <label>Reps<input required className="input" type="number" min="1" value={reps} onChange={e=>setReps(e.target.value)}/></label>
 <label>Weight<input required className="input" type="number" min="0" step="any" value={weight} onChange={e=>setWeight(e.target.value)}/></label>
 <label>Unit<select className="input" value={unit} onChange={e=>setUnit(e.target.value)}><option>kg</option><option>lb</option></select></label>
 <button className="btn btn-primary btn-sm">Log workout</button></form>
 {last&&<small>Previous session · {last.date} · {last.sets} × {last.reps} at {last.weight} {last.unit}</small>}
 {log.map(w=><div className="list-entry" data-widget-item={w.exercise} key={w.id}><span className="grow"><strong>{w.exercise}</strong><br/>{w.date} · {w.sets} × {w.reps} · {w.weight} {w.unit}</span><Button small kind="ghost" icon="repeat" title="Repeat workout" onClick={()=>{setExercise(w.exercise);setSets(String(w.sets));setReps(String(w.reps));setWeight(String(w.weight));setUnit(w.unit);setDate(today())}}/><Button small kind="ghost" icon="trash" title="Remove workout" onClick={()=>updatePage(page.id,p=>{p.workouts=p.workouts?.filter(x=>x.id!==w.id)})}/></div>)}</section>
}
