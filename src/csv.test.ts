import { describe, expect, it } from 'vitest'
import { buildExpenseCsv } from './csv'
import type { Expense } from './types'

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'e1',
    reportId: 'r1',
    position: 0,
    title: 'Team lunch',
    merchant: "Joe's Diner",
    amount: 42.5,
    currency: 'USD',
    date: '2026-07-18',
    category: 'Meals',
    notes: '',
    createdAt: 1,
    ...overrides,
  }
}

describe('buildExpenseCsv', () => {
  it('writes the header row even with no expenses', () => {
    expect(buildExpenseCsv([])).toBe('Date,Title,Merchant,Category,Amount,Personal Amount,Currency,Notes')
  })

  it('writes one row per expense, in order, with amount formatted to two decimals', () => {
    const csv = buildExpenseCsv([
      makeExpense({ title: 'Lunch', amount: 12 }),
      makeExpense({ title: 'Dinner', amount: 30.5 }),
    ])
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('Date,Title,Merchant,Category,Amount,Personal Amount,Currency,Notes')
    expect(lines[1]).toContain('Lunch')
    expect(lines[1]).toContain('12.00')
    expect(lines[2]).toContain('Dinner')
    expect(lines[2]).toContain('30.50')
  })

  it('includes the personal (non-reimbursable) portion of an expense (regression)', () => {
    const csv = buildExpenseCsv([makeExpense({ amount: 150, personalAmount: 20 })])
    const cols = csv.split('\r\n')[1].split(',')
    expect(cols[4]).toBe('150.00')
    expect(cols[5]).toBe('20.00')
  })

  it('writes 0.00 for the personal amount column when there is no personal portion', () => {
    const csv = buildExpenseCsv([makeExpense({ personalAmount: undefined })])
    const cols = csv.split('\r\n')[1].split(',')
    expect(cols[5]).toBe('0.00')
  })

  it('neutralizes a leading formula character in free-text fields (CSV injection regression)', () => {
    const csv = buildExpenseCsv([
      makeExpense({ title: '-15% discount', merchant: '=cmd', notes: '+1 212 555 0199' }),
    ])
    const cols = csv.split('\r\n')[1].split(',')
    expect(cols[1]).toBe("'-15% discount")
    expect(cols[2]).toBe("'=cmd")
    expect(cols[7]).toBe("'+1 212 555 0199")
  })

  // Date and Category look like fixed vocabularies picked from a date input
  // and a <select>, which is why they went unguarded at first. They are plain
  // strings on Expense, and a restored backup can carry anything in them, so
  // they are as reachable by an attacker-supplied value as Title or Notes.
  it('neutralizes a leading formula character in the date and category columns (CSV injection regression)', () => {
    const csv = buildExpenseCsv([makeExpense({ date: '=1+1', category: '-Meals' })])
    const cols = csv.split('\r\n')[1].split(',')
    expect(cols[0]).toBe("'=1+1")
    expect(cols[3]).toBe("'-Meals")
  })

  it('leaves an ordinary date and category untouched', () => {
    // No real ISO date or category name starts with = + - or @, so the guard
    // above changes nothing a user will ever actually see.
    const csv = buildExpenseCsv([makeExpense({ date: '2026-07-18', category: 'Meals' })])
    const cols = csv.split('\r\n')[1].split(',')
    expect(cols[0]).toBe('2026-07-18')
    expect(cols[3]).toBe('Meals')
  })

  it('guards every column the app does not generate itself', () => {
    // Currency too — it is free text with a 3-character cap in the editor, not
    // a closed list. Amount and Personal Amount are deliberately excluded; the
    // next case pins why.
    const csv = buildExpenseCsv([
      makeExpense({
        date: '@now',
        title: '=1',
        merchant: '+1',
        category: '-x',
        currency: '=US',
        notes: '@cmd',
      }),
    ])
    const cols = csv.split('\r\n')[1].split(',')
    expect([cols[0], cols[1], cols[2], cols[3], cols[6], cols[7]]).toEqual([
      "'@now",
      "'=1",
      "'+1",
      "'-x",
      "'=US",
      "'@cmd",
    ])
  })

  it('does not mangle a genuinely negative amount with the formula guard', () => {
    const csv = buildExpenseCsv([makeExpense({ amount: -5, personalAmount: -2 })])
    const cols = csv.split('\r\n')[1].split(',')
    expect(cols[4]).toBe('-5.00')
    expect(cols[5]).toBe('-2.00')
  })

  it('quotes fields containing commas', () => {
    const csv = buildExpenseCsv([makeExpense({ merchant: 'Smith, Jones & Co' })])
    expect(csv).toContain('"Smith, Jones & Co"')
  })

  it('quotes and escapes fields containing double quotes', () => {
    const csv = buildExpenseCsv([makeExpense({ notes: 'Said "great service"' })])
    expect(csv).toContain('"Said ""great service"""')
  })

  it('quotes fields containing newlines', () => {
    const csv = buildExpenseCsv([makeExpense({ notes: 'Line one\nLine two' })])
    expect(csv).toContain('"Line one\nLine two"')
  })

  it('leaves plain fields unquoted', () => {
    const csv = buildExpenseCsv([makeExpense({ title: 'Plain Title' })])
    expect(csv).toContain('Plain Title')
    expect(csv).not.toContain('"Plain Title"')
  })
})
