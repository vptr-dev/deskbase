const assert = require('node:assert/strict')
const Module = require('node:module')
const esbuild = require('esbuild')

async function test() {
  const built = await esbuild.build({
    stdin: {
      contents: "export * from './src/renderer/src/lib/household'; export * from './src/renderer/src/lib/habits'",
      resolveDir: process.cwd()
    },
    bundle:true, write:false, platform:'node', format:'cjs'
  })
  const entry = new Module('household-qa',module)
  entry._compile(built.outputFiles[0].text,'household-qa.cjs')
  const {normalizeHousehold,recipeIngredients,shoppingForWeek,habitDueToday,habitWeekCount,habitWeekMet}=entry.exports

  const data=normalizeHousehold({
    recipes:[{id:'pasta',name:'Pasta',servings:2,ingredients:recipeIngredients('400,g,Pasta,Dry goods\n2,,Tomato,Produce')}],
    stock:[
      {id:'tomatoes',name:'tomato',unit:'',quantity:1,expires:'2026-11-24'},
      {id:'expired',name:'tomato',unit:'',quantity:5,expires:'2026-11-21'}
    ],
    meals:[
      {id:'batch',recipe:'pasta',date:'2026-11-23',servings:2},
      {id:'later',recipe:'pasta',date:'2026-11-28',servings:2,leftoversFrom:'batch'}
    ]
  })
  assert.deepEqual(shoppingForWeek(data,'2026-11-23').map(({name,quantity})=>[name,quantity]),[['Pasta',800],['Tomato',3]])
  assert.equal(data.stock[0].quantity,1)

  const habit={kind:'good',period:'week',target:3,log:{'2026-11-23':1,'2026-11-24':2,'2026-11-28':1},pauses:[{from:'2026-11-24',until:'2026-11-27'}]}
  assert.equal(habitDueToday(habit,'2026-11-24'),false)
  assert.equal(habitWeekCount(habit,'2026-11-28'),2)
  assert.equal(habitWeekMet(habit,'2026-11-28'),false)
  habit.log['2026-11-29']=1
  assert.equal(habitWeekMet(habit,'2026-11-28'),true)
  console.log('Recipe scaling, pantry consumption, leftover batches and habit pauses passed.')
}
test().catch(error=>{console.error(error);process.exitCode=1})
