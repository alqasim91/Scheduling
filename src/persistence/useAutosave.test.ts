import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptySchedule } from '../model/defaults.ts'
import type { Schedule } from '../model/schema.ts'
import { STORAGE_KEY, loadAutosaved, useAutosave } from './useAutosave.ts'

function titled(title: string): Schedule {
  const s = createEmptySchedule()
  s.event.title = title
  return s
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useAutosave', () => {
  it('uses the documented storage key', () => {
    expect(STORAGE_KEY).toBe('schedule-builder:v1')
  })

  it('writes after the delay, not before', () => {
    const { rerender } = renderHook(({ v }) => useAutosave('k', v), { initialProps: { v: titled('A') } })
    rerender({ v: titled('B') })
    act(() => void vi.advanceTimersByTime(299))
    expect(localStorage.getItem('k')).toBeNull()
    act(() => void vi.advanceTimersByTime(1))
    expect(loadAutosaved('k')?.event.title).toBe('B')
  })

  it('says Saved straight away when the write is quick, and Saving… only once it takes over 400 ms', () => {
    const quick = renderHook(({ v }) => useAutosave('k', v), { initialProps: { v: titled('A') } })
    quick.rerender({ v: titled('B') })
    expect(quick.result.current).toBe('saved')
    act(() => void vi.advanceTimersByTime(400))
    expect(quick.result.current).toBe('saved')
    quick.unmount()

    const slow = renderHook(({ v }) => useAutosave('k2', v, 1000), { initialProps: { v: titled('A') } })
    slow.rerender({ v: titled('B') })
    act(() => void vi.advanceTimersByTime(399))
    expect(slow.result.current).toBe('saved')
    act(() => void vi.advanceTimersByTime(1))
    expect(slow.result.current).toBe('saving')
    act(() => void vi.advanceTimersByTime(600))
    expect(slow.result.current).toBe('saved')
  })

  it('debounces rapid changes into a single write of the latest value', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const { rerender } = renderHook(({ v }) => useAutosave('k', v, 500), { initialProps: { v: titled('A') } })
    rerender({ v: titled('B') })
    act(() => void vi.advanceTimersByTime(300))
    rerender({ v: titled('C') })
    act(() => void vi.advanceTimersByTime(300))
    expect(setItem).not.toHaveBeenCalled()
    act(() => void vi.advanceTimersByTime(200))
    expect(setItem).toHaveBeenCalledTimes(1)
    expect(loadAutosaved('k')?.event.title).toBe('C')
  })

  it('does not write the unchanged initial value', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    renderHook(() => useAutosave('k', titled('A')))
    act(() => void vi.advanceTimersByTime(2000))
    expect(setItem).not.toHaveBeenCalled()
  })

  it('flushes a pending write on unmount', () => {
    const { rerender, unmount } = renderHook(({ v }) => useAutosave('k', v), { initialProps: { v: titled('A') } })
    rerender({ v: titled('B') })
    expect(localStorage.getItem('k')).toBeNull()
    unmount()
    expect(loadAutosaved('k')?.event.title).toBe('B')
  })

  it('flushes a pending write on beforeunload', () => {
    const { rerender } = renderHook(({ v }) => useAutosave('k', v), { initialProps: { v: titled('A') } })
    rerender({ v: titled('B') })
    window.dispatchEvent(new Event('beforeunload'))
    expect(loadAutosaved('k')?.event.title).toBe('B')
  })

  it('swallows storage errors', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    const { rerender } = renderHook(({ v }) => useAutosave('k', v), { initialProps: { v: titled('A') } })
    rerender({ v: titled('B') })
    expect(() => act(() => void vi.advanceTimersByTime(600))).not.toThrow()
  })
})

describe('loadAutosaved', () => {
  it('returns null when nothing is stored', () => {
    expect(loadAutosaved('k')).toBeNull()
  })

  it('returns null for corrupt JSON', () => {
    localStorage.setItem('k', '{ nope')
    expect(loadAutosaved('k')).toBeNull()
  })

  it('returns null for JSON that fails validation', () => {
    localStorage.setItem('k', JSON.stringify({ version: 1, event: {} }))
    expect(loadAutosaved('k')).toBeNull()
  })

  it('returns null when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(loadAutosaved('k')).toBeNull()
  })

  it('returns the schedule when valid', () => {
    const s = titled('Saved')
    localStorage.setItem('k', JSON.stringify(s))
    expect(loadAutosaved('k')).toEqual(s)
  })
})
