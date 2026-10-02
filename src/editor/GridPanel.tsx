import { useState } from 'react'
import type { Column, Item, Schedule } from '../model/schema.ts'
import { newId } from '../model/ids.ts'
import { ItemForm } from './ItemForm.tsx'
import { addItem, addRow, trackColumns } from './ops.ts'
import { RowHead } from './RowHead.tsx'
import type { Apply } from './types.ts'

interface Props {
  schedule: Schedule
  apply: Apply
}

interface CellPlan {
  /** Item whose origin cell this is, keyed `row:col`. */
  origins: Map<string, { item: Item; colSpan: number; rowSpan: number }>
  /** Cells covered by an origin cell's colSpan/rowSpan, which must be skipped. */
  covered: Set<string>
}

function planCells(schedule: Schedule, columns: Column[]): CellPlan {
  const origins: CellPlan['origins'] = new Map()
  const covered = new Set<string>()
  const rowIndex = new Map(schedule.rows.map((r, i) => [r.id, i]))
  const colIndex = new Map(columns.map((c, i) => [c.id, i]))
  for (const item of schedule.items) {
    const row = rowIndex.get(item.rowId)
    const cols = item.columnIds.map((id) => colIndex.get(id)).filter((i): i is number => i !== undefined)
    if (row === undefined || cols.length === 0) continue
    const first = Math.min(...cols)
    const last = Math.max(...cols)
    const key = `${row}:${first}`
    if (origins.has(key)) continue // overlapping legacy data: first one wins
    const rowSpan = Math.min(item.rowSpan ?? 1, schedule.rows.length - row)
    origins.set(key, { item, colSpan: last - first + 1, rowSpan })
    for (let r = row; r < row + rowSpan; r++) {
      for (let c = first; c <= last; c++) if (r !== row || c !== first) covered.add(`${r}:${c}`)
    }
  }
  return { origins, covered }
}

export function GridPanel({ schedule, apply }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = schedule.items.find((i) => i.id === selectedId) ?? null
  const columns = trackColumns(schedule)
  const plan = planCells(schedule, columns)

  return (
    <section className="panel" aria-labelledby="panel-grid">
      <h2 id="panel-grid">Grid</h2>
      <div className="grid-scroll">
        <table className="grid">
          <thead>
            <tr>
              <th scope="col">Time</th>
              {columns.map((column) => (
                <th key={column.id} scope="col" style={{ borderBottomColor: column.color }}>
                  {column.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {schedule.rows.map((row, i) => {
              const n = i + 1
              return (
                <tr key={row.id}>
                  <RowHead schedule={schedule} row={row} index={i} apply={apply} />
                  {columns.map((column, j) => {
                    const key = `${i}:${j}`
                    if (plan.covered.has(key)) return null
                    const origin = plan.origins.get(key)
                    if (!origin) {
                      return (
                        <td key={column.id} className="grid__cell">
                          <button
                            type="button"
                            className="grid__add"
                            aria-label={`+ Add item (row ${n}, ${column.name})`}
                            onClick={() => {
                              const id = newId('item')
                              apply((s) => addItem(s, row.id, column.id, { id }))
                              setSelectedId(id)
                            }}
                          >
                            + Add
                          </button>
                        </td>
                      )
                    }
                    const { item } = origin
                    const first = columns.find((c) => c.id === item.columnIds[0])
                    return (
                      <td
                        key={column.id}
                        className="grid__cell grid__cell--item"
                        colSpan={origin.colSpan}
                        rowSpan={origin.rowSpan}
                        style={{ borderLeftColor: first?.color }}
                      >
                        <button
                          type="button"
                          className="grid__item"
                          aria-pressed={item.id === selectedId}
                          onClick={() => setSelectedId(item.id === selectedId ? null : item.id)}
                        >
                          <strong>{item.title || '(untitled)'}</strong>
                          {item.speaker && <span>{item.speaker}</span>}
                          <small>{item.variant}</small>
                        </button>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={() => apply((s) => addRow(s))}>
        + Add row
      </button>
      {selected && <ItemForm schedule={schedule} item={selected} apply={apply} onClose={() => setSelectedId(null)} />}
    </section>
  )
}
