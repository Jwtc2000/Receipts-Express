import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetFakeIndexedDB } from './test/idb-reset'
import type { BackupFile } from './backup'
import type { Profile } from './profile'

// exportBackup hands the finished file to the share sheet or a download, both
// of which need a browser. Recorded instead, so the round-trip tests below can
// read back the exact file a real export would have produced.
const { shareOrDownloadFile } = vi.hoisted(() => ({ shareOrDownloadFile: vi.fn() }))
vi.mock('./share', () => ({ shareOrDownloadFile }))

beforeEach(() => {
  resetFakeIndexedDB()
  localStorage.clear()
  shareOrDownloadFile.mockReset()
  shareOrDownloadFile.mockResolvedValue(true)
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

/**
 * validateBackup takes the picked File rather than a parsed object, so that
 * unreadable JSON is its problem too rather than the caller's. Tests build the
 * object they mean and wrap it here.
 */
function asFile(backup: unknown): File {
  return new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' })
}

function fileOf(text: string): File {
  return new File([text], 'backup.json', { type: 'application/json' })
}

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    name: 'Jordan',
    employeeId: 'E-1',
    costCenter: 'CC-9',
    projectNumber: 'PRJ-1',
    projects: ['PRJ-1'],
    ...overrides,
  }
}

// 1x1 transparent PNG
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

