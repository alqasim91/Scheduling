import { useCallback, useRef, useState, type ReactNode } from 'react'
import { ConfirmContext, type Confirm, type ConfirmOptions } from './confirmContext.ts'
import { Modal } from './Modal.tsx'

/** The app's own accessible confirm dialog, in place of window.confirm. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback<Confirm>((options) => {
    resolver.current?.(false)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
      setPending(options)
    })
  }, [])

  function settle(value: boolean) {
    resolver.current?.(value)
    resolver.current = null
    setPending(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <Modal titleId="confirm-title" onClose={() => settle(false)}>
          <h2 id="confirm-title">{pending.title}</h2>
          <p className="modal__text">{pending.message}</p>
          <div className="modal__buttons modal__buttons--end">
            <button type="button" onClick={() => settle(false)}>
              {pending.cancelLabel ?? 'Cancel'}
            </button>
            <button type="button" className={pending.danger ? 'danger solid' : 'primary'} onClick={() => settle(true)}>
              {pending.confirmLabel ?? 'OK'}
            </button>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  )
}
