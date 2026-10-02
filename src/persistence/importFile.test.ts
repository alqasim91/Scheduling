import { describe, expect, it } from 'vitest'
import { buildExportHtml } from '../export/exportHtml.ts'
import { createEmptySchedule } from '../model/defaults.ts'
import { rtlDemo } from '../render/__fixtures__/rtlDemo.ts'
import { renderDocument } from '../render/renderAgenda.ts'
import { cairoSample } from '../samples/cairo.ts'
import { NOT_EXPORTED_ERROR, importFileText } from './importFile.ts'
import { serializeSchedule } from './json.ts'

describe('importFileText', () => {
  it('round-trips an exported page back to the identical schedule', () => {
    for (const schedule of [cairoSample, rtlDemo, createEmptySchedule()]) {
      const result = importFileText(buildExportHtml(schedule))
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value).toEqual(schedule)
    }
  })

  it('round-trips a page with embedded fonts and hostile text', () => {
    const hostile = { ...cairoSample, event: { ...cairoSample.event, title: '</script><script>alert(1)</script> \u2028' } }
    const html = buildExportHtml(hostile, { fontCss: "@font-face{font-family:'X';src:url(data:font/woff2;base64,AA==)}" })
    const result = importFileText(html)
    expect(result.ok && result.value).toEqual(hostile)
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
