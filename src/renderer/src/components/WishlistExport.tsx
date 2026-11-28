import { useState } from 'react'
import { api } from '../lib/api'
import { Button, Modal } from './ui'
import type { PurchaseList, WishItem } from '../types'
import { quantityWanted } from '../lib/wishlist'

const escapeHtml=(text:string)=>text.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!))

export function WishlistExport({ title, list, visible, close }: {title:string;list:PurchaseList;visible:WishItem[];close:()=>void}) {
  const [prices,setPrices]=useState(false)
  const [attachments,setAttachments]=useState(false)
  const [privateFields,setPrivateFields]=useState(false)
  const [hideGifts,setHideGifts]=useState(false)
  const [scope,setScope]=useState<'visible'|'all'>('all')
  const [status,showStatus]=useState('')
  const selection=scope==='visible'?visible:list.items
  const items=hideGifts?selection.filter(item=>!item.recipient):selection
  const rows=items.map(item=>({
    name:item.name,category:item.category || '',quantity:quantityWanted(item),purchased:item.purchased,purchasedOn:item.purchasedOn,priority:item.priority,
    ...(prices?{unitPrice:item.cost, priceHistory:item.prices || [], variants:item.variants || []}:{}),
    ...(attachments?{productLink:item.url,image:item.image,receipt:item.receipt}:{}),
    ...(privateFields?{giftRecipient:item.recipient,privateNote:item.privateNote,hideReason:item.skipReason,hideUntil:item.skipUntil}:{}),
  }))
  const bundle={
    kind:'deskbase-wishlist', title, currency:list.currency,
    fields:['name','category','quantity','purchased','purchasedOn','priority',
      ...(prices?['unitPrice','priceHistory','variants']:[]),
      ...(attachments?['productLink','image','receipt']:[]),
      ...(privateFields?['giftRecipient','privateNote','hideReason','hideUntil']:[])],
    categories:(list.categories || []).map(({name,color,archived})=>({name,color,archived})),items:rows
  }
  async function save(printable:boolean):Promise<void> {
    const name=title.replace(/[^a-z0-9 _-]/gi,'').trim() || 'Wishlist'
    const file=printable?name+'-shortlist.html':name+'.json'
    const content=printable?
      '<!doctype html><html lang="en"><meta charset="UTF-8"><title>Gift shortlist</title><style>body{font:16px system-ui;margin:3rem}li{margin:.6rem 0}@media print{body{margin:1rem}}</style><h1>Gift shortlist</h1><ul>'+items.map(item=>'<li>'+escapeHtml(item.name)+' × '+quantityWanted(item)+'</li>').join('')+'</ul></html>':
      JSON.stringify(bundle,null,2)
    try { const saved=await api.exportFile(content,file);if(saved)showStatus('Saved '+file) }
    catch { showStatus('Could not save the export.') }
  }
  return <Modal title="Wishlist export preview" width={600} onClose={close}>
    <div className="modal-body doc-tool-dialog">
      <label>Items<select className="input" value={scope} onChange={e=>setScope(e.target.value==='visible'?'visible':'all')}><option value="all">Whole wishlist</option><option value="visible">Current filtered view</option></select></label>
      <div className="row gap-sm wrap">
        <label><input type="checkbox" checked={hideGifts} onChange={e=>setHideGifts(e.target.checked)}/> Hide gifts</label>
        <label><input type="checkbox" checked={prices} onChange={e=>setPrices(e.target.checked)}/> Include prices</label>
        <label><input type="checkbox" checked={attachments} onChange={e=>setAttachments(e.target.checked)}/> Include links, images and receipts</label>
        <label><input type="checkbox" checked={privateFields} onChange={e=>setPrivateFields(e.target.checked)}/> Include recipients and private notes</label>
      </div>
      <p>{items.length} items · {bundle.fields.join(', ')}</p>
      <ol className="wishlist-export-items">{rows.map((item,index)=><li key={index}>
        {item.name} × {item.quantity}{item.category && ' · '+item.category}{privateFields && item.giftRecipient && ' · '+item.giftRecipient}
      </li>)}</ol>
      <div className="row wrap gap-sm"><Button kind="primary" onClick={()=>void save(false)}>Export wishlist JSON</Button>
        <Button onClick={()=>void save(true)}>Save printable gift shortlist</Button></div>
      {status && <p role="status">{status}</p>}
    </div>
  </Modal>
}
