import { beforeEach, describe, expect, it } from 'vitest'
import { resetFakeIndexedDB } from './test/idb-reset'
import type { BackupFile } from './backup'

beforeEach(() => {
  resetFakeIndexedDB()
  localStorage.clear()
})

function validBackup(overrides: Partial<BackupFile> = {}): BackupFile {
  return {
    app: 'receipts-express',
    version: 1,
    exportedAt: new Date().toISOString(),
    reports: [{ id: 'r1', name: 'Trip', createdAt: 1 }],
    expenses: [
      {
        id: 'e1',
        reportId: 'r1',
        position: 0,
        title: 'Lunch',
        merchant: 'Cafe',
        amount: 12,
        currency: 'USD',
        date: '2026-07-18',
        category: 'Meals',
        notes: '',
        createdAt: 1,
      },
    ],
    images: [],
    ...overrides,
  }
}

// 1x1 transparent PNG
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

describe('validateBackup', () => {
  it('accepts a well-formed backup', async () => {
    const { validateBackup } = await import('./backup')
    const { reports, expenses, images } = validateBackup(validBackup())
    expect(reports).toHaveLength(1)
    expect(expenses).toHaveLength(1)
    expect(images).toHaveLength(0)
  })

  it('rejects an unknown app id', async () => {
    const { validateBackup } = await import('./backup')
    expect(() => validateBackup(validBackup({ app: 'some-other-app' }))).toThrow()
  })

  it('accepts a report with a valid trip date range', async () => {
    const { validateBackup } = await import('./backup')
    const backup = validBackup({
      reports: [{ id: 'r1', name: 'Trip', createdAt: 1, startDate: '2026-07-16', endDate: '2026-07-20' }],
    })
    const { reports } = validateBackup(backup)
    expect(reports[0].startDate).toBe('2026-07-16')
  })

  it('rejects a report with a non-string startDate (regression)', async () => {
    // A malformed startDate would otherwise crash dayNumbersByDate's date
    // parsing the first time the report is opened.
    const { validateBackup } = await import('./backup')
    const bad = validBackup({
      // @ts-expect-error intentionally malformed for the test
      reports: [{ id: 'r1', name: 'Trip', createdAt: 1, startDate: 12345 }],
    })
    expect(() => validateBackup(bad)).toThrow(/malformed/i)
  })

  it('accepts a report with a valid daily meal allowance', async () => {
    const { validateBackup } = await import('./backup')
    const backup = validBackup({
      reports: [{ id: 'r1', name: 'Trip', createdAt: 1, dailyMealAllowance: 50 }],
    })
    const { reports } = validateBackup(backup)
    expect(reports[0].dailyMealAllowance).toBe(50)
  })

  it('rejects a report with a non-numeric dailyMealAllowance (regression)', async () => {
    // A malformed allowance would otherwise crash foodBalanceForDate's
    // arithmetic the first time the report is opened.
    const { validateBackup } = await import('./backup')
    const bad = validBackup({
      // @ts-expect-error intentionally malformed for the test
      reports: [{ id: 'r1', name: 'Trip', createdAt: 1, dailyMealAllowance: '50' }],
    })
    expect(() => validateBackup(bad)).toThrow(/malformed/i)
  })

  it('accepts a report with a project number', async () => {
    const { validateBackup } = await import('./backup')
    const backup = validBackup({
      reports: [{ id: 'r1', name: 'Trip', createdAt: 1, projectNumber: 'PRJ-42' }],
    })
    const { reports } = validateBackup(backup)
    expect(reports[0].projectNumber).toBe('PRJ-42')
  })

  it('rejects a report with a non-string projectNumber', async () => {
    const { validateBackup } = await import('./backup')
    const bad = validBackup({
      // @ts-expect-error intentionally malformed for the test
      reports: [{ id: 'r1', name: 'Trip', createdAt: 1, projectNumber: 42 }],
    })
    expect(() => validateBackup(bad)).toThrow(/malformed/i)
  })

  it('rejects an expense with a non-numeric personalAmount (regression)', async () => {
    // A malformed personalAmount would otherwise crash businessAmount's
    // subtraction the first time totals are computed.
    const { validateBackup } = await import('./backup')
    const bad = validBackup()
    // @ts-expect-error intentionally malformed for the test
    bad.expenses[0].personalAmount = 'five'
    expect(() => validateBackup(bad)).toThrow(/malformed/i)
  })

  it('accepts a report with valid exchange rates', async () => {
    const { validateBackup } = await import('./backup')
    const backup = validBackup({
      reports: [{ id: 'r1', name: 'Trip', createdAt: 1, exchangeRates: { EUR: 1.08, GBP: 1.27 } }],
    })
    const { reports } = validateBackup(backup)
    expect(reports[0].exchangeRates).toEqual({ EUR: 1.08, GBP: 1.27 })
  })

  it('rejects a report with a non-numeric exchange rate (regression)', async () => {
    // A malformed rate would otherwise silently corrupt usdTotal's
    // arithmetic (or a string rate would produce NaN) the first time the
    // report's USD total is computed.
    const { validateBackup } = await import('./backup')
    const bad = validBackup({
      // @ts-expect-error intentionally malformed for the test
      reports: [{ id: 'r1', name: 'Trip', createdAt: 1, exchangeRates: { EUR: '1.08' } }],
    })
    expect(() => validateBackup(bad)).toThrow(/malformed/i)
  })

  it('rejects a report with a zero or negative exchange rate (regression)', async () => {
    const { validateBackup } = await import('./backup')
    const bad = validBackup({
      reports: [{ id: 'r1', name: 'Trip', createdAt: 1, exchangeRates: { EUR: -1.08 } }],
    })
    expect(() => validateBackup(bad)).toThrow(/malformed/i)
  })

  it('rejects a malformed expense (non-numeric amount)', async () => {
    const { validateBackup } = await import('./backup')
    const bad = validBackup()
    // @ts-expect-error intentionally malformed for the test
    bad.expenses[0].amount = 'twelve'
    expect(() => validateBackup(bad)).toThrow(/malformed/i)
  })

  it('rejects an expense missing its reportId', async () => {
    const { validateBackup } = await import('./backup')
    const bad = validBackup()
    // @ts-expect-error intentionally malformed for the test
    delete bad.expenses[0].reportId
    expect(() => validateBackup(bad)).toThrow(/malformed/i)
  })

  it('rejects an expense whose reportId is not in this backup (regression)', async () => {
    const { validateBackup } = await import('./backup')
    const bad = validBackup()
    bad.expenses[0].reportId = 'some-other-report-not-in-this-file'
    expect(() => validateBackup(bad)).toThrow(/references a report/i)
  })

  it('decodes a valid data:image;base64 image', async () => {
    const { validateBackup } = await import('./backup')
    const { images } = validateBackup(
      validBackup({ images: [{ id: 'img1', dataUrl: `data:image/png;base64,${TINY_PNG_BASE64}` }] }),
    )
    expect(images).toHaveLength(1)
    expect(images[0].blob.type).toBe('image/png')
    expect(images[0].blob.size).toBeGreaterThan(0)
  })

  it('rejects an image dataUrl that is actually a fetchable URL', async () => {
    const { validateBackup } = await import('./backup')
    expect(() =>
      validateBackup(validBackup({ images: [{ id: 'img1', dataUrl: 'https://evil.example/x.png' }] })),
    ).toThrow(/data url/i)
  })

  it('rejects an image over the per-image size limit', async () => {
    const { validateBackup } = await import('./backup')
    // ~22MB of base64 payload decodes to ~16.5MB, above the 15MB per-image cap
    const huge = 'A'.repeat(22 * 1024 * 1024)
    expect(() =>
      validateBackup(validBackup({ images: [{ id: 'img1', dataUrl: `data:image/png;base64,${huge}` }] })),
    ).toThrow(/size limit/i)
  })

  it('rejects a backup with more images than the count cap allows', async () => {
    const { validateBackup } = await import('./backup')
    // The count check runs before per-image decoding, so these don't need
    // to be real images to exercise the cap.
    const images = Array.from({ length: 5001 }, (_, i) => ({ id: `img${i}`, dataUrl: '' }))
    expect(() => validateBackup(validBackup({ images }))).toThrow(/too many images/i)
  })
})

