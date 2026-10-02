/**
 * Pure HTML renderer for a track-grid schedule. No React, no DOM: it returns strings so the
 * same code drives the live preview iframe and (later) the "Save as HTML" export.
 */
import type { Item, Schedule, Speaker } from '../model/schema.ts'
import { TIME_PATTERN, toMinutes } from '../model/time.ts'
import { agendaCss } from './agendaCss.ts'
import { googleFontsUrl } from './fonts.ts'
import { fillSessionFallback, resolveLabels, type ResolvedLabels } from './labels.ts'
import {
  formatEventDate,
  formatTime,
  resolveDirection,
  resolveLocale,
  timezoneShortName,
  type TimeFormat,
} from './locale.ts'
import { cssColor, escapeHtml, renderInlineMarkup, safeDataImage, safeHttpUrl } from './escape.ts'

const FALLBACK_COLOR = '#888888'

/* ---------- small helpers ---------- */

function minutesOf(time: string | undefined): number | null {
  return time !== undefined && TIME_PATTERN.test(time) ? toMinutes(time) : null
}

/** Attribute pair like ` data-s="810"`, or '' when the time is not usable. */
function dataAttr(name: string, time: string): string {
  const minutes = minutesOf(time)
  return minutes === null ? '' : ` data-${name}="${minutes}"`
}

/** Initials from the first two words, skipping prefixes like "Dr."; a single word gives one letter. */
export function initials(name: string): string {
  const words = name
    .split(/\s+/)
    .filter((w) => w !== '' && !w.endsWith('.'))
  if (words.length === 0) return Array.from(name.trim())[0]?.toUpperCase() ?? ''
  const letters = words.slice(0, 2).map((w) => Array.from(w)[0] ?? '')
  // Adjacent Arabic letters would join into one glyph cluster; a zero-width non-joiner keeps them apart.
  const separator = letters.length > 1 && letters.every((l) => /\p{Script=Arabic}/u.test(l)) ? '\u200c' : ''
  return letters.join(separator).toUpperCase()
}

/** Wrap the first occurrence of `highlight` in `<b>`, escaping every piece separately. */
function renderTitle(title: string, highlight: string | undefined): string {
  const at = highlight ? title.indexOf(highlight) : -1
  if (!highlight || at < 0) return escapeHtml(title)
  return (
    escapeHtml(title.slice(0, at)) +
    `<b>${escapeHtml(highlight)}</b>` +
    escapeHtml(title.slice(at + highlight.length))
  )
}

/** "<name> <suffix>", unless the name already contains the suffix (e.g. "Track 1"). */
function legendLabel(name: string, suffix: string): string {
  if (suffix === '' || name.toLowerCase().includes(suffix.toLowerCase())) return name
  return `${name} ${suffix}`
}

/* ---------- layout ---------- */

/** Everything the markup needs besides the schedule: wording, locale and animation order. */
interface Context {
  labels: ResolvedLabels
  locale: string
  timeFormat: TimeFormat
  stagger: boolean
  /** Next card index for the stagger delay. */
  cards: { next: number }
}

function fmt(ctx: Context, time: string): string {
  return formatTime(time, ctx.locale, ctx.timeFormat)
}

/** Inline style fragment giving the card its place in the stagger sequence (capped at 20). */
function stagger(ctx: Context): string {
  if (!ctx.stagger) return ''
  return `;--i:${Math.min(ctx.cards.next++, 20)}`
}

interface Placed {
  item: Item
  row: number
  lastRow: number
  firstCol: number
  lastCol: number
  start: string
  end: string
  spansAll: boolean
}

function placeItems(schedule: Schedule): Placed[] {
  const rowIndex = new Map<string, number>()
  schedule.rows.forEach((row, i) => {
    if (!rowIndex.has(row.id)) rowIndex.set(row.id, i)
  })
  const colIndex = new Map<string, number>()
  schedule.columns.forEach((col, i) => {
    if (!colIndex.has(col.id)) colIndex.set(col.id, i)
  })
  const lanes = schedule.columns.length

  const placed: Placed[] = []
  for (const item of schedule.items) {
    const row = rowIndex.get(item.rowId)
    const cols = item.columnIds.map((id) => colIndex.get(id)).filter((i): i is number => i !== undefined)
    if (row === undefined || cols.length === 0) continue
    const firstCol = Math.min(...cols)
    const lastCol = Math.max(...cols)
    const lastRow = Math.min(schedule.rows.length - 1, row + Math.max(1, item.rowSpan ?? 1) - 1)
    placed.push({
      item,
      row,
      lastRow,
      firstCol,
      lastCol,
      start: item.start ?? (schedule.rows[row]?.start ?? ''),
      end: item.end ?? (schedule.rows[lastRow]?.end ?? ''),
      spansAll: firstCol === 0 && lastCol === lanes - 1,
    })
  }
  return placed
}

