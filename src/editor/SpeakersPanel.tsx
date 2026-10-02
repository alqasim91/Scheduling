import { useState, type ChangeEvent } from 'react'
import { initials } from '../render/renderAgenda.ts'
import { newId } from '../model/ids.ts'
import type { Schedule, Speaker } from '../model/schema.ts'
import { useNotify } from '../ui/notifyContext.ts'
import { Section } from '../ui/Section.tsx'
import { LOGO_TYPES, readFileAsDataUrl, validateLogoFile } from './logoFile.ts'
import { addSpeaker, removeSpeaker, updateSpeaker } from './ops.ts'
import type { Apply } from './types.ts'

interface Props {
  schedule: Schedule
  apply: Apply
  /** Undo, for the "Speaker deleted" toast. */
  undo: () => void
}

function Avatar({ speaker }: { speaker: Speaker }) {
  return (
    <span className="avatar" style={{ background: speaker.color ?? '#0b57d0' }} aria-hidden="true">
      {speaker.photo ? <img src={speaker.photo} alt="" /> : initials(speaker.name)}
    </span>
  )
}

/** The people shown in the Speakers section of the page and offered when naming a session's speaker. */
export function SpeakersPanel({ schedule, apply, undo }: Props) {
  const notify = useNotify()
  const [error, setError] = useState<{ id: string; message: string } | null>(null)
  const [freshId, setFreshId] = useState<string | null>(null)

  async function handlePhoto(speaker: Speaker, event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    const problem = validateLogoFile(file)
    if (problem) {
      setError({ id: speaker.id, message: problem.replace('Logo', 'Photo') })
    } else {
      try {
        const photo = await readFileAsDataUrl(file)
        apply((s) => updateSpeaker(s, speaker.id, { photo }), { key: null })
        setError(null)
      } catch {
        setError({ id: speaker.id, message: 'Could not read that file.' })
      }
    }
    input.value = ''
  }

  return (
    <Section title="Speakers">
      {schedule.speakers.length === 0 && <p className="field__hint">No speakers yet. They appear in the Speakers section of the page.</p>}
      <ul className="speakers">
        {schedule.speakers.map((speaker, i) => (
          <li key={speaker.id} className="speaker">
            <Avatar speaker={speaker} />
            <div className="speaker__fields">
              <input
                type="text"
                dir="auto"
                aria-label={`Speaker ${i + 1} name`}
                placeholder="Name"
                value={speaker.name}
                autoFocus={freshId === speaker.id}
                onChange={(e) => apply((s) => updateSpeaker(s, speaker.id, { name: e.target.value }))}
              />
              <input
                type="text"
                dir="auto"
                aria-label={`Speaker ${i + 1} role`}
                placeholder="Role, organisation"
                value={speaker.role}
                onChange={(e) => apply((s) => updateSpeaker(s, speaker.id, { role: e.target.value }))}
              />
              <div className="speaker__tools">
                <input
                  type="color"
                  aria-label={`Speaker ${i + 1} colour`}
                  value={speaker.color ?? '#0b57d0'}
                  onChange={(e) => apply((s) => updateSpeaker(s, speaker.id, { color: e.target.value }))}
                />
                <label className="button-like">
                  {speaker.photo ? 'Change photo' : 'Add photo'}
                  <input type="file" hidden aria-label={`Speaker ${i + 1} photo`} accept={LOGO_TYPES.join(',')} onChange={(e) => void handlePhoto(speaker, e)} />
                </label>
                {speaker.photo && (
                  <button type="button" className="ghost" onClick={() => apply((s) => updateSpeaker(s, speaker.id, { photo: null }), { key: null })}>
                    Remove photo
                  </button>
                )}
                <button
                  type="button"
                  className="ghost danger"
                  aria-label={`Delete speaker ${speaker.name || i + 1}`}
                  onClick={() => {
                    apply((s) => removeSpeaker(s, speaker.id), { key: null })
                    notify({ text: 'Speaker deleted', action: { label: 'Undo', run: undo } })
                  }}
                >
                  Delete
                </button>
              </div>
              {error?.id === speaker.id && (
                <p role="alert" className="field__error">
                  {error.message}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => {
          const id = newId('spk')
          setFreshId(id)
          apply((s) => addSpeaker(s, { id }), { key: null })
        }}
      >
        + Add speaker
      </button>
    </Section>
  )
}
