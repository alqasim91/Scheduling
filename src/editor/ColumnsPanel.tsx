import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { newId } from '../model/ids.ts'
import type { Column, Schedule } from '../model/schema.ts'
import { useNotify } from '../ui/notifyContext.ts'
import { runGesture, LONG_PRESS_MS } from './gesture.ts'
import { addColumn, moveTableColumnTo, removeColumn, renameColumn, setColumnColor, setColumnType, tableColumns } from './ops.ts'
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
const TYPE_LABEL = new Map(TYPE_OPTIONS)
const POPOVER_WIDTH = 280

/**
 * The table's own columns as one compact strip of chips (text, time, person, tag); track columns
 * are edited on the board's headers. Click a chip to rename it or change its type and colour,
 * drag chips (or press Alt+Arrow) to reorder. Removing is undoable, so it shows an Undo toast.
 */
export function ColumnStrip({ schedule, apply, undo }: Props) {
  const columns = tableColumns(schedule)
  const notify = useNotify()
  const [openId, setOpenId] = useState<string | null>(null)
  const [drag, setDrag] = useState<{ id: string; target: number } | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  /** A drag just ended on a chip: the click that follows it must not open the editor. */
  const swallowClick = useRef(false)

  function handleRemove(column: Column) {
    setOpenId(null)
    apply((s) => removeColumn(s, column.id), { key: null })
    notify({ text: `Column “${column.name}” removed`, action: { label: 'Undo', run: undo } })
  }

  function handleAdd() {
    const id = newId('col')
    apply((s) => addColumn(s, { id }), { key: null })
    setOpenId(id)
  }

  function chipEls(): HTMLElement[] {
    return [...(list.current?.querySelectorAll<HTMLElement>('[data-col-id]') ?? [])]
  }

  function handleChipDown(e: ReactPointerEvent<HTMLButtonElement>, column: Column, index: number) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const chips = chipEls()
    const chip = chips[index]
    if (!chip) return
    const centres = chips.map((el) => {
      const r = el.getBoundingClientRect()
      return r.left + r.width / 2
    })
    const startX = e.clientX
    const targetAt = (x: number): number => {
      let best = 0
      for (let i = 1; i < centres.length; i++) {
        if (Math.abs(x - (centres[i] as number)) < Math.abs(x - (centres[best] as number))) best = i
      }
      return best
    }
    runGesture(e, e.currentTarget, list.current, 0, {
      threshold: 5,
      holdMs: e.pointerType === 'touch' ? LONG_PRESS_MS : undefined,
      update: (pt) => {
        chip.style.transform = `translateX(${pt.x - startX}px)`
        chip.classList.add('is-dragging')
        setDrag({ id: column.id, target: targetAt(pt.x) })
      },
      finish: (pt, moved) => {
        chip.style.transform = ''
        chip.classList.remove('is-dragging')
        setDrag(null)
        if (!moved) return
        swallowClick.current = true
        window.setTimeout(() => (swallowClick.current = false), 0)
        const to = targetAt(pt.x)
        if (to !== index) apply((s) => moveTableColumnTo(s, column.id, to), { key: null })
      },
      cancel: () => {
        chip.style.transform = ''
        chip.classList.remove('is-dragging')
        setDrag(null)
      },
    })
  }

  function handleChipKey(e: ReactKeyboardEvent, column: Column, index: number) {
    if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
    e.preventDefault()
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl'
    const step = (e.key === 'ArrowRight') !== rtl ? 1 : -1
    apply((s) => moveTableColumnTo(s, column.id, index + step), { key: null })
  }

  const open = columns.find((c) => c.id === openId)
  const openIndex = open ? columns.indexOf(open) : -1

  return (
    <div className="chips" ref={root}>
      <ul className="chips__list" ref={list} aria-label="Table columns">
        {columns.map((column, i) => {
          const drop = drag && drag.id !== column.id && drag.target === i
          const dragIndex = drag ? columns.findIndex((c) => c.id === drag.id) : -1
          return (
            <li key={column.id} data-col-id={column.id} className={drop ? (dragIndex < i ? 'is-drop-after' : 'is-drop-before') : undefined}>
              <button
                type="button"
                className="chip"
                aria-haspopup="dialog"
                aria-expanded={openId === column.id}
                title="Click to edit, drag to reorder (or Alt+Arrow left/right)"
                onPointerDown={(e) => handleChipDown(e, column, i)}
                onKeyDown={(e) => handleChipKey(e, column, i)}
                onClick={() => {
                  if (swallowClick.current) return
                  setOpenId(openId === column.id ? null : column.id)
                }}
              >
                {column.type === 'tag' && <span className="chip__dot" aria-hidden="true" style={{ background: column.color }} />}
                <span className="chip__name" dir="auto">
                  {column.name}
                </span>
                <span className="chip__type">{TYPE_LABEL.get(column.type) ?? column.type}</span>
              </button>
            </li>
          )
        })}
        <li>
          <button type="button" className="chip chip--add" onClick={handleAdd}>
            + Column
          </button>
        </li>
      </ul>
      {open && <ColumnPopover key={open.id} column={open} number={openIndex + 1} anchor={() => list.current?.querySelector<HTMLElement>(`[data-col-id="${open.id}"]`) ?? null} root={root} apply={apply} onClose={() => setOpenId(null)} onRemove={() => handleRemove(open)} />}
    </div>
  )
}

