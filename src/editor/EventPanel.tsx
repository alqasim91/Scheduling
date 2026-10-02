import { DateSchema, LocaleSchema, TimezoneSchema } from '../model/schema.ts'
import type { EventInfo, Labels, Schedule } from '../model/schema.ts'
import { defaultLabelsFor } from '../render/labels.ts'
import { DEFAULT_LOCALE, resolveLocale } from '../render/locale.ts'
import { safeHttpUrl } from '../render/escape.ts'
import { useState } from 'react'
import { DraftInput } from './DraftInput.tsx'
import type { Apply } from './types.ts'

interface Props {
  schedule: Schedule
  apply: Apply
}

const LOCALE_OPTIONS: ReadonlyArray<readonly [string, string]> = [
  ['en-GB', 'English (UK)'],
  ['en-US', 'English (US)'],
  ['ar-EG', 'Arabic (Egypt)'],
  ['ar-SA', 'Arabic (Saudi Arabia)'],
  ['ar-u-nu-latn', 'Arabic (Latin digits)'],
  ['fr-FR', 'French'],
  ['de-DE', 'German'],
  ['es-ES', 'Spanish'],
  ['tr-TR', 'Turkish'],
]

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

export function EventPanel({ schedule, apply }: Props) {
  const { event } = schedule
  const defaults = defaultLabelsFor(event.locale)
  const locale = resolveLocale(event.locale)
  const [customLocale, setCustomLocale] = useState(false)
  const showCustom = customLocale || !LOCALE_OPTIONS.some(([tag]) => tag === locale)

  function set(patch: Partial<EventInfo>) {
    apply((s) => ({ ...s, event: { ...s.event, ...patch } }))
  }
  /** Optional text fields are removed when emptied. */
  function setOptional(key: 'titleHighlight' | 'url' | 'status', value: string) {
    apply((s) => {
      const next = { ...s.event }
      if (value === '') delete next[key]
      else next[key] = value
      return { ...s, event: next }
    })
  }

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
    <section className="panel" aria-labelledby="panel-event">
      <h2 id="panel-event">Event</h2>
      <label className="field">
        <span>Event title</span>
        <input type="text" dir="auto" value={event.title} onChange={(e) => set({ title: e.target.value })} />
      </label>
      <label className="field">
        <span>Title highlight</span>
        <input
          type="text"
          dir="auto"
          value={event.titleHighlight ?? ''}
          onChange={(e) => setOptional('titleHighlight', e.target.value)}
        />
        {event.titleHighlight && !event.title.includes(event.titleHighlight) && (
          <small className="field__error">Not found in the title, so nothing is highlighted.</small>
        )}
      </label>
      <div className="row2">
        <DraftInput
          label="Date"
          value={event.date}
          placeholder="YYYY-MM-DD"
          validate={(text) => DateSchema.safeParse(text).success}
          hint="Use a real date as YYYY-MM-DD."
          onCommit={(date) => set({ date })}
        />
        <DraftInput
          label="Timezone"
          value={event.timezone}
          placeholder="Europe/London"
          validate={(text) => TimezoneSchema.safeParse(text).success}
          hint="Use an IANA timezone such as Europe/London."
          onCommit={(timezone) => set({ timezone })}
        />
      </div>
      <div className="row2">
        <label className="field">
          <span>Language</span>
          <select
            value={showCustom ? 'custom' : locale}
            onChange={(e) => {
              if (e.target.value === 'custom') setCustomLocale(true)
              else {
                setCustomLocale(false)
                set({ locale: e.target.value })
              }
            }}
          >
            {LOCALE_OPTIONS.map(([tag, name]) => (
              <option key={tag} value={tag}>
                {name}
              </option>
            ))}
            <option value="custom">Custom…</option>
          </select>
        </label>
        <label className="field">
          <span>Direction</span>
          <select value={event.direction ?? 'auto'} onChange={(e) => set({ direction: e.target.value as EventInfo['direction'] })}>
            <option value="auto">Auto (from language)</option>
            <option value="ltr">Left to right</option>
            <option value="rtl">Right to left</option>
          </select>
        </label>
      </div>
      {showCustom && (
        <DraftInput
          label="Custom locale"
          value={locale}
          placeholder={DEFAULT_LOCALE}
          commitOnBlur
          dir="ltr"
          validate={(text) => LocaleSchema.safeParse(text).success}
          hint="Use a BCP 47 tag such as pt-BR or ar-u-nu-latn."
          onCommit={(text) => set({ locale: text })}
        />
      )}
      <label className="field">
        <span>Time format</span>
        <select value={event.timeFormat ?? '24h'} onChange={(e) => set({ timeFormat: e.target.value as EventInfo['timeFormat'] })}>
          <option value="24h">24-hour (13:30)</option>
          <option value="12h">12-hour (1:30 PM)</option>
        </select>
      </label>
      <label className="field">
        <span>Venue</span>
        <input type="text" dir="auto" value={event.venue} onChange={(e) => set({ venue: e.target.value })} />
      </label>
      <label className="field">
        <span>Status</span>
        <input type="text" dir="auto" value={event.status ?? ''} onChange={(e) => setOptional('status', e.target.value)} />
      </label>
      <label className="field">
        <span>Notes</span>
        <textarea rows={3} dir="auto" value={event.notes} onChange={(e) => set({ notes: e.target.value })} />
      </label>
      <small className="field__hint">Use **double asterisks** for bold.</small>
      <label className="field">
        <span>Event URL</span>
        <input type="text" dir="ltr" value={event.url ?? ''} onChange={(e) => setOptional('url', e.target.value)} />
        {event.url && !safeHttpUrl(event.url) && (
          <small className="field__error">Only http: and https: links are shown on the page.</small>
        )}
      </label>
      <details className="labels">
        <summary>Labels</summary>
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
      </details>
    </section>
  )
}
