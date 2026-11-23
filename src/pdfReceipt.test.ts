// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Real PDF parsing/rasterization needs pdfjs-dist's worker+WASM engine and a
// real <canvas> 2D context, neither available under jsdom without the
// native `canvas` package. Mocking pdfjs-dist at the module boundary keeps
// this test focused on renderPdfPages' own loop/cap logic — the off-by-one
// risk the audit flagged — without needing real rasterization.
// A text run as PDF.js gives it: the last two numbers of `transform` are x and y.
function run(str: string, x: number, y: number, size = 10) {
  return { str, transform: [size, 0, 0, size, x, y], height: size }
}

function makePage(width = 100, height = 100, getTextContent = vi.fn(() => Promise.resolve({ items: [] as unknown[] }))) {
  return {
    getViewport: vi.fn(({ scale }: { scale: number }) => ({ width: width * scale, height: height * scale })),
    render: vi.fn(() => ({ promise: Promise.resolve() })),
    getTextContent,
    cleanup: vi.fn(),
  }
}

function makeLoadingTask(numPages: number, pageFor: (n: number) => ReturnType<typeof makePage> = () => makePage()) {
  const destroy = vi.fn()
  const getPage = vi.fn((n: number) => Promise.resolve(pageFor(n)))
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
vi.mock('./image', () => ({
  encodeJpeg: vi.fn(() => Promise.resolve(new Blob(['fake-page'], { type: 'image/jpeg' }))),
}))

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

describe('readPdfReceipt', () => {
  it('returns the text of every page, in page order, with the pages', async () => {
    const { getDocument } = await import('pdfjs-dist')
    const texts: Record<number, unknown[]> = {
      1: [run('Hotel Marigold', 10, 700)],
      2: [run('Total', 10, 100), run('$312.40', 200, 100)],
    }
    const task = makeLoadingTask(2, (n) => makePage(100, 100, vi.fn(() => Promise.resolve({ items: texts[n] }))))
    ;(getDocument as ReturnType<typeof vi.fn>).mockReturnValue(task)

    const { readPdfReceipt } = await import('./pdfReceipt')
    const { pages, text } = await readPdfReceipt(new Blob(['pdf-bytes']))
    expect(pages).toHaveLength(2)
    expect(text).toBe('Hotel Marigold\nTotal $312.40')
  })

  it('treats a page whose text cannot be read as a scanned page', async () => {
    const { getDocument } = await import('pdfjs-dist')
    const task = makeLoadingTask(1, () => makePage(100, 100, vi.fn(() => Promise.reject(new Error('bad font')))))
    ;(getDocument as ReturnType<typeof vi.fn>).mockReturnValue(task)

    const { readPdfReceipt } = await import('./pdfReceipt')
    const { pages, text } = await readPdfReceipt(new Blob(['pdf-bytes']))
    expect(pages).toHaveLength(1)
    expect(text).toBe('')
  })
})

describe('textItemsToLines', () => {
  it('joins runs on one baseline left to right, and reads lines top down', async () => {
    const { textItemsToLines } = await import('./pdfReceipt')
    // Drawn out of order, as PDFs often are: the amount before its label.
    const items = [run('9.75', 300, 100), run('Total', 20, 101), run('Corner Bakery', 20, 500), { type: 'beginMarkedContent' }, run(' ', 0, 0)]
    expect(textItemsToLines(items)).toBe('Corner Bakery\nTotal 9.75')
  })
})

/**
 * PDF.js does no error handling for a worker it is handed, so a wrapper that
 * failed to load would leave every PDF import waiting forever. startWorker
 * hands one over only after it has posted its first message.
 */
describe('startWorker', () => {
  class FakeWorker extends EventTarget {
    static last: FakeWorker
    terminated = false
    constructor(public url: string, public options: WorkerOptions) {
      super()
      FakeWorker.last = this
    }
    terminate() {
      this.terminated = true
    }
  }

  beforeEach(() => {
    vi.stubGlobal('Worker', FakeWorker)
    URL.createObjectURL = vi.fn(() => 'blob:wrapper')
    URL.revokeObjectURL = vi.fn()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('returns the module worker once it reports ready', async () => {
    const { startWorker } = await import('./pdfReceipt')
    const started = startWorker()
    FakeWorker.last.dispatchEvent(new MessageEvent('message', { data: { action: 'ready' } }))
    expect(await started).toBe(FakeWorker.last)
    expect(FakeWorker.last.options).toEqual({ type: 'module' })
    expect(FakeWorker.last.terminated).toBe(false)
  })

  it('gives up and terminates it if the worker fails to load', async () => {
    const { startWorker } = await import('./pdfReceipt')
    const started = startWorker()
    FakeWorker.last.dispatchEvent(new Event('error'))
    expect(await started).toBeNull()
    expect(FakeWorker.last.terminated).toBe(true)
  })

  it('gives up and terminates it if the worker never reports', async () => {
    vi.useFakeTimers()
    try {
      const { startWorker } = await import('./pdfReceipt')
      const started = startWorker(1000)
      vi.advanceTimersByTime(1000)
      expect(await started).toBeNull()
      expect(FakeWorker.last.terminated).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