describe('validateBackup', () => {
  it('accepts a well-formed backup', async () => {
    const { validateBackup } = await import('./backup')
    const { reports, expenses, images } = await validateBackup(asFile(validBackup()))
    expect(reports).toHaveLength(1)
    expect(expenses).toHaveLength(1)
    expect(images).toHaveLength(0)
  })

  it('rejects a file that is not JSON at all', async () => {
    const { validateBackup } = await import('./backup')
    await expect(validateBackup(fileOf('not json, just words'))).rejects.toThrow(/valid JSON/i)
  })

  it('rejects an unknown app id', async () => {
    const { validateBackup } = await import('./backup')
    await expect(validateBackup(asFile(validBackup({ app: 'some-other-app' })))).rejects.toThrow()
  })

  it('accepts a report with a valid trip date range', async () => {
    const { validateBackup } = await import('./backup')
    const backup = validBackup({
      reports: [{ id: 'r1', name: 'Trip', createdAt: 1, startDate: '2026-07-16', endDate: '2026-07-20' }],
    })
    const { reports } = await validateBackup(asFile(backup))
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
    await expect(validateBackup(asFile(bad))).rejects.toThrow(/malformed/i)
  })

  it('accepts a report with a valid daily meal allowance', async () => {
    const { validateBackup } = await import('./backup')
    const backup = validBackup({
      reports: [{ id: 'r1', name: 'Trip', createdAt: 1, dailyMealAllowance: 50 }],
    })
    const { reports } = await validateBackup(asFile(backup))
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
    await expect(validateBackup(asFile(bad))).rejects.toThrow(/malformed/i)
  })

  it('accepts a report with a project number', async () => {
    const { validateBackup } = await import('./backup')
    const backup = validBackup({
      reports: [{ id: 'r1', name: 'Trip', createdAt: 1, projectNumber: 'PRJ-42' }],
    })
    const { reports } = await validateBackup(asFile(backup))
    expect(reports[0].projectNumber).toBe('PRJ-42')
  })

  it('rejects a report with a non-string projectNumber', async () => {
    const { validateBackup } = await import('./backup')
    const bad = validBackup({
      // @ts-expect-error intentionally malformed for the test
      reports: [{ id: 'r1', name: 'Trip', createdAt: 1, projectNumber: 42 }],
    })
    await expect(validateBackup(asFile(bad))).rejects.toThrow(/malformed/i)
  })

  it('rejects an expense with a non-numeric personalAmount (regression)', async () => {
    // A malformed personalAmount would otherwise crash businessAmount's
    // subtraction the first time totals are computed.
    const { validateBackup } = await import('./backup')
    const bad = validBackup()
    // @ts-expect-error intentionally malformed for the test
    bad.expenses[0].personalAmount = 'five'
    await expect(validateBackup(asFile(bad))).rejects.toThrow(/malformed/i)
  })

  it('accepts a report with valid exchange rates', async () => {
    const { validateBackup } = await import('./backup')
    const backup = validBackup({
      reports: [{ id: 'r1', name: 'Trip', createdAt: 1, exchangeRates: { EUR: 1.08, GBP: 1.27 } }],
    })
    const { reports } = await validateBackup(asFile(backup))
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
    await expect(validateBackup(asFile(bad))).rejects.toThrow(/malformed/i)
  })

  it('rejects a report with a zero or negative exchange rate (regression)', async () => {
    const { validateBackup } = await import('./backup')
    const bad = validBackup({
      reports: [{ id: 'r1', name: 'Trip', createdAt: 1, exchangeRates: { EUR: -1.08 } }],
    })
    await expect(validateBackup(asFile(bad))).rejects.toThrow(/malformed/i)
  })

  it('rejects a malformed expense (non-numeric amount)', async () => {
    const { validateBackup } = await import('./backup')
    const bad = validBackup()
    // @ts-expect-error intentionally malformed for the test
    bad.expenses[0].amount = 'twelve'
    await expect(validateBackup(asFile(bad))).rejects.toThrow(/malformed/i)
  })

  it('rejects an expense missing its reportId', async () => {
    const { validateBackup } = await import('./backup')
    const bad = validBackup()
    // @ts-expect-error intentionally malformed for the test
    delete bad.expenses[0].reportId
    await expect(validateBackup(asFile(bad))).rejects.toThrow(/malformed/i)
  })

  it('rejects an expense whose reportId is not in this backup (regression)', async () => {
    const { validateBackup } = await import('./backup')
    const bad = validBackup()
    bad.expenses[0].reportId = 'some-other-report-not-in-this-file'
    await expect(validateBackup(asFile(bad))).rejects.toThrow(/references a report/i)
  })

  it('decodes a valid data:image;base64 image', async () => {
    const { validateBackup } = await import('./backup')
    const { images } = await validateBackup(
      asFile(validBackup({ images: [{ id: 'img1', dataUrl: `data:image/png;base64,${TINY_PNG_BASE64}` }] })),
    )
    expect(images).toHaveLength(1)
    expect(images[0].blob.type).toBe('image/png')
    expect(images[0].blob.size).toBeGreaterThan(0)
  })

  it('rejects an image dataUrl that is actually a fetchable URL', async () => {
    const { validateBackup } = await import('./backup')
    await expect(
      validateBackup(asFile(validBackup({ images: [{ id: 'img1', dataUrl: 'https://evil.example/x.png' }] }))),
    ).rejects.toThrow(/data url/i)
  })

  it('rejects an image over the per-image size limit', async () => {
    const { validateBackup } = await import('./backup')
    // ~22MB of base64 payload decodes to ~16.5MB, above the 15MB per-image cap
    const huge = 'A'.repeat(22 * 1024 * 1024)
    await expect(
      validateBackup(asFile(validBackup({ images: [{ id: 'img1', dataUrl: `data:image/png;base64,${huge}` }] }))),
    ).rejects.toThrow(/size limit/i)
  })

  it('rejects a backup with more images than the count cap allows', async () => {
    const { validateBackup } = await import('./backup')
    // The count check runs before per-image decoding, so these don't need
    // to be real images to exercise the cap.
    const images = Array.from({ length: 5001 }, (_, i) => ({ id: `img${i}`, dataUrl: '' }))
    await expect(validateBackup(asFile(validBackup({ images })))).rejects.toThrow(/too many images/i)
  })
})

/**
 * The restore path is split so the user can be told what a restore would
 * destroy while it is still possible to decline. validateBackup does all the
 * reading and checking and writes nothing; commitBackup does the writes. The
 * value of the split is entirely in that first half touching nothing, so that
 * is what these tests hold down.
 */
