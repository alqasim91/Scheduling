/** The template file format: `{ kind: 'schedule-template', version: 1, template: { name, description, schedule } }`. */
import { z } from 'zod'
import { slugify } from '../persistence/files.ts'
import { parseSchedule } from '../model/validate.ts'
import type { TemplateContent } from './types.ts'

export const TEMPLATE_KIND = 'schedule-template'

const TemplateFileSchema = z.object({
  kind: z.literal(TEMPLATE_KIND),
  version: z.literal(1),
  template: z.object({
    name: z.string().trim().min(1, 'A template needs a name'),
    description: z.string(),
    schedule: z.unknown(),
  }),
})

export type ParseTemplateResult = { ok: true; value: TemplateContent } | { ok: false; errors: string[] }

export function serializeTemplateFile(content: TemplateContent): string {
  return JSON.stringify(
    { kind: TEMPLATE_KIND, version: 1, template: { name: content.name, description: content.description, schedule: content.schedule } },
    null,
    2,
  )
}

/** `<slug>.template.json` */
export function templateFilename(name: string): string {
  return `${slugify(name) || 'template'}.template.json`
}

/** Validate an already-parsed value as a template file. Never throws. */
export function parseTemplateValue(raw: unknown): ParseTemplateResult {
  const shape = TemplateFileSchema.safeParse(raw)
  if (!shape.success) {
    return { ok: false, errors: shape.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) }
  }
  const schedule = parseSchedule(shape.data.template.schedule)
  if (!schedule.ok) return { ok: false, errors: schedule.errors.map((e) => `template.schedule.${e}`) }
  return {
    ok: true,
    value: { name: shape.data.template.name.trim(), description: shape.data.template.description, schedule: schedule.value },
  }
}

/** Is this parsed JSON claiming to be a template file? */
export function isTemplateFile(raw: unknown): boolean {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw) && (raw as { kind?: unknown }).kind === TEMPLATE_KIND
}

/**
 * Sniff file text: null when it is not a template file (so it can be read as a schedule),
 * otherwise the validation result.
 */
export function sniffTemplateText(text: string): ParseTemplateResult | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  return isTemplateFile(raw) ? parseTemplateValue(raw) : null
}
