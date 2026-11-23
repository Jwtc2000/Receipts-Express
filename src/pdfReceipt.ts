import * as pdfjsLib from 'pdfjs-dist'
import { encodeJpeg } from './image'
import { PDFJS_DIR } from './engineDirs'

// Self-hosted, matching the Tesseract setup (see scripts/copy-pdfjs-assets.mjs)
// so a PDF receipt can be rasterized fully offline, with no CDN calls.
const ASSET_BASE = `${import.meta.env.BASE_URL}${PDFJS_DIR}`
const WORKER_URL = `${ASSET_BASE}/pdf.worker.min.mjs`
pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_URL

/**
 * The PDF.js worker, started from a blob: URL that imports the real worker
 * script, and handed to PDF.js ready-made.
 *
 * A worker started directly from its own URL takes its Content-Security-
 * Policy from that script's HTTP headers, and GitHub Pages sends none, so the
 * PDF.js worker used to run with no policy at all. A blob: worker inherits the
 * policy of the page that made it, which is the app's <meta> CSP: the worker
 * gets the same limits as the page, including connect-src 'self'.
 *
 * PDF.js does no error handling of its own for a worker it is handed, so the
 * wrapper is only handed over once the worker has said it is running (the
 * PDF.js worker posts a "ready" message as soon as it has loaded). If it fails
 * to load, or says nothing in time, it is terminated and PDF.js starts the
 * worker itself from workerSrc, as before 1.16.1 — outside the CSP, but working.
 */
export function startWorker(timeoutMs = 15_000): Promise<Worker | null> {
  if (typeof Worker === 'undefined' || typeof URL.createObjectURL !== 'function') return Promise.resolve(null)
  return new Promise((resolve) => {
    let worker: Worker
    let blobUrl: string
    try {
      const absolute = new URL(WORKER_URL, window.location.href).href
      blobUrl = URL.createObjectURL(new Blob([`import ${JSON.stringify(absolute)}`], { type: 'text/javascript' }))
      worker = new Worker(blobUrl, { type: 'module' })
    } catch {
      resolve(null)
      return
    }
    const finish = (ok: boolean) => {
      clearTimeout(timer)
      worker.removeEventListener('message', onMessage)
      worker.removeEventListener('error', onError)
      URL.revokeObjectURL(blobUrl)
      if (!ok) worker.terminate()
      resolve(ok ? worker : null)
    }
    const onMessage = () => finish(true)
    const onError = () => finish(false)
    worker.addEventListener('message', onMessage)
    worker.addEventListener('error', onError)
    const timer = setTimeout(() => finish(false), timeoutMs)
  })
}

let workerSetup: Promise<void> | null = null
function ensureWorker(): Promise<void> {
  workerSetup ??= startWorker().then((worker) => {
    if (worker) pdfjsLib.GlobalWorkerOptions.workerPort = worker
  })
  return workerSetup
}

const MAX_RENDER_DIM = 1800
// A real receipt/invoice is a handful of pages; a much larger PDF is almost
// always a mis-pick (an itinerary, a statement) and would otherwise render
// every page in an unbroken, uncancellable sequence with no feedback.
const MAX_PAGES = 25

/** A text item as PDF.js's getTextContent gives it; marked-content entries have no `str`. */
interface TextPiece {
  str: string
  transform: number[]
  height?: number
}

/**
 * Put a page's text items back into lines. PDF.js gives runs of text in
 * drawing order, which for most invoices is near reading order but not on the
 * same line: a label and its amount are often separate runs. Runs whose
 * baselines are within half a glyph height share a line, and a line reads
 * left to right; lines read top to bottom (PDF y grows upwards).
 */
