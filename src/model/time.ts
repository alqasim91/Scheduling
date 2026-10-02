/** Time helpers for "HH:MM" 24h strings. */

export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

/** Convert "HH:MM" to minutes since midnight. Throws on malformed input. */
export function toMinutes(time: string): number {
  if (!TIME_PATTERN.test(time)) {
    throw new Error(`Invalid time "${time}": expected HH:MM (24h)`)
  }
  const [h, m] = time.split(':').map(Number) as [number, number]
  return h * 60 + m
}

/** Convert minutes since midnight (0..1439) to "HH:MM". Throws when out of range. */
export function fromMinutes(minutes: number): string {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes >= 24 * 60) {
    throw new Error(`Invalid minutes ${minutes}: expected an integer in 0..1439`)
  }
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Comparator for sorting: negative if a is earlier than b, 0 if equal, positive if later. */
export function compareTime(a: string, b: string): number {
  return toMinutes(a) - toMinutes(b)
}
