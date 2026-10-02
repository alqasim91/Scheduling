import { useMemo, useState, type ReactNode } from 'react'
import { createEmptySchedule } from '../model/defaults.ts'
import { cairoSample } from '../samples/cairo.ts'
import { useConfirm } from '../ui/confirmContext.ts'
import type { Schedule } from '../model/schema.ts'
import { downloadText } from '../persistence/files.ts'
import { renderDocument } from '../render/renderAgenda.ts'
import { BUILTIN_TEMPLATES } from './builtin/index.ts'
import { serializeTemplateFile, templateFilename } from './file.ts'
import { instantiate } from './instantiate.ts'
import { Modal } from '../ui/Modal.tsx'
import { deleteUserTemplate, listUserTemplates, renameUserTemplate } from './store.ts'
import type { Template } from './types.ts'

interface Props {
  onClose: () => void
  /** Called with a ready-to-edit schedule. The caller decides whether to confirm and replace. */
  onChoose: (schedule: Schedule) => void
}

/** A scaled, inert, script-free preview of the rendered page. Only mounted while the dialog is open. */
function Thumbnail({ schedule, name }: { schedule: Schedule; name: string }) {
  const html = useMemo(() => renderDocument(schedule, { forceTheme: 'light' }), [schedule])
  return (
    <div className="card__thumb" aria-hidden="true">
      <iframe className="thumb" title={`Preview of ${name}`} srcDoc={html} sandbox="" tabIndex={-1} loading="lazy" />
    </div>
  )
}

const modeLabel = (mode: Schedule['mode']) => (mode === 'table' ? 'Table' : 'Track grid')

interface CardProps {
  name: string
  description: string
  schedule: Schedule
  onUse: () => void
  children?: ReactNode
}

type Sort = 'newest' | 'oldest' | 'name'
/** Search and sort appear once there are more saved templates than fit comfortably. */
const SEARCH_AFTER = 6

function Card({ name, description, schedule, onUse, children }: CardProps) {
  return (
    <article className="card" aria-label={name}>
      <Thumbnail schedule={schedule} name={name} />
      <div className="card__body">
        <h4>{name}</h4>
        <span className="card__mode">{modeLabel(schedule.mode)}</span>
        <p>{description}</p>
      </div>
      <div className="card__actions">
        <button type="button" className="primary" aria-label={`Use template: ${name}`} onClick={onUse}>
          Use template
        </button>
        {children}
      </div>
    </article>
  )
}

export function Gallery({ onClose, onChoose }: Props) {
  const [mine, setMine] = useState<Template[]>(() => listUserTemplates())
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const blank = useMemo(() => createEmptySchedule(), [])
  const sample = useMemo(() => structuredClone(cairoSample), [])
  const confirm = useConfirm()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('newest')
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = mine.filter((t) => q === '' || `${t.name} ${t.description}`.toLowerCase().includes(q))
    const byTime = (t: Template) => t.createdAt ?? ''
    if (sort === 'name') return [...list].sort((a, b) => a.name.localeCompare(b.name))
    return [...list].sort((a, b) => (sort === 'newest' ? byTime(b).localeCompare(byTime(a)) : byTime(a).localeCompare(byTime(b))))
  }, [mine, query, sort])

  function handleRename() {
    if (!renaming) return
    const result = renameUserTemplate(renaming.id, renaming.value)
    if (result.ok) {
      setMine(listUserTemplates())
      setRenaming(null)
      setMessage(null)
    } else {
      setMessage(result.message)
    }
  }

  async function handleDelete(template: Template) {
    // A saved template cannot be brought back with Undo, so this one does ask.
    const ok = await confirm({
      title: `Delete “${template.name}”?`,
      message: 'This removes the template from this browser. It cannot be undone.',
      confirmLabel: 'Delete template',
      danger: true,
    })
    if (!ok) return
    const result = deleteUserTemplate(template.id)
    setMine(listUserTemplates())
    setMessage(result.ok ? null : result.message)
  }

  function handleExport(template: Template) {
    downloadText(
      templateFilename(template.name),
      serializeTemplateFile({ name: template.name, description: template.description, schedule: template.schedule }),
      'application/json',
    )
  }

  return (
    <Modal titleId="gallery-title" onClose={onClose} wide>
      <header className="modal__head">
        <h2 id="gallery-title">New schedule</h2>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </header>
      {message && (
        <p role="alert" className="field__error">
          {message}
        </p>
      )}

      <section aria-labelledby="gallery-blank">
        <h3 id="gallery-blank">Start</h3>
        <div className="cards">
          <Card
            name="Blank schedule"
            description="An empty track grid with two tracks, ready to draw sessions on."
            schedule={blank}
            onUse={() => onChoose(createEmptySchedule())}
          />
          <Card
            name="Sample event"
            description="A real-looking two-track conference day (Developers Day: Cairo) to explore the editor with."
            schedule={sample}
            onUse={() => onChoose(structuredClone(cairoSample))}
          />
        </div>
      </section>

      <section aria-labelledby="gallery-builtin">
        <h3 id="gallery-builtin">Templates</h3>
        <div className="cards">
          {BUILTIN_TEMPLATES.map((template) => (
            <Card
              key={template.id}
              name={template.name}
              description={template.description}
              schedule={template.schedule}
              onUse={() => onChoose(instantiate(template))}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="gallery-mine">
        <h3 id="gallery-mine">My templates</h3>
        {mine.length === 0 ? (
          <p className="field__hint">Nothing here yet. Use File › “Save as template…” to keep a schedule as a template.</p>
        ) : (
          <>
            {mine.length > SEARCH_AFTER && (
              <div className="gallery-tools">
                <input type="search" aria-label="Search my templates" placeholder="Search my templates" value={query} onChange={(e) => setQuery(e.target.value)} />
                <select aria-label="Sort my templates" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="name">Name A–Z</option>
                </select>
              </div>
            )}
            {shown.length === 0 && <p className="field__hint">No template matches “{query}”.</p>}
            <div className="cards">
            {shown.map((template) => (
              <Card
                key={template.id}
                name={template.name}
                description={template.description || 'No description.'}
                schedule={template.schedule}
                onUse={() => onChoose(instantiate(template))}
              >
                {renaming?.id === template.id ? (
                  <div className="card__rename">
                    <input
                      type="text"
                      dir="auto"
                      aria-label={`New name for ${template.name}`}
                      value={renaming.value}
                      onChange={(e) => setRenaming({ id: template.id, value: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleRename()
                        }
                      }}
                    />
                    <button type="button" onClick={handleRename}>
                      Save name
                    </button>
                    <button type="button" onClick={() => setRenaming(null)}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <button type="button" aria-label={`Rename ${template.name}`} onClick={() => setRenaming({ id: template.id, value: template.name })}>
                      Rename
                    </button>
                    <button type="button" aria-label={`Export ${template.name}`} onClick={() => handleExport(template)}>
                      Export
                    </button>
                    <button type="button" className="danger" aria-label={`Delete ${template.name}`} onClick={() => void handleDelete(template)}>
                      Delete
                    </button>
                  </>
                )}
              </Card>
            ))}
            </div>
          </>
        )}
      </section>
    </Modal>
  )
}
