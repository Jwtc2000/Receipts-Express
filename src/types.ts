export interface Report {
  id: string
  name: string
  createdAt: number
  /** ISO date string yyyy-mm-dd — the trip's Day 1, used for PDF/timeline headers. */
  startDate?: string
  /** ISO date string yyyy-mm-dd — the trip's last day. */
  endDate?: string
  /** Per-day cap on reimbursable Meals spending; unset/0 disables the food-balance feature. */
  dailyMealAllowance?: number
  /**
   * Project number this report is charged to, picked from the saved list in
   * the profile. Unset falls back to the profile's default project number.
   */
  projectNumber?: string
}

export interface Expense {
  id: string
  reportId: string
  /** Manual sort position within the report timeline */
  position: number
  title: string
  merchant: string
  amount: number
  currency: string
  /** ISO date string yyyy-mm-dd */
  date: string
  category: string
  notes: string
  imageId?: string
  createdAt: number
  /** Portion of `amount` the employee is personally covering (not reimbursable). */
  personalAmount?: number
}

export interface ReceiptImage {
  id: string
  blob: Blob
}

export const CATEGORIES = [
  'Meals',
  'Travel',
  'Lodging',
  'Transport',
  'Supplies',
  'Entertainment',
  'Other',
] as const

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

/**
 * Sum amounts per currency and format each separately, since expenses in a
 * report aren't necessarily all in the same currency and naively adding
 * raw numbers across currencies would produce a meaningless total.
 */
export function formatTotal(expenses: { amount: number; currency: string }[]): string {
  if (expenses.length === 0) return formatMoney(0, 'USD')
  const totals = new Map<string, number>()
  for (const e of expenses) {
    // Normalize case so "USD" and "usd" (e.g. from an older backup) merge
    // into one bucket instead of showing as two separate totals.
    const currency = e.currency.trim().toUpperCase()
    totals.set(currency, (totals.get(currency) ?? 0) + e.amount)
  }
  return [...totals].map(([currency, amount]) => formatMoney(amount, currency)).join(' + ')
}

export function newId(): string {
  return crypto.randomUUID()
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Sort expenses by date (undated expenses last), falling back to their
 * manual `position` to order expenses that share a date.
 */
export function sortExpensesByDate(expenses: Expense[]): Expense[] {
  return [...expenses].sort((a, b) => {
    const ad = a.date || '9999-99-99'
    const bd = b.date || '9999-99-99'
    return ad.localeCompare(bd) || a.position - b.position
  })
}

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function formatDate(iso: string): string {
  if (!iso) return '—'
  return parseIsoDate(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Map each distinct expense date to its "Day N" label. When the report has
 * a trip start date, Day N is the calendar offset from that date (Day 1 =
 * start date) — stable no matter which days actually have expenses. Falls
 * back to ranking by the expenses' own distinct dates (oldest = Day 1) for
 * reports created before trip dates existed. Expenses with no date aren't
 * given a day number.
 */
export function dayNumbersByDate(expenses: { date: string }[], tripStartDate?: string): Map<string, number> {
  const uniqueDates = [...new Set(expenses.map((e) => e.date).filter(Boolean))]
  const map = new Map<string, number>()
  if (tripStartDate) {
    const start = parseIsoDate(tripStartDate)
    for (const date of uniqueDates) {
      const offsetDays = Math.round((parseIsoDate(date).getTime() - start.getTime()) / MS_PER_DAY)
      map.set(date, offsetDays + 1)
    }
  } else {
    uniqueDates.sort()
    uniqueDates.forEach((date, i) => map.set(date, i + 1))
  }
  return map
}

/**
 * When an expense is moved to a new position in a date-sorted list, decide
 * what date it should now have: the date of whichever neighbor it landed
 * next to (preferring the one before it), so moving an expense across a
 * day boundary reassigns which day it belongs to. Falls back to its
 * current date if there's no dated neighbor to adopt.
 */
export function resolveDateAfterMove(list: Expense[], index: number): string {
  const before = list[index - 1]
  if (before?.date) return before.date
  const after = list[index + 1]
  if (after?.date) return after.date
  return list[index].date
}
