import { describe, expect, it } from 'vitest'
import { parseReceiptText } from './ocr'

describe('parseReceiptText', () => {
  it('picks the largest keyword-matched total over a plain subtotal', () => {
    const text = ['Joe\'s Diner', 'Subtotal 18.00', 'Tax 1.50', 'Total 19.50'].join('\n')
    expect(parseReceiptText(text).total).toBe(19.5)
  })

  it('ignores discount/tax lines that happen to say "total"', () => {
    const text = ['Joe\'s Diner', 'Total Savings 5.00', 'Total Tax 2.00', 'Total 22.00'].join('\n')
    expect(parseReceiptText(text).total).toBe(22)
  })

  it('parses an ISO date', () => {
    expect(parseReceiptText('Store\n2026-07-18\nTotal 10.00').date).toBe('2026-07-18')
  })

  it('parses a US-style month/day/year date', () => {
    expect(parseReceiptText('Store\n07/18/2026\nTotal 10.00').date).toBe('2026-07-18')
  })

  it('picks the first plausible line as the merchant', () => {
    expect(parseReceiptText('STARBUCKS\n123 Main St\nTotal 5.00').merchant).toBe('Starbucks')
  })

  it('does not let an earlier price line poison a later merchant check (regression)', () => {
    // Before the fix, MONEY_RE.test() (a stateful `g`-flag regex) left a
    // non-zero lastIndex after matching "12.34" on the first line, causing
    // the match on "42.00 Foods" to be missed and that line wrongly picked
    // as the merchant.
    const text = ['Roma 12.34', '42.00 Foods', 'Total 42.00'].join('\n')
    expect(parseReceiptText(text).merchant).not.toBe('42.00 Foods')
  })

  it('skips lines that are mostly digits or too long to be a merchant name', () => {
    const text = ['0000123456789', 'Corner Bakery', 'Total 8.00'].join('\n')
    expect(parseReceiptText(text).merchant).toBe('Corner Bakery')
  })

  it('lets a promotional header line steal the merchant slot from the real store name below it (documents current behavior)', () => {
    // The merchant heuristic picks the first short, non-numeric line among
    // the first 6 — it has no way to distinguish a promo/greeting header
    // from the actual store name. Asserted here so a future change to the
    // heuristic is a deliberate decision, not a silent regression; the
    // misparse is a reviewable inconvenience since all fields stay editable
    // before save.
    const text = ['*** WELCOME ***', 'Starbucks', '123 Main St', 'Total 5.00'].join('\n')
    expect(parseReceiptText(text).merchant).toBe('Welcome')
  })

  it('parses a comma-decimal, currency-symbol total (European format)', () => {
    const text = ['Cafe Central', 'Total €19,50'].join('\n')
    expect(parseReceiptText(text).total).toBe(19.5)
  })

  it('parses a pound-sterling total', () => {
    const text = ['Corner Shop', 'Total £7.99'].join('\n')
    expect(parseReceiptText(text).total).toBe(7.99)
  })
})
