import { useState } from 'react'
import type { Item, Schedule } from '../model/schema.ts'
import { newId } from '../model/ids.ts'
import { toMinutes } from '../model/time.ts'
import { ItemForm } from './ItemForm.tsx'
import { addItem, suggestSlot, trackColumns } from './ops.ts'
import type { Apply } from './types.ts'

interface Props {
  schedule: Schedule
  apply: Apply
}

function trackNames(schedule: Schedule, item: Item): string {
  const names = trackColumns(schedule)
    .filter((c) => item.columnIds.includes(c.id))
    .map((c) => c.name)
  return names.length > 1 ? `${names[0]} – ${names[names.length - 1]}` : (names[0] ?? '')
}

/** Sessions of the track grid as a list ordered by time; the form below edits the selected one. */
export function GridPanel({ schedule, apply }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = schedule.items.find((i) => i.id === selectedId) ?? null
  const items = [...schedule.items].sort((a, b) => toMinutes(a.start) - toMinutes(b.start) || a.id.localeCompare(b.id))
  const slot = suggestSlot(schedule)

  return (
    <section className="panel" aria-labelledby="panel-grid">
      <h2 id="panel-grid">Grid</h2>
      {items.length === 0 ? (
        <p className="field__hint">No sessions yet.</p>
      ) : (
        <ul className="sessions">
          {items.map((item) => {
            const track = trackColumns(schedule).find((c) => item.columnIds.includes(c.id))
            return (
              <li key={item.id} className="sessions__item" style={{ borderLeftColor: track?.color }}>
                <button type="button" aria-pressed={item.id === selectedId} onClick={() => setSelectedId(item.id === selectedId ? null : item.id)}>
                  <strong>{item.title || '(untitled)'}</strong>
                  <span>
                    {item.start} – {item.end}
                  </span>
                  <small>
                    {trackNames(schedule, item)} · {item.variant}
                  </small>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <button
        type="button"
        disabled={!slot}
        onClick={() => {
          if (!slot) return
          const id = newId('item')
          apply((s) => addItem(s, [slot.columnId], slot.start, slot.end, { id }))
          setSelectedId(id)
        }}
      >
        + Add session
      </button>
      {selected && <ItemForm schedule={schedule} item={selected} apply={apply} onClose={() => setSelectedId(null)} />}
    </section>
  )
}
