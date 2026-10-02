/**
 * Pure HTML renderer for a track-grid schedule. No React, no DOM: it returns strings so the
 * same code drives the live preview iframe and (later) the "Save as HTML" export.
 */
import type { Item, Schedule, Speaker } from '../model/schema.ts'
import { TIME_PATTERN, toMinutes } from '../model/time.ts'
import { agendaCss } from './agendaCss.ts'
import { resolveLabels, type ResolvedLabels } from './labels.ts'
import { cssColor, escapeHtml, renderInlineMarkup, safeDataImage, safeHttpUrl } from './escape.ts'

const FALLBACK_COLOR = '#888888'
const MONTHS_AND_DAYS = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' } as const

/* ---------- small helpers ---------- */

function minutesOf(time: string | undefined): number | null {
  return time !== undefined && TIME_PATTERN.test(time) ? toMinutes(time) : null
}

/** Attribute pair like ` data-s="810"`, or '' when the time is not usable. */
function dataAttr(name: string, time: string): string {
  const minutes = minutesOf(time)
  return minutes === null ? '' : ` data-${name}="${minutes}"`
}

/** "Friday, 2 October 2026" (en-GB), independent of the ICU version's punctuation. */
export function formatEventDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return date
  try {
    const parts = new Intl.DateTimeFormat('en-GB', MONTHS_AND_DAYS).formatToParts(parsed)
    const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
    return `${pick('weekday')}, ${pick('day')} ${pick('month')} ${pick('year')}`
  } catch {
    return date
  }
}

/** Short zone name such as "EEST" for the event's date, or '' when it cannot be determined. */
export function timezoneShortName(date: string, timezone: string): string {
  try {
    const noon = new Date(`${date}T12:00:00Z`)
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, timeZoneName: 'short' }).formatToParts(noon)
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? ''
  } catch {
    return ''
  }
}

