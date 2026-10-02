import { describe, expect, it } from 'vitest'
import { createEmptySchedule } from '../model/defaults.ts'
import type { Item, Schedule } from '../model/schema.ts'
import { parseSchedule } from '../model/validate.ts'
import { cairoSample } from '../samples/cairo.ts'
import {
  addColumn,
  addItem,
  addRow,
  extendItem,
  insertRowAfter,
  moveColumn,
  moveRow,
  occupancy,
  removeColumn,
  removeItem,
  removeRow,
  renameColumn,
  setColumnColor,
  setItemTimes,
  setRowNote,
  setRowSpan,
  setRowTimes,
  shrinkItem,
  spanAllColumns,
  updateItem,
  type Direction,
  type Side,
} from './ops.ts'

/** Minimal valid schedule with explicit ids: columns A,B,C and rows r1..r4 (09:00-11:00), no items. */
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

function withItem(s: Schedule, item: Partial<Item> & { id: string; rowId: string; columnIds: string[] }): Schedule {
  return { ...s, items: [...s.items, { title: item.id, variant: 'session', ...item }] }
}

const item = (s: Schedule, id: string): Item => {
  const found = s.items.find((i) => i.id === id)
  if (!found) throw new Error(`no item ${id}`)
  return found
}

function expectValid(s: Schedule) {
  const result = parseSchedule(s)
  expect(result.ok, result.ok ? '' : result.errors.join('; ')).toBe(true)
}

