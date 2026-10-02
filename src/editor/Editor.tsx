import { useState } from 'react'
import type { Schedule } from '../model/schema.ts'
import { BrandingPanel } from './BrandingPanel.tsx'
import { ColumnsPanel } from './ColumnsPanel.tsx'
import { EventPanel } from './EventPanel.tsx'
import { Board } from './board/Board.tsx'
import { TablePanel } from './TablePanel.tsx'
import { setMode, tableColumns, trackColumns } from './ops.ts'
import { Preview } from './Preview.tsx'
import type { Apply } from './types.ts'

interface Props {
  schedule: Schedule
  apply: Apply
  undo: () => void
  rollbackTo: (snapshot: Schedule) => void
}

/** Left: editing panels. Right: live preview of the rendered agenda. */
export function Editor({ schedule, apply, undo, rollbackTo }: Props) {
  // Preview-only choices: they are never saved into the schedule.
  const [previewTheme, setPreviewTheme] = useState<'light' | 'dark' | undefined>(undefined)
  const [replayKey, setReplayKey] = useState(0)
  const isAuto = schedule.branding.theme === 'auto'

  return (
    <div className="editor">
      <div className="editor__panels">
        <div className="mode" role="group" aria-label="Mode">
          <span>Mode</span>
          {(
            [
              ['track-grid', 'Track grid'],
              ['table', 'Table'],
            ] as const
          ).map(([mode, label]) => (
            <button key={mode} type="button" aria-pressed={schedule.mode === mode} onClick={() => apply((s) => setMode(s, mode))}>
              {label}
            </button>
          ))}
        </div>
        <dl className="summary" aria-label="Schedule summary">
          <div>
            <dt>Mode</dt>
            <dd data-testid="summary-mode">{schedule.mode}</dd>
          </div>
          <div>
            <dt>Columns</dt>
            <dd data-testid="summary-columns">{(schedule.mode === 'table' ? tableColumns(schedule) : trackColumns(schedule)).length}</dd>
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
        {schedule.mode === 'table' ? (
          <TablePanel schedule={schedule} apply={apply} />
        ) : (
          <Board schedule={schedule} apply={apply} undo={undo} rollbackTo={rollbackTo} />
        )}
        <EventPanel schedule={schedule} apply={apply} />
        <ColumnsPanel schedule={schedule} apply={apply} />
        <BrandingPanel schedule={schedule} apply={apply} />
      </div>
      <div className="editor__preview">
        <div className="preview-bar">
          {isAuto && (
            <div className="preview-bar__group" role="group" aria-label="Preview theme">
              <span>Preview:</span>
              {(['light', 'dark'] as const).map((theme) => (
                <button
                  key={theme}
                  type="button"
                  aria-pressed={previewTheme === theme}
                  onClick={() => setPreviewTheme(previewTheme === theme ? undefined : theme)}
                >
                  {theme === 'light' ? 'Light' : 'Dark'}
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => setReplayKey((k) => k + 1)}>
            Replay
          </button>
        </div>
        <Preview schedule={schedule} forceTheme={isAuto ? previewTheme : undefined} replayKey={replayKey} />
      </div>
    </div>
  )
}
