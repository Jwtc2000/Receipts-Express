import type { jsPDF } from 'jspdf'
import type { Report, Expense } from './types'
import { formatMoney, formatTotal, formatDate, dayNumbersByDate } from './types'
import { getImage } from './db'
import { blobToDataURL, imageDimensions } from './image'
import { getProfile, profileSummaryLines } from './profile'
import { dayColor, contrastText } from './colors'
import { foodBalanceForDate, formatFoodBalance, formatPersonalTotal } from './mealAllowance'
import { shareOrDownloadFile } from './share'

const PAGE_W = 595.28 // A4 portrait, points
const PAGE_H = 841.89
const MARGIN = 48

const TEAL: [number, number, number] = [15, 118, 110]
const SLATE: [number, number, number] = [51, 65, 85]
const LIGHT: [number, number, number] = [241, 245, 249]
const MUTED_GRAY: [number, number, number] = [163, 163, 163]
const PAYBACK_ORANGE: [number, number, number] = [180, 83, 9]
const BUN: [number, number, number] = [217, 119, 6]
const PATTY: [number, number, number] = [120, 53, 15]

/** A "no receipt" glyph — a crossed-out circle, drawn with jsPDF's vector
 * primitives rather than a raster asset so it stays crisp at any size. */
function drawNoReceiptIcon(doc: jsPDF, cx: number, cy: number, radius: number): void {
  doc.setDrawColor(...MUTED_GRAY)
  doc.setLineWidth(Math.max(0.75, radius * 0.14))
  doc.circle(cx, cy, radius, 'S')
  const d = radius * Math.SQRT1_2
  doc.line(cx - d, cy + d, cx + d, cy - d)
}

/** A small burger glyph (bun/patty/bun) marking Meals-category rows,
 * drawn with jsPDF's vector primitives rather than a raster asset. */
function drawMealIcon(doc: jsPDF, cx: number, cy: number, size: number): void {
  const w = size
  const h = size * 0.72
  const x = cx - w / 2
  const barH = h * 0.3
  const gap = h * 0.1
  let yy = cy - h / 2
  doc.setFillColor(...BUN)
  doc.roundedRect(x, yy, w, barH, barH / 2, barH / 2, 'F')
  yy += barH + gap
  doc.setFillColor(...PATTY)
  doc.rect(x, yy, w, barH * 0.7, 'F')
  yy += barH * 0.7 + gap
  doc.setFillColor(...BUN)
  doc.roundedRect(x, yy, w, barH, barH / 2, barH / 2, 'F')
}

/**
 * Build the report PDF: a summary page with every expense and the grand
 * total, followed by one full page per receipt image with its details below.
 */
