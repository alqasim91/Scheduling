import { useMemo } from 'react'
import type { Schedule } from '../model/schema.ts'
import { renderDocument } from '../render/renderAgenda.ts'

export function Preview({ schedule }: { schedule: Schedule }) {
  const html = useMemo(() => renderDocument(schedule), [schedule])
  return (
    <iframe
      className="preview"
      title="Preview"
      srcDoc={html}
      sandbox="allow-popups allow-popups-to-escape-sandbox"
    />
  )
}
