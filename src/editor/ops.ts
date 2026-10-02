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
 *  - ops never introduce two items that share a column and overlap in time (half-open intervals).
 *
 * Grid items are placed by absolute time (`start`/`end`) and track columns. Rows belong to table mode.
 */
import { newId } from '../model/ids.ts'
import { conflictingItems } from '../model/overlap.ts'
import type { Column, Item, Row, Schedule } from '../model/schema.ts'
import { rowsFromSlots } from '../model/slots.ts'
import { TIME_PATTERN, fromMinutes, toMinutes } from '../model/time.ts'

export type Direction = -1 | 1

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/
const VARIANTS: readonly Item['variant'][] = ['session', 'break', 'highlight']
const COLUMN_PALETTE = ['#188038', '#0b57d0', '#f9ab00', '#d93025', '#a142f4', '#12b5cb']
export const LAST_MINUTE = 23 * 60 + 59
/** Shortest session the editor will create or resize to. */
export const MIN_ITEM_MINUTES = 5
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

const isTrack = (column: Column): boolean => column.type === 'track'

/** Columns used by track-grid mode. Items only ever reference these. */
export function trackColumns(schedule: Pick<Schedule, 'columns'>): Column[] {
  return schedule.columns.filter(isTrack)
}

/** Columns used by table mode (text, time, person, tag). */
export function tableColumns(schedule: Pick<Schedule, 'columns'>): Column[] {
  return schedule.columns.filter((c) => !isTrack(c))
}

