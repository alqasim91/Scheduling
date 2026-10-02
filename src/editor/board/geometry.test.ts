import { describe, expect, it } from 'vitest'
import type { Item } from '../../model/schema.ts'
import {
  DAY_MINUTES,
  LAST_MINUTE,
  clamp,
  collisions,
  columnAt,
  fitRange,
  formatMinutes,
  freeBounds,
  hourMarks,
  minutesToY,
  previewClick,
  previewCreate,
  previewMove,
  previewResize,
  previewSpan,
  snap,
  yToMinutes,
} from './geometry.ts'

const ids = ['A', 'B', 'C']
const item = (id: string, start: string, end: string, columnIds: string[]): Item => ({ id, start, end, columnIds, title: id, variant: 'session' })
const h = (hh: number, mm = 0) => hh * 60 + mm

describe('snap, minutesToY, yToMinutes', () => {
  it('snaps to 5 minutes, rounding or flooring', () => {
    expect(snap(62)).toBe(60)
    expect(snap(63)).toBe(65)
    expect(snap(62.4)).toBe(60)
    expect(snap(64, 5, 'floor')).toBe(60)
    expect(snap(-3)).toBe(-5)
    expect(snap(7, 15)).toBe(0)
  })

  it('converts between minutes and pixels and back', () => {
    expect(minutesToY(h(10), h(9), 1.8)).toBeCloseTo(108)
    expect(yToMinutes(108, h(9), 1.8)).toBeCloseTo(h(10))
    for (const minutes of [0, 5, 725, 1439]) expect(yToMinutes(minutesToY(minutes, 480, 1.1), 480, 1.1)).toBeCloseTo(minutes)
  })

  it('formats minutes as HH:MM and clamps 24:00 to 23:59', () => {
    expect(formatMinutes(h(9, 5))).toBe('09:05')
    expect(formatMinutes(DAY_MINUTES)).toBe('23:59')
    expect(formatMinutes(-4)).toBe('00:00')
  })

  it('finds the column under x, clamped', () => {
    expect(columnAt(150, 100, 300, 3)).toBe(0)
    expect(columnAt(250, 100, 300, 3)).toBe(1)
    expect(columnAt(399, 100, 300, 3)).toBe(2)
    expect(columnAt(-50, 100, 300, 3)).toBe(0)
    expect(columnAt(900, 100, 300, 3)).toBe(2)
    expect(columnAt(10, 0, 0, 3)).toBe(0)
    // Right-to-left: the first column is at the right edge.
    expect(columnAt(150, 100, 300, 3, true)).toBe(2)
    expect(columnAt(250, 100, 300, 3, true)).toBe(1)
    expect(columnAt(399, 100, 300, 3, true)).toBe(0)
    expect(columnAt(900, 100, 300, 3, true)).toBe(0)
    expect(columnAt(-50, 100, 300, 3, true)).toBe(2)
    expect(clamp(5, 0, 3)).toBe(3)
  })
})

describe('fitRange', () => {
  it('runs from 30 minutes before the first start to 60 minutes after the last end, in whole hours', () => {
    expect(fitRange([item('a', '10:00', '16:20', ['A'])])).toEqual({ start: h(9), end: h(18) })
    expect(fitRange([item('a', '09:10', '15:00', ['A'])])).toEqual({ start: h(8), end: h(16) })
  })

  it('is at least six hours, growing after the end first', () => {
    expect(fitRange([item('a', '10:00', '11:00', ['A'])])).toEqual({ start: h(9), end: h(15) })
  })

  it('stays within the day, and keeps six hours at its edges', () => {
    expect(fitRange([item('a', '00:10', '01:00', ['A'])])).toEqual({ start: 0, end: h(6) })
    expect(fitRange([item('a', '22:00', '23:59', ['A'])])).toEqual({ start: h(18), end: DAY_MINUTES })
  })

  it('shows a working day when empty, and Earlier / Later add an hour each', () => {
    expect(fitRange([])).toEqual({ start: h(9), end: h(17) })
    expect(fitRange([], { before: 60, after: 120 })).toEqual({ start: h(8), end: h(19) })
    expect(fitRange([], { before: 60 * 20 })).toEqual({ start: 0, end: h(17) })
    // The six-hour minimum does not swallow a click on Later.
    const one = [item('a', '10:00', '11:00', ['A'])]
    expect(fitRange(one, { after: 60 })).toEqual({ start: h(9), end: h(16) })
    expect(fitRange(one, { before: 60, after: 120 })).toEqual({ start: h(8), end: h(17) })
  })

  it('lists the whole hours inside a range', () => {
    expect(hourMarks({ start: h(9), end: h(12) })).toEqual([h(9), h(10), h(11)])
  })
})

