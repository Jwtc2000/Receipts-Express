import * as pdfjsLib from 'pdfjs-dist'
import { encodeJpeg } from './image'
import { PDFJS_DIR } from './engineDirs'

// Self-hosted, matching the Tesseract setup (see scripts/copy-pdfjs-assets.mjs)
// so a PDF receipt can be rasterized fully offline, with no CDN calls.
const ASSET_BASE = `${import.meta.env.BASE_URL}${PDFJS_DIR}`
pdfjsLib.GlobalWorkerOptions.workerSrc = `${ASSET_BASE}/pdf.worker.min.mjs`

const MAX_RENDER_DIM = 1800
// A real receipt/invoice is a handful of pages; a much larger PDF is almost
// always a mis-pick (an itinerary, a statement) and would otherwise render
// every page in an unbroken, uncancellable sequence with no feedback.
const MAX_PAGES = 25

/**
 * Rasterize every page of a PDF receipt into compressed JPEG blobs, one per
 * page — a single-page invoice and a multi-page itemized receipt both fall
 * out of the same path, and each page then flows through the same storage,
 * OCR and export code as a photographed receipt.
 */
export async function renderPdfPages(file: Blob): Promise<Blob[]> {
  const data = await file.arrayBuffer()
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
      page.cleanup()
    }
    return pages
  } finally {
    void loadingTask.destroy()
  }
}
