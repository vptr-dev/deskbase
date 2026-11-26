import { createContext, useContext } from 'react'
import { useData } from '../store'
import type { AppData } from '../types'

export const WidgetScope = createContext<AppData | null>(null)
export function useWidgetData<T>(select: (d:AppData)=>T): T {
  const scoped=useContext(WidgetScope)
  return useData(d=>select(scoped ?? d))
}
export function scopedData(d:AppData,id:string):AppData {
  const p=d.pages[id]
  function matching<T extends {pageId:string}>(items:Record<string,T>):Record<string,T> {
    return Object.fromEntries(Object.entries(items).filter(([,v])=>p&&!p.deletedAt&&v.pageId===id))
  }
  return {...d, pages:Object.fromEntries(Object.entries(d.pages).filter(([,v])=>!v.deletedAt&&(v.id===id||v.rowOf===id))),
    tasks:matching(d.tasks),habits:matching(d.habits),goals:matching(d.goals),metrics:matching(d.metrics),journal:matching(d.journal),focus:[],countdowns:[]}
}
