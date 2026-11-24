import { describe, expect, it } from 'vitest'
import { buildExpenseCsv } from './csv'
import { businessAmount, foodBalanceForDate, formatFoodBalance, formatPersonalTotal } from './mealAllowance'
import { SAMPLE_EXPENSES, SAMPLE_REPORT } from './test/sampleReport'
import { dayLabel, dayNumbersByDate, formatMoney, formatTotal, sortExpensesByDate, usdTotal } from './types'

/**
 * The figures one report shows, pinned exactly: its totals, the converted USD
 * total, what the employee pays back, the meal allowance for each day, the day
 * labels, and the CSV file. The report screen and the PDF are built from these
 * same functions (pdf.test.ts pins what the PDF prints).
 *
 * People file these figures. A change that moves any of them changes what an
 * expense report already in progress says the next time it is opened or
 * exported, so it has to be a change someone meant: update the number here in
 * the same pull request, and say what changed in CHANGELOG.md.
 */
const expenses = sortExpensesByDate(SAMPLE_EXPENSES)

describe('the figures on the sample report', () => {
  it('lists the expenses by date, the undated one last', () => {
    expect(expenses.map((e) => e.id)).toEqual(['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'])
  })

  it('totals each currency separately', () => {
    expect(formatTotal(expenses)).toBe('$484.96 + €211.00 + £4.50')
  })

  it('converts to USD with the rates set, and names the currency without one', () => {
    const converted = usdTotal(expenses, SAMPLE_REPORT.exchangeRates)
    expect(formatMoney(converted.total, 'USD')).toBe('$717.06')
    expect(converted.missingRates).toEqual(['GBP'])
  })

  it('totals what the employee pays back, per currency', () => {
    expect(formatPersonalTotal(expenses)).toBe('$3.40 + €20.00')
    // Formatted, as every screen and export shows them: 18.40 - 3.40 is
    // 14.999999999999998 before rounding.
    expect(expenses.map((e) => formatMoney(businessAmount(e), e.currency))).toEqual([
      '$412.30', '$15.00', '$36.25', '€22.00', '€169.00', '£4.50', '$5.02', '$12.99',
    ])
  })

  it("measures each day's meals against the allowance", () => {
    const day = (date: string) => formatFoodBalance(foodBalanceForDate(expenses, date, SAMPLE_REPORT.dailyMealAllowance!))
    expect(day('2026-09-12')).toBe('Food $0.00 used · $50.00 left')
    expect(day('2026-09-14')).toBe('Food $51.25 used · $1.25 over')
    expect(day('2026-09-15')).toBe('Food €22.00 used · €28.00 left')
    expect(day('2026-09-16')).toBe('Food not totalled · meals in more than one currency')
  })

  it('labels the days from the trip start', () => {
    const days = dayNumbersByDate(expenses, SAMPLE_REPORT.startDate)
    expect(Object.fromEntries([...days].map(([date, n]) => [date, dayLabel(n)]))).toEqual({
      '2026-09-12': 'Pre-trip',
      '2026-09-14': 'Day 1',
      '2026-09-15': 'Day 2',
      '2026-09-16': 'Day 3',
    })
  })

  it('writes this CSV', () => {
    expect(buildExpenseCsv(expenses).split('\r\n')).toEqual([
      'Date,Title,Merchant,Category,Amount,Personal Amount,Currency,Notes',
      '2026-09-12,Flight,Example Air,Travel,412.30,0.00,USD,"Window seat, ""economy"""',
      '2026-09-14,Breakfast,Example Cafe,Meals,18.40,3.40,USD,',
      '2026-09-14,Dinner,Sample Grill,Meals,36.25,0.00,USD,',
      '2026-09-15,Lunch,Example Brasserie,Meals,22.00,0.00,EUR,',
      '2026-09-15,Hotel,Sample Hotel,Lodging,189.00,20.00,EUR,',
      '2026-09-16,Coffee,Example Roasters,Meals,4.50,0.00,GBP,',
      '2026-09-16,Lunch,Sample Deli,Meals,5.02,0.00,USD,',
      ',Travel adapter,Example Store,Supplies,12.99,0.00,USD,',
    ])
  })
})
