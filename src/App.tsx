import { useRef, useState, type ChangeEvent } from 'react'
import { Editor } from './editor/Editor.tsx'
import { createEmptySchedule } from './model/defaults.ts'
import type { Schedule } from './model/schema.ts'
import { downloadText, readFileAsText, scheduleFilename } from './persistence/files.ts'
import { parseScheduleJson, serializeSchedule } from './persistence/json.ts'
import { STORAGE_KEY, loadAutosaved, useAutosave } from './persistence/useAutosave.ts'
import { cairoSample } from './samples/cairo.ts'

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

      <Editor schedule={schedule} setSchedule={setSchedule} />
    </div>
  )
}
