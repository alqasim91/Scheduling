import { useState } from 'react'
import { resolveDirection } from '../render/locale.ts'
import type { Schedule } from '../model/schema.ts'
import { Accordion } from '../ui/Accordion.tsx'
import { Segmented } from '../ui/Segmented.tsx'
import { Board } from './board/Board.tsx'
import { BrandingPanel } from './BrandingPanel.tsx'
import { ColumnsPanel } from './ColumnsPanel.tsx'
import { EventPanel } from './EventPanel.tsx'
import { LabelsPanel } from './LabelsPanel.tsx'
import { setMode } from './ops.ts'
import { Preview } from './Preview.tsx'
import { SpeakersPanel } from './SpeakersPanel.tsx'
import { TablePanel } from './TablePanel.tsx'
import type { Apply } from './types.ts'

export type ViewMode = 'edit' | 'split' | 'preview'

interface Props {
  schedule: Schedule
  apply: Apply
  undo: () => void
  rollbackTo: (snapshot: Schedule) => void
  view: ViewMode
  /** The settings sidebar is open as a drawer (narrow screens). */
  drawerOpen: boolean
  onCloseDrawer: () => void
}

/** Sidebar (settings), the main working area (board or table) and the live preview. */
export function Editor({ schedule, apply, undo, rollbackTo, view, drawerOpen, onCloseDrawer }: Props) {
  // Preview-only choices: they are never saved into the schedule.
  const [previewTheme, setPreviewTheme] = useState<'light' | 'dark' | undefined>(undefined)
  const [replayKey, setReplayKey] = useState(0)
  const [unnamed, setUnnamed] = useState<string | null>(null)
  const isAuto = schedule.branding.theme === 'auto'
  const rtl = resolveDirection(schedule.event) === 'rtl'

  return (
    <div className="workspace" data-view={view}>
      {view !== 'preview' && (
        <>
          <aside className="sidebar" data-open={drawerOpen} aria-label="Settings">
            <Accordion initial="Event">
              <EventPanel schedule={schedule} apply={apply} />
              <BrandingPanel schedule={schedule} apply={apply} />
              <LabelsPanel schedule={schedule} apply={apply} />
              <SpeakersPanel schedule={schedule} apply={apply} undo={undo} />
            </Accordion>
          </aside>
          <div className="drawer-backdrop" data-open={drawerOpen} onClick={onCloseDrawer} aria-hidden="true" />
          <main className="main">
            <div className="main__bar">
              <Segmented
                label="Mode"
                value={schedule.mode}
                options={[
                  ['track-grid', 'Track grid'],
                  ['table', 'Table'],
                ]}
                onChange={(mode) => apply((s) => setMode(s, mode))}
              />
            </div>
            {schedule.mode === 'table' ? (
              <div className="main__scroll">
                <div className="table-editor">
                  <ColumnsPanel schedule={schedule} apply={apply} undo={undo} />
                  <TablePanel schedule={schedule} apply={apply} undo={undo} />
                </div>
              </div>
            ) : (
              <Board schedule={schedule} apply={apply} undo={undo} rollbackTo={rollbackTo} rtl={rtl} onUnnamedChange={setUnnamed} />
            )}
          </main>
        </>
      )}
      {view !== 'edit' && (
        <div className="preview-pane">
          <div className="preview-bar">
            {isAuto && (
              <div className="preview-bar__group" role="group" aria-label="Preview theme">
                <span>Preview:</span>
                {(['light', 'dark'] as const).map((theme) => (
                  <button
                    key={theme}
                    type="button"
                    className="sm"
                    aria-pressed={previewTheme === theme}
                    onClick={() => setPreviewTheme(previewTheme === theme ? undefined : theme)}
                  >
                    {theme === 'light' ? 'Light' : 'Dark'}
                  </button>
                ))}
              </div>
            )}
            <button type="button" className="sm" onClick={() => setReplayKey((k) => k + 1)}>
              Replay
            </button>
          </div>
          <Preview schedule={schedule} forceTheme={isAuto ? previewTheme : undefined} replayKey={replayKey} hideItem={unnamed} />
        </div>
      )}
    </div>
  )
}
