import { createContext, useContext } from 'react'
import { useData } from '../store'
import type { AppData } from '../types'

export const WidgetScope = createContext<AppData | null>(null)
export function useWidgetData<T>(select: (d:AppData)=>T): T {
  const scoped=useContext(WidgetScope)
  return useData(d=>select(scoped ?? d))
}
export function scopedData(d:AppData,ids:string[]):AppData {
  const selected=new Set(ids.filter(id=>d.pages[id]&&!d.pages[id].deletedAt))
  for(const id of ids){const page=d.pages[id];if(page?.type==='calendar'&&!page.deletedAt){for(const source of page.view?.sourceIds??Object.keys(d.pages))if(d.pages[source]&&!d.pages[source].deletedAt)selected.add(source)}}
  function matching<T extends {pageId:string}>(items:Record<string,T>):Record<string,T> {
    return Object.fromEntries(Object.entries(items).filter(([,v])=>selected.has(v.pageId)))
  }
  return {...d, pages:Object.fromEntries(Object.entries(d.pages).filter(([,v])=>!v.deletedAt&&(selected.has(v.id)||selected.has(v.rowOf??'')))),
    tasks:matching(d.tasks),habits:matching(d.habits),goals:matching(d.goals),metrics:matching(d.metrics),journal:matching(d.journal),focus:[],countdowns:[]}
}