describe('collisions and free bounds', () => {
  const items = [item('a', '09:00', '10:00', ['A']), item('b', '10:30', '11:00', ['A', 'B']), item('c', '09:00', '12:00', ['C'])]

  it('looks only at the target tracks, with half-open intervals', () => {
    expect(collisions(items, ids, { first: 0, last: 0 }, h(9, 30), h(10, 30)).map((i) => i.id)).toEqual(['a'])
    expect(collisions(items, ids, { first: 0, last: 0 }, h(10), h(10, 30))).toEqual([])
    expect(collisions(items, ids, { first: 1, last: 1 }, h(10, 45), h(11, 30)).map((i) => i.id)).toEqual(['b'])
    expect(collisions(items, ids, { first: 0, last: 1 }, h(9), h(11)).map((i) => i.id)).toEqual(['a', 'b'])
    expect(collisions(items, ids, { first: 0, last: 0 }, h(9), h(10), 'a')).toEqual([])
  })

  it('finds the nearest neighbours on either side', () => {
    expect(freeBounds(items, ids, { first: 0, last: 0 }, h(10, 10), h(10, 20))).toEqual({ min: h(10), max: h(10, 30) })
    expect(freeBounds(items, ids, { first: 1, last: 1 }, h(9), h(9, 30))).toEqual({ min: 0, max: h(10, 30) })
    expect(freeBounds(items, ids, { first: 0, last: 0 }, h(11), h(11, 30))).toEqual({ min: h(11), max: LAST_MINUTE })
  })
})

describe('previewCreate', () => {
  const items = [item('a', '10:00', '11:00', ['A']), item('c', '09:00', '09:30', ['C'])]
  const at = (minutes: number, column: number) => ({ minutes, column })

  it('snaps the drawn range and keeps the anchor and pointer order', () => {
    expect(previewCreate([], ids, at(h(14, 21), 0), at(h(15, 4), 0))).toEqual({ start: h(14, 20), end: h(15, 5), first: 0, last: 0, valid: true })
    expect(previewCreate([], ids, at(h(15, 4), 0), at(h(14, 21), 0))).toMatchObject({ start: h(14, 20), end: h(15, 5) })
  })

  it('draws at least 5 minutes, up or down', () => {
    expect(previewCreate([], ids, at(h(14, 20), 1), at(h(14, 21), 1))).toMatchObject({ start: h(14, 20), end: h(14, 25) })
    expect(previewCreate([], ids, at(h(14, 20), 1), at(h(14, 19), 1))).toMatchObject({ start: h(14, 15), end: h(14, 20) })
  })

  it('spans the tracks between the anchor and the pointer', () => {
    expect(previewCreate([], ids, at(h(9), 2), at(h(9, 30), 0))).toMatchObject({ first: 0, last: 2 })
  })

  it('stops at a neighbour instead of overlapping it', () => {
    expect(previewCreate(items, ids, at(h(9, 10), 0), at(h(10, 40), 0))).toMatchObject({ start: h(9, 10), end: h(10), valid: true })
    expect(previewCreate(items, ids, at(h(11, 30), 0), at(h(10, 20), 0))).toMatchObject({ start: h(11), end: h(11, 30), valid: true })
  })

  it('is invalid when it starts inside a session or has no room', () => {
    expect(previewCreate(items, ids, at(h(10, 20), 0), at(h(10, 40), 0)).valid).toBe(false)
    expect(previewCreate(items, ids, at(h(9, 58), 0), at(h(10, 30), 0)).valid).toBe(false) // 9:58 snaps to 10:00 = a's start edge
  })

  it('clamps to the day', () => {
    expect(previewCreate([], ids, at(h(23, 50), 0), at(h(26), 0)).end).toBeLessThanOrEqual(LAST_MINUTE)
    expect(previewCreate([], ids, at(h(0, 5), 0), at(h(-1), 0)).start).toBe(0)
  })
})

