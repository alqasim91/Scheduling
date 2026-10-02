import { DateSchema, TimezoneSchema } from '../model/schema.ts'
import type { EventInfo, Schedule } from '../model/schema.ts'
import { safeHttpUrl } from '../render/escape.ts'
import { DraftInput } from './DraftInput.tsx'
import type { Apply } from './types.ts'

interface Props {
  schedule: Schedule
  apply: Apply
}

export function EventPanel({ schedule, apply }: Props) {
  const { event } = schedule

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

  return (
    <section className="panel" aria-labelledby="panel-event">
      <h2 id="panel-event">Event</h2>
      <label className="field">
        <span>Event title</span>
        <input type="text" value={event.title} onChange={(e) => set({ title: e.target.value })} />
      </label>
      <label className="field">
        <span>Title highlight</span>
        <input
          type="text"
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
          placeholder="Africa/Cairo"
          validate={(text) => TimezoneSchema.safeParse(text).success}
          hint="Use an IANA timezone such as Africa/Cairo."
          onCommit={(timezone) => set({ timezone })}
        />
      </div>
      <label className="field">
        <span>Venue</span>
        <input type="text" value={event.venue} onChange={(e) => set({ venue: e.target.value })} />
      </label>
      <label className="field">
        <span>Status</span>
        <input type="text" value={event.status ?? ''} onChange={(e) => setOptional('status', e.target.value)} />
      </label>
      <label className="field">
        <span>Notes</span>
        <textarea rows={3} value={event.notes} onChange={(e) => set({ notes: e.target.value })} />
        <small>Use **double asterisks** for bold.</small>
      </label>
      <label className="field">
        <span>Event URL</span>
        <input type="text" value={event.url ?? ''} onChange={(e) => setOptional('url', e.target.value)} />
        {event.url && !safeHttpUrl(event.url) && (
          <small className="field__error">Only http: and https: links are shown on the page.</small>
        )}
      </label>
    </section>
  )
}
