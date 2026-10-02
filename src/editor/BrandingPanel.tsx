import { useState, type ChangeEvent } from 'react'
import { DEFAULT_LOGO_HEIGHT } from '../model/brandDefaults.ts'
import type { Schedule } from '../model/schema.ts'
import { FONT_PRESETS, WEB_FONT_PATTERN } from '../render/fonts.ts'
import { resolveDarkColors, resolveLightColors } from '../render/theme.ts'
import {
  COLOR_KEYS,
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
  type ColorKey,
  type FontRole,
} from './branding.ts'
import { DraftInput } from './DraftInput.tsx'
import { LOGO_TYPES, readFileAsDataUrl, validateLogoFile } from './logoFile.ts'
import type { Apply } from './types.ts'

interface Props {
  schedule: Schedule
  apply: Apply
}

const COLOR_LABELS: Record<ColorKey, string> = {
  primary: 'Primary',
  accent: 'Accent',
  background: 'Background',
  surface: 'Surface',
  text: 'Text',
  muted: 'Muted',
  line: 'Line',
  note: 'Note',
}

const FONT_ROLES: ReadonlyArray<readonly [FontRole, string]> = [
  ['display', 'Display'],
  ['body', 'Body'],
  ['mono', 'Mono'],
]

function parseFamilies(text: string): string[] {
  return text
    .split(',')
    .map((f) => f.trim())
    .filter((f) => f !== '')
}

export function BrandingPanel({ schedule, apply }: Props) {
  const { branding } = schedule
  const [logoError, setLogoError] = useState<string | null>(null)
  const light = resolveLightColors(branding.colors)
  const dark = resolveDarkColors(branding)

  async function handleLogo(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    const problem = validateLogoFile(file)
    if (problem) {
      setLogoError(problem)
    } else {
      try {
        const dataUrl = await readFileAsDataUrl(file)
        apply((s) => setLogo(s, dataUrl))
        setLogoError(null)
      } catch {
        setLogoError('Could not read that file.')
      }
    }
    input.value = ''
  }

  return (
    <section className="panel" aria-labelledby="panel-branding">
      <h2 id="panel-branding">Branding</h2>

      <fieldset className="group">
        <legend>Logo</legend>
        {branding.logo && <img className="logo-preview" src={branding.logo} alt="Logo preview" />}
        <label className="field">
          <span>Logo file</span>
          <input type="file" accept={LOGO_TYPES.join(',')} onChange={handleLogo} />
        </label>
        {logoError && (
          <p role="alert" className="field__error">
            {logoError}
          </p>
        )}
        <small className="field__hint">PNG, JPEG, WebP, GIF or SVG, up to 512 KB.</small>
        <div className="row2">
          <DraftInput
            label="Logo height (px)"
            value={String(branding.logoHeight ?? DEFAULT_LOGO_HEIGHT)}
            validate={(t) => /^\d+$/.test(t) && Number(t) >= 16 && Number(t) <= 120}
            hint="A whole number from 16 to 120."
            onCommit={(t) => apply((s) => setLogoHeight(s, Number(t)))}
          />
          <button type="button" disabled={!branding.logo} onClick={() => apply((s) => setLogo(s, null))}>
            Remove logo
          </button>
        </div>
      </fieldset>

      <fieldset className="group">
        <legend>Colors</legend>
        <div className="colors">
          {COLOR_KEYS.map((key) => (
            <label key={key} className="color">
              <input
                type="color"
                aria-label={`${COLOR_LABELS[key]} color`}
                value={light[key]}
                onChange={(e) => apply((s) => setBrandColor(s, key, e.target.value))}
              />
              <span>{COLOR_LABELS[key]}</span>
            </label>
          ))}
        </div>
        <button type="button" onClick={() => apply(resetColors)}>
          Reset to defaults
        </button>
        <label className="check">
          <input
            type="checkbox"
            checked={branding.darkColors !== undefined}
            onChange={(e) => apply((s) => setCustomDark(s, e.target.checked))}
          />
          <span>Customize dark colors</span>
        </label>
        {branding.darkColors ? (
          <div className="colors">
            {COLOR_KEYS.map((key) => (
              <label key={key} className="color">
                <input
                  type="color"
                  aria-label={`Dark ${COLOR_LABELS[key].toLowerCase()} color`}
                  value={dark[key]}
                  onChange={(e) => apply((s) => setDarkColor(s, key, e.target.value))}
                />
                <span>{COLOR_LABELS[key]}</span>
              </label>
            ))}
          </div>
        ) : (
          <small className="field__hint">Dark colors are derived automatically from the light ones.</small>
        )}
      </fieldset>

      <label className="field">
        <span>Theme</span>
        <select value={branding.theme} onChange={(e) => apply((s) => setTheme(s, e.target.value as 'light' | 'dark' | 'auto'))}>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="auto">Auto (follow the viewer's system)</option>
        </select>
      </label>

      <fieldset className="group">
        <legend>Fonts</legend>
        {FONT_ROLES.map(([role, name]) => {
          const stack = branding.fonts[role]
          const presets = FONT_PRESETS.filter((p) => (role === 'mono' ? p.kind === 'mono' : p.kind === 'text'))
          return (
            <div key={role} className="font-role">
              <label className="field">
                <span>{name} font</span>
                <select
                  value={presetIdFor(stack)}
                  onChange={(e) => {
                    if (e.target.value !== 'custom') apply((s) => applyFontPreset(s, role, e.target.value))
                  }}
                >
                  {presets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                  {presetIdFor(stack) === 'custom' && <option value="custom">Custom</option>}
                </select>
              </label>
              <label className="field">
                <span>{name} font stack</span>
                <input
                  type="text"
                  dir="ltr"
                  value={stack}
                  onChange={(e) => apply((s) => setFontStack(s, role, e.target.value))}
                />
              </label>
            </div>
          )
        })}
        <DraftInput
          label="Web fonts (Google Fonts)"
          value={(branding.fonts.webFonts ?? []).join(', ')}
          placeholder="e.g. Inter, Cairo"
          commitOnBlur
          dir="ltr"
          validate={(t) => parseFamilies(t).every((f) => WEB_FONT_PATTERN.test(f))}
          hint="Comma-separated family names: letters, digits and spaces only."
          onCommit={(t) => apply((s) => setWebFonts(s, parseFamilies(t)))}
        />
        <small className="field__hint">Choosing a web font above adds it here. The page loads them from Google Fonts.</small>
      </fieldset>

      <fieldset className="group">
        <legend>Motion</legend>
        <label className="field">
          <span>Motion</span>
          <select
            value={branding.motion.preset}
            onChange={(e) => apply((s) => setMotionPreset(s, e.target.value as 'none' | 'fade' | 'stagger'))}
          >
            <option value="none">None</option>
            <option value="fade">Fade in</option>
            <option value="stagger">Stagger agenda cards</option>
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={branding.motion.logoAnimation}
            onChange={(e) => apply((s) => setLogoAnimation(s, e.target.checked))}
          />
          <span>Animate logo</span>
        </label>
        <small className="field__hint">Motion is skipped for viewers who prefer reduced motion, and when printing.</small>
      </fieldset>
    </section>
  )
}
