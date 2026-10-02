/** Locale, direction and date/time formatting for the rendered page. Stored times stay "HH:MM". */
import type { EventInfo } from '../model/schema.ts'
import { TIME_PATTERN } from '../model/time.ts'

export const DEFAULT_LOCALE = 'en-GB'

/** Languages written right to left, used when `direction` is "auto". */
export const RTL_LANGUAGES: readonly string[] = ['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'yi', 'ckb']

export type Direction = 'ltr' | 'rtl'
export type TimeFormat = '24h' | '12h'

/** The canonical form of the event's locale, or the default when missing or invalid. */
export function resolveLocale(locale: string | undefined): string {
  if (!locale) return DEFAULT_LOCALE
  try {
    const [canonical] = Intl.getCanonicalLocales(locale)
    return canonical ?? DEFAULT_LOCALE
  } catch {
    return DEFAULT_LOCALE
  }
}

/** Primary language subtag, e.g. "ar" for "ar-EG". */
export function languageOf(locale: string): string {
  try {
    return new Intl.Locale(locale).language
  } catch {
    return locale.split('-')[0]?.toLowerCase() ?? 'en'
  }
}

export function resolveDirection(event: Pick<EventInfo, 'locale' | 'direction'>): Direction {
  if (event.direction === 'ltr' || event.direction === 'rtl') return event.direction
  return RTL_LANGUAGES.includes(languageOf(resolveLocale(event.locale))) ? 'rtl' : 'ltr'
}

const timeFormatters = new Map<string, Intl.DateTimeFormat>()

/** "13:30" in the locale's digits, or "1:30 PM" style for 12h. Falls back to the raw text. */
export function formatTime(time: string, locale: string, timeFormat: TimeFormat = '24h'): string {
  if (!TIME_PATTERN.test(time)) return time
  const [h, m] = time.split(':').map(Number) as [number, number]
  try {
    const key = `${locale}|${timeFormat}`
    let formatter = timeFormatters.get(key)
    if (!formatter) {
      formatter = new Intl.DateTimeFormat(locale, {
        hour: timeFormat === '12h' ? 'numeric' : '2-digit',
        minute: '2-digit',
        hourCycle: timeFormat === '12h' ? 'h12' : 'h23',
        timeZone: 'UTC',
      })
      timeFormatters.set(key, formatter)
    }
    // A fixed date: only the clock matters. ICU versions differ on the space before AM/PM
    // (regular, narrow no-break); normalise it to a no-break space.
    return formatter.format(new Date(Date.UTC(2000, 0, 1, h, m))).replace(/[\u202f\u00a0 ]/g, '\u00a0')
  } catch {
    return time
  }
}

/** Long date with weekday in the event's language, e.g. "Friday, 2 October 2026". Always Gregorian. */
export function formatEventDate(date: string, locale: string): string {
  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return date
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
      calendar: 'gregory',
    }).formatToParts(parsed)
    // Recent ICU drops the comma after the weekday in en-GB ("Friday 2 October"); older ICU keeps it.
    // Pin the comma for English so the output does not depend on the ICU version.
    if (languageOf(locale) === 'en' && parts[0]?.type === 'weekday' && parts[1]?.type === 'literal') {
      parts[1] = { type: 'literal', value: ', ' }
    }
    return parts.map((p) => p.value).join('')
  } catch {
    return date
  }
}

/** Short zone name such as "EEST" for the event's date, or '' when it cannot be determined. */
export function timezoneShortName(date: string, timezone: string, locale: string): string {
  try {
    const noon = new Date(`${date}T12:00:00Z`)
    const parts = new Intl.DateTimeFormat(locale, { timeZone: timezone, timeZoneName: 'short' }).formatToParts(noon)
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? ''
  } catch {
    return ''
  }
}
