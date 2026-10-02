import { describe, expect, it } from 'vitest'
import { createEmptySchedule } from './defaults.ts'
import { CURRENT_VERSION, migrate } from './migrate.ts'
import { parseSchedule } from './validate.ts'

describe('migrate', () => {
  it('passes a current-version document through unchanged', () => {
    const s = createEmptySchedule()
    expect(CURRENT_VERSION).toBe(1)
    expect(migrate(s)).toEqual(s)
  })

  it('returns an error result for a missing version', () => {
    const rest: Record<string, unknown> = { ...createEmptySchedule() }
    delete rest.version
    const result = parseSchedule(rest)
    expect(result).toEqual({ ok: false, errors: [expect.stringContaining('version')] })
  })

  it('returns an error result for a future version', () => {
    const result = parseSchedule({ ...createEmptySchedule(), version: 2 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[0]).toMatch(/newer than this app supports/)
  })

  it.each([0, -1, 1.5, '1', null])('returns an error result for invalid version %j', (version) => {
    expect(parseSchedule({ ...createEmptySchedule(), version }).ok).toBe(false)
  })

  it.each([null, 42, 'text', [], undefined])('returns an error result for non-object input %j', (raw) => {
    expect(parseSchedule(raw).ok).toBe(false)
  })
})