describe('validateBackup / commitBackup split', () => {
  it('writes nothing while validating', async () => {
    const db = await import('./db')
    const { validateBackup } = await import('./backup')

    const plan = await validateBackup(
      asFile(validBackup({ images: [{ id: 'img1', dataUrl: `data:image/png;base64,${TINY_PNG_BASE64}` }] })),
    )

    expect(plan.counts).toEqual({ reports: 1, expenses: 1, overwrites: 0 })
    expect(await db.getReport('r1')).toBeUndefined()
    expect(await db.getExpense('e1')).toBeUndefined()
    expect(await db.getImage('img1')).toBeUndefined()
  })

  it('commitBackup writes exactly the plan validateBackup produced', async () => {
    const db = await import('./db')
    const { validateBackup, commitBackup } = await import('./backup')

    const backup = validBackup({
      images: [{ id: 'img1', dataUrl: `data:image/png;base64,${TINY_PNG_BASE64}` }],
    })
    backup.expenses[0].imageId = 'img1'
    const plan = await validateBackup(asFile(backup))
    await commitBackup(plan)

    expect(await db.getReport('r1')).toBeDefined()
    expect(await db.getExpense('e1')).toBeDefined()
    expect(await db.getImage('img1')).toBeDefined()
  })

  it('carries the export timestamp through, so a confirmation can say how old the backup is', async () => {
    const { validateBackup } = await import('./backup')
    const plan = await validateBackup(asFile(validBackup({ exportedAt: '2026-07-18T12:00:00.000Z' })))
    expect(plan.exportedAt).toBe('2026-07-18T12:00:00.000Z')
  })

  it('reports an empty export timestamp rather than a bogus one when the file carries none', async () => {
    const { validateBackup } = await import('./backup')
    const bad = validBackup()
    // @ts-expect-error intentionally malformed for the test
    bad.exportedAt = 12345
    const plan = await validateBackup(asFile(bad))
    expect(plan.exportedAt).toBe('')
  })

  // The number the confirmation is really about: importBackupData writes with
  // `put`, so a colliding id replaces what is on the device even when the copy
  // there is newer, and nothing can undo it.
  it('counts the records already on this device that the restore would replace', async () => {
    const db = await import('./db')
    const { validateBackup } = await import('./backup')
    await db.saveReport({ id: 'r1', name: 'A report already here', createdAt: 99 })
    await db.saveExpense({ ...validBackup().expenses[0], title: 'An expense already here' })

    const plan = await validateBackup(asFile(validBackup()))

    expect(plan.counts.overwrites).toBe(2)
  })

  it('counts no overwrites when the backup and the device share no ids', async () => {
    const db = await import('./db')
    const { validateBackup } = await import('./backup')
    await db.saveReport({ id: 'a-different-report', name: 'Unrelated', createdAt: 99 })

    const plan = await validateBackup(asFile(validBackup()))

    expect(plan.counts.overwrites).toBe(0)
  })
})

/**
 * A corrupt or hostile file can be arbitrarily large in ways the per-image
 * limits never see: millions of tiny records, or a handful of records carrying
 * megabyte-long strings. Either exhausts the origin's storage quota — or
 * wedges the tab building the transaction — before anything else catches it.
 */
