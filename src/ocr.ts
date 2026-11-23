import { createWorker, type Block, type Worker } from 'tesseract.js'
import { TESSERACT_DIR } from './engineDirs'

export interface ExtractedReceipt {
  merchant?: string
  date?: string
  total?: number
  rawText: string
}

/** A recognised line with the engine's confidence (0-100) in each word. */
export interface OcrLine {
  text: string
  words: { text: string; confidence: number }[]
}

// The OCR engine is self-hosted (see scripts/copy-tesseract-assets.mjs),
// so scanning works offline and never talks to a CDN.
const ASSET_BASE = `${import.meta.env.BASE_URL}${TESSERACT_DIR}`

let workerPromise: Promise<Worker> | null = null
let progressCallback: ((pct: number) => void) | null = null

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, {
      workerPath: `${ASSET_BASE}/worker.min.js`,
      corePath: ASSET_BASE,
      langPath: ASSET_BASE,
      // tesseract.js keeps the unpacked model in IndexedDB under
      // `${cachePath}/eng.traineddata`. With no cachePath that key was
      // "./eng.traineddata" whatever the version, so a new model was never
      // fetched once a device had any copy. The versioned directory makes
      // each model its own entry; forgetOldModelCopies removes the old ones.
      cachePath: TESSERACT_DIR,
      logger: (m) => {
        if (m.status === 'recognizing text' && progressCallback) {
          progressCallback(Math.round(m.progress * 100))
        }
      },
    }).catch((err) => {
      workerPromise = null
      throw err
    })
    void workerPromise.then(() => forgetOldModelCopies(`${TESSERACT_DIR}/eng.traineddata`), () => {})
  }
  return workerPromise
}

/**
 * Delete every cached English model except the one in use. tesseract.js
 * stores them in the `keyval-store` database that its idb-keyval dependency
 * creates; the old "./eng.traineddata" copy of the larger model is about
 * 22 MB that nothing reads any more.
 *
 * Opening the database to look never creates it on a device that has none.
 */
export async function forgetOldModelCopies(currentKey: string): Promise<void> {
  try {
    if (typeof indexedDB === 'undefined') return
    const db = await new Promise<IDBDatabase | null>((resolve, reject) => {
      const req = indexedDB.open('keyval-store')
      // Opening a database that does not exist would create it. An upgrade
      // here means exactly that, so it is aborted and nothing is left behind.
      req.onupgradeneeded = () => req.transaction?.abort()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => (req.error?.name === 'AbortError' ? resolve(null) : reject(req.error))
    })
    if (!db) return
    try {
      if (!db.objectStoreNames.contains('keyval')) return
      const store = db.transaction('keyval', 'readwrite').objectStore('keyval')
      const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
        const req = store.getAllKeys()
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      for (const key of keys) {
        if (typeof key === 'string' && key.endsWith('eng.traineddata') && key !== currentKey) store.delete(key)
      }
    } finally {
      db.close()
    }
  } catch {
    // Housekeeping only; scanning works either way.
  }
}

// A scanned PDF is read page by page only until a line labelled as the total
// turns up: most receipts have it on page 1, and an itinerary or folio rarely
// needs more than a few pages to reach it. A page with amounts but no total
// line does not stop the scan, since its largest amount is only a guess.
const MAX_SCANNED_PAGES = 5
// A page read with less confidence than this (0-100, averaged over its
// letters) gets a second reading with dotted print joined into strokes.
//
// The second reading is used when it reads at least MORE_READ times as many
// letters with confidence SURE_WORD or more. Not the average: on a photo of
// a receipt on a textured table, joining turns the table into dark shapes
// the engine skips, so the average rises while the receipt itself reads
// worse. Measured in Chrome on 40 synthetic dot-matrix receipts and 142
// receipts with solid print: dot-matrix pages read at least 1.69 times as
// many sure letters the second time, the table photo 1.22 times, and the
// solid-print pages fewer, or the same.
const DOTTED_PRINT_CONFIDENCE = 70
const SURE_WORD = 80
const MORE_READ = 1.5

/**
 * Run on-device OCR on a receipt and heuristically extract the merchant name,
 * purchase date and total amount.
 *
 * Given several pages (a scanned PDF), page 1 is read first and later pages
 * only while no labelled total has been found, so a one-page receipt costs no
 * more than before. With none on any page read, the largest amount stands in.
 */
