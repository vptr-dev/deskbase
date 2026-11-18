/**
 * Data schema migrations.
 *
 * Every time the shape of saved data changes, bump CURRENT_SCHEMA and add a
 * migration keyed by the version it upgrades FROM. Migrations must be pure,
 * must never throw away user content, and must tolerate partial data.
 * A backup of the file is written automatically before any migration runs.
 */

export const CURRENT_SCHEMA = 5

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
