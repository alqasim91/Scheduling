import { useState, type FormEvent } from 'react'
import type { Schedule } from '../model/schema.ts'
import { downloadText } from '../persistence/files.ts'
import { serializeTemplateFile, templateFilename } from './file.ts'
import { Modal } from '../ui/Modal.tsx'
import { saveUserTemplate } from './store.ts'
import { stripContent } from './strip.ts'

interface Props {
  schedule: Schedule
  onClose: () => void
  /** Called after a successful save with the template's name. */
  onSaved: (name: string) => void
}

export function SaveTemplateDialog({ schedule, onClose, onSaved }: Props) {
  const [name, setName] = useState(schedule.event.title)
  const [description, setDescription] = useState('')
  const [includeContent, setIncludeContent] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /** The template to save: the whole schedule, or just its shell. */
  function build() {
    const trimmed = name.trim()
    if (trimmed === '') {
      setError('Give the template a name.')
      return null
    }
    return { name: trimmed, description: description.trim(), schedule: includeContent ? structuredClone(schedule) : stripContent(schedule) }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const content = build()
    if (!content) return
    const result = saveUserTemplate(content)
    if (result.ok) onSaved(content.name)
    else setError(result.message)
  }

  function handleExport() {
    const content = build()
    if (!content) return
    downloadText(templateFilename(content.name), serializeTemplateFile(content), 'application/json')
    setError(null)
  }

  return (
    <Modal titleId="save-template-title" onClose={onClose}>
      <h2 id="save-template-title">Save as template</h2>
      <form onSubmit={handleSubmit} className="modal__form" noValidate>
        <label className="field">
          <span>Template name</span>
          <input type="text" dir="auto" value={name} aria-required="true" onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea rows={3} dir="auto" value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className="check">
          <input type="checkbox" checked={includeContent} onChange={(e) => setIncludeContent(e.target.checked)} />
          <span>Include sessions, speakers and cell content</span>
        </label>
        <small className="field__hint">
          Without content the template keeps the event details, branding, labels, language, columns and row times and notes.
        </small>
        {error && (
          <p role="alert" className="field__error">
            {error}
          </p>
        )}
        <div className="modal__buttons">
          <button type="submit" className="primary">
            Save template
          </button>
          <button type="button" onClick={handleExport}>
            Export template file
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}
