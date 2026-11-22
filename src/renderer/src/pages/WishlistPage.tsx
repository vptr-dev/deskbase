import { useState } from 'react'
import { updatePage } from '../store'
import type { Page, PurchaseList } from '../types'
import { today, uid } from '../lib/util'
import { Button, Segmented } from '../components/ui'
import { Icon } from '../components/Icon'

const emptyList = (): PurchaseList => ({ items: [], budget: null, currency: 'GBP' })

export function WishlistPage({ page, compact = false }: { page: Page; compact?: boolean }): JSX.Element {
  const [tab, setTab] = useState<'wishlist' | 'purchased'>('wishlist')
  const [name, setName] = useState('')
  const [cost, setCost] = useState('')
  const [budgetOpen, setBudgetOpen] = useState(false)
  const list = page.wishlist ?? emptyList()
  const bought = tab === 'purchased'
  const visible = list.items.filter(item => item.purchased === bought)
  const spent = list.items.filter(item => item.purchased).reduce((n, item) => n + (item.cost ?? 0), 0)
  const money = (amount: number): string => new Intl.NumberFormat(undefined, { style: 'currency', currency: list.currency }).format(amount)
  const change = (edit: (data: PurchaseList) => void): void => {
    updatePage(page.id, p => { p.wishlist ??= emptyList(); edit(p.wishlist) })
  }
  const add = (event: React.FormEvent): void => {
    event.preventDefault()
    if (!name.trim() || (cost && (!Number.isFinite(Number(cost)) || Number(cost) < 0))) return
    change(data => { data.items.push({ id: uid(), name: name.trim(), cost: cost ? Number(cost) : null, purchased: bought, purchasedOn: bought ? today() : undefined }) })
    setName(''); setCost('')
  }
  return <section className={'purchase-list' + (compact ? ' compact' : '')}>
    <div className="row between gap-sm wrap"><Segmented small value={tab} onChange={setTab} options={[{ value: 'wishlist', label: 'Wishlist' }, { value: 'purchased', label: 'Purchased' }]} />
      <Button small kind="ghost" icon="wallet" onClick={() => setBudgetOpen(!budgetOpen)}>Budget</Button></div>
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
    <div className="purchase-items">{visible.map(item => <div key={item.id} data-widget-item={item.name} className="purchase-item">
      <button data-item-action={bought ? 'Move to wishlist' : 'Mark purchased'} className="icon-btn" title={bought ? 'Move to wishlist' : 'Mark purchased'} aria-label={(bought ? 'Move to wishlist: ' : 'Mark purchased: ') + item.name} onClick={() => change(data => {
        const row = data.items.find(x => x.id === item.id); if (row) { row.purchased = !row.purchased; row.purchasedOn = row.purchased ? today() : undefined }
      })}><Icon name={bought ? 'square-check-big' : 'square'} size={16} /></button>
      <span className="grow">{item.name}{bought && item.purchasedOn && <small className="purchase-date muted">{item.purchasedOn}</small>}</span>{item.cost !== null && <span className="small">{money(item.cost)}</span>}
      <button className="icon-btn" aria-label={'Remove ' + item.name} onClick={() => change(data => { data.items = data.items.filter(x => x.id !== item.id) })}><Icon name="x" size={13} /></button>
    </div>)}</div>
  </section>
}
