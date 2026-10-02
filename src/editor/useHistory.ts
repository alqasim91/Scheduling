import { useCallback, useRef, useState } from 'react'
import type { Schedule } from '../model/schema.ts'
import type { ApplyOptions } from './types.ts'

export const HISTORY_LIMIT = 100
/** Edits to the same text field closer together than this are one undo step. */
export const COALESCE_MS = 1500

interface State {
  past: Schedule[]
  present: Schedule
  future: Schedule[]
}

export interface History {
  schedule: Schedule
  /** Run an edit. Returns nothing; an edit that changes nothing is not recorded. */
  set: (op: (schedule: Schedule) => Schedule, options?: ApplyOptions) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  /**
   * Go back to `snapshot` as if the edits since it never happened (used to cancel a session that
   * was just created). Falls back to a normal edit when the snapshot is not in the history.
   */
  rollbackTo: (snapshot: Schedule) => void
}

const TEXT_INPUTS = new Set(['text', 'search', 'number', 'url', 'email', 'tel', 'color', 'range', 'date', 'time', 'password'])

/** The focused text-like field, if any: edits made through it while typing are grouped. */
function focusedTextField(): Element | null {
  const el = typeof document === 'undefined' ? null : document.activeElement
  if (!el) return null
  if (el instanceof HTMLTextAreaElement) return el
  if (el instanceof HTMLInputElement && TEXT_INPUTS.has(el.type)) return el
  return null
}

/**
 * The schedule plus an undo/redo history of snapshots (capped at 100). Snapshots are the
 * immutable schedule objects themselves, so keeping many is cheap.
 */
export function useHistory(initial: Schedule): History {
  const [state, setState] = useState<State>({ past: [], present: initial, future: [] })
  // The latest state, readable synchronously so several edits in one event see each other.
  const ref = useRef(state)
  const last = useRef<{ key: unknown; at: number } | null>(null)

  const commit = useCallback((next: State) => {
    ref.current = next
    setState(next)
  }, [])

  const set = useCallback<History['set']>(
    (op, options) => {
      const current = ref.current
      const present = op(current.present)
      if (present === current.present) return
      const key = options?.key === undefined ? focusedTextField() : options.key
      const now = Date.now()
      const join = key !== null && last.current !== null && last.current.key === key && now - last.current.at < (options?.within ?? COALESCE_MS) && current.past.length > 0
      last.current = key === null ? null : { key, at: now }
      if (join) {
        commit({ past: current.past, present, future: [] })
        return
      }
      const past = [...current.past, current.present]
      commit({ past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past, present, future: [] })
    },
    [commit],
  )

  const undo = useCallback(() => {
    const { past, present, future } = ref.current
    const previous = past[past.length - 1]
    if (previous === undefined) return
    last.current = null
    commit({ past: past.slice(0, -1), present: previous, future: [present, ...future] })
  }, [commit])

  const redo = useCallback(() => {
    const { past, present, future } = ref.current
    const next = future[0]
    if (next === undefined) return
    last.current = null
    commit({ past: [...past, present], present: next, future: future.slice(1) })
  }, [commit])

  const rollbackTo = useCallback<History['rollbackTo']>(
    (snapshot) => {
      const { past, present } = ref.current
      if (present === snapshot) return
      const at = past.lastIndexOf(snapshot)
      last.current = null
      if (at < 0) {
        set(() => snapshot, { key: null })
        return
      }
      commit({ past: past.slice(0, at), present: snapshot, future: [] })
    },
    [commit, set],
  )

  return {
    schedule: state.present,
    set,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    rollbackTo,
  }
}
