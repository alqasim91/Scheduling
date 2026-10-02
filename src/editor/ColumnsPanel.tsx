import type { Schedule } from '../model/schema.ts'
import { addColumn, moveColumn, removeColumn, renameColumn, setColumnColor } from './ops.ts'
import type { Apply } from './types.ts'

interface Props {
  schedule: Schedule
  apply: Apply
}

export function ColumnsPanel({ schedule, apply }: Props) {
  function handleRemove(id: string, name: string) {
    const used = schedule.items.filter((item) => item.columnIds.includes(id)).length
    if (used > 0 && !window.confirm(`Remove "${name}"? ${used} item(s) in it will be removed or shrunk.`)) return
    apply((s) => removeColumn(s, id))
  }

  return (
    <section className="panel" aria-labelledby="panel-columns">
      <h2 id="panel-columns">Columns</h2>
      <ul className="columns">
        {schedule.columns.map((column, i) => (
          <li key={column.id} className="columns__item">
            <input
              type="text"
              aria-label={`Column ${i + 1} name`}
              value={column.name}
              onChange={(e) => apply((s) => renameColumn(s, column.id, e.target.value))}
            />
            <input
              type="color"
              aria-label={`Column ${i + 1} color`}
              value={column.color}
              onChange={(e) => apply((s) => setColumnColor(s, column.id, e.target.value))}
            />
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
              disabled={i === schedule.columns.length - 1}
              onClick={() => apply((s) => moveColumn(s, column.id, 1))}
            >
              ↓
            </button>
            <button type="button" aria-label={`Remove column ${i + 1}`} onClick={() => handleRemove(column.id, column.name)}>
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
