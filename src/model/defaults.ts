import { DEFAULT_COLORS, DEFAULT_FONTS } from './brandDefaults.ts'
import { newId } from './ids.ts'
import type { Schedule } from './schema.ts'

function today(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function localTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** A valid, minimal schedule: track-grid mode, two track columns, no items and no table rows. */
export function createEmptySchedule(): Schedule {
  return {
    version: 2,
    event: {
      title: 'Untitled event',
      date: today(),
      timezone: localTimezone(),
      venue: '',
      notes: '',
    },
    branding: {
      logo: null,
      colors: { ...DEFAULT_COLORS },
      fonts: { ...DEFAULT_FONTS },
      theme: 'auto',
      motion: { preset: 'none', logoAnimation: false },
    },
    mode: 'track-grid',
    columns: [
      { id: newId('col'), name: 'Track 1', color: '#0b57d0', type: 'track' },
      { id: newId('col'), name: 'Track 2', color: '#188038', type: 'track' },
    ],
    rows: [],
    items: [],
    speakers: [],
  }
}
