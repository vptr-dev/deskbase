import { useData } from '../store'
import { useState } from 'react'
import type { WishItem } from '../types'
import { pickImageData } from '../lib/image'
import { availableSavings, quantityWanted, quantityPurchased } from '../lib/wishlist'
import { today, uid } from '../lib/util'
import { Button, Sparkline } from './ui'

export function WishlistItemDetails({item,edit,pageId,currency}:{item:WishItem;pageId:string;currency:string;edit:(fn:(previous:WishItem)=>WishItem)=>void}){
  const data=useData(d=>d)
  const savings=Object.values(data.values).filter(v=>v.reset==='never' && v.unit.trim().toUpperCase()===currency)
  const available=item.savingsId?availableSavings(data,item.savingsId,pageId,item.id,currency):0
  const [price,setPrice]=useState('')
  const [date,setDate]=useState(today)
  const quantity=quantityWanted(item)
  const bought=quantityPurchased(item)
  const prices=item.prices || []
  const variants=item.variants || []
  const update=(fields:Partial<WishItem>)=>edit(old=>({...old,...fields}))
  return <details className="wish-category-settings"><summary>Purchase details and comparisons</summary>
    <div className="purchase-budget">
      <label>Quantity wanted<input className="input input-sm" type="number" min="1" max="9999" value={quantity} onChange={e=>{
        const next=Math.min(9999,Math.max(1,Math.trunc(e.target.valueAsNumber || 1)))
        update({quantity:next,boughtQuantity:Math.min(next,bought),purchased:bought>=next})
      }}/></label>
      <label>Quantity bought<input className="input input-sm" type="number" min="0" max={quantity} value={bought} onChange={e=>{
        const next=Math.max(0,Math.min(quantity,Math.trunc(e.target.valueAsNumber || 0)))
        update({boughtQuantity:next,purchased:next>=quantity,purchasedOn:next? item.purchasedOn || today():undefined})
      }}/></label>
      <label>Order status<select className="input input-sm" value={item.preorder?'preorder':'regular'} onChange={e=>update({preorder:e.target.value==='preorder'})}><option value="regular">Regular purchase</option><option value="preorder">Preorder</option></select></label>
    </div>
    <div className="purchase-budget">
      <label>Return by<input className="input input-sm" type="date" value={item.returnBy || ''} onChange={e=>update({returnBy:e.target.value||undefined})}/></label>
      <label>Warranty ends<input className="input input-sm" type="date" value={item.warrantyUntil || ''} onChange={e=>update({warrantyUntil:e.target.value||undefined})}/></label>
      <div><Button small onClick={async()=>{const receipt=await pickImageData(1200,1200);if(receipt)update({receipt})}}>Attach receipt image</Button>
        {item.receipt && <img className="wish-receipt" src={item.receipt} alt="Purchase receipt"/>}</div>
    </div>
    <div className="purchase-budget"><label>Gift recipient<input className="input input-sm" value={item.recipient || ''} onChange={e=>update({recipient:e.target.value})}/></label>
      <label>Private note<textarea className="input input-sm" value={item.privateNote || ''} onChange={e=>update({privateNote:e.target.value})}/></label>
      <label>Hide until<input className="input input-sm" type="date" value={item.skipUntil || ''} onChange={e=>update({skipUntil:e.target.value||undefined})}/></label>
      <label>Reason for hiding<input className="input input-sm" value={item.skipReason || ''} onChange={e=>update({skipReason:e.target.value})}/></label>
    </div>
    {!!savings.length && <div className="purchase-budget"><label>Savings source<select className="input input-sm" value={item.savingsId || ''} onChange={e=>update({savingsId:e.target.value || undefined,earmarked:0})}>
      <option value="">None</option>{savings.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}
    </select></label>
      {item.savingsId && <label>Set aside ({available} {currency} available)<input className="input input-sm" type="number" min="0" max={available} step="0.01" value={item.earmarked ?? ''}
        onChange={e=>update({earmarked:Number.isFinite(e.target.valueAsNumber)?Math.max(0,e.target.valueAsNumber):0})}/></label>}
    </div>}
    <h4>Variants</h4>
    <div className="wish-variant-table"><table><thead><tr><th>Shop</th><th>Size</th><th>Colour</th><th>Price</th><th></th></tr></thead><tbody>
      {variants.map((v,i)=><tr key={v.id}>{(['shop','size','color','price'] as const).map(key=><td key={key}><input className="input input-sm" aria-label={'Variant '+(i+1)+' '+key} type={key==='price'?'number':'text'} min="0" step="any" value={v[key] ?? ''} onChange={e=>{
        const value=key==='price'?(e.target.value===''?null:Math.max(0,Number(e.target.value)||0)):e.target.value
        update({variants:variants.map(row=>row.id===v.id?{...row,[key]:value}:row)})
      }}/></td>)}<td><Button small title={'Remove variant '+(i+1)} onClick={()=>update({variants:variants.filter(row=>row.id!==v.id)})}>Remove</Button></td></tr>)}
    </tbody></table></div>
    <Button small onClick={()=>update({variants:[...variants,{id:uid(),shop:'',size:'',color:'',price:null}]})}>Add variant</Button>
    <h4>Price history</h4>
    {prices.length>0 && <><Sparkline values={prices.map(p=>p.amount)}/><ul className="wish-price-history">{prices.map(p=><li key={p.date}>{p.date} · {p.amount}</li>)}</ul></>}
    <div className="row gap-xs wrap"><input className="input input-sm" type="date" aria-label="Price observation date" value={date} onChange={e=>setDate(e.target.value)}/>
      <input className="input input-sm" type="number" min="0" step="any" aria-label="Observed price" value={price} onChange={e=>setPrice(e.target.value)}/>
      <Button small disabled={!date || !price || !Number.isFinite(Number(price)) || Number(price)<0} onClick={()=>{
        update({prices:[...prices.filter(p=>p.date!==date),{date,amount:Number(price)}].sort((a,b)=>a.date.localeCompare(b.date))});setPrice('')
      }}>Record price</Button>
    </div>
  </details>
}
