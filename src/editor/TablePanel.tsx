import type { Column, Schedule } from '../model/schema.ts'
import { addRow, setCell, tableColumns } from './ops.ts'
import { RowHead } from './RowHead.tsx'
import type { Apply } from './types.ts'

interface Props {
  schedule: Schedule
  apply: Apply
}

const SPEAKER_LIST_ID = 'table-speaker-names'

function CellInput({ column, label, value, onChange }: { column: Column; label: string; value: string; onChange: (v: string) => void }) {
  switch (column.type) {
    case 'time':
      return <input type="time" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
    case 'person':
      return (
        <input
          type="text"
          dir="auto"
          list={SPEAKER_LIST_ID}
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'tag':
      return (
        <input
          type="text"
          dir="auto"
          aria-label={label}
          placeholder="comma-separated"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    default:
      return <textarea rows={1} dir="auto" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
  }
}

/** Table-mode editor: one row of inputs per schedule row, one cell input per table column. */
export function TablePanel({ schedule, apply }: Props) {
  const columns = tableColumns(schedule)

  return (
    <section className="panel" aria-labelledby="panel-table">
      <h2 id="panel-table">Table</h2>
      {columns.length === 0 && <p className="field__hint">Add a column above to start filling the table.</p>}
      <datalist id={SPEAKER_LIST_ID}>
        {schedule.speakers.map((s) => (
          <option key={s.id} value={s.name} />
        ))}
      </datalist>
      <div className="grid-scroll">
        <table className="grid tablegrid">
          <thead>
            <tr>
              <th scope="col">Time</th>
              {columns.map((column) => (
                <th key={column.id} scope="col">
                  {column.name}
                  <small className="field__hint"> ({column.type})</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {schedule.rows.map((row, i) => (
              <tr key={row.id}>
                <RowHead schedule={schedule} row={row} index={i} apply={apply} />
                {columns.map((column) => (
                  <td key={column.id} className="grid__cell">
                    <CellInput
                      column={column}
                      label={`${column.name} for row ${row.start}`}
                      value={row.cells?.[column.id] ?? ''}
                      onChange={(v) => apply((s) => setCell(s, row.id, column.id, v))}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <small className="field__hint">
        Tags are comma-separated. A person who matches a speaker (any capitalisation) is shown with their avatar.
      </small>
      <button type="button" onClick={() => apply((s) => addRow(s))}>
        + Add row
      </button>
    </section>
  )
}
