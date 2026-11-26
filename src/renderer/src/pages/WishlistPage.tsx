import { useState } from 'react'
import { updatePage } from '../store'
import { api } from '../lib/api'
import { pickImageData } from '../lib/image'
import type { Page, PurchaseList, WishItem } from '../types'
import { today, uid } from '../lib/util'
import { Button, Segmented } from '../components/ui'
import { Icon } from '../components/Icon'

const emptyList = (): PurchaseList => ({ items: [], budget: null, currency: 'GBP' })

export function WishlistPage({ page, compact = false }: { page: Page; compact?: boolean }): JSX.Element {
  const [tab, setTab] = useState<'wishlist' | 'purchased'>('wishlist')
  const [name, setName] = useState('')
  const [cost, setCost] = useState('')
  const [budgetOpen, setBudgetOpen] = useState(false)
  const [category, setCategory] = useState('All items')
  const [editing, setEditing] = useState<WishItem | null>(null)
  const list = page.wishlist ?? emptyList()
  const bought = tab === 'purchased'
  const categories = [...new Set(['Tech','Online','Beauty','Fashion','Home','Misc',...list.items.map(i => i.category || 'Misc')])]
  const rank = { high: 0, medium: 1, low: 2 }
  const visible = list.items.filter(item => item.purchased === bought && (category === 'All items' || (item.category || 'Misc') === category))
    .sort((a,b) => rank[a.priority ?? 'medium'] - rank[b.priority ?? 'medium'])
  const groups = bought ? categories.map(c => ({ title: c, items: visible.filter(i => (i.category || 'Misc') === c) })).filter(g => g.items.length) : [{ title: '', items: visible }]
  const spent = list.items.filter(item => item.purchased).reduce((n, item) => n + (item.cost ?? 0), 0)
  const money = (amount: number): string => new Intl.NumberFormat(undefined, { style: 'currency', currency: list.currency }).format(amount)
  const change = (edit: (data: PurchaseList) => void): void => {
    updatePage(page.id, p => { p.wishlist ??= emptyList(); edit(p.wishlist) })
  }
  const add = (event: React.FormEvent): void => {
    event.preventDefault()
    if (!name.trim() || (cost && (!Number.isFinite(Number(cost)) || Number(cost) < 0))) return
    change(data => { data.items.push({ id: uid(), name: name.trim(), cost: cost ? Number(cost) : null, category: category === 'All items' ? 'Misc' : category, priority: 'medium', purchased: bought, purchasedOn: bought ? today() : undefined }) })
    setName(''); setCost('')
  }
  return <section className={'purchase-list' + (compact ? ' compact' : '')}>
    <div className="row between gap-sm wrap"><Segmented small value={tab} onChange={setTab} options={[{ value: 'wishlist', label: 'Wishlist' }, { value: 'purchased', label: 'Purchased' }]} />
      <Button small kind="ghost" icon="wallet" onClick={() => setBudgetOpen(!budgetOpen)}>Budget</Button></div>
    <div className="wish-category-row"><select aria-label="Wishlist category" className="input input-sm" value={category} onChange={e => setCategory(e.target.value)}>
      {['All items',...categories].map(c => <option key={c}>{c}</option>)}</select></div>
    {budgetOpen && <div className="purchase-budget">
      <label>Currency<select className="input input-sm" value={list.currency} onChange={e => change(data => { data.currency = e.target.value })}>
        {['GBP','USD','EUR','CAD','AUD','JPY','INR'].map(c => <option key={c}>{c}</option>)}</select></label>
      <label>Budget<input aria-label="Purchase budget" className="input input-sm" type="number" min="0" step="any" value={list.budget ?? ''} onChange={e => {
        const n = e.target.valueAsNumber
        if (!e.target.value || Number.isFinite(n) && n >= 0) change(data => { data.budget = Number.isFinite(n) ? n : null })
      }} /></label></div>}
    {(list.budget !== null || visible.length > 0) && <div className="row wrap gap-sm small muted">
      <span>{bought ? 'Spent' : 'Planned'} <b className="fg">{money(visible.reduce((n, item) => n + (item.cost ?? 0), 0))}</b></span>
      {list.budget !== null && <span>Remaining <b className="fg">{money(list.budget - spent)}</b></span>}</div>}
    <form className="purchase-add" onSubmit={add}>
      <input data-widget-action={bought ? 'Add purchase' : 'Add wishlist item'} aria-label="Item name" className="input input-sm" placeholder="Item name" value={name} onChange={e => setName(e.target.value)} />
      <input aria-label="Price" className="input input-sm" type="number" min="0" step="any" placeholder="Price" value={cost} onChange={e => setCost(e.target.value)} />
      <button type="submit" className="btn btn-primary btn-sm" disabled={!name.trim()}>Add</button></form>
    {editing && <form className="wish-editor form" onSubmit={e => {
      e.preventDefault(); if (!editing.name.trim() || (editing.url && !/^https?:\/\//i.test(editing.url))) return
      change(data => { const item = data.items.find(i => i.id === editing.id); if (item) Object.assign(item, { name:editing.name.trim(), category:editing.category?.trim() || 'Misc', priority:editing.priority, cost:editing.cost, image:editing.image, url:editing.url }) })
      setEditing(null)
    }}>
      <label>Item name<input required className="input input-sm" value={editing.name} onChange={e => setEditing({...editing,name:e.target.value})} /></label>
      <div className="purchase-budget"><label>Category<input className="input input-sm" list={'wish-categories-'+page.id} value={editing.category ?? ''} onChange={e => setEditing({...editing,category:e.target.value})} /></label>
      <datalist id={'wish-categories-'+page.id}>{categories.map(c=><option key={c}>{c}</option>)}</datalist>
      <label>Priority<select className="input input-sm" value={editing.priority ?? 'medium'} onChange={e=>setEditing({...editing,priority:e.target.value as WishItem['priority']})}>{['high','medium','low'].map(p=><option key={p}>{p}</option>)}</select></label>
      <label>Price<input type="number" min="0" step="any" className="input input-sm" value={editing.cost ?? ''} onChange={e => setEditing({...editing,cost:e.target.value === '' ? null : e.target.valueAsNumber})} /></label></div>
      <label>Product link<input type="url" pattern="https?://.+" className="input input-sm" value={editing.url ?? ''} onChange={e=>setEditing({...editing,url:e.target.value.trim()})} /></label>
      <div className="row wrap gap-xs"><button type="button" className="btn btn-sm" onClick={async()=>{const image=await pickImageData(800,600); if(image)setEditing(old=>old?.id===editing.id?{...old,image}:old)}}>Choose picture</button>
      {editing.image && <button type="button" className="btn btn-sm" onClick={()=>setEditing({...editing,image:undefined})}>Remove picture</button>}
      <button className="btn btn-primary btn-sm">Save</button><button type="button" className="btn btn-sm" onClick={()=>setEditing(null)}>Cancel</button></div></form>}
    <div className={bought ? 'purchase-board' : ''}>{groups.map(group => <section key={group.title}>
    {group.title && <h4>{group.title} <span className="muted">{money(group.items.reduce((sum,i)=>sum+(i.cost ?? 0),0))}</span></h4>}
    <div className="purchase-items">{group.items.map(item => <div key={item.id} data-widget-item={item.name} className="purchase-item">
      {item.image && <img className="wish-cover" loading="lazy" alt="" src={item.image} />}
      <button data-item-action={bought ? 'Move to wishlist' : 'Mark purchased'} className="icon-btn" title={bought ? 'Move to wishlist' : 'Mark purchased'} aria-label={(bought ? 'Move to wishlist: ' : 'Mark purchased: ') + item.name} onClick={() => change(data => {
        const row = data.items.find(x => x.id === item.id); if (row) { row.purchased = !row.purchased; row.purchasedOn = row.purchased ? today() : undefined }
      })}><Icon name={bought ? 'square-check-big' : 'square'} size={16} /></button>
      <span className="grow">{item.name}{bought && item.purchasedOn && <small className="purchase-date muted">{item.purchasedOn}</small>}</span>{item.cost !== null && <span className="small">{money(item.cost)}</span>}
      <small className="muted">{item.priority ?? 'medium'}</small>
      {item.url && <button className="icon-btn" data-item-action="Open product link" title="Open product link" onClick={()=>void api.openExternal(item.url!)}><Icon name="external" size={13}/></button>}
      <button className="icon-btn" data-item-action="Edit item" title={'Edit '+item.name} onClick={()=>setEditing({...item})}><Icon name="edit" size={13}/></button>
      <button className="icon-btn" aria-label={'Remove ' + item.name} onClick={() => change(data => { data.items = data.items.filter(x => x.id !== item.id) })}><Icon name="x" size={13} /></button>
    </div>)}</div></section>)}</div>
  </section>
}
