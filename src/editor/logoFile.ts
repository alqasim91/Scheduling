export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'] as const
export const MAX_LOGO_BYTES = 512 * 1024

/** An error message for a file that cannot be used as a logo, or null when it is fine. */
export function validateLogoFile(file: { type: string; size: number }): string | null {
  if (!(LOGO_TYPES as readonly string[]).includes(file.type)) {
    return 'Logo must be a PNG, JPEG, WebP, GIF or SVG image.'
  }
  if (file.size > MAX_LOGO_BYTES) {
    return `Logo is too large (${Math.round(file.size / 1024)} KB). The limit is ${MAX_LOGO_BYTES / 1024} KB.`
  }
  return null
}

export function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}
