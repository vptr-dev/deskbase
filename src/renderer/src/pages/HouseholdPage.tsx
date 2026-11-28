import { HomeRoutines } from '../components/HomeRoutines'
import { HouseholdCare } from '../components/HouseholdCare'
import { useState } from 'react'
import type { HouseholdData, HouseholdRecipe, Page } from '../types'
import { toast, updatePage, useData } from '../store'
import { addDays, friendlyDay, today, uid, weekStartOf } from '../lib/util'
import { ingredientKey, newMealSource, normalizeHousehold, recipeIngredients, shoppingForWeek } from '../lib/household'
import { pickImageData } from '../lib/image'
import { api } from '../lib/api'
import { Button, Segmented } from '../components/ui'

type Change=(fn:(data:HouseholdData)=>void)=>void
const count=(v:string,fallback=1)=> {const n=Number(v);return Number.isFinite(n) && n>0 ? Math.min(1_000_000,n) : fallback}
const amount=(n:number)=>new Intl.NumberFormat(undefined,{maximumFractionDigits:2}).format(n)
function Input({label,value,change,type='text',min}:{label:string;value:string|number;change:(v:string)=>void;type?:string;min?:number}) {
  return <label>{label}<input className="input input-sm" type={type} min={min} step={type==='number'?'any':undefined} value={value} onChange={e=>change(e.target.value)}/></label>
}
function RecipeCard({recipe,change}:{recipe:HouseholdRecipe;change:Change}) {
  const [servings,setServings]=useState(recipe.servings)
  const [note,setNote]=useState('')
  const [worked,setWorked]=useState(true)
  return <details className="lab-section"><summary>{recipe.name}</summary><div className="doc-tool-dialog">
    <Input label="Scale to servings" type="number" min={1} value={servings} change={v=>setServings(count(v))}/>
    <ul>{recipe.ingredients.map((item,i)=><li key={i}>{amount(item.quantity*servings/recipe.servings)} {item.unit} {item.name}</li>)}</ul>
    <label>Substitution<input className="input input-sm" value={note} onChange={e=>setNote(e.target.value)}/></label>
    <label><input type="checkbox" checked={worked} onChange={e=>setWorked(e.target.checked)}/> Worked well</label>
    <Button small disabled={!note.trim()} onClick={()=>{change(d=>{const r=d.recipes.find(r=>r.id===recipe.id);if(r)(r.substitutions??=[]).push({text:note.trim(),worked})});setNote('')}}>Log substitution</Button>
    {(recipe.substitutions || []).map((s,i)=><p key={i}>{s.worked?'Worked':'Try a different substitute'} · {s.text}</p>)}
  </div></details>
}

function Recipes({data,change}:{data:HouseholdData;change:Change}) {
  const [name,setName]=useState('')
  const [servings,setServings]=useState(2)
  const [ingredients,setIngredients]=useState('')
  const [edit,setEdit]=useState('')
  const [suggest,setSuggest]=useState(false)
  const due=new Set(data.stock.filter(s=>!!s.expires && !s.drawer && s.expires>=today() && s.expires<=addDays(today(),3) && s.quantity>0).map(ingredientKey))
  const ideas=data.recipes.map(r=>({r,score:r.ingredients.filter(x=>due.has(ingredientKey(x))).length})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score)
  const parsed=recipeIngredients(ingredients)
  function load(recipe:HouseholdRecipe):void {
    setEdit(recipe.id);setName(recipe.name);setServings(recipe.servings)
    setIngredients(recipe.ingredients.map(i=>[i.quantity,i.unit,i.name,i.aisle || ''].join(',')).join('\n'))
  }
  return <div className="doc-tool-dialog">
    <details open={!!edit || undefined} className="lab-section"><summary>{edit?'Edit recipe':'Add recipe'}</summary>
      <form className="doc-tool-dialog" onSubmit={e=>{
        e.preventDefault();if(!name.trim() || !parsed.length)return
        change(d=>{
          const recipe=d.recipes.find(r=>r.id===edit)
          if(recipe)Object.assign(recipe,{name:name.trim(),servings,ingredients:parsed})
          else d.recipes.push({id:uid(),name:name.trim(),servings,ingredients:parsed})
        })
        setEdit('');setName('');setIngredients('')
      }}>
        <div className="purchase-budget"><Input label="Recipe name" value={name} change={setName}/><Input label="Base servings" type="number" min={1} value={servings} change={v=>setServings(count(v))}/></div>
        <label>Ingredients<textarea className="input" placeholder={'200,g,pasta,Dry goods\n2,,tomatoes,Produce'} value={ingredients} onChange={e=>setIngredients(e.target.value)}/></label>
        <small className="muted">One ingredient per line. Enter quantity, unit, name and optional aisle.</small>
        <Button small type="submit" disabled={!name.trim() || !parsed.length}>{edit?'Save recipe':'Add recipe'}</Button>
      </form>
    </details>
    <Button small onClick={()=>setSuggest(!suggest)}>{suggest?'Hide suggestions':'Use food that expires soon'}</Button>
    {suggest && (ideas.length?<ul>{ideas.map(({r,score})=><li key={r.id}>{r.name} · {score} matching {score===1?'ingredient':'ingredients'}</li>)}</ul>:<p className="small muted">No recipes match pantry food expiring in the next three days.</p>)}
    {data.recipes.map(r=><div key={r.id} className="doc-tool-dialog"><RecipeCard recipe={r} change={change}/><Button small onClick={()=>load(r)}>Edit {r.name}</Button></div>)}
  </div>
}

