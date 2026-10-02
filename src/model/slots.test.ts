import { describe, expect, it } from 'vitest'
import { cairoSample } from '../samples/cairo.ts'
import { conflictingItems, intervalsOverlap } from './overlap.ts'
import type { Item } from './schema.ts'
import { deriveSlots, rowsFromSlots } from './slots.ts'

const it_ = (id: string, start: string, end: string, columnIds: string[] = ['A']): Item => ({
  id,
  columnIds,
  start,
  end,
  title: id,
  variant: 'session',
})

describe('deriveSlots', () => {
  it('uses the sorted unique item starts, ending at the earliest end among the items that start there', () => {
    const slots = deriveSlots([it_('late', '10:00', '11:00'), it_('b', '09:00', '09:50', ['B']), it_('a', '09:00', '09:30')])
    expect(slots.map((s) => [s.start, s.end, s.items.map((i) => i.id)])).toEqual([
      ['09:00', '09:30', ['b', 'a']],
      ['10:00', '11:00', ['late']],
    ])
  })

  it('has no slots without items, and ignores items with malformed times', () => {
    expect(deriveSlots([])).toEqual([])
    expect(deriveSlots([it_('x', '9:00', '10:00')])).toEqual([])
  })

  it('reproduces the Cairo rows', () => {
    expect(deriveSlots(cairoSample.items).map((s) => `${s.start}-${s.end}`)).toEqual([
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
  })

  it('rowsFromSlots makes one row per slot with fresh ids', () => {
    let n = 0
    const rows = rowsFromSlots([it_('a', '09:00', '09:30'), it_('b', '09:30', '10:00')], () => `row${++n}`)
    expect(rows).toEqual([
      { id: 'row1', start: '09:00', end: '09:30' },
      { id: 'row2', start: '09:30', end: '10:00' },
    ])
  })
})

describe('intervalsOverlap', () => {
  it('is half-open', () => {
    expect(intervalsOverlap(0, 10, 10, 20)).toBe(false)
    expect(intervalsOverlap(10, 20, 0, 10)).toBe(false)
    expect(intervalsOverlap(0, 10, 9, 20)).toBe(true)
    expect(intervalsOverlap(5, 6, 0, 10)).toBe(true)
  })
})

describe('conflictingItems', () => {
  const items = [it_('a', '09:00', '10:00', ['A']), it_('b', '09:00', '10:00', ['B']), it_('wide', '10:00', '11:00', ['A', 'B'])]

  it('finds the items in the given columns during the interval', () => {
    expect(conflictingItems(items, ['A'], 9 * 60 + 30, 10 * 60 + 30).map((i) => i.id)).toEqual(['a', 'wide'])
    expect(conflictingItems(items, ['B'], 9 * 60, 10 * 60).map((i) => i.id)).toEqual(['b'])
  })

  it('does not count touching items, other columns or the ignored item', () => {
    expect(conflictingItems(items, ['A'], 11 * 60, 12 * 60)).toEqual([])
    expect(conflictingItems(items, ['C'], 9 * 60, 12 * 60)).toEqual([])
    expect(conflictingItems(items, ['A'], 9 * 60, 10 * 60, 'a')).toEqual([])
  })
})
