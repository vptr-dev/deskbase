import type { TrelloAccess, TrelloBoard, TrelloEdit } from '../shared/trello'
import { boardKey, validateAccess } from '../shared/trello'

type TrelloRequest = (url: string, init: RequestInit) => Promise<Response>

const authorization = (access: TrelloAccess): string => `OAuth oauth_consumer_key="${access.key}", oauth_token="${access.token}"`

export async function readTrelloBoard(board: string, access: TrelloAccess, request: TrelloRequest): Promise<TrelloBoard> {
  if (boardKey(board) !== board || !board) throw new Error('Enter a Trello board link.')
  validateAccess(access)
  const url = new URL('https://api.trello.com/1/boards/' + board)
  url.search = new URLSearchParams({ fields: 'name', lists: 'open', list_fields: 'name,pos', cards: 'open', card_fields: 'name,idList,shortLink,due,dueComplete,pos' }).toString()
  const response = await request(url.href, {
    headers: { Authorization: authorization(access) },
    redirect: 'error', signal: AbortSignal.timeout(15000)
  })
  if (!response.ok) {
    if ([401, 403, 404].includes(response.status)) throw new Error('Check the board link and make sure the Trello account that issued the token can open it.')
    if (response.status === 429) throw new Error('Trello is limiting requests. Try refreshing in a minute.')
    throw new Error('Trello could not load the board. Try again later.')
  }
  const data = await response.json()
  if (typeof data?.name !== 'string' || !Array.isArray(data.lists) || !Array.isArray(data.cards)) throw new Error('Trello returned an incomplete board.')
  interface List { id: string; name: string; pos: number }
  interface Card extends List { idList: string; shortLink: string; due: string | null; dueComplete: boolean }
  const lists = (data.lists as List[]).sort((a, b) => a.pos - b.pos).map(({ id, name }) => ({ id, name }))
  const open = new Set(lists.map(l => l.id))
  const cards = (data.cards as Card[]).filter(c => open.has(c.idList)).sort((a, b) => a.pos - b.pos)
    .map(c => ({ id: c.id, list: c.idList, name: c.name, shortLink: /^[a-z\d]{8}$/i.test(c.shortLink) ? c.shortLink : '', due: c.due, done: !!c.dueComplete }))
  return { name: data.name, lists, cards }
}

export async function editTrelloBoard(board: string, access: TrelloAccess, edit: TrelloEdit, request: TrelloRequest): Promise<void> {
  const current = await readTrelloBoard(board, access, request)
  if (!current.lists.some(l => l.id === edit.list)) throw new Error('That list is no longer on this board. Refresh to see its current lists.')
  let path = '/cards'
  const body: { idList: string; pos: string; name?: string } = { idList: edit.list, pos: 'bottom' }
  if (edit.kind === 'create') {
    if (typeof edit.name !== 'string' || !edit.name.trim() || edit.name.trim().length > 16384) throw new Error('Enter a card title of 1 to 16,384 characters.')
    body.name = edit.name.trim()
  } else if (edit.kind === 'move') {
    const card = current.cards.find(c => c.id === edit.card)
    if (!card) throw new Error('That card is no longer on this board. Refresh to see its current cards.')
    if (card.list === edit.list) return
    path += '/' + encodeURIComponent(card.id)
  } else throw new Error('Unknown Trello action.')
  let response: Response
  try {
    response = await request('https://api.trello.com/1' + path, {
      method: edit.kind === 'create' ? 'POST' : 'PUT', headers: { Authorization: authorization(access), 'Content-Type': 'application/json' },
      body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(15000)
    })
  } catch { throw new Error('The connection ended before Trello confirmed the change. Refresh the board before trying again.') }
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Trello denied this change. Check board membership and grant a token with write access.' : 'Trello could not confirm the change. Refresh the board before trying again.')
}
