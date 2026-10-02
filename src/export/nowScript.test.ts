import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cairoSample } from '../samples/cairo.ts'
import { buildExportHtml } from './exportHtml.ts'
import { NOW_SCRIPT } from './nowScript.ts'

function load(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  document.body.innerHTML = parsed.body.innerHTML.replace(/<script[\s\S]*?<\/script>/g, '')
  const data = document.createElement('script')
  data.type = 'application/json'
  data.id = 'schedule-data'
  data.textContent = parsed.getElementById('schedule-data')?.textContent ?? ''
  document.body.appendChild(data)
}

const nowTitles = () => [...document.querySelectorAll('.ev.now')].map((e) => e.querySelector('h3')?.textContent)
const run = () => new Function(NOW_SCRIPT)()

beforeEach(() => {
  vi.useFakeTimers()
  load(buildExportHtml(cairoSample))
})
afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('NOW_SCRIPT', () => {
  it('is plain ES5', () => {
    expect(NOW_SCRIPT).not.toMatch(/=>|\blet\b|\bconst\b|`|\bclass\b|\basync\b|\.\.\./)
  })

  it('marks exactly the cards running at 14:30 Cairo time (end is exclusive, ghosts never)', () => {
    vi.setSystemTime(new Date('2026-10-02T11:30:00Z')) // 14:30 EEST
    run()
    expect(nowTitles()).toEqual([
      'Beyond the Prompt: Context and Harness Engineering for the Modern Developer',
      'Safeguarding Agents with Agents Sandbox: A hands-on lab',
    ])
  })

  it('includes the start minute and the keynote while it runs', () => {
    vi.setSystemTime(new Date('2026-10-02T11:00:00Z')) // 14:00
    run()
    expect(nowTitles()).toEqual(['Opening & Keynote'])
    vi.setSystemTime(new Date('2026-10-02T11:20:00Z')) // 14:20
    run()
    expect(nowTitles()).toEqual([
      'Opening & Keynote',
      'Beyond the Prompt: Context and Harness Engineering for the Modern Developer',
      'Safeguarding Agents with Agents Sandbox: A hands-on lab',
    ])
  })

  it('never marks a ghost cell, even while the long session is running', () => {
    document.querySelector('.ev.ghost')?.setAttribute('data-s', '1025')
    document.querySelector('.ev.ghost')?.setAttribute('data-e', '1040')
    vi.setSystemTime(new Date('2026-10-02T14:10:00Z')) // 17:10 Cairo
    run()
    expect(document.querySelector('.ev.ghost.now')).toBeNull()
    expect(nowTitles()).toEqual([
      'Scale Distributed Data Processing with GKE to build a Knowledge Graph in BigQuery',
      'Build with Gemma 4',
    ])
  })

  it('does nothing on another day, or before and after the event', () => {
    for (const when of ['2026-10-03T11:30:00Z', '2026-10-01T11:30:00Z']) {
      vi.setSystemTime(new Date(when))
      run()
      expect(nowTitles()).toEqual([])
    }
  })

  it('uses the event timezone, not the viewer clock', () => {
    vi.setSystemTime(new Date('2026-10-02T14:35:00Z')) // 14:35 UTC is 17:35 in Cairo
    run()
    expect(nowTitles()).toEqual(['Closing remarks'])
  })

  it('repeats every 60 seconds', () => {
    vi.setSystemTime(new Date('2026-10-02T12:03:00Z')) // 15:03, inside the 14:20-15:05 sessions
    run()
    expect(nowTitles()).toHaveLength(2)
    vi.advanceTimersByTime(60_000) // 15:04
    expect(nowTitles()).toHaveLength(2)
    vi.advanceTimersByTime(60_000) // 15:05: the sessions have ended (end is exclusive), lunch starts
    expect(nowTitles()).toEqual(['Lunch'])
  })

  it('never throws on bad data', () => {
    document.getElementById('schedule-data')!.textContent = '{not json'
    expect(() => run()).not.toThrow()
    document.getElementById('schedule-data')!.remove()
    expect(() => run()).not.toThrow()
  })
})
