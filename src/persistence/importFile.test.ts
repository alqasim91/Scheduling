import { describe, expect, it } from 'vitest'
import { buildExportHtml } from '../export/exportHtml.ts'
import { createEmptySchedule } from '../model/defaults.ts'
import { rtlDemo } from '../render/__fixtures__/rtlDemo.ts'
import { tableDemo } from '../render/__fixtures__/tableDemo.ts'
import { tableDemoRtl } from '../render/__fixtures__/tableDemoRtl.ts'
import { renderDocument } from '../render/renderAgenda.ts'
import { cairoSample } from '../samples/cairo.ts'
import cairoV1Export from '../model/__fixtures__/cairoV1Export.html?raw'
import { NOT_EXPORTED_ERROR, importFileText } from './importFile.ts'
import { serializeSchedule } from './json.ts'

describe('importFileText', () => {
  it('round-trips an exported page back to the identical schedule', () => {
    for (const schedule of [cairoSample, rtlDemo, tableDemo, tableDemoRtl, createEmptySchedule()]) {
      const result = importFileText(buildExportHtml(schedule))
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value).toEqual(schedule)
    }
  })

  it('round-trips table mode with cells, hidden grid data and a hostile cell', () => {
    const mixed = {
      ...tableDemo,
      columns: [...tableDemo.columns, { id: 'lane', name: 'Lane', color: '#0b57d0', type: 'track' as const }],
      items: [{ id: 'it', columnIds: ['lane'], start: '09:00', end: '09:30', title: 'Kept for grid mode', variant: 'session' as const }],
      rows: tableDemo.rows.map((r, i) => (i === 0 ? { ...r, cells: { ...r.cells, 'c-room': '</script><script>alert(1)</script>\u2028' } } : r)),
    }
    const result = importFileText(buildExportHtml(mixed))
    expect(result.ok && result.value).toEqual(mixed)
  })

  it('round-trips a page with embedded fonts and hostile text', () => {
    const hostile = { ...cairoSample, event: { ...cairoSample.event, title: '</script><script>alert(1)</script> \u2028' } }
    const html = buildExportHtml(hostile, { fontCss: "@font-face{font-family:'X';src:url(data:font/woff2;base64,AA==)}" })
    const result = importFileText(html)
    expect(result.ok && result.value).toEqual(hostile)
  })

  it('opens a page exported before the time-based model (version 1) and reports what it had to adjust', () => {
    const result = importFileText(cairoV1Export)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.version).toBe(2)
    expect(result.value.items.map((i) => i.id)).toEqual(cairoSample.items.map((i) => i.id))
    expect(result.value.items.find((i) => i.id === 'item-b1')).toMatchObject({ start: '14:20', end: '15:05' })
    expect(result.warnings).toEqual([expect.stringContaining('"Opening & Keynote" was shortened to end at 14:20')])
  })

  it('still reads plain JSON', () => {
    const result = importFileText(serializeSchedule(cairoSample))
    expect(result.ok && result.value).toEqual(cairoSample)
    expect(importFileText(' \n' + serializeSchedule(cairoSample)).ok).toBe(true)
  })

  it('picks the format by content, not by name or luck', () => {
    expect(importFileText('{ definitely not json')).toEqual({ ok: false, errors: [expect.stringMatching(/^Not valid JSON/)] })
    expect(importFileText('nope')).toEqual({ ok: false, errors: [expect.stringMatching(/^Not valid JSON/)] })
    const noBom = importFileText('\n\n<!DOCTYPE HTML><html><body></body></html>')
    expect(noBom).toEqual({ ok: false, errors: [NOT_EXPORTED_ERROR] })
  })

  it('explains an HTML file that this app did not export', () => {
    expect(importFileText('<!doctype html><html><body><h1>Hi</h1></body></html>')).toEqual({
      ok: false,
      errors: ['This HTML file was not exported by this app (no schedule data found).'],
    })
    // A page rendered by the app but without the data block (e.g. the preview srcdoc).
    expect(importFileText(renderDocument(cairoSample))).toEqual({ ok: false, errors: [NOT_EXPORTED_ERROR] })
    expect(importFileText('<!doctype html><script type="application/json" id="schedule-data">  </script>')).toEqual({
      ok: false,
      errors: [NOT_EXPORTED_ERROR],
    })
  })

  it('reports schema errors from the embedded data with paths', () => {
    const bad = buildExportHtml(cairoSample).replace('"mode":"track-grid"', '"mode":"nope"')
    const result = importFileText(bad)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join()).toMatch(/mode:/)
  })

  it('never executes anything from the file', () => {
    const w = window as unknown as { __pwned?: boolean }
    const html = buildExportHtml(cairoSample).replace('</body>', '<script>window.__pwned=true</script><img src=x onerror="window.__pwned=true"></body>')
    importFileText(html)
    expect(w.__pwned).toBeUndefined()
  })
})
