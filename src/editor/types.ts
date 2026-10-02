import type { Schedule } from '../model/schema.ts'

/** Apply a pure editing op to the current schedule. */
export type Apply = (op: (schedule: Schedule) => Schedule) => void
