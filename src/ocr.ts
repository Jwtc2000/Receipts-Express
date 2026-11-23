import { createWorker, type Worker } from 'tesseract.js'
import { TESSERACT_DIR } from './engineDirs'

export interface ExtractedReceipt {
  merchant?: string
  date?: string
  total?: number
  rawText: string
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
      logger: (m) => {
        if (m.status === 'recognizing text' && progressCallback) {
          progressCallback(Math.round(m.progress * 100))
        }
      },
    }).catch((err) => {
      workerPromise = null
      throw err
    })
  }
  return workerPromise
}

/**
 * Run on-device OCR on a receipt image and heuristically extract the
 * merchant name, purchase date and total amount.
 */
export async function extractReceipt(
  image: Blob,
  onProgress?: (pct: number) => void,
): Promise<ExtractedReceipt> {
  const worker = await getWorker()
  progressCallback = onProgress ?? null
  try {
    const result = await worker.recognize(image)
    const rawText = result.data.text
    return { ...parseReceiptText(rawText), rawText }
  } finally {
    progressCallback = null
  }
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

const DATE_PATTERNS: { re: RegExp; parse: (m: RegExpMatchArray) => Date | null }[] = [
  {
    // 2026-07-18 or 2026/07/18
    re: /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/,
    parse: (m) => buildDate(+m[1], +m[2], +m[3]),
  },
  {
    // 07/18/2026, 18/07/2026, 07-18-26
    re: /(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/,
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
    // Jul 18, 2026 / 18 July 2026
    re: /(?:(\d{1,2})\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(\d{1,2})?,?\s*(\d{4})/i,
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
  return isNaN(d.getTime()) ? null : d
}

function toIsoDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

export function parseReceiptText(text: string): Omit<ExtractedReceipt, 'rawText'> {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  // --- Total ---
  let total: number | undefined
  let fallbackMax = 0
  for (const line of lines) {
    const lower = line.toLowerCase()
    const amounts = [...line.matchAll(MONEY_RE)].map((m) => parseMoney(m[1]))
    if (amounts.length === 0) continue
    const lineMax = Math.max(...amounts)
    if (lineMax > fallbackMax && lineMax < 100000) fallbackMax = lineMax
    if (SKIP_KEYWORDS.some((k) => lower.includes(k))) continue
    if (TOTAL_KEYWORDS.some((k) => lower.includes(k))) {
      // Keep the largest keyword-matched amount (handles "Total ... Tip ... Total")
      if (total === undefined || lineMax > total) total = lineMax
    }
  }
  if (total === undefined && fallbackMax > 0) total = fallbackMax

  // --- Date ---
  let date: string | undefined
  outer: for (const line of lines) {
    for (const { re, parse } of DATE_PATTERNS) {
      const m = line.match(re)
      if (m) {
        const d = parse(m)
        if (d) {
          date = toIsoDate(d)
          break outer
        }
      }
    }
  }

  // --- Merchant: first plausible line of text near the top ---
  // A fresh RegExp per call, not MONEY_RE.test(): MONEY_RE carries the `g`
  // flag, so .test() would mutate its lastIndex across lines and could
  // skip a match that starts before the leftover offset from a prior line.
  let merchant: string | undefined
  for (const line of lines.slice(0, 6)) {
    const letters = line.replace(/[^a-zA-Z]/g, '')
    if (letters.length >= 3 && line.length <= 40 && !hasMoney(line)) {
      merchant = tidyMerchant(line)
      break
    }
  }

  return { merchant, date, total }
}

function tidyMerchant(line: string): string {
  const cleaned = line.replace(/[^\w\s&'.-]/g, '').replace(/\s+/g, ' ').trim()
  // Title-case ALL CAPS names
  if (cleaned === cleaned.toUpperCase()) {
    return cleaned
      .toLowerCase()
      .split(' ')
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(' ')
  }
  return cleaned
}
