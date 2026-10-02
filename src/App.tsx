import { useRef, useState, type ChangeEvent } from 'react'
import { Editor } from './editor/Editor.tsx'
import { createEmptySchedule } from './model/defaults.ts'
import type { Schedule } from './model/schema.ts'
import { buildExportHtml } from './export/exportHtml.ts'
import { embedFonts } from './export/embedFonts.ts'
import { printHtml } from './export/printHtml.ts'
import { downloadText, htmlFilename, readFileAsText, scheduleFilename } from './persistence/files.ts'
import { importFileText } from './persistence/importFile.ts'
import { serializeSchedule } from './persistence/json.ts'
import { STORAGE_KEY, loadAutosaved, useAutosave } from './persistence/useAutosave.ts'
import { cairoSample } from './samples/cairo.ts'

const MAX_SHOWN_ERRORS = 20

export default function App() {
  const [schedule, setSchedule] = useState<Schedule>(() => loadAutosaved(STORAGE_KEY) ?? structuredClone(cairoSample))
  const [errors, setErrors] = useState<string[]>([])
  const [embed, setEmbed] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useAutosave(STORAGE_KEY, schedule)

  function handleNew() {
    setSchedule(createEmptySchedule())
    setErrors([])
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    try {
      const result = importFileText(await readFileAsText(file))
      if (result.ok) {
        setSchedule(result.value)
        setErrors([])
      } else {
        setErrors(result.errors)
      }
    } catch (error) {
      setErrors([error instanceof Error ? error.message : 'Could not read file'])
    } finally {
      input.value = '' // allow re-opening the same file
    }
  }

  function handleSave() {
    downloadText(scheduleFilename(schedule.event.title), serializeSchedule(schedule), 'application/json')
  }

  /** Save the page as one HTML file, embedding Google Fonts for offline use when asked and possible. */
  async function handleSaveHtml() {
    setNotice(null)
    let fontCss: string | undefined
    if (embed && (schedule.branding.fonts.webFonts?.length ?? 0) > 0) {
      setBusy(true)
      try {
        const result = await embedFonts(schedule)
        if ('error' in result) {
          setNotice(
            `Fonts were not embedded (${result.error}). The saved page still works and loads its fonts from Google Fonts when online.`,
          )
        } else {
          fontCss = result.css
        }
      } finally {
        setBusy(false)
      }
    }
    downloadText(htmlFilename(schedule.event.title), buildExportHtml(schedule, { fontCss }), 'text/html')
  }

  async function handleExportPdf() {
    setNotice(null)
    try {
      await printHtml(buildExportHtml(schedule))
    } catch (error) {
      setNotice(`Could not open the print dialog (${error instanceof Error ? error.message : 'unknown error'}).`)
    }
  }

  function handleLoadSample() {
    setSchedule(structuredClone(cairoSample))
    setErrors([])
  }

  const hiddenErrors = errors.length - MAX_SHOWN_ERRORS

  return (
    <div className="app">
      <header className="toolbar">
        <h1 className="toolbar__title">Schedule Builder</h1>
        <button type="button" onClick={handleNew}>
          New
        </button>
        <button type="button" onClick={() => fileInput.current?.click()}>
          Open…
        </button>
        <button type="button" onClick={handleSave}>
          Save JSON
        </button>
        <button type="button" onClick={handleLoadSample}>
          Load sample
        </button>
        <span className="toolbar__sep" aria-hidden="true" />
        <button type="button" onClick={handleSaveHtml} disabled={busy}>
          Save HTML
        </button>
        <label className="toolbar__check">
          <input type="checkbox" checked={embed} onChange={(e) => setEmbed(e.target.checked)} />
          <span>Embed fonts for offline use</span>
        </label>
        <button type="button" onClick={handleExportPdf}>
          Export PDF
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,.html,.htm,application/json,text/html"
          hidden
          data-testid="open-file"
          onChange={handleFile}
        />
      </header>

      {notice && (
        <p role="status" className="notice">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </p>
      )}

      {errors.length > 0 && (
        <div role="alert" className="alert">
          <strong>Could not open that file.</strong>
          <ul>
            {errors.slice(0, MAX_SHOWN_ERRORS).map((message, i) => (
              <li key={i}>{message}</li>
            ))}
          </ul>
          {hiddenErrors > 0 && <p>…and {hiddenErrors} more.</p>}
        </div>
      )}

      <Editor schedule={schedule} setSchedule={setSchedule} />
    </div>
  )
}
