import type { Report, Expense, ReceiptImage } from './types'
import { listReports, listAllExpenses, listAllImages, importBackupData } from './db'
import { blobToDataURL } from './image'
import { shareOrDownloadFile } from './share'

const APP_ID = 'receipts-express'
// Backups written before the rename carry the old id; still accepted on import.
const LEGACY_APP_IDS = ['best-receipts']

export interface BackupFile {
  app: string
  version: 1
  exportedAt: string
  reports: Report[]
  expenses: Expense[]
  images: { id: string; dataUrl: string }[]
}

// Only ever decode embedded base64 image data — never fetch a URL from the
// backup file. That's what keeps "nothing leaves your device" true even for
// a hostile/corrupted backup: a crafted `dataUrl` can't turn into an outbound
// network request.
const DATA_URL_RE = /^data:image\/(png|jpeg|jpg|webp|gif);base64,([a-zA-Z0-9+/]+=?=?)$/
const MAX_IMAGE_BYTES = 15 * 1024 * 1024 // generous ceiling for one receipt photo
const MAX_IMAGES = 5000
const MAX_TOTAL_IMAGE_BYTES = 500 * 1024 * 1024

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isValidReport(v: unknown): v is Report {
  return (
    isPlainObject(v) &&
    typeof v.id === 'string' &&
    v.id.length > 0 &&
    typeof v.name === 'string' &&
    typeof v.createdAt === 'number' &&
    Number.isFinite(v.createdAt) &&
    (v.startDate === undefined || typeof v.startDate === 'string') &&
    (v.endDate === undefined || typeof v.endDate === 'string') &&
    (v.dailyMealAllowance === undefined ||
      (typeof v.dailyMealAllowance === 'number' && Number.isFinite(v.dailyMealAllowance)))
  )
}

function isValidExpense(v: unknown): v is Expense {
  return (
    isPlainObject(v) &&
    typeof v.id === 'string' &&
    v.id.length > 0 &&
    typeof v.reportId === 'string' &&
    v.reportId.length > 0 &&
    typeof v.position === 'number' &&
    Number.isFinite(v.position) &&
    typeof v.title === 'string' &&
    typeof v.merchant === 'string' &&
    typeof v.amount === 'number' &&
    Number.isFinite(v.amount) &&
    typeof v.currency === 'string' &&
    typeof v.date === 'string' &&
    typeof v.category === 'string' &&
    typeof v.notes === 'string' &&
    (v.imageId === undefined || typeof v.imageId === 'string') &&
    (v.extraImageIds === undefined ||
      (Array.isArray(v.extraImageIds) && v.extraImageIds.every((x) => typeof x === 'string'))) &&
    typeof v.createdAt === 'number' &&
    Number.isFinite(v.createdAt) &&
    (v.personalAmount === undefined ||
      (typeof v.personalAmount === 'number' && Number.isFinite(v.personalAmount)))
  )
}

function decodeBackupImage(raw: unknown, index: number): ReceiptImage {
  if (!isPlainObject(raw) || typeof raw.id !== 'string' || !raw.id) {
    throw new Error(`Backup image #${index} is missing an id`)
  }
  if (typeof raw.dataUrl !== 'string') {
    throw new Error(`Backup image "${raw.id}" is missing its image data`)
  }
  const match = DATA_URL_RE.exec(raw.dataUrl)
  if (!match) {
    throw new Error(`Backup image "${raw.id}" is not an embedded image data URL`)
  }
  const base64 = match[2]
  const approxBytes = Math.floor((base64.length * 3) / 4)
  if (approxBytes > MAX_IMAGE_BYTES) {
    throw new Error(`Backup image "${raw.id}" exceeds the per-image size limit`)
  }
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return { id: raw.id, blob: new Blob([bytes], { type: `image/${match[1]}` }) }
}

/**
 * Validate a parsed backup file end to end — every report, expense and
 * image is checked against its expected shape, embedded images must be
 * well-formed `data:image/...;base64,` URLs (never a fetchable URL), and
 * per-image / total image size limits are enforced. Nothing is written to
 * IndexedDB until the whole file passes, so a bad record can't overwrite
 * some existing data before the problem is discovered.
 */
