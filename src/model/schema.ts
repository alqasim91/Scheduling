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

function isCanonicalLocale(value: string): boolean {
  try {
    return Intl.getCanonicalLocales(value).length === 1
  } catch {
    return false
  }
}

/** BCP 47 language tag, e.g. "ar-EG". */
export const LocaleSchema = z.string().refine(isCanonicalLocale, 'Expected a BCP 47 locale such as "en-GB" or "ar-EG"')

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
  /** BCP 47 tag used for dates, times and default labels. Default "en-GB". */
  locale: LocaleSchema.optional(),
  /** Text direction; "auto" follows the locale's language. Default "auto". */
  direction: z.enum(['auto', 'ltr', 'rtl']).optional(),
  /** Default "24h". */
  timeFormat: z.enum(['24h', '12h']).optional(),
})

/** A Google Fonts family name, e.g. "Open Sans". */
export const WebFontSchema = z.string().regex(/^[A-Za-z0-9 ]{1,40}$/, 'Expected a Google Fonts family name (letters, digits, spaces)')

export const ColorsSchema = z.object({
  primary: HexColorSchema,
  background: HexColorSchema,
  surface: HexColorSchema,
  text: HexColorSchema,
  muted: HexColorSchema,
  line: HexColorSchema,
  accent: HexColorSchema,
  /** Colour of the notes callout; defaults to #f9ab00 when omitted. */
  note: HexColorSchema.optional(),
})

export const BrandingSchema = z.object({
  logo: DataImageSchema.nullable(),
  /** Logo height in px (16-120). When omitted the logo is capped at 40px high. */
  logoHeight: z.number().int().min(16).max(120).optional(),
  colors: ColorsSchema,
  /** Dark palette; derived automatically from `colors` when omitted. */
  darkColors: ColorsSchema.optional(),
  /** CSS font-family strings. */
  fonts: z.object({
    display: z.string(),
    body: z.string(),
    mono: z.string(),
    /** Google Fonts families to load with a single stylesheet link. */
    webFonts: z.array(WebFontSchema).optional(),
  }),
  theme: z.enum(['light', 'dark', 'auto']),
  motion: z.object({
    preset: z.enum(['none', 'fade', 'stagger']),
    logoAnimation: z.boolean(),
  }),
})

/** Wording for the fixed strings in the rendered page. Every field is optional; see `render/labels.ts`. */
export const LabelsSchema = z.object({
  agenda: z.string().optional(),
  speakers: z.string().optional(),
  everyone: z.string().optional(),
  speakerPrefix: z.string().optional(),
  /** Template for a continuation ghost cell without its own label; `{track}` is the column name. */
  sessionFallback: z.string().optional(),
  trackSuffix: z.string().optional(),
  continuesUntil: z.string().optional(),
  eventLink: z.string().optional(),
  /** Text of the "happening now" badge in exported pages. */
  now: z.string().optional(),
  /** Heading of the time column in table mode. */
  time: z.string().optional(),
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

/**
 * A session on the track grid. Items are placed by absolute time (`start` < `end`, half-open) and
 * by the track columns they span; rows are not involved (they belong to table mode).
 */
export const ItemSchema = z.object({
  id: IdSchema,
  /** Columns the item spans (at least one; intended to be contiguous). */
  columnIds: z.array(IdSchema).min(1, 'An item needs at least one column'),
  start: TimeSchema,
  end: TimeSchema,
  title: z.string(),
  speaker: z.string().optional(),
  tag: z.string().optional(),
  /** Ghost-cell text when the item runs past the end of its slot, e.g. "Intermediate GKE session". */
  continuationLabel: z.string().optional(),
  /** Small note line shown after the item's slot (inline markup allowed). */
  note: z.string().optional(),
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
    version: z.literal(2),
    event: EventSchema,
    branding: BrandingSchema,
    labels: LabelsSchema.optional(),
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

    // Table cells: only for existing non-track columns, and time columns hold "" or HH:MM.
    const columnById = new Map(schedule.columns.map((c) => [c.id, c]))
    schedule.rows.forEach((row, i) => {
      for (const [columnId, value] of Object.entries(row.cells ?? {})) {
        const column = columnById.get(columnId)
        if (!column) fail(['rows', i, 'cells', columnId], `Unknown column "${columnId}"`)
        else if (column.type === 'track') fail(['rows', i, 'cells', columnId], `Column "${columnId}" is a track; cells belong to table columns`)
        else if (column.type === 'time' && value !== '' && !TIME_PATTERN.test(value)) {
          fail(['rows', i, 'cells', columnId], `Expected a time as HH:MM (24h) or empty, got "${value}"`)
        }
      }
    })

    const columnIds = new Set(schedule.columns.map((c) => c.id))

    schedule.items.forEach((item, i) => {
      if (
        TIME_PATTERN.test(item.start) &&
        TIME_PATTERN.test(item.end) &&
        toMinutes(item.start) >= toMinutes(item.end)
      ) {
        fail(['items', i, 'end'], `Item end (${item.end}) must be after its start (${item.start})`)
      }
      item.columnIds.forEach((columnId, j) => {
        if (!columnIds.has(columnId)) fail(['items', i, 'columnIds', j], `Unknown column "${columnId}"`)
      })
    })

    // Two items sharing a column must not overlap in time (half-open intervals: touching is fine).
    const byColumn = new Map<string, { index: number; start: number; end: number }[]>()
    schedule.items.forEach((item, index) => {
      if (!TIME_PATTERN.test(item.start) || !TIME_PATTERN.test(item.end)) return
      const start = toMinutes(item.start)
      const end = toMinutes(item.end)
      if (start >= end) return
      for (const columnId of new Set(item.columnIds)) {
        byColumn.set(columnId, [...(byColumn.get(columnId) ?? []), { index, start, end }])
      }
    })
    const reported = new Set<string>()
    for (const [columnId, spans] of byColumn) {
      const sorted = [...spans].sort((x, y) => x.start - y.start || x.index - y.index)
      let latest = sorted[0]
      for (const span of sorted.slice(1)) {
        if (latest && span.start < latest.end) {
          const [first, second] = latest.index < span.index ? [latest, span] : [span, latest]
          const key = `${first.index}:${second.index}`
          if (!reported.has(key)) {
            reported.add(key)
            const a = schedule.items[first.index]
            const b = schedule.items[second.index]
            fail(
              ['items', second.index, 'start'],
              `Item "${b?.id}" (${b?.start}–${b?.end}) overlaps "${a?.id}" (${a?.start}–${a?.end}) in column "${columnId}"`,
            )
          }
        }
        if (!latest || span.end > latest.end) latest = span
      }
    }
  })

/* ---------- types ---------- */

export type Time = z.infer<typeof TimeSchema>
export type EventInfo = z.infer<typeof EventSchema>
export type Colors = z.infer<typeof ColorsSchema>
export type Branding = z.infer<typeof BrandingSchema>
export type Column = z.infer<typeof ColumnSchema>
export type Row = z.infer<typeof RowSchema>
export type Item = z.infer<typeof ItemSchema>
export type Labels = z.infer<typeof LabelsSchema>
export type Speaker = z.infer<typeof SpeakerSchema>
export type Schedule = z.infer<typeof ScheduleSchema>
