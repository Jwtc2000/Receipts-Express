import { useEffect, useState } from 'react'
import { listReports } from '../db'

const SNOOZE_KEY = 'br.storageWarningDismissedAt'
// Matches WARNING_SNOOZE_MS in src/backup.ts. The eviction window this banner
// describes is about a week, so anything longer would span two of them: the
// data could be cleared, restored from a backup, and cleared again without the
// warning ever reappearing.
const SNOOZE_MS = 5 * 24 * 60 * 60 * 1000

// How often to re-check while there is still nothing to lose. The gate below
// needs data to exist before it warns, and on a first visit that only becomes
// true partway through the session — which is exactly the session where the
// warning matters most, since a brand-new user has no backup at all. Polling
// is what notices: IndexedDB fires no change events, and this banner is
// mounted beside App rather than inside it, so it can't watch report state.
// The poll stops for good the first time the count is non-zero.
const RECHECK_MS = 30 * 1000

function isInstalled(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari exposes standalone here rather than via display-mode
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

function snoozed(): boolean {
  const at = localStorage.getItem(SNOOZE_KEY)
  return at !== null && Date.now() - Number(at) < SNOOZE_MS
}

/**
 * Receipts Express keeps everything in IndexedDB with no server copy. On a
 * non-installed browser tab — Safari/iOS especially — that storage is *best
 * effort*: navigator.storage.persist() commonly returns false, and WebKit's
 * ITP evicts all site data after ~7 days without a visit. The existing
 * stale-backup card nudges backups on a timer; this banner is the missing
 * eviction-specific, install-prompting warning: it appears only when storage
 * is genuinely not persistent AND the user has data to lose.
 */
export default function StorageWarning() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!navigator.storage?.persist) return
    let cancelled = false
    let shown = false
    let timer: ReturnType<typeof setInterval> | undefined
    const stop = () => {
      if (timer !== undefined) clearInterval(timer)
      timer = undefined
    }

    const checkForData = async () => {
      const reports = await listReports()
      if (cancelled || reports.length === 0) return
      shown = true
      stop()
      setShow(true)
    }

    void (async () => {
      // Always ask for durable storage; the browser grants it silently when it
      // will (installed PWAs usually get it). We only *warn* when it's still not
      // persistent, the app isn't installed, the user hasn't snoozed, and there
      // is data to lose.
      const granted = await navigator.storage.persist()
      if (granted || cancelled || isInstalled() || snoozed()) return
      await checkForData()
      // Nothing to lose yet. Keep watching, because "yet" is the whole
      // problem: a first-time user creates their first report minutes after
      // this ran, and a check that only fired on mount would stay silent for
      // the entire session in which the data was created.
      if (!cancelled && !shown) timer = setInterval(() => void checkForData(), RECHECK_MS)
    })()

    return () => {
      cancelled = true
      stop()
    }
  }, [])

  if (!show) return null

  const dismiss = () => {
    localStorage.setItem(SNOOZE_KEY, String(Date.now()))
    setShow(false)
  }

  return (
    <div className="storage-warning" role="alert">
      <div className="storage-warning-body">
        <strong>This browser may erase your receipts.</strong>
        {/* Backing up comes first, and installing second, because only the
            backup helps if the browser clears storage tonight — installing
            improves the odds from here on, but it does nothing for data
            already sitting in a tab Safari is about to evict. */}
        <p>
          Storage here isn't guaranteed — on iPhone, Safari can clear it after about a
          week of not opening the app, with no server copy to restore from. Back up now,
          so you have a copy off this device. Then add Receipts Express to your Home
          Screen, which makes the browser more likely to keep your data.
        </p>
      </div>
      <button type="button" className="btn ghost small" onClick={dismiss}>
        Got it
      </button>
    </div>
  )
}
