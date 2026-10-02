import type { Schedule } from '../model/schema.ts'
import { parseSchedule, type ParseResult } from '../model/validate.ts'

export type { ParseResult }

export function serializeSchedule(schedule: Schedule): string {
  return JSON.stringify(schedule, null, 2)
}

/** Parse and validate schedule JSON text. Never throws. */
export function parseScheduleJson(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { ok: false, errors: [`Not valid JSON: ${detail}`] }
  }
  return parseSchedule(raw)
}
