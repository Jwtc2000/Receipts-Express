import type { Report, Expense, ReceiptImage } from './types'
import { listReports, listAllExpenses, listAllImages, importBackupData } from './db'
import { getProfile, saveProfile, MAX_PROJECTS, normalizeProjects, type Profile } from './profile'
import { todayIso } from './types'
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
  /**
   * The saved profile, included so a restore brings back the name, employee
   * id, cost center and project list along with the reports. Absent in
   * backups written before the profile was included, and absent when every
   * profile field was still empty at export time — in both cases a restore
   * leaves whatever profile is on this device alone rather than blanking it.
   */
  profile?: Profile
}

// Only ever decode embedded base64 image data — never fetch a URL from the
// backup file. That's what keeps "nothing leaves your device" true even for
// a hostile/corrupted backup: a crafted `dataUrl` can't turn into an outbound
// network request.
const DATA_URL_RE = /^data:image\/(png|jpeg|jpg|webp|gif);base64,([a-zA-Z0-9+/]+=?=?)$/
const MAX_IMAGE_BYTES = 15 * 1024 * 1024 // generous ceiling for one receipt photo
const MAX_IMAGES = 5000
const MAX_TOTAL_IMAGE_BYTES = 500 * 1024 * 1024

// The backup is one JSON document, built and read back as a single string.
// Chromium caps a string at about 512 million characters, and base64 turns
// every three image bytes into four, so past roughly 380 MB of receipt images
// the export threw a bare RangeError and the user saw only "Backup failed".
// The check below refuses a little earlier and says why. It is a ceiling on
// what this file format can hold, not a fix for it: holding more needs a
// format that is not one string.
export const MAX_EXPORT_IMAGE_BYTES = 350 * 1024 * 1024

/** A backup that cannot be written, with a message meant for the user. */
export class BackupTooLargeError extends Error {
  constructor(totalBytes: number) {
    super(
      `Your receipts add up to about ${Math.round(totalBytes / (1024 * 1024))} MB, which is more than one backup file can hold. ` +
        'Export the reports you no longer need as PDFs, delete them here, and back up again.',
    )
    this.name = 'BackupTooLargeError'
  }
}

// Record and text ceilings. Without them a corrupt or hostile file can hold
// millions of records, or a handful of records carrying megabyte-long
// strings, and the restore exhausts the origin's storage quota (or wedges
// the tab building the transaction) before anything catches it. The numbers
// are far above any real expense library — 10,000 expenses is more receipts
// than the 5,000-image cap can even illustrate — so a genuine backup never
// meets them. Worst case they still admit is on the order of the 500MB total
// image ceiling above, which is the point: no single limit is the only thing
// standing between a bad file and a full disk.
const MAX_REPORTS = 1000
const MAX_EXPENSES = 10000
/**
 * Longest string any record may carry. The screens that take text cap their
 * fields at this same number — ReportList.tsx imports it; ExpenseEditor.tsx
 * repeats it as MAX_FIELD_LENGTH rather than pull this module into the editor
 * for one number — so the two ends agree: without a cap at entry a long note
 * produced a backup this importer then refused, leaving someone holding a
 * file their own app had written and would not read. Capped at entry rather
 * than raised here, because this limit is what stops a hostile file carrying
 * megabyte-long strings into storage, and no receipt field a person types
 * comes near 2,000 characters.
 */
export const MAX_STRING_LENGTH = 2000
// A file this large cannot be a backup the app wrote: the export refuses past
// MAX_EXPORT_IMAGE_BYTES of images, and base64 adds a third. Checked before
// the file is read, so an oversized file is refused without loading it.
const MAX_FILE_BYTES = 600 * 1024 * 1024
// More exchange rates than there are currencies is not a real report.
const MAX_EXCHANGE_RATES = 300
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const CURRENCY_KEY_RE = /^[A-Za-z]{3}$/
/** The newest backup format this build reads, which is the one it writes. */
const BACKUP_VERSION = 1

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * True when any string anywhere in `value` is longer than MAX_STRING_LENGTH —
 * object keys included, since a report's `exchangeRates` map keeps currency
 * codes in its keys. Walked recursively rather than field by field so a field
 * added later can't quietly escape the cap. Depth-limited because the shape
 * checks below accept unknown extra properties, and a deeply nested one would
 * otherwise recurse until the stack overflows.
 */
