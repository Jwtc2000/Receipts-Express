import { describe, expect, it } from 'vitest'
import {
  businessAmount,
  foodBalanceForDate,
  formatFoodBalance,
  personalTotalsByCurrency,
  formatPersonalTotal,
} from './mealAllowance'
import type { Expense } from './types'

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'e1',
    reportId: 'r1',
    position: 0,
    title: 'Lunch',
    merchant: 'Cafe',
    amount: 20,
    currency: 'USD',
    date: '2026-07-18',
    category: 'Meals',
    notes: '',
    createdAt: 1,
    ...overrides,
  }
}

describe('businessAmount', () => {
  it('equals the full amount when nothing is marked personal', () => {
    expect(businessAmount(makeExpense({ amount: 20 }))).toBe(20)
  })

  it('subtracts the personal portion', () => {
    expect(businessAmount(makeExpense({ amount: 20, personalAmount: 5 }))).toBe(15)
  })
})

describe('foodBalanceForDate', () => {
  it('sums only Meals-category expenses on the given date', () => {
    const expenses = [
      makeExpense({ id: 'a', category: 'Meals', amount: 20, date: '2026-07-18' }),
      makeExpense({ id: 'b', category: 'Travel', amount: 100, date: '2026-07-18' }),
      makeExpense({ id: 'c', category: 'Meals', amount: 15, date: '2026-07-19' }),
    ]
    const balance = foodBalanceForDate(expenses, '2026-07-18', 50)
    expect(balance.used).toBe(20)
    expect(balance.remaining).toBe(30)
    expect(balance.over).toBe(false)
  })

  it('excludes the personal portion from the used total', () => {
    const expenses = [makeExpense({ amount: 20, personalAmount: 8, date: '2026-07-18' })]
    const balance = foodBalanceForDate(expenses, '2026-07-18', 50)
    expect(balance.used).toBe(12)
  })

  it('flags over when used exceeds the allowance', () => {
    const expenses = [makeExpense({ amount: 60, date: '2026-07-18' })]
    const balance = foodBalanceForDate(expenses, '2026-07-18', 50)
    expect(balance.over).toBe(true)
    expect(balance.remaining).toBe(-10)
  })

  it('reports the full allowance as remaining when there are no meal expenses that day', () => {
    const balance = foodBalanceForDate([], '2026-07-18', 50)
    expect(balance.used).toBe(0)
    expect(balance.remaining).toBe(50)
    expect(balance.over).toBe(false)
  })

  it('uses the currency of the day\'s meal expenses, falling back to USD', () => {
    expect(foodBalanceForDate([], '2026-07-18', 50).currency).toBe('USD')
    const eur = [makeExpense({ currency: 'EUR', date: '2026-07-18' })]
    expect(foodBalanceForDate(eur, '2026-07-18', 50).currency).toBe('EUR')
  })
})

describe('a day that spends exactly the allowance', () => {
  // As floating-point, 5.02 + 29.6 + 15.38 is a hair over 50.
  it('is not flagged as over', () => {
    const day = [
      makeExpense({ id: 'a', amount: 5.02 }),
      makeExpense({ id: 'b', amount: 29.6 }),
      makeExpense({ id: 'c', amount: 15.38 }),
    ]
    const balance = foodBalanceForDate(day, '2026-07-18', 50)
    expect(balance.over).toBe(false)
    expect(balance.remaining).toBe(0)
  })
})

describe('a day with meals in more than one currency', () => {
  const day = [
    makeExpense({ id: 'a', amount: 12, currency: 'USD' }),
    makeExpense({ id: 'b', amount: 40, currency: 'EUR' }),
  ]

  it('is marked mixed and never flagged as over', () => {
    const balance = foodBalanceForDate(day, '2026-07-18', 30)
    expect(balance.mixed).toBe(true)
    expect(balance.over).toBe(false)
  })

  it('prints no figure, because 12 dollars plus 40 euros is not 52 of anything', () => {
    const text = formatFoodBalance(foodBalanceForDate(day, '2026-07-18', 30))
    expect(text).toBe('Food not totalled · meals in more than one currency')
    expect(text).not.toMatch(/\d/)
  })

  it('reads a blank currency as USD, as the rest of the app does', () => {
    const balance = foodBalanceForDate([day[0], makeExpense({ id: 'c', amount: 8, currency: '' })], '2026-07-18', 30)
    expect(balance.mixed).toBe(false)
  })

  it('still totals a day whose meals share one currency', () => {
    const balance = foodBalanceForDate([day[0], makeExpense({ id: 'c', amount: 8 })], '2026-07-18', 30)
    expect(balance.mixed).toBe(false)
    expect(balance.used).toBe(20)
  })
})

describe('formatFoodBalance', () => {
  it('formats an under-budget day', () => {
    const balance = foodBalanceForDate([makeExpense({ amount: 20 })], '2026-07-18', 50)
    expect(formatFoodBalance(balance)).toBe('Food $20.00 used · $30.00 left')
  })

  it('formats an over-budget day', () => {
    const balance = foodBalanceForDate([makeExpense({ amount: 60 })], '2026-07-18', 50)
    expect(formatFoodBalance(balance)).toBe('Food $60.00 used · $10.00 over')
  })
})

describe('personalTotalsByCurrency / formatPersonalTotal', () => {
  it('returns null / empty when nothing is marked personal', () => {
    expect(formatPersonalTotal([makeExpense()])).toBeNull()
    expect(personalTotalsByCurrency([makeExpense()]).size).toBe(0)
  })

  it('sums personal amounts across expenses, per currency', () => {
    const expenses = [
      makeExpense({ id: 'a', personalAmount: 5, currency: 'USD' }),
      makeExpense({ id: 'b', personalAmount: 3, currency: 'USD' }),
      makeExpense({ id: 'c', personalAmount: 10, currency: 'EUR' }),
    ]
    const totals = personalTotalsByCurrency(expenses)
    expect(totals.get('USD')).toBe(8)
    expect(totals.get('EUR')).toBe(10)
    expect(formatPersonalTotal(expenses)).toContain('$8.00')
    expect(formatPersonalTotal(expenses)).toContain('€10.00')
  })

  it('ignores expenses with no or zero personal amount', () => {
    const expenses = [makeExpense({ personalAmount: 0 }), makeExpense({ personalAmount: undefined })]
    expect(formatPersonalTotal(expenses)).toBeNull()
  })
})
