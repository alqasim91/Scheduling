import { z } from 'zod'
import { TIME_PATTERN, toMinutes } from './time.ts'

/* ---------- primitives ---------- */

/** "HH:MM", 24h. */
export const TimeSchema = z.string().regex(TIME_PATTERN, 'Expected a time as HH:MM (24h)')

function isRealDate(value: string): boolean {
  const [y, m, d] = value.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

/** "YYYY-MM-DD". */
export const DateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date as YYYY-MM-DD')
  .refine(isRealDate, 'Not a real calendar date')

function isIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

/** IANA timezone name, e.g. "Africa/Cairo". */
export const TimezoneSchema = z
  .string()
  .refine(isIanaTimezone, 'Expected an IANA timezone, e.g. "Africa/Cairo"')

/** Hex colour "#rrggbb". */
export const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a hex color like #0b57d0')

/** Embedded image; only data URIs are allowed so files stay self-contained. */
export const DataImageSchema = z.string().startsWith('data:image/', 'Expected a data:image/ URI')

const IdSchema = z.string().min(1, 'Id must not be empty')

/* ---------- parts ---------- */

export const EventSchema = z.object({
  title: z.string(),
  /** Substring of `title` rendered in the accent colour. */
  titleHighlight: z.string().optional(),
  date: DateSchema,
  timezone: TimezoneSchema,
  venue: z.string(),
  notes: z.string(),
  url: z.string().optional(),
  /** e.g. "You're registered". */
  status: z.string().optional(),
})

export const BrandingSchema = z.object({
  logo: DataImageSchema.nullable(),
  colors: z.object({
    primary: HexColorSchema,
    background: HexColorSchema,
    surface: HexColorSchema,
    text: HexColorSchema,
    muted: HexColorSchema,
    line: HexColorSchema,
    accent: HexColorSchema,
  }),
  /** CSS font-family strings. */
  fonts: z.object({
    display: z.string(),
    body: z.string(),
    mono: z.string(),
  }),
  theme: z.enum(['light', 'dark', 'auto']),
  motion: z.object({
    preset: z.enum(['none', 'fade', 'stagger']),
    logoAnimation: z.boolean(),
  }),
})

export const ColumnSchema = z.object({
  id: IdSchema,
  name: z.string(),
  color: HexColorSchema,
  type: z.enum(['track', 'text', 'time', 'person', 'tag']),
})

export const RowSchema = z.object({
  id: IdSchema,
  start: TimeSchema,
  end: TimeSchema,
  note: z.string().optional(),
  /** Table-mode values keyed by column id. */
  cells: z.record(z.string(), z.string()).optional(),
})

export const ItemSchema = z.object({
  id: IdSchema,
  rowId: IdSchema,
  /** Columns the item spans (at least one; intended to be contiguous). */
  columnIds: z.array(IdSchema).min(1, 'An item needs at least one column'),
  rowSpan: z.number().int().min(1).optional(),
  /** Override the row's times, e.g. a session that runs past its row. */
  start: TimeSchema.optional(),
  end: TimeSchema.optional(),
  title: z.string(),
  speaker: z.string().optional(),
  tag: z.string().optional(),
  variant: z.enum(['session', 'break', 'highlight']),
})

export const SpeakerSchema = z.object({
  id: IdSchema,
  name: z.string(),
  role: z.string(),
  photo: DataImageSchema.optional(),
  color: HexColorSchema.optional(),
})

/* ---------- root ---------- */

export const ScheduleSchema = z
  .object({
    version: z.literal(1),
    event: EventSchema,
    branding: BrandingSchema,
    mode: z.enum(['track-grid', 'table']),
    columns: z.array(ColumnSchema),
    rows: z.array(RowSchema),
    items: z.array(ItemSchema),
    speakers: z.array(SpeakerSchema),
  })
  .superRefine((schedule, ctx) => {
    const fail = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', message, path })

    // Ids unique within each collection.
    const collections = ['columns', 'rows', 'items', 'speakers'] as const
    for (const name of collections) {
      const seen = new Set<string>()
      schedule[name].forEach((entry, i) => {
        if (seen.has(entry.id)) fail([name, i, 'id'], `Duplicate id "${entry.id}" in ${name}`)
        seen.add(entry.id)
      })
    }

    // Row times. Malformed times are reported by the field schemas themselves.
    schedule.rows.forEach((row, i) => {
      if (TIME_PATTERN.test(row.start) && TIME_PATTERN.test(row.end) && toMinutes(row.start) >= toMinutes(row.end)) {
        fail(['rows', i, 'end'], `Row end (${row.end}) must be after its start (${row.start})`)
      }
    })

    const rowIndexById = new Map<string, number>()
    schedule.rows.forEach((row, i) => {
      if (!rowIndexById.has(row.id)) rowIndexById.set(row.id, i)
    })
    const columnIds = new Set(schedule.columns.map((c) => c.id))

    schedule.items.forEach((item, i) => {
      if (
        item.start !== undefined &&
        item.end !== undefined &&
        TIME_PATTERN.test(item.start) &&
        TIME_PATTERN.test(item.end) &&
        toMinutes(item.start) >= toMinutes(item.end)
      ) {
        fail(['items', i, 'end'], `Item end (${item.end}) must be after its start (${item.start})`)
      }

      const rowIndex = rowIndexById.get(item.rowId)
      if (rowIndex === undefined) {
        fail(['items', i, 'rowId'], `Unknown row "${item.rowId}"`)
      } else if (item.rowSpan !== undefined) {
        const remaining = schedule.rows.length - rowIndex
        if (item.rowSpan > remaining) {
          fail(
            ['items', i, 'rowSpan'],
            `rowSpan ${item.rowSpan} exceeds the ${remaining} row(s) remaining from row "${item.rowId}"`,
          )
        }
      }

      item.columnIds.forEach((columnId, j) => {
        if (!columnIds.has(columnId)) fail(['items', i, 'columnIds', j], `Unknown column "${columnId}"`)
      })
    })
  })

/* ---------- types ---------- */

export type Time = z.infer<typeof TimeSchema>
export type EventInfo = z.infer<typeof EventSchema>
export type Branding = z.infer<typeof BrandingSchema>
export type Column = z.infer<typeof ColumnSchema>
export type Row = z.infer<typeof RowSchema>
export type Item = z.infer<typeof ItemSchema>
export type Speaker = z.infer<typeof SpeakerSchema>
export type Schedule = z.infer<typeof ScheduleSchema>
