import { newId } from '../model/ids.ts'
import type { Schedule } from '../model/schema.ts'
import type { Template } from './types.ts'

/** Give every column, row, item and speaker a new id and rewrite every reference to them. */
export function remapIds(schedule: Schedule, makeId: (prefix: 'col' | 'row' | 'item' | 'spk') => string = newId): Schedule {
  const copy = structuredClone(schedule)
  const columns = new Map(copy.columns.map((c) => [c.id, makeId('col')]))
  const rows = new Map(copy.rows.map((r) => [r.id, makeId('row')]))
  const lookup = (map: Map<string, string>, id: string) => map.get(id) ?? id

  for (const column of copy.columns) column.id = lookup(columns, column.id)
  for (const row of copy.rows) {
    row.id = lookup(rows, row.id)
    if (row.cells) row.cells = Object.fromEntries(Object.entries(row.cells).map(([key, value]) => [lookup(columns, key), value]))
  }
  for (const item of copy.items) {
    item.id = makeId('item')
    item.columnIds = item.columnIds.map((id) => lookup(columns, id))
  }
  for (const speaker of copy.speakers) speaker.id = makeId('spk')
  return copy
}

/** Today's date as YYYY-MM-DD in the given IANA timezone (UTC if it cannot be used). */
export function todayIn(timezone: string, now: Date = new Date()): string {
  const format = (timeZone: string) => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
    const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
    return `${pick('year')}-${pick('month')}-${pick('day')}`
  }
  try {
    return format(timezone)
  } catch {
    return format('UTC')
  }
}

/**
 * A fresh, editable schedule from a template: deep-cloned, with all ids regenerated and every
 * reference remapped, and the event date set to today in the template's timezone.
 */
export function instantiate(template: Pick<Template, 'schedule'>, today: Date = new Date()): Schedule {
  const schedule = remapIds(template.schedule)
  schedule.event.date = todayIn(schedule.event.timezone, today)
  return schedule
}

/** The schedule with positional ids and no date, so two schedules can be compared by content. */
export function canonical(schedule: Schedule): Schedule {
  const counters = { col: 0, row: 0, item: 0, spk: 0 }
  const copy = remapIds(schedule, (prefix) => `${prefix}${counters[prefix]++}`)
  copy.event.date = ''
  return copy
}