function Meals({data,change}:{data:HouseholdData;change:Change}) {
  const [date,setDate]=useState(today)
  const [recipe,setRecipe]=useState('')
  const [servings,setServings]=useState(2)
  const [source,setSource]=useState('')
  const [frozen,setFrozen]=useState('')
  const defrost=data.meals.filter(m=>m.date===addDays(today(),1) && m.frozenItem).flatMap(m=>{
    const item=data.stock.find(s=>s.id===m.frozenItem)
    return item?[{id:m.id,item,servings:m.servings}]:[]
  })
  const recipeName=(id:string)=>data.recipes.find(r=>r.id===id)?.name || 'Recipe unavailable'
  return <div className="doc-tool-dialog">
    {!!defrost.length && <details open className="lab-section"><summary>Defrost tonight</summary>
      {defrost.map(({id,item,servings})=><p key={id}>{item.name} · {servings} portions · {item.drawer}{item.quantity<servings?' · Check stock':''}</p>)}
    </details>}
    <form className="doc-tool-dialog" onSubmit={e=>{
      e.preventDefault();if(!date || (!recipe && !source && !frozen))return
      const previous=data.meals.find(m=>m.id===source && m.date<=date && !m.leftoversFrom && !m.frozenItem)
      if(source && !previous)return
      change(d=>d.meals.push(newMealSource({id:uid(),date,recipe,servings,frozenItem:frozen || undefined},previous)))
      setSource('');setFrozen('')
    }}>
      <div className="purchase-budget"><Input label="Meal date" type="date" value={date} change={setDate}/><Input label="Meal servings" type="number" min={1} value={servings} change={v=>setServings(count(v))}/></div>
      <label>Recipe<select className="input" value={recipe} disabled={!!(source||frozen)} onChange={e=>setRecipe(e.target.value)}><option value="">Choose recipe</option>{data.recipes.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      <label>Use leftovers from<select className="input" value={source} onChange={e=>{setSource(e.target.value);setFrozen('')}}><option value="">None</option>
        {data.meals.filter(m=>m.date<=date&&!m.leftoversFrom&&!m.frozenItem).map(m=><option key={m.id} value={m.id}>{friendlyDay(m.date)} · {recipeName(m.recipe)}</option>)}</select></label>
      <label>Or use freezer stock<select className="input" value={frozen} onChange={e=>{setFrozen(e.target.value);setSource('')}}><option value="">None</option>
        {data.stock.filter(i=>i.drawer && i.quantity>0).map(i=><option key={i.id} value={i.id}>{i.name} · {i.quantity} portions</option>)}</select></label>
      <Button small type="submit" disabled={!date || (!recipe&&!source&&!frozen)}>Plan meal</Button>
    </form>
    {data.meals.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(m=><div className="row gap-xs wrap" key={m.id}>
      <strong>{friendlyDay(m.date)}</strong><span>{m.frozenItem?data.stock.find(s=>s.id===m.frozenItem)?.name || 'Freezer item unavailable':recipeName(m.recipe)} · {m.servings} servings</span>
      {m.leftoversFrom && <small>Leftovers from {data.meals.find(s=>s.id===m.leftoversFrom)?.date || 'an unavailable batch'}</small>}
      <Button small disabled={data.meals.some(s=>s.leftoversFrom===m.id)} onClick={()=>change(d=>{d.meals=d.meals.filter(s=>s.id!==m.id)})}>Remove meal</Button>
    </div>)}
  </div>
}

function Stock({data,change}:{data:HouseholdData;change:Change}) {
  const [name,setName]=useState('')
  const [freezer,freeze]=useState(false)
  return <div className="doc-tool-dialog">
    <form className="row gap-sm wrap" onSubmit={e=>{e.preventDefault();if(!name.trim())return
      change(d=>d.stock.push({id:uid(),name:name.trim(),unit:freezer?'portions':'',drawer:freezer?'Unassigned drawer':undefined,quantity:1}));setName('')
    }}><Input label="Stock item" value={name} change={setName}/><label><input type="checkbox" checked={freezer} onChange={e=>freeze(e.target.checked)}/> Freezer</label><Button small type="submit" disabled={!name.trim()}>Add stock</Button></form>
    {['Pantry',...new Set(data.stock.flatMap(i=>i.drawer?[i.drawer]:[]))].map(group=><details className="lab-section" key={group}><summary>{group}</summary>
      {data.stock.filter(i=>(i.drawer || 'Pantry')===group).map(i=>{
        const patch=(changes:Partial<typeof i>)=>change(d=>{const item=d.stock.find(s=>s.id===i.id);if(item)Object.assign(item,changes)})
        return <details key={i.id}><summary>{i.name} · {i.quantity} {i.unit}</summary><div className="purchase-budget">
          <Input label={i.drawer?'Portions remaining':'Quantity remaining'} type="number" min={0} value={i.quantity} change={v=>patch({quantity:count(v,0)})}/>
          {!i.drawer && <Input label="Unit" value={i.unit} change={unit=>patch({unit})}/>}
          {i.drawer && <Input label="Freezer drawer" value={i.drawer} change={drawer=>patch({drawer:drawer || 'Unassigned drawer'})}/>}
          <Input label="Opened on" type="date" value={i.opened || ''} change={opened=>patch({opened})}/>
          <Input label="Use by" type="date" value={i.expires || ''} change={expires=>patch({expires})}/>
          <Button small disabled={data.meals.some(m=>m.frozenItem===i.id)} onClick={()=>change(d=>{d.stock=d.stock.filter(s=>s.id!==i.id)})}>Remove stock item</Button>
        </div></details>
      })}
    </details>)}
  </div>
}

function Groceries({data,change}:{data:HouseholdData;change:Change}) {
  const starts=useData(d=>d.settings.weekStart)
  const [week,setWeek]=useState(()=>weekStartOf(today(),starts))
  const [shop,selectShop]=useState('')
  const [shopName,setShopName]=useState('')
  const [aisles,setAisles]=useState('')
  const [checked,setChecked]=useState<string[]>([])
  const [receipt,setReceipt]=useState('')
  const current=data.shops?.find(s=>s.id===shop)
  const basket=week?shoppingForWeek(data,week):[]
  const groups=[...new Set(basket.map(i=>i.aisle || 'Other'))].sort((a,b)=>{
    const index=(name:string)=>{const pos=current?.aisles.indexOf(name) ?? -1;return pos<0?999:pos}
    return index(a)-index(b)||a.localeCompare(b)
  })
  return <div className="doc-tool-dialog">
    <Input label="Shopping week starts" type="date" value={week} change={date=>{setWeek(date);setChecked([])}}/>
    <label>Shop<select className="input" value={shop} onChange={e=>selectShop(e.target.value)}><option value="">Alphabetical aisles</option>{data.shops?.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    <details className="lab-section"><summary>Shop aisle order</summary><div className="doc-tool-dialog">
      <Input label="Shop name" value={shopName} change={setShopName}/>
      <label>Aisles in order, one per line<textarea className="input" value={aisles} onChange={e=>setAisles(e.target.value)}/></label>
      <Button small disabled={!shopName.trim()} onClick={()=>{
        const name=shopName.trim(), order=[...new Set(aisles.split('\n').map(a=>a.trim()).filter(Boolean))]
        const id=data.shops?.find(s=>s.name===name)?.id || uid()
        change(d=>{d.shops=[...(d.shops || []).filter(s=>s.id!==id),{id,name,aisles:order}]})
        selectShop(id);setShopName('');setAisles('')
      }}>Save aisle order</Button>
    </div></details>
    {groups.map(group=><div className="doc-tool-dialog" key={group}><strong>{group}</strong>{basket.filter(i=>(i.aisle || 'Other')===group).map(i=><label key={ingredientKey(i)}>
      <input type="checkbox" checked={checked.includes(ingredientKey(i))} onChange={e=>setChecked(old=>e.target.checked?[...old,ingredientKey(i)]:old.filter(k=>k!==ingredientKey(i)))}/> {amount(i.quantity)} {i.unit} {i.name}
    </label>)}</div>)}
    {!groups.length && <p className="small muted">No additional ingredients needed for this week.</p>}
    <Button small disabled={!basket.length} onClick={()=>void api.exportFile(groups.map(group=>group+'\n'+basket.filter(i=>(i.aisle || 'Other')===group).map(i=>amount(i.quantity)+' '+i.unit+' '+i.name).join('\n')).join('\n\n'),'grocery-list.txt').catch(()=>toast('Could not save the shopping list.'))}>Export grocery list</Button>
    <details className="lab-section"><summary>Receipts ({data.receipts.length})</summary>
      <div className="doc-tool-dialog"><label>Type receipt lines<textarea className="input" value={receipt} onChange={e=>setReceipt(e.target.value)}/></label>
        <div className="row gap-xs wrap"><Button small disabled={!receipt.trim()} onClick={()=>{change(d=>d.receipts.push({id:uid(),date:today(),lines:receipt.trim(),reviewed:false}));setReceipt('')}}>Save typed receipt</Button>
          <Button small onClick={async()=>{const image=await pickImageData(1500,1500);if(image){change(d=>d.receipts.push({id:uid(),date:today(),lines:receipt.trim(),image,reviewed:false}));setReceipt('')}}}>Attach receipt photo</Button></div>
        {data.receipts.map(r=><details key={r.id}><summary>{r.date} · {r.reviewed?'Reviewed':'To review'}</summary>
          {r.image && <img className="wish-receipt" src={r.image} alt="Receipt"/>}
          <label>Grocery record<textarea className="input" value={r.lines} onChange={e=>change(d=>{const row=d.receipts.find(i=>i.id===r.id);if(row){row.lines=e.target.value;row.reviewed=false}})}/></label>
          <Button small disabled={!r.lines.trim()} onClick={()=>change(d=>{const row=d.receipts.find(i=>i.id===r.id);if(row)row.reviewed=true})}>Mark reviewed</Button>
        </details>)}
      </div>
    </details>
  </div>
}

export function HouseholdPage({page}:{page:Page}) {
  const [tab,setTab]=useState<'recipes'|'meals'|'stock'|'groceries'|'care'|'routines'>('recipes')
  const data=page.household || normalizeHousehold(undefined)
  const change:Change=fn=>updatePage(page.id,p=>fn(p.household??=normalizeHousehold(undefined)))
  return <section className="household-page doc-tool-dialog">
    <Segmented small value={tab} onChange={setTab} options={[{value:'recipes',label:'Recipes'},{value:'meals',label:'Meal plan'},{value:'stock',label:'Pantry & freezer'},{value:'groceries',label:'Groceries'},{value:'care',label:'Household care'},{value:'routines',label:'Routines'}]}/>
    {tab==='recipes'?<Recipes data={data} change={change}/>:tab==='meals'?<Meals data={data} change={change}/>:tab==='stock'?<Stock data={data} change={change}/>:tab==='groceries'?<Groceries data={data} change={change}/>:tab==='care'?<HouseholdCare data={data} change={change}/>:<HomeRoutines data={data} change={change}/>}
  </section>
}
