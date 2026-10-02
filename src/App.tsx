import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Editor } from './editor/Editor.tsx'
import type { Schedule } from './model/schema.ts'
import { buildExportHtml } from './export/exportHtml.ts'
import { embedFonts } from './export/embedFonts.ts'
import { printHtml } from './export/printHtml.ts'
import { downloadText, htmlFilename, readFileAsText, scheduleFilename } from './persistence/files.ts'
import { importFileText } from './persistence/importFile.ts'
import { serializeSchedule } from './persistence/json.ts'
import { STORAGE_KEY, readAutosaved, useAutosave } from './persistence/useAutosave.ts'
import { cairoSample } from './samples/cairo.ts'
import { sniffTemplateText } from './templates/file.ts'
import { Gallery } from './templates/Gallery.tsx'
import { ImportTemplateDialog } from './templates/ImportTemplateDialog.tsx'
import { canonical, instantiate } from './templates/instantiate.ts'
import { SaveTemplateDialog } from './templates/SaveTemplateDialog.tsx'
import type { TemplateContent } from './templates/types.ts'
import { createEmptySchedule } from './model/defaults.ts'

const MAX_SHOWN_ERRORS = 20

export default function App() {
  // Read once: the schedule to start from, and what migrating an older autosave had to adjust.
  const [initial] = useState(() => {
    const saved = readAutosaved(STORAGE_KEY)
    return { schedule: saved?.schedule ?? structuredClone(cairoSample), warnings: saved?.warnings ?? [] }
  })
  const [schedule, setSchedule] = useState<Schedule>(initial.schedule)
  const [errors, setErrors] = useState<string[]>([])
  /** Notes from migrating an opened file; shown once until dismissed. */
  const [warnings, setWarnings] = useState<string[]>(initial.warnings)
  const [embed, setEmbed] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'gallery' | 'save' | null>(null)
  const [pendingTemplate, setPendingTemplate] = useState<(TemplateContent & { warnings: string[] }) | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useAutosave(STORAGE_KEY, schedule)

  // An older autosave was upgraded on load: store the upgraded copy now, so its notes appear only once.
  useEffect(() => {
    if (initial.warnings.length === 0) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initial.schedule))
    } catch {
      // Best effort, like the rest of autosave.
    }
  }, [initial])

  /** Replace the schedule with one from the gallery, confirming first if there is something to lose. */
  function handleChoose(next: Schedule) {
    const untouched = JSON.stringify(canonical(schedule)) === JSON.stringify(canonical(createEmptySchedule()))
    if (
      !untouched &&
      !window.confirm('Replace the current schedule? Unsaved changes are kept only in autosave until replaced.')
    ) {
      return
    }
    setSchedule(next)
    setErrors([])
    setWarnings([])
    setDialog(null)
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    try {
      const text = await readFileAsText(file)
      const template = sniffTemplateText(text)
      if (template) {
        // A template file: let the person choose between adding it and opening it.
        if (template.ok) {
          setPendingTemplate({ ...template.value, warnings: template.warnings })
          setErrors([])
        } else {
          setErrors(template.errors)
        }
        return
      }
      const result = importFileText(text)
      if (result.ok) {
        setSchedule(result.value)
        setErrors([])
        setWarnings(result.warnings)
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
    setWarnings([])
  }

  const hiddenErrors = errors.length - MAX_SHOWN_ERRORS

  return (
    <div className="app">
      <header className="toolbar">
        <h1 className="toolbar__title">Schedule Builder</h1>
        <button type="button" onClick={() => setDialog('gallery')}>
          New…
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
        <button type="button" onClick={() => setDialog('save')}>
          Save as template…
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

      {warnings.length > 0 && (
        <div role="status" className="notice notice--warnings" aria-label="Changes made while opening the file">
          <div>
            <strong>Opened with {warnings.length === 1 ? 'one adjustment' : `${warnings.length} adjustments`}.</strong>
            <ul>
              {warnings.slice(0, MAX_SHOWN_ERRORS).map((message, i) => (
                <li key={i}>{message}</li>
              ))}
            </ul>
            {warnings.length > MAX_SHOWN_ERRORS && <p>…and {warnings.length - MAX_SHOWN_ERRORS} more.</p>}
          </div>
          <button type="button" onClick={() => setWarnings([])}>
            Dismiss
          </button>
        </div>
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

      {dialog === 'gallery' && <Gallery onClose={() => setDialog(null)} onChoose={handleChoose} />}
      {dialog === 'save' && (
        <SaveTemplateDialog
          schedule={schedule}
          onClose={() => setDialog(null)}
          onSaved={(name) => {
            setDialog(null)
            setNotice(`Saved “${name}” to My templates.`)
          }}
        />
      )}
      {pendingTemplate && (
        <ImportTemplateDialog
          content={pendingTemplate}
          onClose={() => setPendingTemplate(null)}
          onAdded={(name) => {
            setPendingTemplate(null)
            setNotice(`Added “${name}” to My templates.`)
          }}
          onOpenAsSchedule={() => {
            setSchedule(instantiate({ schedule: pendingTemplate.schedule }))
            setWarnings(pendingTemplate.warnings)
            setPendingTemplate(null)
          }}
        />
      )}
    </div>
  )
}
