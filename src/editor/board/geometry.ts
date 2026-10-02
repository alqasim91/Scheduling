/**
 * Pure geometry for the schedule board: minutes <-> pixels, snapping, the visible range, and the
 * previews of the four gestures (create, move, resize, change span). Nothing here touches the DOM
 * or React, so every rule can be unit tested. Times are minutes since midnight.
 */
import { conflictingItems } from '../../model/overlap.ts'
import type { Item } from '../../model/schema.ts'
import { toMinutes } from '../../model/time.ts'

export const SNAP_MINUTES = 5
export const MIN_MINUTES = 5
export const DEFAULT_CREATE_MINUTES = 30
/** The last minute an item may end on ("23:59"); 24:00 maps to it. */
export const LAST_MINUTE = 23 * 60 + 59
export const DAY_MINUTES = 24 * 60
/** Movement under this many pixels is a click, not a drag. */
export const DRAG_THRESHOLD_PX = 4

export const ZOOMS = { compact: 1.1, comfortable: 1.8 } as const
export type Zoom = keyof typeof ZOOMS

/* ---------- basics ---------- */

export function snap(minutes: number, step: number = SNAP_MINUTES, mode: 'round' | 'floor' = 'round'): number {
  const q = minutes / step
  return (mode === 'floor' ? Math.floor(q) : Math.round(q)) * step
}

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

export function minutesToY(minutes: number, rangeStart: number, pxPerMinute: number): number {
  return (minutes - rangeStart) * pxPerMinute
}

export function yToMinutes(y: number, rangeStart: number, pxPerMinute: number): number {
  return rangeStart + y / pxPerMinute
}

