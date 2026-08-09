import { useEffect, useId, useRef, useState } from 'react'
import type { Expense } from '../types'
import { CATEGORIES, newId, todayIso } from '../types'
import { getExpense, saveExpenseWithImage, getImage, nextPosition } from '../db'
import { compressImage } from '../image'
import { isPdfFile } from '../pdfDetect'
import { extractReceipt } from '../ocr'
import { setHasUnsavedWork } from '../unsavedWork'
import Icon from './icons'
import { HeaderPlanes } from './decorative'

interface Props {
  reportId: string
  expenseId?: string
  onDone: () => void
}

interface Draft {
  title: string
  merchant: string
  amount: string
  currency: string
  date: string
  category: string
  notes: string
  personalAmount: string
}

/** The fields save() can reject, and so the fields it can send focus back to. */
type InvalidField = 'title' | 'amount' | 'personalAmount'

/**
 * Longest text any free-text field here may hold. It has to match
 * MAX_STRING_LENGTH in backup.ts, which is what the restore path enforces:
 * with no cap at entry, a long note produced a backup file the app's own
 * importer then refused, and the user's only copy of their data was
 * unreadable by the app that wrote it. Capping at entry rather than raising
 * the importer's limit, because the limit is what keeps a hostile file from
 * carrying megabyte-long strings into storage, and nothing a person types
 * into a receipt field comes near 2,000 characters anyway.
 *
 * Kept as a literal rather than imported from backup.ts so this screen
 * doesn't pull the whole export/restore module in for one number — if that
 * limit moves, this has to move with it.
 */
const MAX_FIELD_LENGTH = 2000

const emptyDraft: Draft = {
  title: '',
  merchant: '',
  amount: '',
  currency: 'USD',
  // Overwritten with todayIso() at mount time below — this placeholder is
  // never shown. A frozen value here would go stale for a session that
  // spans local midnight without a full reload.
  date: '',
  category: 'Other',
  notes: '',
  personalAmount: '',
}