function hasOverlongString(value: unknown, depth = 0): boolean {
  if (typeof value === 'string') return value.length > MAX_STRING_LENGTH
  if (depth >= 6) return false
  if (Array.isArray(value)) return value.some((v) => hasOverlongString(v, depth + 1))
  if (isPlainObject(value)) {
    return Object.entries(value).some(
      ([key, v]) => key.length > MAX_STRING_LENGTH || hasOverlongString(v, depth + 1),
    )
  }
  return false
}

function isValidReport(v: unknown): v is Report {
  return (
    isPlainObject(v) &&
    typeof v.id === 'string' &&
    v.id.length > 0 &&
    typeof v.name === 'string' &&
    typeof v.createdAt === 'number' &&
    Number.isFinite(v.createdAt) &&
    (v.startDate === undefined || isDateOrBlank(v.startDate)) &&
    (v.endDate === undefined || isDateOrBlank(v.endDate)) &&
    (v.dailyMealAllowance === undefined ||
      (typeof v.dailyMealAllowance === 'number' && Number.isFinite(v.dailyMealAllowance) && v.dailyMealAllowance >= 0)) &&
    (v.projectNumber === undefined || typeof v.projectNumber === 'string') &&
    (v.exchangeRates === undefined ||
      (isPlainObject(v.exchangeRates) &&
        Object.keys(v.exchangeRates).length <= MAX_EXCHANGE_RATES &&
        Object.entries(v.exchangeRates).every(
          ([code, r]) => CURRENCY_KEY_RE.test(code) && typeof r === 'number' && Number.isFinite(r) && r > 0,
        )))
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
    v.amount >= 0 &&
    typeof v.currency === 'string' &&
    isDateOrBlank(v.date) &&
    typeof v.category === 'string' &&
    typeof v.notes === 'string' &&
    (v.imageId === undefined || typeof v.imageId === 'string') &&
    (v.extraImageIds === undefined ||
      (Array.isArray(v.extraImageIds) && v.extraImageIds.every((x) => typeof x === 'string'))) &&
    typeof v.createdAt === 'number' &&
    Number.isFinite(v.createdAt) &&
    (v.personalAmount === undefined ||
      (typeof v.personalAmount === 'number' &&
        Number.isFinite(v.personalAmount) &&
        v.personalAmount >= 0 &&
        v.personalAmount <= v.amount))
  )
}

/** A yyyy-mm-dd date, or blank: the only two things the editor can store. */
function isDateOrBlank(v: unknown): v is string {
  return typeof v === 'string' && (v === '' || ISO_DATE_RE.test(v))
}

// The importer used to store the parsed objects as they came, so any extra
// property in the file, of any size and depth, went into IndexedDB unchecked,
// never appeared in the app, and was written back out in every later backup.
// Each record is now rebuilt from the fields this app knows and nothing else.
function pickReport(r: Report): Report {
  return {
    id: r.id,
    name: r.name,
    createdAt: r.createdAt,
    ...(r.startDate !== undefined ? { startDate: r.startDate } : {}),
    ...(r.endDate !== undefined ? { endDate: r.endDate } : {}),
    ...(r.dailyMealAllowance !== undefined ? { dailyMealAllowance: r.dailyMealAllowance } : {}),
    ...(r.projectNumber !== undefined ? { projectNumber: r.projectNumber } : {}),
    ...(r.exchangeRates !== undefined ? { exchangeRates: { ...r.exchangeRates } } : {}),
  }
}

function pickExpense(e: Expense): Expense {
  return {
    id: e.id,
    reportId: e.reportId,
    position: e.position,
    title: e.title,
    merchant: e.merchant,
    amount: e.amount,
    currency: e.currency,
    date: e.date,
    category: e.category,
    notes: e.notes,
    createdAt: e.createdAt,
    ...(e.imageId !== undefined ? { imageId: e.imageId } : {}),
    ...(e.extraImageIds !== undefined ? { extraImageIds: [...e.extraImageIds] } : {}),
    ...(e.personalAmount !== undefined ? { personalAmount: e.personalAmount } : {}),
  }
}

function pickProfile(p: Profile): Profile {
  return {
    name: p.name,
    employeeId: p.employeeId,
    costCenter: p.costCenter,
    projectNumber: p.projectNumber.trim(),
    projects: normalizeProjects([p.projectNumber, ...p.projects]),
  }
}

/** Throw if two records in one list share an id; a restore would keep only the last. */
function rejectDuplicateIds(records: { id: string }[], what: string): void {
  const seen = new Set<string>()
  for (const r of records) {
    if (seen.has(r.id)) throw new Error(`Backup has two ${what} with the same id`)
    seen.add(r.id)
  }
}

