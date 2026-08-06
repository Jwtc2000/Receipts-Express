import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatTotal, usdTotal, dayNumbersByDate, sortExpensesByDate, resolveDateAfterMove, todayIso } from './types'
import type { Expense } from './types'

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'e1',
    reportId: 'r1',
    position: 0,
    title: '',
    merchant: '',
    amount: 0,
    currency: 'USD',
    date: '',
    category: 'Other',
    notes: '',
    createdAt: 1,
    ...overrides,
  }
}

describe('formatTotal', () => {
  it('sums same-currency expenses into a single total', () => {
    expect(
      formatTotal([
        { amount: 20, currency: 'USD' },
        { amount: 15, currency: 'USD' },
      ]),
    ).toBe('$35.00')
  })

  it('keeps different currencies separate instead of summing raw numbers', () => {
    const result = formatTotal([
      { amount: 20, currency: 'USD' },
      { amount: 15, currency: 'EUR' },
    ])
    expect(result).toContain('$20.00')
    expect(result).toContain('€15.00')
    expect(result).not.toContain('35')
  })

  it('returns a zero total for an empty report', () => {
    expect(formatTotal([])).toBe('$0.00')
  })

  it('merges currency codes that only differ by case (regression)', () => {
    expect(
      formatTotal([
        { amount: 20, currency: 'USD' },
        { amount: 15, currency: 'usd' },
      ]),
    ).toBe('$35.00')
  })
})

describe('usdTotal', () => {
  it('sums USD expenses with no rates needed', () => {
    const result = usdTotal([{ amount: 20, currency: 'USD' }, { amount: 15, currency: 'usd' }], undefined)
    expect(result).toEqual({ total: 35, missingRates: [] })
  })

  it('converts a rated foreign currency and adds it to the USD total', () => {
    const result = usdTotal(
      [
        { amount: 20, currency: 'USD' },
        { amount: 100, currency: 'EUR' },
      ],
      { EUR: 1.08 },
    )
    expect(result.total).toBeCloseTo(20 + 100 * 1.08)
    expect(result.missingRates).toEqual([])
  })

  it('excludes an unrated currency from the total and reports it as missing', () => {
    const result = usdTotal(
      [
        { amount: 20, currency: 'USD' },
        { amount: 100, currency: 'EUR' },
      ],
      undefined,
    )
    expect(result.total).toBe(20)
    expect(result.missingRates).toEqual(['EUR'])
  })

  it('treats a zero or negative rate as missing rather than zeroing out the total', () => {
    const result = usdTotal([{ amount: 100, currency: 'EUR' }], { EUR: 0 })
    expect(result.total).toBe(0)
    expect(result.missingRates).toEqual(['EUR'])
  })

  it('handles multiple foreign currencies, some rated and some not', () => {
    const result = usdTotal(
      [
        { amount: 100, currency: 'EUR' },
        { amount: 50, currency: 'GBP' },
        { amount: 30, currency: 'CHF' },
      ],
      { EUR: 1.08, CHF: 1.12 },
    )
    expect(result.total).toBeCloseTo(100 * 1.08 + 30 * 1.12)
    expect(result.missingRates).toEqual(['GBP'])
  })
})

describe('dayNumbersByDate', () => {
  it('ranks distinct dates chronologically starting at 1', () => {
    const map = dayNumbersByDate([{ date: '2026-07-19' }, { date: '2026-07-18' }, { date: '2026-07-20' }])
    expect(map.get('2026-07-18')).toBe(1)
    expect(map.get('2026-07-19')).toBe(2)
    expect(map.get('2026-07-20')).toBe(3)
  })

  it('gives repeated dates the same day number', () => {
    const map = dayNumbersByDate([{ date: '2026-07-18' }, { date: '2026-07-19' }, { date: '2026-07-18' }])
    expect(map.get('2026-07-18')).toBe(1)
    expect(map.get('2026-07-19')).toBe(2)
    expect(map.size).toBe(2)
  })

  it('ranks by calendar date regardless of array order', () => {
    // Same set of dates, listed in a different order, should rank identically.
    const map = dayNumbersByDate([{ date: '2026-07-20' }, { date: '2026-07-18' }, { date: '2026-07-19' }])
    expect(map.get('2026-07-18')).toBe(1)
    expect(map.get('2026-07-19')).toBe(2)
    expect(map.get('2026-07-20')).toBe(3)
  })

  it('excludes expenses with no date', () => {
    const map = dayNumbersByDate([{ date: '2026-07-18' }, { date: '' }])
    expect(map.has('')).toBe(false)
    expect(map.size).toBe(1)
  })

  it('returns an empty map when no expenses have a date', () => {
    expect(dayNumbersByDate([{ date: '' }, { date: '' }]).size).toBe(0)
  })

  it('computes Day N as the offset from the trip start date when given one', () => {
    const map = dayNumbersByDate([{ date: '2026-07-20' }, { date: '2026-07-18' }], '2026-07-18')
    expect(map.get('2026-07-18')).toBe(1)
    expect(map.get('2026-07-20')).toBe(3)
  })

  it('keeps trip-start-based Day N stable even when a day has no expenses', () => {
    // Only day 1 and day 4 have expenses, but day 4 should still read "Day 4",
    // not "Day 2" (which a rank-based scheme would produce).
    const map = dayNumbersByDate([{ date: '2026-07-18' }, { date: '2026-07-21' }], '2026-07-18')
    expect(map.get('2026-07-18')).toBe(1)
    expect(map.get('2026-07-21')).toBe(4)
  })

  it('allows a date before the trip start to read as Day 0 or earlier', () => {
    const map = dayNumbersByDate([{ date: '2026-07-17' }], '2026-07-18')
    expect(map.get('2026-07-17')).toBe(0)
  })
})

