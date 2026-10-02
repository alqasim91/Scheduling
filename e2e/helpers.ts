import type { Locator, Page } from '@playwright/test'

export const STORAGE_KEY = 'schedule-builder:v1'

export interface SeedItem {
  id: string
  tracks: number[]
  start: string
  end: string
  title: string
  variant?: 'session' | 'break' | 'highlight'
  speaker?: string
}

/** A version 2 schedule with `tracks` tracks (Alpha, Beta, Gamma, ...) and the given sessions. */
export function seedSchedule(options: { tracks?: number; items?: SeedItem[]; speakers?: { id: string; name: string; role: string }[] } = {}) {
  const names = ['Alpha', 'Beta', 'Gamma', 'Delta']
  const colors = ['#188038', '#0b57d0', '#f9ab00', '#a142f4']
  const count = options.tracks ?? 3
  const columns = Array.from({ length: count }, (_, i) => ({ id: `t${i}`, name: names[i] ?? `Track ${i + 1}`, color: colors[i % colors.length], type: 'track' }))
  return {
    version: 2,
    event: { title: 'E2E Summit', date: '2026-10-02', timezone: 'Europe/London', venue: 'Hall', notes: '' },
    branding: {
      logo: null,
      colors: { primary: '#0b57d0', background: '#f8fafd', surface: '#ffffff', text: '#1f1f1f', muted: '#444746', line: '#c4c7c5', accent: '#d93025' },
      fonts: { display: 'system-ui, sans-serif', body: 'system-ui, sans-serif', mono: 'ui-monospace, monospace' },
      theme: 'light',
      motion: { preset: 'none', logoAnimation: false },
    },
    mode: 'track-grid',
    columns,
    rows: [],
    items: (options.items ?? []).map((i) => ({
      id: i.id,
      columnIds: i.tracks.map((t) => `t${t}`),
      start: i.start,
      end: i.end,
      title: i.title,
      variant: i.variant ?? 'session',
      ...(i.speaker ? { speaker: i.speaker } : {}),
    })),
    speakers: options.speakers ?? [],
  }
}

/** Open the app with the given schedule as its autosaved state (nothing from Google Fonts is fetched). */
export async function openApp(page: Page, schedule: unknown = seedSchedule()) {
  await page.route(/https?:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\/.*/, (route) => route.abort())
  await page.addInitScript(
    ([key, value]) => {
      if (window.top !== window) return // the sandboxed preview iframe has no storage
      if (!sessionStorage.getItem('e2e-seeded')) {
        localStorage.setItem(key as string, value as string)
        sessionStorage.setItem('e2e-seeded', '1')
      }
    },
    [STORAGE_KEY, JSON.stringify(schedule)],
  )
  await page.goto('/')
  await page.locator('.board__cols').waitFor()
}

const minutes = (time: string): number => {
  const [h, m] = time.split(':').map(Number) as [number, number]
  return h * 60 + m
}

/** Pointer helpers that turn "14:20 in track 2" into page coordinates, whatever the scroll and zoom. */
export class Board {
  constructor(readonly page: Page) {}

  get cols(): Locator {
    return this.page.locator('.board__cols')
  }

  /** Page coordinates of a time (HH:MM, may be fractional minutes via `extra`) in a track (0-based). */
  async at(time: string, track: number, extraMinutes = 0, xFraction = 0.5): Promise<{ x: number; y: number }> {
    const info = await this.cols.evaluate((el) => {
      const r = el.getBoundingClientRect()
      return { left: r.left, top: r.top, width: r.width, start: Number(el.getAttribute('data-range-start')), ppm: Number(el.getAttribute('data-ppm')), tracks: Number(el.getAttribute('data-tracks')), rtl: el.getAttribute('data-rtl') === 'true' }
    })
    const point = {
      // A right-to-left board puts the first track at the right edge.
      x: info.left + ((info.rtl ? info.tracks - track - xFraction : track + xFraction) * info.width) / info.tracks,
      y: info.top + (minutes(time) + extraMinutes - info.start) * info.ppm,
    }
    // Tests drive a real mouse: a point outside the board's visible area would silently click something else.
    const view = await this.page.locator('.board__viewport').boundingBox()
    if (!view || point.y < view.y + 40 || point.y > view.y + view.height - 4) {
      throw new Error(`${time} is outside the visible board (y=${point.y}, board ${view?.y}..${view ? view.y + view.height : '?'}): call reveal() first`)
    }
    return point
  }

  /** Scroll so the time is comfortably inside the viewport. */
  async reveal(time: string) {
    await this.cols.scrollIntoViewIfNeeded()
    await this.cols.evaluate((el, [t]) => {
      const start = Number(el.getAttribute('data-range-start'))
      const ppm = Number(el.getAttribute('data-ppm'))
      const [h, m] = String(t).split(':').map(Number) as [number, number]
      const viewport = el.closest('.board__viewport') as HTMLElement
      viewport.scrollTop = Math.max(0, (h * 60 + m - start) * ppm - 120)
    }, [time])
  }

  /** Draw a session by dragging from one time/track to another. */
  async drag(from: { time: string; track: number }, to: { time: string; track: number }, steps = 12) {
    await this.reveal(from.time)
    const a = await this.at(from.time, from.track)
    const b = await this.at(to.time, to.track)
    await this.page.mouse.move(a.x, a.y)
    await this.page.mouse.down()
    await this.page.mouse.move(b.x, b.y, { steps })
    return { release: () => this.page.mouse.up() }
  }

  card(name: string | RegExp): Locator {
    return this.page.getByRole('button', { name: typeof name === 'string' ? new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')},`) : name })
  }

  /** The card's time range as shown, e.g. "14:20 – 15:05". */
  async times(card: Locator): Promise<string> {
    return (await card.locator('.board-card__time').textContent())?.replace(/\s+/g, ' ').trim() ?? ''
  }

  preview(): Locator {
    return this.page.locator('.board__preview')
  }

  /** The text of the rendered schedule in the preview iframe. */
  async previewText(): Promise<string> {
    const frame = this.page.frameLocator('iframe[title="Preview"]')
    return (await frame.locator('body').innerText()) ?? ''
  }
}
