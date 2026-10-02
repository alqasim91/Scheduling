/**
 * Pure, immutable editing operations on a Schedule.
 *
 * Every op returns a new Schedule, or returns the *same* input reference when
 * the op is invalid or would change nothing. Callers (and the UI) can therefore
 * test `op(schedule, ...) === schedule` to know whether an op would be refused.
 *
 * Invariants kept by every op, given a valid input:
 *  - the output still validates against the schema;
 *  - each item's `columnIds` is sorted by column order and contiguous;
 *  - ops never introduce two items occupying the same grid cell.
 */
import { newId } from '../model/ids.ts'
import type { Column, Item, Row, Schedule } from '../model/schema.ts'
import { TIME_PATTERN, fromMinutes, toMinutes } from '../model/time.ts'

export type Direction = -1 | 1
export type Side = 'left' | 'right'

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/
const VARIANTS: readonly Item['variant'][] = ['session', 'break', 'highlight']
const COLUMN_PALETTE = ['#188038', '#0b57d0', '#f9ab00', '#d93025', '#a142f4', '#12b5cb']
const LAST_MINUTE = 23 * 60 + 59
const DEFAULT_FIRST_START = '09:00'
const DEFAULT_ROW_MINUTES = 30

/* ---------- internal helpers ---------- */

function indexMap(entries: readonly { id: string }[]): Map<string, number> {
  const map = new Map<string, number>()
  entries.forEach((entry, i) => {
    if (!map.has(entry.id)) map.set(entry.id, i)
  })
  return map
}

function omitKey<T extends object, K extends keyof T>(source: T, key: K): Omit<T, K> {
  const copy = { ...source }
  delete copy[key]
  return copy
}

/** Set `rowSpan`, dropping the property when it is 1. */
function withRowSpan(item: Item, span: number): Item {
  return span > 1 ? { ...item, rowSpan: span } : omitKey(item, 'rowSpan')
}

function isTime(value: string | undefined): value is string {
  return typeof value === 'string' && TIME_PATTERN.test(value)
}

/** Item's column indices in column order (unknown columns dropped). */
function columnIndices(item: Item, cmap: Map<string, number>): number[] {
  return item.columnIds
    .map((id) => cmap.get(id))
    .filter((i): i is number => i !== undefined)
    .sort((a, b) => a - b)
}

/** The longest run of ids contiguous in column order that contains `anchor` (or the first id). */
function contiguousRun(ids: readonly string[], cmap: Map<string, number>, anchor: string): string[] {
  const idx = (id: string) => cmap.get(id) ?? -1
  const sorted = [...new Set(ids)].sort((a, b) => idx(a) - idx(b))
  let start = sorted.indexOf(anchor)
  if (start < 0) start = 0
  let lo = start
  let hi = start
  while (lo > 0 && idx(sorted[lo - 1] as string) === idx(sorted[lo] as string) - 1) lo--
  while (hi < sorted.length - 1 && idx(sorted[hi + 1] as string) === idx(sorted[hi] as string) + 1) hi++
  return sorted.slice(lo, hi + 1)
}

function cellKey(rowIndex: number, columnKey: string | number): string {
  return `${rowIndex}:${columnKey}`
}

/** Row indices an item covers, clamped to the rows that exist. */
function coveredRows(item: Item, rowIndex: number, rowCount: number): number[] {
  const span = Math.max(1, item.rowSpan ?? 1)
  const rows: number[] = []
  for (let r = rowIndex; r < Math.min(rowCount, rowIndex + span); r++) rows.push(r)
  return rows
}

/**
 * Map of `rowIndex:columnId` -> item id for every grid cell that holds an item,
 * including the cells covered by `rowSpan` and by multi-column items.
 */
export function occupancy(schedule: Schedule): Map<string, string> {
  const rmap = indexMap(schedule.rows)
  const known = new Set(schedule.columns.map((c) => c.id))
  const cells = new Map<string, string>()
  for (const item of schedule.items) {
    const rowIndex = rmap.get(item.rowId)
    if (rowIndex === undefined) continue
    for (const r of coveredRows(item, rowIndex, schedule.rows.length)) {
      for (const columnId of item.columnIds) {
        if (known.has(columnId)) cells.set(cellKey(r, columnId), item.id)
      }
    }
  }
  return cells
}

/** Are all of these cells free (or held by `ignoreItemId`)? */
function cellsFree(
  schedule: Schedule,
  rowIndices: readonly number[],
  columnIds: readonly string[],
  ignoreItemId?: string,
): boolean {
  const occ = occupancy(schedule)
  return rowIndices.every((r) =>
    columnIds.every((c) => {
      const holder = occ.get(cellKey(r, c))
      return holder === undefined || holder === ignoreItemId
    }),
  )
}

