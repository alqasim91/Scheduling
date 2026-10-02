import type { Template } from '../types.ts'
import { brand } from './helpers.ts'

/** A one-day workshop as a table: module, facilitator, format and materials per time slot. */
export const workshop: Template = {
  id: 'workshop-day',
  name: 'Workshop day',
  description: 'A one-day workshop as a table: a module, its facilitator, format tags and materials for each time slot.',
  builtin: true,
  schedule: {
    version: 1,
    event: {
      title: 'Hands-on Workshop',
      titleHighlight: 'Workshop',
      date: '2026-06-04',
      timezone: 'Europe/London',
      venue: 'Venue name, City',
      status: 'Places limited',
      notes: '**Bring a laptop.** Setup instructions are sent a week before.',
      url: 'https://example.org/workshop',
    },
    branding: brand({
      primary: '#6a1b9a',
      accent: '#00897b',
      background: '#faf7fc',
      surface: '#ffffff',
      text: '#211a26',
      muted: '#51485a',
      line: '#d8cfe0',
      note: '#f9ab00',
    }),
    mode: 'table',
    columns: [
      { id: 'module', name: 'Module', color: '#51485a', type: 'text' },
      { id: 'facilitator', name: 'Facilitator', color: '#6a1b9a', type: 'person' },
      { id: 'format', name: 'Format', color: '#6a1b9a', type: 'tag' },
      { id: 'materials', name: 'Materials', color: '#51485a', type: 'text' },
    ],
    rows: [
      {
        id: 'r1',
        start: '09:00',
        end: '09:30',
        cells: { module: 'Welcome and goals', facilitator: 'Facilitator One', format: 'Discussion', materials: 'Agenda sheet' },
      },
      {
        id: 'r2',
        start: '09:30',
        end: '10:30',
        cells: { module: 'Module 1: Fundamentals', facilitator: 'Facilitator One', format: 'Lecture', materials: 'Slides' },
      },
      { id: 'r3', start: '10:30', end: '10:45', cells: { module: 'Break' } },
      {
        id: 'r4',
        start: '10:45',
        end: '12:15',
        note: 'Work in pairs. Ask a facilitator if you get stuck.',
        cells: { module: 'Module 2: Hands-on lab', facilitator: 'Facilitator Two', format: 'Hands-on, Pairs', materials: 'Laptop required' },
      },
      { id: 'r5', start: '12:15', end: '13:15', cells: { module: 'Lunch' } },
      {
        id: 'r6',
        start: '13:15',
        end: '14:45',
        cells: { module: 'Module 3: Case study', facilitator: 'Facilitator Two', format: 'Group work', materials: 'Case handout' },
      },
      {
        id: 'r7',
        start: '14:45',
        end: '15:30',
        cells: { module: 'Module 4: Review and Q&A', facilitator: 'Facilitator One', format: 'Discussion, Q&A', materials: 'Slides' },
      },
      { id: 'r8', start: '15:30', end: '16:00', cells: { module: 'Wrap-up and next steps', facilitator: 'Facilitator One', format: 'Discussion' } },
    ],
    items: [],
    speakers: [
      { id: 's1', name: 'Facilitator One', role: 'Job title, Company Name', color: '#6a1b9a' },
      { id: 's2', name: 'Facilitator Two', role: 'Job title, Company Name', color: '#00897b' },
    ],
  },
}
