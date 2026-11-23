import { useEffect, useRef, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { confirmDiscard, hasUnsavedWork } from '../unsavedWork'

// How often a long-running session asks whether a new version exists. The
// browser only checks on its own at a cold start or once a day, so a window
// left open for days would otherwise never show the banner.
const UPDATE_CHECK_MS = 60 * 60 * 1000

// If Refresh was pressed and nothing reloaded the page in this long, there was
// no new version waiting to take over; reload anyway rather than leave the
// button stuck on "Updating…".
const RELOAD_FALLBACK_MS = 8000

// registerType is 'prompt' (see vite.config.ts) precisely so this banner can
// exist: a new version never swaps in under a user mid-scan or mid-export —
// it waits until they choose to reload.
export default function UpdateBanner() {
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const [reloading, setReloading] = useState(false)
  // "Later" hides the banner for this session only. The new version is
  // still waiting, and the banner comes back the next time the app loads.
  const [later, setLater] = useState(false)
  // The new version has taken over from another tab while this one has an
  // unsaved expense open. It is not reloaded under the user; they are asked
  // to reload when they are done.
  const [reloadWhenReady, setReloadWhenReady] = useState(false)
  const updateRef = useRef<((reload?: boolean) => Promise<void>) | null>(null)
  // True once Refresh was pressed and confirmed in this tab.
  const requestedHere = useRef(false)

  useEffect(() => {
    let lastCheck = Date.now()
    let registration: ServiceWorkerRegistration | undefined
    const checkForUpdate = () => {
      if (!registration || document.visibilityState !== 'visible' || !navigator.onLine) return
      if (Date.now() - lastCheck < UPDATE_CHECK_MS) return
      lastCheck = Date.now()
      void registration.update().catch(() => {})
    }

    updateRef.current = registerSW({
      immediate: true,
      onNeedRefresh: () => setNeedsRefresh(true),
      onRegisteredSW: (_url, r) => {
        registration = r
      },
      // Called in every open tab once the new version takes control, not
      // only the one where Refresh was pressed. Left to the library, every
      // other tab reloaded at once, past the unsaved-work check below.
      onNeedReload: () => {
        if (requestedHere.current || !hasUnsavedWork()) {
          window.location.reload()
          return
        }
        setReloadWhenReady(true)
      },
    })

    document.addEventListener('visibilitychange', checkForUpdate)
    const timer = setInterval(checkForUpdate, UPDATE_CHECK_MS)
    return () => {
      document.removeEventListener('visibilitychange', checkForUpdate)
      clearInterval(timer)
    }
  }, [])

  const confirmLosingWork = () =>
    !hasUnsavedWork() ||
    window.confirm('You have an unsaved expense in progress. Reloading now will discard it. Reload anyway?')

  if (reloadWhenReady) {
    return (
      <div className="update-banner" role="alert">
        <span>A new version is running. Reload when you have saved.</span>
        <button
          type="button"
          className="btn primary small"
          onClick={() => {
            if (!confirmLosingWork()) return
            confirmDiscard()
            window.location.reload()
          }}
        >
          Reload
        </button>
      </div>
    )
  }

  if (!needsRefresh || later) return null

  const onRefresh = () => {
    // beforeunload (ExpenseEditor's own unsaved-draft guard) doesn't
    // reliably fire on iOS Safari — in a browser tab or an installed Home
    // Screen PWA, which StorageWarning actively steers users toward — so
    // this is checked and confirmed explicitly rather than relying on it
    // alone.
    if (!confirmLosingWork()) return
    // Answered here, so the browser's own leave-page prompt is not shown on
    // top of it during the reload.
    confirmDiscard()
    requestedHere.current = true
    setReloading(true)
    void updateRef.current?.(true)
    setTimeout(() => window.location.reload(), RELOAD_FALLBACK_MS)
  }

  return (
    // role="alert", not "status": a status region that mounts together with
    // its text is often not announced at all.
    <div className="update-banner" role="alert">
      <span>A new version is ready.</span>
      <button type="button" className="btn primary small" disabled={reloading} onClick={onRefresh}>
        {reloading ? 'Updating…' : 'Refresh'}
      </button>
      <button type="button" className="btn ghost small" disabled={reloading} onClick={() => setLater(true)}>
        Later
      </button>
    </div>
  )
}
