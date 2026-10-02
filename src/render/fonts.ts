/** Font presets, generic fallbacks and the Google Fonts stylesheet URL. */
import { SYSTEM_MONO, SYSTEM_SANS, SYSTEM_SERIF } from '../model/brandDefaults.ts'

export interface FontPreset {
  id: string
  label: string
  /** Which roles it suits: text faces for display/body, monospace for the mono role. */
  kind: 'text' | 'mono'
  stack: string
  /** Google Fonts family to load, absent for system fonts. */
  webFont?: string
  /** Weights to request; some families (Lato) have no 500. */
  weights?: string
}

const sans = (name: string) => `'${name}', system-ui, -apple-system, 'Segoe UI', sans-serif`
const arabic = (name: string) => `'${name}', 'Segoe UI', Tahoma, system-ui, sans-serif`
const mono = (name: string) => `'${name}', ui-monospace, Menlo, Consolas, monospace`

export const FONT_PRESETS: readonly FontPreset[] = [
  { id: 'system-sans', label: 'System sans', kind: 'text', stack: SYSTEM_SANS },
  { id: 'system-serif', label: 'System serif', kind: 'text', stack: SYSTEM_SERIF },
  { id: 'system-mono', label: 'System mono', kind: 'mono', stack: SYSTEM_MONO },
  { id: 'inter', label: 'Inter', kind: 'text', stack: sans('Inter'), webFont: 'Inter', weights: '400;500;700' },
  { id: 'roboto', label: 'Roboto', kind: 'text', stack: sans('Roboto'), webFont: 'Roboto', weights: '400;500;700' },
  { id: 'poppins', label: 'Poppins', kind: 'text', stack: sans('Poppins'), webFont: 'Poppins', weights: '400;500;700' },
  { id: 'montserrat', label: 'Montserrat', kind: 'text', stack: sans('Montserrat'), webFont: 'Montserrat', weights: '400;500;700' },
  { id: 'lato', label: 'Lato', kind: 'text', stack: sans('Lato'), webFont: 'Lato', weights: '400;700' },
  { id: 'open-sans', label: 'Open Sans', kind: 'text', stack: sans('Open Sans'), webFont: 'Open Sans', weights: '400;500;700' },
  { id: 'cairo', label: 'Cairo (Arabic)', kind: 'text', stack: arabic('Cairo'), webFont: 'Cairo', weights: '400;500;700' },
  { id: 'tajawal', label: 'Tajawal (Arabic)', kind: 'text', stack: arabic('Tajawal'), webFont: 'Tajawal', weights: '400;500;700' },
  {
    id: 'noto-sans-arabic',
    label: 'Noto Sans Arabic',
    kind: 'text',
    stack: arabic('Noto Sans Arabic'),
    webFont: 'Noto Sans Arabic',
    weights: '400;500;700',
  },
  {
    id: 'ibm-plex-sans-arabic',
    label: 'IBM Plex Sans Arabic',
    kind: 'text',
    stack: arabic('IBM Plex Sans Arabic'),
    webFont: 'IBM Plex Sans Arabic',
    weights: '400;500;700',
  },
  { id: 'roboto-mono', label: 'Roboto Mono', kind: 'mono', stack: mono('Roboto Mono'), webFont: 'Roboto Mono', weights: '400;500;700' },
  { id: 'jetbrains-mono', label: 'JetBrains Mono', kind: 'mono', stack: mono('JetBrains Mono'), webFont: 'JetBrains Mono', weights: '400;500;700' },
]

export const WEB_FONT_PATTERN = /^[A-Za-z0-9 ]{1,40}$/

/** The preset whose stack equals this value, if any. */
export function presetForStack(stack: string): FontPreset | undefined {
  return FONT_PRESETS.find((p) => p.stack === stack)
}

const GENERIC_FAMILIES = ['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-monospace', 'ui-sans-serif', 'ui-serif']

/** Make sure a font stack ends in a generic family. */
export function withGenericFallback(stack: string, generic: 'sans-serif' | 'monospace'): string {
  const last = stack.split(',').pop()?.trim().toLowerCase() ?? ''
  return GENERIC_FAMILIES.includes(last) ? stack : `${stack}, ${generic}`
}

/** One Google Fonts stylesheet URL for the families, or null when there is nothing valid to load. */
export function googleFontsUrl(families: readonly string[] | undefined): string | null {
  const unique = [...new Set((families ?? []).filter((f) => WEB_FONT_PATTERN.test(f)))]
  if (unique.length === 0) return null
  const parts = unique.map((family) => {
    const weights = FONT_PRESETS.find((p) => p.webFont === family)?.weights
    const name = family.trim().replace(/ +/g, '+')
    return weights ? `family=${name}:wght@${weights}` : `family=${name}`
  })
  return `https://fonts.googleapis.com/css2?${parts.join('&')}&display=swap`
}
