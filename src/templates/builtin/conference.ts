import type { Template } from '../types.ts'
import { brand, item } from './helpers.ts'

const A = 'track-a'
const B = 'track-b'
const BOTH = [A, B]

/** Conference with two parallel tracks, shared breaks, a keynote and a session that runs long. */
export const conference: Template = {
  id: 'conference-two-tracks',
  name: 'Conference, two tracks',
  description: 'A one-day conference with a keynote, two parallel tracks, shared breaks and a session that runs past its slot.',
  builtin: true,
  schedule: {
    version: 1,
    event: {
      title: 'Company Name Summit',
      titleHighlight: 'Summit',
      date: '2026-06-04',
      timezone: 'Europe/London',
      venue: 'Venue name, City',
      status: 'Registration open',
      notes: '**Two sessions run at once** after the keynote. Pick one track for each slot.',
      url: 'https://example.org/summit',
    },
    branding: brand({
      primary: '#3949ab',
      accent: '#e65100',
      background: '#f7f8fc',
      surface: '#ffffff',
      text: '#1b1d29',
      muted: '#4b4f63',
      line: '#cfd3e3',
      note: '#f9ab00',
    }),
    mode: 'track-grid',
    columns: [
      { id: A, name: 'Track A', color: '#00897b', type: 'track' },
      { id: B, name: 'Track B', color: '#3949ab', type: 'track' },
    ],
    rows: [
      { id: 'r1', start: '09:00', end: '09:30' },
      { id: 'r2', start: '09:30', end: '10:15' },
      { id: 'r3', start: '10:30', end: '11:15' },
      { id: 'r4', start: '11:15', end: '11:30' },
      { id: 'r5', start: '11:30', end: '12:15' },
      { id: 'r6', start: '12:15', end: '12:45' },
      { id: 'r7', start: '12:45', end: '13:45' },
      { id: 'r8', start: '13:45', end: '14:30' },
      { id: 'r9', start: '14:30', end: '15:00' },
    ],
    items: [
      item({ id: 'i1', rowId: 'r1', columnIds: BOTH, title: 'Registration and coffee', variant: 'break' }),
      item({ id: 'i2', rowId: 'r2', columnIds: BOTH, title: 'Opening keynote', speaker: 'Alex Example', variant: 'highlight' }),
      item({ id: 'i3', rowId: 'r3', columnIds: [A], title: 'Session title', speaker: 'Sam Sample' }),
      item({ id: 'i4', rowId: 'r3', columnIds: [B], title: 'Session title', speaker: 'Taylor Template' }),
      item({ id: 'i5', rowId: 'r4', columnIds: BOTH, title: 'Coffee break', variant: 'break' }),
      item({ id: 'i6', rowId: 'r5', columnIds: [A], title: 'Session title', speaker: 'Jordan Placeholder' }),
      item({
        id: 'i7',
        rowId: 'r5',
        columnIds: [B],
        title: 'Workshop title',
        speaker: 'Sam Sample',
        end: '12:45',
        continuationLabel: 'Track B workshop',
      }),
      item({ id: 'i8', rowId: 'r6', columnIds: [A], title: 'Session title', speaker: 'Taylor Template' }),
      item({ id: 'i9', rowId: 'r7', columnIds: BOTH, title: 'Lunch', variant: 'break' }),
      item({ id: 'i10', rowId: 'r8', columnIds: [A], title: 'Session title', speaker: 'Jordan Placeholder' }),
      item({ id: 'i11', rowId: 'r8', columnIds: [B], title: 'Session title', speaker: 'Alex Example' }),
      item({ id: 'i12', rowId: 'r9', columnIds: BOTH, title: 'Closing remarks', speaker: 'Alex Example', variant: 'highlight' }),
    ],
    speakers: [
      { id: 's1', name: 'Alex Example', role: 'Job title, Company Name', color: '#3949ab' },
      { id: 's2', name: 'Sam Sample', role: 'Job title, Company Name', color: '#00897b' },
      { id: 's3', name: 'Taylor Template', role: 'Job title, Company Name', color: '#e65100' },
      { id: 's4', name: 'Jordan Placeholder', role: 'Job title, Company Name', color: '#6a1b9a' },
    ],
  },
}
