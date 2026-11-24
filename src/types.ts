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
  /**
   * Manually-entered FOREIGN→USD rate per non-USD currency used in this
   * report — 1 unit of that currency in US dollars (e.g. `{ EUR: 1.08 }`).
   * Entered by the user, never fetched: this app makes no network calls
   * beyond loading itself, so there is no live-rate source to call.
   */
  exchangeRates?: Record<string, number>
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
  /** Pages 2+ of a multi-page receipt (e.g. an uploaded PDF); page 1 is `imageId`. */
  extraImageIds?: string[]
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

export interface UsdTotal {
  /** Sum of every USD expense plus every rated foreign-currency total, converted. */
  total: number
  /** Non-USD currencies present in `expenses` with no (or an invalid) rate in `exchangeRates` — excluded from `total`. */
  missingRates: string[]
}

/**
 * Convert a mixed-currency report total to USD using manually-entered rates
 * (1 unit of foreign currency = N USD) — there is no live-rate source since
 * this app makes no network calls beyond loading itself. A currency with no
 * rate set is excluded from the total and reported in `missingRates` rather
 * than silently treated as 1:1 with USD.
 */
export function usdTotal(
  expenses: { amount: number; currency: string }[],
  exchangeRates: Record<string, number> | undefined,
): UsdTotal {
  const totals = new Map<string, number>()
  for (const e of expenses) {
    const currency = e.currency.trim().toUpperCase()
    totals.set(currency, (totals.get(currency) ?? 0) + e.amount)
  }
  let total = 0
  const missingRates: string[] = []
  for (const [currency, amount] of totals) {
    if (currency === 'USD') {
      total += amount
      continue
    }
    const rate = exchangeRates?.[currency]
    if (rate === undefined || !Number.isFinite(rate) || rate <= 0) {
      missingRates.push(currency)
      continue
    }
    total += amount * rate
  }
  return { total, missingRates: missingRates.sort() }
}

export function newId(): string {
  return crypto.randomUUID()
}

/** Today's date in the user's local timezone — not UTC, which would read as
 * tomorrow or yesterday for anyone west/east of UTC once local time crosses
 * a UTC day boundary while it's still the same calendar day locally. */
export function todayIso(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
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

/**
 * The years a date typed into the app may have. A date field is easy to
 * mistype: Chrome stores a year typed as two digits as 0026, takes years of up
 * to six digits, and keeps whatever was typed. Earlier versions saved such
 * dates, and a restore still takes them (see backup.ts); this is the check on
 * a date typed now. An expense report's receipts fall well inside it, and the
 * receipt scanner already keeps to 2000 to 2100.
 */
export const FIRST_ENTRY_YEAR = 1900
export const LAST_ENTRY_YEAR = 2099
export const ENTRY_YEAR_MESSAGE = `Check the year in the date: it has to be between ${FIRST_ENTRY_YEAR} and ${LAST_ENTRY_YEAR}.`

/** True for a yyyy-mm-dd date with a year the app takes when one is typed. */
export function isEntryDate(iso: string): boolean {
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(iso)
  if (!match) return false
  const year = Number(match[1])
  return year >= FIRST_ENTRY_YEAR && year <= LAST_ENTRY_YEAR
}

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  // Set rather than passed to the constructor, which reads years 0 to 99 as
  // 1900 to 1999: a year saved as 0026 was shown, and counted, as 1926.
  const date = new Date(2000, m - 1, d)
  date.setFullYear(y, m - 1, d)
  return date
}

export function formatDate(iso: string): string {
  if (!iso) return '—'
  // A mistyped year from an earlier version (0026, 20266) is shown as it is
  // stored. Formatted, 0026 reads "Jul 22, 26", which passes for this year and
  // hides the mistake from the one person who can correct it.
  if (!isEntryDate(iso)) return iso
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
/**
 * How a day banner names its day. With a trip start date, an expense dated
 * before it gets a day number below 1, and the banner used to read "Day -254".
 * Those are labelled as before the trip instead; the number is kept for
 * ordering and colour.
 */
export function dayLabel(dayNumber: number): string {
  return dayNumber >= 1 ? `Day ${dayNumber}` : 'Pre-trip'
}

export function dayNumbersByDate(expenses: { date: string }[], tripStartDate?: string): Map<string, number> {
  const uniqueDates = [...new Set(expenses.map((e) => e.date).filter(Boolean))]
  const map = new Map<string, number>()
  // A trip start with a mistyped year, saved by an earlier version, numbered
  // the trip's days from that year: "Day 36526" with 0026 read as 1926. The
  // days are ranked instead, as for a report with no trip dates, until the
  // start is corrected.
  if (tripStartDate && isEntryDate(tripStartDate)) {
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
 *
 * An expense that is still next to one of its own day has not crossed a
 * boundary, and keeps its date. Without that check, swapping two expenses
 * within a day handed the moved one the date of whatever sat above it: "Move
 * up" on the second expense of a day put it into the previous day.
 */
export function resolveDateAfterMove(list: Expense[], index: number): string {
  const own = list[index].date
  if (own && (list[index - 1]?.date === own || list[index + 1]?.date === own)) return own
  const before = list[index - 1]
  if (before?.date) return before.date
  const after = list[index + 1]
  if (after?.date) return after.date
  return list[index].date
}