describe('importBackup', () => {
  it('writes reports, expenses, and decoded images together', async () => {
    const db = await import('./db')
    const { importBackup } = await import('./backup')
    const backup = validBackup({
      images: [{ id: 'img1', dataUrl: `data:image/png;base64,${TINY_PNG_BASE64}` }],
    })
    backup.expenses[0].imageId = 'img1'
    const file = new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' })

    const result = await importBackup(file)

    expect(result).toEqual({ reports: 1, expenses: 1 })
    expect(await db.getReport('r1')).toBeDefined()
    expect(await db.getExpense('e1')).toBeDefined()
    expect(await db.getImage('img1')).toBeDefined()
  })

  it('writes nothing at all when one record in the file is invalid', async () => {
    const db = await import('./db')
    const { importBackup } = await import('./backup')
    const backup = validBackup()
    // A second, malformed expense alongside an otherwise-valid one.
    backup.expenses.push({ ...backup.expenses[0], id: 'e2', amount: NaN })
    const file = new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' })

    await expect(importBackup(file)).rejects.toThrow()

    // Nothing from the file should have been written — not even the
    // otherwise-valid report and first expense.
    expect(await db.getReport('r1')).toBeUndefined()
    expect(await db.getExpense('e1')).toBeUndefined()
  })

  it('rejects a backup whose image dataUrl would otherwise trigger a network fetch', async () => {
    const db = await import('./db')
    const { importBackup } = await import('./backup')
    const backup = validBackup({ images: [{ id: 'img1', dataUrl: 'https://evil.example/x.png' }] })
    const file = new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' })

    await expect(importBackup(file)).rejects.toThrow()
    expect(await db.getReport('r1')).toBeUndefined()
  })

  it('round-trips a multi-page receipt: imageId, extraImageIds, and every page survive import (regression)', async () => {
    const db = await import('./db')
    const { importBackup } = await import('./backup')
    const backup = validBackup({
      images: [
        { id: 'img1', dataUrl: `data:image/png;base64,${TINY_PNG_BASE64}` },
        { id: 'img2', dataUrl: `data:image/png;base64,${TINY_PNG_BASE64}` },
        { id: 'img3', dataUrl: `data:image/png;base64,${TINY_PNG_BASE64}` },
      ],
    })
    backup.expenses[0].imageId = 'img1'
    backup.expenses[0].extraImageIds = ['img2', 'img3']
    const file = new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' })

    const result = await importBackup(file)

    expect(result).toEqual({ reports: 1, expenses: 1 })
    expect(await db.getExpense('e1')).toMatchObject({ imageId: 'img1', extraImageIds: ['img2', 'img3'] })
    expect(await db.getImage('img1')).toBeDefined()
    expect(await db.getImage('img2')).toBeDefined()
    expect(await db.getImage('img3')).toBeDefined()
  })
})