export async function extractReceipt(
  images: Blob | Blob[],
  onProgress?: (pct: number) => void,
): Promise<ExtractedReceipt> {
  const pages = (Array.isArray(images) ? images : [images]).slice(0, MAX_SCANNED_PAGES)
  const worker = await getWorker()
  // A wrapper of its own, so two scans passing the same function (the editor
  // always passes the same setter) are still told apart below.
  let pageIndex = 0
  // The second reading of a page keeps the bar where the first left it,
  // rather than sending it back to the start of the page.
  let secondReading = false
  const mine = onProgress
    ? (pct: number) => {
        if (!secondReading) onProgress(Math.round((pageIndex * 100 + pct) / pages.length))
      }
    : null
  progressCallback = mine
  try {
    const texts: string[] = []
    const lines: OcrLine[] = []
    let parsed: Omit<ExtractedReceipt, 'rawText'> = {}
    for (; pageIndex < pages.length; pageIndex++) {
      const { invertDarkBands, joinDots } = await import('./ocrPrep')
      const input = await invertDarkBands(pages[pageIndex])
      let result = await worker.recognize(input, {}, { text: true, blocks: true })
      let pageLines = linesOf(result.data.blocks)
      if (readingConfidence(pageLines) < DOTTED_PRINT_CONFIDENCE) {
        const joined = await joinDots(input)
        if (joined) {
          secondReading = true
          try {
            const second = await worker.recognize(joined, {}, { text: true, blocks: true })
            const secondLines = linesOf(second.data.blocks)
            const before = sureLetters(pageLines)
            const after = sureLetters(secondLines)
            if (after > 0 && after >= before * MORE_READ) {
              result = second
              pageLines = secondLines
            }
          } catch {
            // The second reading is optional: if it fails, the first one
            // stands, as it would have before this step existed.
          } finally {
            secondReading = false
          }
        }
      }
      texts.push(result.data.text)
      lines.push(...pageLines)
      const { totalIsLabelled, ...found } = parseReceipt(texts.join('\n'), lines)
      parsed = found
      if (totalIsLabelled) break
    }
    return { ...parsed, rawText: texts.join('\n') }
  } finally {
    // Only clear the callback this call installed. When two scans overlap,
    // the second has already replaced it, and clearing it here would leave
    // the second scan's progress bar frozen.
    if (progressCallback === mine) progressCallback = null
  }
}

/**
 * How sure the engine was of a page, 0-100: its words' confidences averaged
 * over their letters and digits, so a long word counts for more than a stray
 * mark. A page with nothing read scores 0.
 */
export function readingConfidence(lines: OcrLine[]): number {
  let sum = 0
  let letters = 0
  for (const line of lines) {
    for (const word of line.words) {
      const n = word.text.replace(/[^\p{L}\p{N}]/gu, '').length
      sum += word.confidence * n
      letters += n
    }
  }
  return letters ? sum / letters : 0
}

/** How many letters and digits a page has in words read with confidence SURE_WORD or more. */
export function sureLetters(lines: OcrLine[]): number {
  let letters = 0
  for (const line of lines) {
    for (const word of line.words) {
      if (word.confidence >= SURE_WORD) letters += word.text.replace(/[^\p{L}\p{N}]/gu, '').length
    }
  }
  return letters
}

/** Every recognised line, in reading order, with its words' confidences. */
function linesOf(blocks: Block[] | null | undefined): OcrLine[] {
  const out: OcrLine[] = []
  for (const block of blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        out.push({
          text: line.text.trim(),
          words: line.words.map((w) => ({ text: w.text, confidence: w.confidence })),
        })
      }
    }
  }
  return out
}

/**
 * Read a receipt from the text a PDF carries, or say it cannot be trusted
 * (null), in which case the rendered page is OCR'd instead.
 *
 * Refused: too little text (a scanned PDF, or one with only a stamped page
 * number), text that is mostly symbols or unmapped characters (fonts with no
 * Unicode map give text that is not what is drawn), and text with no amount
 * in it at all, where OCR of the picture may still find one.
 */