describe('validateBackup record and text ceilings', () => {
  it('rejects a file with more than 1000 reports', async () => {
    const { validateBackup } = await import('./backup')
    // The count check runs before per-record validation, so these need no shape.
    const reports = Array.from({ length: 1001 }, () => ({}))
    await expect(
      // @ts-expect-error deliberately shapeless — only the count is under test
      validateBackup(asFile(validBackup({ reports, expenses: [] }))),
    ).rejects.toThrow(/more than 1000 reports/)
  })

  it('rejects a file with more than 10000 expenses', async () => {
    const { validateBackup } = await import('./backup')
    const expenses = Array.from({ length: 10001 }, () => ({}))
    await expect(
      // @ts-expect-error deliberately shapeless — only the count is under test
      validateBackup(asFile(validBackup({ expenses }))),
    ).rejects.toThrow(/more than 10000 expenses/)
  })

  it('rejects a report carrying a string over the 2000-character limit', async () => {
    const { validateBackup } = await import('./backup')
    const bad = validBackup({ reports: [{ id: 'r1', name: 'x'.repeat(2001), createdAt: 1 }] })
    await expect(validateBackup(asFile(bad))).rejects.toThrow(/text longer than the 2000-character limit/)
  })

  it('rejects an expense carrying a string over the 2000-character limit', async () => {
    const { validateBackup } = await import('./backup')
    const bad = validBackup()
    bad.expenses[0].notes = 'x'.repeat(2001)
    await expect(validateBackup(asFile(bad))).rejects.toThrow(/text longer than the 2000-character limit/)
  })

  // exchangeRates keeps currency codes in its object keys, and the shape
  // checks accept unknown extra properties, so a cap that only looked at
  // values would leave the obvious hiding place open.
  it('rejects an overlong string hiding in an object key', async () => {
    const { validateBackup } = await import('./backup')
    const bad = validBackup({
      reports: [{ id: 'r1', name: 'Trip', createdAt: 1, exchangeRates: { ['E'.repeat(2001)]: 1.08 } }],
    })
    await expect(validateBackup(asFile(bad))).rejects.toThrow(/text longer than the 2000-character limit/)
  })

  it('accepts a string of exactly 2000 characters', async () => {
    const { validateBackup } = await import('./backup')
    const backup = validBackup({ reports: [{ id: 'r1', name: 'x'.repeat(2000), createdAt: 1 }] })
    const { reports } = await validateBackup(asFile(backup))
    expect(reports[0].name).toHaveLength(2000)
  })

  // The string cap limits how long each id is, not how many there are, so the
  // one unbounded list inside an otherwise-valid record needs its own ceiling.
  it('rejects an expense listing more receipt pages than the image cap allows', async () => {
    const { validateBackup } = await import('./backup')
    const bad = validBackup()
    bad.expenses[0].extraImageIds = Array.from({ length: 5001 }, (_, i) => `img${i}`)
    await expect(validateBackup(asFile(bad))).rejects.toThrow(/more than 5000 receipt pages/)
  })
})

/**
 * The profile is the user's name, employee id, cost center and project list.
 * A restore that brought back every receipt and dropped those would be a
 * restore that quietly lost data, and one that blanked them would be worse.
 */
