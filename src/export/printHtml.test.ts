import { afterEach, describe, expect, it, vi } from 'vitest'
import { printHtml } from './printHtml.ts'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('printHtml', () => {
  it('loads the html into a hidden iframe, waits for fonts, prints, then removes the iframe', async () => {
    vi.useFakeTimers()
    const print = vi.fn()
    let fontsReady = false
    const win = {
      document: { fonts: { ready: Promise.resolve().then(() => void (fontsReady = true)) } },
      focus: vi.fn(),
      print: vi.fn(() => {
        expect(fontsReady).toBe(true)
        print()
      }),
    }
    vi.spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get').mockReturnValue(win as unknown as Window)

    const done = printHtml('<!doctype html><p>hi</p>')
    const frame = document.querySelector('iframe') as HTMLIFrameElement
    expect(frame.srcdoc).toBe('<!doctype html><p>hi</p>')
    expect(frame.getAttribute('aria-hidden')).toBe('true')
    expect(frame.style.visibility).toBe('hidden')
    expect(frame.getAttribute('sandbox')).not.toContain('allow-scripts')
    expect(print).not.toHaveBeenCalled()

    frame.dispatchEvent(new Event('load'))
    await done
    expect(print).toHaveBeenCalledTimes(1)
    expect(document.querySelector('iframe')).not.toBeNull() // still there while the dialog may be open
    vi.advanceTimersByTime(1000)
    expect(document.querySelector('iframe')).toBeNull()
  })

  it('removes the iframe even if printing throws', async () => {
    vi.useFakeTimers()
    vi.spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get').mockReturnValue({
      document: {},
      focus() {},
      print() {
        throw new Error('blocked')
      },
    } as unknown as Window)
    const done = printHtml('<p>x</p>')
    document.querySelector('iframe')?.dispatchEvent(new Event('load'))
    await done.catch(() => undefined)
    vi.advanceTimersByTime(1000)
    expect(document.querySelector('iframe')).toBeNull()
  })
})
