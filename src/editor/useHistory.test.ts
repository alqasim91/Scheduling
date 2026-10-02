import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEmptySchedule } from '../model/defaults.ts'
import type { Schedule } from '../model/schema.ts'
import { COALESCE_MS, HISTORY_LIMIT, useHistory } from './useHistory.ts'

const title = (t: string) => (s: Schedule): Schedule => ({ ...s, event: { ...s.event, title: t } })

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('useHistory', () => {
  it('records edits, and undo / redo walk through them', () => {
    const { result } = renderHook(() => useHistory(createEmptySchedule()))
    const first = result.current.schedule
    act(() => result.current.set(title('A')))
    act(() => result.current.set(title('B')))
    expect(result.current.schedule.event.title).toBe('B')
    expect(result.current.canUndo).toBe(true)
    expect(result.current.canRedo).toBe(false)
    act(() => result.current.undo())
    expect(result.current.schedule.event.title).toBe('A')
    expect(result.current.canRedo).toBe(true)
    act(() => result.current.undo())
    expect(result.current.schedule).toBe(first)
    expect(result.current.canUndo).toBe(false)
    act(() => result.current.undo()) // nothing left: harmless
    expect(result.current.schedule).toBe(first)
    act(() => result.current.redo())
    act(() => result.current.redo())
    expect(result.current.schedule.event.title).toBe('B')
  })

  it('a new edit clears the redo stack, and an edit that changes nothing is not recorded', () => {
    const { result } = renderHook(() => useHistory(createEmptySchedule()))
    act(() => result.current.set(title('A')))
    act(() => result.current.undo())
    act(() => result.current.set((s) => s))
    expect(result.current.canRedo).toBe(true)
    expect(result.current.canUndo).toBe(false)
    act(() => result.current.set(title('B')))
    expect(result.current.canRedo).toBe(false)
  })

  it('several edits in one event see each other', () => {
    const { result } = renderHook(() => useHistory(createEmptySchedule()))
    act(() => {
      result.current.set(title('A'), { key: null })
      result.current.set(title('B'), { key: null })
    })
    expect(result.current.schedule.event.title).toBe('B')
    act(() => result.current.undo())
    expect(result.current.schedule.event.title).toBe('A')
  })

  it('keeps at most 100 snapshots', () => {
    const { result } = renderHook(() => useHistory(createEmptySchedule()))
    act(() => {
      for (let i = 0; i < HISTORY_LIMIT + 20; i++) result.current.set(title(`t${i}`), { key: null })
    })
    let undone = 0
    while (result.current.canUndo) {
      act(() => result.current.undo())
      undone++
    }
    expect(undone).toBe(HISTORY_LIMIT)
    expect(result.current.schedule.event.title).toBe('t19')
  })

  it('groups edits with the same key, but not across keys, a pause, or a null key', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useHistory(createEmptySchedule()))
    const base = result.current.schedule
    act(() => result.current.set(title('a'), { key: 'k' }))
    act(() => result.current.set(title('ab'), { key: 'k' }))
    act(() => result.current.set(title('abc'), { key: 'k' }))
    act(() => result.current.undo())
    expect(result.current.schedule).toBe(base)

    act(() => result.current.set(title('x'), { key: 'k' }))
    act(() => result.current.set(title('y'), { key: 'other' }))
    act(() => result.current.undo())
    expect(result.current.schedule.event.title).toBe('x')

    act(() => result.current.set(title('p'), { key: 'k2' }))
    vi.advanceTimersByTime(COALESCE_MS + 1)
    act(() => result.current.set(title('pq'), { key: 'k2' }))
    act(() => result.current.undo())
    expect(result.current.schedule.event.title).toBe('p')

    act(() => result.current.set(title('n1'), { key: null }))
    act(() => result.current.set(title('n2'), { key: null }))
    act(() => result.current.undo())
    expect(result.current.schedule.event.title).toBe('n1')
  })

  it('a key with a longer window keeps grouping across a long pause', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useHistory(createEmptySchedule()))
    const base = result.current.schedule
    act(() => result.current.set(title('created'), { key: 'new', within: Infinity }))
    vi.advanceTimersByTime(60_000)
    act(() => result.current.set(title('named'), { key: 'new', within: Infinity }))
    act(() => result.current.undo())
    expect(result.current.schedule).toBe(base)
  })

  it('typing in one focused text field is one step; another field or a button is not grouped', () => {
    const { result } = renderHook(() => useHistory(createEmptySchedule()))
    const a = document.body.appendChild(document.createElement('input'))
    const b = document.body.appendChild(document.createElement('input'))
    const button = document.body.appendChild(document.createElement('button'))
    const base = result.current.schedule
    a.focus()
    for (const t of ['h', 'he', 'hel', 'hell', 'hello']) act(() => result.current.set(title(t)))
    act(() => result.current.undo())
    expect(result.current.schedule).toBe(base)

    a.focus()
    act(() => result.current.set(title('one')))
    b.focus()
    act(() => result.current.set(title('two')))
    act(() => result.current.undo())
    expect(result.current.schedule.event.title).toBe('one')

    act(() => result.current.undo())
    button.focus()
    act(() => result.current.set(title('c1')))
    act(() => result.current.set(title('c2')))
    act(() => result.current.undo())
    expect(result.current.schedule.event.title).toBe('c1')
  })

  it('an undo ends a typing group', () => {
    const { result } = renderHook(() => useHistory(createEmptySchedule()))
    const a = document.body.appendChild(document.createElement('input'))
    a.focus()
    act(() => result.current.set(title('x')))
    act(() => result.current.undo())
    act(() => result.current.set(title('y')))
    act(() => result.current.set(title('yz')))
    act(() => result.current.undo())
    expect(result.current.schedule.event.title).toBe('Untitled event')
  })

  it('rollbackTo drops everything since a snapshot, and clears redo', () => {
    const { result } = renderHook(() => useHistory(createEmptySchedule()))
    act(() => result.current.set(title('keep'), { key: null }))
    const snapshot = result.current.schedule
    act(() => result.current.set(title('new1'), { key: null }))
    act(() => result.current.set(title('new2'), { key: null }))
    act(() => result.current.rollbackTo(snapshot))
    expect(result.current.schedule).toBe(snapshot)
    expect(result.current.canRedo).toBe(false)
    act(() => result.current.undo())
    expect(result.current.schedule.event.title).toBe('Untitled event')
  })

  it('rollbackTo to an unknown snapshot is just an edit', () => {
    const { result } = renderHook(() => useHistory(createEmptySchedule()))
    const other = title('elsewhere')(createEmptySchedule())
    act(() => result.current.rollbackTo(other))
    expect(result.current.schedule).toBe(other)
    act(() => result.current.undo())
    expect(result.current.schedule.event.title).toBe('Untitled event')
  })
})
