import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseReceiptText } from './ocr'
import { TESSERACT_DIR } from './engineDirs'

// The real library would be loaded (and a real worker started) just to read
// the options it was handed, so it is replaced with a recorder.
const { createWorker } = vi.hoisted(() => ({ createWorker: vi.fn() }))
vi.mock('tesseract.js', () => ({ createWorker }))

/**
 * tesseract.js defaults all three of these to a jsdelivr CDN — the worker
 * script, the WASM core, and the language data. Nothing about self-hosting is
 * automatic: it is these three lines in src/ocr.ts and nothing else. Delete
 * any one of them and the app silently starts downloading part of its OCR
 * engine from a third party the first time someone scans a receipt.
 *
 * That is not only a supply-chain question. docs/privacy.html section 5 tells
 * the reader that both engines "are served from this app's own address — the
 * app does not load code from external CDNs", and the CSP's `script-src 'self'`
 * would block the load, so the failure mode is a published false statement
 * plus a scanner that no longer works. The overrides had no test at all.
 */
describe('OCR engine assets are self-hosted', () => {
  beforeEach(() => {
    vi.resetModules()
    createWorker.mockReset()
    createWorker.mockResolvedValue({
      recognize: vi.fn().mockResolvedValue({ data: { text: '' } }),
    })
  })

  async function workerOptions(): Promise<Record<string, string>> {
    const { extractReceipt } = await import('./ocr')
    await extractReceipt(new Blob(['receipt']))
    expect(createWorker).toHaveBeenCalledTimes(1)
    return createWorker.mock.calls[0][2] as Record<string, string>
  }

  it.each(['workerPath', 'corePath', 'langPath'])(
    'overrides %s with a path under the app\'s own base URL',
    async (option) => {
      const options = await workerOptions()
      const value = options[option]
      expect(typeof value).toBe('string')
      expect(value.startsWith(import.meta.env.BASE_URL)).toBe(true)
      // Nothing with a scheme, and nothing protocol-relative — either would
      // leave the app's origin however the string was built.
      expect(value).not.toMatch(/^(?:[a-z][a-z0-9+.-]*:)?\/\//i)
      expect(value).not.toMatch(/jsdelivr|unpkg|cdn/i)
    },
  )

  it('points all three at the vendored, versioned copy under /tesseract', async () => {
    const options = await workerOptions()
    const base = `${import.meta.env.BASE_URL}${TESSERACT_DIR}`
    expect(base).toMatch(/tesseract\/\d/)
    expect(options.workerPath).toBe(`${base}/worker.min.js`)
    expect(options.corePath).toBe(base)
    expect(options.langPath).toBe(base)
    // The cached copy is keyed by this, so a new model is a new entry rather
    // than the old one silently reused (see src/ocrCache.test.ts).
    expect(options.cachePath).toBe(TESSERACT_DIR)
  })
})

describe('parseReceiptText dates', () => {
  it.each([
    ['ISO', 'Store\n2026-07-18', '2026-07-18'],
    ['US month first', 'Store\n07/18/2026', '2026-07-18'],
    ['day first when the first number cannot be a month', 'Store\n18/07/2026', '2026-07-18'],
    ['two-digit year', 'Store\n07-18-26', '2026-07-18'],
    ['month name first', 'Store\nJul 18, 2026', '2026-07-18'],
    ['day first with a month name', 'Store\n18 July 2026', '2026-07-18'],
  ])('reads a %s date', (_label, text, expected) => {
    expect(parseReceiptText(text).date).toBe(expected)
  })

  it('rejects a day the month does not have instead of rolling it into the next month', () => {
    expect(parseReceiptText('Store\n04/31/2026').date).toBeUndefined()
  })

  it('skips a dotted phone number and finds the real date further down', () => {
    const text = ['Boulangerie', 'Tel 01.23.45.67.89', '2026-07-18'].join('\n')
    expect(parseReceiptText(text).date).toBe('2026-07-18')
  })

  it('does not read a month inside a longer word', () => {
    expect(parseReceiptText('Walmart 2041\nSupermarket 2026').date).toBeUndefined()
  })

  it('does not accept a date in the future', () => {
    expect(parseReceiptText('Trans 04-12-0033\n2026-07-18').date).toBe('2026-07-18')
  })

  it('takes the earliest date, which on a folio is the arrival rather than the printing', () => {
    const text = ['Lakeside Inn', 'Date: 03/09/26', 'Arrival Date: 03/02/26', 'Departure Date: 03/05/26', 'Total 312.40']
    expect(parseReceiptText(text.join('\n')).date).toBe('2026-03-02')
  })

  it('ignores a date far earlier than the rest, as a misread year', () => {
    expect(parseReceiptText('Store\n2026-07-18\nPrinted 2025-07-18').date).toBe('2026-07-18')
  })

  it('reads a month name with no space before the day, as OCR sometimes gives it', () => {
    expect(parseReceiptText('Mar14,2026, 10:25AM Receipt #10000001').date).toBe('2026-03-14')
  })

  it('reads a day written with an ordinal', () => {
    expect(parseReceiptText('Departing: Mar 2nd, 2026 06:00AM').date).toBe('2026-03-02')
  })
})

describe('parseReceiptText merchant', () => {
  it('keeps accented letters', () => {
    expect(parseReceiptText('Café Rouge\nTotal 4.50').merchant).toBe('Café Rouge')
  })

  it('keeps the combining marks a script writes vowels with', () => {
    expect(parseReceiptText('किराना स्टोर\nTotal 20.00').merchant).toBe('किराना स्टोर')
  })

  it('accepts a two-letter brand', () => {
    expect(parseReceiptText('H&M\n12 High Street\nTotal 20.00').merchant).toBe('H&M')
  })
})

describe('parseReceiptText', () => {
  // The integer part of an amount was once capped at three digits with no
  // left boundary, so these lost their leading digits (234.56, 0, 345).
  it.each([
    ['Total 1234.56', 1234.56],
    ['Total 1000.00', 1000],
    ['TOTAL $12345.00', 12345],
    ['Total 1,234.56', 1234.56],
    ['Total 1.234,56', 1234.56],
    ['Total €19,50', 19.5],
  ])('reads the whole amount in %j', (line, expected) => {
    expect(parseReceiptText(`Store\n${line}`).total).toBe(expected)
  })

  it('ignores a keyword line reading 0.00 when there is a real amount', () => {
    // No other keyword line: before the fix, the 0.00 was taken as the total.
    const text = ['Cafe', 'Coffee 4.50', 'Balance due 0.00'].join('\n')
    expect(parseReceiptText(text).total).toBe(4.5)
  })

  it('does not take the day and month of a dotted date for an amount', () => {
    const text = ['Shop', '18.07.2026', 'Coffee 3.50', 'Bagel 4.25'].join('\n')
    expect(parseReceiptText(text).total).toBe(4.25)
  })

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

  it('passes over a greeting line to the store name below it', () => {
    // Until 1.19.0 the first short line won, and this read "Welcome".
    const text = ['*** WELCOME ***', 'Starbucks', '123 Main St', 'Total 5.00'].join('\n')
    expect(parseReceiptText(text).merchant).toBe('Starbucks')
  })

  it('takes the name from "receipt for ..." over the app name above it', () => {
    const text = ['Mar 3, 2026', 'Food Courier 2:15 PM', "Here's your receipt for Taco Palace (12 Elm St).", 'Total $21.40']
    expect(parseReceiptText(text.join('\n')).merchant).toBe('Taco Palace')
  })

  it("takes an emailed receipt's sender name, without the mailbox word", () => {
    const text = [
      'eTicket Itinerary and Receipt for Confirmation ABC123',
      'From: Coastal Air Receipts <receipts@coastal.example>',
      'Date: Wed, Mar 4, 2026, 9:10 AM',
      'Total 35.00',
    ]
    expect(parseReceiptText(text.join('\n')).merchant).toBe('Coastal Air')
  })

  it('takes the name from "Thank you for choosing ..."', () => {
    expect(parseReceiptText('Thank you for choosing Coastal Air.\nTotal 20.00').merchant).toBe('Coastal Air')
  })

  it('cuts a field label off the end of the name line', () => {
    expect(parseReceiptText('ACME CAR RENTAL CORPORATION Rental Agreement No: 1234567\nTotal 10.00').merchant).toBe(
      'Acme Car Rental Corporation',
    )
    expect(parseReceiptText('Lakeside Inn & Suites Account: 1234567890\nTotal 10.00').merchant).toBe(
      'Lakeside Inn & Suites',
    )
  })

  it('drops a lone digit read in front of the name', () => {
    expect(parseReceiptText('4 Lakeside Inn & Suites\nTotal 10.00').merchant).toBe('Lakeside Inn & Suites')
  })

  it('leaves the merchant empty rather than take an address, a date or a till field', () => {
    const text = ['Receipt', 'Mar 3, 2026', '100 Main Avenue, Ste A', 'Millbrook, ST 12345', 'Server: Pat', 'Check #6 Table B4', 'Total 41.10']
    expect(parseReceiptText(text.join('\n')).merchant).toBeUndefined()
  })

  it('stops at the first priced line instead of taking an item', () => {
    const text = ['Receipt', 'Blueberry Muffin $4.50', 'Orange Juice', 'Total 9.75']
    expect(parseReceiptText(text.join('\n')).merchant).toBeUndefined()
  })

  it('does not take the town the store is in for its name', () => {
    const text = ['Millbrook | #100', '10 Oak Dr', 'Millbrook, ST 12345', 'Total 30.00']
    expect(parseReceiptText(text.join('\n')).merchant).toBeUndefined()
  })

  it('knows the town line even when OCR misreads a digit of the ZIP', () => {
    const text = ['Millbrook | #100', '10 Oak Dr', 'Millbrook, ST B2345', 'Total 30.00']
    expect(parseReceiptText(text.join('\n')).merchant).toBeUndefined()
  })

  it('accepts a one-word name read with little confidence, but not a line of fragments', () => {
    const line = (words: [string, number][]) => ({ text: words.map(([w]) => w).join(' '), words: words.map(([text, confidence]) => ({ text, confidence })) })
    const fragments = [line([['MAE', 45], ['RIK', 47], ['ZO', 44]]), line([['Total', 96], ['9.10', 96]])]
    expect(parseReceiptText(fragments.map((l) => l.text).join('\n'), fragments).merchant).toBeUndefined()
    const logo = [line([['FUELMART', 47]]), line([['Total', 96], ['9.10', 96]])]
    expect(parseReceiptText(logo.map((l) => l.text).join('\n'), logo).merchant).toBe('Fuelmart')
  })

  it('finds a name given only in the footer, above the street address', () => {
    const text = [
      'Pickup order #12AB confirmed!',
      'Order Summary',
      '1 Burger $12.00',
      'Total $14.20',
      'Taco Palace Co. Taco Palace Co.',
      '10 Oak St. Suite 2, Millbrook, ST 12345',
    ]
    expect(parseReceiptText(text.join('\n')).merchant).toBe('Taco Palace Co.')
  })

  it("uses OCR confidence to skip a photo's background and trim it off a line's edges", () => {
    const line = (words: [string, number][]) => ({ text: words.map(([w]) => w).join(' '), words: words.map(([text, confidence]) => ({ text, confidence })) })
    const lines = [
      line([['Vrn', 20], ['Ka', 10], ['Tt', 15], ['OQX', 30]]),
      line([['ae', 30], ['Millbrook', 90], ['Corner', 90], ['Diner', 90], ['j', 5]]),
      line([['Total', 96], ['9.10', 96]]),
    ]
    const text = lines.map((l) => l.text).join('\n')
    expect(parseReceiptText(text, lines).merchant).toBe('Millbrook Corner Diner')
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

describe('receiptFromText', () => {
  const invoice = ['Acme Car Rental', 'Invoice Date: 03/05/2026', 'Rental charges 150.00', 'Tax 12.00', 'Total Amount Due 162.00'].join('\n')

  it('reads a receipt from a PDF text layer', async () => {
    const { receiptFromText } = await import('./ocr')
    expect(receiptFromText(invoice)).toMatchObject({ merchant: 'Acme Car Rental', date: '2026-03-05', total: 162 })
  })

  it('refuses text too short to be a receipt, such as a stamped page number', async () => {
    const { receiptFromText } = await import('./ocr')
    expect(receiptFromText('Page 1 of 1  1.00')).toBeNull()
  })

  it('refuses text with no amount, so OCR can still look at the picture', async () => {
    const { receiptFromText } = await import('./ocr')
    expect(receiptFromText('Scanned with the office copier on the third floor')).toBeNull()
  })

  it('refuses text from a font with no Unicode map', async () => {
    const { receiptFromText } = await import('./ocr')
    // Private-use code points, as such fonts produce, mixed into real text.
    expect(receiptFromText(`${invoice}\n\ue001\ue002\ue003`)).toBeNull()
    expect(receiptFromText(invoice.replace(/[a-z]/g, '\ufffd'))).toBeNull()
  })

  it('refuses text that is mostly symbols', async () => {
    const { receiptFromText } = await import('./ocr')
    expect(receiptFromText(`${invoice}\n${'¤¦§¨©ª«¬®¯°±²³'.repeat(6)}`)).toBeNull()
  })
})

describe('extractReceipt', () => {
  const page = (text: string) => ({ data: { text, blocks: null } })

  beforeEach(() => {
    vi.resetModules()
    createWorker.mockReset()
  })

  it('asks the engine for word confidences as well as the text', async () => {
    const recognize = vi.fn().mockResolvedValue(page('Store\nTotal 5.00'))
    createWorker.mockResolvedValue({ recognize })
    const { extractReceipt } = await import('./ocr')
    await extractReceipt(new Blob(['receipt']))
    expect(recognize.mock.calls[0][2]).toEqual({ text: true, blocks: true })
  })

  it('reads further pages of a scan only until it finds a total', async () => {
    const recognize = vi
      .fn()
      .mockResolvedValueOnce(page('Coastal Air\nItinerary, Mar 2, 2026'))
      .mockResolvedValueOnce(page('Bag fee\nTotal 35.00'))
      .mockResolvedValueOnce(page('Conditions of carriage'))
    createWorker.mockResolvedValue({ recognize })
    const { extractReceipt } = await import('./ocr')
    const got = await extractReceipt([new Blob(['1']), new Blob(['2']), new Blob(['3'])])
    expect(recognize).toHaveBeenCalledTimes(2)
    expect(got).toMatchObject({ merchant: 'Coastal Air', date: '2026-03-02', total: 35 })
  })

  it('reads at most five pages', async () => {
    const recognize = vi.fn().mockResolvedValue(page('Terms and conditions'))
    createWorker.mockResolvedValue({ recognize })
    const { extractReceipt } = await import('./ocr')
    await extractReceipt(Array.from({ length: 8 }, () => new Blob(['page'])))
    expect(recognize).toHaveBeenCalledTimes(5)
  })
})
