// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Real PDF parsing/rasterization needs pdfjs-dist's worker+WASM engine and a
// real <canvas> 2D context, neither available under jsdom without the
// native `canvas` package. Mocking pdfjs-dist at the module boundary keeps
// this test focused on renderPdfPages' own loop/cap logic — the off-by-one
// risk the audit flagged — without needing real rasterization.
function makePage(width = 100, height = 100) {
  return {
    getViewport: vi.fn(({ scale }: { scale: number }) => ({ width: width * scale, height: height * scale })),
    render: vi.fn(() => ({ promise: Promise.resolve() })),
  }
}

function makeLoadingTask(numPages: number) {
  const destroy = vi.fn()
  const getPage = vi.fn(() => Promise.resolve(makePage()))
  return {
    promise: Promise.resolve({ numPages, getPage }),
    destroy,
    getPage,
  }
}

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(),
}))
vi.mock('./image', () => ({ compressImage: vi.fn((blob: Blob) => Promise.resolve(blob)) }))

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
  ) {
    callback(new Blob(['fake-page'], { type: 'image/jpeg' }))
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('renderPdfPages', () => {
  it('returns one blob per page, fetched in order', async () => {
    const { getDocument } = await import('pdfjs-dist')
    const task = makeLoadingTask(3)
    ;(getDocument as ReturnType<typeof vi.fn>).mockReturnValue(task)

    const { renderPdfPages } = await import('./pdfReceipt')
    const pages = await renderPdfPages(new Blob(['pdf-bytes']))

    expect(pages).toHaveLength(3)
    expect(task.getPage).toHaveBeenNthCalledWith(1, 1)
    expect(task.getPage).toHaveBeenNthCalledWith(2, 2)
    expect(task.getPage).toHaveBeenNthCalledWith(3, 3)
  })

  it('rejects with PdfTooManyPages instead of rendering an unbounded document', async () => {
    const { getDocument } = await import('pdfjs-dist')
    const task = makeLoadingTask(26)
    ;(getDocument as ReturnType<typeof vi.fn>).mockReturnValue(task)

    const { renderPdfPages } = await import('./pdfReceipt')
    await expect(renderPdfPages(new Blob(['pdf-bytes']))).rejects.toMatchObject({ name: 'PdfTooManyPages' })
    // The cap is checked before any page is rendered.
    expect(task.getPage).not.toHaveBeenCalled()
  })

  it('accepts exactly the page cap (boundary, not off-by-one)', async () => {
    const { getDocument } = await import('pdfjs-dist')
    const task = makeLoadingTask(25)
    ;(getDocument as ReturnType<typeof vi.fn>).mockReturnValue(task)

    const { renderPdfPages } = await import('./pdfReceipt')
    const pages = await renderPdfPages(new Blob(['pdf-bytes']))
    expect(pages).toHaveLength(25)
  })

  it('rejects a PDF with zero pages', async () => {
    const { getDocument } = await import('pdfjs-dist')
    const task = makeLoadingTask(0)
    ;(getDocument as ReturnType<typeof vi.fn>).mockReturnValue(task)

    const { renderPdfPages } = await import('./pdfReceipt')
    await expect(renderPdfPages(new Blob(['pdf-bytes']))).rejects.toThrow('PDF has no pages')
  })

  it('always destroys the loading task, on both success and failure', async () => {
    const { getDocument } = await import('pdfjs-dist')
    const { renderPdfPages } = await import('./pdfReceipt')

    const okTask = makeLoadingTask(1)
    ;(getDocument as ReturnType<typeof vi.fn>).mockReturnValue(okTask)
    await renderPdfPages(new Blob(['pdf-bytes']))
    expect(okTask.destroy).toHaveBeenCalledOnce()

    const failTask = makeLoadingTask(26)
    ;(getDocument as ReturnType<typeof vi.fn>).mockReturnValue(failTask)
    await expect(renderPdfPages(new Blob(['pdf-bytes']))).rejects.toThrow()
    expect(failTask.destroy).toHaveBeenCalledOnce()
  })
})
