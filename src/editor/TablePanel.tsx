import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { Column, Row, Schedule } from '../model/schema.ts'
import { TIME_PATTERN, toMinutes } from '../model/time.ts'
import { useNotify } from '../ui/notifyContext.ts'
import { runGesture } from './gesture.ts'
import { addRow, insertRowAfter, moveRow, moveRowTo, removeRow, setCell, setRowNote, setRowTimes, tableColumns } from './ops.ts'
import type { Apply } from './types.ts'

interface Props {
  schedule: Schedule
  apply: Apply
  undo: () => void
}

const SPEAKER_LIST_ID = 'table-speaker-names'

/** A cell input that keeps what you type until it is valid, like the form fields do. */
function DraftCell({ label, value, validate, onCommit, className }: { label: string; value: string; validate: (t: string) => boolean; onCommit: (t: string) => void; className?: string }) {
  const [draft, setDraft] = useState(value)
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    setDraft(value)
  }
  return (
    <input
      type="text"
      aria-label={label}
      className={className}
      value={draft}
      aria-invalid={!validate(draft)}
      onChange={(e) => {
        setDraft(e.target.value)
        if (validate(e.target.value)) onCommit(e.target.value)
      }}
      onBlur={() => {
        if (!validate(draft)) setDraft(value)
      }}
    />
  )
}

/**
 * Table-mode editor: a light spreadsheet. Inputs are borderless until hovered or focused, Tab and
 * Enter move between cells (Enter on the last row adds one), and rows reorder by their handle.
 */
