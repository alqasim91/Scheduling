import type { Labels, Schedule } from '../model/schema.ts'
import { defaultLabelsFor } from '../render/labels.ts'
import { Section } from '../ui/Section.tsx'
import type { Apply } from './types.ts'

interface Props {
  schedule: Schedule
  apply: Apply
}

const LABEL_FIELDS: ReadonlyArray<readonly [keyof Labels, string]> = [
  ['agenda', 'Agenda heading'],
  ['speakers', 'Speakers heading'],
  ['everyone', 'Everyone label'],
  ['speakerPrefix', 'Speaker prefix'],
  ['trackSuffix', 'Track suffix'],
  ['continuesUntil', 'Continues-until text'],
  ['eventLink', 'Event link text'],
  ['now', 'Now badge text'],
  ['time', 'Time column heading'],
  ['sessionFallback', 'Session fallback ({track} = column name)'],
]

export function LabelsPanel({ schedule, apply }: Props) {
  const defaults = defaultLabelsFor(schedule.event.locale)

  /** Labels are optional text overrides; emptied fields are removed so the default applies. */
  function setLabel(key: keyof Labels, value: string) {
    apply((s) => {
      const next = { ...s.labels }
      if (value === '') delete next[key]
      else next[key] = value
      return { ...s, labels: Object.keys(next).length > 0 ? next : undefined }
    })
  }

  return (
    <Section title="Labels">
      <p className="labels__hint">Wording of the fixed text on the page. Leave a field empty to use the default.</p>
      {LABEL_FIELDS.map(([key, text]) => (
        <label className="field" key={key}>
          <span>{text}</span>
          <input
            type="text"
            dir="auto"
            value={schedule.labels?.[key] ?? ''}
            placeholder={defaults[key]}
            onChange={(e) => setLabel(key, e.target.value)}
          />
        </label>
      ))}
    </Section>
  )
}
