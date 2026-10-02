import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Editor, type ViewMode } from './editor/Editor.tsx'
import { useHistory, type History } from './editor/useHistory.ts'
import type { Schedule } from './model/schema.ts'
import { buildExportHtml } from './export/exportHtml.ts'
import { embedFonts } from './export/embedFonts.ts'
import { printHtml } from './export/printHtml.ts'
import { downloadText, htmlFilename, readFileAsText, scheduleFilename } from './persistence/files.ts'
import { importFileText } from './persistence/importFile.ts'
import { serializeSchedule } from './persistence/json.ts'
import { STORAGE_KEY, readAutosaved, useAutosave } from './persistence/useAutosave.ts'
import { cairoSample } from './samples/cairo.ts'
import { ExportDialog, type ExportFormat } from './shell/ExportDialog.tsx'
import { TopBar } from './shell/TopBar.tsx'
import { sniffTemplateText } from './templates/file.ts'
import { Gallery } from './templates/Gallery.tsx'
import { ImportTemplateDialog } from './templates/ImportTemplateDialog.tsx'
import { instantiate } from './templates/instantiate.ts'
import { SaveTemplateDialog } from './templates/SaveTemplateDialog.tsx'
import type { TemplateContent } from './templates/types.ts'
import { ConfirmProvider } from './ui/Confirm.tsx'
import { NotifyProvider } from './ui/Notify.tsx'
import { useNotify } from './ui/notifyContext.ts'
import { NARROW_PX, SPLIT_PX, useWidth } from './ui/useWidth.ts'

const MAX_SHOWN_ERRORS = 20

export default function App() {
  // Read once: the schedule to start from, and what migrating an older autosave had to adjust.
  const [initial] = useState(() => {
    const saved = readAutosaved(STORAGE_KEY)
    return { schedule: saved?.schedule ?? structuredClone(cairoSample), warnings: saved?.warnings ?? [] }
  })
  const history = useHistory(initial.schedule)
  return (
    <ConfirmProvider>
      <NotifyProvider watch={history.schedule}>
        <Shell initial={initial} history={history} />
      </NotifyProvider>
    </ConfirmProvider>
  )
}

function Shell({ initial, history }: { initial: { schedule: Schedule; warnings: string[] }; history: History }) {
  const schedule = history.schedule
  const notify = useNotify()
  /** Replace the whole schedule (New, Open, sample): one undoable step. */
  const replaceSchedule = (next: Schedule) => history.set(() => next, { key: null })
  const [errors, setErrors] = useState<string[]>([])
  /** Notes from migrating an opened file; shown once until dismissed. */
  const [warnings, setWarnings] = useState<string[]>(initial.warnings)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'gallery' | 'save' | 'export' | null>(null)
  const [pendingTemplate, setPendingTemplate] = useState<(TemplateContent & { warnings: string[] }) | null>(null)
  const [viewChoice, setViewChoice] = useState<ViewMode | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const width = useWidth()
  const narrow = width < NARROW_PX
  // Wide screens start in Split, medium ones in Edit; narrow ones have no split, the preview is a tab.
  const view: ViewMode = narrow ? (viewChoice === 'preview' ? 'preview' : 'edit') : (viewChoice ?? (width >= SPLIT_PX ? 'split' : 'edit'))

  const status = useAutosave(STORAGE_KEY, schedule)

  // ⌘/Ctrl+Z undoes, ⇧⌘Z and Ctrl+Y redo, wherever the focus is.
  const { undo, redo } = history
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) undo()
      else if ((key === 'z' && e.shiftKey) || (key === 'y' && !e.shiftKey && e.ctrlKey)) redo()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  // An older autosave was upgraded on load: store the upgraded copy now, so its notes appear only once.
  useEffect(() => {
    if (initial.warnings.length === 0) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initial.schedule))
    } catch {
      // Best effort, like the rest of autosave.
    }
  }, [initial])

  // Escape closes the settings drawer.
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  /** Replace the schedule with one from the gallery. Undo brings the old one back, so no asking. */
  function handleChoose(next: Schedule) {
    replaceSchedule(next)
    setErrors([])
    setWarnings([])
    setDialog(null)
    notify({ text: 'Schedule replaced', action: { label: 'Undo', run: history.undo } })
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
        replaceSchedule(result.value)
        setErrors([])
        setWarnings(result.warnings)
        notify({ text: `Opened ${file.name}`, action: { label: 'Undo', run: history.undo } })
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
  async function handleSaveHtml(embed: boolean) {
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

  function handleExport(format: ExportFormat, embed: boolean) {
    setDialog(null)
    if (format === 'html') void handleSaveHtml(embed)
    else void handleExportPdf()
  }

  const hiddenErrors = errors.length - MAX_SHOWN_ERRORS

  return (
    <div className="app">
      <TopBar
        onNew={() => setDialog('gallery')}
        onOpen={() => fileInput.current?.click()}
        onSaveJson={handleSave}
        onSaveTemplate={() => setDialog('save')}
        onUndo={history.undo}
        onRedo={history.redo}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        view={view}
        narrow={narrow}
        onView={(next) => {
          setViewChoice(next)
          setDrawerOpen(false)
        }}
        status={status}
        onExport={() => setDialog('export')}
        exporting={busy}
        drawerOpen={drawerOpen}
        onToggleDrawer={() => setDrawerOpen((open) => !open)}
      />
      <input
        ref={fileInput}
        type="file"
        accept=".json,.html,.htm,application/json,text/html"
        hidden
        data-testid="open-file"
        onChange={handleFile}
      />

      {notice && (
        <p role="status" aria-label="Notice" className="notice">
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

      <Editor
        schedule={schedule}
        apply={history.set}
        undo={history.undo}
        rollbackTo={history.rollbackTo}
        view={view}
        drawerOpen={drawerOpen}
        onCloseDrawer={() => setDrawerOpen(false)}
      />

      {dialog === 'gallery' && <Gallery onClose={() => setDialog(null)} onChoose={handleChoose} />}
      {dialog === 'export' && (
        <ExportDialog
          canEmbedFonts={(schedule.branding.fonts.webFonts?.length ?? 0) > 0}
          onClose={() => setDialog(null)}
          onExport={handleExport}
        />
      )}
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
            replaceSchedule(instantiate({ schedule: pendingTemplate.schedule }))
            setWarnings(pendingTemplate.warnings)
            setPendingTemplate(null)
          }}
        />
      )}
    </div>
  )
}
