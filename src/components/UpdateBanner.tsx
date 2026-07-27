import { useEffect, useRef, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { hasUnsavedWork } from '../unsavedWork'

// registerType is 'prompt' (see vite.config.ts) precisely so this banner can
// exist: a new version never swaps in under a user mid-scan or mid-export —
// it waits until they choose to reload.
export default function UpdateBanner() {
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const [reloading, setReloading] = useState(false)
  const updateRef = useRef<((reload?: boolean) => Promise<void>) | null>(null)

  useEffect(() => {
    updateRef.current = registerSW({
      immediate: true,
      onNeedRefresh: () => setNeedsRefresh(true)
    })
  }, [])

  if (!needsRefresh) return null

  const onRefresh = () => {
    // beforeunload (ExpenseEditor's own unsaved-draft guard) doesn't
    // reliably fire on iOS Safari — in a browser tab or an installed Home
    // Screen PWA, which StorageWarning actively steers users toward — so
    // this is checked and confirmed explicitly rather than relying on it
    // alone.
    if (
      hasUnsavedWork() &&
      !window.confirm('You have an unsaved expense in progress. Reloading now will discard it. Reload anyway?')
    ) {
      return
    }
    setReloading(true)
    updateRef.current?.(true)
  }

  return (
    <div className="update-banner">
      <span>A new version is ready.</span>
      <button type="button" className="btn primary small" disabled={reloading} onClick={onRefresh}>
        {reloading ? 'Updating…' : 'Refresh'}
      </button>
    </div>
  )
}
