/**
 * Pure HTML renderer for a track-grid schedule. No React, no DOM: it returns strings so the
 * same code drives the live preview iframe and (later) the "Save as HTML" export.
 */
import type { Column, Item, Schedule, Speaker } from '../model/schema.ts'
import { deriveSlots, type Slot } from '../model/slots.ts'
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
  /** Index of the slot the item starts in. */
  row: number
  firstCol: number
  lastCol: number
  start: string
  end: string
  spansAll: boolean
}

/** The grid's slots with the items placed in them. */
interface Layout {
  slots: Slot[]
  placed: Placed[]
}

/** Derive the slots from the items and place every item in the slot of its start. */
function placeItems(schedule: Schedule): Layout {
  const colIndex = new Map<string, number>()
  schedule.columns.forEach((col, i) => {
    if (!colIndex.has(col.id)) colIndex.set(col.id, i)
  })
  const lanes = schedule.columns.length

  const usable = schedule.items.filter(
    (item) => item.columnIds.some((id) => colIndex.has(id)) && minutesOf(item.start) !== null && minutesOf(item.end) !== null,
  )
  const slots = deriveSlots(usable)
  const slotIndex = new Map(slots.map((slot, i) => [slot.start, i]))

  const placed: Placed[] = []
  for (const item of usable) {
    const cols = item.columnIds.map((id) => colIndex.get(id)).filter((i): i is number => i !== undefined)
    const firstCol = Math.min(...cols)
    const lastCol = Math.max(...cols)
    placed.push({
      item,
      row: slotIndex.get(item.start) as number,
      firstCol,
      lastCol,
      start: item.start,
      end: item.end,
      spansAll: firstCol === 0 && lastCol === lanes - 1,
    })
  }
  return { slots, placed }
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

/** The clock range shown under the title: first start to last end. */
interface Span {
  first: string | undefined
  latest: string | null
}

function latestOf(times: string[]): string | null {
  return times
    .filter((t) => minutesOf(t) !== null)
    .reduce<string | null>((best, t) => (best === null || (minutesOf(t) ?? 0) > (minutesOf(best) ?? 0) ? t : best), null)
}

/** Grid mode: from the first slot to the latest item end. */
function gridSpan(layout: Layout): Span {
  return { first: layout.slots[0]?.start, latest: latestOf(layout.placed.map((p) => p.end)) }
}

/** Table mode: from the first row to the latest row end. */
function tableSpan(schedule: Schedule): Span {
  return { first: schedule.rows[0]?.start, latest: latestOf(schedule.rows.map((r) => r.end)) }
}

function renderHeader(schedule: Schedule, ctx: Context, span: Span): string {
  const { event, branding } = schedule
  const logoSrc = safeDataImage(branding.logo)
  const logo = logoSrc ? `<img class="logo" src="${escapeHtml(logoSrc)}" alt="">` : ''

  const { first, latest } = span
  let time = ''
  if (first !== undefined && minutesOf(first) !== null && latest !== null) {
    const zone = timezoneShortName(event.date, event.timezone, ctx.locale)
    // Only the clock range uses the mono face; the zone name may be in any script.
    time = `<span class="time"><span class="rng">${escapeHtml(fmt(ctx, first))} – ${escapeHtml(fmt(ctx, latest))}</span>${zone ? ` ${escapeHtml(zone)}` : ''}</span>`
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

function renderAgendaGrid(schedule: Schedule, ctx: Context, layout: Layout): string {
  const { labels } = ctx
  const { columns } = schedule
  const { slots, placed } = layout
  const lanes = columns.length

  // Lane headers go right before the first slot holding an item that does not span every column.
  const laneRow = placed.filter((p) => !p.spansAll).reduce((min, p) => Math.min(min, p.row), Infinity)

  const byRow = new Map<number, Placed[]>()
  for (const p of placed) byRow.set(p.row, [...(byRow.get(p.row) ?? []), p])

  // Notes belong to items and follow their slot, in column order.
  const notesOf = (i: number): string[] =>
    [...(byRow.get(i) ?? [])]
      .sort((a, b) => a.firstCol - b.firstCol)
      .map((p) => p.item.note ?? '')
      .filter((note) => note.trim() !== '')

  // Explicit grid rows: [lane head] time row [notes] ... so every cell can be placed by number.
  const rowLine: number[] = []
  const noteLines = new Map<number, number[]>()
  let laneLine = 0
  let line = 1
  slots.forEach((_slot, i) => {
    if (i === laneRow) laneLine = line++
    rowLine[i] = line++
    const lines = notesOf(i).map(() => line++)
    if (lines.length > 0) noteLines.set(i, lines)
  })

  // A cell is taken only by an item that starts in that slot; ghosts fill the free ones after it.
  const occupied = new Set<string>()
  for (const p of placed) {
    for (let c = p.firstCol; c <= p.lastCol; c++) occupied.add(`${p.row}:${c}`)
  }

  const out: string[] = []
  slots.forEach((slot, i) => {
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
      `<div class="t" style="grid-row:${line};grid-column:1"><b>${escapeHtml(fmt(ctx, slot.start))}</b>${escapeHtml(fmt(ctx, slot.end))}</div>`,
    )

    for (const p of byRow.get(i) ?? []) {
      out.push(renderItem(schedule, ctx, p, `${line}`))

      // The item runs past the end of its slot: mark the following slots it still occupies.
      const endMinutes = minutesOf(p.end)
      const slotEnd = minutesOf(slot.end)
      if (endMinutes === null || slotEnd === null || endMinutes <= slotEnd) continue
      const continuation =
        p.item.continuationLabel?.trim() || fillSessionFallback(labels.sessionFallback, columns[p.firstCol]?.name ?? '')
      const color = cssColor(columns[p.firstCol]?.color ?? '', FALLBACK_COLOR)
      for (let r = i + 1; r < slots.length; r++) {
        const rowStart = minutesOf(slots[r]?.start)
        if (rowStart === null || rowStart >= endMinutes) continue
        let free = true
        for (let c = p.firstCol; c <= p.lastCol; c++) if (occupied.has(`${r}:${c}`)) free = false
        if (!free) continue
        out.push(
          `<div class="ev ghost" style="grid-row:${rowLine[r]};grid-column:${p.firstCol + 2} / ${p.lastCol + 3};--c:${color}${stagger(ctx)}"><span>${escapeHtml(continuation)} ${escapeHtml(labels.continuesUntil)} ${escapeHtml(fmt(ctx, p.end))}</span></div>`,
        )
      }
    }

    const noteAt = noteLines.get(i) ?? []
    notesOf(i).forEach((note, k) => {
      out.push(`<p class="small" style="grid-row:${noteAt[k]};grid-column:2 / ${lanes + 2}">${renderInlineMarkup(note)}</p>`)
    })
  })

  return `<div class="agenda" id="agenda">${out.join('\n')}</div>`
}

function avatarHtml(speaker: Speaker, tag: 'div' | 'span'): string {
  const photo = safeDataImage(speaker.photo)
  const background = speaker.color ? cssColor(speaker.color, 'var(--primary)') : 'var(--primary)'
  const inner = photo ? `<img src="${escapeHtml(photo)}" alt="">` : escapeHtml(initials(speaker.name))
  return `<${tag} class="av" style="background:${background}">${inner}</${tag}>`
}

function renderSpeaker(speaker: Speaker): string {
  return `<div class="person">${avatarHtml(speaker, 'div')}<div><b>${escapeHtml(speaker.name)}</b><span>${escapeHtml(speaker.role)}</span></div></div>`
}

/* ---------- table mode ---------- */

/** The speaker whose name matches (case-insensitive, trimmed), if any. */
function findSpeaker(schedule: Schedule, name: string): Speaker | undefined {
  const key = name.trim().toLowerCase()
  return key === '' ? undefined : schedule.speakers.find((s) => s.name.trim().toLowerCase() === key)
}

function renderCellContent(schedule: Schedule, ctx: Context, column: Column, value: string): string {
  switch (column.type) {
    case 'time':
      return escapeHtml(TIME_PATTERN.test(value) ? fmt(ctx, value) : value)
    case 'person': {
      const speaker = findSpeaker(schedule, value)
      if (!speaker) return escapeHtml(value)
      return `<span class="who">${avatarHtml(speaker, 'span')}<span>${escapeHtml(speaker.name)}</span></span>`
    }
    case 'tag': {
      const color = cssColor(column.color, FALLBACK_COLOR)
      const tags = value
        .split(/[,\u060c]/) // Latin or Arabic comma
        .map((t) => t.trim())
        .filter((t) => t !== '')
      return tags.length === 0
        ? ''
        : `<span class="tags">${tags.map((t) => `<span class="chip" style="--c:${color}">${escapeHtml(t)}</span>`).join('')}</span>`
    }
    default:
      return escapeHtml(value)
  }
}

/** A single flat table: time column first, then the table columns, one body per row. */
function renderTable(schedule: Schedule, ctx: Context): string {
  const columns = schedule.columns.filter((c) => c.type !== 'track')
  const head = [
    `<th scope="col">${escapeHtml(ctx.labels.time)}</th>`,
    ...columns.map((c) => `<th scope="col">${escapeHtml(c.name)}</th>`),
  ].join('')

  const bodies = schedule.rows.map((row) => {
    const rowStyle = ctx.stagger ? ` style="--i:${Math.min(ctx.cards.next++, 20)}"` : ''
    const cells = columns
      .map((c) => {
        const content = renderCellContent(schedule, ctx, c, row.cells?.[c.id] ?? '')
        const classes = [content === '' ? 'e' : '', c.type === 'time' ? 'n' : ''].filter(Boolean).join(' ')
        return `<td data-label="${escapeHtml(c.name)}"${classes ? ` class="${classes}"` : ''}>${content}</td>`
      })
      .join('')
    const time =
      `<td class="c-time" data-label="${escapeHtml(ctx.labels.time)}"><span class="badge">${escapeHtml(ctx.labels.now)}</span>` +
      `<b>${escapeHtml(fmt(ctx, row.start))}</b>${escapeHtml(fmt(ctx, row.end))}</td>`
    const note = row.note?.trim()
      ? `<tr class="note"${rowStyle}><td colspan="${columns.length + 1}">${renderInlineMarkup(row.note)}</td></tr>`
      : ''
    return `<tbody><tr${dataAttr('s', row.start)}${dataAttr('e', row.end)}${rowStyle}>${time}${cells}</tr>${note}</tbody>`
  })

  return `<div class="tbl"><table class="sched"><thead><tr>${head}</tr></thead>\n${bodies.join('\n')}\n</table></div>`
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
  const table = schedule.mode === 'table'
  // Track-grid mode only uses the track columns; table columns share the array but are not lanes.
  const gridView: Schedule = table ? schedule : { ...schedule, columns: schedule.columns.filter((c) => c.type === 'track') }
  const layout: Layout = table ? { slots: [], placed: [] } : placeItems(gridView)
  const placed = layout.placed
  const note = schedule.event.notes.trim()
  const url = safeHttpUrl(schedule.event.url)

  const parts = [renderHeader(schedule, ctx, table ? tableSpan(schedule) : gridSpan(layout))]
  if (note) parts.push(`<div class="parallel-note"><div>${renderInlineMarkup(schedule.event.notes)}</div></div>`)
  parts.push(
    table
      ? `<section aria-labelledby="ag" class="sec">
    <h2 id="ag">${escapeHtml(labels.agenda)}</h2>
    ${renderTable(schedule, ctx)}
  </section>`
      : `<section aria-labelledby="ag" class="sec">
    <h2 id="ag">${escapeHtml(labels.agenda)}</h2>
    ${renderLegend(gridView, labels, placed)}
    ${renderAgendaGrid(gridView, ctx, layout)}
  </section>`,
  )
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