function findItem(schedule: Schedule, id: string): { item: Item; rowIndex: number } | null {
  const item = schedule.items.find((i) => i.id === id)
  if (!item) return null
  const rowIndex = schedule.rows.findIndex((r) => r.id === item.rowId)
  if (rowIndex < 0) return null
  return { item, rowIndex }
}

function replaceItem(schedule: Schedule, updated: Item): Schedule {
  return { ...schedule, items: schedule.items.map((i) => (i.id === updated.id ? updated : i)) }
}

/** Reduce rowSpans so every item fits the rows that exist and overlaps nothing. */
function clampSpans(schedule: Schedule): Schedule {
  const rmap = indexMap(schedule.rows)
  const cmap = indexMap(schedule.columns)
  const taken = new Set<string>()
  const footprints = new Map<string, { row: number; cols: number[] }>()
  for (const item of schedule.items) {
    const row = rmap.get(item.rowId)
    if (row === undefined) continue
    const cols = columnIndices(item, cmap)
    footprints.set(item.id, { row, cols })
    for (const c of cols) taken.add(cellKey(row, c))
  }
  let changed = false
  const items = schedule.items.map((item) => {
    const span = item.rowSpan ?? 1
    const footprint = footprints.get(item.id)
    if (!footprint || span <= 1) return item
    let fits = 1
    while (
      fits < span &&
      footprint.row + fits < schedule.rows.length &&
      footprint.cols.every((c) => !taken.has(cellKey(footprint.row + fits, c)))
    ) {
      for (const c of footprint.cols) taken.add(cellKey(footprint.row + fits, c))
      fits++
    }
    if (fits === span) return item
    changed = true
    return withRowSpan(item, fits)
  })
  return changed ? { ...schedule, items } : schedule
}

function newRowTimes(previousEnd: string | undefined): { start: string; end: string } | null {
  const start = previousEnd ?? DEFAULT_FIRST_START
  if (!isTime(start)) return null
  const startMinutes = toMinutes(start)
  const endMinutes = Math.min(startMinutes + DEFAULT_ROW_MINUTES, LAST_MINUTE)
  if (endMinutes <= startMinutes) return null
  return { start, end: fromMinutes(endMinutes) }
}

/* ---------- columns ---------- */

export function addColumn(
  schedule: Schedule,
  init: { id?: string; name?: string; color?: string } = {},
): Schedule {
  const id = init.id ?? newId('col')
  if (schedule.columns.some((c) => c.id === id)) return schedule
  if (init.color !== undefined && !HEX_COLOR.test(init.color)) return schedule
  const column: Column = {
    id,
    name: init.name ?? `Track ${schedule.columns.length + 1}`,
    color: init.color ?? (COLUMN_PALETTE[schedule.columns.length % COLUMN_PALETTE.length] as string),
    type: 'track',
  }
  return { ...schedule, columns: [...schedule.columns, column] }
}

export function removeColumn(schedule: Schedule, id: string): Schedule {
  if (!schedule.columns.some((c) => c.id === id)) return schedule
  const columns = schedule.columns.filter((c) => c.id !== id)
  const cmap = indexMap(columns)
  const items: Item[] = []
  for (const item of schedule.items) {
    const remaining = item.columnIds.filter((c) => c !== id && cmap.has(c))
    if (remaining.length === 0) continue
    items.push({ ...item, columnIds: contiguousRun(remaining, cmap, remaining[0] as string) })
  }
  return { ...schedule, columns, items }
}

export function renameColumn(schedule: Schedule, id: string, name: string): Schedule {
  if (!schedule.columns.some((c) => c.id === id)) return schedule
  return { ...schedule, columns: schedule.columns.map((c) => (c.id === id ? { ...c, name } : c)) }
}

export function setColumnColor(schedule: Schedule, id: string, color: string): Schedule {
  if (!HEX_COLOR.test(color)) return schedule
  if (!schedule.columns.some((c) => c.id === id)) return schedule
  return { ...schedule, columns: schedule.columns.map((c) => (c.id === id ? { ...c, color } : c)) }
}

export function moveColumn(schedule: Schedule, id: string, direction: Direction): Schedule {
  const from = schedule.columns.findIndex((c) => c.id === id)
  const to = from + direction
  if (from < 0 || to < 0 || to >= schedule.columns.length) return schedule
  const columns = [...schedule.columns]
  const moved = columns[from] as Column
  columns[from] = columns[to] as Column
  columns[to] = moved
  const cmap = indexMap(columns)
  const items = schedule.items.map((item) => {
    const anchor = item.columnIds[0] as string
    return { ...item, columnIds: contiguousRun(item.columnIds, cmap, anchor) }
  })
  return { ...schedule, columns, items }
}

/* ---------- rows ---------- */

