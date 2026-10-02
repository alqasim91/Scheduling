import { describe, expect, it } from 'vitest'
import { DEFAULT_COLORS } from '../model/brandDefaults.ts'
import type { Schedule } from '../model/schema.ts'
import { parseSchedule } from '../model/validate.ts'
import { cairoSample } from '../samples/cairo.ts'
import { deriveDarkColors } from '../render/theme.ts'
import {
  applyFontPreset,
  presetIdFor,
  resetColors,
  setBrandColor,
  setCustomDark,
  setDarkColor,
  setFontStack,
  setLogo,
  setLogoAnimation,
  setLogoHeight,
  setMotionPreset,
  setTheme,
  setWebFonts,
} from './branding.ts'
import { MAX_LOGO_BYTES, validateLogoFile } from './logoFile.ts'

const s: Schedule = cairoSample
const valid = (x: Schedule) => {
  const result = parseSchedule(x)
  expect(result.ok, result.ok ? '' : result.errors.join('; ')).toBe(true)
}

describe('branding helpers', () => {
  it('sets colours and refuses non-hex values', () => {
    const next = setBrandColor(s, 'primary', '#123456')
    expect(next.branding.colors.primary).toBe('#123456')
    expect(setBrandColor(next, 'note', '#abcdef').branding.colors.note).toBe('#abcdef')
    expect(setBrandColor(s, 'primary', 'red')).toBe(s)
    valid(next)
  })

  it('custom dark colours copy the derived palette, edit, and delete when turned off', () => {
    const on = setCustomDark(s, true)
    expect(on.branding.darkColors).toEqual(deriveDarkColors(s.branding.colors))
    expect(setCustomDark(on, true)).toBe(on)
    const edited = setDarkColor(on, 'background', '#000000')
    expect(edited.branding.darkColors?.background).toBe('#000000')
    expect(setDarkColor(s, 'background', '#000000')).toBe(s) // no custom palette yet
    expect(setDarkColor(on, 'background', 'nope')).toBe(on)
    valid(edited)
    const off = setCustomDark(edited, false)
    expect('darkColors' in off.branding).toBe(false)
    expect(setCustomDark(off, false)).toBe(off)
  })

  it('reset restores the default colours and drops custom dark colours', () => {
    const changed = setCustomDark(setBrandColor(s, 'primary', '#123456'), true)
    const reset = resetColors(changed)
    expect(reset.branding.colors).toEqual(DEFAULT_COLORS)
    expect('darkColors' in reset.branding).toBe(false)
    valid(reset)
  })

  it('sets the theme, motion and logo animation', () => {
    expect(setTheme(s, 'dark').branding.theme).toBe('dark')
    expect(setMotionPreset(s, 'stagger').branding.motion).toEqual({ preset: 'stagger', logoAnimation: false })
    expect(setLogoAnimation(s, true).branding.motion.logoAnimation).toBe(true)
  })

  it('logo and logo height', () => {
    const uri = 'data:image/png;base64,AAAA'
    expect(setLogo(s, uri).branding.logo).toBe(uri)
    expect(setLogo(s, 'https://x.test/a.png')).toBe(s)
    expect(setLogo(s, null).branding.logo).toBeNull()
    expect(setLogoHeight(s, 64).branding.logoHeight).toBe(64)
    expect(setLogoHeight(s, 15)).toBe(s)
    expect(setLogoHeight(s, 121)).toBe(s)
    expect(setLogoHeight(s, 20.5)).toBe(s)
    expect('logoHeight' in setLogoHeight(setLogoHeight(s, 64), undefined).branding).toBe(false)
    valid(setLogoHeight(s, 120))
  })

  it('applies font presets, adding the web font once', () => {
    const cairo = applyFontPreset(s, 'display', 'cairo')
    expect(cairo.branding.fonts.display).toContain("'Cairo'")
    expect(cairo.branding.fonts.webFonts).toEqual(['Roboto', 'Roboto Mono', 'Cairo'])
    expect(applyFontPreset(cairo, 'body', 'cairo').branding.fonts.webFonts).toEqual(['Roboto', 'Roboto Mono', 'Cairo'])
    const system = applyFontPreset(s, 'body', 'system-serif')
    expect(system.branding.fonts.webFonts).toEqual(['Roboto', 'Roboto Mono'])
    expect(applyFontPreset(s, 'body', 'nope')).toBe(s)
    expect(presetIdFor(cairo.branding.fonts.display)).toBe('cairo')
    expect(presetIdFor('Whatever')).toBe('custom')
    valid(cairo)
  })

  it('custom stacks and web font lists', () => {
    expect(setFontStack(s, 'mono', 'Menlo, monospace').branding.fonts.mono).toBe('Menlo, monospace')
    expect(setWebFonts(s, ['Inter']).branding.fonts.webFonts).toEqual(['Inter'])
    expect('webFonts' in setWebFonts(s, []).branding.fonts).toBe(false)
    expect(setWebFonts(s, ['ok', 'bad;name'])).toBe(s)
    valid(setWebFonts(s, ['Inter', 'Open Sans']))
  })
})

describe('logo file validation', () => {
  it('accepts the image types under the size limit', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']) {
      expect(validateLogoFile({ type, size: 1000 })).toBeNull()
    }
    expect(validateLogoFile({ type: 'image/png', size: MAX_LOGO_BYTES })).toBeNull()
  })

  it('rejects wrong types and oversized files', () => {
    expect(validateLogoFile({ type: 'application/pdf', size: 10 })).toMatch(/PNG, JPEG/)
    expect(validateLogoFile({ type: 'image/bmp', size: 10 })).not.toBeNull()
    expect(validateLogoFile({ type: '', size: 10 })).not.toBeNull()
    expect(validateLogoFile({ type: 'image/png', size: MAX_LOGO_BYTES + 1 })).toMatch(/too large/)
  })
})
