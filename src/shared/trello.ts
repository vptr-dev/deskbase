export interface TrelloAccess { key: string; token: string }
export type TrelloEdit = { kind: 'create'; list: string; name: string } | { kind: 'move'; list: string; card: string }
export interface TrelloCard { id: string; name: string; list: string; shortLink: string; due: string | null; done: boolean }
export interface TrelloBoard { name: string; lists: { id: string; name: string }[]; cards: TrelloCard[] }

export function boardKey(input: string): string | null {
  const value = input.trim()
  if (/^[a-z\d]{8}$/i.test(value)) return value
  try {
    const u = new URL(value)
    if (u.origin !== 'https://trello.com' || u.username || u.password) return null
    return /^\/b\/([a-z\d]{8})(?:\/|$)/i.exec(u.pathname)?.[1] ?? null
  } catch { return null }
}

export function validateAccess(access: TrelloAccess): void {
  if (!/^[a-z\d]{32}$/i.test(access?.key) || !/^[a-z\d_.~+=/-]{16,1024}$/i.test(access?.token)) {
    throw new Error('Enter your Trello API key and its matching token.')
  }
}