function renderItem(schedule: Schedule, ctx: Context, p: Placed, gridRow: string): string {
  const { item } = p
  const { labels } = ctx
  const column = schedule.columns[p.firstCol]
  const color = cssColor(column?.color ?? '', FALLBACK_COLOR)
  const placement = `grid-row:${gridRow};grid-column:${p.firstCol + 2} / ${p.lastCol + 3}${stagger(ctx)}`
  const times = dataAttr('s', p.start) + dataAttr('e', p.end)
  const title = `<h3>${escapeHtml(item.title)}</h3>`
  const speaker = item.speaker
    ? `<div class="spk"><span class="lbl">${escapeHtml(labels.speakerPrefix)}</span> ${escapeHtml(item.speaker)}</div>`
    : ''

  // Hidden by CSS unless an exported page marks the card as happening now.
  const badge = `<span class="badge">${escapeHtml(labels.now)}</span>`
  if (item.variant === 'highlight') {
    return `<div class="ev key" style="${placement}"${times}>${badge}${title}${speaker}</div>`
  }
  if (item.variant === 'break') {
    return `<div class="ev shared" style="${placement}"${times}>${badge}${title}${speaker}</div>`
  }

  const spanned = schedule.columns.slice(p.firstCol, p.lastCol + 1)
  const chipLabel = p.spansAll && spanned.length > 1 ? '' : spanned.map((c) => c.name).join(' + ')
  const chip = chipLabel ? `<span class="chip" style="--c:${color}">${escapeHtml(chipLabel)}</span>` : ''
  const when = `<div class="when">${escapeHtml(fmt(ctx, p.start))} – ${escapeHtml(fmt(ctx, p.end))}</div>`
  return `<div class="ev track" style="${placement};--c:${color}"${times}>${badge}${chip}${title}${speaker}${when}</div>`
}

/* ---------- sections ---------- */

function renderHeader(schedule: Schedule, ctx: Context, placed: Placed[]): string {
  const { event, branding } = schedule
  const logoSrc = safeDataImage(branding.logo)
  const logo = logoSrc ? `<img class="logo" src="${escapeHtml(logoSrc)}" alt="">` : ''

  const first = schedule.rows[0]
  const latest = [...schedule.rows.map((r) => r.end), ...placed.map((p) => p.item.end ?? '')]
    .filter((t) => minutesOf(t) !== null)
    .reduce<string | null>((best, t) => (best === null || (minutesOf(t) ?? 0) > (minutesOf(best) ?? 0) ? t : best), null)
  let time = ''
  if (first && minutesOf(first.start) !== null && latest !== null) {
    const zone = timezoneShortName(event.date, event.timezone, ctx.locale)
    // Only the clock range uses the mono face; the zone name may be in any script.
    time = `<span class="time"><span class="rng">${escapeHtml(fmt(ctx, first.start))} – ${escapeHtml(fmt(ctx, latest))}</span>${zone ? ` ${escapeHtml(zone)}` : ''}</span>`
  }
  const venue = event.venue ? `<span>${escapeHtml(event.venue)}</span>` : ''
  const status = event.status ? `<span>${escapeHtml(event.status)}</span>` : ''
  const meta = time || venue || status ? `<div class="meta">${time}${venue}${status}</div>` : ''

  return `<header class="head">
    ${logo}
    <div class="eyebrow">${escapeHtml(formatEventDate(event.date, ctx.locale))}</div>
    <h1>${renderTitle(event.title, event.titleHighlight)}</h1>
    ${meta}
  </header>`
}

