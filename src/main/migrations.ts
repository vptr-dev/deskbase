/**
 * Data schema migrations.
 *
 * Every time the shape of saved data changes, bump CURRENT_SCHEMA and add a
 * migration keyed by the version it upgrades FROM. Migrations must be pure,
 * must never throw away user content, and must tolerate partial data.
 * A backup of the file is written automatically before any migration runs.
 */

export const CURRENT_SCHEMA = 2

type Raw = Record<string, any>

const migrations: Record<number, (d: Raw) => Raw> = {
  // 0 -> 1: files written before versioning existed (or empty objects).
  0: (d) => ({ ...d, schema: 1 }),
  // 1 -> 2: assistant chat history (0.2.0).
  1: (d) => ({ ...d, assistant: d.assistant ?? { messages: [] } })
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
