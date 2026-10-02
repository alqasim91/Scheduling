import { useCallback, useEffect, useRef } from 'react'
import type { Schedule } from '../model/schema.ts'
import { parseSchedule } from '../model/validate.ts'

export const STORAGE_KEY = 'schedule-builder:v1'

/** Read and validate an autosaved schedule. Returns null if missing, invalid, or storage throws. */
export function loadAutosaved(key: string): Schedule | null {
  try {
    const text = window.localStorage.getItem(key)
    if (text === null) return null
    const result = parseSchedule(JSON.parse(text))
    return result.ok ? result.value : null
  } catch {
    return null
  }
}

/**
 * Debounced write of `value` to localStorage. Quota/access errors are swallowed.
 * Pending writes are flushed on unmount and on `beforeunload`. The initial value
 * is not written; only changes are.
 */
export function useAutosave(key: string, value: Schedule, delayMs = 500): void {
  const latest = useRef({ key, value })
  const saved = useRef(value)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Writes the latest value if it has not been written yet. Only touches refs.
  const flush = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = undefined
    const { key: k, value: v } = latest.current
    if (v === saved.current) return
    try {
      window.localStorage.setItem(k, JSON.stringify(v))
    } catch {
      // Quota exceeded or storage unavailable: autosave is best-effort.
    }
    saved.current = v
  }, [])

  useEffect(() => {
    latest.current = { key, value }
    if (value === saved.current) return
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, delayMs)
  }, [key, value, delayMs, flush])

  useEffect(() => {
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('beforeunload', flush)
      flush()
    }
  }, [flush])
}
