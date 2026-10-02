import type { Template } from '../types.ts'
import { brand } from './helpers.ts'

/** A team offsite as a table: session, owner, room, tags and an end time. */
export const offsite: Template = {
  id: 'team-offsite',
  name: 'Team offsite',
  description: 'A team offsite as a flat table: session, owner, room, tags and an end time, with a note under one row.',
  builtin: true,
  schedule: {
    version: 1,
    event: {
      title: 'Team Offsite',
      titleHighlight: 'Offsite',
      date: '2026-06-04',
      timezone: 'Europe/London',
      venue: 'Venue name, City',
      status: 'Invitation only',
      notes: '**Lunch is provided.** Please tell us about dietary needs beforehand.',
      url: 'https://example.org/offsite',
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
    mode: 'table',
    columns: [
      { id: 'session', name: 'Session', color: '#4b4f63', type: 'text' },
      { id: 'owner', name: 'Owner', color: '#3949ab', type: 'person' },
      { id: 'room', name: 'Room', color: '#4b4f63', type: 'text' },
      { id: 'tag', name: 'Tag', color: '#00897b', type: 'tag' },
      { id: 'ends', name: 'Ends', color: '#4b4f63', type: 'time' },
    ],
    rows: [
      {
        id: 'r1',
        start: '09:00',
        end: '09:30',
        cells: { session: 'Welcome and coffee', owner: 'Facilitator One', room: 'Foyer', tag: 'Social', ends: '09:30' },
      },
      {
        id: 'r2',
        start: '09:30',
        end: '10:30',
        note: 'Bring your team\u2019s top three priorities.',
        cells: { session: 'Roadmap review', owner: 'Facilitator One', room: 'Main hall', tag: 'Planning, Roadmap', ends: '10:30' },
      },
      { id: 'r3', start: '10:30', end: '10:45', cells: { session: 'Break', room: 'Foyer' } },
      {
        id: 'r4',
        start: '10:45',
        end: '12:00',
        cells: { session: 'Deep dive session', owner: 'Facilitator Two', room: 'Room A', tag: 'Engineering, Q&A', ends: '12:00' },
      },
      { id: 'r5', start: '12:00', end: '13:00', cells: { session: 'Lunch', room: 'Courtyard', tag: 'Social' } },
      {
        id: 'r6',
        start: '13:00',
        end: '14:15',
        cells: { session: 'Workshop', owner: 'Facilitator Three', room: 'Room B', tag: 'Design, Workshop', ends: '14:15' },
      },
      {
        id: 'r7',
        start: '14:15',
        end: '15:30',
        cells: { session: 'Feedback roundtable', owner: 'Guest facilitator', room: 'Room A', tag: 'Research', ends: '15:30' },
      },
      {
        id: 'r8',
        start: '15:30',
        end: '16:00',
        cells: { session: 'Wrap-up and next steps', owner: 'Facilitator One', room: 'Main hall', tag: 'Planning', ends: '16:00' },
      },
    ],
    items: [],
    speakers: [
      { id: 's1', name: 'Facilitator One', role: 'Job title, Company Name', color: '#3949ab' },
      { id: 's2', name: 'Facilitator Two', role: 'Job title, Company Name', color: '#00897b' },
      { id: 's3', name: 'Facilitator Three', role: 'Job title, Company Name', color: '#e65100' },
    ],
  },
}
