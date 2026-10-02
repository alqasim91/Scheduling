import type { Template } from '../types.ts'
import { brand, item } from './helpers.ts'

const ROOM = 'main'

/** An evening meetup with one track: welcome, two talks, lightning talks and networking. */
export const meetup: Template = {
  id: 'single-track-meetup',
  name: 'Single-track meetup',
  description: 'An evening meetup with one track: doors, a welcome, two talks, lightning talks and networking.',
  builtin: true,
  schedule: {
    version: 2,
    event: {
      title: 'Community Meetup',
      titleHighlight: 'Meetup',
      date: '2026-06-04',
      timezone: 'Europe/London',
      venue: 'Venue name, City',
      status: 'Free to attend',
      notes: '**Please RSVP** so we can plan food and seating.',
      url: 'https://example.org/meetup',
    },
    branding: brand({
      primary: '#00796b',
      accent: '#f4511e',
      background: '#f5faf9',
      surface: '#ffffff',
      text: '#18211f',
      muted: '#44514e',
      line: '#c7d6d3',
      note: '#f9ab00',
    }),
    mode: 'track-grid',
    columns: [{ id: ROOM, name: 'Main track', color: '#00796b', type: 'track' }],
    rows: [],
    items: [
      item({ id: 'i1', start: '18:30', end: '19:00', columnIds: [ROOM], title: 'Doors open, food and drinks', variant: 'break' }),
      item({ id: 'i2', start: '19:00', end: '19:10', columnIds: [ROOM], title: 'Welcome', speaker: 'Organiser', variant: 'highlight' }),
      item({ id: 'i3', start: '19:10', end: '19:50', columnIds: [ROOM], title: 'Talk title', speaker: 'Alex Example' }),
      item({ id: 'i4', start: '19:50', end: '20:30', columnIds: [ROOM], title: 'Talk title', speaker: 'Sam Sample' }),
      item({ id: 'i5', start: '20:30', end: '21:00', columnIds: [ROOM], title: 'Lightning talks' }),
      item({ id: 'i6', start: '21:00', end: '22:00', columnIds: [ROOM], title: 'Networking', variant: 'break' }),
    ],
    speakers: [
      { id: 's1', name: 'Alex Example', role: 'Job title, Company Name', color: '#00796b' },
      { id: 's2', name: 'Sam Sample', role: 'Job title, Company Name', color: '#f4511e' },
    ],
  },
}
