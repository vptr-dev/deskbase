import { pickImageData } from '../lib/image'
import { StudyDiagram, StudyPlan, saveStudySheet } from '../components/StudyTools'
import { StudyPaper, mistakeReasons } from '../components/StudyPaper'
import { Collection } from '../components/Collection'
import { useState } from 'react'
import type { DiagramMask, ListEntry, Page, StudyCard } from '../types'
import { toast, updatePage, useData } from '../store'
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
  const [tab,setTab]=useState<'review'|'cards'|'plan'|'paper'>('review')
  const [session]=useState(uid)
  const [exam,setExam]=useState(false)
  const [confidence,setConfidence]=useState(0)
  const [mistake,setMistake]=useState('')
  const [practice,setPractice]=useState<string[]|null>(null)
  const [diagram,setDiagram]=useState<string>()
  const [masks,setMasks]=useState<DiagramMask[]>([])
  const pages=useData(d=>d.pages)
  const [shown,setShown]=useState<string|null>(null)
  const [front,setFront]=useState('')
  const [back,setBack]=useState('')
  const [edit,setEdit]=useState<string|null>(null)
  const [paste,setPaste]=useState('')
  const date=today()
  const cards=page.cards??[]
  const due=cards.filter(c=>!c.due||c.due<=date).sort((a,b)=>a.due.localeCompare(b.due))
  const study=page.study || {}
  const reviews=study.reviews || []
  const last=reviews.filter(r=>!r.practice).at(-1)?.session
  const missed=[...new Set(reviews.filter(r=>!r.practice && !r.remembered && r.session===last).map(r=>r.card))].filter(id=>cards.some(c=>c.id===id))
  const paused=!!study.queueLimit && due.filter(c=>c.interval>0).length>=study.queueLimit
  const card=practice ? cards.find(c=>c.id===practice[0]) : due.find(c=>!paused || c.interval>0)
  const formula=study.formulaPage ? pages[study.formulaPage] : undefined
  const clear=():void=>{setFront('');setBack('');setEdit(null);setDiagram(undefined);setMasks([])}
  const reset=()=>{setShown(null);setConfidence(0);setMistake('')}
  const grade=(current:StudyCard,remembered:boolean):void=>{
    updatePage(page.id,p=>{
      const c=p.cards?.find(x=>x.id===current.id)
      if(!c)return
      if(!practice){c.interval=remembered?Math.min(365,Math.max(2,2*c.interval)):1;c.due=addDays(date,c.interval)}
      const profile=(p.study??={})
      profile.reviews=[...profile.reviews??[],{id:uid(),card:c.id,session,date,confidence:confidence || undefined,remembered,mistake:remembered?undefined:mistake||undefined,practice:!!practice}].slice(-300)
    })
    if(practice)setPractice(practice.slice(1))
    reset()
  }
  return <section className="study-deck"><div className="row between wrap gap-sm">{!exam && <Segmented small value={tab}
    onChange={setTab} options={[{value:'review',label:'Review'},{value:'cards',label:'Cards'},{value:'plan',label:'Plan'},{value:'paper',label:'Past paper'}]}/>}
    <span className="small muted">{due.length} due · {cards.length} cards</span></div>
    {tab==='plan'?<StudyPlan page={page}/>:tab==='paper'?<StudyPaper page={page} onActive={setExam}/>:tab==='review' ? <>
      <div className="row wrap gap-sm">{practice ? <Button small onClick={()=>{setPractice(null);reset()}}>Return to due cards</Button> :
        <Button small disabled={!missed.length} onClick={()=>{setPractice(missed);reset()}}>Practise missed cards ({missed.length})</Button>}
      {paused && <span className="small muted">New cards paused while the review queue is full.</span>}</div>
      {card ? <div className={'study-session'+(formula && !formula.deletedAt?' with-formula':'')}><article className="study-prompt"><h3>{card.question}</h3>
        <StudyDiagram card={card} revealed={shown===card.id}/>
        {shown===card.id ? <><p>{card.answer}</p><label>Mistake reason <select className="input input-sm" value={mistake} onChange={e=>setMistake(e.target.value)}>
          <option value="">Optional</option>{mistakeReasons.map(reason=><option key={reason}>{reason}</option>)}
        </select></label><div className="row wrap gap-xs"><Button small onClick={()=>grade(card,false)}>{practice?'Still missed':'Again tomorrow'}</Button>
          <Button small kind="primary" onClick={()=>grade(card,true)}>Remembered</Button></div></> :
          <div className="row gap-xs wrap"><label>Confidence <select className="input input-sm" value={confidence} onChange={e=>setConfidence(Number(e.target.value))}>
            <option value={0}>Optional</option><option value={1}>Low</option><option value={2}>Unsure</option><option value={3}>High</option>
          </select></label><Button small kind="primary" onClick={()=>setShown(card.id)}>Reveal answer</Button></div>}
        </article>
        {formula && !formula.deletedAt && <aside className="study-formula"><strong>{formula.title || 'Formula sheet'}</strong>
          {formula.blocks.filter(b=>b.text).slice(0,40).map(b=><p key={b.id}>{b.text}</p>)}</aside>}
      </div> : <div className="row wrap gap-sm">{practice ? <span>Practice set complete.</span> :
        <>{cards.length>0 && <span>Next review {cards.map(c=>c.due).sort()[0]}</span>}<Button small onClick={()=>setTab('cards')}>Add cards</Button></>}
      </div>}
      {!!reviews.length && <details><summary>Confidence and recall</summary>
        {reviews.slice(-12).reverse().map(r=><div key={r.id} className="row gap-xs wrap">
          <span>{cards.find(c=>c.id===r.card)?.question || 'Removed card'}</span><span>· {r.confidence ? ['','Low','Unsure','High'][r.confidence] : 'Unrated'}</span>
          <strong>· {r.remembered?'Remembered':'Missed'}</strong>{r.mistake && <span>· {r.mistake}</span>}
        </div>)}
      </details>}
    </> :
      <><form className="form study-form" onSubmit={e=>{e.preventDefault();if(!front.trim()||!back.trim())return
        updatePage(page.id,p=>{p.cards??=[];const card=p.cards.find(c=>c.id===edit)
          if(card){Object.assign(card,{question:front.trim(),answer:back.trim(),diagram,masks})}
          else p.cards.push({id:uid(),question:front.trim(),answer:back.trim(),due:date,interval:0,diagram,masks})
        });clear()
      }}><label>Question<input required className="input input-sm" value={front} onChange={e=>setFront(e.target.value)}/></label>
        <label>Answer<textarea required className="input input-sm" value={back} onChange={e=>setBack(e.target.value)}/></label>
        <div className="row gap-sm wrap"><Button small onClick={async()=>{const image=await pickImageData(1200,1000);if(image){setDiagram(image);setMasks([])}}}>Choose diagram</Button>
          {diagram && <Button small onClick={()=>setMasks([])}>Clear masks</Button>}</div>
        {diagram && <><span className="small muted">Drag across the parts to hide.</span><StudyDiagram card={{diagram,masks}} draw={mask=>setMasks(current=>[...current,mask])}/></>}
        <div className="row gap-sm"><button className="btn btn-primary btn-sm" disabled={!front.trim()||!back.trim()}>{edit?'Save card':'Add card'}</button>{edit&&<button type="button" className="btn btn-sm" onClick={clear}>Cancel</button>}</div></form>
      {cards.length>0 && <div className="row gap-sm wrap"><Button small onClick={()=>void saveStudySheet(page,false).catch(()=>toast('Could not save the question sheet.'))}>Printable questions</Button>
        <Button small onClick={()=>void saveStudySheet(page,true).catch(()=>toast('Could not save the answer key.'))}>Separate answer key</Button></div>}
      <details><summary>Import flashcards</summary><form className="form" onSubmit={e=>{e.preventDefault()
        const lines=paste.trim().split(/\r?\n/).map(s=>s.split('\t').map(v=>v.trim()))
        if(lines.some(line=>line.length!==2||line.some(v=>!v)))return
        updatePage(page.id,p=>{(p.cards??=[]).push(...lines.map(([question,answer])=>({id:uid(),question,answer,due:date,interval:0})))})
        setPaste('')
      }}><label>Paste two spreadsheet columns, question and answer<textarea className="input" value={paste} onChange={e=>setPaste(e.target.value)}/></label>
        <button className="btn btn-sm" disabled={!paste.trim()||paste.trim().split(/\r?\n/).some(s=>s.split('\t').length!==2||s.split('\t').some(v=>!v.trim()))}>Import cards</button></form></details>
      {cards.map(c=><div className="list-entry" key={c.id}><span className="grow">{c.question}</span>
        <Button small kind="ghost" icon="edit" title="Edit card" onClick={()=>{setEdit(c.id);setFront(c.question);setBack(c.answer);setDiagram(c.diagram);setMasks(c.masks || [])}}/>
        <Button small kind="ghost" icon="trash" title="Remove card" onClick={()=>{updatePage(page.id,p=>{p.cards=p.cards?.filter(x=>x.id!==c.id)});if(edit===c.id)clear()}}/></div>)}</>}
  </section>
}

