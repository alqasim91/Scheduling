import { describe, expect, it } from 'vitest'
import { newId } from './ids.ts'

describe('newId', () => {
  it('prefixes a short id and is unique', () => {
    const a = newId('col')
    expect(a).toMatch(/^col_[0-9a-f]{8}$/)
    expect(newId('col')).not.toBe(a)
  })
})
