import type { Schedule } from '../../model/schema.ts'

/** The table-mode idea in Arabic (ar-EG): right-to-left table, Arabic labels and digits. No real organisations. */
export const tableDemoRtl: Schedule = {
  version: 1,
  event: {
    title: 'اجتماع فريق المنتج السنوي',
    titleHighlight: 'فريق المنتج',
    date: '2026-05-14',
    timezone: 'Africa/Cairo',
    venue: 'قاعة الاجتماعات الكبرى',
    status: 'بدعوة خاصة',
    notes: '**الغداء مشمول.** يرجى إبلاغنا بأي احتياجات غذائية.',
    url: 'https://example.org/offsite',
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
    theme: 'auto',
    motion: { preset: 'none', logoAnimation: false },
  },
  mode: 'table',
  columns: [
    { id: 'c1', name: 'الجلسة', color: '#4a5553', type: 'text' },
    { id: 'c2', name: 'المتحدث', color: '#00695c', type: 'person' },
    { id: 'c3', name: 'القاعة', color: '#4a5553', type: 'text' },
    { id: 'c4', name: 'الوسوم', color: '#1565c0', type: 'tag' },
    { id: 'c5', name: 'النهاية', color: '#4a5553', type: 'time' },
  ],
  rows: [
    { id: 'r1', start: '09:00', end: '09:30', cells: { c1: 'الاستقبال والقهوة', c2: 'سارة أحمد', c3: 'البهو', c4: 'اجتماعي', c5: '09:30' } },
    {
      id: 'r2',
      start: '09:30',
      end: '10:30',
      note: 'أحضروا أهم ثلاث أولويات لفريقكم.',
      cells: { c1: 'مراجعة خارطة الطريق', c2: 'سارة أحمد', c3: 'القاعة الكبرى', c4: 'تخطيط، خارطة الطريق', c5: '10:30' },
    },
    { id: 'r3', start: '10:30', end: '10:45', cells: { c1: 'استراحة', c3: 'البهو' } },
    {
      id: 'r4',
      start: '10:45',
      end: '12:00',
      cells: { c1: 'جلسة معمّقة حول نقل المنصة', c2: 'محمد علي', c3: 'القاعة أ', c4: 'هندسة، نقل، أسئلة', c5: '12:00' },
    },
    { id: 'r5', start: '12:00', end: '13:00', cells: { c1: 'الغداء', c3: 'الفناء', c4: 'اجتماعي' } },
    {
      id: 'r6',
      start: '13:00',
      end: '14:30',
      cells: { c1: 'ورشة نظام التصميم', c2: 'ميرنا حسن', c3: 'القاعة ب', c4: 'تصميم، ورشة', c5: '14:30' },
    },
    { id: 'r7', start: '14:30', end: '15:00', cells: { c1: 'الختام والخطوات التالية', c2: 'ضيف الجلسة', c3: 'القاعة الكبرى', c4: 'تخطيط', c5: '15:00' } },
  ],
  items: [],
  speakers: [
    { id: 's1', name: 'سارة أحمد', role: 'رئيسة المنتج', color: '#00695c' },
    { id: 's2', name: 'محمد علي', role: 'قائد الهندسة', color: '#1565c0' },
    { id: 's3', name: 'ميرنا حسن', role: 'قائدة التصميم', color: '#c62828' },
  ],
}