export async function exportReportPdf(report: Report, expenses: Expense[]): Promise<void> {
  // Loaded on demand, like pdfReceipt.ts's PDF.js — jsPDF is sizeable and its
  // plugin-registration architecture means it doesn't tree-shake, so a static
  // import would ship it to every app launch even for someone who never
  // exports a PDF that session.
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const totalDisplay = formatTotal(expenses)

  // ---------- Summary page ----------
  doc.setFillColor(...TEAL)
  doc.rect(0, 0, PAGE_W, 110, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(24)
  doc.text('Expense Report', MARGIN, 52)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'normal')
  doc.text(report.name, MARGIN, 76)
  doc.setFontSize(10)
  doc.text(
    `Generated ${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}  ·  ${expenses.length} expense${expenses.length === 1 ? '' : 's'}`,
    MARGIN,
    94,
  )

  // Optional profile attributes (name, employee ID, cost center, project
  // number) — only takes up space on the page when at least one is set.
  let y = 150
  const profileLine = profileSummaryLines(getProfile()).join('   ·   ')
  if (profileLine) {
    doc.setTextColor(...SLATE)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    const profileLines = doc.splitTextToSize(profileLine, PAGE_W - 2 * MARGIN) as string[]
    doc.text(profileLines, MARGIN, 128)
    y = 128 + profileLines.length * 11 + 22
  }

  // Table header
  const cols = {
    date: MARGIN,
    title: MARGIN + 90,
    category: MARGIN + 255,
    payback: MARGIN + 415,
    amount: PAGE_W - MARGIN,
  }
  const drawTableHeader = () => {
    doc.setFillColor(...LIGHT)
    doc.rect(MARGIN - 8, y - 14, PAGE_W - 2 * (MARGIN - 8), 22, 'F')
    doc.setTextColor(...SLATE)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('DATE', cols.date, y)
    doc.text('EXPENSE', cols.title, y)
    doc.text('CATEGORY', cols.category, y)
    doc.text('PAY BACK', cols.payback, y, { align: 'right' })
    doc.text('AMOUNT', cols.amount, y, { align: 'right' })
    y += 24
  }
  drawTableHeader()

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const dayNumberByDate = dayNumbersByDate(expenses, report.startDate)
  let previousDate: string | null = null
  expenses.forEach((e, i) => {
    const dayNumber = e.date ? dayNumberByDate.get(e.date) : undefined
    const needsDayDivider = dayNumber !== undefined && e.date !== previousDate
    if (e.date) previousDate = e.date
    const foodBalance =
      needsDayDivider && dayNumber !== undefined && report.dailyMealAllowance
        ? foodBalanceForDate(expenses, e.date, report.dailyMealAllowance)
        : null
    const dividerH = needsDayDivider ? (foodBalance ? 32 : 20) : 0

    if (y + dividerH > PAGE_H - 110) {
      doc.addPage()
      y = MARGIN + 14
      drawTableHeader()
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
    }

    if (needsDayDivider) {
      const bg = dayColor(dayNumber)
      doc.setFillColor(...bg)
      doc.rect(MARGIN - 8, y - 14, PAGE_W - 2 * (MARGIN - 8), dividerH, 'F')
      doc.setTextColor(...contrastText(bg))
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.text(`DAY ${dayNumber}`, cols.date, y)
      doc.text(formatDate(e.date), cols.title, y)
      if (foodBalance) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.text(formatFoodBalance(foodBalance), cols.date, y + 13)
      }
      y += dividerH
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
    }

    if (i % 2 === 1) {
      doc.setFillColor(250, 250, 250)
      doc.rect(MARGIN - 8, y - 12, PAGE_W - 2 * (MARGIN - 8), 20, 'F')
    }
    doc.setTextColor(...SLATE)
    doc.text(formatDate(e.date), cols.date, y)
    if (e.category === 'Meals') drawMealIcon(doc, cols.title - 20, y - 3, 8)
    if (!e.imageId) drawNoReceiptIcon(doc, cols.title - 9, y - 3, 3.5)
    const title = e.title || e.merchant || 'Untitled expense'
    doc.text(doc.splitTextToSize(title, 155)[0] ?? '', cols.title, y)
    doc.text(e.category, cols.category, y)
    const payback = e.personalAmount && e.personalAmount > 0 ? formatMoney(e.personalAmount, e.currency) : '—'
    doc.text(payback, cols.payback, y, { align: 'right' })
    doc.text(formatMoney(e.amount, e.currency), cols.amount, y, { align: 'right' })
    y += 20
  })

  // Grand total
  y += 8
  doc.setDrawColor(...TEAL)
  doc.setLineWidth(1.5)
  doc.line(MARGIN - 8, y - 6, PAGE_W - MARGIN + 8, y - 6)
  y += 14
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...TEAL)
  doc.text('TOTAL', cols.title, y)
  doc.text(totalDisplay, cols.amount, y, { align: 'right' })

  const personalTotal = formatPersonalTotal(expenses)
  if (personalTotal) {
    y += 20
    doc.setFontSize(11)
    doc.setTextColor(...PAYBACK_ORANGE)
    doc.text('Employee pays credit card company', cols.title, y)
    doc.text(personalTotal, cols.amount, y, { align: 'right' })
  }

  // ---------- One PDF page per receipt page ----------
  // A photographed receipt is one image; an uploaded multi-page PDF receipt
  // is several (imageId is page 1, extraImageIds the rest) — each becomes
  // its own full page here, in receipt order, so nothing is cropped or
  // merged into a page too small to hold it.
  for (const [index, expense] of expenses.entries()) {
    const pageImageIds = [expense.imageId, ...(expense.extraImageIds ?? [])].filter(
      (id): id is string => !!id,
    )
    const totalPages = Math.max(pageImageIds.length, 1)

    for (let p = 0; p < totalPages; p++) {
      doc.addPage()
      const isLastPage = p === totalPages - 1

      // Header strip
      doc.setFillColor(...LIGHT)
      doc.rect(0, 0, PAGE_W, 40, 'F')
      doc.setTextColor(...SLATE)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.text(expense.title || expense.merchant || 'Untitled expense', MARGIN, 25)
      doc.setFont('helvetica', 'normal')
      const receiptLabel =
        totalPages > 1
          ? `Receipt ${index + 1} of ${expenses.length}  ·  page ${p + 1} of ${totalPages}`
          : `Receipt ${index + 1} of ${expenses.length}`
      doc.text(receiptLabel, PAGE_W - MARGIN, 25, { align: 'right' })

      // Day banner, matching the summary table's day dividers
      const dayNumber = expense.date ? dayNumberByDate.get(expense.date) : undefined
      const pageFoodBalance =
        dayNumber !== undefined && report.dailyMealAllowance
          ? foodBalanceForDate(expenses, expense.date, report.dailyMealAllowance)
          : null
      let contentTop = 56
      if (dayNumber !== undefined) {
        const bannerH = pageFoodBalance ? 32 : 20
        const bg = dayColor(dayNumber)
        doc.setFillColor(...bg)
        doc.rect(0, 40, PAGE_W, bannerH, 'F')
        doc.setTextColor(...contrastText(bg))
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.text(`DAY ${dayNumber}`, MARGIN, 40 + 14)
        doc.setFont('helvetica', 'normal')
        doc.text(formatDate(expense.date), MARGIN + 55, 40 + 14)
        if (pageFoodBalance) {
          doc.setFontSize(8)
          doc.text(formatFoodBalance(pageFoodBalance), MARGIN, 40 + 26)
        }
        contentTop = 40 + bannerH + 16
      }

      // Receipt image, as large as fits above the details block. Only the
      // last page of a multi-page receipt carries the details block below
      // it, so every other page gets the full page height for the image.
      const detailsTop = isLastPage ? PAGE_H - 150 : PAGE_H - MARGIN
      const imgArea = { x: MARGIN, y: contentTop, w: PAGE_W - 2 * MARGIN, h: detailsTop - contentTop - 16 }
      const stored = pageImageIds[p] ? await getImage(pageImageIds[p]) : undefined
      if (stored) {
        const dataUrl = await blobToDataURL(stored.blob)
        const dim = await imageDimensions(dataUrl)
        // Scale to fit entirely within the available area — never crop —
        // shrinking the larger dimension down as needed so tall receipts
        // and wide ones both stay fully visible.
        const scale = Math.min(imgArea.w / dim.width, imgArea.h / dim.height)
        const w = dim.width * scale
        const h = dim.height * scale
        const x = imgArea.x + (imgArea.w - w) / 2
        const y = imgArea.y + (imgArea.h - h) / 2
        doc.addImage(dataUrl, 'JPEG', x, y, w, h)
      } else {
        const centerX = PAGE_W / 2
        const centerY = imgArea.y + imgArea.h / 2 - 24
        drawNoReceiptIcon(doc, centerX, centerY, 36)
        doc.setTextColor(...MUTED_GRAY)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(12)
        doc.text('No receipt image', centerX, centerY + 56, { align: 'center' })
      }

      if (!isLastPage) continue

      // Details block
      doc.setDrawColor(...TEAL)
      doc.setLineWidth(2)
      doc.line(MARGIN, detailsTop, PAGE_W - MARGIN, detailsTop)

      let dy = detailsTop + 24
      doc.setTextColor(...TEAL)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(15)
      doc.text(expense.title || expense.merchant || 'Untitled expense', MARGIN, dy)
      doc.setTextColor(...SLATE)
      doc.setFontSize(15)
      doc.text(formatMoney(expense.amount, expense.currency), PAGE_W - MARGIN, dy, { align: 'right' })

      dy += 22
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      const parts = [
        expense.merchant && expense.merchant !== expense.title ? expense.merchant : null,
        formatDate(expense.date),
        expense.category,
      ].filter(Boolean)
      doc.text(parts.join('   ·   '), MARGIN, dy)

      if (expense.notes) {
        dy += 18
        doc.setTextColor(100, 116, 139)
        const noteLines = doc.splitTextToSize(expense.notes, PAGE_W - 2 * MARGIN)
        doc.text(noteLines.slice(0, 3), MARGIN, dy)
      }
    }
  }

  const safeName = report.name.replace(/[^\w-]+/g, '_') || 'expense_report'
  // Go through the same hardened share/download path CSV export uses, rather
  // than jsPDF's own doc.save() — that call is fire-and-forget internally, so
  // a blocked/failed download wouldn't reject and this export would look like
  // it succeeded when nothing was saved.
  const blob = doc.output('blob')
  const file = new File([blob], `${safeName}.pdf`, { type: 'application/pdf' })
  await shareOrDownloadFile(file, `${report.name} — PDF export`)
}
