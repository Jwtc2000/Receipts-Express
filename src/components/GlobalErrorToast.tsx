import { useEffect, useState } from 'react'

/**
 * Last-resort safety net for writes that fail without their own error UI.
 * Many persistence calls in the app are fired as `void save…()` — a rejection
 * (e.g. QuotaExceededError from IndexedDB) otherwise surfaces nowhere and the
 * user is left believing an edit persisted when it didn't. This listens for
 * unhandled promise rejections and shows a dismissible banner, so a silent
 * write failure at least becomes visible.
 *
 * It stays up until the user dismisses it. It used to hide itself after eight
 * seconds, which meant the app's only signal that data had not been saved
 * could disappear while the user was looking at the camera or another tab —
 * a failure notice that erases itself is not a failure notice.
 */
export default function GlobalErrorToast() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onRejection = () => setVisible(true)
    window.addEventListener('unhandledrejection', onRejection)
    return () => window.removeEventListener('unhandledrejection', onRejection)
  }, [])

  if (!visible) return null

  return (
    <div className="error-toast" role="alert">
      <span>
        Something went wrong — your last change may not have been saved. The usual cause
        is this browser running out of storage room. Back up your receipts now, free up
        space on your device, then reopen the expense and check the change is there.
      </span>
      <button
        type="button"
        className="btn ghost small"
        onClick={() => setVisible(false)}
        aria-label="Dismiss"
      >
        Dismiss
      </button>
    </div>
  )
}
