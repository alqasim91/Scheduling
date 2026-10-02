import type { Dispatch, SetStateAction } from 'react'
import type { Schedule } from '../model/schema.ts'
import { ColumnsPanel } from './ColumnsPanel.tsx'
import { EventPanel } from './EventPanel.tsx'
import { GridPanel } from './GridPanel.tsx'
import { Preview } from './Preview.tsx'
import type { Apply } from './types.ts'

interface Props {
  schedule: Schedule
  setSchedule: Dispatch<SetStateAction<Schedule>>
}

/** Left: editing panels. Right: live preview of the rendered agenda. */
export function Editor({ schedule, setSchedule }: Props) {
  const apply: Apply = (op) => setSchedule((current) => op(current))

  return (
    <div className="editor">
      <div className="editor__panels">
        <dl className="summary" aria-label="Schedule summary">
          <div>
            <dt>Mode</dt>
            <dd data-testid="summary-mode">{schedule.mode}</dd>
          </div>
          <div>
            <dt>Columns</dt>
            <dd data-testid="summary-columns">{schedule.columns.length}</dd>
          </div>
          <div>
            <dt>Rows</dt>
            <dd data-testid="summary-rows">{schedule.rows.length}</dd>
          </div>
          <div>
            <dt>Items</dt>
            <dd data-testid="summary-items">{schedule.items.length}</dd>
          </div>
        </dl>
        <EventPanel schedule={schedule} apply={apply} />
        <ColumnsPanel schedule={schedule} apply={apply} />
        <GridPanel schedule={schedule} apply={apply} />
      </div>
      <div className="editor__preview">
        <Preview schedule={schedule} />
      </div>
    </div>
  )
}
