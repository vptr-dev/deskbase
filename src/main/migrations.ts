/**
 * Data schema migrations.
 *
 * Every time the shape of saved data changes, bump CURRENT_SCHEMA and add a
 * migration keyed by the version it upgrades FROM. Migrations must be pure,
 * must never throw away user content, and must tolerate partial data.
 * A backup of the file is written automatically before any migration runs.
 */

import { emojiToIcon, isEmoji } from '../shared/emoji-icons'

export const CURRENT_SCHEMA = 6

type Raw = Record<string, any>

const migrations: Record<number, (d: Raw) => Raw> = {
  // 0 -> 1: files written before versioning existed (or empty objects).
  0: (d) => ({ ...d, schema: 1 }),
  // 1 -> 2: assistant chat history (0.2.0).
  1: (d) => ({ ...d, assistant: d.assistant ?? { messages: [] } }),
  // 2 -> 3: game wishlist fields, habit weekly targets, quests, inventory, task goal links (0.3.0).
  2: (d) => {
    const games: Raw = { ...(d.games ?? {}) }
    for (const [k, g] of Object.entries(games)) {
      if (g && typeof g === 'object') games[k] = { price: '', releaseDate: null, ...g }
    }
    const habits: Raw = { ...(d.habits ?? {}) }
    for (const [k, h] of Object.entries(habits)) {
      if (h && typeof h === 'object') habits[k] = { period: 'day', dayNotes: {}, frozen: [], ...h }
    }
    return {
      ...d,
      games,
      habits,
      tasks: Object.fromEntries(Object.entries(d.tasks ?? {}).map(([k, t]: [string, any]) => [k, t && typeof t === 'object' ? { goalId: null, ...t } : t])),
      quests: d.quests ?? { date: '', list: [] },
      inventory: d.inventory ?? { freezes: 0 }
    }
  },
  // 3 -> 4: XP potions, quest reroll, countdowns, game covers and time estimates (0.4.0).
  3: (d) => {
    const games: Raw = { ...(d.games ?? {}) }
    for (const [k, g] of Object.entries(games)) {
      if (g && typeof g === 'object') games[k] = { cover: null, estimate: null, ...g }
    }
    const inv = d.inventory && typeof d.inventory === 'object' ? d.inventory : {}
    return {
      ...d,
      games,
      inventory: { freezes: 0, potions: 0, potionUntil: 0, ...inv },
      countdowns: Array.isArray(d.countdowns) ? d.countdowns : []
    }
  },
  // 4 -> 5: the game layer and game library were removed (0.5.0). Their data moves to `legacy`
  // untouched; pages of removed types become plain pages in the trash. Adds values and rules.
  4: (d) => {
    const legacy: Raw = { ...(d.legacy && typeof d.legacy === 'object' ? d.legacy : {}) }
    for (const k of ['games', 'xpLog', 'quests', 'inventory', 'rewards']) if (d[k] !== undefined) legacy[k] = d[k]
    const p: Raw = d.profile && typeof d.profile === 'object' ? d.profile : {}
    legacy.profile = { xp: p.xp, gold: p.gold, stats: p.stats, achievements: p.achievements, title: p.title }
    const now = Date.now()
    const pages: Raw = { ...(d.pages ?? {}) }
    for (const [k, pg] of Object.entries(pages)) {
      if (pg && typeof pg === 'object' && ['games', 'character', 'rewards'].includes(pg.type)) {
        pages[k] = { ...pg, type: 'doc', legacyType: pg.type, deletedAt: pg.deletedAt ?? now }
      }
    }
    const { games, xpLog, quests, inventory, rewards, ...rest } = d
    void games; void xpLog; void quests; void inventory; void rewards
    return {
      ...rest,
      pages,
      legacy,
      profile: { name: typeof p.name === 'string' ? p.name : '', avatar: typeof p.avatar === 'string' ? p.avatar : '' },
      values: d.values && typeof d.values === 'object' ? d.values : {},
      rules: Array.isArray(d.rules) ? d.rules : []
    }
  },
  // 5 -> 6: emoji icons become line icons (originals kept in legacy.emoji), the single
  // desktop dashboard becomes the first free-floating desktop widget, appearance settings (0.6.0).
  5: (d) => {
    const legacy: Raw = { ...(d.legacy && typeof d.legacy === 'object' ? d.legacy : {}) }
    const emoji: Raw = { ...(legacy.emoji && typeof legacy.emoji === 'object' ? legacy.emoji : {}) }
    const conv = (kind: string, id: string, icon: unknown, fallback: string): string => {
      if (typeof icon !== 'string' || !icon) return ''
      if (!isEmoji(icon)) return icon
      emoji[`${kind}:${id}`] = icon
      return emojiToIcon(icon, fallback)
    }
    const mapItems = (key: string, fallback: string): Raw => {
      const src: Raw = d[key] && typeof d[key] === 'object' ? d[key] : {}
      const out: Raw = {}
      for (const [k, v] of Object.entries(src)) out[k] = v && typeof v === 'object' ? { ...v, icon: conv(key, k, v.icon, fallback) || fallback } : v
      return out
    }
    const pages: Raw = {}
    for (const [k, p] of Object.entries((d.pages ?? {}) as Raw)) pages[k] = p && typeof p === 'object' ? { ...p, icon: conv('pages', k, p.icon, 'file-text') } : p
    const settings: Raw = { ...(d.settings && typeof d.settings === 'object' ? d.settings : {}) }
    const old: Raw = settings.widget && typeof settings.widget === 'object' ? settings.widget : {}
    delete settings.widget
    const widgets: Raw[] = []
    if (old.pageId && pages[old.pageId]) {
      widgets.push({
        id: 'dash-' + String(old.pageId),
        type: 'dashboard',
        config: { pageId: old.pageId, displayId: old.displayId ?? null },
        x: 0, y: 0, w: 0, h: 0,
        style: { material: old.background === 'acrylic' ? 'acrylic' : 'clear', opacity: typeof old.opacity === 'number' ? old.opacity : 100, header: false, padding: 12 },
        layer: old.layer === 'top' ? 'top' : 'desktop',
        hidden: !old.enabled,
        createdAt: Date.now()
      })
    }
    legacy.emoji = emoji
    const profile: Raw = d.profile && typeof d.profile === 'object' ? d.profile : {}
    const { profile: _drop, ...rest } = d
    void _drop
    return {
      ...rest,
      pages,
      habits: mapItems('habits', 'circle-check'),
      goals: mapItems('goals', 'target'),
      metrics: mapItems('metrics', 'activity'),
      values: mapItems('values', 'gem'),
      countdowns: Array.isArray(d.countdowns) ? d.countdowns.map((c: Raw, i: number) => (c && typeof c === 'object' ? { ...c, icon: conv('countdowns', String(c.id ?? i), c.icon, 'calendar') || 'calendar' } : c)) : [],
      settings,
      desktop: { enabled: true, snap: true, grid: 8, spaces: [{ id: 'main', name: 'Main', icon: 'monitor' }], active: 'main', widgets: widgets.map((w) => ({ ...w, space: 'main' })) },
      legacy: { ...legacy, profile: { ...(legacy.profile ?? {}), name: profile.name, avatar: profile.avatar } }
    }
  }
}

export function migrate(input: Raw): { data: Raw; from: number; changed: boolean } {
  let data: Raw = input && typeof input === 'object' ? input : {}
  const from = typeof data.schema === 'number' ? data.schema : 0
  let v = from
  while (v < CURRENT_SCHEMA) {
    const step = migrations[v]
    if (!step) throw new Error(`No migration from schema ${v}`)
    data = step(data)
    v += 1
    data.schema = v
  }
  return { data, from, changed: from !== v }
}
