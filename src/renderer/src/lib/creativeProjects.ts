import type { DbProp, Page } from '../types'
import { newPage } from './defaults'
import { uid } from './util'

const registers = {
  'Shot list': ['Location', 'Framing', 'Props'],
  'Game asset register': ['Asset type', 'Source file', 'Concept art'],
  'Scene board': ['Character', 'Location', 'Point of view']
} as const
export const creativeNames = [...Object.keys(registers), 'Mood board', 'Reference sheet', 'Sketch practice', 'Draft comparison', 'Experiments', 'Voice ideas'] as const

export function creativeProject(kind: string, title: string, parentId: string | null): { page: Page; source?: Page } {
  const page = newPage('doc', title.trim() || kind, parentId)
  page.icon = 'palette'
  if (Object.hasOwn(registers, kind)) {
    const source = newPage('database', page.title, page.id)
    const db = source.db!
    const status = db.props[0]
    const fields: DbProp[] = registers[kind as keyof typeof registers].map(name=>({id:uid(),name,type:name==='Source file' || name==='Concept art' ? 'url' : 'text'}))
    db.props = [status, ...fields]
    db.views.push({id:uid(),name:'By status',type:'board',groupBy:status.id,cardProps:fields.map(f=>f.id)})
    page.children.push(source.id)
    page.blocks.unshift({id:uid(),type:'database',text:'',ref:source.id})
    return { page, source }
  }
  page.blocks.unshift({id:uid(),type:'studio',text:'',style:kind,entries:[]})
  return { page }
}
