/** Pure helpers that edit `schedule.branding`. Invalid input returns the same schedule object. */
import { DEFAULT_COLORS, type BrandColors } from '../model/brandDefaults.ts'
import type { Branding, Schedule } from '../model/schema.ts'
import { FONT_PRESETS, WEB_FONT_PATTERN, presetForStack } from '../render/fonts.ts'
import { deriveDarkColors } from '../render/theme.ts'

export type ColorKey = keyof BrandColors
export type FontRole = 'display' | 'body' | 'mono'

export const COLOR_KEYS: readonly ColorKey[] = ['primary', 'accent', 'background', 'surface', 'text', 'muted', 'line', 'note']

const HEX = /^#[0-9a-fA-F]{6}$/

function withBranding(schedule: Schedule, patch: Partial<Branding>): Schedule {
  return { ...schedule, branding: { ...schedule.branding, ...patch } }
}

export function setBrandColor(schedule: Schedule, key: ColorKey, hex: string): Schedule {
  if (!HEX.test(hex)) return schedule
  return withBranding(schedule, { colors: { ...schedule.branding.colors, [key]: hex } })
}

/** Edit one colour of the custom dark palette (which must exist). */
export function setDarkColor(schedule: Schedule, key: ColorKey, hex: string): Schedule {
  const dark = schedule.branding.darkColors
  if (!dark || !HEX.test(hex)) return schedule
  return withBranding(schedule, { darkColors: { ...dark, [key]: hex } })
}

/** Back to the default light colours, and back to the automatic dark palette. */
export function resetColors(schedule: Schedule): Schedule {
  const { darkColors: _removed, ...rest } = schedule.branding
  void _removed
  return { ...schedule, branding: { ...rest, colors: { ...DEFAULT_COLORS } } }
}

/** Turn custom dark colours on (copying the derived palette) or off (deleting them). */
export function setCustomDark(schedule: Schedule, on: boolean): Schedule {
  if (on) {
    if (schedule.branding.darkColors) return schedule
    return withBranding(schedule, { darkColors: deriveDarkColors(schedule.branding.colors) })
  }
  if (!schedule.branding.darkColors) return schedule
  const { darkColors: _removed, ...rest } = schedule.branding
  void _removed
  return { ...schedule, branding: rest }
}

export function setTheme(schedule: Schedule, theme: Branding['theme']): Schedule {
  return withBranding(schedule, { theme })
}

export function setLogo(schedule: Schedule, logo: string | null): Schedule {
  if (logo !== null && !logo.startsWith('data:image/')) return schedule
  return withBranding(schedule, { logo })
}

/** Logo height in px (16-120), or undefined to go back to the default cap. */
export function setLogoHeight(schedule: Schedule, height: number | undefined): Schedule {
  if (height === undefined) {
    const { logoHeight: _removed, ...rest } = schedule.branding
    void _removed
    return { ...schedule, branding: rest }
  }
  if (!Number.isInteger(height) || height < 16 || height > 120) return schedule
  return withBranding(schedule, { logoHeight: height })
}

export function setMotionPreset(schedule: Schedule, preset: Branding['motion']['preset']): Schedule {
  return withBranding(schedule, { motion: { ...schedule.branding.motion, preset } })
}

export function setLogoAnimation(schedule: Schedule, on: boolean): Schedule {
  return withBranding(schedule, { motion: { ...schedule.branding.motion, logoAnimation: on } })
}

/** Set a font stack as typed (custom text). */
export function setFontStack(schedule: Schedule, role: FontRole, stack: string): Schedule {
  return withBranding(schedule, { fonts: { ...schedule.branding.fonts, [role]: stack } })
}

/** Choose a preset for a role; a web preset also adds its family to the web fonts list. */
export function applyFontPreset(schedule: Schedule, role: FontRole, presetId: string): Schedule {
  const preset = FONT_PRESETS.find((p) => p.id === presetId)
  if (!preset) return schedule
  const fonts = { ...schedule.branding.fonts, [role]: preset.stack }
  const existing = fonts.webFonts ?? []
  if (preset.webFont && !existing.includes(preset.webFont)) fonts.webFonts = [...existing, preset.webFont]
  return withBranding(schedule, { fonts })
}

/** Replace the web fonts list. Invalid family names are refused; an empty list removes the field. */
export function setWebFonts(schedule: Schedule, families: string[]): Schedule {
  if (!families.every((f) => WEB_FONT_PATTERN.test(f))) return schedule
  const { webFonts: _removed, ...fonts } = schedule.branding.fonts
  void _removed
  return withBranding(schedule, { fonts: families.length > 0 ? { ...fonts, webFonts: families } : fonts })
}

/** Id of the preset a stack matches, or 'custom'. */
export function presetIdFor(stack: string): string {
  return presetForStack(stack)?.id ?? 'custom'
}
