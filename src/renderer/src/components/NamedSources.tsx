import { useState } from 'react'
import { act, useData } from '../store'
import type { PageType, WidgetType } from '../types'
import { newPage, typeInfo } from '../lib/defaults'
import { uid } from '../lib/util'
import { ListTracker, StudyDeck, WorkoutLog } from '../pages/ListsAndStudy'
import type { AnyWidget } from './Widgets'

const types: Partial<Record<WidgetType,PageType>> = {
  tasks:'tasks',quickadd:'tasks',agenda:'tasks',week:'tasks',calendar:'tasks',deadlines:'tasks',stat:'tasks',activity:'tasks',chart:'tasks',
  goals:'goals',habits:'habits',list:'list',reading:'reading',workout:'workout',study:'study',wishlist:'wishlist',checklist:'doc',table:'doc',pageview:'doc',sections:'doc',
  database:'database',dbchart:'database',tracker:'tracker',dashboard:'dashboard',page:'doc',progress:'database'
}
export const aggregateWidgets = new Set<WidgetType>(['week','agenda','calendar','activity','deadlines','stat','chart'])
function createSource(type:PageType,title:string):string {
  const p=newPage(type,title.trim());act(d=>{d.pages[p.id]=p;d.rootOrder.push(p.id)});return p.id
}
export function NamedToolWidget({type,id,setId}:{type:'study'|'list'|'reading'|'workout';id?:string;setId:(id:string)=>void}):JSX.Element {
  const pages=useData(d=>d.pages)
  const [name,setName]=useState('')
  const p=id?pages[id]:Object.values(pages).find(p=>p.type===type&&!p.deletedAt)
  if(p&&!p.deletedAt&&p.type===type)return <div className="w-scroll">{type==='workout'?<WorkoutLog key={p.id} page={p}/>:type==='study'?<StudyDeck key={p.id} page={p}/>:<ListTracker key={p.id} page={p}/>}</div>
  return <form className="source-create" onSubmit={e=>{e.preventDefault();if(name.trim())setId(createSource(type,name))}}>
    <input aria-label="Source name" className="input input-sm" value={name} placeholder={type==='study'?'Subject name':'List name'} onChange={e=>setName(e.target.value)}/><button className="btn btn-sm" disabled={!name.trim()}>Create</button></form>
}

export function NamedSourceFields({w,patch}:{w:AnyWidget;patch:(fn:(w:AnyWidget)=>void)=>void}):JSX.Element|null {
  const [name,setName]=useState(''),[adding,setAdding]=useState(false)
  const pages=useData(d=>d.pages)
  const c=w.config
  const taskPages:PageType[]=['tasks','board','project']
  const databaseCount=w.type==='stat'&&c.stat==='rows'
  const type=databaseCount?'database':(w.type==='chart'&&c.source==='habits')||(w.type==='stat'&&c.stat==='habitsToday')?'habits':types[w.type]
  if(!type || (w.type==='chart'&&['value','metric','focus'].includes(c.source)) || (w.type==='stat'&&c.stat==='focusToday') || (w.type==='progress'&&c.source!=='db'))return null
  const grouped=aggregateWidgets.has(w.type)&&!databaseCount
  const field=grouped?'sourcePageId':databaseCount||['database','dbchart','progress'].includes(w.type)?'dbId':'pageId'
  const ownPicker=grouped||['goals','habits','study','list','reading','workout'].includes(w.type)
  const allowed:PageType[]=w.type==='activity'?[...taskPages,'journal','habits','tracker']:w.type==='deadlines'?[...taskPages,'goals','database']:w.type==='week'?[...taskPages,'habits']:type==='tasks'?taskPages:[type]
  const bind=(id:string):void=>patch(x=>{x.config[field]=id; if(field==='dbId'){x.config.viewId=null;x.config.by=null;x.config.prop=null}
    if(w.type==='table'){x.config.table=0;delete x.config.tableId}
    if(w.type==='tasks')delete x.config.taskViewId
  })
  return <div className="named-source">
    {ownPicker&&<label>Source<select className="input input-sm" value={c[field]??''} onChange={e=>bind(e.target.value)}>
      <option value="">{grouped||['goals','habits'].includes(w.type)?'All sources':'First '+typeInfo(type).name.toLowerCase()}</option>
      {Object.values(pages).filter(p=>!p.deletedAt&&!p.rowOf&&allowed.includes(p.type)).map(p=><option key={p.id} value={p.id}>{p.title||'Untitled'}</option>)}</select></label>}
    {adding?<form className="source-create" onSubmit={e=>{e.preventDefault();if(!name.trim())return
      const p=newPage(type,name.trim());const metricId=uid()
      if(w.type==='table')p.blocks=[{id:uid(),type:'table',text:name.trim(),rows:[['Item','Amount'],['','']]}]
      act(d=>{d.pages[p.id]=p;d.rootOrder.push(p.id)
        if(w.type==='tracker')d.metrics[metricId]={id:metricId,pageId:p.id,name:name.trim(),icon:'activity',unit:'',goal:null,direction:'none',color:'#468ca5',entries:[],aggregate:'sum',order:0}
      })
      bind(p.id);if(w.type==='tracker')patch(x=>{x.config.metricId=metricId})
      setName('');setAdding(false)
    }}><input autoFocus className="input input-sm" aria-label="New source name" placeholder="Name" value={name} onChange={e=>setName(e.target.value)}/><button className="btn btn-sm" disabled={!name.trim()}>Create</button><button className="btn btn-sm" type="button" onClick={()=>setAdding(false)}>Cancel</button></form>:
      <button type="button" className="link small" onClick={()=>setAdding(true)}>New named {w.type==='table'?'table':typeInfo(type).name.toLowerCase()}</button>}
  </div>
}
