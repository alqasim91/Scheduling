import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Column } from '../../model/schema.ts'

interface Props {
  column: Column
  index: number
  renaming: boolean
  onStartRename: () => void
  onRename: (name: string) => void
  onStopRename: () => void
  onColor: (color: string) => void
  onDelete: () => void
  /** Pointer went down on the header itself (not on a control): the board turns it into a reorder drag. */
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void
}

const SWATCHES = ['#188038', '#0b57d0', '#f9ab00', '#d93025', '#a142f4', '#12b5cb', '#444746']

/** A track's column header: colour dot, name (double-click to rename), and a menu with colour and delete. */
export function TrackHeader({ column, index, renaming, onStartRename, onRename, onStopRename, onColor, onDelete, onPointerDown }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [draft, setDraft] = useState(column.name)
  const menu = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!renaming) return
    input.current?.focus()
    input.current?.select()
  }, [renaming])

  useEffect(() => {
    if (!menuOpen) return
    const away = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', away, true)
    return () => document.removeEventListener('pointerdown', away, true)
  }, [menuOpen])

  function commit() {
    const name = draft.trim()
    if (name !== '' && name !== column.name) onRename(name)
    onStopRename()
  }

  return (
    <div
      className="board-head"
      data-track-index={index}
      onPointerDown={(e) => {
        if ((e.target as Element).closest('button, input, .board-head__menu')) return
        onPointerDown(e)
      }}
      onDoubleClick={(e) => {
        if ((e.target as Element).closest('button, input, .board-head__menu')) return
        setDraft(column.name)
        onStartRename()
      }}
      title="Double-click to rename, drag to reorder"
    >
      <span className="board-head__dot" style={{ background: column.color }} aria-hidden="true" />
      {renaming ? (
        <input
          ref={input}
          className="board-head__input"
          type="text"
          dir="auto"
          aria-label={`Track ${index + 1} name`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              e.stopPropagation()
              onStopRename()
            }
          }}
        />
      ) : (
        <span className="board-head__name" dir="auto">
          {column.name || 'Untitled track'}
        </span>
      )}
      <div className="board-head__menu" ref={menu}>
        <button
          type="button"
          className="board-head__more"
          aria-label={`Track options: ${column.name}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          ⋯
        </button>
        {menuOpen && (
          <div
            className="board-head__pop"
            role="menu"
            aria-label={`${column.name} options`}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                setMenuOpen(false)
              }
            }}
          >
            <div className="board-head__swatches" role="group" aria-label="Colour">
              {SWATCHES.map((color) => (
                <button
                  key={color}
                  type="button"
                  className="board-head__swatch"
                  style={{ background: color }}
                  aria-label={`Colour ${color}`}
                  aria-pressed={column.color.toLowerCase() === color}
                  onClick={() => onColor(color)}
                />
              ))}
              <input type="color" aria-label="Custom colour" value={column.color} onChange={(e) => onColor(e.target.value)} />
            </div>
            <button
              type="button"
              role="menuitem"
              className="danger"
              onClick={() => {
                setMenuOpen(false)
                onDelete()
              }}
            >
              Delete track
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
