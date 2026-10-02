/** Escaping and sanitising helpers for the HTML renderer. All user text goes through these. */

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** Escape text for use in HTML content or a quoted attribute value. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] as string)
}

/**
 * Escape, then turn `**bold**` into `<b>bold</b>`. This is the only markup supported.
 * Because escaping happens first, the only tags in the output are the `<b>` we add.
 */
export function renderInlineMarkup(value: string): string {
  return escapeHtml(value).replace(/\*\*([\s\S]+?)\*\*/g, '<b>$1</b>')
}

/**
 * Make a font-family string safe to drop into a CSS declaration: strips `{ } < > ;`,
 * backslashes, control characters and comment markers, and drops unbalanced quotes
 * so the value cannot break out of its declaration or swallow the rest of the stylesheet.
 */
export function cssFontFamily(value: string, fallback: string): string {
  let cleaned = Array.from(value)
    .filter((ch) => {
      const code = ch.charCodeAt(0)
      return code > 0x1f && code !== 0x7f && !'{}<>;\\'.includes(ch)
    })
    .join('')
  while (/\/\*|\*\//.test(cleaned)) cleaned = cleaned.replace(/\/\*|\*\//g, '')
  for (const quote of ["'", '"']) {
    if ((cleaned.split(quote).length - 1) % 2 === 1) cleaned = cleaned.split(quote).join('')
  }
  cleaned = cleaned.trim()
  return cleaned === '' ? fallback : cleaned
}

/** `#rrggbb` or the fallback. */
export function cssColor(value: string, fallback: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback
}

/** The normalised URL if it is http: or https:, otherwise null. */
export function safeHttpUrl(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

/** The value if it is a `data:image/` URI, otherwise null. */
export function safeDataImage(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.startsWith('data:image/') ? value : null
}