export function receiptFromText(text: string): ExtractedReceipt | null {
  const visible = text.replace(/\s+/g, '')
  const wordy = visible.match(/[\p{L}\p{N}]/gu)?.length ?? 0
  if (wordy < 20) return null
  // Characters a receipt is made of; the rest of a well-mapped invoice is a
  // few bullets, dashes and currency signs.
  const usual = visible.match(/[\p{L}\p{M}\p{N}\p{Sc}.,:;/\\\-–—&'’"“”()#%*@+=!?|_[\]·•]/gu)?.length ?? 0
  if (usual / visible.length < 0.9) return null
  // Control characters, private-use code points and U+FFFD are what a font
  // without a usable map produces.
  const broken = visible.match(/[\u0000-\u001f\u007f-\u009f\ue000-\uf8ff\ufffd]/g)?.length ?? 0
  if (broken > 0) return null
  const parsed = parseReceiptText(text)
  if (parsed.total === undefined) return null
  return { ...parsed, rawText: text }
}

// An amount: either digits grouped in threes ("1,234.56", "1.234,56") or a
// plain run of any length ("1234.56"), then a separator and two decimals.
//
// The integer part used to be capped at three digits with nothing anchoring
// its left edge, so an amount of 1,000 or more printed without a thousands
// separator matched from its second digit on: "1234.56" was read as 234.56
// and "Total 1000.00" as 0. The leading group pins the match to the start of
// the number. It is a consumed group, not a lookbehind, because a lookbehind
// is a syntax error on older Safari and would take the whole module with it.
//
// The trailing check also refuses a match that runs on into more digits
// after a separator, which is what a dotted date looks like: "18.07.2026"
// is not 18.07.
const MONEY_SOURCE = String.raw`(?:^|[^\d.,])((?:\d{1,3}(?:[.,]\d{3})+|\d+)[.,]\d{2})(?!\d|[.,]\d)`
const MONEY_RE = new RegExp(MONEY_SOURCE, 'g')

function hasMoney(line: string): boolean {
  return new RegExp(MONEY_SOURCE).test(line)
}

function parseMoney(raw: string): number {
  // Normalize "1.234,56" and "1,234.56" to a plain float
  const cleaned = raw.replace(/[^0-9.,]/g, '')
  const lastSep = Math.max(cleaned.lastIndexOf('.'), cleaned.lastIndexOf(','))
  const intPart = cleaned.slice(0, lastSep).replace(/[.,]/g, '')
  const decPart = cleaned.slice(lastSep + 1)
  return parseFloat(`${intPart || '0'}.${decPart}`)
}

const TOTAL_KEYWORDS = ['grand total', 'amount due', 'balance due', 'total due', 'total']
const SKIP_KEYWORDS = ['subtotal', 'sub-total', 'sub total', 'total savings', 'total discount', 'total tax']

// Lines the total is checked against. OCR often reads "SUBTOTAL" with a 0
// for the O and a 1 for the L.
const SUBTOTAL_LINE = /\bsu[bp8]\s*-?\s*t[o0]ta[l1i]/i
// "Tax", "Taxes", "Tax8.25%" as OCR runs it together, but not "Taxable".
const TAX_LINE = /\btax(?:es)?(?![a-z])/i
// "TOTAL" as OCR misreads it: T0TAL, TOTAI, TOTA1, TOTAS.
const TOTAL_MISREAD = /\bt[o0]ta[l1is|]\b/i
const CARD_LINE = /\b(?:visa|master\s*card|amex|discover|debit|credit|card)\b|\*{3,}/i
// Money handed over or handed back, and a tip written in: never the total
// on their own, so not the fallback either.
const NOT_TOTAL_LINE = /\b(?:cash|change|tender(?:ed)?|tip|gratuity)\b/i

/** The amounts on a line, leaving out percentages ("Tax 8.25%"). */
function amountsOf(line: string): number[] {
  return [...line.replace(/\d+[.,]\d+\s*%/g, ' ').matchAll(MONEY_RE)].map((m) => parseMoney(m[1]))
}

const cents = (n: number) => Math.round(n * 100)

/**
 * The amounts a labelled line may have been printed with, as read first.
 * OCR loses decimal points ("TOTAL 20238" for 202.38) and reads a "$" as a
 * digit ("49.91" for $9.91, "85893" for $58.93). Only the first reading is
 * trusted alone; the others are used when they agree with another line.
 */
function readingsOf(line: string): number[] {
  const out: number[] = []
  const withoutFirstDigit = (c: number) => {
    const digits = String(c)
    if (digits.length >= 4) out.push(Number(digits.slice(1)) / 100)
  }
  for (const a of amountsOf(line)) {
    out.push(a)
    withoutFirstDigit(cents(a))
  }
  if (out.length === 0) {
    // A run of digits at the end of the line, with the point lost.
    const m = line.replace(/\d+[.,]\d+\s*%/g, ' ').match(/(?:^|[^\d.,])\$?(\d{3,7})\s*\S?\s*$/)
    if (m) {
      out.push(Number(m[1]) / 100)
      withoutFirstDigit(Number(m[1]))
    }
  }
  // Zero stays: a tax of 0.00 still checks a total. Totals leave it out.
  return out.filter((n) => n >= 0)
}

/**
 * The total, and whether it came from a line labelled as one (a guess
 * otherwise: see extractReceipt, which reads on to the next page of a scan
 * for a labelled one).
 *
 * In order: a total as read that agrees with subtotal plus tax or with the
 * card payment; a total line read another way (point lost, "$" read as a
 * digit) that agrees; the largest total as read; the card payment; subtotal
 * plus tax; a total line with its point lost; the largest amount on a line
 * that is not cash, change or a tip.
 */
function pickTotal(lines: string[]): { total?: number; totalIsLabelled: boolean } {
  // Each with the index of its line, to tell a total printed after a tip
  // from the one before it.
  const totals: { value: number; at: number }[] = []
  const totalReadings: { readings: number[]; at: number }[] = []
  const subtotals: number[] = []
  const taxParts: number[] = []
  let taxTotal: number | undefined
  const paid: number[] = []
  let fallbackMax = 0
  lines.forEach((line, at) => {
    const lower = line.toLowerCase()
    const amounts = amountsOf(line)
    const lineMax = amounts.length ? Math.max(...amounts) : 0
    if (lineMax > fallbackMax && lineMax < 100000 && !NOT_TOTAL_LINE.test(line)) fallbackMax = lineMax
    // Subtotal and tax lines count by their main reading only. With the
    // other readings on both sides, sums agree with a misread total by
    // accident: 106.95 read without its "first digit" plus 8.82 is 15.77,
    // which is what a total of 115.77 that lost a digit and its point reads as.
    if (SUBTOTAL_LINE.test(line)) {
      const r = readingsOf(line)
      if (r.length) subtotals.push(r[0])
      return
    }
    if (SKIP_KEYWORDS.some((k) => lower.includes(k))) {
      if (lower.includes('total tax')) {
        const r = readingsOf(line)
        if (r.length) taxTotal = r[0]
      }
      return
    }
    const isTotal = TOTAL_KEYWORDS.some((k) => lower.includes(k)) || TOTAL_MISREAD.test(line)
    if (!isTotal && TAX_LINE.test(line)) {
      const r = readingsOf(line)
      if (r.length) taxParts.push(r[0])
      return
    }
    if (!isTotal && CARD_LINE.test(line)) {
      // The amount charged, read with its point: a card number's last four
      // digits never are.
      const a = amounts.filter((x) => x > 0)
      if (a.length) paid.push(a[a.length - 1])
      return
    }
    if (!isTotal) return
    // A keyword line reading 0.00 ("Balance due 0.00" on a paid receipt) is
    // not the total of anything.
    const asRead = amounts.filter((x) => x > 0)
    if (asRead.length) totals.push({ value: Math.max(...asRead), at })
    const r = readingsOf(line).filter((x) => x > 0)
    if (r.length) totalReadings.push({ readings: r, at })
  })

  const near = (a: number, b: number) => Math.abs(cents(a) - cents(b)) <= 1
  // The tax is a "Total Tax" line when there is one, otherwise all the tax
  // lines added up ("State Tax", "Local Tax"). A tax printed twice (in the
  // body and again in the summary) is also checked once: adding both copies
  // would double it. Distinct lines are only ever checked together, or
  // subtotal plus one of them could agree with a misread total.
  const tax = taxTotal ?? (taxParts.length ? taxParts.reduce((sum, t) => (cents(sum) + cents(t)) / 100, 0) : undefined)
  const sums = tax === undefined ? [] : subtotals.map((s) => (cents(s) + cents(tax)) / 100)
  const repeated = taxParts.filter((t, i) => taxParts.findIndex((u) => cents(u) === cents(t)) !== i)
  const checks = [...sums, ...subtotals.flatMap((s) => repeated.map((t) => (cents(s) + cents(t)) / 100)), ...paid]
  const agrees = (n: number) => checks.some((c) => near(n, c))
  // A larger total printed after the one that agrees is the total once a tip
  // or a fee was added ("Total 32.40", "Tip 6.00", "Grand Total 38.40").
  const final = (value: number, at: number) => {
    const later = totals.filter((t) => t.at > at && cents(t.value) > cents(value)).map((t) => t.value)
    return { total: later.length ? Math.max(...later) : value, totalIsLabelled: true }
  }

  for (const t of totals) if (agrees(t.value)) return final(t.value, t.at)
  for (const t of totalReadings) for (const r of t.readings) if (agrees(r)) return final(r, t.at)
  if (totals.length) return { total: Math.max(...totals.map((t) => t.value)), totalIsLabelled: true }
  if (paid.length) return { total: Math.max(...paid), totalIsLabelled: false }
  // A total line with its point lost, before subtotal plus tax: the total is
  // usually printed bolder than the lines above it, and reads better.
  // Only one of four digits or more ("TOTAL 7825"): three are as often the
  // tail of noise read as digits ("TOTAL ... i900").
  const pointLost = totalReadings.find((t) => cents(t.readings[0]) >= 1000)
  if (pointLost) return { total: pointLost.readings[0], totalIsLabelled: false }
  if (sums.length) {
    // No total line at all. The largest amount is the total when its label
    // was unreadable, and may exceed subtotal plus tax by a fee or a tip;
    // below the sum, it is the subtotal, and far above it, a misreading.
    const sum = sums[0]
    if (fallbackMax >= sum && fallbackMax <= sum * 1.25) return { total: fallbackMax, totalIsLabelled: false }
    return { total: sum, totalIsLabelled: false }
  }
  return { total: fallbackMax > 0 ? fallbackMax : undefined, totalIsLabelled: false }
}

// Every numeric pattern below is fenced on both sides: it may not start
// right after a digit or a separator, and may not run on into another one.
// Without that, a dotted phone number such as "01.23.45.67.89" was read as a
// date from its first three groups, and a reference like "04-12-0033" as
// 12 April 2033. The left fence is a consumed group rather than a lookbehind,
// which older Safari cannot parse (see MONEY_SOURCE above).
const DATE_PATTERNS: { re: RegExp; parse: (m: RegExpMatchArray) => Date | null }[] = [
  {
    // 2026-07-18 or 2026/07/18
    re: /(?:^|[^\d./-])(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?![\d]|[-/.]\d)/g,
    parse: (m) => buildDate(+m[1], +m[2], +m[3]),
  },
  {
    // 07/18/2026, 18/07/2026, 07-18-26
    re: /(?:^|[^\d./-])(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?![\d]|[-/.]\d)/g,
    parse: (m) => {
      let year = +m[3]
      if (year < 100) year += 2000
      const a = +m[1]
      const b = +m[2]
      // Prefer US month-first; fall back to day-first when impossible
      if (a <= 12) return buildDate(year, a, b)
      if (b <= 12) return buildDate(year, b, a)
      return null
    },
  },
  {
    // Jul 18, 2026 / 18 July 2026 / Mar 2nd, 2026
    // A whole month word, not three letters inside another word: "Walmart
    // 2041" and "Supermarket 2026" used to read as March of those years.
    re: /(?:^|[^a-z0-9])(?:(\d{1,2})\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?![a-z])\.?,?\s+(?:(\d{1,2})(?:st|nd|rd|th)?)?,?\s*(\d{4})(?!\d)/gi,
    parse: (m) => {
      const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
        .indexOf(m[2].slice(0, 3).toLowerCase()) + 1
      const day = +(m[1] ?? m[3] ?? 1)
      return buildDate(+m[4], month, day)
    },
  },
]

function buildDate(year: number, month: number, day: number): Date | null {
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null
  const d = new Date(year, month - 1, day)
  // new Date() rolls an impossible day into the next month (31 April is
  // 1 May) instead of failing, so check that what came back is what was
  // asked for.
  if (isNaN(d.getTime()) || d.getMonth() !== month - 1 || d.getDate() !== day) return null
  // A receipt is not dated in the future. A day of slack covers time zones.
  if (d.getTime() > Date.now() + 24 * 60 * 60 * 1000) return null
  return d
}

function toIsoDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/**
 * Pick the merchant, date and total out of a receipt's text. `ocrLines`, when
 * OCR produced the text, carries each word's confidence, which tells a name
 * apart from the noise a photo's background turns into.
 */
export function parseReceiptText(text: string, ocrLines?: OcrLine[]): Omit<ExtractedReceipt, 'rawText'> {
  const { totalIsLabelled: _labelled, ...parsed } = parseReceipt(text, ocrLines)
  return parsed
}

/**
 * parseReceiptText, also saying whether the total came from a line labelled
 * as one ("Total", "Amount due") or is only the largest amount seen. The
 * second is a guess, and on page 1 of a scan a fare or a subtotal can be
 * larger than anything else there while the real total is on page 2.
 */
function parseReceipt(
  text: string,
  ocrLines?: OcrLine[],
): Omit<ExtractedReceipt, 'rawText'> & { totalIsLabelled: boolean } {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  // --- Total ---
  const { total, totalIsLabelled } = pickTotal(lines)

  // --- Date: the earliest one on the receipt ---
  // A hotel folio or rental invoice prints the day it was printed at the top
  // and the stay or rental below; the earliest date is the day the expense
  // began, and on a receipt with one date it is that date. A date more than
  // DATE_WINDOW_DAYS before the latest is more likely a misread year (2020
  // for 2026) than a real one, so it is left out.
  const dates: Date[] = []
  for (const raw of lines) {
    // OCR often drops the space after a month name: "Mar14,2026".
    const line = raw.replace(MONTH_GLUED, '$& ')
    for (const { re, parse } of DATE_PATTERNS) {
      for (const m of line.matchAll(re)) {
        const d = parse(m)
        if (d) dates.push(d)
      }
    }
  }
  let date: string | undefined
  if (dates.length) {
    const latest = Math.max(...dates.map((d) => d.getTime()))
    const inWindow = dates.filter((d) => latest - d.getTime() <= DATE_WINDOW_DAYS * 86_400_000)
    date = toIsoDate(inWindow.reduce((a, b) => (b < a ? b : a)))
  }

  const merchant = pickMerchant(lines, ocrLines)

  return { merchant, date, total, totalIsLabelled }
}

const DATE_WINDOW_DAYS = 92
// A month name run straight into the day after it.
const MONTH_GLUED = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?(?=\d)/gi

// Phrases that name the merchant outright. Searched for on every line, ahead
// of the header lines: "Here's your receipt for Taco Palace (12 Elm St)",
// "From: Coastal Air Receipts <...>", "Thank you for choosing Coastal Air."
const NAMED_FORMS = [
  // "Order for Jane Doe" names the customer, so an order or purchase counts
  // only when it is "from" someone.
  /\b(?:receipt\s+(?:for|from)|(?:order|purchase)\s+from)\s+(?!(?:your|our|the|this|a|confirmation|order|purchase|booking|reservation)\b)(.+)/i,
  /^from:\s*(.+)/i,
  /\bthank(?:s|\s+you)\s+for\s+(?:choosing|shopping\s+(?:at|with)|dining\s+(?:at|with)|visiting|flying(?:\s+with)?|staying\s+(?:at|with))\s+(.+)/i,
]
// Words a sender's display name ends in that are not part of the name.
const SENDER_SUFFIX = /\s+(?:receipts?|notifications?|no-?reply|orders?|team|support|info|e?mail)$/i

// Words that make a line about the document or the till, not the shop.
const GENERIC_WORDS = new Set(
  ('receipt receipts customer merchant copy order orders summary invoice tax sales sale transaction record ' +
    'duplicate reprint welcome thank thanks you your our us we itinerary confirmation confirmed pickup ' +
    'delivery take out dine in to go drive up the and for of with eticket e-ticket statement check table ' +
    'server guest cashier register terminal store ticket details date time paid payment approved sequence ' +
    'contactless chip swipe tap mastercard visa amex discover debit credit card mode issuer entry method').split(' '),
)
// A line opening with one of these is a till or ticket field ("Check #25 Pat").
const FIELD_START =
  /^(?:check|table|order|guest|server|ticket|receipt|invoice|trans(?:action)?|store|terminal|register|cashier|employee|ref(?:erence)?|auth(?:orization)?|card|acct|account|seq(?:uence)?|pump|gallons|mid|tid|aid)\b/i
// Words a field label is made of, dropped from in front of a colon:
// "ACME CAR RENTAL CORPORATION Rental Agreement No: 1234567".
const LABEL_WORDS = new Set(
  ('account acct no no. number agreement rental date order invoice receipt room phone tel fax server table ' +
    'check terminal store ref reference transaction customer confirmation id guest cashier register employee ' +
    'ordered time web document email to from station pump member loyalty rewards program reg trans').split(' '),
)
const STREET =
  /\b(?:st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|ct|court|hwy|highway|ln|lane|way|pkwy|parkway|ste|suite|pl|place|plaza|sq|square|cir|circle|trl|trail|terrace)\b/i
// "ST 12345", also as OCR misreads it ("ST B2345"): five characters that are
// digits or letters OCR swaps for them, at least three of them digits.
const STATE_ZIP = /\b[A-Z]{2}\s+(?=(?:[OBSIlZ]*\d){3})[\dOBSIlZ]{5}(?:-\d{4})?\b/
// A city line by its shape alone, for when OCR has mangled the state and
// ZIP past STATE_ZIP ("Granites Walla, &T 24425"): it ends in a comma, a
// short code and a token of mostly digits.
const CITY_TAIL = /,\s*\S{1,3}\s+(?=[^\s.,]*\d[^\s.,]*\d[^\s.,]*\d)[^\s.,]{4,7}\s*$/
// "Millbrook | #4410": the town and store number a chain prints under its
// name, not the name.
const STORE_LINE = /\|\s*\S*\d/
const PHONE = /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}\b/
const WEB = /www\.|https?:|\.(?:com|net|org)\b|@/i
const PO_BOX = /\bp\.?\s*o\.?\s*box\b/i
const TIME = /\b\d{1,2}:?\d{2}(?::\d{2})?\s*(?:am|pm)\b|\b\d{1,2}:\d{2}(?::\d{2})?\b/gi
const WEEKDAY = /\b(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day|nesday|sday|urday)?\b\.?/gi

// The header is read until the first line with a price on it: past that are
// the items, and an item ("Orange Juice") is not the shop.
const HEADER_LINES = 10
// Word confidence below which a word at the edge of a line is taken for
// background noise ("ae Millbrook Corner Diner j").
const EDGE_NOISE = 40
// Mean confidence a header line needs, once its noisy edges are gone.
const NAME_CONFIDENCE = 65
// A single word of letters only is held to less: noise comes out as several
// short fragments ("Vrn Ka Tt OQX"), while a printed logo name in an
// unusual typeface is often one word read right but with little confidence.
const ONE_WORD_CONFIDENCE = 40

function pickMerchant(lines: string[], ocrLines?: OcrLine[]): string | undefined {
  for (const line of lines) {
    for (const form of NAMED_FORMS) {
      const m = line.match(form)
      if (!m) continue
      let name = m[1].split(/\s*[(<[@,!|]|\.(?:\s|$)|\s+-\s+/)[0].replace(/["“”]/g, '').trim()
      name = name.replace(SENDER_SUFFIX, '')
      if (isNameLike(name)) return tidyMerchant(name)
    }
  }

  // Towns from "City, ST 12345" lines: a header line naming only the town
  // ("Millbrook" over "Millbrook, ST 12345") is the store's location, not its name.
  const places = new Set<string>()
  for (const line of lines) {
    const zip = line.match(STATE_ZIP) ?? line.match(CITY_TAIL)
    if (!zip || zip.index === undefined) continue
    for (const w of line.slice(0, zip.index).toLowerCase().split(/[^\p{L}]+/u)) if (w) places.add(w)
  }

  // Without word confidences (a PDF's text, or an engine that gave none),
  // every word counts as certain.
  const all = ocrLines?.length ? ocrLines : lines.map((l) => ({ text: l, words: l.split(/\s+/).map((w) => ({ text: w, confidence: 100 })) }))
  for (const line of all.slice(0, HEADER_LINES)) {
    if (hasMoney(line.text)) break
    const name = headerName(line, places)
    if (name) return name
  }

  // No name in the header: an online order or an app screenshot often gives
  // it in the footer, on the line above the street address.
  for (let i = 1; i < all.length; i++) {
    if (!/^\d+\s/.test(all[i].text) || !STREET.test(all[i].text)) continue
    const name = headerName(all[i - 1], places)
    if (name) return name
  }
  return undefined
}

function headerName(line: OcrLine, places: Set<string>): string | undefined {
  let words = line.words.filter((w) => w.text.trim())
  const noise = (w: { text: string; confidence: number }) =>
    w.confidence < EDGE_NOISE ||
    (w.text.length <= 2 && w.confidence < 60) ||
    !/[\p{L}\p{N}&]/u.test(w.text)
  while (words.length && noise(words[0])) words = words.slice(1)
  while (words.length && noise(words[words.length - 1])) words = words.slice(0, -1)
  if (!words.length) return undefined
  const confidence = words.reduce((sum, w) => sum + w.confidence, 0) / words.length
  const oneWord = words.length === 1 && /^\p{L}{4,}$/u.test(words[0].text)
  if (confidence < (oneWord ? ONE_WORD_CONFIDENCE : NAME_CONFIDENCE)) return undefined

  // A lone digit in front of a longer name is a logo or a fold read as text:
  // "4 Lakeside Inn & Suites".
  if (words.length >= 3 && /^\d$/.test(words[0].text) && /^\p{Lu}/u.test(words[1].text)) words = words.slice(1)
  let s = words.map((w) => w.text).join(' ')
  // The same name printed twice on one line: "Taco Palace Co. Taco Palace Co."
  const half = s.length / 2
  if (Number.isInteger(half - 0.5) && s.slice(0, half - 0.5) === s.slice(half + 0.5)) s = s.slice(0, half - 0.5)
  // Looked for in the line as read as well as once trimmed: trimming can
  // take "| #4410" or ", ST 12345" off the end, or the house number off the
  // front of "12 Oak St", as noise.
  for (const text of [s, line.text]) {
    if (WEB.test(text) || PHONE.test(text) || STATE_ZIP.test(text) || CITY_TAIL.test(text) || PO_BOX.test(text) || STORE_LINE.test(text)) {
      return undefined
    }
    // "100 Main Avenue, Ste A", "25 Elm Court"
    if (/^\W*\d/.test(text) && STREET.test(text)) return undefined
  }
  for (const { re } of DATE_PATTERNS) s = s.replace(re, ' ')
  s = s.replace(TIME, ' ').replace(WEEKDAY, ' ')
  const colon = s.indexOf(':')
  if (colon >= 0) {
    const before = s.slice(0, colon).trim().split(/\s+/)
    while (before.length && LABEL_WORDS.has(before[before.length - 1].toLowerCase().replace(/[^a-z.]/g, ''))) {
      before.pop()
    }
    s = before.join(' ')
  }
  s = s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}.)'’]+$/gu, '').replace(/\s+/g, ' ').trim()
  if (FIELD_START.test(s) || !isNameLike(s)) return undefined
  // A store number beside the town ("Millbrook 8521") does not make it a name.
  const named = s
    .toLowerCase()
    .split(' ')
    .filter((w) => !/[\d#$§]/.test(w))
    .map((w) => w.replace(/[^\p{L}]/gu, ''))
    .filter((w) => w && !GENERIC_WORDS.has(w))
  if (named.every((w) => places.has(w))) return undefined
  return tidyMerchant(s)
}

/** Short enough, with letters, and not only words about the document. */
function isNameLike(s: string): boolean {
  if (s.length > 40 || s.replace(/[^\p{L}\p{M}]/gu, '').length < 2) return false
  return s
    .toLowerCase()
    .split(/\s+/)
    .some((w) => /\p{L}/u.test(w) && !/\d/.test(w) && !GENERIC_WORDS.has(w.replace(/[^\p{L}-]/gu, '')))
}

function tidyMerchant(line: string): string {
  // Keep letters in any script and the curly apostrophe: "Café" used to come
  // out as "Caf".
  // \p{M}: the combining marks many scripts write vowels with. Without them
  // "किराना" came out as "करन".
  const cleaned = line.replace(/[^\p{L}\p{M}\p{N}\s&'’.-]/gu, '').replace(/\s+/g, ' ').trim()
  // Title-case ALL CAPS names
  if (cleaned === cleaned.toUpperCase()) {
    return cleaned
      .toLowerCase()
      .split(' ')
      // Initials and short brands stay as printed: "H&M" and "BP", not "H&m".
      .map((w, i) => {
        const original = cleaned.split(' ')[i] ?? w
        if (original.length <= 2 || original.includes('&')) return original
        return w ? w[0].toUpperCase() + w.slice(1) : w
      })
      .join(' ')
  }
  return cleaned
}
