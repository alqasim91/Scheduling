import type { Item, Schedule } from '../model/schema.ts'
import { TIME_PATTERN, toMinutes } from '../model/time.ts'
import { DraftInput } from './DraftInput.tsx'
import {
  extendItem,
  removeItem,
  setItemTimes,
  setRowSpan,
  shrinkItem,
  spanAllColumns,
  updateItem,
} from './ops.ts'
import type { Apply } from './types.ts'

interface Props {
  schedule: Schedule
  item: Item
  apply: Apply
  onClose: () => void
}

/** Blank clears the override; otherwise HH:MM, and start must stay before end. */
function overrideValidator(other: string | undefined, isStart: boolean) {
  return (text: string) => {
    if (text === '') return true
    if (!TIME_PATTERN.test(text)) return false
    if (other === undefined) return true
    return isStart ? toMinutes(text) < toMinutes(other) : toMinutes(other) < toMinutes(text)
  }
}

export function ItemForm({ schedule, item, apply, onClose }: Props) {
  const refused = (op: (s: Schedule) => Schedule) => op(schedule) === schedule
  const rowIndex = schedule.rows.findIndex((r) => r.id === item.rowId)
  const maxSpan = Math.max(1, schedule.rows.length - rowIndex)

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
          label="Start override"
          value={item.start ?? ''}
          placeholder="row start"
          validate={overrideValidator(item.end, true)}
          hint="Blank, or a time before the end override."
          onCommit={(text) => apply((s) => setItemTimes(s, item.id, text || undefined, item.end))}
        />
        <DraftInput
          label="End override"
          value={item.end ?? ''}
          placeholder="row end"
          validate={overrideValidator(item.start, false)}
          hint="Blank, or a time after the start override."
          onCommit={(text) => apply((s) => setItemTimes(s, item.id, item.start, text || undefined))}
        />
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
      <small className="field__hint">Shown in the empty cells below this item when it runs past its row.</small>
      <label className="field">
        <span>Row span</span>
        <input
          type="number"
          min={1}
          max={maxSpan}
          value={item.rowSpan ?? 1}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (Number.isInteger(n)) apply((s) => setRowSpan(s, item.id, n))
          }}
        />
      </label>
      <div className="item-form__buttons">
        <button type="button" disabled={refused((s) => extendItem(s, item.id, 'left'))} onClick={() => apply((s) => extendItem(s, item.id, 'left'))}>
          ← Merge left
        </button>
        <button type="button" disabled={refused((s) => extendItem(s, item.id, 'right'))} onClick={() => apply((s) => extendItem(s, item.id, 'right'))}>
          Merge right →
        </button>
        <button type="button" disabled={refused((s) => shrinkItem(s, item.id, 'left'))} onClick={() => apply((s) => shrinkItem(s, item.id, 'left'))}>
          Shrink left
        </button>
        <button type="button" disabled={refused((s) => shrinkItem(s, item.id, 'right'))} onClick={() => apply((s) => shrinkItem(s, item.id, 'right'))}>
          Shrink right
        </button>
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