function isValidProfile(v: unknown): v is Profile {
  return (
    isPlainObject(v) &&
    typeof v.name === 'string' &&
    typeof v.employeeId === 'string' &&
    typeof v.costCenter === 'string' &&
    typeof v.projectNumber === 'string' &&
    Array.isArray(v.projects) &&
    v.projects.every((p) => typeof p === 'string')
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
 * A backup that has been read and checked but not yet written, together with
 * the numbers a restore confirmation needs. Building one touches nothing, so
 * the user can be shown what the restore would do and still decline.
 */
export interface BackupPlan {
  reports: Report[]
  expenses: Expense[]
  images: ReceiptImage[]
  /** The profile carried by the file, or null when it carries none. */
  profile: Profile | null
  /** The file's own export timestamp, or '' when it doesn't carry a usable one. */
  exportedAt: string
  counts: {
    reports: number
    expenses: number
    /**
     * How many reports and expenses already on this device the restore would
     * replace — `importBackupData` writes with `put`, so a colliding id
     * overwrites whatever is there now and there is no undo. Images aren't
     * counted: their ids only collide when the expense that owns them does,
     * so counting them would inflate the number without describing any loss
     * the user isn't already being told about.
     */
    overwrites: number
    /** Receipt pages that expenses in the file point at but the file does not carry. */
    missingImages: number
  }
}

/**
 * Read a backup file and check it end to end — every report, expense and
 * image is checked against its expected shape, embedded images must be
 * well-formed `data:image/...;base64,` URLs (never a fetchable URL), and the
 * record-count, text-length and image-size limits are enforced. Nothing is
 * written anywhere: this only produces the plan, and `commitBackup` performs
 * the writes, so a bad record can't overwrite existing data before the
 * problem is discovered and the user gets to see the damage a good file
 * would do before agreeing to it.
 *
 * Throws with a message naming what failed — which record, or which limit —
 * so the caller can show it rather than guess.
 */
export async function validateBackup(file: File): Promise<BackupPlan> {
  let parsed: unknown
  // Reading and parsing fail differently and mean different things. A file
  // too large for the browser to hold as one string fails at the read, and
  // used to be reported as "isn't valid JSON", which sent the owner of a
  // perfectly good backup looking for the wrong problem.
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('That file is larger than any Receipts Express backup can be')
  }
  let text: string
  try {
    text = await file.text()
  } catch {
    throw new Error('That file is too large for this browser to read, or could not be opened')
  }
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error("That file isn't valid JSON, so it isn't a Receipts Express backup")
  }
  if (!isPlainObject(parsed)) throw new Error('Not a Receipts Express backup file')

  const app = parsed.app
  const known = typeof app === 'string' && (app === APP_ID || LEGACY_APP_IDS.includes(app))
  if (!known) throw new Error('Not a Receipts Express backup file')
  if (typeof parsed.version === 'number' && parsed.version > BACKUP_VERSION) {
    throw new Error('This backup was made by a newer version of Receipts Express — update the app, then restore it')
  }
  if (!Array.isArray(parsed.reports)) throw new Error('Backup file is missing its reports list')

  const rawReports = parsed.reports
  const rawExpenses = parsed.expenses ?? []
  const rawImages = parsed.images ?? []
  if (!Array.isArray(rawExpenses)) throw new Error('Backup file has a malformed expenses list')
  if (!Array.isArray(rawImages)) throw new Error('Backup file has a malformed images list')
  if (rawReports.length > MAX_REPORTS) {
    throw new Error(`Backup file has more than ${MAX_REPORTS} reports`)
  }
  if (rawExpenses.length > MAX_EXPENSES) {
    throw new Error(`Backup file has more than ${MAX_EXPENSES} expenses`)
  }
  if (rawImages.length > MAX_IMAGES) throw new Error('Backup file has too many images')

  const reports = rawReports.map((r, i) => {
    if (!isValidReport(r)) throw new Error(`Backup report #${i} is malformed`)
    if (hasOverlongString(r)) {
      throw new Error(`Backup report #${i} has text longer than the ${MAX_STRING_LENGTH}-character limit`)
    }
    return pickReport(r)
  })
  rejectDuplicateIds(reports, 'reports')
  const reportIds = new Set(reports.map((r) => r.id))
  const expenses = rawExpenses.map((e, i) => {
    if (!isValidExpense(e)) throw new Error(`Backup expense #${i} is malformed`)
    if (hasOverlongString(e)) {
      throw new Error(`Backup expense #${i} has text longer than the ${MAX_STRING_LENGTH}-character limit`)
    }
    // The one unbounded list inside a record. An expense can't hold more
    // receipt pages than the whole file is allowed to carry images, and the
    // string cap above only limits how long each id is, not how many there
    // are, so the count needs its own ceiling.
    if ((e.extraImageIds?.length ?? 0) > MAX_IMAGES) {
      throw new Error(`Backup expense #${i} lists more than ${MAX_IMAGES} receipt pages`)
    }
    // Every export bundles all reports and expenses together, so a valid
    // backup never references a report outside its own file. An expense
    // that does would silently become permanently invisible in the UI
    // (nothing ever lists it), so reject it up front instead.
    if (!reportIds.has(e.reportId)) {
      throw new Error(`Backup expense #${i} references a report that isn't in this backup`)
    }
    return pickExpense(e)
  })
  rejectDuplicateIds(expenses, 'expenses')

  let totalImageBytes = 0
  const images = rawImages.map((img, i) => {
    const decoded = decodeBackupImage(img, i)
    totalImageBytes += decoded.blob.size
    if (totalImageBytes > MAX_TOTAL_IMAGE_BYTES) {
      throw new Error('Backup images exceed the total size limit')
    }
    return decoded
  })
  rejectDuplicateIds(images, 'images')
  // Receipt pages an expense points at that the file does not carry. Not
  // fatal: the expense restores without them. But the user is told how many,
  // rather than finding blank receipts later.
  const imageIds = new Set(images.map((img) => img.id))
  const missingImages = expenses
    .flatMap((e) => [e.imageId, ...(e.extraImageIds ?? [])])
    .filter((id): id is string => !!id && !imageIds.has(id)).length

  // A file written before the profile was included simply has no `profile`
  // key; that is a valid backup and leaves this device's profile alone.
  let profile: Profile | null = null
  if (parsed.profile !== undefined) {
    if (!isValidProfile(parsed.profile)) throw new Error('Backup profile is malformed')
    if (parsed.profile.projects.length > MAX_PROJECTS) {
      throw new Error(`Backup profile has more than ${MAX_PROJECTS} project numbers`)
    }
    if (hasOverlongString(parsed.profile)) {
      throw new Error(`Backup profile has text longer than the ${MAX_STRING_LENGTH}-character limit`)
    }
    profile = pickProfile(parsed.profile)
  }

  const [existingReports, existingExpenses] = await Promise.all([listReports(), listAllExpenses()])
  const existingReportIds = new Set(existingReports.map((r) => r.id))
  const existingExpenseIds = new Set(existingExpenses.map((e) => e.id))
  const overwrites =
    reports.filter((r) => existingReportIds.has(r.id)).length +
    expenses.filter((e) => existingExpenseIds.has(e.id)).length

  return {
    reports,
    expenses,
    images,
    profile,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : '',
    counts: { reports: reports.length, expenses: expenses.length, overwrites, missingImages },
  }
}

