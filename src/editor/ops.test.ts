import { describe, expect, it } from 'vitest'
import { createEmptySchedule } from '../model/defaults.ts'
import { conflictingItems } from '../model/overlap.ts'
import { fromMinutes, toMinutes } from '../model/time.ts'
import { tableDemo } from '../render/__fixtures__/tableDemo.ts'
import { BUILTIN_TEMPLATES } from '../templates/builtin/index.ts'
import { instantiate } from '../templates/instantiate.ts'
import type { Item, Schedule } from '../model/schema.ts'
import { parseSchedule } from '../model/validate.ts'
import { cairoSample } from '../samples/cairo.ts'
import {
  LAST_MINUTE,
  addColumn,
  addItem,
  addRow,
  addSpeaker,
  updateSpeaker,
  removeSpeaker,
  moveRowTo,
  duplicateItem,
  insertRowAfter,
  moveColumn,
  moveColumnTo,
  moveItem,
  moveRow,
  moveTableColumnTo,
  removeColumn,
  removeItem,
  removeRow,
  renameColumn,
  resizeItem,
  setColumnColor,
  setRowNote,
  setCell,
  setColumnType,
  setItemColumns,
  setMode,
  setRowTimes,
  suggestSlot,
  tableColumns,
  trackColumns,
  spanAllColumns,
  updateItem,
  type Direction,
} from './ops.ts'

/** Minimal valid schedule with explicit ids: tracks A,B,C and table rows r1..r4 (09:00-11:00), no items. */
function grid(): Schedule {
  const base = createEmptySchedule()
  return {
    ...base,
    columns: ['A', 'B', 'C'].map((id) => ({ id, name: id, color: '#0b57d0', type: 'track' as const })),
    rows: [
      { id: 'r1', start: '09:00', end: '09:30' },
      { id: 'r2', start: '09:30', end: '10:00' },
      { id: 'r3', start: '10:00', end: '10:30' },
      { id: 'r4', start: '10:30', end: '11:00' },
    ],
    items: [],
  }
}

/** Add an item directly (bypassing the ops), 09:00-10:00 unless told otherwise. */
function withItem(s: Schedule, item: Partial<Item> & { id: string; columnIds: string[] }): Schedule {
  return { ...s, items: [...s.items, { title: item.id, variant: 'session', start: '09:00', end: '10:00', ...item }] }
}

const item = (s: Schedule, id: string): Item => {
  const found = s.items.find((i) => i.id === id)
  if (!found) throw new Error(`no item ${id}`)
  return found
}

const times = (s: Schedule, id: string): string => `${item(s, id).start}-${item(s, id).end}`

function expectValid(s: Schedule) {
  const result = parseSchedule(s)
  expect(result.ok, result.ok ? '' : result.errors.join('; ')).toBe(true)
}

