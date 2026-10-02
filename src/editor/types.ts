import type { Schedule } from '../model/schema.ts'

/**
 * How an edit joins the undo history. By default, edits made while the same text field has focus
 * within a moment of each other become one entry (typing). `key` groups edits explicitly (for
 * example held-down arrow keys); `null` never groups (one drag, one entry).
 */
export interface ApplyOptions {
  key?: string | null
  /** How long (ms) a pause may be before the next edit with the same key starts a new step. */
  within?: number
}

/** Apply a pure editing op to the current schedule. */
export type Apply = (op: (schedule: Schedule) => Schedule, options?: ApplyOptions) => void
