import { useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { Item, Schedule } from '../../model/schema.ts'
import { TIME_PATTERN } from '../../model/time.ts'
import { DraftInput } from '../DraftInput.tsx'
import { newId } from '../../model/ids.ts'
import { addSpeaker, resizeItem, setItemColumns, spanAllColumns, trackColumns, updateItem } from '../ops.ts'
import type { Apply } from '../types.ts'
import { SpeakerCombobox } from './SpeakerCombobox.tsx'

interface Props {
  schedule: Schedule
  item: Item
  /** Created a moment ago and not named yet: its title joins the creation's undo step. */
  newSession: boolean
  apply: Apply
  /** Close the editor (Esc, Enter in the title, click away). */
  onClose: () => void
  onDelete: () => void
}

/** Below this window width the editor is a bottom sheet. */
export const SHEET_PX = 600
const WIDTH = 300
const GAP = 8
const VARIANTS: ReadonlyArray<readonly [Item['variant'], string]> = [
  ['session', 'Session'],
  ['break', 'Break'],
  ['highlight', 'Highlight'],
]

/** The inline editor that opens next to a card. Every change applies to the schedule live. */
export function ItemPopover({ schedule, item, newSession, apply, onClose, onDelete }: Props) {
  const [more, setMore] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const title = useRef<HTMLInputElement>(null)
  const tracks = trackColumns(schedule)
  const spansAll = tracks.length > 0 && tracks.every((c) => item.columnIds.includes(c.id))
  const first = tracks.findIndex((c) => item.columnIds.includes(c.id))

  // Anchor beside the card (right, then left, then below) so it never covers the card it edits.
  // On a phone-sized screen it is a bottom sheet instead.
  useLayoutEffect(() => {
    const el = root.current
    // The popover is absolutely positioned inside the board's column area, next to its card.
    const container = el?.closest<HTMLElement>('.board__cols') ?? null
    const card = container?.querySelector<HTMLElement>(`[data-item-id="${item.id}"]`)
    if (!el || !card || !container) return
    const sheet = window.innerWidth < SHEET_PX
    el.classList.toggle('is-sheet', sheet)
    if (sheet) {
      el.style.left = ''
      el.style.top = ''
      return
    }
    let left = card.offsetLeft + card.offsetWidth + GAP
    let top = Math.max(0, card.offsetTop)
    if (left + WIDTH > container.clientWidth) left = card.offsetLeft - WIDTH - GAP
    if (left < 0) {
      // No room at either side: open under the card, as far left as the board allows.
      left = Math.max(0, Math.min(card.offsetLeft, container.clientWidth - WIDTH))
      top = card.offsetTop + card.offsetHeight + GAP
    }
    el.style.left = `${left}px`
    el.style.top = `${top}px`
  })

  // Open with the title ready to type.
  useLayoutEffect(() => {
    title.current?.focus({ preventScroll: true })
    title.current?.select()
    const el = root.current
    if (!el) return
    if (el.classList.contains('is-sheet')) {
      // Keep the card visible above the sheet.
      const card = el.closest('.board__cols')?.querySelector<HTMLElement>(`[data-item-id="${item.id}"]`)
      const viewport = el.closest<HTMLElement>('.board__viewport')
      if (card && viewport) {
        const overlap = card.getBoundingClientRect().bottom - (window.innerHeight - el.offsetHeight - 8)
        if (overlap > 0) viewport.scrollTop += overlap
      }
    } else {
      el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
    }
  }, [item.id])

  const refused = (op: (s: Schedule) => Schedule) => op(schedule) === schedule
  const startValid = (text: string) => text === item.start || (TIME_PATTERN.test(text) && !refused((s) => resizeItem(s, item.id, { start: text })))
  const endValid = (text: string) => text === item.end || (TIME_PATTERN.test(text) && !refused((s) => resizeItem(s, item.id, { end: text })))

  function handleKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
  }

  return (
    <div ref={root} className="board__popover" role="dialog" aria-label="Edit session" onKeyDown={handleKeyDown} data-popover data-more={more}>
      <label className="field">
        <span>Title</span>
        <input
          ref={title}
          type="text"
          dir="auto"
          value={item.title}
          placeholder="Session title"
          onChange={(e) =>
            apply((s) => updateItem(s, item.id, { title: e.target.value }), newSession ? { key: `new:${item.id}`, within: Infinity } : undefined)
          }
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onClose()
            }
          }}
        />
      </label>
      <SpeakerCombobox
        label="Speaker"
        value={item.speaker ?? ''}
        speakers={schedule.speakers}
        onChange={(text) => apply((s) => updateItem(s, item.id, { speaker: text }))}
        onAddNew={(name) => apply((s) => updateItem(addSpeaker(s, { id: newId('spk'), name }), item.id, { speaker: name }), { key: null })}
      />
      <div className="field" role="group" aria-label="Variant">
        <span>Variant</span>
        <div className="segmented">
          {VARIANTS.map(([variant, label]) => (
            <button key={variant} type="button" aria-pressed={item.variant === variant} onClick={() => apply((s) => updateItem(s, item.id, { variant }))}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="row2">
        <DraftInput
          label="Start"
          value={item.start}
          validate={startValid}
          hint="HH:MM, before the end and clear of other sessions."
          onCommit={(text) => apply((s) => resizeItem(s, item.id, { start: text }))}
        />
        <DraftInput
          label="End"
          value={item.end}
          validate={endValid}
          hint="HH:MM, after the start and clear of other sessions."
          onCommit={(text) => apply((s) => resizeItem(s, item.id, { end: text }))}
        />
      </div>
      <button type="button" className="ghost board__more-toggle" aria-expanded={more} onClick={() => setMore((m) => !m)}>
        {more ? 'Fewer options' : 'More options'}
      </button>
      <div className="board__popover-more">
      <label className="board__check">
        <input
          type="checkbox"
          checked={spansAll}
          disabled={tracks.length < 2 || (!spansAll && refused((s) => spanAllColumns(s, item.id)))}
          onChange={(e) =>
            apply((s) => (e.target.checked ? spanAllColumns(s, item.id) : setItemColumns(s, item.id, Math.max(0, first), Math.max(0, first))), { key: null })
          }
        />
        <span>Span all tracks</span>
      </label>
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
      <label className="field">
        <span>Note</span>
        <input
          type="text"
          dir="auto"
          value={item.note ?? ''}
          placeholder="Small line shown after this slot"
          onChange={(e) => apply((s) => updateItem(s, item.id, { note: e.target.value }))}
        />
      </label>
      </div>
      <div className="board__popover-actions">
        <button type="button" className="danger" onClick={onDelete}>
          Delete
        </button>
        <button type="button" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  )
}

