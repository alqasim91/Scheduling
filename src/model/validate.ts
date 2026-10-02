import { migrateWithWarnings } from './migrate.ts'
import { ScheduleSchema, type Schedule } from './schema.ts'

/** `warnings` lists anything a migration had to drop or adjust; it is empty for current files. */
export type ParseResult = { ok: true; value: Schedule; warnings: string[] } | { ok: false; errors: string[] }

function formatPath(path: ReadonlyArray<PropertyKey>): string {
  const text = path.reduce<string>((acc, segment) => {
    if (typeof segment === 'number') return `${acc}[${segment}]`
    return acc ? `${acc}.${String(segment)}` : String(segment)
  }, '')
  return text || '(root)'
}

/** Migrate to the current version, then validate. Never throws. */
export function parseSchedule(raw: unknown): ParseResult {
  try {
    const { doc, warnings } = migrateWithWarnings(raw)
    const result = ScheduleSchema.safeParse(doc)
    if (result.success) return { ok: true, value: result.data, warnings }
    return {
      ok: false,
      errors: result.error.issues.map((issue) => `${formatPath(issue.path)}: ${issue.message}`),
    }
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : String(error)] }
  }
}
