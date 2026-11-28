import { WishlistExport } from '../components/WishlistExport'
import { WishlistItemDetails } from '../components/WishlistItemDetails'
import { WishlistCategories, WishlistFilters } from '../components/WishlistCategories'
import { availableSavings, emptyWishlist, quantityPurchased, quantityWanted, wishlistCategories, wishlistCost } from '../lib/wishlist'
import { useState } from 'react'
import { getData, toast, updatePage } from '../store'
import { api } from '../lib/api'
import { pickImageData } from '../lib/image'
import type { Page, PurchaseList, WishItem } from '../types'
import { today, uid } from '../lib/util'
import { Button, Segmented } from '../components/ui'
import { Icon } from '../components/Icon'

export function WishlistPage({ page, compact = false }: { page: Page; compact?: boolean }): JSX.Element {
  const [tab, setTab] = useState<'wishlist' | 'purchased'>('wishlist')
  const [name, setName] = useState('')
  const [cost, setCost] = useState('')
  const [budgetOpen, setBudgetOpen] = useState(false)
  const [category, setCategory] = useState('')
  const [priority, setPriority] = useState('')
  const [archives, setArchives] = useState(false)
  const [showHidden,setShowHidden]=useState(false)
  const [gift,setGift]=useState('')
  const [sharing,setSharing]=useState(false)
  const [editing, setEditing] = useState<WishItem | null>(null)
  const list = page.wishlist ?? emptyWishlist()
  const bought = tab === 'purchased'
  const categories = wishlistCategories(list)
  const selected = categories.find(c=>c.id===category)
  const archivedNames = new Set(categories.filter(c=>c.archived).map(c=>c.name))
  const rank = { high: 0, medium: 1, low: 2 }
  const visible = list.items.filter(item => {
    const count=quantityPurchased(item)
    if ((bought ? count===0 : count>=quantityWanted(item)) || (priority && (item.priority ?? 'medium')!==priority)) return false
    if (gift && item.recipient!==gift) return false
    if (!bought && !showHidden && item.skipUntil && item.skipUntil>today()) return false
    if (selected) return item.category===selected.name
    return archives || !archivedNames.has(item.category || '')
  }).sort((a,b) => rank[a.priority ?? 'medium'] - rank[b.priority ?? 'medium'])
  const groups = bought ? [...categories.map(c=>({title:c.name,color:c.color})),{title:'Uncategorised',color:undefined,id:''}]
    .map(c=>({...c,items:visible.filter(i=>'id' in c ? !i.category : i.category===c.title)}))
    .filter(group=>group.items.length) : [{ title:'',color:undefined,items:visible }]
  const gifts=[...new Set(list.items.flatMap(i=>i.recipient?.trim()?[i.recipient]:[]))]
  const spent = list.items.reduce((n,item)=>n+wishlistCost(item,true),0)
  const total=visible.reduce((sum,item)=>sum+wishlistCost(item,bought),0)
  const money = (amount: number): string => new Intl.NumberFormat(undefined, { style: 'currency', currency: list.currency }).format(amount)
  const change = (edit: (data: PurchaseList) => void): void => {
    updatePage(page.id, p => { p.wishlist ??= emptyWishlist(); p.wishlist.categories=wishlistCategories(p.wishlist); edit(p.wishlist) })
  }
  const add = (event: React.FormEvent): void => {
    event.preventDefault()
    if (!name.trim() || (cost && (!Number.isFinite(Number(cost)) || Number(cost) < 0))) return
    change(data => { data.items.push({ id: uid(), name: name.trim(), cost: cost ? Number(cost) : null, category: selected?.name, priority: 'medium', purchased: bought, purchasedOn: bought ? today() : undefined }) })
    setName(''); setCost('')
  }
  return <section className={'purchase-list' + (compact ? ' compact' : '')}>
    <div className="row between gap-sm wrap"><Segmented small value={tab} onChange={setTab} options={[{ value: 'wishlist', label: 'Wishlist' }, { value: 'purchased', label: 'Purchased' }]} />
      <div className="row gap-xs wrap"><Button small kind="ghost" icon="wallet" onClick={() => setBudgetOpen(!budgetOpen)}>Budget</Button>
        <Button small kind="ghost" icon="download" onClick={()=>setSharing(true)}>Export</Button></div></div>
    {sharing && <WishlistExport title={page.title || 'Wishlist'} list={{...list,categories}} visible={visible} close={()=>setSharing(false)}/>}
    <div className="wish-category-row row gap-sm wrap">
      <select aria-label="Wishlist category" className="input input-sm" value={selected?.id || ''} onChange={e=>setCategory(e.target.value)}>
        <option value="">All items</option>{categories.filter(c=>!c.archived || archives || c.id===selected?.id).map(c=><option key={c.id} value={c.id}>{c.name}{c.archived?' (archived)':''}</option>)}
      </select>
      <select aria-label="Priority filter" className="input input-sm" value={priority} onChange={e=>setPriority(e.target.value)}>
        <option value="">All priorities</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
      </select>
      {!!gifts.length && <select className="input input-sm" aria-label="Gift recipient filter" value={gift} onChange={e=>setGift(e.target.value)}><option value="">Everyone</option>{gifts.map(name=><option key={name}>{name}</option>)}</select>}
      {!bought && list.items.some(item=>item.skipUntil && item.skipUntil>today()) && <label><input type="checkbox" checked={showHidden} onChange={e=>setShowHidden(e.target.checked)}/> Show hidden</label>}
      {categories.some(c=>c.archived) && <label><input type="checkbox" checked={archives} onChange={e=>setArchives(e.target.checked)}/> Show archived</label>}
    </div>
    <WishlistCategories categories={categories} change={change} selected={category} onSelect={setCategory}/>
    <WishlistFilters list={list} current={{tab,category: selected?.id || '',priority}} change={change} apply={view=>{setTab(view.tab);setCategory(view.category);setPriority(view.priority)}}/>
    {!!list.trash?.length && <details className="wish-category-settings"><summary>Recently removed ({list.trash.length})</summary>
      {list.trash.map(({item})=><div key={item.id} className="row between"><span>{item.name}</span><Button small onClick={()=>change(data=>{
        const entry=data.trash?.find(t=>t.item.id===item.id)
        if(!entry)return
        if(!data.items.some(i=>i.id===item.id))data.items.push(entry.item)
        data.trash=data.trash?.filter(t=>t.item.id!==item.id)
      })}>Restore {item.name}</Button></div>)}
    </details>}
    {budgetOpen && <div className="purchase-budget">
      <label>Currency<select className="input input-sm" value={list.currency} onChange={e => change(data => { data.currency = e.target.value })}>
        {['GBP','USD','EUR','CAD','AUD','JPY','INR'].map(c => <option key={c}>{c}</option>)}</select></label>
      <label>Budget<input aria-label="Purchase budget" className="input input-sm" type="number" min="0" step="any" value={list.budget ?? ''} onChange={e => {
        const n = e.target.valueAsNumber
        if (!e.target.value || Number.isFinite(n) && n >= 0) change(data => { data.budget = Number.isFinite(n) ? n : null })
      }} /></label></div>}
    {budgetOpen && <div className="purchase-budget">
      {(['delivery','discount'] as const).map(key=><label key={key}>{key==='delivery'?'Delivery':'Basket discount'}<input type="number" min="0" step="any" className="input input-sm" value={list[key] ?? ''} onChange={e=>{
        const value=e.target.valueAsNumber;change(data=>{data[key]=Number.isFinite(value)?Math.max(0,value):undefined})
      }}/></label>)}
    </div>}
    {(list.budget !== null || visible.length > 0) && <div className="row wrap gap-sm small muted">
      <span>{bought ? 'Spent' : 'Planned'} <b className="fg">{money(total)}</b></span>
      {!bought && !!(list.delivery || list.discount) && <span>Basket <b className="fg">{money(Math.max(0,total+(list.delivery || 0)-(list.discount || 0)))}</b></span>}
      {list.budget !== null && <span>Remaining <b className="fg">{money(list.budget - spent)}</b></span>}</div>}
    <form className="purchase-add" onSubmit={add}>
      <input data-widget-action={bought ? 'Add purchase' : 'Add wishlist item'} aria-label="Item name" className="input input-sm" placeholder="Item name" value={name} onChange={e => setName(e.target.value)} />
      <input aria-label="Price" className="input input-sm" type="number" min="0" step="any" placeholder="Price" value={cost} onChange={e => setCost(e.target.value)} />
      <button type="submit" className="btn btn-primary btn-sm" disabled={!name.trim()}>Add</button></form>
    {editing && <form className="wish-editor form" onSubmit={e => {
      e.preventDefault(); if (!editing.name.trim() || (editing.url && !/^https?:\/\//i.test(editing.url))) return
      const original=list.items.find(i=>i.id===editing.id)
      const changedSavings=editing.savingsId!==original?.savingsId || editing.earmarked!==original?.earmarked
      if(changedSavings && editing.savingsId && (editing.earmarked || 0)>availableSavings(getData(),editing.savingsId,page.id,editing.id,list.currency)){
        toast('That savings source has already been allocated.');return
      }
      change(data => {
        const item=data.items.find(i=>i.id===editing.id)
        if(item)Object.assign(item,{...editing,name:editing.name.trim(),recipient:editing.recipient?.trim() || undefined,category:editing.category?.trim() || undefined})
      })
      setEditing(null)
    }}>
      <label>Item name<input required className="input input-sm" value={editing.name} onChange={e => setEditing({...editing,name:e.target.value})} /></label>
      <div className="purchase-budget"><label>Category<input className="input input-sm" list={'wish-categories-'+page.id} value={editing.category ?? ''} onChange={e => setEditing({...editing,category:e.target.value})} /></label>
      <datalist id={'wish-categories-'+page.id}>{categories.map(c=><option key={c.id}>{c.name}</option>)}</datalist>
      <label>Priority<select className="input input-sm" value={editing.priority ?? 'medium'} onChange={e=>setEditing({...editing,priority:e.target.value as WishItem['priority']})}>{['high','medium','low'].map(p=><option key={p}>{p}</option>)}</select></label>
      <label>Price<input type="number" min="0" step="any" className="input input-sm" value={editing.cost ?? ''} onChange={e => setEditing({...editing,cost:e.target.value === '' ? null : e.target.valueAsNumber})} /></label></div>
      <WishlistItemDetails pageId={page.id} currency={list.currency} item={editing} edit={fn=>setEditing(old=>old?.id===editing.id?fn(old):old)}/>
      <label>Product link<input type="url" pattern="https?://.+" className="input input-sm" value={editing.url ?? ''} onChange={e=>setEditing({...editing,url:e.target.value.trim()})} /></label>
      <div className="row wrap gap-xs"><button type="button" className="btn btn-sm" onClick={async()=>{const image=await pickImageData(800,600); if(image)setEditing(old=>old?.id===editing.id?{...old,image}:old)}}>Choose picture</button>
      {editing.image && <button type="button" className="btn btn-sm" onClick={()=>setEditing({...editing,image:undefined})}>Remove picture</button>}
      <button className="btn btn-primary btn-sm">Save</button><button type="button" className="btn btn-sm" onClick={()=>setEditing(null)}>Cancel</button></div></form>}
    <div className={bought ? 'purchase-board' : ''}>{groups.map(group => <section key={group.title}>
    {group.title && <h4 style={{color:group.color}}>{group.title} <span className="muted">{money(group.items.reduce((sum,i)=>sum+wishlistCost(i,true),0))}</span></h4>}
    <div className="purchase-items">{group.items.map(item => <div key={item.id} data-widget-item={item.name} className="purchase-item">
      {item.image && <img className="wish-cover" loading="lazy" alt="" src={item.image} />}
      <button data-item-action={bought ? 'Move to wishlist' : 'Mark purchased'} className="icon-btn" title={bought ? 'Move to wishlist' : 'Mark purchased'} aria-label={(bought ? 'Move to wishlist: ' : 'Mark purchased: ') + item.name} onClick={() => change(data => {
        const row = data.items.find(x => x.id === item.id)
        if (row) { row.purchased = !bought; row.boughtQuantity=bought?0:quantityWanted(row);row.purchasedOn=bought?undefined:today();if(!bought)row.preorder=false }
      })}><Icon name={bought ? 'square-check-big' : 'square'} size={16} /></button>
      <span className="grow">{item.name}{!!item.earmarked && <small className="purchase-date muted">{money(item.earmarked)} set aside</small>}{quantityWanted(item)>1 && <small className="purchase-date muted">{quantityPurchased(item)}/{quantityWanted(item)} bought</small>}{item.preorder && !bought && <small className="purchase-date muted">Preorder</small>}{item.skipUntil && item.skipUntil>today() && <small className="purchase-date muted">{item.skipReason || 'Hidden'} until {item.skipUntil}</small>}{bought && item.purchasedOn && <small className="purchase-date muted">{item.purchasedOn}</small>}</span>{item.cost !== null && <span className="small">{money(wishlistCost(item,bought))}</span>}
      <small className="muted">{item.priority ?? 'medium'}</small>
      {item.url && <button className="icon-btn" data-item-action="Open product link" title="Open product link" onClick={()=>void api.openExternal(item.url!)}><Icon name="external" size={13}/></button>}
      <button className="icon-btn" data-item-action="Edit item" title={'Edit '+item.name} onClick={()=>setEditing({...item})}><Icon name="edit" size={13}/></button>
      <button className="icon-btn" aria-label={'Remove ' + item.name} onClick={() => {
        change(data=>{
          const row=data.items.find(x=>x.id===item.id)
          if(!row)return
          ;(data.trash ??=[]).push({item:row,deletedAt:Date.now()})
          data.items=data.items.filter(x=>x.id!==item.id)
        })
        toast('Item moved to Recently removed',{undo:true})
      }}><Icon name="x" size={13} /></button>
    </div>)}</div></section>)}</div>
  </section>
}
