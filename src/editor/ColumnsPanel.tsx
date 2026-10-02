import type { Column, Schedule } from '../model/schema.ts'
import { addColumn, moveColumn, removeColumn, renameColumn, setColumnColor, setColumnType, tableColumns, trackColumns } from './ops.ts'
import type { Apply } from './types.ts'

interface Props {
  schedule: Schedule
  apply: Apply
}

const TYPE_OPTIONS: ReadonlyArray<readonly [Column['type'], string]> = [
  ['text', 'Text'],
  ['time', 'Time'],
  ['person', 'Person'],
  ['tag', 'Tag'],
]

/** The columns of the active mode: tracks for the grid, text/time/person/tag columns for the table. */
export function ColumnsPanel({ schedule, apply }: Props) {
  const table = schedule.mode === 'table'
  const columns = table ? tableColumns(schedule) : trackColumns(schedule)

  function handleRemove(column: Column) {
    const used = table
      ? schedule.rows.filter((r) => (r.cells?.[column.id] ?? '') !== '').length
      : schedule.items.filter((item) => item.columnIds.includes(column.id)).length
    const message = table
      ? `Remove "${column.name}"? Its values in ${used} row(s) will be deleted.`
      : `Remove "${column.name}"? ${used} item(s) in it will be removed or shrunk.`
    if (used > 0 && !window.confirm(message)) return
    apply((s) => removeColumn(s, column.id))
  }

  return (
    <section className="panel" aria-labelledby="panel-columns">
      <h2 id="panel-columns">Columns</h2>
      <ul className="columns">
        {columns.map((column, i) => (
          <li key={column.id} className="columns__item">
            <input
              type="text"
              dir="auto"
              aria-label={`Column ${i + 1} name`}
              value={column.name}
              onChange={(e) => apply((s) => renameColumn(s, column.id, e.target.value))}
            />
            {table && (
              <select
                aria-label={`Column ${i + 1} type`}
                value={column.type}
                onChange={(e) => apply((s) => setColumnType(s, column.id, e.target.value as Column['type']))}
              >
                {TYPE_OPTIONS.map(([type, label]) => (
                  <option key={type} value={type}>
                    {label}
                  </option>
                ))}
              </select>
            )}
            {(!table || column.type === 'tag') && (
              <input
                type="color"
                aria-label={`Column ${i + 1} color`}
                title={table ? 'Colour of the tag chips' : undefined}
                value={column.color}
                onChange={(e) => apply((s) => setColumnColor(s, column.id, e.target.value))}
              />
            )}
            <button
              type="button"
              aria-label={`Move column ${i + 1} up`}
              disabled={i === 0}
              onClick={() => apply((s) => moveColumn(s, column.id, -1))}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`Move column ${i + 1} down`}
              disabled={i === columns.length - 1}
              onClick={() => apply((s) => moveColumn(s, column.id, 1))}
            >
              ↓
            </button>
            <button type="button" aria-label={`Remove column ${i + 1}`} onClick={() => handleRemove(column)}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => apply((s) => addColumn(s))}>
        + Add column
      </button>
    </section>
  )
}
