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

// A scanned PDF is read page by page only until a total turns up: most
// receipts have it on page 1, and an itinerary or folio rarely needs more
// than a few pages to reach it.
const MAX_SCANNED_PAGES = 5

/**
 * Run on-device OCR on a receipt and heuristically extract the merchant name,
 * purchase date and total amount.
 *
 * Given several pages (a scanned PDF), page 1 is read first and later pages
 * only while no total has been found, so a one-page receipt costs no more
 * than before.
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
  const mine = onProgress
    ? (pct: number) => onProgress(Math.round((pageIndex * 100 + pct) / pages.length))
    : null
  progressCallback = mine
  try {
    const texts: string[] = []
    const lines: OcrLine[] = []
    let parsed: Omit<ExtractedReceipt, 'rawText'> = {}
    for (; pageIndex < pages.length; pageIndex++) {
      const { invertDarkBands } = await import('./ocrPrep')
      const input = await invertDarkBands(pages[pageIndex])
      const result = await worker.recognize(input, {}, { text: true, blocks: true })
      texts.push(result.data.text)
      lines.push(...linesOf(result.data.blocks))
      parsed = parseReceiptText(texts.join('\n'), lines)
      if (parsed.total !== undefined) break
    }
    return { ...parsed, rawText: texts.join('\n') }
  } finally {
    // Only clear the callback this call installed. When two scans overlap,
    // the second has already replaced it, and clearing it here would leave
    // the second scan's progress bar frozen.
    if (progressCallback === mine) progressCallback = null
  }
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

  return { merchant, date, total }
}

const DATE_WINDOW_DAYS = 92
// A month name run straight into the day after it.
const MONTH_GLUED = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?(?=\d)/gi

// Phrases that name the merchant outright. Searched for on every line, ahead
// of the header lines: "Here's your receipt for Taco Palace (12 Elm St)",
// "From: Coastal Air Receipts <...>", "Thank you for choosing Coastal Air."
const NAMED_FORMS = [
  /\b(?:receipt|order|purchase)\s+(?:for|from)\s+(?!(?:your|our|the|this|a|confirmation|order|purchase|booking|reservation)\b)(.+)/i,
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
    const zip = line.match(STATE_ZIP)
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
  if (WEB.test(s) || PHONE.test(s) || STATE_ZIP.test(s) || PO_BOX.test(s)) return undefined
  // "100 Main Avenue, Ste A", "25 Elm Court"
  if (/^\d/.test(s) && STREET.test(s)) return undefined
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
  const named = s
    .toLowerCase()
    .split(' ')
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
