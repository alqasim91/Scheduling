import type { Labels } from '../model/schema.ts'
import { DEFAULT_LOCALE, languageOf, resolveLocale } from './locale.ts'

/** Every fixed string the renderer prints. Defaults live here and nowhere else. */
export type ResolvedLabels = Required<Labels>

export const EN_LABELS: ResolvedLabels = {
  agenda: 'Agenda',
  speakers: 'Speakers',
  everyone: 'Everyone',
  speakerPrefix: 'Speaker',
  trackSuffix: 'track',
  continuesUntil: 'continues until',
  eventLink: 'Official event page',
  sessionFallback: '{track} session',
}

const AR_LABELS: ResolvedLabels = {
  agenda: 'الجدول',
  speakers: 'المتحدثون',
  everyone: 'للجميع',
  speakerPrefix: 'المتحدث',
  trackSuffix: '',
  continuesUntil: 'تستمر حتى',
  eventLink: 'صفحة الفعالية الرسمية',
  sessionFallback: 'جلسة {track}',
}

const FR_LABELS: ResolvedLabels = {
  agenda: 'Programme',
  speakers: 'Intervenants',
  everyone: 'Tout le monde',
  speakerPrefix: 'Intervenant',
  trackSuffix: '',
  continuesUntil: 'se poursuit jusqu’à',
  eventLink: 'Page officielle de l’événement',
  sessionFallback: 'Session {track}',
}

const LABEL_SETS: Record<string, ResolvedLabels> = { en: EN_LABELS, ar: AR_LABELS, fr: FR_LABELS }

/** English defaults, kept for callers that do not care about the locale. */
export const DEFAULT_LABELS = EN_LABELS

/** The built-in labels for a locale; unknown languages use English. */
export function defaultLabelsFor(locale: string | undefined): ResolvedLabels {
  return LABEL_SETS[languageOf(resolveLocale(locale ?? DEFAULT_LOCALE))] ?? EN_LABELS
}

/** Built-in labels for the locale, with any non-blank user label taking priority. */
export function resolveLabels(labels: Labels | undefined, locale?: string): ResolvedLabels {
  const resolved = { ...defaultLabelsFor(locale) }
  for (const key of Object.keys(resolved) as Array<keyof ResolvedLabels>) {
    const value = labels?.[key]
    if (typeof value === 'string' && value.trim() !== '') resolved[key] = value.trim()
  }
  return resolved
}

/** Fill `{track}` in a session-fallback template. */
export function fillSessionFallback(template: string, trackName: string): string {
  return template.split('{track}').join(trackName)
}
