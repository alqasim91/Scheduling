/** Short unique id with a readable prefix, e.g. `col_3f9a1c2b`. */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`
}