/** What became of the profile in a committed restore. */
export interface CommitResult {
  /**
   * 'none' — the file carried no profile, so this device's own still stands.
   * 'restored' — the file's profile was written over it.
   * 'failed' — the reports, expenses and images landed but the profile write
   * did not, so this device's own still stands.
   */
  profile: 'none' | 'restored' | 'failed'
}

/**
 * Write a validated plan. Reports, expenses and images go in one IndexedDB
 * transaction; the profile is written after it succeeds, because it lives in
 * localStorage and can't join that transaction — so a failed restore leaves
 * the existing profile untouched rather than replacing it with the profile
 * from a backup whose data never landed.
 *
 * That ordering means a localStorage write can fail (quota, or storage
 * blocked outright in some private-browsing modes) after the restore has
 * already happened and cannot be taken back. Letting that throw made the
 * caller print "Couldn't restore" over a restore that succeeded — telling the
 * user their data hadn't moved when it had. So the profile write is scoped:
 * only the transaction can throw out of here, and the profile's fate is
 * reported in the return value for the caller to mention.
 */
export async function commitBackup(plan: BackupPlan): Promise<CommitResult> {
  await importBackupData(plan.reports, plan.expenses, plan.images)
  if (!plan.profile) return { profile: 'none' }
  try {
    saveProfile(plan.profile)
    return { profile: 'restored' }
  } catch {
    return { profile: 'failed' }
  }
}

