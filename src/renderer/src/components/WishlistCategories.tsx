import { useState } from 'react'
import type { PurchaseList, WishCategory, WishlistFilter } from '../types'
import { moveWishlistCategory } from '../lib/wishlist'
import { uid } from '../lib/util'
import { Button } from './ui'

export function WishlistCategories({ categories, change, selected, onSelect }: {
  categories: WishCategory[]
  change: (edit:(data:PurchaseList)=>void)=>void
  selected: string
  onSelect:(id:string)=>void
}) {
  const [newName,setNewName]=useState('')
  const [editing,setEditing]=useState('')
  const [draft,setDraft]=useState('')
  const [merge,setMerge]=useState('')
  const [error,setError]=useState('')
  const editingCategory=categories.find(c=>c.id===editing)
  const alreadyUsed=(name:string, except?:string):boolean=>categories.some(c=>c.id!==except && c.name.toLowerCase()===name.toLowerCase())
  function addCategory():void {
    const name=newName.trim()
    if(!name)return
    if(alreadyUsed(name)){setError('A category already has that name.');return}
    const category={id:uid(),name}
    change(list=>{(list.categories ??=[]).push(category)})
    setNewName('');setError('');onSelect(category.id)
  }
  function rename():void {
    const name=draft.trim()
    if(!name || !editingCategory)return
    if(alreadyUsed(name,editing)){setError('A category already has that name.');return}
    change(list=>{
      const category=list.categories?.find(c=>c.id===editing)
      if(!category)return
      for (const item of [...list.items,...(list.trash ?? []).map(t=>t.item)])if(item.category===category.name)item.category=name
      category.name=name
    })
    setError('')
  }
  return <details className="wish-category-settings"><summary>Manage categories</summary>
    <form className="row gap-xs wrap" onSubmit={e=>{e.preventDefault();addCategory()}}>
      <input className="input input-sm" aria-label="New category name" placeholder="Category name" value={newName} onChange={e=>setNewName(e.target.value)} />
      <Button small type="submit" disabled={!newName.trim()}>Add category</Button>
    </form>
    {!!categories.length && <select className="input input-sm" aria-label="Category to edit" value={editing} onChange={e=>{
      const id=e.target.value;setEditing(id);setDraft(categories.find(c=>c.id===id)?.name || '');setMerge('');setError('')
    }}><option value="">Choose category to edit</option>{categories.map(c=><option value={c.id} key={c.id}>{c.name}{c.archived?' (archived)':''}</option>)}</select>}
    {editingCategory && <>
      <form className="row gap-xs wrap" onSubmit={e=>{e.preventDefault();rename()}}>
        <input className="input input-sm" aria-label="Rename category" value={draft} onChange={e=>setDraft(e.target.value)}/>
        <Button small type="submit" disabled={!draft.trim() || draft.trim()===editingCategory.name}>Rename</Button>
        <input type="color" aria-label="Category colour" value={editingCategory.color || '#6684a4'} onChange={e=>change(list=>{
          const category=list.categories?.find(c=>c.id===editing)
          if(category)category.color=e.target.value
        })}/>
      </form>
      <div className="row gap-xs wrap">
        {[-1,1].map(offset=><Button key={offset} small disabled={categories.indexOf(editingCategory)+offset<0 || categories.indexOf(editingCategory)+offset>=categories.length} onClick={()=>change(list=>{
          if(!list.categories)return
          const at=list.categories.findIndex(c=>c.id===editing)
          if (at>=0 && at+offset>=0 && at+offset<list.categories.length) list.categories.splice(at+offset,0,list.categories.splice(at,1)[0])
        })}>{offset<0?'Move earlier':'Move later'}</Button>)}
        <Button small onClick={()=>change(list=>{const c=list.categories?.find(c=>c.id===editing);if(c)c.archived=!c.archived})}>{editingCategory.archived?'Restore category':'Archive category'}</Button>
      </div>
      {categories.length>1 && <div className="row gap-xs wrap"><select className="input input-sm" aria-label="Merge into category" value={merge} onChange={e=>setMerge(e.target.value)}>
        <option value="">Merge into another category</option>{categories.filter(c=>c.id!==editing).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
      </select><Button small disabled={!merge} onClick={()=>{change(list=>moveWishlistCategory(list,editing,merge));if(selected===editing)onSelect(merge);setEditing('');setMerge('')}}>Merge categories</Button></div>}
    </>}
    {error && <span role="alert" className="danger small">{error}</span>}
  </details>
}

export function WishlistFilters({ list,current,change,apply }: {
  list:PurchaseList; current:Omit<WishlistFilter,'id'|'name'>; change:(edit:(data:PurchaseList)=>void)=>void; apply:(view:WishlistFilter)=>void
}) {
  const [name,setName]=useState('')
  return <details className="wish-category-settings"><summary>Saved filters</summary>
    <form className="row gap-xs wrap" onSubmit={e=>{
      e.preventDefault()
      const label=name.trim()
      if(!label)return
      change(data=>{const id=data.filters?.find(v=>v.name===label)?.id || uid();data.filters=[...data.filters?.filter(v=>v.name!==label) ?? [],{...current,name:label,id}]})
      setName('')
    }}><input className="input input-sm" aria-label="Filter name" placeholder="Filter name" value={name} onChange={e=>setName(e.target.value)}/>
      <Button small type="submit" disabled={!name.trim()}>Save filter</Button></form>
    {list.filters?.map(view=><div key={view.id} className="row gap-xs"><Button small onClick={()=>apply(view)}>{view.name}</Button>
      <Button small title={'Remove filter '+view.name} onClick={()=>change(data=>{data.filters=data.filters?.filter(v=>v.id!==view.id)})}>Remove</Button></div>)}
  </details>
}