function renderLegend(schedule: Schedule, labels: ResolvedLabels, placed: Placed[]): string {
  const chips = schedule.columns
    .filter((c) => c.type === 'track')
    .map(
      (c) =>
        `<span class="chip" style="--c:${cssColor(c.color, FALLBACK_COLOR)}">${escapeHtml(legendLabel(c.name, labels.trackSuffix))}</span>`,
    )
  if (placed.some((p) => p.spansAll)) chips.push(`<span class="chip all">${escapeHtml(labels.everyone)}</span>`)
  return `<div class="legend">${chips.join('')}</div>`
}

function renderAgendaGrid(schedule: Schedule, ctx: Context, placed: Placed[]): string {
  const { labels } = ctx
  const { rows, columns } = schedule
  const lanes = columns.length

  // Lane headers go right before the first row holding an item that does not span every column.
  const laneRow = placed.filter((p) => !p.spansAll).reduce((min, p) => Math.min(min, p.row), Infinity)

  // Explicit grid rows: [lane head] time row [note] ... so every cell can be placed by number.
  const rowLine: number[] = []
  const noteLine = new Map<number, number>()
  let laneLine = 0
  let line = 1
  rows.forEach((row, i) => {
    if (i === laneRow) laneLine = line++
    rowLine[i] = line++
    if (row.note?.trim()) noteLine.set(i, line++)
  })

  const occupied = new Set<string>()
  for (const p of placed) {
    for (let r = p.row; r <= p.lastRow; r++) {
      for (let c = p.firstCol; c <= p.lastCol; c++) occupied.add(`${r}:${c}`)
    }
  }

  const byRow = new Map<number, Placed[]>()
  for (const p of placed) byRow.set(p.row, [...(byRow.get(p.row) ?? []), p])

  const out: string[] = []
  rows.forEach((row, i) => {
    const line = rowLine[i] as number
    if (i === laneRow) {
      const heads = columns
        .map(
          (c, j) =>
            `<div style="grid-column:${j + 2};--c:${cssColor(c.color, FALLBACK_COLOR)}">${escapeHtml(c.name)}</div>`,
        )
        .join('')
      out.push(`<div class="lane-head" aria-hidden="true" style="grid-row:${laneLine};grid-column:1 / -1">${heads}</div>`)
    }
    out.push(
      `<div class="t" style="grid-row:${line};grid-column:1"><b>${escapeHtml(fmt(ctx, row.start))}</b>${escapeHtml(fmt(ctx, row.end))}</div>`,
    )

    for (const p of byRow.get(i) ?? []) {
      const span = (rowLine[p.lastRow] as number) - line + 1
      out.push(renderItem(schedule, ctx, p, span > 1 ? `${line} / span ${span}` : `${line}`))

      // The item runs past its last row: mark the following rows it still occupies.
      const endMinutes = minutesOf(p.end)
      const lastRowEnd = minutesOf(rows[p.lastRow]?.end)
      if (endMinutes === null || lastRowEnd === null || endMinutes <= lastRowEnd) continue
      const continuation =
        p.item.continuationLabel?.trim() || fillSessionFallback(labels.sessionFallback, columns[p.firstCol]?.name ?? '')
      const color = cssColor(columns[p.firstCol]?.color ?? '', FALLBACK_COLOR)
      for (let r = p.lastRow + 1; r < rows.length; r++) {
        const rowStart = minutesOf(rows[r]?.start)
        if (rowStart === null || rowStart >= endMinutes) continue
        let free = true
        for (let c = p.firstCol; c <= p.lastCol; c++) if (occupied.has(`${r}:${c}`)) free = false
        if (!free) continue
        out.push(
          `<div class="ev ghost" style="grid-row:${rowLine[r]};grid-column:${p.firstCol + 2} / ${p.lastCol + 3};--c:${color}${stagger(ctx)}"><span>${escapeHtml(continuation)} ${escapeHtml(labels.continuesUntil)} ${escapeHtml(fmt(ctx, p.end))}</span></div>`,
        )
      }
    }

    const noteAt = noteLine.get(i)
    if (noteAt !== undefined && row.note) {
      out.push(`<p class="small" style="grid-row:${noteAt};grid-column:2 / ${lanes + 2}">${renderInlineMarkup(row.note)}</p>`)
    }
  })

  return `<div class="agenda" id="agenda">${out.join('\n')}</div>`
}

