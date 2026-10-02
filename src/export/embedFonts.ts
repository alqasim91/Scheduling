/** Fetch the page's Google Fonts and turn them into inline @font-face rules with data: URIs. */
import type { Schedule } from '../model/schema.ts'
import { WEB_FONT_PATTERN, googleFontsUrl } from '../render/fonts.ts'
import { renderAgendaBody } from '../render/renderAgenda.ts'

export const MAX_FONT_BYTES = 3 * 1024 * 1024

export type EmbedResult = { css: string } | { error: string }

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }
const BASIC_CHARACTERS = '0123456789 \u00a0.,:;!?-–—()[]/+&\'"%'

/** Every distinct character the rendered page can show, plus digits, punctuation and space. */
export function pageCharacters(schedule: Schedule): string {
  const body = renderAgendaBody(schedule)
  const text = [...body.matchAll(/>([^<]+)</g)]
    .map((m) => (m[1] as string).replace(/&(?:amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e] ?? e))
    .join('')
  return [...new Set(Array.from(text + BASIC_CHARACTERS))].join('')
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

const FORMAT_TYPES: Record<string, string> = {
  woff2: 'font/woff2',
  woff: 'font/woff',
  truetype: 'font/ttf',
  opentype: 'font/otf',
}

/** Media type for a font file: from the `format()` hint next to its url, else the file extension. */
function fontMime(css: string, url: string): string {
  const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const format = new RegExp(`url\\(${escaped}\\)\\s*format\\(['"]?([a-z0-9]+)['"]?\\)`, 'i').exec(css)?.[1]?.toLowerCase()
  if (format && FORMAT_TYPES[format]) return FORMAT_TYPES[format] as string
  const ext = /\.(woff2|woff|ttf|otf)(?:$|\?)/i.exec(url)?.[1]?.toLowerCase()
  return ext ? (FORMAT_TYPES[ext === 'ttf' ? 'truetype' : ext === 'otf' ? 'opentype' : ext] as string) : 'font/woff2'
}

/**
 * For each `fonts.webFonts` family, request a Google Fonts stylesheet limited (`&text=`) to the
 * characters the page uses, download every font file it points to, and return CSS with the files
 * inlined as data: URIs. Fails (never throws) when offline, blocked by CORS, malformed, or over 3 MB.
 */
export async function embedFonts(schedule: Schedule, fetchImpl: typeof fetch = fetch): Promise<EmbedResult> {
  const families = [...new Set((schedule.branding.fonts.webFonts ?? []).filter((f) => WEB_FONT_PATTERN.test(f)))]
  if (families.length === 0) return { css: '' }
  const text = pageCharacters(schedule)
  let total = 0
  const blocks: string[] = []

  try {
    for (const family of families) {
      const cssUrl = googleFontsUrl([family], { text }) as string
      const cssResponse = await fetchImpl(cssUrl)
      if (!cssResponse.ok) return { error: `Google Fonts returned ${cssResponse.status} for "${family}"` }
      let css = await cssResponse.text()
      if (css.includes('<')) return { error: `Unexpected stylesheet for "${family}"` }

      const urls = [...new Set([...css.matchAll(/url\(\s*['"]?(https:\/\/fonts\.gstatic\.com\/[^)'"\s]+)['"]?\s*\)/g)].map((m) => m[1] as string))]
      if (urls.length === 0) return { error: `No font files found for "${family}"` }
      for (const url of urls) {
        const fileResponse = await fetchImpl(url)
        if (!fileResponse.ok) return { error: `Could not download a font file for "${family}" (${fileResponse.status})` }
        const bytes = new Uint8Array(await fileResponse.arrayBuffer())
        total += bytes.length
        if (total > MAX_FONT_BYTES) {
          return { error: `Fonts are larger than ${MAX_FONT_BYTES / 1024 / 1024} MB` }
        }
        const dataUri = `data:${fontMime(css, url)};base64,${bytesToBase64(bytes)}`
        css = css.split(`url(${url})`).join(`url(${dataUri})`).split(`url('${url}')`).join(`url(${dataUri})`).split(`url("${url}")`).join(`url(${dataUri})`)
      }
      blocks.push(css.trim())
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not reach Google Fonts' }
  }
  return { css: blocks.join('\n') }
}