describe('columns', () => {
  it('addColumn appends a track column with a default name and palette colour', () => {
    const next = addColumn(grid())
    expect(next.columns).toHaveLength(4)
    expect(next.columns[3]).toMatchObject({ name: 'Track 4', type: 'track' })
    expect(next.columns[3]?.color).toMatch(/^#[0-9a-f]{6}$/)
    expectValid(next)
  })

  it('addColumn accepts an explicit id/name/colour and refuses bad ones', () => {
    const next = addColumn(grid(), { id: 'D', name: 'Workshop', color: '#d93025' })
    expect(next.columns[3]).toEqual({ id: 'D', name: 'Workshop', color: '#d93025', type: 'track' })
    const s = grid()
    expect(addColumn(s, { id: 'A' })).toBe(s)
    expect(addColumn(s, { color: 'red' })).toBe(s)
  })

  it('removeColumn drops the id from items and deletes items left with no columns', () => {
    let s = withItem(grid(), { id: 'wide', columnIds: ['A', 'B', 'C'] })
    s = withItem(s, { id: 'onlyB', columnIds: ['B'] })
    const next = removeColumn(s, 'B')
    expect(next.columns.map((c) => c.id)).toEqual(['A', 'C'])
    expect(item(next, 'wide').columnIds).toEqual(['A', 'C'])
    expect(next.items.map((i) => i.id)).toEqual(['wide'])
    expectValid(next)
  })

  it('removeColumn keeps only the contiguous part containing the first remaining id', () => {
    const s = {
      ...withItem(grid(), { id: 'gappy', columnIds: ['A', 'C'] }),
      columns: [...grid().columns, { id: 'D', name: 'D', color: '#0b57d0', type: 'track' as const }],
    }
    const next = removeColumn(s, 'D')
    expect(item(next, 'gappy').columnIds).toEqual(['A'])
    // Removing the first id promotes the next one.
    expect(item(removeColumn(s, 'A'), 'gappy').columnIds).toEqual(['C'])
  })

  it('removeColumn ignores unknown ids', () => {
    const s = grid()
    expect(removeColumn(s, 'nope')).toBe(s)
  })

  it('renameColumn and setColumnColor change one column; bad input is refused', () => {
    const s = grid()
    expect(renameColumn(s, 'B', 'Beginner').columns[1]?.name).toBe('Beginner')
    expect(setColumnColor(s, 'B', '#112233').columns[1]?.color).toBe('#112233')
    expect(renameColumn(s, 'nope', 'x')).toBe(s)
    expect(setColumnColor(s, 'B', 'blue')).toBe(s)
    expect(setColumnColor(s, 'nope', '#112233')).toBe(s)
  })

  it('moveColumn swaps neighbours and refuses at the edges', () => {
    const s = grid()
    expect(moveColumn(s, 'A', 1).columns.map((c) => c.id)).toEqual(['B', 'A', 'C'])
    expect(moveColumn(s, 'C', -1).columns.map((c) => c.id)).toEqual(['A', 'C', 'B'])
    expect(moveColumn(s, 'A', -1)).toBe(s)
    expect(moveColumn(s, 'C', 1)).toBe(s)
    expect(moveColumn(s, 'nope', 1)).toBe(s)
  })

  it('moveColumn re-sorts item columns and keeps spans that stay contiguous', () => {
    const s = withItem(grid(), { id: 'ab', columnIds: ['A', 'B'] })
    const swapped = moveColumn(s, 'A', 1) // B, A, C
    expect(item(swapped, 'ab').columnIds).toEqual(['B', 'A'])
    expectValid(swapped)
  })

  it('moveColumn shrinks an item that would become non-contiguous to its first column run', () => {
    const s = withItem(grid(), { id: 'ab', columnIds: ['A', 'B'] })
    const moved = moveColumn(s, 'B', 1) // A, C, B
    expect(item(moved, 'ab').columnIds).toEqual(['A'])
    expectValid(moved)
  })
})

describe('moveColumnTo', () => {
  it('moves a track to a position among the tracks', () => {
    const s = grid()
    expect(moveColumnTo(s, 'A', 2).columns.map((c) => c.id)).toEqual(['B', 'C', 'A'])
    expect(moveColumnTo(s, 'C', 0).columns.map((c) => c.id)).toEqual(['C', 'A', 'B'])
    expect(moveColumnTo(s, 'B', 2).columns.map((c) => c.id)).toEqual(['A', 'C', 'B'])
  })

  it('refuses no-ops, bad positions and unknown or table columns', () => {
    const s = setMode(grid(), 'table')
    expect(moveColumnTo(s, 'A', 0)).toBe(s)
    expect(moveColumnTo(s, 'A', 3)).toBe(s)
    expect(moveColumnTo(s, 'A', -1)).toBe(s)
    expect(moveColumnTo(s, 'A', 0.5)).toBe(s)
    expect(moveColumnTo(s, 'nope', 1)).toBe(s)
    expect(moveColumnTo(s, tableColumns(s)[0]!.id, 1)).toBe(s)
  })

  it('keeps the sessions valid and contiguous, shrinking spans that stop being contiguous', () => {
    const s = withItem(withItem(grid(), { id: 'ab', columnIds: ['A', 'B'] }), { id: 'c', columnIds: ['C'], start: '11:00', end: '12:00' })
    const moved = moveColumnTo(s, 'B', 2) // A, C, B
    expect(item(moved, 'ab').columnIds).toEqual(['A'])
    expect(item(moved, 'c').columnIds).toEqual(['C'])
    expectValid(moved)
  })
})

describe('moveTableColumnTo', () => {
  it('moves a table column to a position among the table columns', () => {
    const s = setMode(grid(), 'table')
    const [a, b, c] = tableColumns(s).map((col) => col.id) as [string, string, string]
    const order = (x: typeof s) => tableColumns(x).map((col) => col.id)
    expect(order(moveTableColumnTo(s, a, 2))).toEqual([b, c, a])
    expect(order(moveTableColumnTo(s, c, 0))).toEqual([c, a, b])
  })

  it('refuses no-ops, bad positions, tracks and unknown ids', () => {
    const s = setMode(grid(), 'table')
    const a = tableColumns(s)[0]!.id
    expect(moveTableColumnTo(s, a, 0)).toBe(s)
    expect(moveTableColumnTo(s, a, 3)).toBe(s)
    expect(moveTableColumnTo(s, a, -1)).toBe(s)
    expect(moveTableColumnTo(s, 'A', 1)).toBe(s)
    expect(moveTableColumnTo(s, 'nope', 1)).toBe(s)
  })
})

describe('rows', () => {
  it('addRow appends a 30 minute row starting where the previous one ended', () => {
    const next = addRow(grid(), 'new')
    expect(next.rows.at(-1)).toEqual({ id: 'new', start: '11:00', end: '11:30' })
    expectValid(next)
  })

  it('addRow starts at 09:00 on an empty schedule and caps the end at 23:59', () => {
    expect(addRow({ ...grid(), rows: [] }, 'a').rows).toEqual([{ id: 'a', start: '09:00', end: '09:30' }])
    const late = { ...grid(), rows: [{ id: 'l', start: '23:00', end: '23:45' }] }
    expect(addRow(late, 'n').rows.at(-1)).toEqual({ id: 'n', start: '23:45', end: '23:59' })
  })

  it('addRow refuses when no time is left in the day', () => {
    const full = { ...grid(), rows: [{ id: 'l', start: '23:00', end: '23:59' }] }
    expect(addRow(full)).toBe(full)
  })

  it('insertRowAfter puts the row in the middle, timed from the row it follows', () => {
    const next = insertRowAfter(grid(), 'r1', 'mid')
    expect(next.rows.map((r) => r.id)).toEqual(['r1', 'mid', 'r2', 'r3', 'r4'])
    expect(next.rows[1]).toEqual({ id: 'mid', start: '09:30', end: '10:00' })
    expect(insertRowAfter(grid(), 'nope')).toEqual(grid())
  })

  it('rows are independent of items: inserting and removing a row leaves the grid sessions alone', () => {
    const s = withItem(grid(), { id: 'x', columnIds: ['A'], start: '09:10', end: '09:50' })
    const inserted = insertRowAfter(s, 'r1', 'mid')
    expect(inserted.items).toBe(s.items)
    const removed = removeRow(s, 'r2')
    expect(removed.rows.map((r) => r.id)).toEqual(['r1', 'r3', 'r4'])
    expect(removed.items).toBe(s.items)
    expect(removeRow(s, 'nope')).toBe(s)
    expectValid(removed)
  })

  it('setRowTimes updates times and rejects start >= end or malformed times', () => {
    const s = grid()
    expect(setRowTimes(s, 'r1', '08:00', '08:45').rows[0]).toMatchObject({ start: '08:00', end: '08:45' })
    expect(setRowTimes(s, 'r1', '10:00', '10:00')).toBe(s)
    expect(setRowTimes(s, 'r1', '11:00', '10:00')).toBe(s)
    expect(setRowTimes(s, 'r1', '9:00', '10:00')).toBe(s)
    expect(setRowTimes(s, 'nope', '08:00', '09:00')).toBe(s)
  })

  it('setRowNote sets and clears a note', () => {
    const noted = setRowNote(grid(), 'r1', 'Room change')
    expect(noted.rows[0]?.note).toBe('Room change')
    expect('note' in (setRowNote(noted, 'r1', '').rows[0] ?? {})).toBe(false)
    const s = grid()
    expect(setRowNote(s, 'nope', 'x')).toBe(s)
  })

  it('moveRow swaps neighbours and refuses at the edges', () => {
    const s = grid()
    expect(moveRow(s, 'r1', 1).rows.map((r) => r.id)).toEqual(['r2', 'r1', 'r3', 'r4'])
    expect(moveRow(s, 'r1', -1)).toBe(s)
    expect(moveRow(s, 'r4', 1)).toBe(s)
    expect(moveRow(s, 'nope', 1)).toBe(s)
  })
})

describe('addItem', () => {
  it('places a new session with the given times, columns and fields', () => {
    const next = addItem(grid(), ['B'], '09:30', '10:15', { id: 'n', title: 'Talk', speaker: 'Ada', tag: 'AI', variant: 'highlight', note: 'Hall 2' })
    expect(item(next, 'n')).toEqual({
      id: 'n',
      columnIds: ['B'],
      start: '09:30',
      end: '10:15',
      title: 'Talk',
      speaker: 'Ada',
      tag: 'AI',
      note: 'Hall 2',
      variant: 'highlight',
    })
    expectValid(next)
  })

  it('defaults to a session titled "New session" with a generated id', () => {
    const next = addItem(grid(), ['A'], '09:00', '09:30')
    expect(next.items[0]).toMatchObject({ title: 'New session', variant: 'session', columnIds: ['A'], start: '09:00', end: '09:30' })
    expect(next.items[0]?.id).toMatch(/^item_/)
  })

  it('sorts the columns into track order and accepts a contiguous multi-column span', () => {
    const next = addItem(grid(), ['C', 'B'], '09:00', '10:00', { id: 'wide' })
    expect(item(next, 'wide').columnIds).toEqual(['B', 'C'])
    expectValid(next)
  })

  it('allows sessions that touch, and sessions in other columns at the same time', () => {
    let s = addItem(grid(), ['A'], '09:00', '10:00', { id: 'a' })
    s = addItem(s, ['A'], '10:00', '11:00', { id: 'b' })
    s = addItem(s, ['A'], '08:00', '09:00', { id: 'c' })
    s = addItem(s, ['B'], '09:00', '10:00', { id: 'd' })
    expect(s.items.map((i) => i.id)).toEqual(['a', 'b', 'c', 'd'])
    expectValid(s)
  })

  it('refuses an overlap in any of its columns: partial, contained, containing or identical', () => {
    const s = withItem(grid(), { id: 'x', columnIds: ['B'], start: '09:00', end: '10:00' })
    expect(addItem(s, ['B'], '09:30', '10:30')).toBe(s)
    expect(addItem(s, ['B'], '08:30', '09:30')).toBe(s)
    expect(addItem(s, ['B'], '09:15', '09:45')).toBe(s)
    expect(addItem(s, ['B'], '08:00', '11:00')).toBe(s)
    expect(addItem(s, ['B'], '09:00', '10:00')).toBe(s)
    expect(addItem(s, ['A', 'B'], '09:30', '10:30')).toBe(s) // only one of its columns is taken
  })

  it('refuses unknown or table columns, gaps in the span, empty column lists and duplicate ids', () => {
    const s = withItem(setMode(grid(), 'table'), { id: 'x', columnIds: ['A'], start: '12:00', end: '13:00' })
    const table = tableColumns(s)[0]!.id
    expect(addItem(s, ['nope'], '09:00', '09:30')).toBe(s)
    expect(addItem(s, [table], '09:00', '09:30')).toBe(s)
    expect(addItem(s, ['A', 'C'], '09:00', '09:30')).toBe(s)
    expect(addItem(s, [], '09:00', '09:30')).toBe(s)
    expect(addItem(s, ['B'], '09:00', '09:30', { id: 'x' })).toBe(s)
    expect(addItem(s, ['B'], '09:00', '09:30', { variant: 'weird' as Item['variant'] })).toBe(s)
  })

  it.each([
    ['malformed start', '9:00', '10:00'],
    ['malformed end', '09:00', '25:00'],
    ['end of day', '09:00', '24:00'],
    ['reversed', '10:00', '09:00'],
    ['empty', '10:00', '10:00'],
    ['shorter than 5 minutes', '10:00', '10:04'],
    ['not a time', 'noon', 'later'],
  ])('refuses %s times', (_name, start, end) => {
    const s = grid()
    expect(addItem(s, ['A'], start, end)).toBe(s)
  })

  it('accepts a five minute session and one ending at 23:59', () => {
    expect(addItem(grid(), ['A'], '10:00', '10:05').items).toHaveLength(1)
    expect(addItem(grid(), ['A'], '23:00', '23:59').items).toHaveLength(1)
    expect(LAST_MINUTE).toBe(23 * 60 + 59)
  })
})

describe('updateItem', () => {
  it('edits text and variant; empty speaker/tag are removed', () => {
    const s = withItem(grid(), { id: 'x', columnIds: ['A'], speaker: 'Ada', tag: 'AI' })
    const next = updateItem(s, 'x', { title: 'New', variant: 'break', speaker: '', tag: 'ML' })
    expect(item(next, 'x')).toMatchObject({ title: 'New', variant: 'break', tag: 'ML' })
    expect('speaker' in item(next, 'x')).toBe(false)
    expect(updateItem(s, 'nope', { title: 'x' })).toBe(s)
    expect(updateItem(s, 'x', { variant: 'weird' as Item['variant'] })).toBe(s)
  })

  it('sets and clears a continuation label and a note', () => {
    const s = withItem(grid(), { id: 'x', columnIds: ['A'] })
    const set = updateItem(updateItem(s, 'x', { continuationLabel: 'Lab session' }), 'x', { note: 'Bring a laptop' })
    expect(item(set, 'x')).toMatchObject({ continuationLabel: 'Lab session', note: 'Bring a laptop' })
    expectValid(set)
    const cleared = updateItem(updateItem(set, 'x', { continuationLabel: '' }), 'x', { note: '' })
    expect('continuationLabel' in item(cleared, 'x') || 'note' in item(cleared, 'x')).toBe(false)
  })

  it('returns the same schedule when nothing changes', () => {
    const s = withItem(grid(), { id: 'x', columnIds: ['A'], title: 'Same' })
    expect(updateItem(s, 'x', { title: 'Same' })).toBe(s)
    expect(updateItem(s, 'x', { speaker: '' })).toBe(s)
    expect(updateItem(s, 'x', {})).toBe(s)
  })
})

describe('removeItem', () => {
  it('deletes an item', () => {
    const s = withItem(grid(), { id: 'x', columnIds: ['A'] })
    expect(removeItem(s, 'x').items).toEqual([])
    expect(removeItem(s, 'nope')).toBe(s)
  })
})

describe('moveItem', () => {
  const base = () => withItem(withItem(grid(), { id: 'x', columnIds: ['A'], start: '09:00', end: '10:00' }), { id: 'y', columnIds: ['B'], start: '09:00', end: '09:30' })

  it('moves in time and keeps the length', () => {
    const next = moveItem(base(), 'x', '13:15', 0)
    expect(times(next, 'x')).toBe('13:15-14:15')
    expect(item(next, 'x').columnIds).toEqual(['A'])
    expectValid(next)
  })

  it('moves across tracks by a delta or to a named track', () => {
    expect(item(moveItem(base(), 'x', '11:00', 2), 'x').columnIds).toEqual(['C'])
    expect(item(moveItem(base(), 'x', '11:00', 'C'), 'x').columnIds).toEqual(['C'])
    const z = withItem(grid(), { id: 'z', columnIds: ['C'], start: '09:00', end: '09:20' })
    expect(item(moveItem(z, 'z', '09:00', -1), 'z').columnIds).toEqual(['B'])
  })

  it('keeps the span width, and refuses to push a span off the tracks', () => {
    const s = withItem(grid(), { id: 'w', columnIds: ['A', 'B'], start: '09:00', end: '10:00' })
    expect(item(moveItem(s, 'w', '09:00', 1), 'w').columnIds).toEqual(['B', 'C'])
    expect(item(moveItem(s, 'w', '09:00', 'B'), 'w').columnIds).toEqual(['B', 'C'])
    expect(moveItem(s, 'w', '09:00', 2)).toBe(s)
    expect(moveItem(s, 'w', '09:00', 'C')).toBe(s)
    expect(moveItem(s, 'w', '09:00', -1)).toBe(s)
  })

  it('refuses an overlap at the target, in any column of the span', () => {
    const s = base()
    expect(moveItem(s, 'x', '09:15', 1)).toBe(s) // y is on B 09:00-09:30
    expect(moveItem(s, 'x', '08:45', 1)).toBe(s)
    expect(times(moveItem(s, 'x', '09:30', 1), 'x')).toBe('09:30-10:30') // touching is fine
    expect(times(moveItem(s, 'x', '08:00', 1), 'x')).toBe('08:00-09:00')
  })

  it('may overlap its own old position', () => {
    expect(times(moveItem(base(), 'x', '09:20', 0), 'x')).toBe('09:20-10:20')
    expect(times(moveItem(base(), 'x', '08:40', 0), 'x')).toBe('08:40-09:40')
  })

  it('refuses to leave the day', () => {
    const s = base()
    expect(moveItem(s, 'x', '23:30', 0)).toBe(s) // would end at 24:30
    expect(moveItem(s, 'x', '23:00', 0)).toBe(s) // ends at 24:00
    expect(times(moveItem(s, 'x', '22:59', 0), 'x')).toBe('22:59-23:59')
    expect(moveItem(s, 'x', '24:00', 0)).toBe(s)
    expect(moveItem(s, 'x', '9:00', 1)).toBe(s)
  })

  it('refuses unknown items and tracks, and a move that changes nothing', () => {
    const s = base()
    expect(moveItem(s, 'nope', '10:00', 0)).toBe(s)
    expect(moveItem(s, 'x', '10:00', 'nope')).toBe(s)
    expect(moveItem(s, 'x', '10:00', 1.5)).toBe(s)
    expect(moveItem(s, 'x', '09:00', 0)).toBe(s)
    expect(moveItem(s, 'x', '09:00', 'A')).toBe(s)
  })

  it('does not accept a table column as a target', () => {
    const s = withItem(setMode(grid(), 'table'), { id: 'x', columnIds: ['A'] })
    expect(moveItem(s, 'x', '10:00', tableColumns(s)[0]!.id)).toBe(s)
    expect(moveItem(s, 'x', '10:00', 3)).toBe(s)
  })
})

describe('resizeItem', () => {
  const base = () => withItem(withItem(grid(), { id: 'x', columnIds: ['A'], start: '09:00', end: '10:00' }), { id: 'y', columnIds: ['A'], start: '10:30', end: '11:00' })

  it('changes the end, the start or both', () => {
    expect(times(resizeItem(base(), 'x', { end: '10:15' }), 'x')).toBe('09:00-10:15')
    expect(times(resizeItem(base(), 'x', { start: '08:30' }), 'x')).toBe('08:30-10:00')
    expect(times(resizeItem(base(), 'x', { start: '08:30', end: '09:45' }), 'x')).toBe('08:30-09:45')
    expectValid(resizeItem(base(), 'x', { end: '10:15' }))
  })

  it('may grow until it touches a neighbour, but not into it', () => {
    expect(times(resizeItem(base(), 'x', { end: '10:30' }), 'x')).toBe('09:00-10:30')
    const s = base()
    expect(resizeItem(s, 'x', { end: '10:31' })).toBe(s)
    expect(resizeItem(s, 'y', { start: '09:59' })).toBe(s)
    expect(times(resizeItem(s, 'y', { start: '10:00' }), 'y')).toBe('10:00-11:00')
  })

  it('refuses reversed, empty, too short, malformed or out-of-day times', () => {
    const s = base()
    expect(resizeItem(s, 'x', { end: '09:00' })).toBe(s)
    expect(resizeItem(s, 'x', { end: '08:00' })).toBe(s)
    expect(resizeItem(s, 'x', { end: '09:04' })).toBe(s)
    expect(times(resizeItem(s, 'x', { end: '09:05' }), 'x')).toBe('09:00-09:05')
    expect(resizeItem(s, 'x', { start: '9:00' })).toBe(s)
    expect(resizeItem(s, 'x', { end: '24:00' })).toBe(s)
    expect(resizeItem(s, 'x', { start: '10:00' })).toBe(s)
  })

  it('refuses unknown items and a resize that changes nothing', () => {
    const s = base()
    expect(resizeItem(s, 'nope', { end: '10:10' })).toBe(s)
    expect(resizeItem(s, 'x', {})).toBe(s)
    expect(resizeItem(s, 'x', { start: '09:00', end: '10:00' })).toBe(s)
  })

  it('looks at every column of a multi-column item', () => {
    const s = withItem(withItem(grid(), { id: 'w', columnIds: ['A', 'B'], start: '09:00', end: '10:00' }), { id: 'z', columnIds: ['B'], start: '10:00', end: '11:00' })
    expect(resizeItem(s, 'w', { end: '10:05' })).toBe(s)
    expect(times(resizeItem(s, 'w', { start: '08:00' }), 'w')).toBe('08:00-10:00')
  })
})

describe('setItemColumns', () => {
  const base = () => withItem(grid(), { id: 'x', columnIds: ['B'] })

  it('widens, narrows and shifts the span by track index', () => {
    expect(item(setItemColumns(base(), 'x', 0, 2), 'x').columnIds).toEqual(['A', 'B', 'C'])
    expect(item(setItemColumns(base(), 'x', 1, 2), 'x').columnIds).toEqual(['B', 'C'])
    expect(item(setItemColumns(base(), 'x', 2, 2), 'x').columnIds).toEqual(['C'])
    const wide = setItemColumns(base(), 'x', 0, 2)
    expect(item(setItemColumns(wide, 'x', 1, 1), 'x').columnIds).toEqual(['B'])
  })

  it('refuses an overlap with another item in the new columns, but not elsewhere in time', () => {
    const blocked = withItem(base(), { id: 'y', columnIds: ['C'], start: '09:30', end: '09:40' })
    expect(setItemColumns(blocked, 'x', 1, 2)).toBe(blocked)
    expect(item(setItemColumns(blocked, 'x', 0, 1), 'x').columnIds).toEqual(['A', 'B'])
    const clear = withItem(base(), { id: 'y', columnIds: ['C'], start: '10:00', end: '10:30' })
    expect(item(setItemColumns(clear, 'x', 1, 2), 'x').columnIds).toEqual(['B', 'C'])
  })

  it('refuses bad ranges, unknown items and no-ops', () => {
    const s = base()
    for (const [a, b] of [[-1, 1], [0, 3], [2, 1], [0.5, 1]] as const) expect(setItemColumns(s, 'x', a, b)).toBe(s)
    expect(setItemColumns(s, 'nope', 0, 1)).toBe(s)
    expect(setItemColumns(s, 'x', 1, 1)).toBe(s)
  })

  it('spanAllColumns spans every track when they are free, and refuses otherwise', () => {
    const s = base()
    const next = spanAllColumns(s, 'x')
    expect(item(next, 'x').columnIds).toEqual(['A', 'B', 'C'])
    expect(spanAllColumns(next, 'x')).toBe(next)
    const blocked = withItem(s, { id: 'y', columnIds: ['C'] })
    expect(spanAllColumns(blocked, 'x')).toBe(blocked)
  })

  it('only sees track columns', () => {
    const s = withItem(setMode(grid(), 'table'), { id: 'x', columnIds: ['B'] })
    expect(item(spanAllColumns(s, 'x'), 'x').columnIds).toEqual(['A', 'B', 'C'])
  })
})

describe('duplicateItem', () => {
  it('copies the session into the next free time below it, with a new id', () => {
    const s = withItem(grid(), { id: 'x', columnIds: ['A', 'B'], start: '09:00', end: '09:45', speaker: 'Ada', note: 'n' })
    const next = duplicateItem(s, 'x', 'copy')
    expect(next.items.map((i) => i.id)).toEqual(['x', 'copy'])
    expect(item(next, 'copy')).toEqual({ ...item(s, 'x'), id: 'copy', start: '09:45', end: '10:30' })
    expectValid(next)
    expect(item(duplicateItem(s, 'x'), 'x')).toBe(item(s, 'x'))
    expect(duplicateItem(s, 'x').items[1]?.id).toMatch(/^item_/)
  })

  it('skips past sessions in the way', () => {
    let s = withItem(grid(), { id: 'x', columnIds: ['A'], start: '09:00', end: '09:30' })
    s = withItem(s, { id: 'in-way', columnIds: ['A'], start: '09:40', end: '10:20' })
    s = withItem(s, { id: 'other-track', columnIds: ['B'], start: '09:30', end: '12:00' })
    expect(times(duplicateItem(s, 'x', 'copy'), 'copy')).toBe('10:20-10:50')
    const tight = withItem(s, { id: 'in-way2', columnIds: ['A'], start: '10:30', end: '11:00' })
    expect(times(duplicateItem(tight, 'x', 'copy'), 'copy')).toBe('11:00-11:30')
  })

  it('refuses when no room is left in the day, or for unknown ids', () => {
    const late = withItem(grid(), { id: 'x', columnIds: ['A'], start: '23:00', end: '23:50' })
    expect(duplicateItem(late, 'x')).toBe(late)
    expect(duplicateItem(late, 'nope')).toBe(late)
    expect(duplicateItem(late, 'x', 'x')).toBe(late)
  })
})

describe('suggestSlot', () => {
  it('starts at 09:00 on an empty first track, then follows the last session', () => {
    expect(suggestSlot(grid())).toEqual({ columnId: 'A', start: '09:00', end: '09:30' })
    const s = withItem(grid(), { id: 'x', columnIds: ['A'], start: '09:00', end: '11:20' })
    expect(suggestSlot(s)).toEqual({ columnId: 'A', start: '11:20', end: '11:50' })
  })

  it('works around sessions that span the first track, and gives up without a track or room', () => {
    const s = withItem(grid(), { id: 'x', columnIds: ['B', 'C'], start: '09:00', end: '10:00' })
    expect(suggestSlot(s)).toEqual({ columnId: 'A', start: '09:00', end: '09:30' })
    expect(suggestSlot({ ...grid(), columns: [] })).toBeNull()
    const full = withItem(grid(), { id: 'x', columnIds: ['A'], start: '00:00', end: '23:59' })
    expect(suggestSlot(full)).toBeNull()
  })
})

/* ---------- random sequence invariant ---------- */

/** Small deterministic PRNG (mulberry32). */
function seeded(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function checkInvariants(s: Schedule) {
  expectValid(s) // includes the no-overlap rule
  const order = new Map(trackColumns(s).map((c, i) => [c.id, i]))
  for (const i of s.items) {
    const idx = i.columnIds.map((c) => order.get(c) as number)
    expect(idx, `item ${i.id} columns sorted and contiguous`).toEqual(
      Array.from({ length: idx.length }, (_, k) => (idx[0] as number) + k),
    )
    expect(conflictingItems(s.items, i.columnIds, toMinutes(i.start), toMinutes(i.end), i.id), `item ${i.id} overlaps nothing`).toEqual([])
  }
}

const startingPoints: Array<[string, Schedule]> = [
  ['Cairo sample', cairoSample],
  ...BUILTIN_TEMPLATES.map((t): [string, Schedule] => [t.name, instantiate(t)]),
]

describe('random op sequences', () => {
  for (const [label, start] of startingPoints) {
    for (const seed of [1, 7, 2026]) {
      it(`keeps every output valid, ordered and overlap-free from ${label} (seed ${seed})`, () => {
        const rand = seeded(seed)
        const pick = <T>(list: readonly T[]): T | undefined => list[Math.floor(rand() * list.length)]
        const maybe = (id: string | undefined) => (rand() < 0.05 || id === undefined ? 'missing-id' : id)
        const rowTimes = ['07:00', '08:30', '09:00', '09:45', '10:15', '12:00', '17:20', '23:59', 'bad']
        // Mostly real 5-minute times between 07:00 and 21:55, now and then something bad or at the day's edge.
        const time = (): string => {
          const roll = rand()
          if (roll < 0.04) return 'bad'
          if (roll < 0.08) return pick(['00:00', '23:55', '23:59', '24:00', '9:30']) as string
          return fromMinutes(7 * 60 + 5 * Math.floor(rand() * 180))
        }
        const dirs: Direction[] = [-1, 1]

        let s: Schedule = start
        let changed = 0
        for (let step = 0; step < 300; step++) {
          const col = () => maybe(pick(s.columns)?.id)
          const track = () => maybe(pick(trackColumns(s))?.id)
          const row = () => maybe(pick(s.rows)?.id)
          const it = () => maybe(pick(s.items)?.id)
          const span = (): string[] => {
            const first = Math.floor(rand() * 3)
            return trackColumns(s)
              .slice(first, first + 1 + Math.floor(rand() * 3))
              .map((c) => c.id)
          }
          const ops: Array<() => Schedule> = [
            () => setMode(s, rand() < 0.3 ? 'table' : 'track-grid'),
            () => setCell(s, row(), col(), pick(['', 'Talk', '09:15', '9:15', 'a, b', '25:00']) as string),
            () => setColumnType(s, col(), pick(['text', 'time', 'person', 'tag', 'track'] as const) ?? 'text'),
            () => (s.columns.length < 8 ? addColumn(s, rand() < 0.3 ? { type: pick(['text', 'time', 'person', 'tag']) } : {}) : s),
            () => (rand() < 0.3 ? removeColumn(s, col()) : s),
            () => renameColumn(s, col(), `n${step}`),
            () => setColumnColor(s, col(), rand() < 0.2 ? 'nope' : '#123456'),
            () => moveColumn(s, col(), pick(dirs) as Direction),
            () => (s.rows.length < 14 ? addRow(s) : s),
            () => (s.rows.length < 14 ? insertRowAfter(s, row()) : s),
            () => removeRow(s, row()),
            () => setRowTimes(s, row(), pick(rowTimes) as string, pick(rowTimes) as string),
            () => setRowNote(s, row(), rand() < 0.5 ? '' : `note ${step}`),
            () => moveRow(s, row(), pick(dirs) as Direction),
            () => addItem(s, rand() < 0.1 ? [track()] : span(), time(), time(), { title: `t${step}` }),
            () => updateItem(s, it(), { title: `u${step}`, note: rand() < 0.5 ? '' : 'n', variant: pick(['session', 'break', 'highlight'] as const) }),
            () => removeItem(s, it()),
            () => moveItem(s, it(), time(), rand() < 0.5 ? Math.floor(rand() * 5) - 2 : track()),
            () => moveItem(s, it(), time(), 0),
            () => resizeItem(s, it(), { end: time() }),
            () => resizeItem(s, it(), { start: time() }),
            () => resizeItem(s, it(), { start: time(), end: time() }),
            () => setItemColumns(s, it(), Math.floor(rand() * 5) - 1, Math.floor(rand() * 5) - 1),
            () => spanAllColumns(s, it()),
            () => duplicateItem(s, it()),
          ]
          const next = (pick(ops) as () => Schedule)()
          if (next !== s) changed++
          checkInvariants(next)
          s = next
        }
        // The run must actually exercise the ops, not just get refused every time.
        expect(changed).toBeGreaterThan(80)
        expect(s.columns.length).toBeGreaterThan(0)
      })
    }
  }

  it('hands back the very same schedule for every refused item op', () => {
    const s = withItem(grid(), { id: 'x', columnIds: ['A'], start: '09:00', end: '10:00' })
    const refused = [
      addItem(s, ['A'], '09:30', '10:30'),
      addItem(s, ['A'], 'bad', '10:30'),
      moveItem(s, 'x', '23:59', 0),
      moveItem(s, 'x', '09:00', 3),
      resizeItem(s, 'x', { end: '08:00' }),
      resizeItem(s, 'nope', { end: '11:00' }),
      setItemColumns(s, 'x', 2, 0),
      duplicateItem(s, 'nope'),
      removeItem(s, 'nope'),
      updateItem(s, 'nope', { title: 'x' }),
    ]
    for (const result of refused) expect(result).toBe(s)
  })
})

/* ---------- table mode ---------- */

const table = (): Schedule => structuredClone(tableDemo)

describe('setMode', () => {
  it('creates Session, Speaker and Tag columns when the table has none, and keeps every item', () => {
    const grid = cairoSample
    const next = setMode(grid, 'table')
    expect(next.mode).toBe('table')
    expect(tableColumns(next).map((c) => [c.name, c.type])).toEqual([
      ['Session', 'text'],
      ['Speaker', 'person'],
      ['Tag', 'tag'],
    ])
    expect(next.columns.slice(0, 2)).toEqual(grid.columns)
    expect(next.items).toEqual(grid.items)
    expectValid(next)
  })

  it('the first switch to a table with no rows derives them from the grid slots', () => {
    const next = setMode(cairoSample, 'table')
    expect(next.rows.map((r) => `${r.start}-${r.end}`)).toEqual([
      '13:30-14:00',
      '14:00-14:20',
      '14:20-15:05',
      '15:05-15:35',
      '15:35-16:20',
      '16:20-16:35',
      '16:35-17:05',
      '17:05-17:35',
      '17:35-17:45',
    ])
    expect(new Set(next.rows.map((r) => r.id)).size).toBe(9)
    expect(next.rows.every((r) => r.cells === undefined)).toBe(true)
    expectValid(next)
  })

  it('the derived rows carry the slot notes, and existing rows are never touched', () => {
    const next = setMode(cairoSample, 'table')
    expect(next.rows[1]?.note).toMatch(/room change at 14:15/)
    expect(next.rows.filter((r) => r.note !== undefined)).toHaveLength(1)
    const withRows = { ...cairoSample, rows: [{ id: 'mine', start: '08:00', end: '09:00' }] }
    expect(setMode(withRows, 'table').rows).toBe(withRows.rows)
  })

  it('a slot ends at the earliest end of the sessions that start there', () => {
    let s = withItem(grid(), { id: 'a', columnIds: ['A'], start: '09:00', end: '10:00' })
    s = withItem(s, { id: 'b', columnIds: ['B'], start: '09:00', end: '09:40' })
    expect(setMode({ ...s, rows: [] }, 'table').rows.map((r) => `${r.start}-${r.end}`)).toEqual(['09:00-09:40'])
  })

  it('does not touch rows that already exist, and an empty grid stays row-less', () => {
    const withRows = grid()
    withItem(withRows, { id: 'a', columnIds: ['A'] })
    expect(setMode(withRows, 'table').rows).toBe(withRows.rows)
    expect(setMode({ ...grid(), rows: [] }, 'table').rows).toEqual([])
  })

  it('creates two tracks when a table-only schedule goes to the grid', () => {
    const next = setMode(table(), 'track-grid')
    expect(trackColumns(next).map((c) => c.name)).toEqual(['Track 1', 'Track 2'])
    expect(tableColumns(next)).toEqual(tableColumns(table()))
    expect(next.rows).toEqual(table().rows)
    expectValid(next)
  })

  it('does not add columns that exist, and refuses a no-op', () => {
    const s = table()
    expect(setMode(s, 'table')).toBe(s)
    const back = setMode(setMode(cairoSample, 'table'), 'track-grid')
    expect(back.columns).toHaveLength(5) // 2 tracks + 3 table columns, no more
  })

  it('grid -> table -> grid keeps the sessions (apart from the derived rows and auto-created columns)', () => {
    const roundTrip = setMode(setMode(cairoSample, 'table'), 'track-grid')
    expect(roundTrip.mode).toBe('track-grid')
    expect(trackColumns(roundTrip)).toEqual(cairoSample.columns)
    expect({ ...roundTrip, columns: trackColumns(roundTrip), rows: [] }).toEqual(cairoSample)
    // And a second trip adds nothing new.
    expect(setMode(setMode(roundTrip, 'table'), 'track-grid')).toEqual(roundTrip)
  })

  it('table -> grid -> table keeps cells, rows and items intact', () => {
    const edited = setCell(addItemTo(table()), 'r1', 'c-room', 'Studio')
    const trip = setMode(setMode(edited, 'track-grid'), 'table')
    expect({ ...trip, columns: tableColumns(trip) }).toEqual({ ...edited, columns: tableColumns(edited) })
    expect(trip.items).toEqual(edited.items)
    expect(trip.rows).toEqual(edited.rows)
  })
})

function addItemTo(s: Schedule): Schedule {
  const grid = setMode(s, 'track-grid')
  const track = trackColumns(grid)[0]
  return setMode(addItem(grid, [track?.id as string], '09:00', '09:45', { id: 'it1', title: 'Hidden item' }), 'table')
}

describe('setCell', () => {
  it('sets, replaces and clears a cell', () => {
    const s = table()
    const set = setCell(s, 'r3', 'c-speaker', 'Priya Raman')
    expect(set.rows[2]?.cells?.['c-speaker']).toBe('Priya Raman')
    expect(setCell(set, 'r3', 'c-speaker', 'Maya Chen').rows[2]?.cells?.['c-speaker']).toBe('Maya Chen')
    const cleared = setCell(set, 'r3', 'c-speaker', '')
    expect(cleared.rows[2]?.cells).toEqual({ 'c-session': 'Break', 'c-room': 'Foyer' })
    expectValid(cleared)
  })

  it('drops cells entirely when the last value is cleared', () => {
    let s = table()
    s = { ...s, rows: [{ id: 'only', start: '09:00', end: '10:00', cells: { 'c-room': 'X' } }] }
    expect('cells' in (setCell(s, 'only', 'c-room', '').rows[0] ?? {})).toBe(false)
  })

  it('rejects an invalid time in a time column, and accepts HH:MM or empty', () => {
    const s = table()
    expect(setCell(s, 'r3', 'c-ends', '9:15')).toBe(s)
    expect(setCell(s, 'r3', 'c-ends', '25:00')).toBe(s)
    expect(setCell(s, 'r3', 'c-ends', 'soon')).toBe(s)
    expect(setCell(s, 'r3', 'c-ends', '10:45').rows[2]?.cells?.['c-ends']).toBe('10:45')
    expect(setCell(s, 'r1', 'c-ends', '').rows[0]?.cells?.['c-ends']).toBeUndefined()
  })

  it('refuses unknown rows and columns, track columns, and no-ops', () => {
    const s = setMode(cairoSample, 'table')
    const row = s.rows[0]!.id
    expect(setCell(s, 'nope', s.columns[2]?.id as string, 'x')).toBe(s)
    expect(setCell(s, row, 'nope', 'x')).toBe(s)
    expect(setCell(s, row, 'col-beginner', 'x')).toBe(s)
    const t = table()
    expect(setCell(t, 'r1', 'c-room', 'Foyer')).toBe(t) // unchanged
    expect(setCell(t, 'r3', 'c-tag', '')).toBe(t) // already empty
  })
})

describe('setColumnType', () => {
  it('switches between table types and keeps text values', () => {
    const next = setColumnType(table(), 'c-room', 'tag')
    expect(next.columns.find((c) => c.id === 'c-room')?.type).toBe('tag')
    expect(next.rows[0]?.cells?.['c-room']).toBe('Foyer')
    expectValid(next)
  })

  it('becoming a time column clears the cells that are not HH:MM', () => {
    let s = setCell(table(), 'r1', 'c-room', '10:30')
    s = setCell(s, 'r2', 'c-room', 'Main hall')
    const next = setColumnType(s, 'c-room', 'time')
    expect(next.rows[0]?.cells?.['c-room']).toBe('10:30')
    expect(next.rows[1]?.cells?.['c-room']).toBeUndefined()
    expectValid(next)
  })

  it('refuses track <-> table conversions, unknown ids and no-ops', () => {
    const s = setMode(cairoSample, 'table')
    expect(setColumnType(s, 'col-beginner', 'text')).toBe(s)
    expect(setColumnType(s, s.columns[2]?.id as string, 'track')).toBe(s)
    expect(setColumnType(s, 'nope', 'text')).toBe(s)
    expect(setColumnType(s, s.columns[2]?.id as string, 'text')).toBe(s)
  })
})

describe('column ops in table mode', () => {
  it('addColumn follows the active mode', () => {
    const t = addColumn(table())
    expect(t.columns.at(-1)).toMatchObject({ type: 'text', name: 'Column 6' })
    const g = addColumn(cairoSample)
    expect(g.columns.at(-1)).toMatchObject({ type: 'track', name: 'Track 3' })
    expect(addColumn(table(), { type: 'time' }).columns.at(-1)?.type).toBe('time')
    expect(addColumn(table(), { type: 'weird' as never })).toEqual(table())
    expectValid(t)
  })

  it('removeColumn deletes that key from every row', () => {
    const next = removeColumn(table(), 'c-room')
    expect(next.rows.every((r) => !r.cells || !('c-room' in r.cells))).toBe(true)
    expect(next.rows[0]?.cells?.['c-session']).toBe('Welcome and coffee')
    expectValid(next)
  })

  it('removing a track leaves table cells untouched', () => {
    const s = setMode(cairoSample, 'table')
    expect(removeColumn(s, 'col-beginner').rows).toEqual(s.rows)
  })

  it('moveColumn reorders within the table columns only', () => {
    const s = table()
    expect(moveColumn(s, 'c-room', -1).columns.map((c) => c.id)).toEqual(['c-session', 'c-room', 'c-speaker', 'c-tag', 'c-ends'])
    expect(moveColumn(s, 'c-session', -1)).toBe(s)
    expect(moveColumn(s, 'c-ends', 1)).toBe(s)
  })

  it('moveColumn keeps the relative order of the other mode\'s columns', () => {
    // Interleave: track, table, track, table, table.
    let s = setMode(cairoSample, 'table') // beginner, intermediate, Session, Speaker, Tag
    s = { ...s, columns: [s.columns[0], s.columns[2], s.columns[1], s.columns[3], s.columns[4]] as Schedule['columns'] }
    const moved = moveColumn(s, 'col-beginner', 1)
    expect(moved.columns.map((c) => c.name)).toEqual(['Intermediate', 'Session', 'Beginner', 'Speaker', 'Tag'])
    expect(tableColumns(moved)).toEqual(tableColumns(s))
    // Items still sit on the right tracks, contiguity is judged among tracks only.
    expect(moved.items.every((i) => i.columnIds.length >= 1)).toBe(true)
    expectValid(moved)
    const tableMoved = moveColumn(s, s.columns[3]?.id as string, -1)
    expect(tableMoved.columns.map((c) => c.name)).toEqual(['Beginner', 'Speaker', 'Intermediate', 'Session', 'Tag'])
    expect(trackColumns(tableMoved)).toEqual(trackColumns(s))
  })
})

describe('moveRowTo', () => {
  it('moves a table row to a position', () => {
    const s = grid()
    expect(moveRowTo(s, 'r1', 2).rows.map((r) => r.id)).toEqual(['r2', 'r3', 'r1', 'r4'])
    expect(moveRowTo(s, 'r4', 0).rows.map((r) => r.id)).toEqual(['r4', 'r1', 'r2', 'r3'])
  })

  it('refuses no-ops, bad positions and unknown rows', () => {
    const s = grid()
    expect(moveRowTo(s, 'r1', 0)).toBe(s)
    expect(moveRowTo(s, 'r1', 4)).toBe(s)
    expect(moveRowTo(s, 'r1', -1)).toBe(s)
    expect(moveRowTo(s, 'r1', 1.5)).toBe(s)
    expect(moveRowTo(s, 'nope', 1)).toBe(s)
  })
})

describe('speakers', () => {
  const base = () => addSpeaker(addSpeaker(grid(), { id: 'ada', name: 'Ada Lovelace', role: 'Engineer' }), { id: 'grace', name: 'Grace Hopper' })

  it('addSpeaker appends with a default colour, and refuses duplicates, bad colours and non-image photos', () => {
    const s = base()
    expect(s.speakers.map((x) => [x.id, x.name, x.role])).toEqual([['ada', 'Ada Lovelace', 'Engineer'], ['grace', 'Grace Hopper', '']])
    expect(s.speakers[0]?.color).toMatch(/^#[0-9a-f]{6}$/i)
    expect(s.speakers[0]?.color).not.toBe(s.speakers[1]?.color)
    expectValid(s)
    expect(addSpeaker(s, { id: 'ada' })).toBe(s)
    expect(addSpeaker(s, { color: 'red' })).toBe(s)
    expect(addSpeaker(s, { photo: 'https://example.com/a.png' })).toBe(s)
    expect(addSpeaker(s, { name: 'Pic', photo: 'data:image/png;base64,AA==' }).speakers.at(-1)?.photo).toBe('data:image/png;base64,AA==')
  })

  it('updateSpeaker edits role, colour and photo (null removes it), and refuses bad input and no-ops', () => {
    const s = base()
    const next = updateSpeaker(updateSpeaker(s, 'ada', { role: 'Mathematician', color: '#112233' }), 'ada', { photo: 'data:image/png;base64,AA==' })
    expect(next.speakers[0]).toMatchObject({ role: 'Mathematician', color: '#112233', photo: 'data:image/png;base64,AA==' })
    expect('photo' in (updateSpeaker(next, 'ada', { photo: null }).speakers[0] ?? {})).toBe(false)
    expect(updateSpeaker(s, 'ada', { color: 'nope' })).toBe(s)
    expect(updateSpeaker(s, 'ada', { photo: 'http://x' })).toBe(s)
    expect(updateSpeaker(s, 'nope', { name: 'x' })).toBe(s)
    expect(updateSpeaker(s, 'ada', { name: 'Ada Lovelace' })).toBe(s)
  })

  it('renaming a speaker renames them in sessions and table person cells that used the old name', () => {
    let s = withItem(base(), { id: 'x', columnIds: ['A'], speaker: 'ada lovelace' })
    s = withItem(s, { id: 'y', columnIds: ['B'], speaker: 'Grace Hopper' })
    s = setMode(s, 'table')
    const person = tableColumns(s).find((c) => c.type === 'person')!.id
    s = setCell(s, 'r1', person, 'Ada Lovelace')
    s = setCell(s, 'r2', person, 'Someone else')
    const next = updateSpeaker(s, 'ada', { name: 'Ada King' })
    expect(next.speakers[0]?.name).toBe('Ada King')
    expect(item(next, 'x').speaker).toBe('Ada King')
    expect(item(next, 'y').speaker).toBe('Grace Hopper')
    expect(next.rows[0]?.cells?.[person]).toBe('Ada King')
    expect(next.rows[1]?.cells?.[person]).toBe('Someone else')
    expectValid(next)
  })

  it('renaming a speaker with no name yet touches nothing else', () => {
    const s = withItem(addSpeaker(grid(), { id: 'blank', name: '' }), { id: 'x', columnIds: ['A'], speaker: '' })
    expect(updateSpeaker(s, 'blank', { name: 'New' }).items).toBe(s.items)
  })

  it('removeSpeaker removes only the list entry; sessions keep their text', () => {
    const s = withItem(base(), { id: 'x', columnIds: ['A'], speaker: 'Ada Lovelace' })
    const next = removeSpeaker(s, 'ada')
    expect(next.speakers.map((x) => x.id)).toEqual(['grace'])
    expect(item(next, 'x').speaker).toBe('Ada Lovelace')
    expect(removeSpeaker(s, 'nope')).toBe(s)
  })
})
