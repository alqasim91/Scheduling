import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { NotifyContext, type Notification, type Notify } from './notifyContext.ts'

export const NOTIFY_MS = 6000

interface Props {
  /** The value that undoing would change; when it changes after a toast appears, the toast goes away. */
  watch: unknown
  children: ReactNode
}

/**
 * Toasts for the whole app. A toast with an Undo button takes back one edit, so it disappears as
 * soon as anything else changes (otherwise Undo would take back the wrong thing) or after 6 s.
 */
export function NotifyProvider({ watch, children }: Props) {
  const [toast, setToast] = useState<(Notification & { id: number }) | null>(null)
  const base = useRef<{ value: unknown } | null>(null)
  const counter = useRef(0)

  const notify = useCallback<Notify>((notification) => {
    base.current = null
    counter.current += 1
    setToast({ ...notification, id: counter.current })
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), NOTIFY_MS)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!toast?.action) return
    if (base.current === null) base.current = { value: watch }
    else if (base.current.value !== watch) setToast(null)
  }, [toast, watch])

  return (
    <NotifyContext.Provider value={notify}>
      {children}
      {toast && (
        <div className="toast" role="status" aria-label="Notification" key={toast.id}>
          <span>{toast.text}</span>
          {toast.action && (
            <>
              <span aria-hidden="true"> · </span>
              <button
                type="button"
                onClick={() => {
                  const run = toast.action?.run
                  setToast(null)
                  run?.()
                }}
              >
                {toast.action.label}
              </button>
            </>
          )}
        </div>
      )}
    </NotifyContext.Provider>
  )
}