export function validateBackup(
  parsed: BackupFile,
): { reports: Report[]; expenses: Expense[]; images: ReceiptImage[] } {
  const known = parsed.app === APP_ID || LEGACY_APP_IDS.includes(parsed.app)
  if (!known) throw new Error('Not a Receipts Express backup file')
  if (!Array.isArray(parsed.reports)) throw new Error('Backup file is missing its reports list')

  const rawExpenses = parsed.expenses ?? []
  const rawImages = parsed.images ?? []
  if (!Array.isArray(rawExpenses)) throw new Error('Backup file has a malformed expenses list')
  if (!Array.isArray(rawImages)) throw new Error('Backup file has a malformed images list')
  if (rawImages.length > MAX_IMAGES) throw new Error('Backup file has too many images')

  const reports = parsed.reports.map((r, i) => {
    if (!isValidReport(r)) throw new Error(`Backup report #${i} is malformed`)
    return r
  })
  const reportIds = new Set(reports.map((r) => r.id))
  const expenses = rawExpenses.map((e, i) => {
    if (!isValidExpense(e)) throw new Error(`Backup expense #${i} is malformed`)
    // Every export bundles all reports and expenses together, so a valid
    // backup never references a report outside its own file. An expense
    // that does would silently become permanently invisible in the UI
    // (nothing ever lists it), so reject it up front instead.
    if (!reportIds.has(e.reportId)) {
      throw new Error(`Backup expense #${i} references a report that isn't in this backup`)
    }
    return e
  })

  let totalImageBytes = 0
  const images = rawImages.map((img, i) => {
    const decoded = decodeBackupImage(img, i)
    totalImageBytes += decoded.blob.size
    if (totalImageBytes > MAX_TOTAL_IMAGE_BYTES) {
      throw new Error('Backup images exceed the total size limit')
    }
    return decoded
  })

  return { reports, expenses, images }
}

const LAST_BACKUP_KEY = 'br.lastBackupAt'
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000
const BACKUP_WARNING_DISMISSED_KEY = 'br.backupWarningDismissedAt'
const WARNING_SNOOZE_MS = 5 * 24 * 60 * 60 * 1000

export function lastBackupAt(): number | null {
  const raw = localStorage.getItem(LAST_BACKUP_KEY)
  return raw ? Number(raw) : null
}

export function backupIsStale(): boolean {
  const last = lastBackupAt()
  return last === null || Date.now() - last > STALE_AFTER_MS
}

/** Snooze the stale-backup warning — it won't reappear for WARNING_SNOOZE_MS. */
export function dismissBackupWarning(): void {
  localStorage.setItem(BACKUP_WARNING_DISMISSED_KEY, String(Date.now()))
}

export function shouldShowBackupWarning(): boolean {
  if (!backupIsStale()) return false
  const dismissedAt = localStorage.getItem(BACKUP_WARNING_DISMISSED_KEY)
  return dismissedAt === null || Date.now() - Number(dismissedAt) > WARNING_SNOOZE_MS
}

async function buildBackupBlob(): Promise<Blob> {
  const [reports, expenses, images] = await Promise.all([
    listReports(),
    listAllExpenses(),
    listAllImages(),
  ])
  const backup: BackupFile = {
    app: APP_ID,
    version: 1,
    exportedAt: new Date().toISOString(),
    reports,
    expenses,
    images: await Promise.all(
      images.map(async (img) => ({ id: img.id, dataUrl: await blobToDataURL(img.blob) })),
    ),
  }
  return new Blob([JSON.stringify(backup)], { type: 'application/json' })
}

/**
 * Export everything to a single backup file. On mobile this opens the
 * share sheet (save to Files, Drive, Dropbox, …); elsewhere it downloads.
 * Returns true if the backup was handed off, false if the user cancelled.
 */
export async function exportBackup(): Promise<boolean> {
  const blob = await buildBackupBlob()
  const name = `receipts-express-backup-${new Date().toISOString().slice(0, 10)}.json`
  const file = new File([blob], name, { type: 'application/json' })
  const handedOff = await shareOrDownloadFile(file, 'Receipts Express backup')
  if (handedOff) {
    localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()))
    localStorage.removeItem(BACKUP_WARNING_DISMISSED_KEY)
  }
  return handedOff
}

/**
 * Restore from a backup file. Existing entries with the same ids are
 * overwritten; everything else is left untouched (safe to run on a
 * device that already has data).
 *
 * The entire file is validated first — shapes, embedded-image format, and
 * size limits — and only then committed in one IndexedDB transaction. A
 * malformed or hostile file is rejected before anything is written, so it
 * can neither leave a partial restore behind nor overwrite existing data.
 */
export async function importBackup(file: File): Promise<{ reports: number; expenses: number }> {
  const parsed = JSON.parse(await file.text()) as BackupFile
  const { reports, expenses, images } = validateBackup(parsed)
  await importBackupData(reports, expenses, images)
  return { reports: reports.length, expenses: expenses.length }
}