describe('backupIsStale / shouldShowBackupWarning / dismissBackupWarning', () => {
  const DAY = 24 * 60 * 60 * 1000

  it('is stale when never backed up', async () => {
    const { backupIsStale } = await import('./backup')
    expect(backupIsStale()).toBe(true)
  })

  it('is not stale within 7 days of the last backup', async () => {
    const { backupIsStale } = await import('./backup')
    localStorage.setItem('br.lastBackupAt', String(Date.now() - 3 * DAY))
    expect(backupIsStale()).toBe(false)
  })

  it('is stale more than 7 days after the last backup', async () => {
    const { backupIsStale } = await import('./backup')
    localStorage.setItem('br.lastBackupAt', String(Date.now() - 8 * DAY))
    expect(backupIsStale()).toBe(true)
  })

  it('shows the warning when stale and never dismissed', async () => {
    const { shouldShowBackupWarning } = await import('./backup')
    expect(shouldShowBackupWarning()).toBe(true)
  })

  it('hides the warning immediately after dismissal', async () => {
    const { dismissBackupWarning, shouldShowBackupWarning } = await import('./backup')
    dismissBackupWarning()
    expect(shouldShowBackupWarning()).toBe(false)
  })

  it('keeps the warning hidden within the 5-day snooze window', async () => {
    const { shouldShowBackupWarning } = await import('./backup')
    localStorage.setItem('br.backupWarningDismissedAt', String(Date.now() - 4 * DAY))
    expect(shouldShowBackupWarning()).toBe(false)
  })

  it('shows the warning again once the 5-day snooze window elapses', async () => {
    const { shouldShowBackupWarning } = await import('./backup')
    localStorage.setItem('br.backupWarningDismissedAt', String(Date.now() - 6 * DAY))
    expect(shouldShowBackupWarning()).toBe(true)
  })

  it('never shows the warning when not stale, regardless of dismissal state', async () => {
    const { shouldShowBackupWarning } = await import('./backup')
    localStorage.setItem('br.lastBackupAt', String(Date.now()))
    expect(shouldShowBackupWarning()).toBe(false)
  })
})
