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

/**
 * A request inside a transaction whose outcome is reported by `tx.done`. If
 * the transaction aborts, every request in it rejects as well; left
 * unhandled, each of those surfaced a second time as a stray rejection.
 */
function quiet(request: Promise<unknown>): void {
  request.catch(() => {})
}

let dbPromise: Promise<IDBPDatabase<BestReceiptsDB>> | null = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<BestReceiptsDB>('best-receipts', 1, {
      upgrade(db) {
        db.createObjectStore('reports', { keyPath: 'id' })
        const expenses = db.createObjectStore('expenses', { keyPath: 'id' })
        expenses.createIndex('by-report', 'reportId')
        db.createObjectStore('images', { keyPath: 'id' })
      },
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
    quiet(tx.objectStore('expenses').delete(expense.id))
    for (const imageId of expenseImageIds(expense)) quiet(tx.objectStore('images').delete(imageId))
  }
  quiet(tx.objectStore('reports').delete(id))
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
  for (const image of newImages) quiet(tx.objectStore('images').put(image))
  quiet(tx.objectStore('expenses').put(expense))
  for (const id of staleImageIds) quiet(tx.objectStore('images').delete(id))
  await tx.done
}

export async function saveExpenses(expenses: Expense[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('expenses', 'readwrite')
  for (const expense of expenses) quiet(tx.store.put(expense))
  await tx.done
}

export async function deleteExpense(id: string): Promise<void> {
  const db = await getDB()
  const expense = await db.get('expenses', id)
  const tx = db.transaction(['expenses', 'images'], 'readwrite')
  quiet(tx.objectStore('expenses').delete(id))
  if (expense) for (const imageId of expenseImageIds(expense)) quiet(tx.objectStore('images').delete(imageId))
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
  for (const image of images) void tx.objectStore('images').put(image)
  for (const report of reports) void tx.objectStore('reports').put(report)
  for (const expense of expenses) void tx.objectStore('expenses').put(expense)
  await tx.done
}
