import type { Column, Schedule } from '../model/schema.ts'
import { useNotify } from '../ui/notifyContext.ts'
import { addColumn, moveColumn, removeColumn, renameColumn, setColumnColor, setColumnType, tableColumns } from './ops.ts'
import type { Apply } from './types.ts'

interface Props {
  schedule: Schedule
  apply: Apply
  undo: () => void
}

const TYPE_OPTIONS: ReadonlyArray<readonly [Column['type'], string]> = [
  ['text', 'Text'],
  ['time', 'Time'],
  ['person', 'Person'],
  ['tag', 'Tag'],
]

/**
 * The table's own columns (text, time, person, tag). Track columns are edited on the board's
 * headers. Removing a column is undoable, so it shows an Undo toast instead of asking.
 */
export function ColumnsPanel({ schedule, apply, undo }: Props) {
  const columns = tableColumns(schedule)
  const notify = useNotify()

  function handleRemove(column: Column) {
    apply((s) => removeColumn(s, column.id), { key: null })
    notify({ text: `Column “${column.name}” removed`, action: { label: 'Undo', run: undo } })
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
            {column.type === 'tag' && (
              <input
                type="color"
                aria-label={`Column ${i + 1} color`}
                title="Colour of the tag chips"
                value={column.color}
                onChange={(e) => apply((s) => setColumnColor(s, column.id, e.target.value))}
              />
            )}
            <button type="button" className="ghost" aria-label={`Move column ${i + 1} up`} disabled={i === 0} onClick={() => apply((s) => moveColumn(s, column.id, -1), { key: null })}>
              ↑
            </button>
            <button
              type="button"
              className="ghost"
              aria-label={`Move column ${i + 1} down`}
              disabled={i === columns.length - 1}
              onClick={() => apply((s) => moveColumn(s, column.id, 1), { key: null })}
            >
              ↓
            </button>
            <button type="button" className="ghost" aria-label={`Remove column ${i + 1}`} onClick={() => handleRemove(column)}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      <div>
        <button type="button" onClick={() => apply((s) => addColumn(s), { key: null })}>
          + Add column
        </button>
      </div>
    </section>
  )
}
