import type { Item } from './schema.ts'
import { TIME_PATTERN, toMinutes } from './time.ts'

/** Do the half-open intervals [aStart, aEnd) and [bStart, bEnd) share any time? Touching ends do not overlap. */
export function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

/**
 * Items that occupy any of `columnIds` during [start, end) minutes. `ignoreId` skips one item
 * (the one being moved or resized). Items with malformed times are ignored.
 */
export function conflictingItems(
  items: readonly Item[],
  columnIds: readonly string[],
  start: number,
  end: number,
  ignoreId?: string,
): Item[] {
  return items.filter((item) => {
    if (item.id === ignoreId) return false
    if (!TIME_PATTERN.test(item.start) || !TIME_PATTERN.test(item.end)) return false
    if (!item.columnIds.some((id) => columnIds.includes(id))) return false
    return intervalsOverlap(start, end, toMinutes(item.start), toMinutes(item.end))
  })
}
