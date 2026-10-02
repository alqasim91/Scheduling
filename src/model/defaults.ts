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

/** A valid, minimal schedule: track-grid mode, two track columns, one row, no items. */
export function createEmptySchedule(): Schedule {
  return {
    version: 1,
    event: {
      title: 'Untitled event',
      date: today(),
      timezone: localTimezone(),
      venue: '',
      notes: '',
    },
    branding: {
      logo: null,
      colors: {
        primary: '#0b57d0',
        background: '#f8fafd',
        surface: '#ffffff',
        text: '#1f1f1f',
        muted: '#444746',
        line: '#c4c7c5',
        accent: '#0b57d0',
      },
      fonts: {
        display: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        body: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        mono: 'ui-monospace, Menlo, Consolas, monospace',
      },
      theme: 'auto',
      motion: { preset: 'none', logoAnimation: false },
    },
    mode: 'track-grid',
    columns: [
      { id: newId('col'), name: 'Track 1', color: '#0b57d0', type: 'track' },
      { id: newId('col'), name: 'Track 2', color: '#188038', type: 'track' },
    ],
    rows: [{ id: newId('row'), start: '09:00', end: '10:00' }],
    items: [],
    speakers: [],
  }
}
