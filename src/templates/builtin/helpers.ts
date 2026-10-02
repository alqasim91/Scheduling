import type { Branding, Item } from '../../model/schema.ts'
import { SYSTEM_MONO, SYSTEM_SANS } from '../../model/brandDefaults.ts'

type Colors = Branding['colors']

/** Branding with system fonts, light/dark auto and no motion; each template supplies its own palette. */
export function brand(colors: Colors, fonts: Partial<Branding['fonts']> = {}): Branding {
  return {
    logo: null,
    colors,
    fonts: { display: SYSTEM_SANS, body: SYSTEM_SANS, mono: SYSTEM_MONO, ...fonts },
    theme: 'auto',
    motion: { preset: 'none', logoAnimation: false },
  }
}

type ItemInit = Omit<Item, 'variant'> & { variant?: Item['variant'] }

/** An item that defaults to a session. */
export function item(init: ItemInit): Item {
  return { variant: 'session', ...init }
}
