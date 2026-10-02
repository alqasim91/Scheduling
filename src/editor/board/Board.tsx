import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { newId } from '../../model/ids.ts'
import type { Schedule } from '../../model/schema.ts'
import { toMinutes } from '../../model/time.ts'
import {
  addColumn,
  addItem,
  duplicateItem,
  moveColumnTo,
  moveItem,
  removeColumn,
  removeItem,
  renameColumn,
  resizeItem,
  setColumnColor,
  setItemColumns,
  suggestSlot,
  trackColumns,
} from '../ops.ts'
import type { Apply } from '../types.ts'
import {
  DRAG_THRESHOLD_PX,
  ZOOMS,
  columnAt,
  fitRange,
  formatMinutes,
  hourMarks,
  minutesToY,
  previewClick,
  previewCreate,
  previewMove,
  previewResize,
  previewSpan,
  yToMinutes,
  type Extent,
  type Preview,
  type Zoom,
} from './geometry.ts'
import { ItemPopover } from './ItemPopover.tsx'
import { layoutCards, type CardLayout } from './layout.ts'
import { TrackHeader } from './TrackHeader.tsx'
import './board.css'

interface Props {
  schedule: Schedule
  apply: Apply
  undo: () => void
  /** Cancel a session that was just created: back to the schedule as it was before. */
  rollbackTo: (snapshot: Schedule) => void
}

const ZOOM_KEY = 'schedule-builder:board-zoom'
const TOAST_MS = 6000
const EDGE_ZONE = 48
const MAX_SCROLL_SPEED = 22

function readZoom(): Zoom {
  try {
    const stored = window.localStorage.getItem(ZOOM_KEY)
    if (stored === 'compact' || stored === 'comfortable') return stored
  } catch {
    // Storage may be unavailable; the default is fine.
  }
  return 'comfortable'
}

interface Pt {
  x: number
  y: number
}

interface GestureHandlers {
  /** Pixels the pointer must travel before it counts as a drag (0 = immediately). */
  threshold: number
  update: (pt: Pt, dragging: boolean) => void
  /** The pointer was released. `dragging` is false for a plain click. */
  finish: (pt: Pt, dragging: boolean) => void
  /** Esc, or the browser took the pointer away (touch scrolling): undo any visual effect. */
  cancel: () => void
}

/**
 * Every pointer gesture goes through here: capture the pointer on `target`, call `update` while it
 * moves, auto-scroll the viewport near its edges, and end on release or cancel on Esc. Nothing is
 * committed to state in here; the handlers decide that on `finish`.
 */
