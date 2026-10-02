/** One self-contained HTML file: the rendered page, the schedule data, a CSP and the "Now" script. */
import type { Schedule } from '../model/schema.ts'
import { renderDocument } from '../render/renderAgenda.ts'
import { NOW_SCRIPT } from './nowScript.ts'

export const CSP =
  "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src data: https://fonts.gstatic.com; img-src data:; script-src 'unsafe-inline'"

export const SCHEDULE_DATA_ID = 'schedule-data'

/**
 * JSON that is safe inside a `<script>` element: `<`, `>` and `&` can never form a tag or
 * comment, and U+2028/U+2029 (line terminators in old JS parsers) are escaped too.
 * `JSON.parse` reads it back exactly.
 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

export interface ExportOptions {
  /** Inline @font-face rules from `embedFonts`; replaces the Google Fonts link. */
  fontCss?: string
}

export function buildExportHtml(schedule: Schedule, options: ExportOptions = {}): string {
  return renderDocument(schedule, {
    fontCss: options.fontCss,
    headPrefix: `<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
    bodyEnd:
      `<script type="application/json" id="${SCHEDULE_DATA_ID}">${jsonForScript(schedule)}</script>\n` +
      `<script>${NOW_SCRIPT}</script>`,
  })
}
