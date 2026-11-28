import { diffDays } from './util'
import type { CalEvent } from './connections'
import type { Task } from '../types'

export interface TimeRange { start:number; end:number }
export function minuteOf(clock?:string|null):number|null {
  if (!clock || !/^([01]\d|2[0-3]):[0-5]\d$/.test(clock)) return null
  return Number(clock.slice(0,2))*60+Number(clock.slice(3))
}

export const timeLabel = (minutes:number):string =>
  String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0')

export function eventRange(event:CalEvent, date:string, travel=0):TimeRange|null {
  if(event.conn==='countdown')return null
  if(event.allDay)return {start:0,end:1440}
  const start=date===event.start?minuteOf(event.time)??0:0
  const rawEnd=minuteOf(event.endTime)
  const end=(event.end && event.end>date) || (rawEnd===0 && start>0) ? 1440 : rawEnd ?? start
  return {start:Math.max(0,start-travel),end:Math.min(1440,Math.max(start,end))}
}

export function conflictingEvents(events:CalEvent[], date:string):Set<CalEvent> {
  const timed=events.filter(e=>!e.allDay).map(event=>({event, range:eventRange(event,date)}))
  const conflicts=new Set<CalEvent>()
  for(let i=0;i<timed.length;i++) {
    const a=timed[i]
    if(!a.range)continue
    for(const b of timed.slice(i+1)) {
      if(b.range && a.range.start < b.range.end && b.range.start < a.range.end) {
        conflicts.add(a.event);conflicts.add(b.event)
      }
    }
  }
  return conflicts
}

export function freeRanges(planned:Task[], events:CalEvent[], date:string, window:TimeRange, travel:Record<string,number>):TimeRange[] {
  const busy=events.flatMap(e=>{
    const range=eventRange(e,date,travel[e.location?.trim().toLowerCase() || ''] || 0)
    return range?[range]:[]
  })
  for(const task of planned) {
    const start=minuteOf(task.time)
    if(!task.done && start!==null && task.estimate && task.estimate>0)busy.push({start,end:start+task.estimate})
  }
  let start=window.start
  const free:TimeRange[]=[]
  for(const slot of busy.sort((a,b)=>a.start-b.start)) {
    if(slot.end<=start || slot.start>=window.end)continue
    if(slot.start>start)free.push({start,end:slot.start})
    start=Math.max(start,slot.end)
  }
  if(start<window.end)free.push({start,end:window.end})
  return free
}

export function locationTravel(text:string):Record<string,number> {
  return Object.fromEntries(text.split('\n').flatMap(line=>{
    const match=line.match(/^(.+?)\s*=\s*(\d{1,3})\s*$/)
    return match && Number(match[2])<=240 ? [[match[1].trim().toLowerCase(),Number(match[2])]] : []
  }))
}

export function sourceTime(event:CalEvent):string {
  if(!event.zone || event.allDay)return ''
  try {
    return new Intl.DateTimeFormat(undefined,{timeZone:event.zone,hour:'2-digit',minute:'2-digit',timeZoneName:'short'}).format(event.at)
  } catch {return ''}
}

export function timetableWeek(day:string, anchor:string, pattern:string):string {
  const weeks=pattern.split('\n').map(line=>line.trim()).filter(Boolean)
  if (!anchor || !weeks.length) return ''
  const number=Math.floor(diffDays(day,anchor)/7)
  return weeks[(number%weeks.length+weeks.length)%weeks.length] || ''
}