function renderSpeaker(speaker: Speaker): string {
  const photo = safeDataImage(speaker.photo)
  const background = speaker.color ? cssColor(speaker.color, 'var(--primary)') : 'var(--primary)'
  const avatar = photo ? `<img src="${escapeHtml(photo)}" alt="">` : escapeHtml(initials(speaker.name))
  return `<div class="person"><div class="av" style="background:${background}">${avatar}</div><div><b>${escapeHtml(speaker.name)}</b><span>${escapeHtml(speaker.role)}</span></div></div>`
}

/* ---------- public API ---------- */

function makeContext(schedule: Schedule): Context {
  const locale = resolveLocale(schedule.event.locale)
  return {
    labels: resolveLabels(schedule.labels, locale),
    locale,
    timeFormat: schedule.event.timeFormat ?? '24h',
    stagger: schedule.branding.motion.preset === 'stagger',
    cards: { next: 0 },
  }
}

/** The `<main class="wrap">…</main>` markup for a schedule. */
export function renderAgendaBody(schedule: Schedule): string {
  const ctx = makeContext(schedule)
  const { labels } = ctx
  const placed = placeItems(schedule)
  const note = schedule.event.notes.trim()
  const url = safeHttpUrl(schedule.event.url)

  const parts = [renderHeader(schedule, ctx, placed)]
  if (note) parts.push(`<div class="parallel-note"><div>${renderInlineMarkup(schedule.event.notes)}</div></div>`)
  parts.push(`<section aria-labelledby="ag" class="sec">
    <h2 id="ag">${escapeHtml(labels.agenda)}</h2>
    ${renderLegend(schedule, labels, placed)}
    ${renderAgendaGrid(schedule, ctx, placed)}
  </section>`)
  if (schedule.speakers.length > 0) {
    parts.push(`<section aria-labelledby="sp" class="sec">
    <h2 id="sp">${escapeHtml(labels.speakers)}</h2>
    <div class="people">${schedule.speakers.map(renderSpeaker).join('\n')}</div>
  </section>`)
  }
  if (url) {
    parts.push(`<a class="btn" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(labels.eventLink)}</a>`)
    // Printed pages show the address as plain text instead of the button (see the print CSS).
    parts.push(`<p class="print-link">${escapeHtml(labels.eventLink)}: ${escapeHtml(url)}</p>`)
  }
  return `<main class="wrap">\n${parts.join('\n')}\n</main>`
}

export interface RenderOptions {
  /** Override the schedule's theme, e.g. for the editor's light/dark preview toggle. */
  forceTheme?: 'light' | 'dark'
  /** Inline @font-face CSS (offline fonts). Replaces the Google Fonts `<link>`. */
  fontCss?: string
  /** Raw HTML placed first in `<head>`, after the viewport meta (e.g. a CSP meta). */
  headPrefix?: string
  /** Raw HTML placed just before `</body>` (e.g. scripts). */
  bodyEnd?: string
}

/** A complete, self-contained HTML document (no scripts). */
export function renderDocument(schedule: Schedule, options: RenderOptions = {}): string {
  const locale = resolveLocale(schedule.event.locale)
  const theme = options.forceTheme ?? schedule.branding.theme
  const themeAttr = theme === 'light' || theme === 'dark' ? ` data-theme="${theme}"` : ''
  const fontsUrl = googleFontsUrl(schedule.branding.fonts.webFonts)
  const embedded = options.fontCss?.replace(/</g, '').trim()
  const fontsLink = embedded
    ? `<style id="embedded-fonts">\n${embedded}\n</style>\n`
    : fontsUrl
      ? `<link rel="stylesheet" href="${escapeHtml(fontsUrl)}">\n`
      : ''
  const prefix = options.headPrefix ? `${options.headPrefix}\n` : ''
  return `<!doctype html>
<html lang="${escapeHtml(locale)}" dir="${resolveDirection(schedule.event)}"${themeAttr}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
${prefix}<title>${escapeHtml(schedule.event.title)}</title>
${fontsLink}<style>
${agendaCss(schedule)}
</style>
</head>
<body>
${renderAgendaBody(schedule)}
${options.bodyEnd ? `${options.bodyEnd}\n` : ''}</body>
</html>
`
}