/** Append a row starting where the last one ends and lasting 30 minutes (capped at 23:59). */
export function addRow(schedule: Schedule, id: string = newId('row')): Schedule {
  if (schedule.rows.some((r) => r.id === id)) return schedule
  const last = schedule.rows[schedule.rows.length - 1]
  const times = newRowTimes(last?.end)
  if (!times) return schedule
  const row: Row = { id, ...times }
  return { ...schedule, rows: [...schedule.rows, row] }
}

/**
 * Insert a row right after `rowId`. An item that spans across the insertion point
 * grows by one row so it keeps covering everything it covered before.
 */
export function insertRowAfter(schedule: Schedule, rowId: string, id: string = newId('row')): Schedule {
  const at = schedule.rows.findIndex((r) => r.id === rowId)
  if (at < 0 || schedule.rows.some((r) => r.id === id)) return schedule
  const times = newRowTimes((schedule.rows[at] as Row).end)
  if (!times) return schedule
  const rows = [...schedule.rows]
  rows.splice(at + 1, 0, { id, ...times })
  const rmap = indexMap(schedule.rows)
  const items = schedule.items.map((item) => {
    const start = rmap.get(item.rowId)
    const span = item.rowSpan ?? 1
    if (start !== undefined && start <= at && start + span - 1 >= at + 1) return withRowSpan(item, span + 1)
    return item
  })
  return { ...schedule, rows, items }
}

export function removeRow(schedule: Schedule, id: string): Schedule {
  const at = schedule.rows.findIndex((r) => r.id === id)
  if (at < 0) return schedule
  const rmap = indexMap(schedule.rows)
  const items = schedule.items
    .filter((item) => item.rowId !== id)
    .map((item) => {
      const start = rmap.get(item.rowId)
      const span = item.rowSpan ?? 1
      if (start !== undefined && start < at && start + span - 1 >= at) return withRowSpan(item, span - 1)
      return item
    })
  return { ...schedule, rows: schedule.rows.filter((r) => r.id !== id), items }
}

export function setRowTimes(schedule: Schedule, id: string, start: string, end: string): Schedule {
  if (!isTime(start) || !isTime(end) || toMinutes(start) >= toMinutes(end)) return schedule
  if (!schedule.rows.some((r) => r.id === id)) return schedule
  return { ...schedule, rows: schedule.rows.map((r) => (r.id === id ? { ...r, start, end } : r)) }
}

/** Set or clear (empty string) a row's note. */
export function setRowNote(schedule: Schedule, id: string, note: string): Schedule {
  if (!schedule.rows.some((r) => r.id === id)) return schedule
  return {
    ...schedule,
    rows: schedule.rows.map((r) => {
      if (r.id !== id) return r
      return note === '' ? omitKey(r, 'note') : { ...r, note }
    }),
  }
}

export function moveRow(schedule: Schedule, id: string, direction: Direction): Schedule {
  const from = schedule.rows.findIndex((r) => r.id === id)
  const to = from + direction
  if (from < 0 || to < 0 || to >= schedule.rows.length) return schedule
  const rows = [...schedule.rows]
  const moved = rows[from] as Row
  rows[from] = rows[to] as Row
  rows[to] = moved
  return clampSpans({ ...schedule, rows })
}

/* ---------- items ---------- */

export type ItemInit = Partial<Pick<Item, 'id' | 'title' | 'speaker' | 'tag' | 'variant' | 'start' | 'end' | 'rowSpan'>>

/** Place a new single-column item in a free cell. */
export function addItem(schedule: Schedule, rowId: string, colId: string, partial: ItemInit = {}): Schedule {
  const rowIndex = schedule.rows.findIndex((r) => r.id === rowId)
  if (rowIndex < 0 || !schedule.columns.some((c) => c.id === colId)) return schedule

  const id = partial.id ?? newId('item')
  if (schedule.items.some((i) => i.id === id)) return schedule
  const variant = partial.variant ?? 'session'
  if (!VARIANTS.includes(variant)) return schedule
  if (partial.start !== undefined && !isTime(partial.start)) return schedule
  if (partial.end !== undefined && !isTime(partial.end)) return schedule
  if (partial.start !== undefined && partial.end !== undefined && toMinutes(partial.start) >= toMinutes(partial.end)) {
    return schedule
  }
  const span = partial.rowSpan ?? 1
  if (!Number.isInteger(span) || span < 1 || rowIndex + span > schedule.rows.length) return schedule

  const rowsCovered = Array.from({ length: span }, (_, k) => rowIndex + k)
  if (!cellsFree(schedule, rowsCovered, [colId])) return schedule

  let item: Item = { id, rowId, columnIds: [colId], title: partial.title ?? 'New session', variant }
  if (partial.speaker) item = { ...item, speaker: partial.speaker }
  if (partial.tag) item = { ...item, tag: partial.tag }
  if (partial.start !== undefined) item = { ...item, start: partial.start }
  if (partial.end !== undefined) item = { ...item, end: partial.end }
  item = withRowSpan(item, span)
  return { ...schedule, items: [...schedule.items, item] }
}

