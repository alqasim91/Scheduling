import type { Item, Schedule } from '../model/schema.ts'
import { TIME_PATTERN } from '../model/time.ts'
import { DraftInput } from './DraftInput.tsx'
import { removeItem, resizeItem, setItemColumns, spanAllColumns, trackColumns, updateItem } from './ops.ts'
import type { Apply } from './types.ts'

interface Props {
  schedule: Schedule
  item: Item
  apply: Apply
  onClose: () => void
}

export function ItemForm({ schedule, item, apply, onClose }: Props) {
  const tracks = trackColumns(schedule)
  const first = tracks.findIndex((c) => item.columnIds.includes(c.id))
  const last = tracks.length - 1 - [...tracks].reverse().findIndex((c) => item.columnIds.includes(c.id))
  const refused = (op: (s: Schedule) => Schedule) => op(schedule) === schedule

  return (
    <section className="item-form" aria-label="Edit item">
      <div className="item-form__head">
        <h3>Edit item</h3>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <label className="field">
        <span>Item title</span>
        <input type="text" dir="auto" value={item.title} onChange={(e) => apply((s) => updateItem(s, item.id, { title: e.target.value }))} />
      </label>
      <label className="field">
        <span>Speaker</span>
        <input
          type="text"
          dir="auto"
          value={item.speaker ?? ''}
          onChange={(e) => apply((s) => updateItem(s, item.id, { speaker: e.target.value }))}
        />
      </label>
      <label className="field">
        <span>Variant</span>
        <select
          value={item.variant}
          onChange={(e) => apply((s) => updateItem(s, item.id, { variant: e.target.value as Item['variant'] }))}
        >
          <option value="session">Session</option>
          <option value="break">Break</option>
          <option value="highlight">Highlight</option>
        </select>
      </label>
      <div className="row2">
        <DraftInput
          label="Start"
          value={item.start}
          validate={(text) => text === item.start || (TIME_PATTERN.test(text) && !refused((s) => resizeItem(s, item.id, { start: text })))}
          hint="HH:MM, before the end and clear of other sessions in the same tracks."
          onCommit={(text) => apply((s) => resizeItem(s, item.id, { start: text }))}
        />
        <DraftInput
          label="End"
          value={item.end}
          validate={(text) => text === item.end || (TIME_PATTERN.test(text) && !refused((s) => resizeItem(s, item.id, { end: text })))}
          hint="HH:MM, after the start and clear of other sessions in the same tracks."
          onCommit={(text) => apply((s) => resizeItem(s, item.id, { end: text }))}
        />
      </div>
      <div className="row2">
        <label className="field">
          <span>First track</span>
          <select value={first} onChange={(e) => apply((s) => setItemColumns(s, item.id, Number(e.target.value), Math.max(Number(e.target.value), last)))}>
            {tracks.map((c, i) => (
              <option key={c.id} value={i} disabled={i !== first && refused((s) => setItemColumns(s, item.id, i, Math.max(i, last)))}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Last track</span>
          <select value={last} onChange={(e) => apply((s) => setItemColumns(s, item.id, Math.min(first, Number(e.target.value)), Number(e.target.value)))}>
            {tracks.map((c, i) => (
              <option key={c.id} value={i} disabled={i !== last && refused((s) => setItemColumns(s, item.id, Math.min(first, i), i))}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span>Continuation label</span>
        <input
          type="text"
          dir="auto"
          value={item.continuationLabel ?? ''}
          placeholder="e.g. Workshop A session"
          onChange={(e) => apply((s) => updateItem(s, item.id, { continuationLabel: e.target.value }))}
        />
      </label>
      <small className="field__hint">Shown in the empty cells below this item when it runs past the end of its slot.</small>
      <label className="field">
        <span>Note</span>
        <input
          type="text"
          dir="auto"
          value={item.note ?? ''}
          placeholder="Small line shown after this session’s slot"
          onChange={(e) => apply((s) => updateItem(s, item.id, { note: e.target.value }))}
        />
      </label>
      <div className="item-form__buttons">
        <button type="button" disabled={refused((s) => spanAllColumns(s, item.id))} onClick={() => apply((s) => spanAllColumns(s, item.id))}>
          Span all columns
        </button>
        <button
          type="button"
          className="danger"
          onClick={() => {
            apply((s) => removeItem(s, item.id))
            onClose()
          }}
        >
          Delete item
        </button>
      </div>
    </section>
  )
}
