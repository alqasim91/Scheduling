import { useRef, useState, type ChangeEvent } from 'react'
import { createEmptySchedule } from './model/defaults.ts'
import type { Schedule } from './model/schema.ts'
import { downloadText, readFileAsText, scheduleFilename } from './persistence/files.ts'
import { parseScheduleJson, serializeSchedule } from './persistence/json.ts'
import { STORAGE_KEY, loadAutosaved, useAutosave } from './persistence/useAutosave.ts'

const MAX_SHOWN_ERRORS = 20

export default function App() {
  const [schedule, setSchedule] = useState<Schedule>(() => loadAutosaved(STORAGE_KEY) ?? createEmptySchedule())
  const [errors, setErrors] = useState<string[]>([])
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
      const result = parseScheduleJson(await readFileAsText(file))
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

  function handleTitle(title: string) {
    setSchedule((current) => ({ ...current, event: { ...current.event, title } }))
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
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          data-testid="open-file"
          onChange={handleFile}
        />
      </header>

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

      <main className="body">
        <label className="field">
          <span>Event title</span>
          <input type="text" value={schedule.event.title} onChange={(e) => handleTitle(e.target.value)} />
        </label>

        <dl className="summary" aria-label="Schedule summary">
          <div>
            <dt>Mode</dt>
            <dd data-testid="summary-mode">{schedule.mode}</dd>
          </div>
          <div>
            <dt>Columns</dt>
            <dd data-testid="summary-columns">{schedule.columns.length}</dd>
          </div>
          <div>
            <dt>Rows</dt>
            <dd data-testid="summary-rows">{schedule.rows.length}</dd>
          </div>
          <div>
            <dt>Items</dt>
            <dd data-testid="summary-items">{schedule.items.length}</dd>
          </div>
        </dl>
        <p className="summary__title" data-testid="summary-title">
          {schedule.event.title || 'Untitled'}
        </p>
      </main>
    </div>
  )
}