interface PopoverProps {
  column: Column
  number: number
  anchor: () => HTMLElement | null
  root: React.RefObject<HTMLDivElement | null>
  apply: Apply
  onClose: () => void
  onRemove: () => void
}

/** The small editor under a chip: name, type and (for tags) colour. Changes apply live. */
function ColumnPopover({ column, number, anchor, root, apply, onClose, onRemove }: PopoverProps) {
  const box = useRef<HTMLDivElement>(null)
  const name = useRef<HTMLInputElement>(null)

  // Sit under the chip, kept inside the strip's width.
  useLayoutEffect(() => {
    const el = box.current
    const host = root.current
    const chip = anchor()
    if (!el || !host || !chip) return
    const h = host.getBoundingClientRect()
    const c = chip.getBoundingClientRect()
    const width = Math.min(POPOVER_WIDTH, h.width)
    const rtl = getComputedStyle(host).direction === 'rtl'
    const start = rtl ? h.right - c.right : c.left - h.left
    el.style.insetInlineStart = `${Math.max(0, Math.min(start, h.width - width))}px`
  })

  useLayoutEffect(() => {
    name.current?.focus({ preventScroll: true })
    name.current?.select()
  }, [])

  useEffect(() => {
    const away = (e: PointerEvent) => {
      const target = e.target as Node
      if (box.current?.contains(target)) return
      // The chip itself toggles the editor.
      if ((target as Element).closest?.('.chip')) return
      onClose()
    }
    document.addEventListener('pointerdown', away, true)
    return () => document.removeEventListener('pointerdown', away, true)
  }, [onClose])

  return (
    <div
      className="chip-pop"
      ref={box}
      role="dialog"
      aria-label={`Edit column ${number}`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        }
      }}
    >
      <label className="chip-pop__row">
        <span>Name</span>
        <input
          ref={name}
          type="text"
          dir="auto"
          aria-label={`Column ${number} name`}
          value={column.name}
          onChange={(e) => apply((s) => renameColumn(s, column.id, e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onClose()
          }}
        />
      </label>
      <label className="chip-pop__row">
        <span>Type</span>
        <select aria-label={`Column ${number} type`} value={column.type} onChange={(e) => apply((s) => setColumnType(s, column.id, e.target.value as Column['type']))}>
          {TYPE_OPTIONS.map(([type, label]) => (
            <option key={type} value={type}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {column.type === 'tag' && (
        <label className="chip-pop__row">
          <span>Colour</span>
          <input type="color" aria-label={`Column ${number} color`} title="Colour of the tag chips" value={column.color} onChange={(e) => apply((s) => setColumnColor(s, column.id, e.target.value))} />
        </label>
      )}
      <div className="chip-pop__foot">
        <button type="button" className="danger" aria-label={`Remove column ${number}`} onClick={onRemove}>
          Remove
        </button>
        <button type="button" className="primary" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  )
}
