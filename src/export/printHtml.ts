/** Print an HTML document through a hidden iframe, so the user can choose "Save as PDF". */
export async function printHtml(html: string, parent: HTMLElement = document.body): Promise<void> {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.tabIndex = -1
  // Same-origin so we can reach the document; modals so print() works; no scripts.
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals')
  frame.style.cssText = 'position:fixed;inset-inline-end:0;bottom:0;width:0;height:0;border:0;visibility:hidden'

  await new Promise<void>((resolve, reject) => {
    frame.addEventListener(
      'load',
      () => {
        void (async () => {
          try {
            const win = frame.contentWindow
            if (win) {
              await win.document.fonts?.ready
              win.focus()
              win.print()
            }
          } catch (error) {
            reject(error)
          } finally {
            // Some browsers return from print() before the dialog closes; give them a moment.
            setTimeout(() => frame.remove(), 1000)
            resolve()
          }
        })()
      },
      { once: true },
    )
    frame.srcdoc = html
    parent.appendChild(frame)
  })
}
