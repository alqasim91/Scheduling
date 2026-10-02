import { Segmented } from '../ui/Segmented.tsx'
import { MenuButton } from '../ui/Menu.tsx'
import type { ViewMode } from '../editor/Editor.tsx'

interface Props {
  onNew: () => void
  onOpen: () => void
  onSaveJson: () => void
  onSaveTemplate: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  view: ViewMode
  /** Narrow screens have no side-by-side split: the preview is a tab. */
  narrow: boolean
  onView: (view: ViewMode) => void
  status: 'saved' | 'saving'
  onExport: () => void
  exporting: boolean
  drawerOpen: boolean
  onToggleDrawer: () => void
}

/** The slim top bar: name, File menu, Undo/Redo, Edit | Split | Preview, autosave status and Export. */
export function TopBar(props: Props) {
  const options: ReadonlyArray<readonly [ViewMode, string]> = props.narrow
    ? [
        ['edit', 'Edit'],
        ['preview', 'Preview'],
      ]
    : [
        ['edit', 'Edit'],
        ['split', 'Split'],
        ['preview', 'Preview'],
      ]
  return (
    <header className="topbar">
      {props.narrow && props.view !== 'preview' && (
        <button type="button" className="topbar__drawer ghost" aria-expanded={props.drawerOpen} onClick={props.onToggleDrawer}>
          <span aria-hidden="true" className="topbar__icon">
            ☰
          </span>
          <span className="topbar__label">Settings</span>
        </button>
      )}
      <h1 className="topbar__title">Schedule Builder</h1>
      <MenuButton
        label="File"
        items={[
          { label: 'New…', onSelect: props.onNew },
          { label: 'Open…', onSelect: props.onOpen },
          { label: 'Save JSON', onSelect: props.onSaveJson },
          { label: 'Save as template…', onSelect: props.onSaveTemplate },
        ]}
      />
      <button type="button" className="ghost" onClick={props.onUndo} disabled={!props.canUndo} aria-keyshortcuts="Control+Z Meta+Z">
        <span aria-hidden="true" className="topbar__icon">
          ↶
        </span>
        <span className="topbar__label">Undo</span>
      </button>
      <button type="button" className="ghost" onClick={props.onRedo} disabled={!props.canRedo} aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y">
        <span aria-hidden="true" className="topbar__icon">
          ↷
        </span>
        <span className="topbar__label">Redo</span>
      </button>
      <span className="topbar__spacer" />
      <Segmented label="View" value={props.view} options={options} onChange={props.onView} />
      <span className="topbar__status" role="status" aria-label="Autosave status">
        {props.status === 'saved' ? 'Saved' : 'Saving…'}
      </span>
      <button type="button" className="primary" onClick={props.onExport} disabled={props.exporting}>
        Export
      </button>
    </header>
  )
}
