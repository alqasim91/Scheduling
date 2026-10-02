import type { Row, Schedule } from '../model/schema.ts'
import { TIME_PATTERN, toMinutes } from '../model/time.ts'
import { DraftInput } from './DraftInput.tsx'
import { insertRowAfter, moveRow, removeRow, setRowNote, setRowTimes } from './ops.ts'
import type { Apply } from './types.ts'

interface Props {
  schedule: Schedule
  row: Row
  /** Zero-based position of the row. */
  index: number
  apply: Apply
}

/** The row header cell shared by the grid and table editors: times, note, move, insert, remove. */
export function RowHead({ schedule, row, index, apply }: Props) {
  const n = index + 1

  function handleRemove() {
    const used =
      schedule.items.filter((i) => i.rowId === row.id).length +
      Object.values(row.cells ?? {}).filter((v) => v !== '').length
    if (used > 0 && !window.confirm(`Remove row ${n}? Its items and table cells will be deleted.`)) return
    apply((s) => removeRow(s, row.id))
  }

  return (
    <th scope="row" className="grid__row-head">
      <div className="row2">
        <DraftInput
          label={`Row ${n} start`}
          value={row.start}
          validate={(t) => TIME_PATTERN.test(t) && toMinutes(t) < toMinutes(row.end)}
          hint="HH:MM, before the end."
          onCommit={(t) => apply((s) => setRowTimes(s, row.id, t, row.end))}
        />
        <DraftInput
          label={`Row ${n} end`}
          value={row.end}
          validate={(t) => TIME_PATTERN.test(t) && toMinutes(t) > toMinutes(row.start)}
          hint="HH:MM, after the start."
          onCommit={(t) => apply((s) => setRowTimes(s, row.id, row.start, t))}
        />
      </div>
      <label className="field">
        <span>Row {n} note</span>
        <input
          type="text"
          dir="auto"
          value={row.note ?? ''}
          onChange={(e) => apply((s) => setRowNote(s, row.id, e.target.value))}
        />
      </label>
      <div className="grid__row-actions">
        <button type="button" aria-label={`Move row ${n} up`} disabled={index === 0} onClick={() => apply((s) => moveRow(s, row.id, -1))}>
          ↑
        </button>
        <button
          type="button"
          aria-label={`Move row ${n} down`}
          disabled={index === schedule.rows.length - 1}
          onClick={() => apply((s) => moveRow(s, row.id, 1))}
        >
          ↓
        </button>
        <button type="button" aria-label={`Insert row after row ${n}`} onClick={() => apply((s) => insertRowAfter(s, row.id))}>
          + Row below
        </button>
        <button type="button" aria-label={`Remove row ${n}`} onClick={handleRemove}>
          ✕
        </button>
      </div>
    </th>
  )
}