/** "HH:MM" for minutes in 0..1439 (1440 is shown as 23:59, like the model stores it). */
export function formatMinutes(minutes: number): string {
  const m = clamp(Math.round(minutes), 0, LAST_MINUTE)
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** Which of `count` equal columns spanning [left, left + width) contains x (clamped to the ends). */
export function columnAt(x: number, left: number, width: number, count: number): number {
  if (count <= 0 || width <= 0) return 0
  return clamp(Math.floor(((x - left) / width) * count), 0, count - 1)
}

/* ---------- the visible range ---------- */

export interface Range {
  start: number
  end: number
}

export const MIN_RANGE_MINUTES = 6 * 60
const EMPTY_RANGE: Range = { start: 9 * 60, end: 17 * 60 }

/**
 * The range shown: earliest start - 30 min to latest end + 60 min, at least six hours, rounded
 * out to whole hours and kept within the day. `extra` is what the Earlier/Later buttons added.
 */
export function fitRange(items: readonly Pick<Item, 'start' | 'end'>[], extra: { before?: number; after?: number } = {}): Range {
  const before = extra.before ?? 0
  const after = extra.after ?? 0
  let start: number
  let end: number
  if (items.length === 0) {
    start = EMPTY_RANGE.start
    end = EMPTY_RANGE.end
  } else {
    start = Math.min(...items.map((i) => toMinutes(i.start))) - 30
    end = Math.max(...items.map((i) => toMinutes(i.end))) + 60
  }
  start = clamp(Math.floor(start / 60) * 60, 0, DAY_MINUTES - 60)
  end = clamp(Math.ceil(end / 60) * 60, 60, DAY_MINUTES)
  // At least six hours: grow after the end first, then before the start.
  if (end - start < MIN_RANGE_MINUTES) end = Math.min(DAY_MINUTES, start + MIN_RANGE_MINUTES)
  if (end - start < MIN_RANGE_MINUTES) start = Math.max(0, end - MIN_RANGE_MINUTES)
  // What Earlier / Later added comes on top, so each click visibly adds an hour.
  return { start: Math.max(0, start - before), end: Math.min(DAY_MINUTES, end + after) }
}

/** Whole hours inside the range, for the gutter labels. */
export function hourMarks(range: Range): number[] {
  const marks: number[] = []
  for (let m = Math.ceil(range.start / 60) * 60; m < range.end; m += 60) marks.push(m)
  return marks
}

/* ---------- free space ---------- */

interface Slot {
  /** First and last track index (inclusive). */
  first: number
  last: number
}

const trackIds = (ids: readonly string[], slot: Slot): string[] => ids.slice(slot.first, slot.last + 1)

/** Items other than `ignoreId` that occupy [start, end) in tracks first..last. */
export function collisions(
  items: readonly Item[],
  ids: readonly string[],
  slot: Slot,
  start: number,
  end: number,
  ignoreId?: string,
): Item[] {
  return conflictingItems(items, trackIds(ids, slot), start, end, ignoreId)
}

/**
 * How far an interval can grow in each direction without touching another item: the latest end
 * at or before `from`, and the earliest start at or after `to`, over the given tracks.
 */
export function freeBounds(
  items: readonly Item[],
  ids: readonly string[],
  slot: Slot,
  from: number,
  to: number,
  ignoreId?: string,
): { min: number; max: number } {
  const cols = trackIds(ids, slot)
  let min = 0
  let max = LAST_MINUTE
  for (const item of items) {
    if (item.id === ignoreId || !item.columnIds.some((id) => cols.includes(id))) continue
    const s = toMinutes(item.start)
    const e = toMinutes(item.end)
    if (e <= from) min = Math.max(min, e)
    if (s >= to) max = Math.min(max, s)
  }
  return { min, max }
}

/* ---------- gesture previews ---------- */

export interface Preview {
  start: number
  end: number
  first: number
  last: number
  /** False when dropping here would be refused (the preview turns red and the drop reverts). */
  valid: boolean
}

/**
 * Drawing a new session: from the point where the pointer went down to where it is now, snapped.
 * The result is clamped to the free space around the starting point, so dragging into a neighbour
 * stops at its edge. Invalid only when the starting point is itself inside another session.
 */
export function previewCreate(
  items: readonly Item[],
  ids: readonly string[],
  anchor: { minutes: number; column: number },
  pointer: { minutes: number; column: number },
): Preview {
  const a = snap(anchor.minutes)
  const b = snap(pointer.minutes)
  const first = Math.min(anchor.column, pointer.column)
  const last = Math.max(anchor.column, pointer.column)
  let start = Math.min(a, b)
  let end = Math.max(a, b)
  if (end - start < MIN_MINUTES) {
    // Dragging up from the anchor keeps the anchor as the bottom edge.
    if (pointer.minutes < anchor.minutes) start = end - MIN_MINUTES
    else end = start + MIN_MINUTES
  }
  const slot = { first, last }
  const bounds = freeBounds(items, ids, slot, a, a)
  start = Math.max(start, bounds.min)
  end = Math.min(end, bounds.max)
  start = Math.max(0, start)
  const valid = end - start >= MIN_MINUTES && collisions(items, ids, slot, start, end).length === 0
  return { start, end, first, last, valid }
}

/**
 * A plain click: a 30 minute session starting at the snapped (rounded down) click time, shortened
 * to fit before the next session in that track. Invalid when there is no room for 5 minutes.
 */
export function previewClick(
  items: readonly Item[],
  ids: readonly string[],
  at: { minutes: number; column: number },
): Preview {
  const start = clamp(snap(at.minutes, SNAP_MINUTES, 'floor'), 0, LAST_MINUTE - MIN_MINUTES)
  const slot = { first: at.column, last: at.column }
  const upper = freeBounds(items, ids, slot, start, start).max
  const end = Math.min(start + DEFAULT_CREATE_MINUTES, upper)
  const valid = end - start >= MIN_MINUTES && collisions(items, ids, slot, start, end).length === 0
  return { start, end, first: at.column, last: at.column, valid }
}

/** Where the dragged item's own extents are, as the gesture tracks them. */
export interface Extent {
  start: number
  end: number
  first: number
  last: number
}

/**
 * Moving an item: shift by the snapped time delta and by whole tracks, keeping length and span.
 * Tracks are clamped to the board; time is not (out of the day is invalid, shown red).
 */
export function previewMove(
  items: readonly Item[],
  ids: readonly string[],
  item: Item,
  original: Extent,
  deltaMinutes: number,
  columnShift: number,
): Preview {
  const length = original.end - original.start
  const span = original.last - original.first
  let start = snap(original.start + deltaMinutes)
  if (start + length === DAY_MINUTES) start -= 1 // 24:00 is stored as 23:59
  const end = start + length
  const first = clamp(original.first + columnShift, 0, Math.max(0, ids.length - 1 - span))
  const last = first + span
  const inDay = start >= 0 && end <= LAST_MINUTE
  const valid = inDay && collisions(items, ids, { first, last }, start, end, item.id).length === 0
  return { start, end, first, last, valid }
}

/** Dragging the top or bottom edge. Clamped to the neighbours and to 5 minutes; always valid. */
export function previewResize(
  items: readonly Item[],
  ids: readonly string[],
  item: Item,
  original: Extent,
  edge: 'top' | 'bottom',
  pointerMinutes: number,
): Preview {
  const slot = { first: original.first, last: original.last }
  const bounds = freeBounds(items, ids, slot, original.start, original.end, item.id)
  let { start, end } = original
  if (edge === 'bottom') {
    end = clamp(snap(pointerMinutes), start + MIN_MINUTES, Math.min(bounds.max, LAST_MINUTE))
  } else {
    start = clamp(snap(pointerMinutes), bounds.min, end - MIN_MINUTES)
  }
  return { start, end, first: original.first, last: original.last, valid: true }
}

/** Dragging the left or right edge: the span grows only over tracks that are free for the item's whole time. */
export function previewSpan(
  items: readonly Item[],
  ids: readonly string[],
  item: Item,
  original: Extent,
  edge: 'left' | 'right',
  pointerColumn: number,
): Preview {
  let { first, last } = original
  if (edge === 'right') {
    const target = clamp(pointerColumn, first, ids.length - 1)
    if (target < last) last = target
    while (last < target && collisions(items, ids, { first: last + 1, last: last + 1 }, original.start, original.end, item.id).length === 0) last++
  } else {
    const target = clamp(pointerColumn, 0, last)
    if (target > first) first = target
    while (first > target && collisions(items, ids, { first: first - 1, last: first - 1 }, original.start, original.end, item.id).length === 0) first--
  }
  return { start: original.start, end: original.end, first, last, valid: true }
}
