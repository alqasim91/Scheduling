/** Default branding values. The single source for the schema defaults, the empty schedule and the editor. */

export interface BrandColors {
  primary: string
  accent: string
  background: string
  surface: string
  text: string
  muted: string
  line: string
  note: string
}

export const DEFAULT_COLORS: BrandColors = {
  primary: '#0b57d0',
  accent: '#d93025',
  background: '#f8fafd',
  surface: '#ffffff',
  text: '#1f1f1f',
  muted: '#444746',
  line: '#c4c7c5',
  note: '#f9ab00',
}

export const DEFAULT_LOGO_HEIGHT = 40

export const SYSTEM_SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
export const SYSTEM_SERIF = "Georgia, 'Times New Roman', serif"
export const SYSTEM_MONO = 'ui-monospace, Menlo, Consolas, monospace'

export const DEFAULT_FONTS = { display: SYSTEM_SANS, body: SYSTEM_SANS, mono: SYSTEM_MONO }
