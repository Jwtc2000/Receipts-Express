import * as pdfjsLib from 'pdfjs-dist'
import { compressImage } from './image'

// Self-hosted, matching the Tesseract setup (see scripts/copy-pdfjs-assets.mjs)
// so a PDF receipt can be rasterized fully offline, with no CDN calls.
const ASSET_BASE = `${import.meta.env.BASE_URL}pdfjs`
pdfjsLib.GlobalWorkerOptions.workerSrc = `${ASSET_BASE}/pdf.worker.min.mjs`

const MAX_RENDER_DIM = 1800

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
    standardFontDataUrl: `${ASSET_BASE}/standard_fonts/`,
    wasmUrl: `${ASSET_BASE}/wasm/`,
    iccUrl: `${ASSET_BASE}/iccs/`,
  })

  try {
    const pdf = await loadingTask.promise
    if (pdf.numPages === 0) throw new Error('PDF has no pages')
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

      const rendered = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PDF page render failed'))), 'image/jpeg', 0.9)
      })
      // Route through the same compressor used for photos so every stored
      // page — however it originated — ends up at the same size/format.
      pages.push(await compressImage(rendered, MAX_RENDER_DIM))
    }
    return pages
  } finally {
    void loadingTask.destroy()
  }
}