describe('the profile in a backup', () => {
  it('restores the profile the backup carries', async () => {
    const { validateBackup, commitBackup } = await import('./backup')
    const { getProfile } = await import('./profile')

    const plan = await validateBackup(asFile(validBackup({ profile: makeProfile() })))
    expect(plan.profile).toEqual(makeProfile())
    await commitBackup(plan)

    expect(getProfile()).toMatchObject({
      name: 'Jordan',
      employeeId: 'E-1',
      costCenter: 'CC-9',
      projectNumber: 'PRJ-1',
      projects: ['PRJ-1'],
    })
  })

  // Backups written before the profile was included have no `profile` key at
  // all. They are valid files, and restoring one must not blank the profile on
  // this device — the failure mode being guarded against is a restore that
  // helpfully overwrites a filled-in profile with nothing.
  it('accepts a backup with no profile at all, and leaves this device\'s profile alone', async () => {
    const { validateBackup, commitBackup } = await import('./backup')
    const { getProfile, saveProfile } = await import('./profile')
    saveProfile(makeProfile({ name: 'Already here' }))

    const backup = validBackup()
    expect('profile' in backup).toBe(false)
    const plan = await validateBackup(asFile(backup))
    expect(plan.profile).toBeNull()
    await commitBackup(plan)

    expect(getProfile().name).toBe('Already here')
  })

  it('rejects a malformed profile', async () => {
    const { validateBackup } = await import('./backup')
    // @ts-expect-error intentionally malformed for the test
    const bad = validBackup({ profile: { ...makeProfile(), name: 42 } })
    await expect(validateBackup(asFile(bad))).rejects.toThrow(/profile is malformed/i)
  })

  it('rejects a profile with more than 200 project numbers', async () => {
    const { validateBackup } = await import('./backup')
    const projects = Array.from({ length: 201 }, (_, i) => `PRJ-${i}`)
    const bad = validBackup({ profile: makeProfile({ projects }) })
    await expect(validateBackup(asFile(bad))).rejects.toThrow(/more than 200 project numbers/)
  })

  it('rejects a profile carrying a string over the 2000-character limit', async () => {
    const { validateBackup } = await import('./backup')
    const bad = validBackup({ profile: makeProfile({ name: 'x'.repeat(2001) }) })
    await expect(validateBackup(asFile(bad))).rejects.toThrow(
      /profile has text longer than the 2000-character limit/,
    )
  })

  it('round-trips the profile through a real export and back', async () => {
    const db = await import('./db')
    const { exportBackup, validateBackup, commitBackup } = await import('./backup')
    const { getProfile, saveProfile } = await import('./profile')
    await db.saveReport({ id: 'r1', name: 'Trip', createdAt: 1 })
    saveProfile(makeProfile())

    expect(await exportBackup()).toBe(true)
    const exported = shareOrDownloadFile.mock.calls[0][0] as File

    localStorage.clear()
    await commitBackup(await validateBackup(exported))

    expect(getProfile()).toMatchObject({ name: 'Jordan', projects: ['PRJ-1'] })
  })

  // An entirely empty profile is left out of the file rather than written as
  // blanks, which is what makes the no-profile case above reachable for anyone
  // who exports before filling the profile in.
  it('omits the profile key entirely when every field is still empty', async () => {
    const db = await import('./db')
    const { exportBackup } = await import('./backup')
    await db.saveReport({ id: 'r1', name: 'Trip', createdAt: 1 })

    expect(await exportBackup()).toBe(true)
    const exported = shareOrDownloadFile.mock.calls[0][0] as File

    expect(JSON.parse(await exported.text())).not.toHaveProperty('profile')
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
    const file = asFile(backup)

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
    const file = asFile(backup)

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
    const file = asFile(backup)

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
    const file = asFile(backup)

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

  /**
   * The specific regression. `Number('abc')` is NaN, and every comparison
   * against NaN is false — so `Date.now() - last > STALE_AFTER_MS` was false
   * forever and the stale-backup warning was disabled permanently, silently,
   * on the one device whose stored value had gone bad. NaN is also not null,
   * so the existing null check walked straight past it. Both readers now treat
   * an unparseable stamp as absent, which fails toward warning rather than
   * toward silence.
   */
  it('treats an unparseable br.lastBackupAt as never backed up (regression)', async () => {
    const { lastBackupAt, backupIsStale } = await import('./backup')
    localStorage.setItem('br.lastBackupAt', 'abc')
    expect(lastBackupAt()).toBeNull()
    expect(backupIsStale()).toBe(true)
  })

  it('shows the warning when br.lastBackupAt is unparseable (regression)', async () => {
    const { shouldShowBackupWarning } = await import('./backup')
    localStorage.setItem('br.lastBackupAt', 'abc')
    expect(shouldShowBackupWarning()).toBe(true)
  })

  it('treats an unparseable br.backupWarningDismissedAt as never dismissed (regression)', async () => {
    // Same trap on the other key: an unparseable stamp read as a dismissal
    // that never expires.
    const { shouldShowBackupWarning } = await import('./backup')
    localStorage.setItem('br.backupWarningDismissedAt', 'not-a-number')
    expect(shouldShowBackupWarning()).toBe(true)
  })

  it('reads an empty br.lastBackupAt as the epoch, which is still stale (documents the boundary)', async () => {
    // Number('') is 0, not NaN, so the Number.isFinite guard lets it through
    // and lastBackupAt() reports 1 January 1970 rather than "never". The
    // warning still appears, because 1970 is more than 7 days ago, so the
    // outcome is right for the wrong-looking reason. Asserted so that a future
    // change to the guard is a deliberate decision rather than a surprise.
    const { lastBackupAt, backupIsStale } = await import('./backup')
    localStorage.setItem('br.lastBackupAt', '')
    expect(lastBackupAt()).toBe(0)
    expect(backupIsStale()).toBe(true)
  })
})
