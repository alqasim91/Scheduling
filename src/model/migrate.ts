/**
 * File-format migrations.
 *
 * Every saved schedule carries a `version`. `migrate` upgrades older files one
 * step at a time until they reach CURRENT_VERSION, so the rest of the app only
 * ever sees the latest shape.
 *
 * To add a version N+1:
 *   1. bump CURRENT_VERSION,
 *   2. add `N: (raw, warnings) => ({ ...raw, version: N + 1, /* reshape here *\/ })` to UPGRADERS,
 *   3. update the zod schema's `version` literal.
 *
 * An upgrader may push human-readable notes onto `warnings` for anything it had to drop or adjust;
 * `parseSchedule` hands them to the UI.
 *
 * Version history:
 *   1 -> 2  Grid items are placed by absolute `start`/`end` times instead of `rowId`/`rowSpan`.
 *           Rows now belong to table mode only; a grid-mode row note moves to `note` on an item.
 */
import { TIME_PATTERN, toMinutes, fromMinutes } from './time.ts'

export const CURRENT_VERSION = 2

type RawSchedule = Record<string, unknown>
type RawItem = Record<string, unknown>

export interface MigrationResult {
  doc: unknown
  warnings: string[]
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const asString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)

const isTime = (value: unknown): value is string => typeof value === 'string' && TIME_PATTERN.test(value)

function label(item: RawItem): string {
  const title = asString(item.title)?.trim()
  return `"${title || asString(item.id) || 'Untitled session'}"`
}

/** v1 -> v2: bake row placement into absolute times and move grid row notes onto items. */
function upgradeV1(raw: RawSchedule, warnings: string[]): RawSchedule {
  const rows = (Array.isArray(raw.rows) ? raw.rows : []).filter(isObject)
  const columns = (Array.isArray(raw.columns) ? raw.columns : []).filter(isObject)
  const rowIndex = new Map<string, number>()
  rows.forEach((row, i) => {
    const id = asString(row.id)
    if (id !== undefined && !rowIndex.has(id)) rowIndex.set(id, i)
  })
  const columnIndex = new Map<string, number>()
  columns.forEach((column, i) => {
    const id = asString(column.id)
    if (id !== undefined && !columnIndex.has(id)) columnIndex.set(id, i)
  })

  // Pass 1: times. `rowOf` remembers which row each item sat in, for the note step.
  const rowOf = new Map<RawItem, string | undefined>()
  const items: RawItem[] = (Array.isArray(raw.items) ? raw.items : []).map((entry) => {
    if (!isObject(entry)) return entry as RawItem
    const { rowId, rowSpan, ...rest } = entry
    const row = typeof rowId === 'string' ? rowIndex.get(rowId) : undefined
    const span = typeof rowSpan === 'number' && Number.isInteger(rowSpan) && rowSpan >= 1 ? rowSpan : 1
    const lastRow = row === undefined ? undefined : Math.min(rows.length - 1, row + span - 1)
    const start = rest.start ?? (row === undefined ? undefined : rows[row]?.start)
    const end = rest.end ?? (lastRow === undefined ? undefined : rows[lastRow]?.end)
    if ((start === undefined || end === undefined) && row === undefined) {
      throw new Error(`Item ${label(entry)} points at unknown row ${JSON.stringify(rowId)}`)
    }
    const next: RawItem = { ...rest, start, end }
    rowOf.set(next, typeof rowId === 'string' ? rowId : undefined)
    return next
  })

  // Pass 2: a grid-mode row note moves onto the first item of that row (in column order).
  let nextRows = rows
  if (raw.mode === 'track-grid') {
    nextRows = rows.map((row) => {
      const note = asString(row.note)
      if (note === undefined) return row
      const { note: _note, ...withoutNote } = row
      void _note
      if (note.trim() === '') return withoutNote
      const owners = items
        .filter((item) => isObject(item) && rowOf.get(item) === row.id)
        .map((item, order) => ({ item, order, column: Math.min(...(Array.isArray(item.columnIds) ? item.columnIds : []).map((id) => columnIndex.get(String(id)) ?? Infinity)) }))
        .sort((a, b) => a.column - b.column || a.order - b.order)
      const first = owners[0]?.item
      if (!first) {
        warnings.push(`The note on the ${row.start ?? '?'}–${row.end ?? '?'} row (“${note}”) was dropped because no session sits in that row.`)
      } else {
        first.note = note
      }
      return withoutNote
    })
  }

  trimOverlaps(items, warnings)
  return { ...raw, version: 2, rows: nextRows, items }
}

/**
 * v1 let an item run past its row on top of a neighbour's cell. Version 2 forbids overlaps, so the
 * earlier item is shortened to end where the later one starts (and the user is told).
 */
function trimOverlaps(items: RawItem[], warnings: string[]): void {
  const usable = items.filter(
    (item) => isObject(item) && isTime(item.start) && isTime(item.end) && Array.isArray(item.columnIds),
  )
  const byStart = [...usable].sort((a, b) => toMinutes(a.start as string) - toMinutes(b.start as string))
  for (let i = 0; i < byStart.length; i++) {
    const a = byStart[i] as RawItem
    for (let j = i + 1; j < byStart.length; j++) {
      const b = byStart[j] as RawItem
      const aStart = toMinutes(a.start as string)
      const aEnd = toMinutes(a.end as string)
      const bStart = toMinutes(b.start as string)
      if (bStart >= aEnd) break
      if (bStart <= aStart) continue
      const shared = (a.columnIds as unknown[]).some((id) => (b.columnIds as unknown[]).includes(id))
      if (!shared) continue
      warnings.push(`${label(a)} was shortened to end at ${fromMinutes(bStart)} because it overlapped ${label(b)} in the same track.`)
      a.end = fromMinutes(bStart)
    }
  }
}

/** UPGRADERS[n] converts a version-n document into a version-(n+1) document. */
const UPGRADERS: Record<number, (raw: RawSchedule, warnings: string[]) => RawSchedule> = {
  1: upgradeV1,
}

/** Upgrade to CURRENT_VERSION and report what had to be dropped or adjusted on the way. */
export function migrateWithWarnings(raw: unknown): MigrationResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Schedule file must be a JSON object')
  }
  let doc = raw as RawSchedule
  const version = doc.version
  if (version === undefined) {
    throw new Error('Schedule file has no "version" field')
  }
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new Error(`Invalid schedule version ${JSON.stringify(version)}`)
  }
  if (version > CURRENT_VERSION) {
    throw new Error(
      `Schedule file version ${version} is newer than this app supports (version ${CURRENT_VERSION}). Update the app to open it.`,
    )
  }
  const warnings: string[] = []
  for (let v = version; v < CURRENT_VERSION; v++) {
    const upgrade = UPGRADERS[v]
    if (!upgrade) throw new Error(`No migration available from schedule version ${v}`)
    doc = upgrade(doc, warnings)
  }
  return { doc, warnings }
}

/** Like `migrateWithWarnings`, for callers that only want the upgraded document. */
export function migrate(raw: unknown): unknown {
  return migrateWithWarnings(raw).doc
}