describe('previewClick', () => {
  it('makes 30 minutes from the click, rounded down to 5', () => {
    expect(previewClick([], ids, { minutes: h(14, 22), column: 1 })).toEqual({ start: h(14, 20), end: h(14, 50), first: 1, last: 1, valid: true })
  })

  it('shortens to the room before the next session, and refuses when there is none', () => {
    const items = [item('a', '14:40', '15:00', ['B'])]
    expect(previewClick(items, ids, { minutes: h(14, 22), column: 1 })).toMatchObject({ start: h(14, 20), end: h(14, 40), valid: true })
    expect(previewClick(items, ids, { minutes: h(14, 22), column: 0 }).end).toBe(h(14, 50))
    expect(previewClick([item('a', '14:23', '15:00', ['B'])], ids, { minutes: h(14, 22), column: 1 }).valid).toBe(false)
  })

  it('is invalid on top of a session, and stays inside the day', () => {
    expect(previewClick([item('a', '14:00', '15:00', ['B'])], ids, { minutes: h(14, 22), column: 1 }).valid).toBe(false)
    const late = previewClick([], ids, { minutes: h(23, 58), column: 0 })
    expect(late.end).toBeLessThanOrEqual(LAST_MINUTE)
    expect(late.valid).toBe(true)
  })
})

describe('previewMove', () => {
  const a = item('a', '09:00', '10:00', ['A'])
  const wide = item('w', '12:00', '13:00', ['A', 'B'])
  const items = [a, item('b', '10:00', '11:00', ['B']), wide]
  const ext = (i: Item, first: number, last: number) => ({ start: h(Number(i.start.slice(0, 2)), Number(i.start.slice(3))), end: h(Number(i.end.slice(0, 2)), Number(i.end.slice(3))), first, last })

  it('snaps the time delta and keeps the length', () => {
    expect(previewMove(items, ids, a, ext(a, 0, 0), 62, 0)).toMatchObject({ start: h(10), end: h(11), first: 0, valid: true })
    expect(previewMove(items, ids, a, ext(a, 0, 0), 63, 0)).toMatchObject({ start: h(10, 5), end: h(11, 5) })
  })

  it('moves across tracks, clamping to the board and keeping the span width', () => {
    expect(previewMove(items, ids, a, ext(a, 0, 0), h(3), 2)).toMatchObject({ first: 2, last: 2, valid: true })
    expect(previewMove(items, ids, a, ext(a, 0, 0), h(3), 9)).toMatchObject({ first: 2, last: 2 })
    expect(previewMove(items, ids, wide, ext(wide, 0, 1), 0, 5)).toMatchObject({ first: 1, last: 2 })
    expect(previewMove(items, ids, wide, ext(wide, 0, 1), 0, -3)).toMatchObject({ first: 0, last: 1 })
  })

  it('is invalid over another session in any covered track, valid when merely touching', () => {
    expect(previewMove(items, ids, a, ext(a, 0, 0), h(1, 30), 1).valid).toBe(false) // B 10:30-11:30 vs b 10:00-11:00
    expect(previewMove(items, ids, a, ext(a, 0, 0), h(2), 1).valid).toBe(true) // B 11:00-12:00 touches b and wide
    expect(previewMove(items, ids, a, ext(a, 0, 0), h(2, 30), 1).valid).toBe(false) // hits wide on B
  })

  it('may overlap its own old position', () => {
    expect(previewMove(items, ids, a, ext(a, 0, 0), 20, 0)).toMatchObject({ start: h(9, 20), valid: true })
  })

  it('is invalid out of the day, and maps an end of 24:00 to 23:59', () => {
    expect(previewMove(items, ids, a, ext(a, 0, 0), -h(10), 0).valid).toBe(false)
    expect(previewMove(items, ids, a, ext(a, 0, 0), h(15), 0).valid).toBe(false)
    const m = previewMove(items, ids, a, ext(a, 0, 0), h(14), 0) // 23:00-24:00
    expect(m).toMatchObject({ start: h(22, 59), end: LAST_MINUTE, valid: true })
  })
})

