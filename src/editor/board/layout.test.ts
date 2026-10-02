import { describe, expect, it } from 'vitest'
import type { Item } from '../../model/schema.ts'
import { layoutCards } from './layout.ts'

const item = (id: string, start: string, end: string, columnIds: string[]): Item => ({ id, start, end, columnIds, title: id, variant: 'session' })

describe('layoutCards', () => {
  it('gives each item its track span and orders cards by start, then track (the Tab order)', () => {
    const cards = layoutCards(
      [item('late', '11:00', '12:00', ['B']), item('wide', '09:00', '10:00', ['A', 'B']), item('b', '09:00', '09:30', ['B']), item('a', '09:00', '09:30', ['A'])],
      ['A', 'B'],
    )
    expect(cards.map((c) => [c.item.id, c.first, c.last])).toEqual([
      ['a', 0, 0],
      ['wide', 0, 1],
      ['b', 1, 1],
      ['late', 1, 1],
    ])
  })

  it('skips items on no track, and spans from the first to the last track they use', () => {
    const cards = layoutCards([item('ghost', '09:00', '10:00', ['gone']), item('gap', '09:00', '10:00', ['C', 'A'])], ['A', 'B', 'C'])
    expect(cards.map((c) => [c.item.id, c.first, c.last])).toEqual([['gap', 0, 2]])
  })
})