export type ItemPatch = Partial<Pick<Item, 'title' | 'speaker' | 'tag' | 'variant'>>

/** Edit text fields and variant. An empty speaker/tag removes it. Structure has its own ops. */
export function updateItem(schedule: Schedule, id: string, patch: ItemPatch): Schedule {
  const item = schedule.items.find((i) => i.id === id)
  if (!item) return schedule
  if (patch.variant !== undefined && !VARIANTS.includes(patch.variant)) return schedule
  let next: Item = { ...item }
  if (patch.title !== undefined) next.title = patch.title
  if (patch.variant !== undefined) next.variant = patch.variant
  if (patch.speaker !== undefined) next = patch.speaker === '' ? omitKey(next, 'speaker') : { ...next, speaker: patch.speaker }
  if (patch.tag !== undefined) next = patch.tag === '' ? omitKey(next, 'tag') : { ...next, tag: patch.tag }
  return replaceItem(schedule, next)
}

export function removeItem(schedule: Schedule, id: string): Schedule {
  if (!schedule.items.some((i) => i.id === id)) return schedule
  return { ...schedule, items: schedule.items.filter((i) => i.id !== id) }
}

/** Merge the item into the neighbouring column on that side, if that column is free. */
export function extendItem(schedule: Schedule, id: string, side: Side): Schedule {
  const found = findItem(schedule, id)
  if (!found) return schedule
  const { item, rowIndex } = found
  const cmap = indexMap(schedule.columns)
  const indices = columnIndices(item, cmap)
  if (indices.length === 0) return schedule
  const target = side === 'left' ? (indices[0] as number) - 1 : (indices[indices.length - 1] as number) + 1
  const targetColumn = schedule.columns[target]
  if (!targetColumn) return schedule
  if (!cellsFree(schedule, coveredRows(item, rowIndex, schedule.rows.length), [targetColumn.id], id)) return schedule
  const columnIds = [...indices, target].sort((a, b) => a - b).map((i) => (schedule.columns[i] as Column).id)
  return replaceItem(schedule, { ...item, columnIds })
}

/** Drop the item's leftmost/rightmost column. Never goes below one column. */
export function shrinkItem(schedule: Schedule, id: string, side: Side): Schedule {
  const item = schedule.items.find((i) => i.id === id)
  if (!item) return schedule
  const cmap = indexMap(schedule.columns)
  const indices = columnIndices(item, cmap)
  if (indices.length < 2) return schedule
  const kept = side === 'left' ? indices.slice(1) : indices.slice(0, -1)
  return replaceItem(schedule, { ...item, columnIds: kept.map((i) => (schedule.columns[i] as Column).id) })
}

export function spanAllColumns(schedule: Schedule, id: string): Schedule {
  const found = findItem(schedule, id)
  if (!found || schedule.columns.length === 0) return schedule
  const { item, rowIndex } = found
  const all = schedule.columns.map((c) => c.id)
  if (all.length === item.columnIds.length && all.every((c) => item.columnIds.includes(c))) return schedule
  if (!cellsFree(schedule, coveredRows(item, rowIndex, schedule.rows.length), all, id)) return schedule
  return replaceItem(schedule, { ...item, columnIds: all })
}

/** Make the item cover `span` rows (from its own row), if they exist and are free. */
export function setRowSpan(schedule: Schedule, id: string, span: number): Schedule {
  const found = findItem(schedule, id)
  if (!found || !Number.isInteger(span) || span < 1) return schedule
  const { item, rowIndex } = found
  if (rowIndex + span > schedule.rows.length) return schedule
  if (span === (item.rowSpan ?? 1)) return schedule
  const rowsCovered = Array.from({ length: span }, (_, k) => rowIndex + k)
  if (!cellsFree(schedule, rowsCovered, item.columnIds, id)) return schedule
  return replaceItem(schedule, withRowSpan(item, span))
}

/**
 * Set the item's start/end overrides. `undefined` clears that override
 * (falling back to the row times). Rejects malformed times and start >= end.
 */
export function setItemTimes(
  schedule: Schedule,
  id: string,
  start: string | undefined,
  end: string | undefined,
): Schedule {
  const item = schedule.items.find((i) => i.id === id)
  if (!item) return schedule
  if (start !== undefined && !isTime(start)) return schedule
  if (end !== undefined && !isTime(end)) return schedule
  if (start !== undefined && end !== undefined && toMinutes(start) >= toMinutes(end)) return schedule
  let next = omitKey(omitKey(item, 'start'), 'end') as Item
  if (start !== undefined) next = { ...next, start }
  if (end !== undefined) next = { ...next, end }
  return replaceItem(schedule, next)
}
