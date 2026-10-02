import type { Template } from '../types.ts'
import { brand, item } from './helpers.ts'

const A = 'track-a'
const B = 'track-b'
const BOTH = [A, B]

/** An Arabic (ar-EG, right-to-left) conference with two tracks, using Cairo and Tajawal web fonts. */
export const arabicConference: Template = {
  id: 'arabic-conference',
  name: 'Arabic conference',
  description: 'A right-to-left Arabic conference (ar-EG) with two tracks, Arabic labels and digits, and Cairo and Tajawal fonts.',
  builtin: true,
  schedule: {
    version: 2,
    event: {
      title: 'الملتقى السنوي',
      titleHighlight: 'السنوي',
      date: '2026-06-04',
      timezone: 'Africa/Cairo',
      venue: 'اسم القاعة، المدينة',
      status: 'التسجيل مفتوح',
      notes: '**تنبيه:** تبدأ الجلستان في وقت واحد، يرجى اختيار مسار واحد لكل فترة.',
      url: 'https://example.org/forum',
      locale: 'ar-EG',
    },
    branding: brand(
      {
        primary: '#00695c',
        accent: '#c62828',
        background: '#f6faf9',
        surface: '#ffffff',
        text: '#1b1f1e',
        muted: '#4a5553',
        line: '#c5d0ce',
        note: '#f9ab00',
      },
      {
        display: "'Cairo', 'Segoe UI', Tahoma, system-ui, sans-serif",
        body: "'Tajawal', 'Segoe UI', Tahoma, system-ui, sans-serif",
        webFonts: ['Cairo', 'Tajawal'],
      },
    ),
    mode: 'track-grid',
    columns: [
      { id: A, name: 'المسار الأول', color: '#00695c', type: 'track' },
      { id: B, name: 'المسار الثاني', color: '#1565c0', type: 'track' },
    ],
    rows: [],
    items: [
      item({ id: 'i1', start: '09:00', end: '09:30', columnIds: BOTH, title: 'التسجيل والاستقبال', variant: 'break' }),
      item({ id: 'i2', start: '09:30', end: '10:30', columnIds: BOTH, title: 'الكلمة الافتتاحية', speaker: 'أحمد المثال', note: 'الكلمة الافتتاحية في القاعة الكبرى.', variant: 'highlight' }),
      item({ id: 'i3', start: '10:45', end: '11:30', columnIds: [A], title: 'عنوان الجلسة', speaker: 'سلمى المثال' }),
      item({
        id: 'i4',
        start: '10:45',
        end: '12:00',
        columnIds: [B],
        title: 'عنوان الجلسة',
        speaker: 'خالد المثال',
        continuationLabel: 'جلسة المسار الثاني',
      }),
      item({ id: 'i5', start: '11:30', end: '12:00', columnIds: [A], title: 'ورشة عمل تطبيقية', speaker: 'سلمى المثال' }),
      item({ id: 'i6', start: '12:00', end: '13:00', columnIds: BOTH, title: 'استراحة الغداء', variant: 'break' }),
      item({ id: 'i7', start: '13:00', end: '14:00', columnIds: BOTH, title: 'الختام', speaker: 'أحمد المثال', variant: 'highlight' }),
    ],
    speakers: [
      { id: 's1', name: 'أحمد المثال', role: 'المسمى الوظيفي، اسم الشركة', color: '#00695c' },
      { id: 's2', name: 'سلمى المثال', role: 'المسمى الوظيفي، اسم الشركة', color: '#1565c0' },
      { id: 's3', name: 'خالد المثال', role: 'المسمى الوظيفي، اسم الشركة', color: '#c62828' },
    ],
  },
}