function runGesture(e: ReactPointerEvent, target: HTMLElement, viewport: HTMLElement | null, headerHeight: number, h: GestureHandlers) {
  const pointerId = e.pointerId
  let pt: Pt = { x: e.clientX, y: e.clientY }
  const origin = pt
  let dragging = h.threshold === 0
  let raf = 0
  let done = false
  try {
    target.setPointerCapture?.(pointerId)
  } catch {
    // The pointer may already be gone; the window listeners below still work.
  }

  const end = () => {
    done = true
    cancelAnimationFrame(raf)
    target.removeEventListener('pointermove', onMove)
    target.removeEventListener('pointerup', onUp)
    target.removeEventListener('pointercancel', onCancel)
    window.removeEventListener('keydown', onKey, true)
    viewport?.removeEventListener('scroll', onScroll)
    try {
      target.releasePointerCapture?.(pointerId)
    } catch {
      // Already released.
    }
  }
  const onMove = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return
    pt = { x: ev.clientX, y: ev.clientY }
    if (!dragging && Math.hypot(pt.x - origin.x, pt.y - origin.y) > h.threshold) dragging = true
    if (dragging) h.update(pt, true)
  }
  // Scrolling with the wheel mid-drag moves the board under a still pointer: refresh the preview.
  const onScroll = () => {
    if (dragging && !done) h.update(pt, true)
  }
  const onUp = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return
    pt = { x: ev.clientX, y: ev.clientY }
    end()
    h.finish(pt, dragging)
  }
  const onCancel = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return
    end()
    h.cancel()
  }
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape') return
    ev.preventDefault()
    ev.stopPropagation()
    end()
    h.cancel()
  }
  // Scroll the board while the pointer rests near an edge, re-running the preview each frame.
  const loop = () => {
    if (done) return
    if (dragging && viewport) {
      const rect = viewport.getBoundingClientRect()
      const speed = (d: number) => Math.min(MAX_SCROLL_SPEED, (Math.max(0, d) / EDGE_ZONE) * MAX_SCROLL_SPEED)
      const top = rect.top + headerHeight
      let dy = 0
      let dx = 0
      if (pt.y < top + EDGE_ZONE) dy = -speed(top + EDGE_ZONE - pt.y)
      else if (pt.y > rect.bottom - EDGE_ZONE) dy = speed(pt.y - (rect.bottom - EDGE_ZONE))
      if (pt.x < rect.left + EDGE_ZONE) dx = -speed(rect.left + EDGE_ZONE - pt.x)
      else if (pt.x > rect.right - EDGE_ZONE) dx = speed(pt.x - (rect.right - EDGE_ZONE))
      if (dx !== 0 || dy !== 0) {
        const before = { left: viewport.scrollLeft, top: viewport.scrollTop }
        viewport.scrollLeft += dx
        viewport.scrollTop += dy
        if (viewport.scrollLeft !== before.left || viewport.scrollTop !== before.top) h.update(pt, true)
      }
    }
    raf = requestAnimationFrame(loop)
  }
  target.addEventListener('pointermove', onMove)
  target.addEventListener('pointerup', onUp)
  target.addEventListener('pointercancel', onCancel)
  window.addEventListener('keydown', onKey, true)
  viewport?.addEventListener('scroll', onScroll, { passive: true })
  raf = requestAnimationFrame(loop)
}

function trackLabel(schedule: Schedule, card: CardLayout): string {
  const tracks = trackColumns(schedule)
  const names = tracks.slice(card.first, card.last + 1).map((c) => c.name || 'Untitled track')
  return names.join(' + ')
}

interface Toast {
  id: number
  text: string
}

/**
 * The calendar-style board: time runs down the page, tracks are columns, sessions are cards you
 * create (drag on empty space), move, and resize with the pointer or the keyboard.
 */
