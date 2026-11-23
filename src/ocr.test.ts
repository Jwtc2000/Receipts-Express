import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

  it('does not take the customer an order is for as the merchant', () => {
    expect(parseReceiptText('Corner Bakery\nOrder for Jane Doe\nTotal 9.75').merchant).toBe('Corner Bakery')
    expect(parseReceiptText('Your order from Taco Palace\nTotal 9.75').merchant).toBe('Taco Palace')
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
    const fragments = [line([['VRN', 45], ['QLT', 47], ['ZO', 44]]), line([['Total', 96], ['9.10', 96]])]
    expect(parseReceiptText(fragments.map((l) => l.text).join('\n'), fragments).merchant).toBeUndefined()
    const logo = [line([['FUELMART', 47]]), line([['Total', 96], ['9.10', 96]])]
    expect(parseReceiptText(logo.map((l) => l.text).join('\n'), logo).merchant).toBe('Fuelmart')
  })

  it("does not take a chain's town and store number line for its name", () => {
    expect(parseReceiptText('Millbrook | #4410\n10 Oak Dr\nTotal 30.00').merchant).toBeUndefined()
  })

  it('knows a city line by its shape when OCR has mangled the state and ZIP', () => {
    const line = (words: [string, number][]) => ({ text: words.map(([w]) => w).join(' '), words: words.map(([text, confidence]) => ({ text, confidence })) })
    const lines = [
      line([['Vrn', 20], ['Ka', 10]]),
      line([['MILLBROOK', 90]]),
      line([['12', 30], ['OAK', 90], ['ST', 90]]),
      line([['Millbrook,', 80], ['&T', 70], ['2Q425', 80]]),
      line([['Total', 96], ['30.00', 96]]),
    ]
    // Not the town above its own city line, not the street with its number
    // trimmed off as noise, and not the city line itself.
    expect(parseReceiptText(lines.map((l) => l.text).join('\n'), lines).merchant).toBeUndefined()
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

describe('parseReceiptText total, checked against the other lines', () => {
  const total = (lines: string[]) => parseReceiptText(lines.join('\n')).total

  it('restores a decimal point OCR lost when the result agrees with subtotal plus tax', () => {
    // A larger printed total earlier on does not outweigh the reading that agrees.
    expect(total(['Corner Bakery', 'Total 300.00', 'Subtotal 186.96', 'Tax 15.42', 'TOTAL 20238'])).toBe(202.38)
  })

  it('reads a "$" taken for a digit off the total when that agrees with subtotal plus tax', () => {
    expect(total(['Corner Bakery', 'SUBTOTAL 9.26', 'TAX 0.65', 'TOTAL 49.91'])).toBe(9.91)
  })

  it('checks a total against the card payment', () => {
    expect(total(['Corner Bakery', 'Total 300.00', 'TOTAL $22233', 'VISA ****1234 $222.33'])).toBe(222.33)
  })

  it('keeps the printed total when a tip makes it more than subtotal plus tax', () => {
    expect(total(['Corner Bakery', 'Subtotal 30.00', 'Tax 2.40', 'Tip 6.00', 'Total 38.40'])).toBe(38.4)
  })

  it('keeps a total printed after a tip over the one before it that agrees', () => {
    const lines = ['Corner Bakery', 'Subtotal 30.00', 'Tax 2.40', 'Total 32.40', 'Tip 6.00', 'Grand Total 38.40']
    expect(total(lines)).toBe(38.4)
  })

  it('adds up several tax lines, or uses the total tax line when there is one', () => {
    expect(total(['Corner Bakery', 'Subtotal 100.00', 'State Tax 6.00', 'Local Tax 2.00'])).toBe(108)
    expect(total(['Corner Bakery', 'Subtotal 100.00', 'State Tax 6.00', 'Local Tax 2.00', 'Total Tax 8.00'])).toBe(108)
    expect(total(['Corner Bakery', 'Subtotal 100.00', 'Taxable amount 100.00', 'Tax 8.00'])).toBe(108)
  })

  it('never takes a tax rate for money', () => {
    expect(total(['Corner Bakery', 'Subtotal 20.00', 'Tax 8.25% 1.65', 'Total 21.65'])).toBe(21.65)
    expect(total(['Corner Bakery', 'Tax 8.25%'])).toBeUndefined()
  })

  it('does not take cash handed over or change for the total', () => {
    expect(total(['Corner Bakery', 'Coffee 4.50', 'CASH 20.00', 'CHANGE 15.50'])).toBe(4.5)
  })

  it('adds subtotal and tax when no total line was read', () => {
    expect(total(['Corner Bakery', 'Subtotal 106.95', 'Tax 8.82'])).toBe(115.77)
  })

  it('reads "TOTAL" as OCR misspells it', () => {
    expect(total(['Corner Bakery', 'SUBTOTAL $131.34', 'TAX $9.10', 'TOTAS $140.53'])).toBe(140.53)
  })

  it('does not repair three digits of noise at the end of a total line', () => {
    expect(total(['Corner Bakery', 'Paper 50.16', 'Total Ti aad i900'])).toBe(50.16)
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

  it('does not stop at a page whose only amount is the largest number on it', async () => {
    const recognize = vi
      .fn()
      .mockResolvedValueOnce(page('Coastal Air\nFare 100.00\nTax 12.00'))
      .mockResolvedValueOnce(page('Total 112.00'))
    createWorker.mockResolvedValue({ recognize })
    const { extractReceipt } = await import('./ocr')
    const got = await extractReceipt([new Blob(['1']), new Blob(['2'])])
    expect(recognize).toHaveBeenCalledTimes(2)
    expect(got.total).toBe(112)
  })

  it('falls back to the largest amount when no page has a total line', async () => {
    const recognize = vi.fn().mockResolvedValueOnce(page('Coastal Air\nFare 100.00')).mockResolvedValueOnce(page('Conditions'))
    createWorker.mockResolvedValue({ recognize })
    const { extractReceipt } = await import('./ocr')
    const got = await extractReceipt([new Blob(['1']), new Blob(['2'])])
    expect(recognize).toHaveBeenCalledTimes(2)
    expect(got.total).toBe(100)
  })

  it('reads at most five pages', async () => {
    const recognize = vi.fn().mockResolvedValue(page('Terms and conditions'))
    createWorker.mockResolvedValue({ recognize })
    const { extractReceipt } = await import('./ocr')
    await extractReceipt(Array.from({ length: 8 }, () => new Blob(['page'])))
    expect(recognize).toHaveBeenCalledTimes(5)
  })
})

describe('extractReceipt second reading for dotted print', () => {
  // One block holding the given lines, as tesseract.js reports them.
  const read = (rows: [string, number][][]) => ({
    data: {
      text: rows.map((r) => r.map(([w]) => w).join(' ')).join('\n'),
      blocks: [
        {
          paragraphs: [
            { lines: rows.map((r) => ({ text: r.map(([w]) => w).join(' '), words: r.map(([text, confidence]) => ({ text, confidence })) })) },
          ],
        },
      ],
    },
  })
  const joined = new Blob(['joined'])

  beforeEach(() => {
    vi.resetModules()
    createWorker.mockReset()
    vi.doMock('./ocrPrep', () => ({
      invertDarkBands: (image: Blob) => Promise.resolve(image),
      joinDots: () => Promise.resolve(joined),
    }))
  })
  afterEach(() => vi.doUnmock('./ocrPrep'))

  it('reads an unsure page again with the dots joined, and keeps the clearer reading', async () => {
    const recognize = vi
      .fn()
      .mockResolvedValueOnce(read([[['VRN', 30], ['Q', 20], ['LT', 25]], [['Total', 40], ['3O.0O', 30]]]))
      .mockResolvedValueOnce(read([[['FUELMART', 85]], [['Total', 90], ['30.00', 88]]]))
    createWorker.mockResolvedValue({ recognize })
    const { extractReceipt } = await import('./ocr')
    const got = await extractReceipt(new Blob(['receipt']))
    expect(recognize).toHaveBeenCalledTimes(2)
    expect(recognize.mock.calls[1][0]).toBe(joined)
    expect(got).toMatchObject({ merchant: 'Fuelmart', total: 30 })
  })

  it('keeps the first reading when the second reads less with confidence, even if its average is higher', async () => {
    // A photo on a textured table: the first reading has the name and a lot
    // of low-confidence noise; the second drops the noise and the name.
    const recognize = vi
      .fn()
      .mockResolvedValueOnce(
        read([[['ii', 5], ['mm', 6], ['rr', 4]], [['oo', 10], ['ed', 12], ['Taco', 95], ['Palace', 93]], [['fe', 8], ['Total', 95], ['9.75', 95]]]),
      )
      .mockResolvedValueOnce(read([[['Tao', 82], ['Pal', 81]], [['Total', 90], ['9.75', 90]]]))
    createWorker.mockResolvedValue({ recognize })
    const { extractReceipt } = await import('./ocr')
    expect((await extractReceipt(new Blob(['receipt']))).merchant).toBe('Taco Palace')
    expect(recognize).toHaveBeenCalledTimes(2)
  })

  it('keeps the first reading when neither reads anything with confidence', async () => {
    const recognize = vi
      .fn()
      .mockResolvedValueOnce(read([[['Corner', 66], ['Bakery', 66]], [['Total', 66], ['9.75', 66]]]))
      .mockResolvedValueOnce(read([[['Comer', 72], ['Bakeny', 72]], [['Total', 72], ['9.75', 72]]]))
    createWorker.mockResolvedValue({ recognize })
    const { extractReceipt } = await import('./ocr')
    expect((await extractReceipt(new Blob(['receipt']))).merchant).toBe('Corner Bakery')
    expect(recognize).toHaveBeenCalledTimes(2)
  })

  it('keeps the first reading when the second one fails', async () => {
    const recognize = vi
      .fn()
      .mockResolvedValueOnce(read([[['Corner', 66], ['Bakery', 66]], [['Total', 66], ['9.75', 66]]]))
      .mockRejectedValueOnce(new Error('worker crashed'))
    createWorker.mockResolvedValue({ recognize })
    const { extractReceipt } = await import('./ocr')
    await expect(extractReceipt(new Blob(['receipt']))).resolves.toMatchObject({ merchant: 'Corner Bakery', total: 9.75 })
    expect(recognize).toHaveBeenCalledTimes(2)
  })

  it('still fails when the first reading fails', async () => {
    const recognize = vi.fn().mockRejectedValueOnce(new Error('worker crashed'))
    createWorker.mockResolvedValue({ recognize })
    const { extractReceipt } = await import('./ocr')
    await expect(extractReceipt(new Blob(['receipt']))).rejects.toThrow('worker crashed')
  })

  it('reads a confident page only once', async () => {
    const recognize = vi.fn().mockResolvedValueOnce(read([[['Corner', 95], ['Bakery', 95]], [['Total', 96], ['9.75', 96]]]))
    createWorker.mockResolvedValue({ recognize })
    const { extractReceipt } = await import('./ocr')
    await extractReceipt(new Blob(['receipt']))
    expect(recognize).toHaveBeenCalledTimes(1)
  })
})

describe('sureLetters', () => {
  it('counts the letters and digits of words read with confidence 80 or more', async () => {
    const { sureLetters } = await import('./ocr')
    const words = (pairs: [string, number][]) => [{ text: '', words: pairs.map(([text, confidence]) => ({ text, confidence })) }]
    expect(sureLetters(words([['Bakery', 90], ['9.75', 80], ['noise', 79]]))).toBe(9)
  })
})

describe('readingConfidence', () => {
  it('weighs each word by its letters and digits, and scores an empty page 0', async () => {
    const { readingConfidence } = await import('./ocr')
    const words = (pairs: [string, number][]) => [{ text: '', words: pairs.map(([text, confidence]) => ({ text, confidence })) }]
    expect(readingConfidence(words([['Bakery', 90], ['|', 0]]))).toBe(90)
    expect(readingConfidence(words([['ab', 90], ['abcdef', 50]]))).toBe(60)
    expect(readingConfidence([])).toBe(0)
  })
})
