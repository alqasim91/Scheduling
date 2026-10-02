import { useState } from 'react'
import { Modal } from '../ui/Modal.tsx'

export type ExportFormat = 'html' | 'pdf'

interface Props {
  /** The schedule uses web fonts, so embedding them for offline use is possible. */
  canEmbedFonts: boolean
  onExport: (format: ExportFormat, embedFonts: boolean) => void
  onClose: () => void
}

/** Choose what to export: one HTML file (optionally with fonts embedded for offline use) or a PDF. */
export function ExportDialog({ canEmbedFonts, onExport, onClose }: Props) {
  const [format, setFormat] = useState<ExportFormat>('html')
  const [embed, setEmbed] = useState(true)

  return (
    <Modal titleId="export-title" onClose={onClose}>
      <h2 id="export-title">Export</h2>
      <form
        className="modal__form"
        onSubmit={(e) => {
          e.preventDefault()
          onExport(format, embed)
        }}
      >
        <div role="radiogroup" aria-label="Format" className="modal__form">
          <label className="choice">
            <input type="radio" name="format" checked={format === 'html'} onChange={() => setFormat('html')} />
            <span>
              <strong>HTML page</strong>
              <small>One self-contained file that highlights what is happening now.</small>
            </span>
          </label>
          <label className="choice">
            <input type="radio" name="format" checked={format === 'pdf'} onChange={() => setFormat('pdf')} />
            <span>
              <strong>PDF</strong>
              <small>Opens the print dialog; choose “Save as PDF”.</small>
            </span>
          </label>
        </div>
        {format === 'html' && (
          <label className="check">
            <input type="checkbox" checked={embed} disabled={!canEmbedFonts} onChange={(e) => setEmbed(e.target.checked)} />
            <span>Embed fonts for offline use</span>
          </label>
        )}
        <div className="modal__buttons modal__buttons--end">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary">
            Export {format === 'html' ? 'HTML' : 'PDF'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
