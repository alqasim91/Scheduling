import { useState } from 'react'
import { Modal } from './Modal.tsx'
import { saveUserTemplate } from './store.ts'
import type { TemplateContent } from './types.ts'

interface Props {
  content: TemplateContent
  onClose: () => void
  /** Called after the template was added to My templates. */
  onAdded: (name: string) => void
  onOpenAsSchedule: () => void
}

/** Shown when an opened file is a template file: add it to My templates, or open it as a schedule. */
export function ImportTemplateDialog({ content, onClose, onAdded, onOpenAsSchedule }: Props) {
  const [error, setError] = useState<string | null>(null)

  function handleAdd() {
    const result = saveUserTemplate(content)
    if (result.ok) onAdded(content.name)
    else setError(result.message)
  }

  return (
    <Modal titleId="import-template-title" onClose={onClose}>
      <h2 id="import-template-title">Template file</h2>
      <p>
        <strong dir="auto">{content.name}</strong> is a template. What would you like to do with it?
      </p>
      {content.description && <p dir="auto">{content.description}</p>}
      {error && (
        <p role="alert" className="field__error">
          {error}
        </p>
      )}
      <div className="modal__buttons">
        <button type="button" className="primary" onClick={handleAdd}>
          Add to My templates
        </button>
        <button type="button" onClick={onOpenAsSchedule}>
          Open as a schedule
        </button>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  )
}
