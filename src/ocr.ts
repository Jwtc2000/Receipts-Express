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
 * Only done where the browser can list databases, so that checking never
 * creates the database on a device that has none.
 */
export async function forgetOldModelCopies(currentKey: string): Promise<void> {
  try {
    if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return
    const dbs = await indexedDB.databases()
    if (!dbs.some((d) => d.name === 'keyval-store')) return
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('keyval-store')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
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

/**
 * Run on-device OCR on a receipt image and heuristically extract the
 * merchant name, purchase date and total amount.
 */
export async function extractReceipt(
  image: Blob,
  onProgress?: (pct: number) => void,
): Promise<ExtractedReceipt> {
  const worker = await getWorker()
  // A wrapper of its own, so two scans passing the same function (the editor
  // always passes the same setter) are still told apart below.
  const mine = onProgress ? (pct: number) => onProgress(pct) : null
  progressCallback = mine
  try {
    const result = await worker.recognize(image)
    const rawText = result.data.text
    return { ...parseReceiptText(rawText), rawText }
  } finally {
    // Only clear the callback this call installed. When two scans overlap,
    // the second has already replaced it, and clearing it here would leave
    // the second scan's progress bar frozen.
    if (progressCallback === mine) progressCallback = null
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

// Every numeric pattern below is fenced on both sides: it may not start
// right after a digit or a separator, and may not run on into another one.
// Without that, a dotted phone number such as "01.23.45.67.89" was read as a
// date from its first three groups, and a reference like "04-12-0033" as
// 12 April 2033. The left fence is a consumed group rather than a lookbehind,
// which older Safari cannot parse (see MONEY_SOURCE above).
const DATE_PATTERNS: { re: RegExp; parse: (m: RegExpMatchArray) => Date | null }[] = [
  {
    // 2026-07-18 or 2026/07/18
    re: /(?:^|[^\d./-])(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?![\d]|[-/.]\d)/,
    parse: (m) => buildDate(+m[1], +m[2], +m[3]),
  },
  {
    // 07/18/2026, 18/07/2026, 07-18-26
    re: /(?:^|[^\d./-])(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?![\d]|[-/.]\d)/,
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
    // A whole month word, not three letters inside another word: "Walmart
    // 2041" and "Supermarket 2026" used to read as March of those years.
    re: /(?:^|[^a-z0-9])(?:(\d{1,2})\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?![a-z])\.?,?\s+(\d{1,2})?,?\s*(\d{4})(?!\d)/i,
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
    // A keyword line reading 0.00 ("Balance due 0.00" on a paid receipt) is
    // not the total of anything.
    if (lineMax > 0 && TOTAL_KEYWORDS.some((k) => lower.includes(k))) {
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
    // Any letter, not only ASCII ones, and two are enough: "H&M" and "BP"
    // are merchants, and were passed over for the address line below them.
    const letters = line.replace(/[^\p{L}\p{M}]/gu, '')
    if (letters.length >= 2 && line.length <= 40 && !hasMoney(line)) {
      merchant = tidyMerchant(line)
      break
    }
  }

  return { merchant, date, total }
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
