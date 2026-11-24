import type { Expense, Report } from '../types'

/**
 * One invented report, used by reportNumbers.test.ts and pdf.test.ts to pin the
 * figures an expense report shows. It has something of everything those
 * figures depend on: three currencies, one of them with no exchange rate;
 * personal portions; a daily meal allowance, met, over and split across two
 * currencies; an expense dated before the trip; and one with no date.
 */
export const SAMPLE_REPORT: Report = {
  id: 'sample-report',
  name: 'Sample regional visit',
  createdAt: 1789000000000,
  startDate: '2026-09-14',
  endDate: '2026-09-16',
  dailyMealAllowance: 50,
  projectNumber: 'PRJ-SAMPLE-9',
  exchangeRates: { EUR: 1.1 },
}

const base = { reportId: SAMPLE_REPORT.id, notes: '', createdAt: 1789000000000 }

/** In the order they were added, which is not date order. */
export const SAMPLE_EXPENSES: Expense[] = [
  { ...base, id: 's1', position: 0, title: 'Flight', merchant: 'Example Air', amount: 412.3, currency: 'USD', date: '2026-09-12', category: 'Travel', notes: 'Window seat, "economy"', personalAmount: 0 },
  { ...base, id: 's2', position: 1, title: 'Breakfast', merchant: 'Example Cafe', amount: 18.4, currency: 'USD', date: '2026-09-14', category: 'Meals', personalAmount: 3.4 },
  { ...base, id: 's3', position: 2, title: 'Dinner', merchant: 'Sample Grill', amount: 36.25, currency: 'USD', date: '2026-09-14', category: 'Meals', personalAmount: 0 },
  { ...base, id: 's4', position: 3, title: 'Lunch', merchant: 'Example Brasserie', amount: 22, currency: 'EUR', date: '2026-09-15', category: 'Meals', personalAmount: 0 },
  { ...base, id: 's5', position: 4, title: 'Hotel', merchant: 'Sample Hotel', amount: 189, currency: 'EUR', date: '2026-09-15', category: 'Lodging', personalAmount: 20 },
  { ...base, id: 's6', position: 5, title: 'Coffee', merchant: 'Example Roasters', amount: 4.5, currency: 'GBP', date: '2026-09-16', category: 'Meals', personalAmount: 0 },
  { ...base, id: 's7', position: 6, title: 'Lunch', merchant: 'Sample Deli', amount: 5.02, currency: 'USD', date: '2026-09-16', category: 'Meals', personalAmount: 0 },
  { ...base, id: 's8', position: 7, title: 'Travel adapter', merchant: 'Example Store', amount: 12.99, currency: 'USD', date: '', category: 'Supplies', personalAmount: 0 },
]