export function WorkoutLog({page}:{page:Page}):JSX.Element {
 const [exercise,setExercise]=useState(''),[date,setDate]=useState(today()),[sets,setSets]=useState('3'),[reps,setReps]=useState('8'),[weight,setWeight]=useState('0'),[unit,setUnit]=useState('kg')
 const routines:string[]=Array.isArray(page.view?.workoutRotation)?page.view.workoutRotation:[]
 const [routine,setRoutine]=useState('')
 const [rotation,setRotation]=useState(routines.join('\n'))
 const log=[...(page.workouts??[])].sort((a,b)=>b.date.localeCompare(a.date))
 const last=log.find(w=>w.exercise.toLowerCase()===exercise.trim().toLowerCase())
 const lastRoutine=log.find(w=>w.routine && routines.includes(w.routine))?.routine
 const next=routines[(routines.indexOf(lastRoutine || '')+1)%routines.length]
 return <section>
 <details className="lab-section"><summary>Alternating routines</summary>
   <label>Routine names in order, one per line<textarea className="input" value={rotation} onChange={e=>setRotation(e.target.value)}/></label>
   <Button small onClick={()=>updatePage(page.id,p=>{p.view={...p.view,workoutRotation:[...new Set(rotation.split('\n').map(r=>r.trim()).filter(Boolean))].slice(0,20)}})}>Save rotation</Button>
   {next && <p>Suggested next · {next}</p>}
 </details>
 <form className="tracker-add" onSubmit={e=>{e.preventDefault();if(!exercise.trim()||!date||![sets,reps,weight].every(x=>x.trim()&&Number.isFinite(+x))||+sets<1||+reps<1||+weight<0)return
  updatePage(page.id,p=>{(p.workouts??=[]).unshift({id:uid(),exercise:exercise.trim(),date,sets:+sets,reps:+reps,weight:+weight,unit,routine:routine || next})})
 }}><label>Exercise<input required className="input" value={exercise} onChange={e=>setExercise(e.target.value)}/></label>
 <label>Date<input required type="date" className="input" value={date} onChange={e=>setDate(e.target.value)}/></label>
 <label>Sets<input required className="input" type="number" min="1" value={sets} onChange={e=>setSets(e.target.value)}/></label>
 <label>Reps<input required className="input" type="number" min="1" value={reps} onChange={e=>setReps(e.target.value)}/></label>
 <label>Weight<input required className="input" type="number" min="0" step="any" value={weight} onChange={e=>setWeight(e.target.value)}/></label>
 {!!routines.length && <label>Routine<select className="input" value={routine || ''} onChange={e=>setRoutine(e.target.value)}><option value="">{next?'Suggested · '+next:'Choose routine'}</option>{routines.map(r=><option key={r}>{r}</option>)}</select></label>}
 <label>Unit<select className="input" value={unit} onChange={e=>setUnit(e.target.value)}><option>kg</option><option>lb</option></select></label>
 <button className="btn btn-primary btn-sm">Log workout</button></form>
 {last&&<small>Previous session · {last.date} · {last.sets} × {last.reps} at {last.weight} {last.unit}</small>}
 {log.map(w=><div className="list-entry" data-widget-item={w.exercise} key={w.id}><span className="grow"><strong>{w.exercise}</strong><br/>{w.date}{w.routine && ' · '+w.routine} · {w.sets} × {w.reps} · {w.weight} {w.unit}</span><Button small kind="ghost" icon="repeat" title="Repeat workout" onClick={()=>{setExercise(w.exercise);setSets(String(w.sets));setReps(String(w.reps));setWeight(String(w.weight));setUnit(w.unit);setRoutine(w.routine || '');setDate(today())}}/><Button small kind="ghost" icon="trash" title="Remove workout" onClick={()=>updatePage(page.id,p=>{p.workouts=p.workouts?.filter(x=>x.id!==w.id)})}/></div>)}</section>
}
