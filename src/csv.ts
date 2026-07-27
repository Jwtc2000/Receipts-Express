import type { Report, Expense } from './types'
import { shareOrDownloadFile } from './share'

const HEADERS = ['Date', 'Title', 'Merchant', 'Category', 'Amount', 'Personal Amount', 'Currency', 'Notes']

// Prepended to the CSV text so Excel on Windows reads non-ASCII
// merchant/title text as UTF-8 instead of guessing the wrong encoding.
const UTF8_BOM = '﻿'

// A cell whose first character is one of these is read as a formula by
// Excel/Sheets rather than literal text (CWE-1236 / CSV injection) — only
// applied to free-text fields. Amount/Personal Amount are genuine signed
// numbers, where a leading "-" must stay a literal minus sign.
function neutralizeFormula(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value
}

function csvEscape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** Plain, tabular CSV — no report name or grand-total row — so it opens
 * directly in Excel/Sheets/accounting tools without extra parsing. */
export function buildExpenseCsv(expenses: Expense[]): string {
  const rows = [
    HEADERS,
    ...expenses.map((e) => [
      e.date,
      neutralizeFormula(e.title),
      neutralizeFormula(e.merchant),
      e.category,
      e.amount.toFixed(2),
      e.personalAmount ? e.personalAmount.toFixed(2) : '0.00',
      neutralizeFormula(e.currency),
      neutralizeFormula(e.notes),
    ]),
  ]
  return rows.map((row) => row.map(csvEscape).join(',')).join('\r\n')
}

/**
 * Export a report's expenses to CSV. On mobile this opens the share sheet;
 * elsewhere it downloads.
 */
export async function exportReportCsv(report: Report, expenses: Expense[]): Promise<void> {
  const csv = UTF8_BOM + buildExpenseCsv(expenses)
  const safeName = report.name.replace(/[^\w-]+/g, '_') || 'expense_report'
  const file = new File([csv], `${safeName}.csv`, { type: 'text/csv;charset=utf-8' })
  await shareOrDownloadFile(file, `${report.name} — CSV export`)
}
