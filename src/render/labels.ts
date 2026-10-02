import type { Labels } from '../model/schema.ts'

/** Every fixed string the renderer prints. Defaults live here and nowhere else. */
export type ResolvedLabels = Required<Labels>

export const DEFAULT_LABELS: ResolvedLabels = {
  agenda: 'Agenda',
  speakers: 'Speakers',
  everyone: 'Everyone',
  speakerPrefix: 'Speaker',
  trackSuffix: 'track',
  continuesUntil: 'continues until',
  eventLink: 'Official event page',
}

/** Fill in defaults. Blank or missing fields fall back, except the optional-by-nature suffix/prefix. */
export function resolveLabels(labels: Labels | undefined): ResolvedLabels {
  const resolved = { ...DEFAULT_LABELS }
  for (const key of Object.keys(DEFAULT_LABELS) as Array<keyof ResolvedLabels>) {
    const value = labels?.[key]
    if (typeof value === 'string' && value.trim() !== '') resolved[key] = value.trim()
  }
  return resolved
}