const LAST_BACKUP_KEY = 'br.lastBackupAt'
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000
const BACKUP_WARNING_DISMISSED_KEY = 'br.backupWarningDismissedAt'
const WARNING_SNOOZE_MS = 5 * 24 * 60 * 60 * 1000

export function lastBackupAt(): number | null {
  const raw = localStorage.getItem(LAST_BACKUP_KEY)
  if (raw === null) return null
  const at = Number(raw)
  // A non-numeric value — a partially written entry, a hand-edited one,
  // another tool touching the origin — parses to NaN, and NaN is not null,
  // so `Date.now() - last > STALE_AFTER_MS` in backupIsStale() would be
  // false forever and the stale-backup warning would never appear again.
  // Treat anything unparseable as "never backed up", which fails toward
  // warning rather than toward silence.
  return Number.isFinite(at) ? at : null
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
  const raw = localStorage.getItem(BACKUP_WARNING_DISMISSED_KEY)
  if (raw === null) return true
  // Same NaN trap as lastBackupAt(): an unparseable stamp would otherwise
  // read as a dismissal that never expires.
  const dismissedAt = Number(raw)
  if (!Number.isFinite(dismissedAt)) return true
  return Date.now() - dismissedAt > WARNING_SNOOZE_MS
}

async function buildBackupBlob(): Promise<Blob> {
  const [reports, allExpenses, allImages] = await Promise.all([
    listReports(),
    listAllExpenses(),
    listAllImages(),
  ])
  // An expense whose report is gone can exist: a second tab, or the installed
  // app beside a browser tab, can save one into a report the other just
  // deleted. Nothing in the app shows it. validateBackup rejects a whole file
  // over a single such record, so writing it out would make every backup from
  // this device one that cannot be restored, discovered only on the day it is
  // needed. It is left out, which loses nothing the app could display.
  const reportIds = new Set(reports.map((r) => r.id))
  const expenses = allExpenses.filter((e) => reportIds.has(e.reportId))

  // Only the images a kept expense points at. An image that nothing
  // references cannot be shown or deleted in the app; exporting it would let
  // receipts nobody can see count against the size limit, and could make a
  // library fail to back up with every visible report already deleted.
  const referenced = new Set(
    expenses.flatMap((e) => [e.imageId, ...(e.extraImageIds ?? [])]).filter((id): id is string => !!id),
  )
  const images = allImages.filter((img) => referenced.has(img.id))
  const totalImageBytes = images.reduce((sum, img) => sum + img.blob.size, 0)
  if (totalImageBytes > MAX_EXPORT_IMAGE_BYTES) throw new BackupTooLargeError(totalImageBytes)
  // The profile is part of the backup — a restore that brought back every
  // receipt but dropped the user's name and project numbers would be a
  // restore that quietly lost data. An entirely empty profile is left out
  // instead of written as blanks, so restoring a backup taken before the
  // profile was filled in doesn't wipe the one on this device.
  const profile = getProfile()
  const hasProfile =
    Boolean(profile.name || profile.employeeId || profile.costCenter || profile.projectNumber) ||
    profile.projects.length > 0
  const backup: BackupFile = {
    app: APP_ID,
    version: 1,
    exportedAt: new Date().toISOString(),
    reports,
    expenses,
    images: await Promise.all(
      images.map(async (img) => ({ id: img.id, dataUrl: await blobToDataURL(img.blob) })),
    ),
    ...(hasProfile ? { profile } : {}),
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
  // The local date, as everywhere else in the app. The UTC date named an
  // evening backup west of Greenwich after tomorrow.
  const name = `receipts-express-backup-${todayIso()}.json`
  const file = new File([blob], name, { type: 'application/json' })
  const handedOff = await shareOrDownloadFile(file, 'Receipts Express backup')
  if (handedOff) {
    localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()))
    localStorage.removeItem(BACKUP_WARNING_DISMISSED_KEY)
  }
  return handedOff
}

/**
 * Restore from a backup file in one step, with no chance to review what the
 * restore will replace. Existing entries with the same ids are overwritten;
 * everything else is left untouched (safe to run on a device that already
 * has data).
 *
 * Callers that can show a confirmation should use `validateBackup` and
 * `commitBackup` directly instead, and put the plan's `counts.overwrites` in
 * front of the user before committing — restoring an older backup over newer
 * edits to the same report destroys them, and nothing here can undo that.
 */
export async function importBackup(file: File): Promise<{ reports: number; expenses: number }> {
  const plan = await validateBackup(file)
  await commitBackup(plan)
  return { reports: plan.counts.reports, expenses: plan.counts.expenses }
}