export default function ExpenseEditor({ reportId, expenseId, onDone }: Props) {
  const [draft, setDraft] = useState<Draft>(() => ({ ...emptyDraft, date: todayIso() }))
  const [existing, setExisting] = useState<Expense | null>(null)
  const [imageBlob, setImageBlob] = useState<Blob | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  // Pages 2+ of a multi-page receipt (e.g. an uploaded PDF) — empty for a
  // single photo or single-page PDF.
  const [extraImageBlobs, setExtraImageBlobs] = useState<Blob[]>([])
  const [extraImageUrls, setExtraImageUrls] = useState<string[]>([])
  const [imageChanged, setImageChanged] = useState(false)
  const [scanState, setScanState] = useState<'idle' | 'scanning' | 'done' | 'failed'>('idle')
  const [scanPct, setScanPct] = useState(0)
  // True while a picked file is being rendered/compressed, before OCR even
  // starts — the only feedback during that stretch otherwise was none at
  // all, which is also the window a second, faster pick could race into.
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [captureError, setCaptureError] = useState<string | null>(null)
  // What save() rejected, if anything. Save stays enabled and reports the
  // reason here — a disabled button explains nothing, and a screen-reader user
  // got no way at all to find out why it wouldn't press.
  const [invalid, setInvalid] = useState<{ field: InvalidField; message: string } | null>(null)
  // True once the user has typed a field or attached/removed a photo — i.e. there
  // is unsaved work that Back / tab-close / a service-worker reload would discard.
  const [dirty, setDirty] = useState(false)
  const cameraInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const titleInput = useRef<HTMLInputElement>(null)
  const amountInput = useRef<HTMLInputElement>(null)
  const personalAmountInput = useRef<HTMLInputElement>(null)
  const errorId = useId()
  // Bumped on every pick; a still-in-flight pick whose generation no longer
  // matches when it resolves has been superseded by a newer one and must
  // not overwrite whatever the newer pick already applied.
  const pickGenRef = useRef(0)
  // Synchronous re-entry lock for save() — the `saving` state above only
  // takes effect after a render commits, which doesn't block two save()
  // calls dispatched within the same tick (e.g. a fast double-tap).
  const submittingRef = useRef(false)

  useEffect(() => {
    if (!expenseId) return
    void (async () => {
      const expense = await getExpense(expenseId)
      if (!expense) return
      setExisting(expense)
      setDraft({
        title: expense.title,
        merchant: expense.merchant,
        amount: expense.amount ? String(expense.amount) : '',
        currency: expense.currency,
        date: expense.date,
        category: expense.category,
        notes: expense.notes,
        personalAmount: expense.personalAmount ? String(expense.personalAmount) : '',
      })
      if (expense.imageId) {
        const img = await getImage(expense.imageId)
        if (img) {
          setImageBlob(img.blob)
          setImageUrl(URL.createObjectURL(img.blob))
        }
      }
      if (expense.extraImageIds?.length) {
        const extras = await Promise.all(expense.extraImageIds.map((id) => getImage(id)))
        const blobs = extras.filter((img): img is NonNullable<typeof img> => !!img).map((img) => img.blob)
        setExtraImageBlobs(blobs)
        setExtraImageUrls(blobs.map((b) => URL.createObjectURL(b)))
      }
    })()
  }, [expenseId])

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl)
    }
  }, [imageUrl])

  useEffect(() => {
    return () => {
      for (const url of extraImageUrls) URL.revokeObjectURL(url)
    }
  }, [extraImageUrls])

  // Warn the browser before it unloads (tab close, refresh, PWA back-gesture, or
  // the service-worker update reload) while there's an unsaved draft — otherwise
  // the typed fields and captured photo are gone with no confirmation.
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  // Mirrors `dirty` into a module-level signal UpdateBanner can check — it's
  // an unrelated sibling with no shared state, and beforeunload above isn't
  // reliable on iOS Safari (browser tab or installed Home Screen PWA).
  useEffect(() => {
    setHasUnsavedWork(dirty)
  }, [dirty])
  useEffect(() => {
    return () => setHasUnsavedWork(false)
  }, [])

  // Send focus to the field that was rejected, after the message it points at
  // has rendered. A fresh object is stored on every rejection, so pressing
  // Save again with the same problem still moves focus back rather than
  // leaving the user wondering whether anything happened.
  useEffect(() => {
    if (!invalid) return
    const inputs: Record<InvalidField, typeof titleInput> = {
      title: titleInput,
      amount: amountInput,
      personalAmount: personalAmountInput,
    }
    inputs[invalid.field].current?.focus()
  }, [invalid])

  const set = (patch: Partial<Draft>) => {
    setDirty(true)
    // Typing is the user answering the message, so clear it rather than
    // leaving a complaint on screen about a value they have since changed.
    setInvalid(null)
    setDraft((d) => ({ ...d, ...patch }))
  }

  const onImagePicked = async (file: File | undefined) => {
    if (!file) return
    setCaptureError(null)
    // Bump the generation before any await — if a second pick starts before
    // this one resolves, this run's `gen` stops matching pickGenRef.current
    // and every check below skips applying its (now-stale) result instead
    // of overwriting whatever the newer pick already applied.
    const gen = ++pickGenRef.current
    setPicking(true)
    // Rendering/compression can genuinely fail (an unsupported photo format
    // like HEIC on some browsers, a corrupt file, a password-protected or
    // malformed PDF, or canvas.toBlob returning null). Without this catch
    // the rejection was swallowed by the `void onImagePicked(...)` caller
    // and the freshly picked receipt vanished with no message.
    let pages: Blob[]
    try {
      if (isPdfFile(file)) {
        // Loaded on demand so the PDF.js engine — sizeable — never ships to
        // someone who only ever attaches photos.
        const { renderPdfPages } = await import('../pdfReceipt')
        pages = await renderPdfPages(file)
      } else {
        pages = [await compressImage(file)]
      }
    } catch (err) {
      if (gen !== pickGenRef.current) return
      setPicking(false)
      const tooManyPages = err instanceof Error && err.name === 'PdfTooManyPages'
      setCaptureError(
        tooManyPages
          ? err.message
          : isPdfFile(file)
            ? "Couldn't read that PDF — it may be password-protected or corrupted. Try again, or pick a different file."
            : "Couldn't process that photo — try again, or pick a different image.",
      )
      return
    }
    if (gen !== pickGenRef.current) return
    const [firstPage, ...restPages] = pages
    setDirty(true)
    setImageBlob(firstPage)
    setImageChanged(true)
    setImageUrl((old) => {
      if (old) URL.revokeObjectURL(old)
      return URL.createObjectURL(firstPage)
    })
    setExtraImageBlobs(restPages)
    setExtraImageUrls((old) => {
      for (const url of old) URL.revokeObjectURL(url)
      return restPages.map((b) => URL.createObjectURL(b))
    })
    // The picked file is fully rendered/compressed and attached — the race
    // window `picking` guards against is over, so it's safe to save again
    // even though OCR (below) is still running in the background.
    setPicking(false)

    // Auto-extract details with on-device OCR, from the receipt's first page
    setScanState('scanning')
    setScanPct(0)
    try {
      const extracted = await extractReceipt(firstPage, setScanPct)
      if (gen !== pickGenRef.current) return
      setDraft((d) => ({
        ...d,
        merchant: extracted.merchant ?? d.merchant,
        title: d.title || extracted.merchant || '',
        amount: extracted.total !== undefined ? extracted.total.toFixed(2) : d.amount,
        date: extracted.date ?? d.date,
      }))
      setScanState('done')
    } catch {
      // The receipt is already attached; OCR failing just means manual entry.
      if (gen === pickGenRef.current) setScanState('failed')
    }
  }

  const removeImage = () => {
    // Invalidate any pick still in flight so its result can't land after
    // the user has explicitly removed the receipt.
    pickGenRef.current++
    setPicking(false)
    setDirty(true)
    setImageBlob(null)
    setImageChanged(true)
    setExtraImageBlobs([])
    setExtraImageUrls((old) => {
      for (const url of old) URL.revokeObjectURL(url)
      return []
    })
    setImageUrl((old) => {
      if (old) URL.revokeObjectURL(old)
      return null
    })
    setScanState('idle')
  }

  const handleBack = () => {
    if (dirty && !window.confirm('Discard this expense? Your typed details and photo will be lost.')) {
      return
    }
    onDone()
  }

  const save = async () => {
    // Synchronous re-entry lock: `saving` (below) only takes effect once a
    // render commits, which doesn't stop two save() calls dispatched in the
    // same tick (e.g. a fast double-tap) from both passing the disabled
    // check and each creating their own duplicate expense record.
    if (submittingRef.current) return

    const amount = parseFloat(draft.amount)
    // Number.isFinite rather than isNaN: a number input accepts "1e999", which
    // parses to Infinity. That saves, then fails the importer's Number.isFinite
    // check when the user restores their own backup.
    if (!Number.isFinite(amount)) {
      setInvalid({ field: 'amount', message: 'Enter the amount on the receipt before saving.' })
      return
    }
    // A negative total is caught here, against the Amount field. It used to
    // fall through to the personal-amount comparison below, where the default
    // personal amount of 0 is greater than any negative total — so the save was
    // rejected, the message blamed a field the user had never typed in, and
    // focus jumped there. Nothing they could type in that field helped:
    // anything >= 0 still exceeds a negative total, and anything < 0 is
    // rejected by the check just above it, so the expense could not be saved at
    // all. Rejected rather than accepted because the rest of the app takes an
    // amount to be non-negative — the input carries min="0", the personal
    // portion is capped by it, and report totals sum them.
    if (amount < 0) {
      setInvalid({
        field: 'amount',
        message: "The amount can't be negative — enter the total on the receipt.",
      })
      return
    }
    if (!draft.title.trim() && !draft.merchant.trim()) {
      setInvalid({ field: 'title', message: 'Enter a title or a merchant before saving.' })
      return
    }
    // The personal portion used to be clamped into [0, amount] silently, which
    // saved a number the user never typed — an entry of 80 against a $50
    // receipt became 50, and nothing said so. Reject it and let them decide
    // which of the two figures is wrong.
    const typedPersonal = draft.personalAmount.trim()
    const personalAmount = typedPersonal ? parseFloat(typedPersonal) : 0
    if (!Number.isFinite(personalAmount) || personalAmount < 0) {
      setInvalid({
        field: 'personalAmount',
        message: 'The personal amount has to be a number, and not less than zero.',
      })
      return
    }
    if (personalAmount > amount) {
      setInvalid({
        field: 'personalAmount',
        message: `The personal amount can't be more than the expense total of ${amount.toFixed(2)}.`,
      })
      return
    }
    setInvalid(null)

    submittingRef.current = true
    setSaving(true)
    setSaveError(null)
    try {
      // When this tab isn't touching the receipt image, re-fetch the
      // current record rather than trusting `existing` (captured when this
      // tab loaded) — otherwise saving an unrelated field edit (e.g. Notes)
      // after another tab/session replaced the image would silently revert
      // the expense back to the image that replacement just deleted.
      const latest = imageChanged || !existing ? existing : await getExpense(existing.id)
      const previousImageId = latest?.imageId
      const previousExtraImageIds = latest?.extraImageIds ?? []
      // Three cases: untouched (keep imageId/extraImageIds as-is); replaced
      // with new pages (fresh ids for every page, all old pages deleted);
      // removed entirely (ids cleared, old pages deleted). imageChanged
      // with a null blob means the user explicitly removed the receipt,
      // not that nothing changed.
      let imageId = previousImageId
      let extraImageIds = previousExtraImageIds.length ? previousExtraImageIds : undefined
      const newImages: { id: string; blob: Blob }[] = []
      let staleImageIds: string[] = []
      if (imageChanged) {
        staleImageIds = [previousImageId, ...previousExtraImageIds].filter((id): id is string => !!id)
        if (imageBlob) {
          imageId = newId()
          newImages.push({ id: imageId, blob: imageBlob })
          extraImageIds = extraImageBlobs.length
            ? extraImageBlobs.map((blob) => {
                const id = newId()
                newImages.push({ id, blob })
                return id
              })
            : undefined
        } else {
          imageId = undefined
          extraImageIds = undefined
        }
      }
      const expense: Expense = {
        id: existing?.id ?? newId(),
        reportId: existing?.reportId ?? reportId,
        position: existing?.position ?? (await nextPosition(reportId)),
        title: draft.title.trim() || draft.merchant.trim(),
        merchant: draft.merchant.trim(),
        amount,
        currency: draft.currency.trim().toUpperCase() || 'USD',
        date: draft.date,
        category: draft.category,
        notes: draft.notes.trim(),
        imageId,
        extraImageIds,
        createdAt: existing?.createdAt ?? Date.now(),
        personalAmount,
      }
      await saveExpenseWithImage(expense, newImages, staleImageIds)
      setDirty(false)
      onDone()
    } catch (err) {
      // The write failed (most commonly QuotaExceededError on a near-full
      // device, where an IndexedDB transaction aborts). Keep the editor open
      // with the draft intact and tell the user, instead of silently returning
      // to a state that looks like a successful save.
      setSaveError(
        (err as DOMException)?.name === 'QuotaExceededError'
          ? "Couldn't save — this device's storage is full. Free up space, or remove the photo and try again."
          : "Couldn't save — something went wrong. Your details are still here; please try again.",
      )
    } finally {
      setSaving(false)
      submittingRef.current = false
    }
  }

  return (
    <>
      <header className="topbar">
        <HeaderPlanes />
        <button className="icon-btn" onClick={handleBack} aria-label="Back">
          <Icon name="chevron-left" size={22} />
        </button>
        <h1>{expenseId ? 'Edit Expense' : 'New Expense'}</h1>
        {/* Enabled whatever the draft looks like — the two remaining disabled
            states are transient (a save in flight, a file still being
            processed), not a judgement on what has been typed. save() checks
            the fields and says what is wrong. */}
        <button className="btn primary small" onClick={() => void save()} disabled={saving || picking}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </header>

      <main className="content editor">
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            // Clear the value so re-picking the *same* file (e.g. after a failed
            // capture) still fires onChange instead of silently doing nothing.
            e.target.value = ''
            void onImagePicked(file)
          }}
        />
        <input
          ref={fileInput}
          type="file"
          accept="image/*,application/pdf"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            void onImagePicked(file)
          }}
        />

        {imageUrl ? (
          <div className="receipt-preview">
            <div className="receipt-preview-main">
              <img src={imageUrl} alt="Receipt, page 1" />
              {extraImageUrls.length > 0 && (
                <span className="page-badge">{extraImageUrls.length + 1} pages</span>
              )}
            </div>
            {extraImageUrls.length > 0 && (
              // Intentionally no per-page delete/reorder control here — the
              // only removal affordance for a multi-page receipt is the
              // whole-receipt Remove button below. A wrong/blank page means
              // Remove + re-pick the corrected file; scoped out rather than
              // half-built.
              <div className="receipt-pages">
                {extraImageUrls.map((url, i) => (
                  <div className="receipt-page-thumb" key={url}>
                    <img src={url} alt={`Receipt, page ${i + 2}`} />
                    <span>{i + 2}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="preview-actions">
              <button className="btn ghost small with-icon" disabled={picking} onClick={() => cameraInput.current?.click()}>
                <Icon name="camera" size={16} /> Retake
              </button>
              <button className="btn ghost small with-icon" disabled={picking} onClick={() => fileInput.current?.click()}>
                <Icon name="file" size={16} /> Replace
              </button>
              <button className="btn ghost small with-icon" disabled={picking} onClick={removeImage}>
                <Icon name="trash" size={16} /> Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="capture-buttons">
            <button className="capture-btn" disabled={picking} onClick={() => cameraInput.current?.click()}>
              <span className="capture-icon">
                <Icon name="camera" size={32} />
              </span>
              Scan with camera
            </button>
            <button className="capture-btn" disabled={picking} onClick={() => fileInput.current?.click()}>
              <span className="capture-icon">
                <Icon name="file" size={32} />
              </span>
              Choose photo or PDF
            </button>
          </div>
        )}

        {/* role="status" on each state of the scan banner: what the OCR pass
            is doing, and what it found, is otherwise reported only by the
            banner appearing on screen. It's a status rather than an alert
            because none of it interrupts anything — the fields it fills in are
            right below, and every one of them can still be edited by hand. */}
        {picking && scanState !== 'scanning' && (
          <div className="scan-banner" role="status">
            <div className="spinner" />
            Processing file…
          </div>
        )}
        {scanState === 'scanning' && (
          <div className="scan-banner" role="status">
            <div className="spinner" />
            Reading receipt… {scanPct}%
          </div>
        )}
        {scanState === 'done' && (
          <div className="scan-banner success" role="status">
            Details extracted — review and adjust below
          </div>
        )}
        {scanState === 'failed' && (
          <div className="scan-banner warn" role="status">
            Couldn't read the receipt — enter details manually
          </div>
        )}
        {captureError && (
          <div className="scan-banner warn" role="alert">{captureError}</div>
        )}
        {saveError && (
          <div className="scan-banner warn" role="alert">{saveError}</div>
        )}
        {invalid && (
          <div className="scan-banner warn" role="alert" id={errorId}>
            {invalid.message}
          </div>
        )}

        <div className="field-grid">
          <label className="field span-2">
            <span>Title</span>
            <input
              ref={titleInput}
              maxLength={MAX_FIELD_LENGTH}
              placeholder="e.g. Team lunch"
              aria-invalid={invalid?.field === 'title' || undefined}
              aria-describedby={invalid?.field === 'title' ? errorId : undefined}
              value={draft.title}
              onChange={(e) => set({ title: e.target.value })}
            />
          </label>
          <label className="field span-2">
            <span>Merchant</span>
            <input
              maxLength={MAX_FIELD_LENGTH}
              placeholder="e.g. Joe's Diner"
              value={draft.merchant}
              onChange={(e) => set({ merchant: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Amount</span>
            <input
              ref={amountInput}
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="0.00"
              aria-invalid={invalid?.field === 'amount' || undefined}
              aria-describedby={invalid?.field === 'amount' ? errorId : undefined}
              value={draft.amount}
              onChange={(e) => set({ amount: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Currency</span>
            <input
              maxLength={3}
              placeholder="USD"
              value={draft.currency}
              onChange={(e) => set({ currency: e.target.value.toUpperCase() })}
            />
          </label>
          <label className="field span-2">
            <span>Personal amount (pay back to company)</span>
            <input
              ref={personalAmountInput}
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              max={draft.amount || undefined}
              placeholder="0.00"
              aria-invalid={invalid?.field === 'personalAmount' || undefined}
              aria-describedby={invalid?.field === 'personalAmount' ? errorId : undefined}
              value={draft.personalAmount}
              onChange={(e) => set({ personalAmount: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Date</span>
            <input type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} />
          </label>
          <label className="field">
            <span>Category</span>
            <select value={draft.category} onChange={(e) => set({ category: e.target.value })}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="field span-2">
            <span>Notes</span>
            <textarea
              rows={3}
              maxLength={MAX_FIELD_LENGTH}
              placeholder="Optional details for the report"
              value={draft.notes}
              onChange={(e) => set({ notes: e.target.value })}
            />
          </label>
        </div>
      </main>
    </>
  )
}
