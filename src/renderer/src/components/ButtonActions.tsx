import { batchButtonEdits, addTask, getData, toast, updatePage, useData } from '../store'
import type { Block, ButtonAction } from '../types'
import { api } from '../lib/api'
import { openFromClick } from '../lib/tabs'
import { today, uid } from '../lib/util'
import { adjustValue, setValueTo } from './Values'

export const defaultAction: ButtonAction = { kind: 'todos', target: '' }
const labels: Record<ButtonAction['kind'], string> = {
  purchase: 'Mark item purchased', expense: 'Record purchase in a page', todos: 'Insert to-dos', link: 'Open link', page: 'Open page', toggle: 'Show or hide a section',
  addValue: 'Change a value', setValue: 'Set a value', task: 'Create a task'
}

export function* buttonTargets(blocks: Block[]): Generator<Block> {
  for (const block of blocks) {
    yield block
    for (const column of block.cols ?? []) yield* buttonTargets(column)
  }
}

function ActionFields({ action, onChange, localTodos = false }: {
  action: ButtonAction; onChange: (action: ButtonAction) => void; localTodos?: boolean
}): JSX.Element {
  const data = useData(d => d)
  const a = action
  const pages = Object.values(data.pages).filter(p => !p.deletedAt)
  const page = pages.find(p => p.id === a.pageId)
  const set = (patch: Partial<ButtonAction>): void => onChange({ ...a, ...patch })
  const valueAction = a.kind === 'addValue' || a.kind === 'setValue'
  const needsPage = a.kind === 'page' || a.kind === 'toggle' || a.kind === 'task' || a.kind === 'purchase' || a.kind === 'expense' || (a.kind === 'todos' && !localTodos)
  const options = pages.filter(p => a.kind === 'purchase' ? p.type === 'wishlist' : a.kind === 'expense' ? p.type === 'doc' : a.kind === 'task' ? ['tasks','board','project'].includes(p.type) : a.kind === 'todos' ? p.type === 'doc' : true)
  return <div className="action-fields">
    <label>Action<select className="input input-sm" value={a.kind} onChange={e => onChange({ kind: e.target.value as ButtonAction['kind'], target: '' })}>
      {Object.entries(labels).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select></label>
    {needsPage && <label>Page<select className="input input-sm" value={a.kind === 'page' ? a.target : a.pageId ?? ''} onChange={e => a.kind === 'page' ? set({ target: e.target.value }) : set({ pageId: e.target.value, ...(a.kind === 'toggle' ? { target: '' } : {}) })}>
      <option value="">Choose a page</option>{options.map(p => <option key={p.id} value={p.id}>{p.title || 'Untitled'}</option>)}</select></label>}
    {a.kind === 'purchase' && page && <label>Wishlist item<select className="input input-sm" value={a.target} onChange={e => set({ target: e.target.value })}><option value="">Choose an item</option>{page.wishlist?.items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>}
    {a.kind === 'expense' && <span className="small muted">Records the date, item and price from an earlier purchase step.</span>}
    {a.kind === 'addValue' && <label><input type="checkbox" checked={!!a.usePurchasePrice} onChange={e => set({usePurchasePrice: e.target.checked})} /> Deduct the price from an earlier purchase step</label>}
    {a.kind === 'toggle' && page && <label>Section<select className="input input-sm" value={a.target} onChange={e => set({ target: e.target.value })}><option value="">Choose a toggle</option>
      {Array.from(buttonTargets(page.blocks)).filter(b => b.type.startsWith('toggle')).map(b => <option key={b.id} value={b.id}>{b.text || 'Untitled toggle'}</option>)}</select></label>}
    {valueAction && <>
      <label>Value<select className="input input-sm" value={a.target} onChange={e => set({ target: e.target.value })}><option value="">Choose a value</option>
        {Object.values(data.values).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
      {!a.usePurchasePrice && <label>{a.kind === 'addValue' ? 'Change by' : 'Set to'}<input className="input input-sm" type="number" step="any" value={a.amount ?? ''} placeholder={a.kind === 'addValue' ? '1' : '0'} onChange={e => set({ amount: Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : undefined })} /></label>}
    </>}
    {a.kind === 'link' && <label>Address<input className="input input-sm" value={a.target} placeholder="Website, app or folder" onChange={e => set({ target: e.target.value })} /></label>}
    {a.kind === 'todos' && <label>To-dos, one per line<textarea className="input input-sm" value={a.target} onChange={e => set({ target: e.target.value })} /></label>}
    {a.kind === 'task' && <label>Task name<input className="input input-sm" value={a.title ?? ''} onChange={e => set({ title: e.target.value })} /></label>}
  </div>
}

export function ButtonActionFields({ action, onChange, localTodos }: {
  action: ButtonAction; onChange: (a: ButtonAction) => void; localTodos?: boolean
}): JSX.Element {
  const { then = [], ...first } = action
  const steps = [first, ...then]
  const save = (next: ButtonAction[]): void => onChange({ ...next[0], then: next.slice(1) })
  return <div className="action-fields">{steps.map((step, i) => <div className="action-step" key={i}>
    {steps.length > 1 && <div className="row gap-xs"><strong className="small grow">Step {i + 1}</strong>
      <button className="chip-btn" disabled={!i} onClick={() => { const next = [...steps]; [next[i-1], next[i]] = [step, next[i-1]]; save(next) }}>Move up</button>
      <button className="chip-btn" onClick={() => save(steps.filter((_, n) => n !== i))}>Remove</button></div>}
    <ActionFields localTodos={localTodos} action={step} onChange={a => save(steps.map((old,n) => n === i ? a : old))} />
  </div>)}<button type="button" className="btn btn-sm" onClick={() => save([...steps, { kind: 'task', target: '' }])}>Add step</button></div>
}

export function runButtonAction(a: ButtonAction, event: React.MouseEvent, addTodos?: (lines: string[]) => void): void {
  const afterCommit: (() => void)[] = []
  let purchase: { name: string; price: number | null; currency: string } | undefined
  let index = 0
  const apply = (a: ButtonAction): void => {
  const data = getData()
  const page = data.pages[a.kind === 'page' ? a.target : a.pageId ?? '']
  const missing = (): never => { throw new Error('Choose a valid target in the button settings.') }
  switch (a.kind) {
    case 'link': if (a.target) afterCommit.push(() => { void api.launch(a.target) }); else missing(); break
    case 'page': if (page && !page.deletedAt) afterCommit.push(() => openFromClick(a.target, event)); else missing(); break
    case 'todos': {
      const lines = (a.target || 'To-do').split('\n').map(s => s.trim()).filter(Boolean)
      if (addTodos) addTodos(lines)
      else if (page && !page.deletedAt) updatePage(page.id, p => { p.blocks.push(...lines.map(text => ({ id: uid(), type: 'todo' as const, text }))) })
      else missing()
      break
    }
    case 'purchase': {
      const item = page?.wishlist?.items.find(i => i.id === a.target)
      if (!page || page.deletedAt || !item) return missing()
      if (item.purchased) throw new Error('This item was already purchased.')
      purchase = { name: item.name, price: item.cost, currency: page.wishlist!.currency }
      updatePage(page.id, p => { const row = p.wishlist!.items.find(i => i.id === a.target)!; row.purchased = true; row.purchasedOn = today() })
      break
    }
    case 'expense': {
      if (!purchase) throw new Error('Add a purchase step first.')
      if (!page || page.deletedAt || page.type !== 'doc') return missing()
      const price = purchase.price === null ? '' : ' - ' + new Intl.NumberFormat(undefined, {style: 'currency', currency: purchase.currency}).format(purchase.price)
      const text = today() + ' - ' + purchase.name + price
      updatePage(page.id, p => { p.blocks.push({ id: uid(), type: 'bullet', text }) })
      break
    }
    case 'task':
      if (page && !page.deletedAt && a.title?.trim()) addTask(page.id, { title: a.title.trim() }); else missing()
      break
    case 'toggle':
      if (!page || page.deletedAt || !Array.from(buttonTargets(page.blocks)).some(b => b.id === a.target && b.type.startsWith('toggle'))) { missing(); break }
      updatePage(page.id, p => { const b = Array.from(buttonTargets(p.blocks)).find(x => x.id === a.target); if (b) b.open = !b.open })
      break
    case 'addValue': case 'setValue': {
      if (a.usePurchasePrice && purchase?.price == null) throw new Error('Choose a priced wishlist item in an earlier step.')
      const n = a.usePurchasePrice ? -purchase!.price! : a.amount ?? (a.kind === 'addValue' ? 1 : 0)
      if (!data.values[a.target] || !Number.isFinite(n)) { missing(); break }
      if (a.kind === 'addValue') adjustValue(a.target, n, 'Button')
      else setValueTo(a.target, n)
      break
    }
  }
  }
  try {
    batchButtonEdits(() => {
      for (const step of [a, ...(a.then ?? [])]) { index++; apply(step) }
    })
  } catch (error) {
    toast('Step ' + index + ': ' + (error instanceof Error ? error.message : 'Could not complete the action.'))
    return
  }
  for (const run of afterCommit) run()
  if (a.then?.length) toast('Button completed', { undo: true })
}
