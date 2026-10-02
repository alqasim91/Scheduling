import { describe, expect, it } from 'vitest'
import { compareTime, fromMinutes, toMinutes } from './time.ts'

describe('time helpers', () => {
  it('converts both ways', () => {
    expect(toMinutes('00:00')).toBe(0)
    expect(toMinutes('09:30')).toBe(570)
    expect(toMinutes('23:59')).toBe(1439)
    expect(fromMinutes(570)).toBe('09:30')
    expect(fromMinutes(0)).toBe('00:00')
  })

  it('throws on malformed input', () => {
    expect(() => toMinutes('9:30')).toThrow()
    expect(() => fromMinutes(1440)).toThrow()
    expect(() => fromMinutes(-1)).toThrow()
  })

  it('compares', () => {
    expect(compareTime('09:00', '10:00')).toBeLessThan(0)
    expect(compareTime('10:00', '09:00')).toBeGreaterThan(0)
    expect(compareTime('10:00', '10:00')).toBe(0)
    expect(['10:00', '09:15', '09:05'].sort(compareTime)).toEqual(['09:05', '09:15', '10:00'])
  })
})
