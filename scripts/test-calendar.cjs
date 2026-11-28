const assert = require('node:assert/strict')
const Module = require('node:module')
const esbuild = require('esbuild')

async function test() {
  const built = await esbuild.build({
    stdin: {
      contents: "export * from './src/renderer/src/lib/recurrence'; export * from './src/renderer/src/lib/calendarPlanning'; export { parseIcs } from './src/shared/feeds'",
      resolveDir: process.cwd()
    },
    bundle: true, write: false, platform: 'node', format: 'cjs'
  })
  const entry = new Module('calendar-qa', module)
  entry._compile(built.outputFiles[0].text, 'calendar-qa.cjs')
  const { normalizeRepeat, occurrence, nextTaskDate, freeRanges, parseIcs, timetableWeek } = entry.exports

  const rule = normalizeRepeat({
    start:'2026-11-23', interval:2, unit:'day', weekStart:1, days:[1],
    excludedDates:['2026-11-25','2026-11-25','2026-02-30'], rotation:['Rae','Rae','Tom']
  })
  assert.deepEqual(rule.excludedDates,['2026-11-25'])
  assert.deepEqual(rule.rotation,['Rae','Tom'])
  assert.equal(occurrence(rule,'2026-11-24'),'2026-11-27')
  assert.equal(nextTaskDate({...rule, afterCompletion:true},'2026-11-23','2026-11-26'),'2026-11-28')
  assert.equal(nextTaskDate('weekly','2026-11-23','2026-11-25'),'2026-11-30')
  assert.equal(nextTaskDate({...rule,remaining:1},'2026-11-23','2026-11-23'),null)

  const {events,cancelledEvents} = parseIcs([
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT','UID:one','SUMMARY:Lecture','DTSTART;TZID=Europe/London:20261025T100000',
    'DTEND;TZID=Europe/London:20261025T113000','LOCATION:Campus','END:VEVENT',
    'BEGIN:VEVENT','UID:two','SUMMARY:Review','DTSTART:20261025T120000Z',
    'STATUS:CANCELLED','DESCRIPTION:Bring the first draft','END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n'),Date.UTC(2026,9,24),Date.UTC(2026,9,27))
  assert.equal(events.length,1)
  assert.equal(events[0].zone,'Europe/London')
  assert.equal(events[0].at,Date.UTC(2026,9,25,10))
  assert.equal(cancelledEvents[0].notes,'Bring the first draft')
  assert.equal(timetableWeek('2026-11-30','2026-11-23','Week A\nWeek B'),'Week B')
  assert.deepEqual(freeRanges(
    [{time:'13:00',estimate:45,done:false}],
    [{start:'2026-11-28',time:'10:00',endTime:'11:30',location:'Campus',allDay:false}],
    '2026-11-28',{start:540,end:1020},{campus:20}
  ),[{start:540,end:580},{start:690,end:780},{start:825,end:1020}])
  console.log('Calendar date, time-zone and recurrence checks passed.')
}
test().catch(error=>{console.error(error);process.exitCode=1})
