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
 *
 * It used to blame storage for every failure, whatever the cause. It now
 * says so only when the error is one storage raises, and otherwise says
 * plainly that something went wrong.
 */

// Error names that come from the browser's storage, where running out of room
// or losing the database is the likely story.
const STORAGE_ERRORS = new Set([
  'QuotaExceededError',
  'InvalidStateError',
  'TransactionInactiveError',
  'AbortError',
  'UnknownError',
  'VersionError',
  'DataError',
])

type Kind = 'storage' | 'other'

function kindOf(reason: unknown): Kind {
  const name = reason instanceof Error || reason instanceof DOMException ? reason.name : ''
  return STORAGE_ERRORS.has(name) ? 'storage' : 'other'
}

export default function GlobalErrorToast() {
  const [kind, setKind] = useState<Kind | null>(null)

  useEffect(() => {
    const onRejection = (event: PromiseRejectionEvent) => {
      // Kept in the console, where whoever investigates can see the cause.
      console.error('Unhandled rejection', event.reason)
      setKind((current) => (current === 'storage' ? current : kindOf(event.reason)))
    }
    window.addEventListener('unhandledrejection', onRejection)
    return () => window.removeEventListener('unhandledrejection', onRejection)
  }, [])

  if (!kind) return null

  return (
    <div className="error-toast" role="alert">
      <span>
        {kind === 'storage'
          ? 'Something went wrong saving your data — your last change may not have been saved. The usual cause is this browser running out of storage room. Back up your receipts now, free up space on your device, then reopen the expense and check the change is there.'
          : 'Something went wrong — your last action may not have finished. Reopen what you were working on and check it, and reload the app if this keeps happening.'}
      </span>
      <button type="button" className="btn ghost small" onClick={() => setKind(null)} aria-label="Dismiss">
        Dismiss
      </button>
    </div>
  )
}