function omitKey<T extends object, K extends keyof T>(source: T, key: K): Omit<T, K> {
  const copy = { ...source }
  delete copy[key]
  return copy
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

function replaceItem(schedule: Schedule, updated: Item): Schedule {
  return { ...schedule, items: schedule.items.map((i) => (i.id === updated.id ? updated : i)) }
}

/** Is [start, end) free of other items in all of these columns? */
function slotFree(
  schedule: Schedule,
  columnIds: readonly string[],
  start: number,
  end: number,
  ignoreItemId?: string,
): boolean {
  return conflictingItems(schedule.items, columnIds, start, end, ignoreItemId).length === 0
}

/** Ids of the track columns from index `first` to `last` (inclusive), or null when the range is invalid. */
function trackRange(schedule: Schedule, first: number, last: number): string[] | null {
  const tracks = trackColumns(schedule)
  if (!Number.isInteger(first) || !Number.isInteger(last) || first < 0 || last < first || last >= tracks.length) return null
  return tracks.slice(first, last + 1).map((c) => c.id)
}

/** A [start, end) pair that is real, ordered and within the day, as minutes. */
function validRange(start: string | undefined, end: string | undefined): { start: number; end: number } | null {
  if (!isTime(start) || !isTime(end)) return null
  const s = toMinutes(start)
  const e = toMinutes(end)
  return s < e ? { start: s, end: e } : null
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

const COLUMN_TYPES: readonly Column['type'][] = ['track', 'text', 'time', 'person', 'tag']
const TABLE_TYPES: readonly Column['type'][] = ['text', 'time', 'person', 'tag']

/** Copy of a row without the cell for `columnId` (and without `cells` when that leaves it empty). */
function withoutCell(row: Row, columnId: string): Row {
  if (!row.cells || !(columnId in row.cells)) return row
  const cells = { ...row.cells }
  delete cells[columnId]
  return Object.keys(cells).length > 0 ? { ...row, cells } : omitKey(row, 'cells')
}

/**
 * Add a column. Without an explicit `type` it is a track in track-grid mode and a text column
 * in table mode.
 */
export function addColumn(
  schedule: Schedule,
  init: { id?: string; name?: string; color?: string; type?: Column['type'] } = {},
): Schedule {
  const id = init.id ?? newId('col')
  if (schedule.columns.some((c) => c.id === id)) return schedule
  if (init.color !== undefined && !HEX_COLOR.test(init.color)) return schedule
  const type = init.type ?? (schedule.mode === 'table' ? 'text' : 'track')
  if (!COLUMN_TYPES.includes(type)) return schedule
  const sameKind = schedule.columns.filter((c) => isTrack(c) === (type === 'track')).length
  const column: Column = {
    id,
    name: init.name ?? (type === 'track' ? `Track ${sameKind + 1}` : `Column ${sameKind + 1}`),
    color: init.color ?? (COLUMN_PALETTE[sameKind % COLUMN_PALETTE.length] as string),
    type,
  }
  return { ...schedule, columns: [...schedule.columns, column] }
}

/** Remove a column: its items lose it (and may be deleted), and its table cells are dropped. */
export function removeColumn(schedule: Schedule, id: string): Schedule {
  if (!schedule.columns.some((c) => c.id === id)) return schedule
  const columns = schedule.columns.filter((c) => c.id !== id)
  const cmap = indexMap(columns.filter(isTrack))
  const items: Item[] = []
  for (const item of schedule.items) {
    const remaining = item.columnIds.filter((c) => c !== id && cmap.has(c))
    if (remaining.length === 0) continue
    items.push({ ...item, columnIds: contiguousRun(remaining, cmap, remaining[0] as string) })
  }
  return { ...schedule, columns, rows: schedule.rows.map((r) => withoutCell(r, id)), items }
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

/** Move a column one place within its own kind (tracks among tracks, table columns among table columns). */
export function moveColumn(schedule: Schedule, id: string, direction: Direction): Schedule {
  const from = schedule.columns.findIndex((c) => c.id === id)
  if (from < 0) return schedule
  const track = isTrack(schedule.columns[from] as Column)
  const sameKind = schedule.columns.flatMap((c, i) => (isTrack(c) === track ? [i] : []))
  const position = sameKind.indexOf(from)
  const swapWith = sameKind[position + direction]
  if (swapWith === undefined) return schedule
  const columns = [...schedule.columns]
  const moved = columns[from] as Column
  columns[from] = columns[swapWith] as Column
  columns[swapWith] = moved
  if (!track) return { ...schedule, columns }
  const cmap = indexMap(columns.filter(isTrack))
  const items = schedule.items.map((item) => {
    const anchor = item.columnIds[0] as string
    return { ...item, columnIds: contiguousRun(item.columnIds, cmap, anchor) }
  })
  return { ...schedule, columns, items }
}

/**
 * Move a track to a position among the tracks (0 = first), by repeated neighbour swaps, so item
 * spans are re-sorted exactly as `moveColumn` does. Refused for unknown ids, table columns,
 * out-of-range positions and no-ops.
 */
export function moveColumnTo(schedule: Schedule, id: string, toTrackIndex: number): Schedule {
  const tracks = trackColumns(schedule)
  const from = tracks.findIndex((c) => c.id === id)
  if (from < 0 || !Number.isInteger(toTrackIndex) || toTrackIndex < 0 || toTrackIndex >= tracks.length || toTrackIndex === from) {
    return schedule
  }
  const step: Direction = toTrackIndex > from ? 1 : -1
  let next = schedule
  for (let i = from; i !== toTrackIndex; i += step) next = moveColumn(next, id, step)
  return next
}

/**
 * Move a table column to a position among the table columns (0 = first). Refused for unknown
 * ids, tracks, out-of-range positions and no-ops.
 */
export function moveTableColumnTo(schedule: Schedule, id: string, toIndex: number): Schedule {
  const own = tableColumns(schedule)
  const from = own.findIndex((c) => c.id === id)
  if (from < 0 || !Number.isInteger(toIndex) || toIndex < 0 || toIndex >= own.length || toIndex === from) return schedule
  const step: Direction = toIndex > from ? 1 : -1
  let next = schedule
  for (let i = from; i !== toIndex; i += step) next = moveColumn(next, id, step)
  return next
}

/**
 * Switch between track-grid and table. Nothing is deleted: when the target mode has no columns
 * yet, they are created (Session/Speaker/Tag for a table, two tracks for a grid).
 */
export function setMode(schedule: Schedule, mode: Schedule['mode']): Schedule {
  if (schedule.mode === mode) return schedule
  let columns = schedule.columns
  if (mode === 'table' && tableColumns(schedule).length === 0) {
    columns = [
      ...columns,
      { id: newId('col'), name: 'Session', color: '#444746', type: 'text' },
      { id: newId('col'), name: 'Speaker', color: '#0b57d0', type: 'person' },
      { id: newId('col'), name: 'Tag', color: '#188038', type: 'tag' },
    ]
  }
  if (mode === 'track-grid' && trackColumns(schedule).length === 0) {
    columns = [
      ...columns,
      { id: newId('col'), name: 'Track 1', color: '#188038', type: 'track' },
      { id: newId('col'), name: 'Track 2', color: '#0b57d0', type: 'track' },
    ]
  }
  // First time a grid schedule becomes a table: start from its slots, so the table is not empty.
  const rows =
    mode === 'table' && schedule.rows.length === 0 ? rowsFromSlots(
          schedule.items,
          () => newId('row'),
          trackColumns(schedule).map((c) => c.id),
        ) : schedule.rows
  return { ...schedule, mode, columns, rows }
}

/** Set (or clear, with "") a table cell. Time columns only accept HH:MM. */
export function setCell(schedule: Schedule, rowId: string, columnId: string, value: string): Schedule {
  const column = schedule.columns.find((c) => c.id === columnId)
  if (!column || isTrack(column)) return schedule
  const row = schedule.rows.find((r) => r.id === rowId)
  if (!row) return schedule
  if (column.type === 'time' && value !== '' && !isTime(value)) return schedule
  const current = row.cells?.[columnId]
  let next: Row
  if (value === '') {
    if (current === undefined) return schedule
    next = withoutCell(row, columnId)
  } else {
    if (current === value) return schedule
    next = { ...row, cells: { ...row.cells, [columnId]: value } }
  }
  return { ...schedule, rows: schedule.rows.map((r) => (r.id === rowId ? next : r)) }
}

/**
 * Change a table column's type (text, time, person, tag). Becoming a time column clears cells
 * that are not HH:MM. Tracks and table columns cannot be converted into each other.
 */
export function setColumnType(schedule: Schedule, columnId: string, type: Column['type']): Schedule {
  const column = schedule.columns.find((c) => c.id === columnId)
  if (!column || isTrack(column) || !TABLE_TYPES.includes(type) || column.type === type) return schedule
  const columns = schedule.columns.map((c) => (c.id === columnId ? { ...c, type } : c))
  const rows =
    type === 'time'
      ? schedule.rows.map((r) => {
          const value = r.cells?.[columnId]
          return value !== undefined && !isTime(value) ? withoutCell(r, columnId) : r
        })
      : schedule.rows
  return { ...schedule, columns, rows }
}

/* ---------- rows (table mode) ---------- */

/** Append a row starting where the last one ends and lasting 30 minutes (capped at 23:59). */
export function addRow(schedule: Schedule, id: string = newId('row')): Schedule {
  if (schedule.rows.some((r) => r.id === id)) return schedule
  const last = schedule.rows[schedule.rows.length - 1]
  const times = newRowTimes(last?.end)
  if (!times) return schedule
  const row: Row = { id, ...times }
  return { ...schedule, rows: [...schedule.rows, row] }
}

/** Insert a row right after `rowId`, timed from the row it follows. */
export function insertRowAfter(schedule: Schedule, rowId: string, id: string = newId('row')): Schedule {
  const at = schedule.rows.findIndex((r) => r.id === rowId)
  if (at < 0 || schedule.rows.some((r) => r.id === id)) return schedule
  const times = newRowTimes((schedule.rows[at] as Row).end)
  if (!times) return schedule
  const rows = [...schedule.rows]
  rows.splice(at + 1, 0, { id, ...times })
  return { ...schedule, rows }
}

export function removeRow(schedule: Schedule, id: string): Schedule {
  if (!schedule.rows.some((r) => r.id === id)) return schedule
  return { ...schedule, rows: schedule.rows.filter((r) => r.id !== id) }
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
  return { ...schedule, rows }
}

/** Move a row to a position (0 = first). Refused for unknown ids, out-of-range positions and no-ops. */
export function moveRowTo(schedule: Schedule, id: string, toIndex: number): Schedule {
  const from = schedule.rows.findIndex((r) => r.id === id)
  if (from < 0 || !Number.isInteger(toIndex) || toIndex < 0 || toIndex >= schedule.rows.length || toIndex === from) return schedule
  const rows = [...schedule.rows]
  const [moved] = rows.splice(from, 1)
  rows.splice(toIndex, 0, moved as Row)
  return { ...schedule, rows }
}

/* ---------- items (track grid) ---------- */

export type ItemInit = Partial<
  Pick<Item, 'id' | 'title' | 'speaker' | 'tag' | 'variant' | 'continuationLabel' | 'note'>
>

/**
 * Create a session over `columnIds` (existing track columns, contiguous) from `start` to `end`.
 * Refused when the times are malformed, reversed or shorter than 5 minutes, or when any other
 * item already occupies part of that time in those columns.
 */
export function addItem(
  schedule: Schedule,
  columnIds: readonly string[],
  start: string,
  end: string,
  partial: ItemInit = {},
): Schedule {
  const range = validRange(start, end)
  if (!range || range.end - range.start < MIN_ITEM_MINUTES) return schedule

  const tracks = trackColumns(schedule)
  const cmap = indexMap(tracks)
  const wanted = [...new Set(columnIds)]
  if (wanted.length === 0 || wanted.some((id) => !cmap.has(id))) return schedule
  const sorted = wanted.sort((a, b) => (cmap.get(a) as number) - (cmap.get(b) as number))
  const first = cmap.get(sorted[0] as string) as number
  if (sorted.some((id, k) => cmap.get(id) !== first + k)) return schedule // not contiguous

  const id = partial.id ?? newId('item')
  if (schedule.items.some((i) => i.id === id)) return schedule
  const variant = partial.variant ?? 'session'
  if (!VARIANTS.includes(variant)) return schedule
  if (!slotFree(schedule, sorted, range.start, range.end)) return schedule

  let item: Item = { id, columnIds: sorted, start, end, title: partial.title ?? 'New session', variant }
  if (partial.speaker) item = { ...item, speaker: partial.speaker }
  if (partial.tag) item = { ...item, tag: partial.tag }
  if (partial.continuationLabel) item = { ...item, continuationLabel: partial.continuationLabel }
  if (partial.note) item = { ...item, note: partial.note }
  return { ...schedule, items: [...schedule.items, item] }
}

const DEFAULT_START_MINUTES = 9 * 60
const SUGGEST_STEP = 5
const SUGGEST_LENGTH = 30

/**
 * Where a new 30-minute session fits: right after the last one on the first track, else the first
 * free gap from 09:00. Null when there is no track or no room.
 */
export function suggestSlot(schedule: Schedule): { columnId: string; start: string; end: string } | null {
  const first = trackColumns(schedule)[0]
  if (!first) return null
  const after = schedule.items
    .filter((i) => i.columnIds.includes(first.id) && isTime(i.end))
    .reduce((latest, i) => Math.max(latest, toMinutes(i.end)), DEFAULT_START_MINUTES)
  for (const from of [after, DEFAULT_START_MINUTES]) {
    for (let start = from; start + SUGGEST_LENGTH <= LAST_MINUTE; start += SUGGEST_STEP) {
      if (slotFree(schedule, [first.id], start, start + SUGGEST_LENGTH)) {
        return { columnId: first.id, start: fromMinutes(start), end: fromMinutes(start + SUGGEST_LENGTH) }
      }
    }
  }
  return null
}

export type ItemPatch = Partial<Pick<Item, 'title' | 'speaker' | 'tag' | 'variant' | 'continuationLabel' | 'note'>>

/** Edit text fields and variant. An empty speaker/tag/continuationLabel/note removes it. Time and columns have their own ops. */
export function updateItem(schedule: Schedule, id: string, patch: ItemPatch): Schedule {
  const item = schedule.items.find((i) => i.id === id)
  if (!item) return schedule
  if (patch.variant !== undefined && !VARIANTS.includes(patch.variant)) return schedule
  let next: Item = { ...item }
  if (patch.title !== undefined) next.title = patch.title
  if (patch.variant !== undefined) next.variant = patch.variant
  for (const key of ['speaker', 'tag', 'continuationLabel', 'note'] as const) {
    const value = patch[key]
    if (value !== undefined) next = value === '' ? omitKey(next, key) : { ...next, [key]: value }
  }
  const unchanged = (Object.keys(next) as (keyof Item)[]).length === Object.keys(item).length &&
    (Object.keys(next) as (keyof Item)[]).every((key) => next[key] === item[key])
  return unchanged ? schedule : replaceItem(schedule, next)
}

export function removeItem(schedule: Schedule, id: string): Schedule {
  if (!schedule.items.some((i) => i.id === id)) return schedule
  return { ...schedule, items: schedule.items.filter((i) => i.id !== id) }
}

/** The item's track-column indices as a contiguous [first, last] pair, or null if it sits on no track. */
function columnRange(schedule: Schedule, item: Item): { first: number; last: number } | null {
  const indices = columnIndices(item, indexMap(trackColumns(schedule)))
  if (indices.length === 0) return null
  return { first: indices[0] as number, last: indices[indices.length - 1] as number }
}

/**
 * Move an item to a new start time, keeping its length and the number of columns it spans.
 * `target` is either how many tracks to shift by (a number) or the id of the track that should
 * become its first column. Refused when the result leaves the day, leaves the tracks, overlaps
 * another item, or changes nothing.
 */
export function moveItem(schedule: Schedule, id: string, start: string, target: number | string): Schedule {
  const item = schedule.items.find((i) => i.id === id)
  if (!item || !isTime(start) || !isTime(item.start) || !isTime(item.end)) return schedule
  const minutes = toMinutes(start)
  const length = toMinutes(item.end) - toMinutes(item.start)
  if (length <= 0 || minutes + length > LAST_MINUTE) return schedule

  const range = columnRange(schedule, item)
  if (!range) return schedule
  const tracks = trackColumns(schedule)
  const firstIndex =
    typeof target === 'number' ? range.first + target : tracks.findIndex((c) => c.id === target)
  if (!Number.isInteger(firstIndex)) return schedule
  const lastIndex = firstIndex + (range.last - range.first)
  const columnIds = trackRange(schedule, firstIndex, lastIndex)
  if (!columnIds) return schedule

  const end = fromMinutes(minutes + length)
  const sameColumns = firstIndex === range.first
  if (start === item.start && sameColumns) return schedule
  if (!slotFree(schedule, columnIds, minutes, minutes + length, id)) return schedule
  return replaceItem(schedule, { ...item, start, end, columnIds })
}

/**
 * Change an item's start and/or end. The result must be at least 5 minutes long, stay within the
 * day and overlap nothing in the item's columns; otherwise the schedule is returned unchanged.
 */
export function resizeItem(schedule: Schedule, id: string, change: { start?: string; end?: string }): Schedule {
  const item = schedule.items.find((i) => i.id === id)
  if (!item) return schedule
  const start = change.start ?? item.start
  const end = change.end ?? item.end
  const range = validRange(start, end)
  if (!range || range.end - range.start < MIN_ITEM_MINUTES) return schedule
  if (start === item.start && end === item.end) return schedule
  if (!slotFree(schedule, item.columnIds, range.start, range.end, id)) return schedule
  return replaceItem(schedule, { ...item, start, end })
}

/** Make the item span the track columns from index `first` to `last` (inclusive), if they are free. */
export function setItemColumns(schedule: Schedule, id: string, first: number, last: number): Schedule {
  const item = schedule.items.find((i) => i.id === id)
  if (!item) return schedule
  const columnIds = trackRange(schedule, first, last)
  if (!columnIds || !isTime(item.start) || !isTime(item.end)) return schedule
  if (columnIds.length === item.columnIds.length && columnIds.every((c, k) => c === item.columnIds[k])) return schedule
  if (!slotFree(schedule, columnIds, toMinutes(item.start), toMinutes(item.end), id)) return schedule
  return replaceItem(schedule, { ...item, columnIds })
}

export function spanAllColumns(schedule: Schedule, id: string): Schedule {
  return setItemColumns(schedule, id, 0, trackColumns(schedule).length - 1)
}

/**
 * Copy an item into the next free time below it: same columns and length, starting at the first
 * moment at or after the original's end where nothing else is in the way.
 */
export function duplicateItem(schedule: Schedule, id: string, newItemId: string = newId('item')): Schedule {
  const item = schedule.items.find((i) => i.id === id)
  if (!item || !isTime(item.start) || !isTime(item.end) || schedule.items.some((i) => i.id === newItemId)) return schedule
  const length = toMinutes(item.end) - toMinutes(item.start)
  let start = toMinutes(item.end)
  for (;;) {
    if (start + length > LAST_MINUTE) return schedule
    const blockers = conflictingItems(schedule.items, item.columnIds, start, start + length)
    if (blockers.length === 0) break
    start = Math.max(...blockers.map((b) => toMinutes(b.end)))
  }
  const copy: Item = { ...item, id: newItemId, start: fromMinutes(start), end: fromMinutes(start + length) }
  return { ...schedule, items: [...schedule.items, copy] }
}

/* ---------- speakers ---------- */

const sameName = (a: string, b: string): boolean => a.trim() !== '' && a.trim().toLowerCase() === b.trim().toLowerCase()

/** Append a speaker. Refused for a duplicate id, a bad colour or a photo that is not a data:image URI. */
export function addSpeaker(
  schedule: Schedule,
  init: { id?: string; name?: string; role?: string; color?: string; photo?: string } = {},
): Schedule {
  const id = init.id ?? newId('spk')
  if (schedule.speakers.some((s) => s.id === id)) return schedule
  if (init.color !== undefined && !HEX_COLOR.test(init.color)) return schedule
  if (init.photo !== undefined && !init.photo.startsWith('data:image/')) return schedule
  const speaker: Schedule['speakers'][number] = {
    id,
    name: init.name ?? '',
    role: init.role ?? '',
    color: init.color ?? (COLUMN_PALETTE[schedule.speakers.length % COLUMN_PALETTE.length] as string),
  }
  if (init.photo) speaker.photo = init.photo
  return { ...schedule, speakers: [...schedule.speakers, speaker] }
}

/**
 * Edit a speaker. Renaming also renames them in the sessions and table person cells that used the
 * old name (case-insensitively), so the avatar keeps matching. `photo: null` removes the photo.
 */
export function updateSpeaker(
  schedule: Schedule,
  id: string,
  patch: { name?: string; role?: string; color?: string; photo?: string | null },
): Schedule {
  const speaker = schedule.speakers.find((s) => s.id === id)
  if (!speaker) return schedule
  if (patch.color !== undefined && !HEX_COLOR.test(patch.color)) return schedule
  if (typeof patch.photo === 'string' && !patch.photo.startsWith('data:image/')) return schedule
  let next = { ...speaker }
  if (patch.name !== undefined) next.name = patch.name
  if (patch.role !== undefined) next.role = patch.role
  if (patch.color !== undefined) next.color = patch.color
  if (patch.photo === null) next = omitKey(next, 'photo')
  else if (patch.photo !== undefined) next.photo = patch.photo
  if (JSON.stringify(next) === JSON.stringify(speaker)) return schedule

  let result: Schedule = { ...schedule, speakers: schedule.speakers.map((s) => (s.id === id ? next : s)) }
  if (patch.name !== undefined && patch.name !== speaker.name && speaker.name.trim() !== '') {
    const personColumns = new Set(schedule.columns.filter((c) => c.type === 'person').map((c) => c.id))
    result = {
      ...result,
      items: result.items.map((i) => (i.speaker !== undefined && sameName(i.speaker, speaker.name) ? { ...i, speaker: patch.name as string } : i)),
      rows: result.rows.map((r) => {
        if (!r.cells) return r
        let changed = false
        const cells = { ...r.cells }
        for (const [columnId, value] of Object.entries(cells)) {
          if (personColumns.has(columnId) && sameName(value, speaker.name)) {
            cells[columnId] = patch.name as string
            changed = true
          }
        }
        return changed ? { ...r, cells } : r
      }),
    }
  }
  return result
}

export function removeSpeaker(schedule: Schedule, id: string): Schedule {
  if (!schedule.speakers.some((s) => s.id === id)) return schedule
  return { ...schedule, speakers: schedule.speakers.filter((s) => s.id !== id) }
}