export function TablePanel({ schedule, apply, undo }: Props) {
  const columns = tableColumns(schedule)
  const notify = useNotify()
  const body = useRef<HTMLTableSectionElement>(null)
  const [dragging, setDragging] = useState<{ id: string; target: number } | null>(null)
  /** Cell to focus after the next render (a row was just added). */
  const focusNext = useRef<{ row: number; col: string } | null>(null)

  useEffect(() => {
    const want = focusNext.current
    if (!want) return
    focusNext.current = null
    body.current?.querySelector<HTMLElement>(`[data-r="${want.row}"][data-c="${want.col}"]`)?.focus()
  })

  const rowCount = schedule.rows.length

  function focusCell(row: number, col: string): boolean {
    const el = body.current?.querySelector<HTMLElement>(`[data-r="${row}"][data-c="${col}"]`)
    if (!el) return false
    el.focus()
    return true
  }

  /** Enter goes down a row (Shift+Enter up); on the last row it adds a new one. */
  function handleEnter(e: ReactKeyboardEvent, row: number, col: string) {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
    e.preventDefault()
    const target = row + (e.shiftKey ? -1 : 1)
    if (target < 0) return
    if (target >= rowCount) {
      focusNext.current = { row: target, col }
      apply((s) => addRow(s), { key: null })
    } else focusCell(target, col)
  }

  function handleHandleDown(e: ReactPointerEvent<HTMLButtonElement>, row: Row, index: number) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const rows = [...(body.current?.querySelectorAll<HTMLTableRowElement>('tr[data-row-id]') ?? [])]
    const targetAt = (y: number): number => {
      let found = rows.length - 1
      for (let i = 0; i < rows.length; i++) {
        const rect = (rows[i] as HTMLElement).getBoundingClientRect()
        if (y < rect.top + rect.height / 2) {
          found = i
          break
        }
      }
      return found
    }
    runGesture(e, e.currentTarget, body.current?.closest('.main__scroll') as HTMLElement | null, 0, {
      threshold: 4,
      update: (pt) => setDragging({ id: row.id, target: targetAt(pt.y) }),
      finish: (pt, moved) => {
        setDragging(null)
        const to = targetAt(pt.y)
        if (moved && to !== index) apply((s) => moveRowTo(s, row.id, to), { key: null })
      },
      cancel: () => setDragging(null),
    })
  }

  function handleRemove(row: Row) {
    apply((s) => removeRow(s, row.id), { key: null })
    notify({ text: 'Row removed', action: { label: 'Undo', run: undo } })
  }

  return (
    <section className="table-section" aria-labelledby="panel-table">
      <h2 id="panel-table" className="sr-only">
        Table
      </h2>
      {columns.length === 0 && <p className="field__hint">Add a column above to start filling the table.</p>}
      <datalist id={SPEAKER_LIST_ID}>
        {schedule.speakers.map((s) => (
          <option key={s.id} value={s.name} />
        ))}
      </datalist>
      <div className="sheet-wrap">
        <table className="sheet">
          <thead>
            <tr>
              <th className="sheet__grip" aria-label="Reorder" />
              <th scope="col" className="sheet__time">
                Time
              </th>
              {columns.map((column) => (
                <th key={column.id} scope="col">
                  {column.name} <small>({column.type})</small>
                </th>
              ))}
              <th scope="col">Note</th>
              <th className="sheet__actions" aria-label="Row actions" />
            </tr>
          </thead>
          <tbody ref={body}>
            {schedule.rows.map((row, i) => {
              const n = i + 1
              const drop = dragging && dragging.id !== row.id && dragging.target === i
              const dragIndex = dragging ? schedule.rows.findIndex((r) => r.id === dragging.id) : -1
              return (
                <tr
                  key={row.id}
                  data-row-id={row.id}
                  className={[dragging?.id === row.id ? 'is-dragging' : '', drop ? (dragIndex < i ? 'is-drop-after' : 'is-drop-before') : ''].filter(Boolean).join(' ')}
                >
                  <td className="sheet__grip">
                    <button
                      type="button"
                      className="sheet__handle"
                      aria-label={`Drag to reorder row ${n}`}
                      title="Drag to reorder (or Alt+Arrow up/down)"
                      onPointerDown={(e) => handleHandleDown(e, row, i)}
                      onKeyDown={(e) => {
                        if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
                        e.preventDefault()
                        apply((s) => moveRow(s, row.id, e.key === 'ArrowUp' ? -1 : 1), { key: null })
                      }}
                    >
                      ⋮⋮
                    </button>
                  </td>
                  <td className="sheet__time">
                    <div className="sheet__time-inputs">
                      <DraftCell
                        label={`Row ${n} start`}
                        value={row.start}
                        validate={(t) => TIME_PATTERN.test(t) && toMinutes(t) < toMinutes(row.end)}
                        onCommit={(t) => apply((s) => setRowTimes(s, row.id, t, row.end))}
                      />
                      <span aria-hidden="true">–</span>
                      <DraftCell
                        label={`Row ${n} end`}
                        value={row.end}
                        validate={(t) => TIME_PATTERN.test(t) && toMinutes(t) > toMinutes(row.start)}
                        onCommit={(t) => apply((s) => setRowTimes(s, row.id, row.start, t))}
                      />
                    </div>
                  </td>
                  {columns.map((column) => (
                    <td key={column.id}>
                      <CellInput
                        column={column}
                        label={`${column.name} for row ${row.start}`}
                        value={row.cells?.[column.id] ?? ''}
                        r={i}
                        onEnter={handleEnter}
                        onChange={(v) => apply((s) => setCell(s, row.id, column.id, v))}
                      />
                    </td>
                  ))}
                  <td>
                    <input
                      type="text"
                      dir="auto"
                      aria-label={`Row ${n} note`}
                      data-r={i}
                      data-c="__note"
                      placeholder="Note"
                      value={row.note ?? ''}
                      onKeyDown={(e) => handleEnter(e, i, '__note')}
                      onChange={(e) => apply((s) => setRowNote(s, row.id, e.target.value))}
                    />
                  </td>
                  <td className="sheet__actions">
                    <button type="button" aria-label={`Insert row after row ${n}`} title="Insert row below" onClick={() => apply((s) => insertRowAfter(s, row.id), { key: null })}>
                      +
                    </button>
                    <button type="button" aria-label={`Remove row ${n}`} title="Remove row" onClick={() => handleRemove(row)}>
                      ✕
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="sheet-foot">
        <button type="button" onClick={() => apply((s) => addRow(s), { key: null })}>
          + Add row
        </button>
        <small className="field__hint">Tab and Enter move between cells; Enter on the last row adds one. Tags are comma-separated.</small>
      </div>
    </section>
  )
}

interface CellProps {
  column: Column
  label: string
  value: string
  r: number
  onEnter: (e: ReactKeyboardEvent, row: number, col: string) => void
  onChange: (v: string) => void
}

function CellInput({ column, label, value, r, onEnter, onChange }: CellProps) {
  const common = {
    'aria-label': label,
    'data-r': r,
    'data-c': column.id,
    value,
    onKeyDown: (e: ReactKeyboardEvent) => onEnter(e, r, column.id),
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
  }
  switch (column.type) {
    case 'time':
      return <input type="time" {...common} />
    case 'person':
      return <input type="text" dir="auto" list={SPEAKER_LIST_ID} {...common} />
    case 'tag':
      return <input type="text" dir="auto" placeholder="comma-separated" {...common} />
    default:
      return <input type="text" dir="auto" {...common} />
  }
}
