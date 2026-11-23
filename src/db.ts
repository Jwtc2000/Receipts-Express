import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Report, Expense, ReceiptImage } from './types'
import { sortExpensesByDate } from './types'

interface BestReceiptsDB extends DBSchema {
  reports: {
    key: string
    value: Report
  }
  expenses: {
    key: string
    value: Expense
    indexes: { 'by-report': string }
  }
  images: {
    key: string
    value: ReceiptImage
  }
}

let dbPromise: Promise<IDBPDatabase<BestReceiptsDB>> | null = null

/**
 * Fired when another tab is upgrading the database and needs this tab to let
 * go of it. main.tsx can listen and ask the user to reload.
 */
export const DB_VERSION_CHANGE_EVENT = 'receipts-express:db-version-change'

function getDB() {
  if (!dbPromise) {
    const opening = openDB<BestReceiptsDB>('best-receipts', 1, {
      // Written against oldVersion so that a version 2 adds its own step
      // below this one instead of re-running it.
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('reports', { keyPath: 'id' })
          const expenses = db.createObjectStore('expenses', { keyPath: 'id' })
          expenses.createIndex('by-report', 'reportId')
          db.createObjectStore('images', { keyPath: 'id' })
        }
      },
      // Another tab wants to upgrade: close this connection so it is not
      // blocked forever, forget it so the next call reopens, and say so.
      blocking() {
        void opening.then((db) => db.close())
        dbPromise = null
        window.dispatchEvent(new Event(DB_VERSION_CHANGE_EVENT))
      },
      // The browser closed the connection underneath the app. Without this
      // the dead connection stayed cached and every later read and write
      // failed until the page was reloaded.
      terminated() {
        dbPromise = null
      },
    })
    // A failed open is not cached either: the next call tries again.
    dbPromise = opening.catch((err) => {
      dbPromise = null
      throw err
    })
  }
  return dbPromise
}

// ---- Reports ----

export async function listReports(): Promise<Report[]> {
  const db = await getDB()
  const reports = await db.getAll('reports')
  return reports.sort((a, b) => b.createdAt - a.createdAt)
}

export async function getReport(id: string): Promise<Report | undefined> {
  const db = await getDB()
  return db.get('reports', id)
}

export async function saveReport(report: Report): Promise<void> {
  const db = await getDB()
  await db.put('reports', report)
}

function expenseImageIds(expense: Pick<Expense, 'imageId' | 'extraImageIds'>): string[] {
  return [expense.imageId, ...(expense.extraImageIds ?? [])].filter((id): id is string => !!id)
}

export async function deleteReport(id: string): Promise<void> {
  const db = await getDB()
  const expenses = await db.getAllFromIndex('expenses', 'by-report', id)
  const tx = db.transaction(['reports', 'expenses', 'images'], 'readwrite')
  for (const expense of expenses) {
    void tx.objectStore('expenses').delete(expense.id)
    for (const imageId of expenseImageIds(expense)) void tx.objectStore('images').delete(imageId)
  }
  void tx.objectStore('reports').delete(id)
  await tx.done
}

// ---- Expenses ----

export async function getExpense(id: string): Promise<Expense | undefined> {
  const db = await getDB()
  return db.get('expenses', id)
}

export async function listExpenses(reportId: string): Promise<Expense[]> {
  const db = await getDB()
  const expenses = await db.getAllFromIndex('expenses', 'by-report', reportId)
  return sortExpensesByDate(expenses)
}

export async function saveExpense(expense: Expense): Promise<void> {
  const db = await getDB()
  await db.put('expenses', expense)
}

/**
 * Save an expense together with an optional receipt-image swap (one image
 * per page, for a multi-page PDF receipt), in one transaction: the new
 * images (if any) and the expense record are written, and the old images
 * are only removed once that succeeds. This way a failure (e.g. quota
 * exceeded) aborts the whole write instead of deleting the old receipt
 * pages and losing them before the replacement is safely stored.
 */
export async function saveExpenseWithImage(
  expense: Expense,
  newImages: ReceiptImage[],
  staleImageIds: string[],
): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['expenses', 'images'], 'readwrite')
  for (const image of newImages) void tx.objectStore('images').put(image)
  void tx.objectStore('expenses').put(expense)
  for (const id of staleImageIds) void tx.objectStore('images').delete(id)
  await tx.done
}

export async function saveExpenses(expenses: Expense[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('expenses', 'readwrite')
  for (const expense of expenses) void tx.store.put(expense)
  await tx.done
}

export async function deleteExpense(id: string): Promise<void> {
  const db = await getDB()
  const expense = await db.get('expenses', id)
  const tx = db.transaction(['expenses', 'images'], 'readwrite')
  void tx.objectStore('expenses').delete(id)
  if (expense) for (const imageId of expenseImageIds(expense)) void tx.objectStore('images').delete(imageId)
  await tx.done
}

export async function nextPosition(reportId: string): Promise<number> {
  const expenses = await listExpenses(reportId)
  // listExpenses is sorted by date, not position, so the last entry isn't
  // necessarily the highest position — take the actual max.
  return expenses.length === 0 ? 0 : Math.max(...expenses.map((e) => e.position)) + 1
}

export async function listAllExpenses(): Promise<Expense[]> {
  const db = await getDB()
  return db.getAll('expenses')
}

// ---- Images ----

export async function listAllImages(): Promise<ReceiptImage[]> {
  const db = await getDB()
  return db.getAll('images')
}

export async function saveImage(image: ReceiptImage): Promise<void> {
  const db = await getDB()
  await db.put('images', image)
}

export async function getImage(id: string): Promise<ReceiptImage | undefined> {
  const db = await getDB()
  return db.get('images', id)
}

export async function deleteImage(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('images', id)
}

// ---- Backup restore ----

/**
 * Write a restored backup's reports, expenses and images in a single
 * transaction so a bad record can't leave the store partially overwritten.
 */
export async function importBackupData(
  reports: Report[],
  expenses: Expense[],
  images: ReceiptImage[],
): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['reports', 'expenses', 'images'], 'readwrite')
  const expenseStore = tx.objectStore('expenses')
  const imageStore = tx.objectStore('images')
  // An expense being overwritten may point at receipt pages the backup's
  // version does not: the photo was replaced, removed or re-paged since the
  // backup was taken. Nothing would reference those pages afterwards, and
  // nothing in the app could ever delete them. Read each one inside this
  // transaction and drop the pages only it pointed at.
  const incoming = new Set(expenses.flatMap((e) => expenseImageIds(e)))
  const existing = await Promise.all(expenses.map((e) => expenseStore.get(e.id)))
  for (const old of existing) {
    if (!old) continue
    for (const id of expenseImageIds(old)) if (!incoming.has(id)) void imageStore.delete(id)
  }
  for (const image of images) void imageStore.put(image)
  for (const report of reports) void tx.objectStore('reports').put(report)
  for (const expense of expenses) void expenseStore.put(expense)
  await tx.done
}