describe('sortExpensesByDate', () => {
  it('sorts by date ascending', () => {
    const sorted = sortExpensesByDate([
      makeExpense({ id: 'b', date: '2026-07-19' }),
      makeExpense({ id: 'a', date: '2026-07-18' }),
    ])
    expect(sorted.map((e) => e.id)).toEqual(['a', 'b'])
  })

  it('breaks ties within the same date by position', () => {
    const sorted = sortExpensesByDate([
      makeExpense({ id: 'b', date: '2026-07-18', position: 1 }),
      makeExpense({ id: 'a', date: '2026-07-18', position: 0 }),
    ])
    expect(sorted.map((e) => e.id)).toEqual(['a', 'b'])
  })

  it('sorts undated expenses after every dated one', () => {
    const sorted = sortExpensesByDate([
      makeExpense({ id: 'undated', date: '', position: 0 }),
      makeExpense({ id: 'dated', date: '2026-07-18', position: 1 }),
    ])
    expect(sorted.map((e) => e.id)).toEqual(['dated', 'undated'])
  })

  it('does not mutate the input array', () => {
    const input = [makeExpense({ id: 'a', date: '2026-07-19' }), makeExpense({ id: 'b', date: '2026-07-18' })]
    const original = [...input]
    sortExpensesByDate(input)
    expect(input).toEqual(original)
  })
})

describe('resolveDateAfterMove', () => {
  it('adopts the date of the item before it', () => {
    const list = [
      makeExpense({ id: 'a', date: '2026-07-18' }),
      makeExpense({ id: 'moved', date: '2026-07-19' }),
      makeExpense({ id: 'c', date: '2026-07-20' }),
    ]
    expect(resolveDateAfterMove(list, 1)).toBe('2026-07-18')
  })

  it('adopts the date of the item after it when moved to the very start', () => {
    const list = [makeExpense({ id: 'moved', date: '2026-07-19' }), makeExpense({ id: 'b', date: '2026-07-20' })]
    expect(resolveDateAfterMove(list, 0)).toBe('2026-07-20')
  })

  it('keeps its own date when there is no dated neighbor', () => {
    const list = [makeExpense({ id: 'only', date: '2026-07-19' })]
    expect(resolveDateAfterMove(list, 0)).toBe('2026-07-19')
  })

  it('skips an undated neighbor before it and falls through to the one after', () => {
    const list = [
      makeExpense({ id: 'before', date: '' }),
      makeExpense({ id: 'moved', date: '2026-07-19' }),
      makeExpense({ id: 'after', date: '2026-07-20' }),
    ]
    expect(resolveDateAfterMove(list, 1)).toBe('2026-07-20')
  })
})

describe('todayIso', () => {
  const originalTz = process.env.TZ

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    process.env.TZ = originalTz
  })

  it('returns the local calendar date, not the UTC date (regression)', () => {
    // 11pm on the 27th in Los Angeles is already 6am on the 28th in UTC —
    // a UTC-based implementation would wrongly report "tomorrow".
    process.env.TZ = 'America/Los_Angeles'
    vi.setSystemTime(new Date('2026-07-27T23:00:00-07:00'))
    expect(todayIso()).toBe('2026-07-27')
  })

  it('also holds true east of UTC, where local time is already the next UTC day (regression)', () => {
    // 1am on the 28th in Tokyo is still the 27th in UTC — a UTC-based
    // implementation would wrongly report "yesterday".
    process.env.TZ = 'Asia/Tokyo'
    vi.setSystemTime(new Date('2026-07-28T01:00:00+09:00'))
    expect(todayIso()).toBe('2026-07-28')
  })
})
