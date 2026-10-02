import { describe, expect, it } from 'vitest'
import type { Schedule } from '../model/schema.ts'
import { LocaleSchema } from '../model/schema.ts'
import { parseSchedule } from '../model/validate.ts'
import { cairoSample } from '../samples/cairo.ts'
import { rtlDemo } from './__fixtures__/rtlDemo.ts'
import { defaultLabelsFor, fillSessionFallback, resolveLabels } from './labels.ts'
import { formatEventDate, formatTime, languageOf, resolveDirection, resolveLocale } from './locale.ts'
import { initials, renderAgendaBody, renderDocument } from './renderAgenda.ts'

const withEvent = (patch: Partial<Schedule['event']>): Schedule => ({
  ...cairoSample,
  event: { ...cairoSample.event, ...patch },
})
const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html')

describe('locale helpers', () => {
  it('resolves locale with a default and canonical form', () => {
    expect(resolveLocale(undefined)).toBe('en-GB')
    expect(resolveLocale('ar-eg')).toBe('ar-EG')
    expect(resolveLocale('???')).toBe('en-GB')
    expect(languageOf('ar-u-nu-latn')).toBe('ar')
  })

  it('schema validates locales through Intl', () => {
    expect(LocaleSchema.safeParse('ar-EG').success).toBe(true)
    expect(LocaleSchema.safeParse('ar-u-nu-latn').success).toBe(true)
    expect(LocaleSchema.safeParse('not a locale').success).toBe(false)
    expect(LocaleSchema.safeParse('').success).toBe(false)
    expect(parseSchedule(withEvent({ locale: 'xx_YY' })).ok).toBe(false)
  })

  it('direction is auto from the language, or forced', () => {
    for (const locale of ['ar-EG', 'he-IL', 'fa-IR', 'ur-PK', 'ps-AF', 'sd-PK', 'yi', 'ckb-IQ']) {
      expect(resolveDirection({ locale }), locale).toBe('rtl')
    }
    for (const locale of ['en-GB', 'fr-FR', 'tr-TR', undefined]) expect(resolveDirection({ locale })).toBe('ltr')
    expect(resolveDirection({ locale: 'ar-EG', direction: 'ltr' })).toBe('ltr')
    expect(resolveDirection({ locale: 'en-GB', direction: 'rtl' })).toBe('rtl')
    expect(resolveDirection({ locale: 'ar-EG', direction: 'auto' })).toBe('rtl')
  })

  it('formats 24h and 12h times with the locale', () => {
    expect(formatTime('13:30', 'en-GB')).toBe('13:30')
    expect(formatTime('09:05', 'en-GB', '24h')).toBe('09:05')
    expect(formatTime('13:30', 'en-US', '12h')).toMatch(/^1:30\u00a0PM$/)
    expect(formatTime('00:15', 'en-US', '12h')).toMatch(/^12:15\u00a0AM$/)
    expect(formatTime('13:30', 'ar-EG')).toBe('١٣:٣٠')
    expect(formatTime('13:30', 'ar-u-nu-latn')).toBe('13:30')
    expect(formatTime('bogus', 'en-GB')).toBe('bogus')
  })

  it('formats the long date in the locale, always Gregorian', () => {
    expect(formatEventDate('2026-10-02', 'en-GB')).toBe('Friday, 2 October 2026')
    expect(formatEventDate('2026-10-02', 'en-US')).toBe('Friday, October 2, 2026')
    expect(formatEventDate('2026-10-02', 'ar-EG')).toContain('أكتوبر')
    expect(formatEventDate('2026-10-02', 'ar-SA')).toContain('٢٠٢٦') // not the Hijri year
    expect(formatEventDate('2026-10-02', 'fr-FR')).toBe('vendredi 2 octobre 2026')
    expect(formatEventDate('nope', 'en-GB')).toBe('nope')
  })
})

describe('labels by language', () => {
  it('has built-in sets for en, ar and fr and falls back to English', () => {
    expect(defaultLabelsFor('en-US').agenda).toBe('Agenda')
    expect(defaultLabelsFor('ar-EG').agenda).toBe('الجدول')
    expect(defaultLabelsFor('fr-FR').agenda).toBe('Programme')
    expect(defaultLabelsFor('de-DE').agenda).toBe('Agenda')
    expect(defaultLabelsFor('ar-EG').trackSuffix).toBe('')
    expect(defaultLabelsFor('en-GB').trackSuffix).toBe('track')
  })

  it('user labels always win over the locale set', () => {
    const labels = resolveLabels({ agenda: 'Programa', trackSuffix: 'pista' }, 'ar-EG')
    expect(labels.agenda).toBe('Programa')
    expect(labels.trackSuffix).toBe('pista')
    expect(labels.speakers).toBe('المتحدثون')
  })

  it('fills the {track} placeholder in session fallbacks', () => {
    expect(fillSessionFallback('{track} session', 'Design')).toBe('Design session')
    expect(fillSessionFallback('جلسة {track}', 'البيانات')).toBe('جلسة البيانات')
    expect(fillSessionFallback('{track} / {track}', 'X')).toBe('X / X')
    expect(fillSessionFallback('No placeholder', 'X')).toBe('No placeholder')
  })

  it('uses a custom sessionFallback in the ghost cell, and a continuationLabel over it', () => {
    const s: Schedule = { ...cairoSample, labels: { sessionFallback: 'Stream: {track}' } }
    const noLabel: Schedule = {
      ...s,
      items: s.items.map((i) => (i.id === 'item-i3' ? { ...i, continuationLabel: undefined } : i)),
    }
    expect(parse(renderAgendaBody(noLabel)).querySelector('.ev.ghost')?.textContent).toBe(
      'Stream: Intermediate continues until 17:20',
    )
    expect(parse(renderAgendaBody(s)).querySelector('.ev.ghost')?.textContent).toBe(
      'Intermediate GKE session continues until 17:20',
    )
  })
})