export function Board({ schedule, apply, undo, rollbackTo }: Props) {
  const [zoom, setZoom] = useState<Zoom>(readZoom)
  const [extra, setExtra] = useState({ before: 0, after: 0 })
  const [pickedId, setSelectedId] = useState<string | null>(null)
  const [openId, setEditingId] = useState<string | null>(null)
  const [pending, setPending] = useState<{ id: string; snapshot: Schedule } | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const tracks = useMemo(() => trackColumns(schedule), [schedule])
  const ids = useMemo(() => tracks.map((c) => c.id), [tracks])
  const cards = useMemo(() => layoutCards(schedule.items, ids), [schedule.items, ids])
  const range = useMemo(() => fitRange(cards.map((c) => c.item), extra), [cards, extra])
  const ppm = ZOOMS[zoom]
  const height = (range.end - range.start) * ppm
  const n = tracks.length
  // A selection or editor for something that no longer exists (undo, delete) simply is not there.
  const selectedId = schedule.items.some((i) => i.id === pickedId) ? pickedId : null
  const editingId = schedule.items.some((i) => i.id === openId) ? openId : null
  // Forget what vanished for good, so undoing and redoing a deletion does not resurrect an open editor.
  if (pickedId !== null && selectedId === null) setSelectedId(null)
  if (openId !== null && editingId === null) {
    setEditingId(null)
    setPending(null)
  }

  const viewportRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const headsRef = useRef<HTMLDivElement>(null)
  const colsRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const previewLabelRef = useRef<HTMLSpanElement>(null)
  const markerRef = useRef<HTMLDivElement>(null)
  const cardEls = useRef(new Map<string, HTMLElement>())
  const ignoreDown = useRef<Event | null>(null)
  const focusAfter = useRef<string | null>(null)
  const scrollShift = useRef(0)
  const moved = useRef<string | null>(null)
  const announceCount = useRef(0)

  // What the gesture handlers read: always the latest render's values, never a stale closure.
  const live = useRef({ schedule, ids, range, ppm, cards, selectedId, editingId, pending })
  useLayoutEffect(() => {
    live.current = { schedule, ids, range, ppm, cards, selectedId, editingId, pending }
  })

  const announce = useCallback((message: string) => {
    announceCount.current += 1
    // A trailing zero-width space makes a repeated message count as a change for screen readers.
    setAnnouncement(announceCount.current % 2 === 0 ? `${message}\u200b` : message)
  }, [])

  const toastBase = useRef<Schedule | null>(null)
  const showToast = useCallback((text: string) => {
    toastBase.current = null
    setToast({ id: Date.now(), text })
  }, [])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [toast])
  // The toast's Undo takes back the deletion, so it goes away if anything else changes first.
  useEffect(() => {
    if (!toast) return
    if (toastBase.current === null) toastBase.current = schedule
    else if (toastBase.current !== schedule) setToast(null)
  }, [toast, schedule])

  useEffect(() => {
    try {
      window.localStorage.setItem(ZOOM_KEY, zoom)
    } catch {
      // Remembering the zoom is a convenience only.
    }
  }, [zoom])

  // Keep the view where it was when "Earlier" adds an hour above it.
  useLayoutEffect(() => {
    if (scrollShift.current !== 0 && viewportRef.current) viewportRef.current.scrollTop += scrollShift.current
    scrollShift.current = 0
  }, [range.start])

  // Focus a card after the render that creates or restores it; keep a keyboard-moved card in view.
  useEffect(() => {
    if (focusAfter.current) {
      const el = cardEls.current.get(focusAfter.current)
      if (el) el.focus({ preventScroll: true })
      focusAfter.current = null
    }
    if (moved.current) {
      cardEls.current.get(moved.current)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
      moved.current = null
    }
  })

  /* ---------- previews (direct DOM writes, no React state while dragging) ---------- */

  const showPreview = useCallback((p: Preview, kind: 'create' | 'move' | 'resize' = 'move') => {
    const el = previewRef.current
    const { ids: trackIds, range: r, ppm: scale } = live.current
    if (!el) return
    const count = Math.max(1, trackIds.length)
    el.style.display = 'block'
    el.style.left = `calc(${(p.first * 100) / count}% + 3px)`
    el.style.width = `calc(${((p.last - p.first + 1) * 100) / count}% - 6px)`
    el.style.height = `${Math.max(2, (p.end - p.start) * scale)}px`
    el.style.transform = `translate3d(0, ${minutesToY(p.start, r.start, scale)}px, 0)`
    el.classList.toggle('is-invalid', !p.valid)
    el.dataset.kind = kind
    const label = previewLabelRef.current
    if (label) label.textContent = `${formatMinutes(p.start)} – ${formatMinutes(p.end)}`
  }, [])

  const hidePreview = useCallback(() => {
    const el = previewRef.current
    if (el) el.style.display = 'none'
    const marker = markerRef.current
    if (marker) marker.style.display = 'none'
    for (const card of cardEls.current.values()) card.classList.remove('is-dragging')
  }, [])

  /* ---------- editing helpers ---------- */

  /** Apply an op only when it would change something; says whether it did. */
  const commit = useCallback(
    (op: (s: Schedule) => Schedule, key: string | null = null, within?: number): boolean => {
      if (op(live.current.schedule) === live.current.schedule) return false
      apply(op, { key, within })
      return true
    },
    [apply],
  )

  const closeEditor = useCallback(
    (restoreFocus: boolean) => {
      const { editingId: id, pending: p, schedule: s } = live.current
      if (id === null) return
      setEditingId(null)
      setPending(null)
      if (p && p.id === id) {
        const item = s.items.find((i) => i.id === id)
        if (!item || item.title.trim() === '') {
          // A new session nobody named is a cancelled one: leave no trace in the history.
          rollbackTo(p.snapshot)
          setSelectedId(null)
          announce('Session discarded')
          return
        }
      }
      if (restoreFocus) focusAfter.current = id
    },
    [announce, rollbackTo],
  )

  // Click away closes the editor (and the click then does only that).
  useEffect(() => {
    if (editingId === null) return
    const away = (ev: PointerEvent) => {
      if ((ev.target as Element | null)?.closest('[data-popover]')) return
      ignoreDown.current = ev
      closeEditor(false)
    }
    document.addEventListener('pointerdown', away, true)
    return () => document.removeEventListener('pointerdown', away, true)
  }, [editingId, closeEditor])

  const deleteItem = useCallback(
    (id: string) => {
      const { pending: p } = live.current
      setEditingId(null)
      setPending(null)
      setSelectedId(null)
      if (p && p.id === id) {
        rollbackTo(p.snapshot)
        announce('Session discarded')
        return
      }
      if (commit((s) => removeItem(s, id))) {
        showToast('Session deleted')
        announce('Session deleted. Press Undo to bring it back.')
      }
    },
    [announce, commit, rollbackTo, showToast],
  )

  const createSession = useCallback(
    (p: Preview) => {
      const { ids: trackIds, schedule: before } = live.current
      const id = newId('item')
      const columns = trackIds.slice(p.first, p.last + 1)
      // Naming the new session joins this step, so one Undo removes the whole thing.
      if (!commit((s) => addItem(s, columns, formatMinutes(p.start), formatMinutes(p.end), { id, title: '' }), `new:${id}`, Infinity)) {
        announce('There is no room for a session there')
        return
      }
      setSelectedId(id)
      setEditingId(id)
      setPending({ id, snapshot: before })
      announce(`New session, ${formatMinutes(p.start)} to ${formatMinutes(p.end)}. Type a title.`)
    },
    [announce, commit],
  )

  const addAtSuggestedSlot = useCallback(() => {
    const slot = suggestSlot(live.current.schedule)
    if (!slot) return announce('There is no room for another session')
    const index = live.current.ids.indexOf(slot.columnId)
    createSession({ start: toMinutes(slot.start), end: toMinutes(slot.end), first: index, last: index, valid: true })
  }, [announce, createSession])

  /* ---------- geometry from the DOM ---------- */

  /** Converters for the columns area as it is right now (it moves when the board scrolls). */
  function frame() {
    const cols = colsRef.current
    const { range: r, ppm: scale, ids: trackIds } = live.current
    const rect = cols?.getBoundingClientRect() ?? { top: 0, left: 0, width: 0 }
    return {
      minutes: (clientY: number) => yToMinutes(clientY - rect.top, r.start, scale),
      column: (clientX: number) => columnAt(clientX, rect.left, rect.width, trackIds.length),
    }
  }

  const headerHeight = () => headRef.current?.offsetHeight ?? 0

  /* ---------- create: pointer down on empty space ---------- */

  function handleColumnsPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if ((e.target as Element).closest('.board-card, [data-popover]')) return
    if (ignoreDown.current === e.nativeEvent) {
      ignoreDown.current = null
      return
    }
    const { ids: trackIds } = live.current
    if (trackIds.length === 0 || !colsRef.current) return
    const f = frame()
    const anchor = { minutes: f.minutes(e.clientY), column: f.column(e.clientX) }
    setSelectedId(null)
    runGesture(e, colsRef.current, viewportRef.current, headerHeight(), {
      threshold: DRAG_THRESHOLD_PX,
      update: (pt) => {
        const g = frame()
        showPreview(previewCreate(live.current.schedule.items, trackIds, anchor, { minutes: g.minutes(pt.y), column: g.column(pt.x) }), 'create')
      },
      finish: (pt, dragging) => {
        hidePreview()
        const g = frame()
        const items = live.current.schedule.items
        const p = dragging ? previewCreate(items, trackIds, anchor, { minutes: g.minutes(pt.y), column: g.column(pt.x) }) : previewClick(items, trackIds, anchor)
        if (!p.valid) {
          announce('There is no room for a session there')
          return
        }
        createSession(p)
      },
      cancel: hidePreview,
    })
  }

  /* ---------- move and resize: pointer down on a card ---------- */

  function handleCardPointerDown(e: ReactPointerEvent<HTMLDivElement>, card: CardLayout) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const element = e.currentTarget
    const id = card.item.id
    setSelectedId(id)
    const handle = (e.target as HTMLElement).closest<HTMLElement>('[data-handle]')
    const edge = handle?.dataset.handle as 'top' | 'bottom' | 'left' | 'right' | undefined
    const original: Extent = { start: toMinutes(card.item.start), end: toMinutes(card.item.end), first: card.first, last: card.last }
    const trackIds = live.current.ids
    const f0 = frame()
    const itemOf = () => live.current.schedule.items.find((i) => i.id === id) ?? card.item

    if (edge) {
      const target = handle as HTMLElement
      runGesture(e, target, viewportRef.current, headerHeight(), {
        threshold: 0,
        update: (pt) => {
          const g = frame()
          const p =
            edge === 'top' || edge === 'bottom'
              ? previewResize(live.current.schedule.items, trackIds, itemOf(), original, edge, g.minutes(pt.y))
              : previewSpan(live.current.schedule.items, trackIds, itemOf(), original, edge, g.column(pt.x))
          element.classList.add('is-dragging')
          showPreview(p, 'resize')
        },
        finish: (pt) => {
          hidePreview()
          const g = frame()
          const items = live.current.schedule.items
          if (edge === 'top' || edge === 'bottom') {
            const p = previewResize(items, trackIds, itemOf(), original, edge, g.minutes(pt.y))
            const change = edge === 'top' ? { start: formatMinutes(p.start) } : { end: formatMinutes(p.end) }
            if (commit((s) => resizeItem(s, id, change))) announce(`${edge === 'top' ? 'Starts' : 'Ends'} at ${formatMinutes(edge === 'top' ? p.start : p.end)}`)
          } else {
            const p = previewSpan(items, trackIds, itemOf(), original, edge, g.column(pt.x))
            if (commit((s) => setItemColumns(s, id, p.first, p.last))) {
              announce(`Now spans ${tracks.slice(p.first, p.last + 1).map((c) => c.name).join(' and ')}`)
            }
          }
        },
        cancel: hidePreview,
      })
      return
    }

    const downMinutes = f0.minutes(e.clientY)
    const downColumn = f0.column(e.clientX)
    const previewAt = (pt: Pt): Preview => {
      const g = frame()
      return previewMove(live.current.schedule.items, trackIds, itemOf(), original, g.minutes(pt.y) - downMinutes, g.column(pt.x) - downColumn)
    }
    runGesture(e, element, viewportRef.current, headerHeight(), {
      threshold: DRAG_THRESHOLD_PX,
      update: (pt) => {
        element.classList.add('is-dragging')
        showPreview(previewAt(pt), 'move')
      },
      finish: (pt, dragging) => {
        hidePreview()
        if (!dragging) return
        const p = previewAt(pt)
        if (!p.valid) {
          announce(`That spot is taken, so it stays at ${card.item.start}`)
          return
        }
        if (commit((s) => moveItem(s, id, formatMinutes(p.start), trackIds[p.first] as string))) {
          announce(`Moved to ${formatMinutes(p.start)}, ${tracks.slice(p.first, p.last + 1).map((c) => c.name).join(' and ')}`)
        }
      },
      cancel: hidePreview,
    })
  }

  /* ---------- keyboard on a card ---------- */

  function handleCardKeyDown(e: ReactKeyboardEvent<HTMLDivElement>, card: CardLayout) {
    if (e.target !== e.currentTarget) return
    const id = card.item.id
    const item = live.current.schedule.items.find((i) => i.id === id)
    if (!item) return
    const start = toMinutes(item.start)
    const end = toMinutes(item.end)
    const key = `kbd:${id}`
    const mod = e.metaKey || e.ctrlKey

    if (mod && e.key.toLowerCase() === 'd') {
      e.preventDefault()
      const copyId = newId('item')
      if (commit((s) => duplicateItem(s, id, copyId))) {
        setSelectedId(copyId)
        focusAfter.current = copyId
        moved.current = copyId
        const copy = live.current.schedule.items.find((i) => i.id === copyId)
        announce(copy ? `Duplicated to ${copy.start}` : 'Duplicated')
      } else announce('There is no room below to duplicate into')
      return
    }
    if (mod || e.altKey) return

    switch (e.key) {
      case 'Enter':
        e.preventDefault()
        setEditingId(id)
        return
      case 'Delete':
      case 'Backspace':
        e.preventDefault()
        deleteItem(id)
        return
      case 'ArrowUp':
      case 'ArrowDown': {
        e.preventDefault()
        const delta = e.key === 'ArrowUp' ? -5 : 5
        if (e.shiftKey) {
          const next = end + delta
          if (next > 1439 || next < 0) return announce("Can't resize further")
          if (commit((s) => resizeItem(s, id, { end: formatMinutes(next) }), key)) {
            moved.current = id
            announce(`Ends at ${formatMinutes(next)}`)
          } else announce("Can't resize further")
        } else {
          const next = start + delta
          if (next < 0 || next + (end - start) > 1439) return announce("Can't move further")
          if (commit((s) => moveItem(s, id, formatMinutes(next), 0), key)) {
            moved.current = id
            announce(`Moved to ${formatMinutes(next)}, ${trackLabel(live.current.schedule, card)}`)
          } else announce("Can't move there, another session is in the way")
        }
        return
      }
      case 'ArrowLeft':
      case 'ArrowRight': {
        e.preventDefault()
        const delta = e.key === 'ArrowLeft' ? -1 : 1
        if (commit((s) => moveItem(s, id, item.start, delta), key)) {
          moved.current = id
          // `live` still holds the previous render, so describe the destination from the delta.
          const first = card.first + delta
          announce(`Moved to ${item.start}, ${tracks.slice(first, first + card.last - card.first + 1).map((c) => c.name).join(' and ')}`)
        } else announce("Can't move to that track, it is taken or off the board")
        return
      }
      default:
    }
  }

  /* ---------- track header gestures ---------- */

  function handleHeaderPointerDown(e: ReactPointerEvent<HTMLDivElement>, index: number) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const element = e.currentTarget
    const heads = headsRef.current
    if (!heads) return
    const column = tracks[index]
    if (!column) return
    const startX = e.clientX
    const targetOf = (x: number) => {
      const rect = heads.getBoundingClientRect()
      return columnAt(x, rect.left, rect.width, live.current.ids.length)
    }
    const reset = () => {
      element.style.transform = ''
      element.style.zIndex = ''
      element.classList.remove('is-dragging')
      hidePreview()
    }
    runGesture(e, element, viewportRef.current, 0, {
      threshold: DRAG_THRESHOLD_PX,
      update: (pt) => {
        element.classList.add('is-dragging')
        element.style.transform = `translate3d(${pt.x - startX}px, 0, 0)`
        element.style.zIndex = '4'
        const marker = markerRef.current
        const rect = heads.getBoundingClientRect()
        if (marker) {
          const target = targetOf(pt.x)
          marker.style.display = 'block'
          marker.style.left = `${((target + (target > index ? 1 : 0)) * rect.width) / Math.max(1, live.current.ids.length)}px`
        }
      },
      finish: (pt, dragging) => {
        const target = targetOf(pt.x)
        reset()
        if (!dragging || target === index) return
        if (commit((s) => moveColumnTo(s, column.id, target))) announce(`Moved ${column.name} to position ${target + 1}`)
      },
      cancel: reset,
    })
  }

  function addTrack() {
    const id = newId('col')
    if (commit((s) => addColumn(s, { id }))) {
      setRenamingId(id)
      announce('Track added')
    }
  }

  function deleteTrack(id: string, name: string) {
    if (commit((s) => removeColumn(s, id))) {
      showToast('Track deleted')
      announce(`Track ${name} deleted. Press Undo to bring it back.`)
    }
  }

  function extendRange(side: 'before' | 'after') {
    if (side === 'before') scrollShift.current = Math.min(60, range.start) * ppm
    setExtra((e) => ({ ...e, [side]: e[side] + 60 }))
  }

  /* ---------- render ---------- */

  const template = `repeat(${n}, minmax(var(--board-col-min), 1fr))`
  const editing = editingId === null ? null : schedule.items.find((i) => i.id === editingId) ?? null
  const hourLines = {
    backgroundImage: 'linear-gradient(var(--board-hour) 1px, transparent 1px), linear-gradient(var(--board-quarter) 1px, transparent 1px)',
    backgroundSize: `100% ${60 * ppm}px, 100% ${15 * ppm}px`,
  }

  return (
    <section className="panel board" aria-labelledby="panel-grid" style={{ ['--board-ppm' as string]: ppm }}>
      <div className="board__bar">
        <h2 id="panel-grid">Grid</h2>
        <button type="button" onClick={addAtSuggestedSlot} disabled={n === 0}>
          + Add session
        </button>
        <div className="board__zoom" role="group" aria-label="Zoom">
          {(['compact', 'comfortable'] as const).map((z) => (
            <button key={z} type="button" aria-pressed={zoom === z} onClick={() => setZoom(z)}>
              {z === 'compact' ? 'Compact' : 'Comfortable'}
            </button>
          ))}
        </div>
      </div>

      <div className="board__viewport" ref={viewportRef}>
        <div className="board__canvas" dir="ltr" style={{ ['--board-n' as string]: Math.max(2, n) }}>
          <div className="board__row board__head" ref={headRef}>
            <div className="board__corner" />
            <div className="board__heads" ref={headsRef} style={{ gridTemplateColumns: n > 0 ? template : '1fr' }}>
              {tracks.map((column, i) => (
                <TrackHeader
                  key={column.id}
                  column={column}
                  index={i}
                  renaming={renamingId === column.id}
                  onStartRename={() => setRenamingId(column.id)}
                  onStopRename={() => setRenamingId((current) => (current === column.id ? null : current))}
                  onRename={(name) => commit((s) => renameColumn(s, column.id, name), `rename:${column.id}`)}
                  onColor={(color) => apply((s) => setColumnColor(s, column.id, color))}
                  onDelete={() => deleteTrack(column.id, column.name)}
                  onPointerDown={(e) => handleHeaderPointerDown(e, i)}
                />
              ))}
              <div className="board__marker" ref={markerRef} aria-hidden="true" />
            </div>
            <div className="board__add">
              <button type="button" onClick={addTrack}>
                + Track
              </button>
            </div>
          </div>

          <div className="board__row board__more-row">
            <div />
            <button type="button" className="board__more" onClick={() => extendRange('before')} disabled={range.start === 0}>
              ↑ Earlier
            </button>
            <div />
          </div>

          <div className="board__row board__body">
            <div className="board__gutter" style={{ height }} aria-hidden="true">
              {hourMarks(range).map((m) => (
                <span key={m} className={m === range.start ? 'board__hour board__hour--first' : 'board__hour'} style={{ top: minutesToY(m, range.start, ppm) }}>
                  {formatMinutes(m)}
                </span>
              ))}
            </div>

            <div
              className="board__cols"
              ref={colsRef}
              style={{ height }}
              data-range-start={range.start}
              data-ppm={ppm}
              data-tracks={n}
              onPointerDown={handleColumnsPointerDown}
            >
              <div className="board__lines" style={{ ...hourLines, gridTemplateColumns: n > 0 ? template : '1fr' }} aria-hidden="true">
                {tracks.map((column) => (
                  <div key={column.id} className="board__col" />
                ))}
              </div>

              {cards.map((card) => {
                const { item } = card
                const dur = toMinutes(item.end) - toMinutes(item.start)
                const h = dur * ppm
                const size = dur <= 20 || h < 38 ? 'xs' : h < 70 ? 'sm' : 'md'
                const track = tracks[card.first]
                const label = `${item.title.trim() || 'Untitled session'}, ${item.start} to ${item.end}, ${trackLabel(schedule, card)}`
                return (
                  <div
                    key={item.id}
                    ref={(el) => {
                      if (el) cardEls.current.set(item.id, el)
                      else cardEls.current.delete(item.id)
                    }}
                    className={`board-card board-card--${item.variant} board-card--${size}${selectedId === item.id ? ' is-selected' : ''}`}
                    role="button"
                    tabIndex={0}
                    aria-label={label}
                    aria-pressed={selectedId === item.id}
                    aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Shift+ArrowUp Shift+ArrowDown Enter Delete Control+D"
                    data-item-id={item.id}
                    style={{
                      top: minutesToY(toMinutes(item.start), range.start, ppm),
                      height: Math.max(2, h - 1),
                      left: `calc(${(card.first * 100) / Math.max(1, n)}% + 3px)`,
                      width: `calc(${((card.last - card.first + 1) * 100) / Math.max(1, n)}% - 6px)`,
                      ['--c' as string]: track?.color ?? '#888888',
                    }}
                    onPointerDown={(e) => handleCardPointerDown(e, card)}
                    onKeyDown={(e) => handleCardKeyDown(e, card)}
                    onDoubleClick={() => setEditingId(item.id)}
                    onFocus={() => setSelectedId(item.id)}
                  >
                    <span className="board-card__handle board-card__handle--top" data-handle="top" aria-hidden="true" />
                    <span className="board-card__handle board-card__handle--bottom" data-handle="bottom" aria-hidden="true" />
                    <span className="board-card__handle board-card__handle--left" data-handle="left" aria-hidden="true" />
                    <span className="board-card__handle board-card__handle--right" data-handle="right" aria-hidden="true" />
                    <div className="board-card__text" dir="auto">
                      <strong className={item.title.trim() ? '' : 'board-card__empty'}>{item.title.trim() || 'Untitled session'}</strong>
                      {size === 'xs' ? (
                        <span className="board-card__time">
                          {item.start}–{item.end}
                        </span>
                      ) : (
                        <>
                          {item.speaker && size === 'md' && <span className="board-card__speaker">{item.speaker}</span>}
                          <span className="board-card__time">
                            {item.start} – {item.end}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}

              <div className="board__preview" ref={previewRef} aria-hidden="true">
                <span className="board__preview-label" ref={previewLabelRef} />
              </div>

              {editing && (
                <ItemPopover
                  schedule={schedule}
                  item={editing}
                  newSession={pending?.id === editing.id}
                  apply={apply}
                  onClose={() => closeEditor(true)}
                  onDelete={() => deleteItem(editing.id)}
                />
              )}

              {n === 0 && <p className="board__hint">Add a track to start scheduling</p>}
              {n > 0 && cards.length === 0 && !editing && <p className="board__hint">Drag on the board to add a session</p>}
            </div>
            <div />
          </div>

          <div className="board__row board__more-row">
            <div />
            <button type="button" className="board__more" onClick={() => extendRange('after')} disabled={range.end === 1440}>
              ↓ Later
            </button>
            <div />
          </div>
        </div>
      </div>

      <div className="board__live" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      {toast && (
        <div className="board__toast" role="status" key={toast.id}>
          <span>{toast.text}</span>
          <span aria-hidden="true"> · </span>
          <button
            type="button"
            onClick={() => {
              undo()
              setToast(null)
              announce('Restored')
            }}
          >
            Undo
          </button>
        </div>
      )}
    </section>
  )
}
