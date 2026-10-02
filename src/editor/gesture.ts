import type { PointerEvent as ReactPointerEvent } from 'react'

/** How long a finger must rest on empty space before dragging draws a session instead of scrolling. */
export const LONG_PRESS_MS = 350
/** A finger may wander this far during a tap or a hold. */
export const TOUCH_SLOP_PX = 10
const EDGE_ZONE = 48
const MAX_SCROLL_SPEED = 22

export interface Pt {
  x: number
  y: number
}

export interface GestureHandlers {
  /** Pixels the pointer must travel before it counts as a drag (0 = immediately). */
  threshold: number
  /** Touch only: the finger must rest this long before a drag starts; moving earlier scrolls. */
  holdMs?: number
  /** The hold elapsed (touch): show that something is about to happen. */
  armed?: () => void
  update: (pt: Pt, dragging: boolean) => void
  /** The pointer was released. `dragging` is false for a plain click or tap. */
  finish: (pt: Pt, dragging: boolean) => void
  /** Esc, or the browser took the pointer away (touch scrolling): undo any visual effect. */
  cancel: () => void
}

/**
 * Every pointer gesture goes through here: capture the pointer on `target`, call `update` while it
 * moves, auto-scroll the viewport near its edges, and end on release or cancel on Esc. Nothing is
 * committed to state in here; the handlers decide that on `finish`.
 */
export function runGesture(e: ReactPointerEvent, target: HTMLElement, viewport: HTMLElement | null, headerHeight: number, h: GestureHandlers) {
  const pointerId = e.pointerId
  let pt: Pt = { x: e.clientX, y: e.clientY }
  const origin = pt
  let armed = h.holdMs === undefined
  let dragging = h.threshold === 0 && armed
  let raf = 0
  let timer = 0
  let done = false
  try {
    target.setPointerCapture?.(pointerId)
  } catch {
    // The pointer may already be gone; the listeners below still work.
  }

  const end = () => {
    done = true
    cancelAnimationFrame(raf)
    window.clearTimeout(timer)
    target.removeEventListener('pointermove', onMove)
    target.removeEventListener('pointerup', onUp)
    target.removeEventListener('pointercancel', onCancel)
    target.removeEventListener('touchmove', onTouchMove)
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
    const travelled = Math.hypot(pt.x - origin.x, pt.y - origin.y)
    if (!armed) {
      // Moving before the hold is up means "scroll": give the pointer back to the browser.
      if (travelled > TOUCH_SLOP_PX) {
        end()
        h.cancel()
      }
      return
    }
    if (!dragging && travelled > h.threshold) dragging = true
    if (dragging) h.update(pt, true)
  }
  // After a long press the finger drags instead of scrolling.
  const onTouchMove = (ev: TouchEvent) => {
    if (armed && ev.cancelable) ev.preventDefault()
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
  if (h.holdMs !== undefined) {
    target.addEventListener('touchmove', onTouchMove, { passive: false })
    timer = window.setTimeout(() => {
      if (done) return
      armed = true
      h.armed?.()
    }, h.holdMs)
  }
  raf = requestAnimationFrame(loop)
}

