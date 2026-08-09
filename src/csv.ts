import type { Report, Expense } from './types'
import { shareOrDownloadFile } from './share'

const HEADERS = ['Date', 'Title', 'Merchant', 'Category', 'Amount', 'Personal Amount', 'Currency', 'Notes']

// Prepended to the CSV text so Excel on Windows reads non-ASCII
// merchant/title text as UTF-8 instead of guessing the wrong encoding.
const UTF8_BOM = '﻿'

// A cell whose first character is one of these is read as a formula by
// Excel/Sheets rather than literal text (CWE-1236 / CSV injection) — applied
// to every field this app doesn't generate itself. Date and Category look
// like fixed vocabularies but aren't: both are plain strings on Expense, and
// a restored backup can carry anything in them, so they get the same guard.
// A real ISO date or category name never starts with one of these characters,
// so nothing legitimate is altered. Amount/Personal Amount are the exception:
// they are numbers this file formats, where a leading "-" must stay a literal
// minus sign.
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
      neutralizeFormula(e.date),
      neutralizeFormula(e.title),
      neutralizeFormula(e.merchant),
      neutralizeFormula(e.category),
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