describe('previewResize', () => {
  const a = item('a', '10:00', '11:00', ['A'])
  const items = [item('p', '09:00', '09:30', ['A']), a, item('n', '12:00', '13:00', ['A']), item('other', '11:10', '11:30', ['B'])]
  const original = { start: h(10), end: h(11), first: 0, last: 0 }

  it('moves the bottom edge, snapped', () => {
    expect(previewResize(items, ids, a, original, 'bottom', h(11, 38))).toMatchObject({ start: h(10), end: h(11, 40), valid: true })
  })

  it('moves the top edge, snapped', () => {
    expect(previewResize(items, ids, a, original, 'top', h(9, 52))).toMatchObject({ start: h(9, 50), end: h(11) })
  })

  it('never goes under 5 minutes, even past the opposite edge', () => {
    expect(previewResize(items, ids, a, original, 'bottom', h(9))).toMatchObject({ end: h(10, 5) })
    expect(previewResize(items, ids, a, original, 'top', h(13))).toMatchObject({ start: h(10, 55) })
  })

  it('stops at its neighbours in the same tracks only', () => {
    expect(previewResize(items, ids, a, original, 'bottom', h(15))).toMatchObject({ end: h(12) })
    expect(previewResize(items, ids, a, original, 'top', h(8))).toMatchObject({ start: h(9, 30) })
    const wide = item('w', '10:00', '11:00', ['A', 'B'])
    expect(previewResize([...items.filter((i) => i.id !== 'a'), wide], ids, wide, { ...original, last: 1 }, 'bottom', h(11, 45))).toMatchObject({ end: h(11, 10) })
  })

  it('stays within the day', () => {
    expect(previewResize([a], ids, a, original, 'bottom', h(30)).end).toBe(LAST_MINUTE)
    expect(previewResize([a], ids, a, original, 'top', -h(3)).start).toBe(0)
  })
})

describe('previewSpan', () => {
  const a = item('a', '10:00', '11:00', ['B'])
  const items = [a, item('x', '10:30', '11:30', ['C'])]
  const original = { start: h(10), end: h(11), first: 1, last: 1 }

  it('widens to the right over free tracks, and stops before a busy one', () => {
    expect(previewSpan(items, ids, a, original, 'right', 2)).toMatchObject({ first: 1, last: 1 })
    expect(previewSpan([a], ids, a, original, 'right', 2)).toMatchObject({ first: 1, last: 2 })
    expect(previewSpan([a], ids, a, original, 'right', 9)).toMatchObject({ last: 2 })
  })

  it('widens to the left, and narrows from either side', () => {
    expect(previewSpan(items, ids, a, original, 'left', 0)).toMatchObject({ first: 0, last: 1 })
    const wide = { ...original, first: 0, last: 2 }
    expect(previewSpan([a], ids, a, wide, 'right', 1)).toMatchObject({ first: 0, last: 1 })
    expect(previewSpan([a], ids, a, wide, 'left', 2)).toMatchObject({ first: 2, last: 2 })
    expect(previewSpan([a], ids, a, wide, 'right', 0)).toMatchObject({ first: 0, last: 0 })
    expect(previewSpan([a], ids, a, wide, 'left', 9)).toMatchObject({ first: 2, last: 2 })
  })

  it('keeps the times', () => {
    expect(previewSpan([a], ids, a, original, 'right', 2)).toMatchObject({ start: h(10), end: h(11), valid: true })
  })
})
