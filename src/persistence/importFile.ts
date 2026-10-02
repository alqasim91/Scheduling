import { SCHEDULE_DATA_ID } from '../export/exportHtml.ts'
import { parseScheduleJson, type ParseResult } from './json.ts'

export const NOT_EXPORTED_ERROR = 'This HTML file was not exported by this app (no schedule data found).'

function looksLikeHtml(text: string): boolean {
  return /^\s*(<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>]|<!--)/i.test(text)
}

/**
 * Read a schedule from the text of a saved file. JSON versus exported HTML is decided by the
 * content, not the file name. HTML is only parsed (never executed): the schedule is the
 * `<script type="application/json" id="schedule-data">` element's text.
 */
export function importFileText(text: string): ParseResult {
  if (!looksLikeHtml(text)) return parseScheduleJson(text)
  const doc = new DOMParser().parseFromString(text, 'text/html')
  const data = doc.getElementById(SCHEDULE_DATA_ID)
  if (!data?.textContent?.trim()) return { ok: false, errors: [NOT_EXPORTED_ERROR] }
  return parseScheduleJson(data.textContent)
}
