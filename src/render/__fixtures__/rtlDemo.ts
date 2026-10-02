import type { Schedule } from '../../model/schema.ts'

/** A generic Arabic-language event used to check right-to-left rendering. No real organisations. */
export const rtlDemo: Schedule = {
  version: 1,
  event: {
    title: 'ملتقى المطورين السنوي',
    titleHighlight: 'المطورين',
    date: '2026-11-14',
    timezone: 'Africa/Cairo',
    venue: 'قاعة المؤتمرات، المبنى الرئيسي',
    status: 'التسجيل مفتوح',
    notes: '**تنبيه:** تبدأ الجلستان الأولى والثانية في وقت واحد، يرجى اختيار مسار واحد.',
    url: 'https://example.org/event',
    locale: 'ar-EG',
  },
  branding: {
    logo: null,
    colors: {
      primary: '#00695c',
      accent: '#c62828',
      background: '#f6faf9',
      surface: '#ffffff',
      text: '#1b1f1e',
      muted: '#4a5553',
      line: '#c5d0ce',
      note: '#f9ab00',
    },
    fonts: {
      display: "'Cairo', 'Segoe UI', Tahoma, system-ui, sans-serif",
      body: "'Tajawal', 'Segoe UI', Tahoma, system-ui, sans-serif",
      mono: 'ui-monospace, Menlo, Consolas, monospace',
      webFonts: ['Cairo', 'Tajawal'],
    },
    theme: 'light',
    motion: { preset: 'none', logoAnimation: false },
  },
  mode: 'track-grid',
  columns: [
    { id: 'c1', name: 'المسار التقني', color: '#00695c', type: 'track' },
    { id: 'c2', name: 'مسار البيانات', color: '#1565c0', type: 'track' },
  ],
  rows: [
    { id: 'r1', start: '09:00', end: '09:30' },
    { id: 'r2', start: '09:30', end: '10:30', note: 'الكلمة الافتتاحية في القاعة الكبرى.' },
    { id: 'r3', start: '10:45', end: '11:30' },
    { id: 'r4', start: '11:30', end: '12:00' },
    { id: 'r5', start: '12:00', end: '12:30' },
  ],
  items: [
    { id: 'i1', rowId: 'r1', columnIds: ['c1', 'c2'], title: 'التسجيل والاستقبال', variant: 'break' },
    { id: 'i2', rowId: 'r2', columnIds: ['c1', 'c2'], title: 'الكلمة الافتتاحية', variant: 'highlight' },
    { id: 'i3', rowId: 'r3', columnIds: ['c1'], title: 'مقدمة في تصميم الأنظمة الموزعة', speaker: 'سارة أحمد', variant: 'session' },
    {
      id: 'i4',
      rowId: 'r3',
      columnIds: ['c2'],
      title: 'أساسيات تحليل البيانات',
      speaker: 'محمد علي',
      end: '12:00',
      continuationLabel: 'جلسة تحليل البيانات',
      variant: 'session',
    },
    { id: 'i5', rowId: 'r4', columnIds: ['c1'], title: 'ورشة عمل تطبيقية', speaker: 'سارة أحمد', variant: 'session' },
    { id: 'i6', rowId: 'r5', columnIds: ['c1', 'c2'], title: 'استراحة وختام', variant: 'break' },
  ],
  speakers: [
    { id: 's1', name: 'سارة أحمد', role: 'مهندسة برمجيات', color: '#00695c' },
    { id: 's2', name: 'محمد علي', role: 'محلل بيانات', color: '#1565c0' },
  ],
}
