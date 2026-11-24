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
  it('stores only the fields the app knows, dropping anything else in the file', async () => {
    const { validateBackup } = await import('./backup')
    const backup = validBackup()
    ;(backup.reports[0] as unknown as Record<string, unknown>).extra = { deep: { deeper: 'x' } }
    ;(backup.expenses[0] as unknown as Record<string, unknown>).junk = [1, 2, 3]
    const plan = await validateBackup(asFile(backup))
    expect(plan.reports[0]).not.toHaveProperty('extra')
    expect(plan.expenses[0]).not.toHaveProperty('junk')
  })

  // Values no release has written. Anything a release could write is
  // restored: see the tests after these, and backupCompat.test.ts.
  it.each([
    ['a personal amount above the total', { personalAmount: 20 }],
    ['a personal amount below a refund', { amount: -5, personalAmount: -6 }],
    ['a positive personal amount on a refund', { amount: -5, personalAmount: 1 }],
    ['a date that is not yyyy-mm-dd', { date: 'yesterday' }],
    ['a day the month does not have', { date: '2026-02-30' }],
    ['29 February in a year that is not a leap year', { date: '1900-02-29' }],
    ['year 0', { date: '0000-07-18' }],
    ['a seven-digit year', { date: '2026000-07-18' }],
  ])('rejects an expense with %s', async (_label, change) => {
    const { validateBackup } = await import('./backup')
    const backup = validBackup()
    backup.expenses[0] = { ...backup.expenses[0], ...change }
    await expect(validateBackup(asFile(backup))).rejects.toThrow(/expense #0 is malformed/)
  })

  // Save took any number before 1.13.0, and the personal portion was clamped
  // to the amount, so a refund was saved negative with a personal portion
  // equal to it.
  it('restores a refund saved as a negative amount before 1.13.0, as it was saved', async () => {
    const { validateBackup } = await import('./backup')
    const backup = validBackup()
    backup.expenses[0] = { ...backup.expenses[0], amount: -40, personalAmount: -40 }
    const { expenses } = await validateBackup(asFile(backup))
    expect(expenses[0]).toMatchObject({ amount: -40, personalAmount: -40 })
  })

  // Chrome's date field stores a year typed as two digits as 0026, and takes
  // years of up to six digits. A check built on Date.UTC read 0026 as 1926.
  it.each(['0026-07-18', '20266-07-18', '2028-02-29', '2000-02-29'])(
    'restores the date %s, which a date field can write',
    async (date) => {
      const { validateBackup } = await import('./backup')
      const backup = validBackup({
        reports: [{ id: 'r1', name: 'Trip', createdAt: 1, startDate: date, endDate: date }],
      })
      backup.expenses[0] = { ...backup.expenses[0], date }
      const { reports, expenses } = await validateBackup(asFile(backup))
      expect(reports[0]).toMatchObject({ startDate: date, endDate: date })
      expect(expenses[0].date).toBe(date)
    },
  )

  // "1e999" typed before 1.13.0 was saved as Infinity, which JSON writes as
  // null. Refusing it refused the whole file.
  it('restores an amount the file holds as null as 0, without its personal portion, and counts it', async () => {
    const { validateBackup } = await import('./backup')
    const backup = validBackup()
    const raw = backup.expenses[0] as unknown as Record<string, unknown>
    raw.amount = null
    raw.personalAmount = 5
    const plan = await validateBackup(asFile(backup))
    expect(plan.expenses[0].amount).toBe(0)
    expect(plan.expenses[0]).not.toHaveProperty('personalAmount')
    expect(plan.counts.unreadableAmounts).toBe(1)
  })

  it('restores a personal portion the file holds as null as unset', async () => {
    const { validateBackup } = await import('./backup')
    const backup = validBackup()
    ;(backup.expenses[0] as unknown as Record<string, unknown>).personalAmount = null
    const plan = await validateBackup(asFile(backup))
    expect(plan.expenses[0]).not.toHaveProperty('personalAmount')
    expect(plan.counts.unreadableAmounts).toBe(0)
  })

  it('restores a meal allowance the file holds as null as unset', async () => {
    const { validateBackup } = await import('./backup')
    const backup = validBackup()
    ;(backup.reports[0] as unknown as Record<string, unknown>).dailyMealAllowance = null
    const { reports } = await validateBackup(asFile(backup))
    expect(reports[0]).not.toHaveProperty('dailyMealAllowance')
  })

  it('rejects two expenses with the same id', async () => {
    const { validateBackup } = await import('./backup')
    const backup = validBackup()
    backup.expenses.push({ ...backup.expenses[0] })
    await expect(validateBackup(asFile(backup))).rejects.toThrow(/two expenses with the same id/)
  })

  it('rejects a backup from a newer version of the app, and says to update', async () => {
    const { validateBackup } = await import('./backup')
    const backup = { ...validBackup(), version: 2 }
    await expect(validateBackup(asFile(backup))).rejects.toThrow(/newer version/)
  })

  // A report's rates are keyed by its expenses' currency text, and the
  // currency field took any three characters until 1.23.1. A check for three
  // letters, added in 1.16.0, refused every backup holding one of these.
  it('keeps an exchange rate under any currency text the currency field could hold', async () => {
    const { validateBackup } = await import('./backup')
    const backup = validBackup()
    backup.reports[0] = { ...backup.reports[0], exchangeRates: { '€': 1.08, EU: 1.09, C$: 0.73 } }
    const { reports } = await validateBackup(asFile(backup))
    expect(reports[0].exchangeRates).toEqual({ '€': 1.08, EU: 1.09, C$: 0.73 })
  })

  it('counts receipt pages the expenses point at that the file does not carry', async () => {
    const { validateBackup } = await import('./backup')
    const backup = validBackup()
    backup.expenses[0] = { ...backup.expenses[0], imageId: 'gone', extraImageIds: ['also-gone'] }
    const plan = await validateBackup(asFile(backup))
    expect(plan.counts.missingImages).toBe(2)
  })

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

  // Exports before 1.16.0 carried an expense a second tab had saved into a
  // report the first had just deleted. Refusing it refused the whole file;
  // restoring it would store an expense nothing in the app can show.
  it('leaves out an expense whose report is not in the file, with its receipt pages, and counts it', async () => {
    const { validateBackup } = await import('./backup')
    const backup = validBackup({
      images: [{ id: 'orphan-page', dataUrl: `data:image/png;base64,${TINY_PNG_BASE64}` }],
    })
    backup.expenses.push({
      ...backup.expenses[0],
      id: 'e2',
      reportId: 'some-other-report-not-in-this-file',
      imageId: 'orphan-page',
    })
    const plan = await validateBackup(asFile(backup))
    expect(plan.expenses.map((e) => e.id)).toEqual(['e1'])
    expect(plan.images).toEqual([])
    expect(plan.counts).toMatchObject({ expenses: 1, skippedExpenses: 1, missingImages: 0 })
  })

  it('does not restore a receipt page that no expense points at', async () => {
    const { validateBackup } = await import('./backup')
    const plan = await validateBackup(
      asFile(validBackup({ images: [{ id: 'img1', dataUrl: `data:image/png;base64,${TINY_PNG_BASE64}` }] })),
    )
    expect(plan.images).toEqual([])
  })

  it('decodes a valid data:image;base64 image', async () => {
    const { validateBackup } = await import('./backup')
    const backup = validBackup({ images: [{ id: 'img1', dataUrl: `data:image/png;base64,${TINY_PNG_BASE64}` }] })
    backup.expenses[0].imageId = 'img1'
    const { images } = await validateBackup(asFile(backup))
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

    const backup = validBackup({ images: [{ id: 'img1', dataUrl: `data:image/png;base64,${TINY_PNG_BASE64}` }] })
    backup.expenses[0].imageId = 'img1'
    const plan = await validateBackup(asFile(backup))

    expect(plan.images).toHaveLength(1)
    expect(plan.counts).toEqual({
      reports: 1,
      expenses: 1,
      overwrites: 0,
      missingImages: 0,
      skippedExpenses: 0,
      unreadableAmounts: 0,
    })
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

  it('rejects a report carrying a string over the 100000-character limit', async () => {
    const { validateBackup } = await import('./backup')
    const bad = validBackup({ reports: [{ id: 'r1', name: 'x'.repeat(100_001), createdAt: 1 }] })
    await expect(validateBackup(asFile(bad))).rejects.toThrow(/text longer than the 100000-character limit/)
  })

  it('rejects an expense carrying a string over the 100000-character limit', async () => {
    const { validateBackup } = await import('./backup')
    const bad = validBackup()
    bad.expenses[0].notes = 'x'.repeat(100_001)
    await expect(validateBackup(asFile(bad))).rejects.toThrow(/text longer than the 100000-character limit/)
  })

  // exchangeRates keeps currency codes in its object keys, and the shape
  // checks accept unknown extra properties, so a cap that only looked at
  // values would leave the obvious hiding place open.
  it('rejects an overlong string hiding in an object key', async () => {
    const { validateBackup } = await import('./backup')
    const bad = validBackup({
      reports: [{ id: 'r1', name: 'Trip', createdAt: 1, exchangeRates: { ['E'.repeat(100_001)]: 1.08 } }],
    })
    await expect(validateBackup(asFile(bad))).rejects.toThrow(/text longer than the 100000-character limit/)
  })

  it('accepts a string of exactly 100000 characters', async () => {
    const { validateBackup } = await import('./backup')
    const backup = validBackup({ reports: [{ id: 'r1', name: 'x'.repeat(100_000), createdAt: 1 }] })
    const { reports } = await validateBackup(asFile(backup))
    expect(reports[0].name).toHaveLength(100_000)
  })

  // The screens cap text at 2,000 characters from 1.13.0; before that nothing
  // did, and 1.13.0's restore refused every file holding a longer note.
  it('restores a note longer than the screens now allow, as typed before 1.13.0', async () => {
    const { validateBackup, MAX_STRING_LENGTH } = await import('./backup')
    const backup = validBackup()
    backup.expenses[0].notes = 'n'.repeat(MAX_STRING_LENGTH + 1000)
    const { expenses } = await validateBackup(asFile(backup))
    expect(expenses[0].notes).toHaveLength(MAX_STRING_LENGTH + 1000)
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

  // The same limit the app itself keeps, so a restored list is never longer
  // than one this app could have made.
  it('rejects a profile with more than 50 project numbers', async () => {
    const { validateBackup } = await import('./backup')
    const projects = Array.from({ length: 51 }, (_, i) => `PRJ-${i}`)
    const bad = validBackup({ profile: makeProfile({ projects }) })
    await expect(validateBackup(asFile(bad))).rejects.toThrow(/more than 50 project numbers/)
  })

  it('rejects a profile carrying a string over the 100000-character limit', async () => {
    const { validateBackup } = await import('./backup')
    const bad = validBackup({ profile: makeProfile({ name: 'x'.repeat(100_001) }) })
    await expect(validateBackup(asFile(bad))).rejects.toThrow(
      /profile has text longer than the 100000-character limit/,
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

  // A second tab can save an expense into a report the first tab has just
  // deleted. The app shows no such expense, and validateBackup rejects a whole
  // file over one, so exporting it would make every backup unrestorable.
  it('leaves out an expense whose report no longer exists, so the file still restores', async () => {
    const db = await import('./db')
    const { exportBackup, validateBackup } = await import('./backup')
    await db.saveReport({ id: 'r1', name: 'Trip', createdAt: 1 })
    const [expense] = validBackup().expenses
    await db.saveExpense({ ...expense, id: 'kept', reportId: 'r1' })
    await db.saveExpense({ ...expense, id: 'orphan', reportId: 'deleted-report' })

    expect(await exportBackup()).toBe(true)
    const exported = shareOrDownloadFile.mock.calls[0][0] as File

    const plan = await validateBackup(exported)
    expect(plan.expenses.map((e) => e.id)).toEqual(['kept'])
  })

  it('refuses to write a backup larger than the format can hold, and says so', async () => {
    const db = await import('./db')
    const backup = await import('./backup')
    await db.saveReport({ id: 'r1', name: 'Trip', createdAt: 1 })
    const huge = { size: backup.MAX_EXPORT_IMAGE_BYTES + 1 } as Blob
    const [expense] = validBackup().expenses
    await db.saveExpense({ ...expense, imageId: 'i1' })
    vi.spyOn(db, 'listAllImages').mockResolvedValueOnce([{ id: 'i1', blob: huge }])

    await expect(backup.exportBackup()).rejects.toThrow(backup.BackupTooLargeError)
    expect(shareOrDownloadFile).not.toHaveBeenCalled()
  })

  it('does not count or export an image that no kept expense references', async () => {
    const db = await import('./db')
    const backup = await import('./backup')
    await db.saveReport({ id: 'r1', name: 'Trip', createdAt: 1 })
    const huge = { size: backup.MAX_EXPORT_IMAGE_BYTES + 1 } as Blob
    vi.spyOn(db, 'listAllImages').mockResolvedValueOnce([{ id: 'stranded', blob: huge }])

    expect(await backup.exportBackup()).toBe(true)
    const exported = shareOrDownloadFile.mock.calls[0][0] as File
    expect(JSON.parse(await exported.text()).images).toEqual([])
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

  // The photo was replaced after the backup was taken. Restoring puts the
  // old expense back; the new photo would then belong to nothing.
  it('removes a receipt page that the restored expense no longer points at', async () => {
    const db = await import('./db')
    await db.importBackupData(
      [{ id: 'r1', name: 'Trip', createdAt: 1 }],
      [{ ...validBackup().expenses[0], imageId: 'newer-photo' }],
      [{ id: 'newer-photo', blob: new Blob(['n']) }],
    )
    await db.importBackupData(
      [{ id: 'r1', name: 'Trip', createdAt: 1 }],
      [{ ...validBackup().expenses[0], imageId: 'older-photo' }],
      [{ id: 'older-photo', blob: new Blob(['o']) }],
    )
    expect(await db.getImage('newer-photo')).toBeUndefined()
    expect(await db.getImage('older-photo')).toBeDefined()
  })

  it('keeps a receipt page that an expense outside the restore still points at', async () => {
    const db = await import('./db')
    const base = validBackup().expenses[0]
    await db.importBackupData(
      [{ id: 'r1', name: 'Trip', createdAt: 1 }],
      [
        { ...base, id: 'a', imageId: 'shared' },
        { ...base, id: 'b', imageId: 'shared' },
      ],
      [{ id: 'shared', blob: new Blob(['s']) }],
    )
    await db.importBackupData([{ id: 'r1', name: 'Trip', createdAt: 1 }], [{ ...base, id: 'a', imageId: 'other' }], [
      { id: 'other', blob: new Blob(['o']) },
    ])
    expect(await db.getImage('shared')).toBeDefined()
  })

  it('writes nothing at all when one record in the file is invalid', async () => {
    const db = await import('./db')
    const { importBackup } = await import('./backup')
    const backup = validBackup()
    // A second, malformed expense alongside an otherwise-valid one.
    backup.expenses.push({ ...backup.expenses[0], id: 'e2', amount: 'twelve' as unknown as number })
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
