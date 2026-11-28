import type { AppData } from '../types'
import { valueNow } from './values'
import type { PurchaseList, WishCategory, WishItem } from '../types'

export const emptyWishlist = (): PurchaseList => ({items:[],budget:null,currency:'GBP',categories:[],filters:[],trash:[]})

export function wishlistCategories(list:PurchaseList):WishCategory[] {
  const categories=[...list.categories ?? []]
  const known=new Set(categories.map(category=>category.name))
  // Deterministic ids let older item categories be selected before the first edit.
  for(const item of [...list.items,...(list.trash ?? []).map(entry=>entry.item)]) {
    if(!item.category || known.has(item.category))continue
    known.add(item.category)
    const base='legacy:'+item.category
    let id=base
    while(categories.some(c=>c.id===id))id+=':'
    categories.push({id,name:item.category})
  }
  return categories
}

export function moveWishlistCategory(list:PurchaseList, from:string, to:string):void {
  const source=list.categories?.find(c=>c.id===from)
  const target=list.categories?.find(c=>c.id===to)
  if(!source || !target || source.id===target.id)return
  for(const item of [...list.items,...(list.trash ?? []).map(entry=>entry.item)])if(item.category===source.name)item.category=target.name
  for(const filter of list.filters ?? [])if(filter.category===source.id)filter.category=target.id
  list.categories=list.categories?.filter(c=>c.id!==from)
}

export const quantityWanted = (item:WishItem):number => item.quantity || 1
export function quantityPurchased(item:WishItem):number {
  return Math.min(quantityWanted(item),item.boughtQuantity ?? (item.purchased ? quantityWanted(item) : 0))
}
export function wishlistCost(item:WishItem, purchased:boolean):number {
  const owned=quantityPurchased(item)
  return (item.cost ?? 0)*(purchased?owned:quantityWanted(item)-owned)
}

export function availableSavings(data:AppData, id:string, ignorePage:string, ignoreItem:string, currency:string):number {
  const source=data.values[id]
  if(!source || source.reset!=='never' || source.unit.trim().toUpperCase()!==currency)return 0
  let allocated=0
  for (const page of Object.values(data.pages)) {
    if(page.deletedAt || page.template || !page.wishlist)continue
    for (const item of page.wishlist.items) {
      if(item.savingsId===id && (page.id!==ignorePage || item.id!==ignoreItem))allocated+=item.earmarked || 0
    }
  }
  return Math.max(0,Math.round((valueNow(source,data.settings.weekStart)-allocated)*100)/100)
}
