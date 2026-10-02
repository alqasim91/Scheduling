import { useCallback, useEffect, useRef, useState } from 'react'
import type { Schedule } from '../model/schema.ts'
import { parseSchedule } from '../model/validate.ts'

export const STORAGE_KEY = 'schedule-builder:v1'

/**
 * Read and validate an autosaved schedule, with the notes a migration left (an older autosave is
 * upgraded on the way in). Returns null if missing, invalid, or storage throws.
 */
export function readAutosaved(key: string): { schedule: Schedule; warnings: string[] } | null {
  try {
    const text = window.localStorage.getItem(key)
    if (text === null) return null
    const result = parseSchedule(JSON.parse(text))
    return result.ok ? { schedule: result.value, warnings: result.warnings } : null
  } catch {
    return null
  }
}

/** Like `readAutosaved`, for callers that only need the schedule. */
export function loadAutosaved(key: string): Schedule | null {
  return readAutosaved(key)?.schedule ?? null
}

/**
 * Debounced write of `value` to localStorage. Quota/access errors are swallowed.
 * Pending writes are flushed on unmount and on `beforeunload`. The initial value
 * is not written; only changes are.
 */
export function useAutosave(key: string, value: Schedule, delayMs = 500): 'saved' | 'saving' {
  const latest = useRef({ key, value })
  const saved = useRef(value)
  // What was last written (state, so the status can be shown); the ref above is what flush compares.
  const [written, setWritten] = useState(value)
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
    setWritten(v)
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

  return written === value ? 'saved' : 'saving'
}
