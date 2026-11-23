import type { Expense } from './types'
import { formatMoney } from './types'

/** The reimbursable portion of an expense — its amount minus whatever the
 * employee has designated as personal (not the company's to cover). */
export function businessAmount(expense: Expense): number {
  return expense.amount - (expense.personalAmount ?? 0)
}

export interface FoodBalance {
  used: number
  allowance: number
  remaining: number
  over: boolean
  currency: string
  /** The day's meals are in more than one currency, so no figure is given. */
  mixed: boolean
}

/**
 * How much of a day's Meals-category spending (after excluding personal
 * portions) counts against the daily allowance, and what's left. The
 * allowance is a plain number with no currency of its own, so it is read as
 * being in whatever currency that day's meals are in.
 *
 * That only works when they are all in one. A USD 12 breakfast and a EUR 40
 * dinner used to be added as 52 and printed as "$52.00 used", in the app and
 * in the exported PDF. A day like that is now marked `mixed` and no figure is
 * given, because any figure would be wrong.
 */
export function foodBalanceForDate(expenses: Expense[], date: string, allowance: number): FoodBalance {
  const mealExpenses = expenses.filter((e) => e.date === date && e.category === 'Meals')
  // Summed in whole cents. As floating-point, three meals adding up to
  // exactly the allowance (5.02 + 29.60 + 15.38 against 50) came out a hair
  // over it, and the day was flagged "$0.00 over".
  const usedCents = mealExpenses.reduce((sum, e) => sum + Math.round(businessAmount(e) * 100), 0)
  const used = usedCents / 100
  const currencies = new Set(mealExpenses.map((e) => e.currency.trim().toUpperCase() || 'USD'))
  const currency = mealExpenses[0]?.currency.trim().toUpperCase() || 'USD'
  if (currencies.size > 1) {
    return { used: 0, allowance, remaining: allowance, over: false, currency, mixed: true }
  }
  const remainingCents = Math.round(allowance * 100) - usedCents
  const remaining = remainingCents / 100
  return { used, allowance, remaining, over: remainingCents < 0, currency, mixed: false }
}

/** "Food $45.00 used · $5.00 left" or, over budget, "Food $60.00 used · $10.00 over". */
export function formatFoodBalance(balance: FoodBalance): string {
  if (balance.mixed) return 'Food not totalled · meals in more than one currency'
  const used = formatMoney(balance.used, balance.currency)
  const rest = formatMoney(Math.abs(balance.remaining), balance.currency)
  return balance.over ? `Food ${used} used · ${rest} over` : `Food ${used} used · ${rest} left`
}

/** Per-currency totals of the personal (non-reimbursable) portion the
 * employee owes back to the company, across every expense in a report. */
export function personalTotalsByCurrency(expenses: Expense[]): Map<string, number> {
  const totals = new Map<string, number>()
  for (const e of expenses) {
    const personal = e.personalAmount ?? 0
    if (personal <= 0) continue
    const currency = e.currency.trim().toUpperCase()
    totals.set(currency, (totals.get(currency) ?? 0) + personal)
  }
  return totals
}

/** Formatted "employee pays credit card company" total, or null if nothing is owed. */
export function formatPersonalTotal(expenses: Expense[]): string | null {
  const totals = personalTotalsByCurrency(expenses)
  if (totals.size === 0) return null
  return [...totals].map(([currency, amount]) => formatMoney(amount, currency)).join(' + ')
}
