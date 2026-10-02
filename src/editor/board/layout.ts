import type { Item } from '../../model/schema.ts'

/** An item placed on the board: its track span as indices into the track list. */
export interface CardLayout {
  item: Item
  first: number
  last: number
}

/**
 * The items that sit on at least one track, with their span, ordered by start time and then by
 * track. That order is the Tab order of the cards.
 */
export function layoutCards(items: readonly Item[], trackIds: readonly string[]): CardLayout[] {
  const cards: CardLayout[] = []
  for (const item of items) {
    const indices = item.columnIds.map((id) => trackIds.indexOf(id)).filter((i) => i >= 0)
    if (indices.length === 0) continue
    cards.push({ item, first: Math.min(...indices), last: Math.max(...indices) })
  }
  return cards.sort((a, b) => a.item.start.localeCompare(b.item.start) || a.first - b.first || a.item.id.localeCompare(b.item.id))
}
