import { useMemo } from 'react'
import type { Schedule } from '../model/schema.ts'
import { renderDocument } from '../render/renderAgenda.ts'

interface Props {
  schedule: Schedule
  /** Overrides the schedule's theme (only used while the theme is "auto"). */
  forceTheme?: 'light' | 'dark'
  /** Changing this remounts the iframe, which replays CSS motion. */
  replayKey?: number
  /** A session to leave out for now (a new one that has no title yet). Never applies to exports. */
  hideItem?: string | null
}

export function Preview({ schedule, forceTheme, replayKey = 0, hideItem = null }: Props) {
  const html = useMemo(() => renderDocument(schedule, { forceTheme, hideItems: hideItem ? [hideItem] : undefined }), [schedule, forceTheme, hideItem])
  return (
    <iframe
      key={replayKey}
      className="preview"
      title="Preview"
      srcDoc={html}
      sandbox="allow-popups allow-popups-to-escape-sandbox"
    />
  )
}
