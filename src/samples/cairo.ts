import type { Schedule } from '../model/schema.ts'

/** The four 12px Google-style dots, 6px apart (66 x 12). */
const LOGO_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='66' height='12' viewBox='0 0 66 12'>" +
  "<circle cx='6' cy='6' r='6' fill='#0b57d0'/>" +
  "<circle cx='24' cy='6' r='6' fill='#d93025'/>" +
  "<circle cx='42' cy='6' r='6' fill='#f9ab00'/>" +
  "<circle cx='60' cy='6' r='6' fill='#188038'/>" +
  '</svg>'

const BEGINNER = 'col-beginner'
const INTERMEDIATE = 'col-intermediate'
const BOTH = [BEGINNER, INTERMEDIATE]

/** Developers Day Cairo, reproduced from `reference/developers-day-cairo.html`. */
export const cairoSample: Schedule = {
  version: 2,
  event: {
    title: 'Google for Developers Day: Cairo',
    titleHighlight: 'Developers',
    date: '2026-10-02',
    timezone: 'Africa/Cairo',
    venue: 'The GrEEK Campus Downtown, 171 El Tahrir Street, Abdeen',
    status: "You're registered",
    notes:
      '**Two sessions run at once in three slots:** 14:20, 15:35 and 16:35. Pick one lane per slot. ' +
      'The Intermediate session at 16:35 runs 15 minutes longer than the Beginner one.',
    url: 'https://rsvp.withgoogle.com/events/google-for-developers-day-cairo',
  },
  branding: {
    logo: `data:image/svg+xml,${encodeURIComponent(LOGO_SVG)}`,
    colors: {
      primary: '#0b57d0',
      accent: '#d93025',
      background: '#f8fafd',
      surface: '#ffffff',
      text: '#1f1f1f',
      muted: '#444746',
      line: '#c4c7c5',
    },
    fonts: {
      display: "'Google Sans','Product Sans',Roboto,Arial,sans-serif",
      body: "Roboto,'Helvetica Neue',Arial,sans-serif",
      mono: "'Roboto Mono',ui-monospace,Menlo,monospace",
      webFonts: ['Roboto', 'Roboto Mono'],
    },
    theme: 'auto',
    motion: { preset: 'none', logoAnimation: false },
  },
  mode: 'track-grid',
  columns: [
    { id: BEGINNER, name: 'Beginner', color: '#188038', type: 'track' },
    { id: INTERMEDIATE, name: 'Intermediate', color: '#0b57d0', type: 'track' },
  ],
  rows: [],
  items: [
    { id: 'item-welcome', start: '13:30', end: '14:00', columnIds: BOTH, title: 'Registration & Welcome', variant: 'break' },
    {
      id: 'item-keynote',
      start: '14:00',
      end: '14:20',
      columnIds: BOTH,
      title: 'Opening & Keynote',
      note: "The page also lists a 5 minute room change at 14:15 – 14:20. The keynote is listed until 14:30, but the first sessions start at 14:20.",
      variant: 'highlight',
    },
    {
      id: 'item-b1',
      start: '14:20',
      end: '15:05',
      columnIds: [BEGINNER],
      title: 'Beyond the Prompt: Context and Harness Engineering for the Modern Developer',
      speaker: 'Tarek Alabd',
      variant: 'session',
    },
    {
      id: 'item-i1',
      start: '14:20',
      end: '15:05',
      columnIds: [INTERMEDIATE],
      title: 'Safeguarding Agents with Agents Sandbox: A hands-on lab',
      speaker: 'Abdelfettah Sghiouar',
      variant: 'session',
    },
    { id: 'item-lunch', start: '15:05', end: '15:35', columnIds: BOTH, title: 'Lunch', variant: 'break' },
    {
      id: 'item-b2',
      start: '15:35',
      end: '16:20',
      columnIds: [BEGINNER],
      title: 'Flutter Agentic UI, When Apps Start Thinking, Designing, and Acting',
      speaker: 'Ahmed Abu Eldahab',
      variant: 'session',
    },
    {
      id: 'item-i2',
      start: '15:35',
      end: '16:20',
      columnIds: [INTERMEDIATE],
      title: 'A return of experience. Real-World Predictive vs Generative Challenges in AI for Good',
      speaker: 'Sarra Al-Ateif',
      variant: 'session',
    },
    { id: 'item-coffee', start: '16:20', end: '16:35', columnIds: BOTH, title: 'Coffee Break', variant: 'break' },
    {
      id: 'item-b3',
      start: '16:35',
      end: '17:05',
      columnIds: [BEGINNER],
      title: 'Your AI Made a Decision. Can You Explain It?',
      speaker: 'Dr. Asma Merabet',
      variant: 'session',
    },
    {
      id: 'item-i3',
      start: '16:35',
      end: '17:20',
      columnIds: [INTERMEDIATE],
      title: 'Scale Distributed Data Processing with GKE to build a Knowledge Graph in BigQuery',
      speaker: 'Ibtissem Hattab',
      continuationLabel: 'Intermediate GKE session',
      variant: 'session',
    },
    {
      id: 'item-b4',
      start: '17:05',
      end: '17:35',
      columnIds: [BEGINNER],
      title: 'Build with Gemma 4',
      speaker: 'Eman Alrefai',
      variant: 'session',
    },
    { id: 'item-closing', start: '17:35', end: '17:45', columnIds: BOTH, title: 'Closing remarks', variant: 'break' },
  ],
  speakers: [
    { id: 'spk-rc', name: 'Ramesh Chander', role: 'Head of Developer Relations MENAT, Google', color: '#0b57d0' },
    { id: 'spk-as', name: 'Abdelfettah Sghiouar', role: 'Cloud Developer Advocate, Google', color: '#d93025' },
    { id: 'spk-aa', name: 'Ahmed Abu Eldahab', role: 'CEO and Flutter GDE', color: '#188038' },
    { id: 'spk-ih', name: 'Ibtissem Hattab', role: 'SRE-MLOps Engineer and Cloud GDE', color: '#b06000' },
    { id: 'spk-ta', name: 'Tarek Alabd', role: 'Software Engineering Team Lead and Flutter GDE', color: '#0b57d0' },
    { id: 'spk-am', name: 'Dr. Asma Merabet', role: 'AI Engineer and Backend Developer & AI GDE', color: '#d93025' },
    { id: 'spk-sa', name: 'Sarra Al-Ateif', role: 'Assistant Professor and AI GDE', color: '#188038' },
    { id: 'spk-ea', name: 'Eman Alrefai', role: 'Applied Scientist and Cloud AI GDE', color: '#b06000' },
  ],
}
