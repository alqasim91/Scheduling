/** User templates in localStorage. Reads validate every entry and never throw; writes report errors as values. */
import { z } from 'zod'
import { newId } from '../model/ids.ts'
import { parseSchedule } from '../model/validate.ts'
import type { Template, TemplateContent } from './types.ts'

export const TEMPLATES_KEY = 'schedule-builder:templates:v1'

export const QUOTA_MESSAGE = 'Not enough browser storage. Remove the logo or delete old templates, or use Export template.'
const UNAVAILABLE_MESSAGE = 'Browser storage is not available, so the template could not be saved. Use Export template instead.'

export type StoreResult<T> = { ok: true; value: T } | { ok: false; error: 'quota' | 'unavailable' | 'not-found'; message: string }

const EntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  description: z.string(),
  createdAt: z.string().optional(),
  schedule: z.unknown(),
})

/** Every valid saved template, oldest first. Invalid entries are skipped. */
export function listUserTemplates(): Template[] {
  let raw: unknown
  try {
    const text = window.localStorage.getItem(TEMPLATES_KEY)
    if (text === null) return []
    raw = JSON.parse(text)
  } catch {
    return []
  }
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const templates: Template[] = []
  for (const entry of raw) {
    const shape = EntrySchema.safeParse(entry)
    if (!shape.success || seen.has(shape.data.id)) continue
    const schedule = parseSchedule(shape.data.schedule)
    if (!schedule.ok) continue
    seen.add(shape.data.id)
    templates.push({
      id: shape.data.id,
      name: shape.data.name,
      description: shape.data.description,
      builtin: false,
      createdAt: shape.data.createdAt,
      schedule: schedule.value,
    })
  }
  return templates
}

function isQuotaError(error: unknown): boolean {
  if (!(error instanceof Error) && !(typeof error === 'object' && error !== null)) return false
  const e = error as { name?: string; code?: number }
  return e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014
}

function write(templates: Template[]): StoreResult<Template[]> {
  try {
    const entries = templates.map(({ id, name, description, createdAt, schedule }) => ({ id, name, description, createdAt, schedule }))
    window.localStorage.setItem(TEMPLATES_KEY, JSON.stringify(entries))
    return { ok: true, value: templates }
  } catch (error) {
    return isQuotaError(error)
      ? { ok: false, error: 'quota', message: QUOTA_MESSAGE }
      : { ok: false, error: 'unavailable', message: UNAVAILABLE_MESSAGE }
  }
}

export function saveUserTemplate(content: TemplateContent, now: Date = new Date()): StoreResult<Template> {
  const template: Template = {
    id: newId('tpl'),
    name: content.name.trim(),
    description: content.description.trim(),
    builtin: false,
    createdAt: now.toISOString(),
    schedule: content.schedule,
  }
  const result = write([...listUserTemplates(), template])
  return result.ok ? { ok: true, value: template } : result
}

export function renameUserTemplate(id: string, name: string): StoreResult<Template[]> {
  const trimmed = name.trim()
  const templates = listUserTemplates()
  if (trimmed === '' || !templates.some((t) => t.id === id)) {
    return { ok: false, error: 'not-found', message: trimmed === '' ? 'A template needs a name.' : 'That template no longer exists.' }
  }
  return write(templates.map((t) => (t.id === id ? { ...t, name: trimmed } : t)))
}

export function deleteUserTemplate(id: string): StoreResult<Template[]> {
  const templates = listUserTemplates()
  if (!templates.some((t) => t.id === id)) return { ok: false, error: 'not-found', message: 'That template no longer exists.' }
  return write(templates.filter((t) => t.id !== id))
}
