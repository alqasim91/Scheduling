import type { Schedule } from '../model/schema.ts'

/**
 * Keep the shell of a schedule (event, branding, labels, locale, mode, columns, row times and
 * notes, item layout) and clear what people typed into it: item titles, speakers and tags,
 * table cells and the speakers list. An empty title is valid.
 */
export function stripContent(schedule: Schedule): Schedule {
  const copy = structuredClone(schedule)
  copy.speakers = []
  copy.rows = copy.rows.map((row) => {
    const { cells: _cells, ...rest } = row
    void _cells
    return rest
  })
  copy.items = copy.items.map((item) => {
    const { speaker: _speaker, tag: _tag, ...rest } = item
    void _speaker
    void _tag
    return { ...rest, title: '' }
  })
  return copy
}
