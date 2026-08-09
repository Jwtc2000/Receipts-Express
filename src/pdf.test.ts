// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Expense, Report } from './types'

// A minimal but structurally valid JPEG (287 bytes, real SOI/APP0/SOF
// markers) — jsPDF's addImage() parses real JPEG bytes to build the PDF
// image object even when width/height are supplied explicitly, so an
// arbitrary string isn't enough here.
const TINY_JPEG_B64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k='

vi.mock('./db', () => ({ getImage: vi.fn() }))
vi.mock('./image', () => ({ blobToDataURL: vi.fn(), imageDimensions: vi.fn() }))
vi.mock('./share', () => ({ shareOrDownloadFile: vi.fn().mockResolvedValue(true) }))

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'e1',
    reportId: 'r1',
    position: 0,
    title: 'Lunch',
    merchant: 'Cafe',
    amount: 12.5,
    currency: 'USD',
    date: '2026-07-18',
    category: 'Meals',
    notes: '',
    createdAt: 1,
    ...overrides,
  }
}

function makeReport(overrides: Partial<Report> = {}): Report {
  return { id: 'r1', name: 'Trip', createdAt: 1, ...overrides }
}

/**
 * jsPDF's default output isn't stream-compressed, so page objects are
 * plain readable text in the file — `/Type /Page` marks each page, and
 * `/Type /Pages` (the one parent tree node) is the only false-positive
 * substring match to subtract back out.
 */
async function countPdfPages(file: File): Promise<number> {
  const text = await file.text()
  const pageMatches = text.match(/\/Type\s*\/Page(?!s)/g)?.length ?? 0
  return pageMatches
}

/**
 * jsPDF's default output isn't stream-compressed, so a `doc.text(...)` call
 * shows up as readable ASCII in the content stream (with `(`/`)` escaped to
 * `\(`/`\)` per PDF string syntax) — good enough to assert a line is present
 * without needing a real PDF text-extraction library.
 */
async function pdfText(file: File): Promise<string> {
  return file.text()
}

/**
 * Just the text drawn on the summary page, in draw order, joined with single
 * spaces.
 *
 * Each page gets its own uncompressed content stream, and the summary page is
 * found by the title it draws rather than by stream index, since an embedded
 * receipt image adds streams of its own. Within the page, a long line is
 * wrapped by `doc.splitTextToSize()` before it is drawn, so it arrives as
 * several separate PDF strings and no assertion on a whole sentence can match
 * the raw output. Word wrapping drops the space it breaks on, so re-joining
 * the strings with one space puts the sentence back together exactly. PDF
 * string syntax escapes `(`, `)` and `\`; none of the text asserted below
 * contains any of them.
 */
async function summaryPageProse(file: File): Promise<string> {
  const raw = await file.text()
  const streams = [...raw.matchAll(/stream\r?\n([\s\S]*?)endstream/g)].map((m) => m[1])
  const summary = streams.find((s) => s.includes('(Expense Report)'))
  if (summary === undefined) throw new Error('no summary page found in the exported PDF')
  return [...summary.matchAll(/\(((?:\\.|[^()\\])*)\)/g)]
    .map((m) => m[1])
    .join(' ')
    .replace(/\s+/g, ' ')
}

beforeEach(() => {
  // jsdom doesn't implement these, and jsPDF elsewhere calls `new URL(...)`
  // internally — replacing the whole URL global (rather than patching just
  // these two static methods) would break that constructor use.
  URL.createObjectURL = vi.fn(() => 'blob:mock-url')
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  // @ts-expect-error -- removing the jsdom-absent methods we added above
  delete URL.createObjectURL
  // @ts-expect-error -- same
  delete URL.revokeObjectURL
  vi.clearAllMocks()
})

