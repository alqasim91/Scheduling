/** Palettes: the light colours as set, and the dark palette (explicit or derived). */
import { DEFAULT_COLORS, type BrandColors } from '../model/brandDefaults.ts'
import type { Branding, Colors } from '../model/schema.ts'
import { cssColor } from './escape.ts'

/** How far dark-mode accent and track colours are mixed toward white. */
export const DARK_LIFT = 0.45

export const DARK_BASE = {
  background: '#131314',
  surface: '#1e1f20',
  text: '#e3e3e3',
  muted: '#c4c7c5',
  line: '#444746',
} as const

/** Mix a #rrggbb colour toward white by `amount` (0-1). */
export function lighten(hex: string, amount: number = DARK_LIFT): string {
  const value = cssColor(hex, '#888888')
  const channel = (i: number) => {
    const c = parseInt(value.slice(1 + i * 2, 3 + i * 2), 16)
    return Math.round(c + (255 - c) * amount)
  }
  return `#${[0, 1, 2].map((i) => channel(i).toString(16).padStart(2, '0')).join('')}`
}

/** Light colours with every optional value filled in. */
export function resolveLightColors(colors: Colors): BrandColors {
  return { ...DEFAULT_COLORS, ...colors, note: colors.note ?? DEFAULT_COLORS.note }
}

/** The dark palette derived from the light one. */
export function deriveDarkColors(colors: Colors): BrandColors {
  const light = resolveLightColors(colors)
  return {
    ...DARK_BASE,
    primary: lighten(light.primary),
    accent: lighten(light.accent),
    note: lighten(light.note),
  }
}

/** The dark palette to render: the user's `darkColors`, else derived. */
export function resolveDarkColors(branding: Pick<Branding, 'colors' | 'darkColors'>): BrandColors {
  return branding.darkColors ? resolveLightColors(branding.darkColors) : deriveDarkColors(branding.colors)
}
