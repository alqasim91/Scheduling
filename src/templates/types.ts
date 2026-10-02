import type { Schedule } from '../model/schema.ts'

export interface Template {
  id: string
  name: string
  description: string
  builtin: boolean
  /** ISO timestamp, set for user templates. */
  createdAt?: string
  schedule: Schedule
}

/** What a template file and a user-template save carry. */
export interface TemplateContent {
  name: string
  description: string
  schedule: Schedule
}
