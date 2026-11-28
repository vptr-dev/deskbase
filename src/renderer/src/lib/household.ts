import type { HouseholdData, Ingredient, MealSlot } from '../types'
import { validDay } from './recurrence'
import { addDays } from './util'

function positive(value: unknown): value is number {
  return typeof value==='number' && Number.isFinite(value) && value>0
}

function usableIngredient(item: Ingredient): boolean {
  return !!item && typeof item.name==='string' && typeof item.unit==='string' && positive(item.quantity)
}

export function normalizeHousehold(raw: HouseholdData | undefined): HouseholdData {
  const routine=raw?.routine
  const care=raw?.care
  const list=<T,>(value: T[] | undefined):T[]=>Array.isArray(value)?value.filter(Boolean):[]
  return {
    ...(routine ? {routine:{
      containers:list(routine.containers).filter(c=>typeof c.name==='string'&&typeof c.id==='string'&&positive(c.volume)&&(c.unit==='ml'||c.unit==='fl oz')),
      fields:list(routine.fields).filter(f=>typeof f.name==='string'&&typeof f.id==='string').map(f=>({...f,goals:f.goals&&typeof f.goals==='object'?f.goals:{}})),
      checkins:list(routine.checkins).filter(c=>validDay(c.day)&&typeof c.time==='string'&&['workday','rest','holiday'].includes(c.kind)).map(c=>({
        ...c,water:Number.isFinite(c.water)?Math.max(0,c.water):0,notes:typeof c.notes==='string'?c.notes:'',values:c.values&&typeof c.values==='object'?c.values:{}
      })),
      breaks:list(routine.breaks).filter(b=>typeof b.name==='string'&&typeof b.id==='string'&&positive(b.minutes))
    }} : {}),
    ...(care ? {care:{
      meters:list(care.meters).filter(m=>typeof m.name==='string'&&typeof m.id==='string'&&validDay(m.date)&&Number.isFinite(m.value)),
      plants:list(care.plants).filter(p=>typeof p.name==='string'&&typeof p.id==='string'),
      seasonal:list(care.seasonal).filter(s=>typeof s.name==='string'&&typeof s.id==='string'&&/^\d{2}-\d{2}$/.test(s.monthDay)),
      pets:list(care.pets).filter(p=>typeof p.name==='string'&&typeof p.id==='string'&&typeof p.instructions==='string'),
      bin:care.bin&&validDay(care.bin.anchor)&&Number.isInteger(care.bin.every)&&care.bin.every>0?care.bin:undefined,
      binExceptions:list(care.binExceptions).filter(e=>validDay(e.from)&&validDay(e.to))
    }} : {}),
    recipes:(Array.isArray(raw?.recipes)?raw.recipes:[]).filter(r=>r && typeof r.id==='string' && typeof r.name==='string').map(r=>({
      ...r, servings:positive(r.servings)?r.servings:1,
      ingredients:(Array.isArray(r.ingredients)?r.ingredients:[]).filter(usableIngredient),
      substitutions:(Array.isArray(r.substitutions)?r.substitutions:[]).filter(s=>s && typeof s.text==='string')
    })),
    meals:(Array.isArray(raw?.meals)?raw.meals:[]).filter(m=>m && typeof m.id==='string' && validDay(m.date) && typeof m.recipe==='string' && positive(m.servings)),
    stock:(Array.isArray(raw?.stock)?raw.stock:[]).filter(s=>s && typeof s.id==='string' && (usableIngredient(s) || (typeof s.name==='string'&&typeof s.unit==='string'&&s.quantity===0))),
    receipts:(Array.isArray(raw?.receipts)?raw.receipts:[]).filter(r=>r && typeof r.id==='string' && typeof r.lines==='string' && validDay(r.date)).map(r=>({
      ...r,image:typeof r.image==='string' && /^data:image\//.test(r.image)?r.image:undefined
    })),
    shops:(Array.isArray(raw?.shops)?raw.shops:[]).filter(s=>s && typeof s.id==='string' && typeof s.name==='string').map(s=>({
      ...s,aisles:(Array.isArray(s.aisles)?s.aisles:[]).filter(a=>typeof a==='string')
    }))
  }
}

export function recipeIngredients(text:string):Ingredient[] {
  return text.split('\n').flatMap(line=>{
    const [rawQuantity,unit,name,aisle] = line.split(',').map(s=>s.trim())
    const quantity=Number(rawQuantity)
    return name && positive(quantity)?[{name,quantity,unit,aisle}]:[]
  })
}

export const ingredientKey=(item:Ingredient):string=>item.name.trim().toLowerCase()+'\x1f'+item.unit.trim().toLowerCase()

export function shoppingForWeek(data:HouseholdData,start:string):Ingredient[] {
  const requirements=new Map<string,Ingredient>()
  const recipes=new Map(data.recipes.map(recipe=>[recipe.id,recipe]))
  const weekEnd=addDays(start,6)
  const batchSizes=new Map<string,number>()
  for(const meal of data.meals) if(meal.leftoversFrom){
    batchSizes.set(meal.leftoversFrom,(batchSizes.get(meal.leftoversFrom) || 0)+meal.servings)
  }
  const stock=data.stock.filter(item=>!item.drawer && (!item.expires || item.expires>=start))
    .sort((a,b)=>(a.expires || '9999').localeCompare(b.expires || '9999'))
    .map(item=>({...item}))
  const meals=data.meals.filter(m=>m.date>=start && m.date<=weekEnd && !m.leftoversFrom && !m.frozenItem).sort((a,b)=>a.date.localeCompare(b.date))
  for(const meal of meals) {
    const recipe=recipes.get(meal.recipe)
    if(!recipe)continue
    for(const item of recipe.ingredients) {
      const key=ingredientKey(item)
      let quantity=item.quantity*(meal.servings+(batchSizes.get(meal.id) || 0))/recipe.servings
      for(const lot of stock) {
        if(ingredientKey(lot)!==key || (lot.expires && lot.expires<meal.date))continue
        const used=Math.min(lot.quantity,quantity)
        lot.quantity-=used;quantity-=used
        if(!quantity)break
      }
      if(quantity>0.00001)requirements.set(key,{...item,quantity:(requirements.get(key)?.quantity || 0)+quantity})
    }
  }
  return Array.from(requirements.values())
}

export function newMealSource(meal:MealSlot, original:MealSlot|undefined): MealSlot {
  return {...meal,recipe:original?.recipe || meal.recipe,leftoversFrom:original?.id,frozenItem:original?undefined:meal.frozenItem}
}
