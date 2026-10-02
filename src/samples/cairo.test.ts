import { describe, expect, it } from 'vitest'
import { deriveSlots } from '../model/slots.ts'
import { parseSchedule } from '../model/validate.ts'
import { cairoSample } from './cairo.ts'

describe('cairoSample', () => {
  it('passes schema validation', () => {
    const result = parseSchedule(cairoSample)
    expect(result.ok, result.ok ? '' : result.errors.join('; ')).toBe(true)
  })

  it('reproduces the reference content', () => {
    expect(cairoSample.columns.map((c) => c.name)).toEqual(['Beginner', 'Intermediate'])
    expect(cairoSample.rows).toHaveLength(0) // rows belong to table mode; the grid derives its slots from the items
    expect(deriveSlots(cairoSample.items)).toHaveLength(9)
    expect(cairoSample.items).toHaveLength(12)
    expect(cairoSample.speakers).toHaveLength(8)
    expect(cairoSample.items.find((i) => i.title.startsWith('Scale Distributed'))?.end).toBe('17:20')
    expect(cairoSample.items.find((i) => i.id === 'item-keynote')?.note).toMatch(/room change/)
  })
})
