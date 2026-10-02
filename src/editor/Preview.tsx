import { useMemo } from 'react'
import type { Schedule } from '../model/schema.ts'
import { renderDocument } from '../render/renderAgenda.ts'

interface Props {
  schedule: Schedule
  /** Overrides the schedule's theme (only used while the theme is "auto"). */
  forceTheme?: 'light' | 'dark'
  /** Changing this remounts the iframe, which replays CSS motion. */
  replayKey?: number
}

export function Preview({ schedule, forceTheme, replayKey = 0 }: Props) {
  const html = useMemo(() => renderDocument(schedule, { forceTheme }), [schedule, forceTheme])
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