describe('occupancy', () => {
  it('maps row:column cells to item ids, including rowSpan and multi-column cells', () => {
    const s = withItem(withItem(grid(), { id: 'x', rowId: 'r1', columnIds: ['A', 'B'], rowSpan: 2 }), {
      id: 'y',
      rowId: 'r3',
      columnIds: ['C'],
    })
    const occ = occupancy(s)
    expect([...occ.keys()].sort()).toEqual(['0:A', '0:B', '1:A', '1:B', '2:C'])
    expect(occ.get('1:B')).toBe('x')
    expect(occ.get('2:C')).toBe('y')
  })

  it('covers the Cairo sample without overlaps', () => {
    const cells = occupancy(cairoSample)
    const expected = cairoSample.items.reduce((n, i) => n + i.columnIds.length * (i.rowSpan ?? 1), 0)
    expect(cells.size).toBe(expected)
  })
})

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
    let s = withItem(grid(), { id: 'wide', rowId: 'r1', columnIds: ['A', 'B', 'C'] })
    s = withItem(s, { id: 'onlyB', rowId: 'r2', columnIds: ['B'] })
    const next = removeColumn(s, 'B')
    expect(next.columns.map((c) => c.id)).toEqual(['A', 'C'])
    expect(item(next, 'wide').columnIds).toEqual(['A', 'C'])
    expect(next.items.map((i) => i.id)).toEqual(['wide'])
    expectValid(next)
  })

  it('removeColumn keeps only the contiguous part containing the first remaining id', () => {
    const s = {
      ...withItem(grid(), { id: 'gappy', rowId: 'r1', columnIds: ['A', 'C'] }),
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
    const s = withItem(grid(), { id: 'ab', rowId: 'r1', columnIds: ['A', 'B'] })
    const swapped = moveColumn(s, 'A', 1) // B, A, C
    expect(item(swapped, 'ab').columnIds).toEqual(['B', 'A'])
    expectValid(swapped)
  })

  it('moveColumn shrinks an item that would become non-contiguous to its first column run', () => {
    const s = withItem(grid(), { id: 'ab', rowId: 'r1', columnIds: ['A', 'B'] })
    const moved = moveColumn(s, 'B', 1) // A, C, B
    expect(item(moved, 'ab').columnIds).toEqual(['A'])
    expectValid(moved)
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

  it('insertRowAfter grows items that span across the insertion point', () => {
    let s = withItem(grid(), { id: 'tall', rowId: 'r1', columnIds: ['A'], rowSpan: 3 })
    s = withItem(s, { id: 'short', rowId: 'r1', columnIds: ['B'] })
    const next = insertRowAfter(s, 'r1', 'mid')
    expect(item(next, 'tall').rowSpan).toBe(4)
    expect(item(next, 'short').rowSpan).toBeUndefined()
    expectValid(next)
    // Inserting after the last row an item covers does not grow it.
    expect(item(insertRowAfter(s, 'r3', 'x'), 'tall').rowSpan).toBe(3)
  })

  it('removeRow deletes its items and shrinks earlier items that covered it', () => {
    let s = withItem(grid(), { id: 'tall', rowId: 'r1', columnIds: ['A'], rowSpan: 3 })
    s = withItem(s, { id: 'gone', rowId: 'r2', columnIds: ['B'] })
    s = withItem(s, { id: 'later', rowId: 'r4', columnIds: ['C'] })
    const next = removeRow(s, 'r2')
    expect(next.rows.map((r) => r.id)).toEqual(['r1', 'r3', 'r4'])
    expect(next.items.map((i) => i.id)).toEqual(['tall', 'later'])
    expect(item(next, 'tall').rowSpan).toBe(2)
    expectValid(next)
    expect(removeRow(s, 'nope')).toBe(s)
  })

  it('removeRow drops rowSpan entirely when it falls back to 1', () => {
    const s = withItem(grid(), { id: 'two', rowId: 'r1', columnIds: ['A'], rowSpan: 2 })
    expect('rowSpan' in item(removeRow(s, 'r2'), 'two')).toBe(false)
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

  it('moveRow clamps rowSpans that would no longer fit', () => {
    const s = withItem(grid(), { id: 'tall', rowId: 'r3', columnIds: ['A'], rowSpan: 2 })
    const next = moveRow(s, 'r3', 1) // r3 is now the last row
    expect(next.rows.at(-1)?.id).toBe('r3')
    expect('rowSpan' in item(next, 'tall')).toBe(false)
    expectValid(next)
  })

  it('moveRow clamps spans that would now collide with another item', () => {
    let s = withItem(grid(), { id: 'tall', rowId: 'r1', columnIds: ['A'], rowSpan: 2 })
    s = withItem(s, { id: 'below', rowId: 'r3', columnIds: ['A'] })
    const next = moveRow(s, 'r2', 1) // r1, r3, r2, r4: tall would cover r1 and r3
    expect('rowSpan' in item(next, 'tall')).toBe(false)
    expect(occupancy(next).size).toBe(2)
    expectValid(next)
  })
})

describe('items', () => {
  it('addItem places a new single-column item in a free cell', () => {
    const next = addItem(grid(), 'r2', 'B', { id: 'n', title: 'Talk', speaker: 'Ada', variant: 'highlight' })
    expect(item(next, 'n')).toEqual({
      id: 'n',
      rowId: 'r2',
      columnIds: ['B'],
      title: 'Talk',
      speaker: 'Ada',
      variant: 'highlight',
    })
    expectValid(next)
  })

  it('addItem defaults to a session titled "New session"', () => {
    const next = addItem(grid(), 'r1', 'A')
    expect(next.items[0]).toMatchObject({ title: 'New session', variant: 'session', rowId: 'r1', columnIds: ['A'] })
    expect(next.items[0]?.id).toMatch(/^item_/)
  })

  it('addItem refuses occupied cells, unknown targets and invalid partials', () => {
    const s = withItem(grid(), { id: 'x', rowId: 'r1', columnIds: ['A', 'B'], rowSpan: 2 })
    expect(addItem(s, 'r1', 'B')).toBe(s)
    expect(addItem(s, 'r2', 'A')).toBe(s) // covered by rowSpan
    expect(addItem(s, 'nope', 'C')).toBe(s)
    expect(addItem(s, 'r1', 'nope')).toBe(s)
    expect(addItem(s, 'r1', 'C', { id: 'x' })).toBe(s)
    expect(addItem(s, 'r1', 'C', { start: '10:00', end: '09:00' })).toBe(s)
    expect(addItem(s, 'r4', 'C', { rowSpan: 2 })).toBe(s)
    expect(addItem(s, 'r3', 'C', { rowSpan: 2 }).items).toHaveLength(2)
  })

  it('updateItem edits text and variant; empty speaker/tag are removed', () => {
    const s = withItem(grid(), { id: 'x', rowId: 'r1', columnIds: ['A'], speaker: 'Ada', tag: 'AI' })
    const next = updateItem(s, 'x', { title: 'New', variant: 'break', speaker: '', tag: 'ML' })
    expect(item(next, 'x')).toMatchObject({ title: 'New', variant: 'break', tag: 'ML' })
    expect('speaker' in item(next, 'x')).toBe(false)
    expect(updateItem(s, 'nope', { title: 'x' })).toBe(s)
    expect(updateItem(s, 'x', { variant: 'weird' as Item['variant'] })).toBe(s)
  })

  it('removeItem deletes an item', () => {
    const s = withItem(grid(), { id: 'x', rowId: 'r1', columnIds: ['A'] })
    expect(removeItem(s, 'x').items).toEqual([])
    expect(removeItem(s, 'nope')).toBe(s)
  })

  it('extendItem merges into a free neighbouring column on either side', () => {
    const s = withItem(grid(), { id: 'x', rowId: 'r1', columnIds: ['B'] })
    expect(item(extendItem(s, 'x', 'right'), 'x').columnIds).toEqual(['B', 'C'])
    expect(item(extendItem(s, 'x', 'left'), 'x').columnIds).toEqual(['A', 'B'])
    const both = extendItem(extendItem(s, 'x', 'left'), 'x', 'right')
    expect(item(both, 'x').columnIds).toEqual(['A', 'B', 'C'])
  })

  it('extendItem refuses at the edge, into an occupied cell, or across a rowSpan collision', () => {
    let s = withItem(grid(), { id: 'x', rowId: 'r1', columnIds: ['A', 'B'], rowSpan: 2 })
    expect(extendItem(s, 'x', 'left')).toBe(s)
    s = withItem(s, { id: 'blocker', rowId: 'r2', columnIds: ['C'] })
    expect(extendItem(s, 'x', 'right')).toBe(s)
    expect(extendItem(s, 'nope', 'right')).toBe(s)
  })

  it('shrinkItem drops an outer column and never goes below one column', () => {
    const s = withItem(grid(), { id: 'x', rowId: 'r1', columnIds: ['A', 'B', 'C'] })
    expect(item(shrinkItem(s, 'x', 'left'), 'x').columnIds).toEqual(['B', 'C'])
    expect(item(shrinkItem(s, 'x', 'right'), 'x').columnIds).toEqual(['A', 'B'])
    const one = shrinkItem(shrinkItem(s, 'x', 'left'), 'x', 'left')
    expect(item(one, 'x').columnIds).toEqual(['C'])
    expect(shrinkItem(one, 'x', 'left')).toBe(one)
    expect(shrinkItem(one, 'x', 'right')).toBe(one)
  })

  it('spanAllColumns spans every column when the cells are free', () => {
    const s = withItem(grid(), { id: 'x', rowId: 'r1', columnIds: ['B'] })
    const next = spanAllColumns(s, 'x')
    expect(item(next, 'x').columnIds).toEqual(['A', 'B', 'C'])
    expect(spanAllColumns(next, 'x')).toBe(next)
  })

  it('spanAllColumns refuses when another item is in the way', () => {
    const s = withItem(withItem(grid(), { id: 'x', rowId: 'r1', columnIds: ['B'] }), {
      id: 'y',
      rowId: 'r1',
      columnIds: ['C'],
    })
    expect(spanAllColumns(s, 'x')).toBe(s)
  })

  it('setRowSpan grows and shrinks within bounds when cells are free', () => {
    const s = withItem(grid(), { id: 'x', rowId: 'r2', columnIds: ['A'] })
    const grown = setRowSpan(s, 'x', 3)
    expect(item(grown, 'x').rowSpan).toBe(3)
    expectValid(grown)
    expect('rowSpan' in item(setRowSpan(grown, 'x', 1), 'x')).toBe(false)
  })

  it('setRowSpan refuses out-of-bounds, collisions, and invalid numbers', () => {
    let s = withItem(grid(), { id: 'x', rowId: 'r2', columnIds: ['A'] })
    s = withItem(s, { id: 'y', rowId: 'r4', columnIds: ['A'] })
    expect(setRowSpan(s, 'x', 4)).toBe(s) // exceeds the rows remaining
    expect(setRowSpan(s, 'x', 3)).toBe(s) // would cover y
    expect(setRowSpan(s, 'x', 0)).toBe(s)
    expect(setRowSpan(s, 'x', 1.5)).toBe(s)
    expect(setRowSpan(s, 'x', 1)).toBe(s) // unchanged
    expect(setRowSpan(s, 'nope', 2)).toBe(s)
  })

  it('setItemTimes sets, replaces and clears overrides', () => {
    const s = withItem(grid(), { id: 'x', rowId: 'r1', columnIds: ['A'] })
    const set = setItemTimes(s, 'x', '09:05', '09:45')
    expect(item(set, 'x')).toMatchObject({ start: '09:05', end: '09:45' })
    const endOnly = setItemTimes(set, 'x', undefined, '09:50')
    expect('start' in item(endOnly, 'x')).toBe(false)
    expect(item(endOnly, 'x').end).toBe('09:50')
    const cleared = setItemTimes(endOnly, 'x', undefined, undefined)
    expect('start' in item(cleared, 'x') || 'end' in item(cleared, 'x')).toBe(false)
    expectValid(set)
  })

  it('setItemTimes rejects start >= end and malformed times', () => {
    const s = withItem(grid(), { id: 'x', rowId: 'r1', columnIds: ['A'] })
    expect(setItemTimes(s, 'x', '10:00', '10:00')).toBe(s)
    expect(setItemTimes(s, 'x', '11:00', '10:00')).toBe(s)
    expect(setItemTimes(s, 'x', '9:00', undefined)).toBe(s)
    expect(setItemTimes(s, 'nope', '09:00', '10:00')).toBe(s)
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
  expectValid(s)
  const order = new Map(s.columns.map((c, i) => [c.id, i]))
  for (const i of s.items) {
    const idx = i.columnIds.map((c) => order.get(c) as number)
    expect(idx, `item ${i.id} columns sorted and contiguous`).toEqual(
      Array.from({ length: idx.length }, (_, k) => (idx[0] as number) + k),
    )
  }
  const cells = s.items.reduce((n, i) => n + i.columnIds.length * (i.rowSpan ?? 1), 0)
  expect(occupancy(s).size, 'no overlapping items').toBe(cells)
}

describe('random op sequences', () => {
  for (const seed of [1, 7, 2026]) {
    it(`keeps every output valid, ordered and overlap-free (seed ${seed})`, () => {
      const rand = seeded(seed)
      const pick = <T>(list: readonly T[]): T | undefined => list[Math.floor(rand() * list.length)]
      const maybe = (id: string | undefined) => (rand() < 0.05 || id === undefined ? 'missing-id' : id)
      const times = ['07:00', '08:30', '09:00', '09:45', '10:15', '12:00', '17:20', '23:59', 'bad']
      const dirs: Direction[] = [-1, 1]
      const sides: Side[] = ['left', 'right']

      let s: Schedule = cairoSample
      let changed = 0
      for (let step = 0; step < 200; step++) {
        const col = () => maybe(pick(s.columns)?.id)
        const row = () => maybe(pick(s.rows)?.id)
        const it = () => maybe(pick(s.items)?.id)
        const ops: Array<() => Schedule> = [
          () => (s.columns.length < 5 ? addColumn(s) : s),
          () => removeColumn(s, col()),
          () => renameColumn(s, col(), `n${step}`),
          () => setColumnColor(s, col(), rand() < 0.2 ? 'nope' : '#123456'),
          () => moveColumn(s, col(), pick(dirs) as Direction),
          () => (s.rows.length < 14 ? addRow(s) : s),
          () => (s.rows.length < 14 ? insertRowAfter(s, row()) : s),
          () => removeRow(s, row()),
          () => setRowTimes(s, row(), pick(times) as string, pick(times) as string),
          () => setRowNote(s, row(), rand() < 0.5 ? '' : `note ${step}`),
          () => moveRow(s, row(), pick(dirs) as Direction),
          () => addItem(s, row(), col(), { title: `t${step}`, rowSpan: 1 + Math.floor(rand() * 3) }),
          () => updateItem(s, it(), { title: `u${step}`, variant: pick(['session', 'break', 'highlight'] as const) }),
          () => removeItem(s, it()),
          () => extendItem(s, it(), pick(sides) as Side),
          () => shrinkItem(s, it(), pick(sides) as Side),
          () => spanAllColumns(s, it()),
          () => setRowSpan(s, it(), Math.floor(rand() * 5)),
          () => setItemTimes(s, it(), rand() < 0.3 ? undefined : (pick(times) as string), rand() < 0.3 ? undefined : (pick(times) as string)),
        ]
        const next = (pick(ops) as () => Schedule)()
        if (next !== s) changed++
        checkInvariants(next)
        s = next
      }
      // The run must actually exercise the ops, not just get refused every time.
      expect(changed).toBeGreaterThan(60)
    })
  }
})