export function textItemsToLines(items: readonly unknown[]): string {
  const rows: { y: number; parts: { x: number; s: string }[] }[] = []
  for (const item of items) {
    if (!item || typeof item !== 'object' || !('str' in item) || !('transform' in item)) continue
    const { str, transform, height } = item as TextPiece
    if (!str.trim()) continue
    const x = transform[4]
    const y = transform[5]
    const h = Math.abs(transform[3]) || height || 10
    let row = rows.find((r) => Math.abs(r.y - y) < h * 0.5)
    if (!row) rows.push((row = { y, parts: [] }))
    row.parts.push({ x, s: str.trim() })
  }
  rows.sort((a, b) => b.y - a.y)
  return rows.map((r) => r.parts.sort((a, b) => a.x - b.x).map((p) => p.s).join(' ')).join('\n')
}

export interface PdfReceipt {
  /** One JPEG per page, for storage, display and export. */
  pages: Blob[]
  /**
   * The text the PDF itself carries, every page in order, as lines. Empty for
   * a scanned PDF, which is only pictures of pages. Not checked: a PDF whose
   * fonts lack a Unicode map gives text that is not what is shown.
   */
  text: string
}

/**
 * Rasterize every page of a PDF receipt into compressed JPEG blobs, one per
 * page — a single-page invoice and a multi-page itemized receipt both fall
 * out of the same path, and each page then flows through the same storage,
 * OCR and export code as a photographed receipt.
 */
export async function renderPdfPages(file: Blob): Promise<Blob[]> {
  return (await readPdfReceipt(file)).pages
}

/**
 * renderPdfPages, plus the text layer of each page, read while the page is
 * open anyway. An emailed or downloaded invoice usually has one, and its text
 * is exact where OCR of the rendered page is a guess.
 */
export async function readPdfReceipt(file: Blob): Promise<PdfReceipt> {
  const data = await file.arrayBuffer()
  await ensureWorker()
  const loadingTask = pdfjsLib.getDocument({
    data,
    cMapUrl: `${ASSET_BASE}/cmaps/`,
    cMapPacked: true,
    // Holds the Foxit fonts only. PDF.js's Helvetica fallback, Liberation
    // Sans, is deliberately not copied (see scripts/copy-pdfjs-assets.mjs),
    // so on a device with no Helvetica-like font of its own that text is
    // drawn in the browser's generic sans-serif.
    standardFontDataUrl: `${ASSET_BASE}/standard_fonts/`,
    wasmUrl: `${ASSET_BASE}/wasm/`,
    iccUrl: `${ASSET_BASE}/iccs/`,
  })

  try {
    const pdf = await loadingTask.promise
    if (pdf.numPages === 0) throw new Error('PDF has no pages')
    if (pdf.numPages > MAX_PAGES) {
      const err = new Error(
        `This PDF has ${pdf.numPages} pages — receipts are limited to ${MAX_PAGES} pages per file. Try a shorter document.`,
      )
      err.name = 'PdfTooManyPages'
      throw err
    }
    const pages: Blob[] = []
    const texts: string[] = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const viewport = page.getViewport({ scale: 1 })
      const scale = Math.min(3, MAX_RENDER_DIM / Math.max(viewport.width, viewport.height))
      const scaledViewport = page.getViewport({ scale })

      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(scaledViewport.width)
      canvas.height = Math.ceil(scaledViewport.height)
      await page.render({ canvas, viewport: scaledViewport }).promise
      // Encoded once, at the quality photos are stored at. The page is
      // already within MAX_RENDER_DIM, which is the same limit
      // compressImage applies to photos, so running it through that as well
      // only decoded and re-encoded every page a second time.
      pages.push(await encodeJpeg(canvas, 0.85))
      try {
        texts.push(textItemsToLines((await page.getTextContent()).items))
      } catch {
        // No text is the same as a scanned page: OCR reads the picture.
        texts.push('')
      }
      page.cleanup()
    }
    return { pages, text: texts.filter(Boolean).join('\n') }
  } finally {
    // Awaited: the worker is shared between imports, and PDF.js refuses to
    // reuse it while a previous document on it is still being torn down.
    try {
      await loadingTask.destroy()
    } catch {
      // Teardown failing does not make the pages already rendered wrong.
    }
  }
}