/** Initials from the first two words, skipping prefixes like "Dr."; a single word gives one letter. */
export function initials(name: string): string {
  const words = name
    .split(/\s+/)
    .filter((w) => w !== '' && !w.endsWith('.'))
  if (words.length === 0) return Array.from(name.trim())[0]?.toUpperCase() ?? ''
  return words
    .slice(0, 2)
    .map((w) => Array.from(w)[0] ?? '')
    .join('')
    .toUpperCase()
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

function renderItem(schedule: Schedule, labels: ResolvedLabels, p: Placed, gridRow: string): string {
  const { item } = p
  const column = schedule.columns[p.firstCol]
  const color = cssColor(column?.color ?? '', FALLBACK_COLOR)
  const placement = `grid-row:${gridRow};grid-column:${p.firstCol + 2} / ${p.lastCol + 3}`
  const times = dataAttr('s', p.start) + dataAttr('e', p.end)
  const title = `<h3>${escapeHtml(item.title)}</h3>`
  const speaker = item.speaker
    ? `<div class="spk"><span class="lbl">${escapeHtml(labels.speakerPrefix)}</span> ${escapeHtml(item.speaker)}</div>`
    : ''

  if (item.variant === 'highlight') {
    return `<div class="ev key" style="${placement}"${times}>${title}${speaker}</div>`
  }
  if (item.variant === 'break') {
    return `<div class="ev shared" style="${placement}"${times}>${title}${speaker}</div>`
  }

  const spanned = schedule.columns.slice(p.firstCol, p.lastCol + 1)
  const chipLabel = p.spansAll && spanned.length > 1 ? '' : spanned.map((c) => c.name).join(' + ')
  const chip = chipLabel ? `<span class="chip" style="--c:${color}">${escapeHtml(chipLabel)}</span>` : ''
  const when = `<div class="when">${escapeHtml(p.start)} – ${escapeHtml(p.end)}</div>`
  return `<div class="ev track" style="${placement};--c:${color}"${times}>${chip}${title}${speaker}${when}</div>`
}

/* ---------- sections ---------- */

function renderHeader(schedule: Schedule, placed: Placed[]): string {
  const { event, branding } = schedule
  const logoSrc = safeDataImage(branding.logo)
  const logo = logoSrc ? `<img class="logo" src="${escapeHtml(logoSrc)}" alt="">` : ''

  const first = schedule.rows[0]
  const latest = [...schedule.rows.map((r) => r.end), ...placed.map((p) => p.item.end ?? '')]
    .filter((t) => minutesOf(t) !== null)
    .reduce<string | null>((best, t) => (best === null || (minutesOf(t) ?? 0) > (minutesOf(best) ?? 0) ? t : best), null)
  let time = ''
  if (first && minutesOf(first.start) !== null && latest !== null) {
    const zone = timezoneShortName(event.date, event.timezone)
    time = `<span class="time">${escapeHtml(first.start)} – ${escapeHtml(latest)}${zone ? ` ${escapeHtml(zone)}` : ''}</span>`
  }
  const venue = event.venue ? `<span>${escapeHtml(event.venue)}</span>` : ''
  const status = event.status ? `<span>${escapeHtml(event.status)}</span>` : ''
  const meta = time || venue || status ? `<div class="meta">${time}${venue}${status}</div>` : ''

  return `<header class="head">
    ${logo}
    <div class="eyebrow">${escapeHtml(formatEventDate(event.date))}</div>
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

function renderAgendaGrid(schedule: Schedule, labels: ResolvedLabels, placed: Placed[]): string {
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
      `<div class="t" style="grid-row:${line};grid-column:1"><b>${escapeHtml(row.start)}</b>${escapeHtml(row.end)}</div>`,
    )

    for (const p of byRow.get(i) ?? []) {
      const span = (rowLine[p.lastRow] as number) - line + 1
      out.push(renderItem(schedule, labels, p, span > 1 ? `${line} / span ${span}` : `${line}`))

      // The item runs past its last row: mark the following rows it still occupies.
      const endMinutes = minutesOf(p.end)
      const lastRowEnd = minutesOf(rows[p.lastRow]?.end)
      if (endMinutes === null || lastRowEnd === null || endMinutes <= lastRowEnd) continue
      const continuation = p.item.continuationLabel?.trim() || `${columns[p.firstCol]?.name ?? ''} session`
      const color = cssColor(columns[p.firstCol]?.color ?? '', FALLBACK_COLOR)
      for (let r = p.lastRow + 1; r < rows.length; r++) {
        const rowStart = minutesOf(rows[r]?.start)
        if (rowStart === null || rowStart >= endMinutes) continue
        let free = true
        for (let c = p.firstCol; c <= p.lastCol; c++) if (occupied.has(`${r}:${c}`)) free = false
        if (!free) continue
        out.push(
          `<div class="ev ghost" style="grid-row:${rowLine[r]};grid-column:${p.firstCol + 2} / ${p.lastCol + 3};--c:${color}"><span>${escapeHtml(continuation)} ${escapeHtml(labels.continuesUntil)} ${escapeHtml(p.end)}</span></div>`,
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

/** The `<main class="wrap">…</main>` markup for a schedule. */
export function renderAgendaBody(schedule: Schedule): string {
  const labels = resolveLabels(schedule.labels)
  const placed = placeItems(schedule)
  const note = schedule.event.notes.trim()
  const url = safeHttpUrl(schedule.event.url)

  const parts = [renderHeader(schedule, placed)]
  if (note) parts.push(`<div class="parallel-note"><div>${renderInlineMarkup(schedule.event.notes)}</div></div>`)
  parts.push(`<section aria-labelledby="ag" class="sec">
    <h2 id="ag">${escapeHtml(labels.agenda)}</h2>
    ${renderLegend(schedule, labels, placed)}
    ${renderAgendaGrid(schedule, labels, placed)}
  </section>`)
  if (schedule.speakers.length > 0) {
    parts.push(`<section aria-labelledby="sp" class="sec">
    <h2 id="sp">${escapeHtml(labels.speakers)}</h2>
    <div class="people">${schedule.speakers.map(renderSpeaker).join('\n')}</div>
  </section>`)
  }
  if (url) {
    parts.push(`<a class="btn" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(labels.eventLink)}</a>`)
  }
  return `<main class="wrap">\n${parts.join('\n')}\n</main>`
}

/** A complete, self-contained HTML document (no scripts). */
export function renderDocument(schedule: Schedule): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${escapeHtml(schedule.event.title)}</title>
<style>
${agendaCss(schedule)}
</style>
</head>
<body>
${renderAgendaBody(schedule)}
</body>
</html>
`
}