describe('exportReportPdf', () => {
  it('produces one summary page plus one receipt page for a single no-image expense', async () => {
    const { exportReportPdf } = await import('./pdf')
    const { shareOrDownloadFile } = await import('./share')

    await exportReportPdf(makeReport(), [makeExpense({ imageId: undefined })])

    const file = (shareOrDownloadFile as ReturnType<typeof vi.fn>).mock.calls[0][0] as File
    expect(await countPdfPages(file)).toBe(2)
  })

  it('embeds a receipt image via the mocked db/image path, without touching real canvas decoding', async () => {
    const { getImage } = await import('./db')
    const { blobToDataURL, imageDimensions } = await import('./image')
    ;(getImage as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'img1', blob: new Blob(['x']) })
    ;(blobToDataURL as ReturnType<typeof vi.fn>).mockResolvedValue(`data:image/jpeg;base64,${TINY_JPEG_B64}`)
    ;(imageDimensions as ReturnType<typeof vi.fn>).mockResolvedValue({ width: 800, height: 600 })

    const { exportReportPdf } = await import('./pdf')
    const { shareOrDownloadFile } = await import('./share')

    await exportReportPdf(makeReport(), [makeExpense({ imageId: 'img1' })])

    expect(getImage).toHaveBeenCalledWith('img1')
    const file = (shareOrDownloadFile as ReturnType<typeof vi.fn>).mock.calls[0][0] as File
    expect(await countPdfPages(file)).toBe(2)
  })

  it('gives a multi-page receipt one PDF page per source page (the untested v1.10.0 mapping loop)', async () => {
    const { getImage } = await import('./db')
    const { blobToDataURL, imageDimensions } = await import('./image')
    ;(getImage as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'img', blob: new Blob(['x']) })
    ;(blobToDataURL as ReturnType<typeof vi.fn>).mockResolvedValue(`data:image/jpeg;base64,${TINY_JPEG_B64}`)
    ;(imageDimensions as ReturnType<typeof vi.fn>).mockResolvedValue({ width: 800, height: 600 })

    const { exportReportPdf } = await import('./pdf')
    const { shareOrDownloadFile } = await import('./share')

    // 1 expense, 3 receipt pages (imageId + two extraImageIds) -> summary
    // page + 3 receipt pages = 4 total.
    await exportReportPdf(
      makeReport(),
      [makeExpense({ imageId: 'img-1', extraImageIds: ['img-2', 'img-3'] })],
    )

    expect(getImage).toHaveBeenCalledTimes(3)
    const file = (shareOrDownloadFile as ReturnType<typeof vi.fn>).mock.calls[0][0] as File
    expect(await countPdfPages(file)).toBe(4)
  })

  it('gives every expense its own receipt page(s), mixing image and no-image expenses', async () => {
    const { getImage } = await import('./db')
    const { blobToDataURL, imageDimensions } = await import('./image')
    ;(getImage as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'img', blob: new Blob(['x']) })
    ;(blobToDataURL as ReturnType<typeof vi.fn>).mockResolvedValue(`data:image/jpeg;base64,${TINY_JPEG_B64}`)
    ;(imageDimensions as ReturnType<typeof vi.fn>).mockResolvedValue({ width: 800, height: 600 })

    const { exportReportPdf } = await import('./pdf')
    const { shareOrDownloadFile } = await import('./share')

    // summary (1) + no-image expense (1) + imaged expense (1) = 3.
    await exportReportPdf(makeReport(), [
      makeExpense({ id: 'e1', imageId: undefined }),
      makeExpense({ id: 'e2', imageId: 'img-1' }),
    ])

    const file = (shareOrDownloadFile as ReturnType<typeof vi.fn>).mock.calls[0][0] as File
    expect(await countPdfPages(file)).toBe(3)
  })

  // The exported PDF is the only thing this product says to someone who never
  // opened it: an approver, a bookkeeper, an auditor. They never saw the
  // Terms, never saw the first-run gate, and never agreed to anything — so
  // every disclaimer the app relies on reaches them through this one line or
  // not at all, and a page of typed and OCR-read figures laid out like a
  // record package otherwise reads as verified. Pinned word for word, and
  // pinned to the summary page specifically, so it cannot be shortened,
  // softened, or quietly moved somewhere the reader will not look.
  const ACCURACY_NOTE =
    'Amounts and dates are user-entered or machine-extracted from receipt images and are not independently verified. Check against the original receipts.'

  it('puts the accuracy note on the summary page, in full', async () => {
    const { exportReportPdf } = await import('./pdf')
    const { shareOrDownloadFile } = await import('./share')

    await exportReportPdf(makeReport(), [makeExpense({ imageId: undefined })])

    const file = (shareOrDownloadFile as ReturnType<typeof vi.fn>).mock.calls[0][0] as File
    expect(await summaryPageProse(file)).toContain(ACCURACY_NOTE)
  })

  it('keeps the accuracy note when the report has no expenses at all', async () => {
    // An empty report still exports, and an empty page of figures is exactly
    // the case where a reader has least reason to doubt what little is there.
    const { exportReportPdf } = await import('./pdf')
    const { shareOrDownloadFile } = await import('./share')

    await exportReportPdf(makeReport(), [])

    const file = (shareOrDownloadFile as ReturnType<typeof vi.fn>).mock.calls[0][0] as File
    expect(await summaryPageProse(file)).toContain(ACCURACY_NOTE)
  })

  it('omits the TOTAL (USD) line entirely for an all-USD report', async () => {
    const { exportReportPdf } = await import('./pdf')
    const { shareOrDownloadFile } = await import('./share')

    await exportReportPdf(makeReport(), [makeExpense({ imageId: undefined, currency: 'USD' })])

    const file = (shareOrDownloadFile as ReturnType<typeof vi.fn>).mock.calls[0][0] as File
    const text = await pdfText(file)
    // Only the plain grand-total line's "TOTAL" — no second "TOTAL (USD)" line.
    expect(text.match(/TOTAL/g)?.length).toBe(1)
  })

  it('shows a converted TOTAL (USD) line using the report\'s manually-entered rate', async () => {
    const { exportReportPdf } = await import('./pdf')
    const { shareOrDownloadFile } = await import('./share')

    await exportReportPdf(makeReport({ exchangeRates: { EUR: 1.08 } }), [
      makeExpense({ imageId: undefined, currency: 'EUR', amount: 100 }),
    ])

    const file = (shareOrDownloadFile as ReturnType<typeof vi.fn>).mock.calls[0][0] as File
    const text = await pdfText(file)
    expect(text.match(/TOTAL/g)?.length).toBe(2)
    expect(text).toContain('108.00') // 100 EUR * 1.08
  })

  it('shows an "excludes" note instead of a wrong total when no rate is set for the currency used', async () => {
    const { exportReportPdf } = await import('./pdf')
    const { shareOrDownloadFile } = await import('./share')

    await exportReportPdf(makeReport(), [makeExpense({ imageId: undefined, currency: 'EUR', amount: 100 })])

    const file = (shareOrDownloadFile as ReturnType<typeof vi.fn>).mock.calls[0][0] as File
    const text = await pdfText(file)
    expect(text.match(/TOTAL/g)?.length).toBe(2)
    expect(text).toContain('Excludes EUR')
    expect(text).toContain('no exchange rate set')
  })
})