describe('rendered locale', () => {
  it('defaults to en-GB, ltr', () => {
    const html = renderDocument(cairoSample)
    expect(html).toContain('<html lang="en-GB" dir="ltr"')
    expect(html).toContain('Friday, 2 October 2026')
  })

  it('renders ar-EG as rtl with an Arabic date, digits and labels', () => {
    const html = renderDocument(rtlDemo)
    const doc = parse(html)
    expect(doc.documentElement.getAttribute('lang')).toBe('ar-EG')
    expect(doc.documentElement.getAttribute('dir')).toBe('rtl')
    expect(doc.querySelector('.eyebrow')?.textContent).toBe('السبت، ١٤ نوفمبر ٢٠٢٦')
    expect(doc.querySelector('h2')?.textContent).toBe('الجدول')
    expect(doc.querySelectorAll('h2')[1]?.textContent).toBe('المتحدثون')
    expect(doc.querySelector('.btn')?.textContent).toBe('صفحة الفعالية الرسمية')
    expect(doc.querySelector('.spk')?.textContent).toBe('المتحدث سارة أحمد')
    expect([...doc.querySelectorAll('.legend .chip')].map((c) => c.textContent)).toEqual([
      'المسار التقني',
      'مسار البيانات',
      'للجميع',
    ])
    expect(doc.querySelector('.t')?.textContent).toBe('٠٩:٠٠٠٩:٣٠')
    expect(doc.querySelector('.when')?.textContent).toBe('١٠:٤٥ – ١١:٣٠')
    expect(doc.querySelector('.ev.ghost')?.textContent).toBe('جلسة تحليل البيانات تستمر حتى ١٢:٠٠')
    expect(doc.querySelector('.time')?.textContent).toMatch(/^٠٩:٠٠ – ١٢:٣٠/)
  })

  it('has no real company names in the RTL fixture', () => {
    expect(JSON.stringify(rtlDemo)).not.toMatch(/Google|Cairo University|Microsoft|Amazon/i)
  })

  it('falls back to the session template with the Arabic default', () => {
    const noLabel: Schedule = {
      ...rtlDemo,
      items: rtlDemo.items.map((i) => (i.id === 'i4' ? { ...i, continuationLabel: undefined } : i)),
    }
    expect(parse(renderAgendaBody(noLabel)).querySelector('.ev.ghost')?.textContent).toBe('جلسة مسار البيانات تستمر حتى ١٢:٠٠')
  })

  it('shows 12-hour times when asked', () => {
    const doc = parse(renderAgendaBody(withEvent({ locale: 'en-US', timeFormat: '12h' })))
    expect(doc.querySelector('.time')?.textContent).toMatch(/^1:30\sPM – 5:45\sPM/)
    expect(doc.querySelector('.t')?.textContent).toMatch(/^1:30\sPM2:00\sPM$/)
    expect(doc.querySelector('.ev.ghost')?.textContent).toMatch(/until 5:20\sPM$/)
    expect(doc.querySelector('.eyebrow')?.textContent).toBe('Friday, October 2, 2026')
    // data-s / data-e stay in minutes since midnight.
    expect(doc.querySelector('.ev[data-s]')?.getAttribute('data-s')).toBe('810')
  })

  it('direction can be forced independently of the language', () => {
    expect(renderDocument(withEvent({ direction: 'rtl' }))).toContain('dir="rtl"')
    expect(renderDocument(withEvent({ locale: 'ar-EG', direction: 'ltr' }))).toContain('dir="ltr"')
  })

  it('uses logical CSS properties so rtl mirrors', () => {
    const css = parse(renderDocument(cairoSample)).querySelector('style')?.textContent ?? ''
    expect(css).toContain('border-inline-start-width:4px')
    expect(css).not.toMatch(/border-width:1px 1px 1px 4px/)
    expect(css).not.toMatch(/margin-left|margin-right|padding-left|padding-right|border-left|border-right|text-align:(left|right)/)
    expect(css).toContain('text-align:start')
    expect(css).toContain(':root[dir="rtl"] .eyebrow')
  })

  it('keeps Arabic initials from joining into one glyph cluster', () => {
    expect(initials('سارة أحمد')).toBe('س‌أ')
    expect(initials('Sara Ahmed')).toBe('SA')
  })
})
