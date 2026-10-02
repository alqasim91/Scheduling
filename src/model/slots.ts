import type { Item, Row } from './schema.ts'
import { TIME_PATTERN, toMinutes } from './time.ts'

/** A display slot of the track grid, derived from the items rather than stored. */
export interface Slot {
  start: string
  end: string
  /** Items that start in this slot, in their original order. */
  items: Item[]
}

/**
 * The slots a set of grid items makes up: one per distinct start time (sorted), ending at the
 * earliest end among the items that start there. Longer items run past the slot's end and are
 * shown as "continues" ghosts by the renderer.
 */
export function deriveSlots(items: readonly Item[]): Slot[] {
  const byStart = new Map<number, Item[]>()
  for (const item of items) {
    if (!TIME_PATTERN.test(item.start) || !TIME_PATTERN.test(item.end)) continue
    const start = toMinutes(item.start)
    byStart.set(start, [...(byStart.get(start) ?? []), item])
  }
  return [...byStart.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, group]) => {
      const first = group[0] as Item
      const earliest = group.reduce((best, item) => (toMinutes(item.end) < toMinutes(best.end) ? item : best), first)
      return { start: first.start, end: earliest.end, items: group }
    })
}

/**
 * Rows for table mode, taken from the grid slots (used the first time a grid schedule becomes a
 * table). A slot's item notes become the row's note (in `columnOrder`, joined by a space).
 */
export function rowsFromSlots(items: readonly Item[], makeId: () => string, columnOrder: readonly string[] = []): Row[] {
  const position = (item: Item) => Math.min(...item.columnIds.map((id) => columnOrder.indexOf(id)).map((i) => (i < 0 ? Infinity : i)))
  return deriveSlots(items).map((slot) => {
    const note = [...slot.items]
      .map((item, order) => ({ item, order }))
      .sort((a, b) => position(a.item) - position(b.item) || a.order - b.order)
      .map(({ item }) => item.note?.trim() ?? '')
      .filter((n) => n !== '')
      .join(' ')
    return { id: makeId(), start: slot.start, end: slot.end, ...(note ? { note } : {}) }
  })
}
