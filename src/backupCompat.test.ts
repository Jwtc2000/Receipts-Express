import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { resetFakeIndexedDB } from './test/idb-reset'
import type { Profile } from './profile'
import type { Expense, Report } from './types'

/**
 * Backups as earlier releases wrote them. Once the phone a backup came from is
 * gone, the file is someone's only copy of their reports, and people keep these
 * files for years, so every release has to restore every one of them. That
 * includes values an earlier release let people save and a later one no longer
 * does: a negative refund, a currency typed as "€", a note pasted in before
 * text was capped.
 *
 * When a release changes what a backup can hold, add a file here. Never edit
 * one: each is pinned by hash below, so a change to a file fails this suite
 * until the pin is changed too, in plain sight in the diff. Every value in them
 * is invented.
 */
const DIR = new URL('./test/fixtures/backups/', import.meta.url)

interface Expected {
  reports: number
  expenses: number
  /** Expenses whose report is not in the file. */
  skippedExpenses: number
  /** Expenses whose amount the file holds as null. */
  unreadableAmounts: number
  missingImages: number
  profile: boolean
}

const FIXTURES: Record<string, { sha256: string; expected: Expected }> = {
  'best-receipts-2026-07-18.json': {
    sha256: 'e85d83c2dbae02fda27a3c4e51fb1712bab0e4d06de361d28eff22fc9d6e4413',
    expected: { reports: 1, expenses: 2, skippedExpenses: 0, unreadableAmounts: 0, missingImages: 0, profile: false },
  },
  'v1.11.1.json': {
    sha256: '329f3424ca065bf177a4d0b6be8d0dc5999aaadea3c1f328a58699f438be0af5',
    expected: { reports: 1, expenses: 4, skippedExpenses: 1, unreadableAmounts: 1, missingImages: 0, profile: false },
  },
  'v1.14.0.json': {
    sha256: '414345e329b4b821fbc48d7ee09e49636a3b565af15c75ba51e9eb3ef641747a',
    expected: { reports: 1, expenses: 2, skippedExpenses: 0, unreadableAmounts: 0, missingImages: 0, profile: true },
  },
  'v1.23.0.json': {
    sha256: '887116c68af9e4c73b758e84ccfcd14e298af60deb1e490debb1bb576ca19642',
    expected: { reports: 1, expenses: 2, skippedExpenses: 0, unreadableAmounts: 0, missingImages: 0, profile: true },
  },
}

const { shareOrDownloadFile } = vi.hoisted(() => ({ shareOrDownloadFile: vi.fn() }))
vi.mock('./share', () => ({ shareOrDownloadFile }))

// FileReader, which the real blobToDataURL uses, does not exist in Node, and
// under jsdom the fake IndexedDB cannot store a Blob. This stand-in produces
// the same `data:<type>;base64,` URL; see backupImages.test.ts.
vi.mock('./image', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./image')>()),
  blobToDataURL: async (blob: Blob) =>
    `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`,
}))

beforeEach(() => {
  resetFakeIndexedDB()
  localStorage.clear()
  shareOrDownloadFile.mockReset()
  shareOrDownloadFile.mockResolvedValue(true)
})

function readFixture(name: string): { text: string; json: Record<string, unknown> } {
  const text = readFileSync(new URL(name, DIR), 'utf-8')
  return { text, json: JSON.parse(text) as Record<string, unknown> }
}

/** Hashed after a parse, so re-indenting a file is not an edit. */
function contentHash(text: string): string {
  return createHash('sha256').update(JSON.stringify(JSON.parse(text))).digest('hex')
}

type RawRecord = Record<string, unknown>

/**
 * What a record from the file should look like once it is stored. A number
 * that JSON could only write as null (Infinity, typed as "1e999" before 1.13.0)
 * cannot come back as it was: an amount becomes 0, and the personal portion
 * and the meal allowance are left unset.
 */
function storedExpense(raw: RawRecord): Expense {
  const e = { ...raw }
  if (e.amount === null) {
    e.amount = 0
    delete e.personalAmount
  }
  if (e.personalAmount === null) delete e.personalAmount
  return e as unknown as Expense
}

function storedReport(raw: RawRecord): Report {
  const r = { ...raw }
  if (r.dailyMealAllowance === null) delete r.dailyMealAllowance
  return r as unknown as Report
}

const byId = <T extends { id: string }>(list: T[]) => [...list].sort((a, b) => a.id.localeCompare(b.id))

describe('backups written by earlier releases', () => {
  it('has a pinned entry for every file in the folder, and a file for every entry', () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()
    expect(files).toEqual(Object.keys(FIXTURES).sort())
  })

  describe.each(Object.entries(FIXTURES))('%s', (name, { sha256, expected }) => {
    it('is unchanged since it was added', () => {
      expect(contentHash(readFixture(name).text)).toBe(sha256)
    })

    it('restores every record, as the release that wrote it stored it', async () => {
      const db = await import('./db')
      const { validateBackup, commitBackup } = await import('./backup')
      const { getProfile } = await import('./profile')
      const { text, json } = readFixture(name)

      const plan = await validateBackup(new File([text], name, { type: 'application/json' }))
      expect(plan.counts).toMatchObject({
        reports: expected.reports,
        expenses: expected.expenses,
        skippedExpenses: expected.skippedExpenses,
        unreadableAmounts: expected.unreadableAmounts,
        missingImages: expected.missingImages,
      })
      await commitBackup(plan)

      const rawReports = json.reports as RawRecord[]
      const reportIds = new Set(rawReports.map((r) => r.id))
      // An expense whose report is not in the file is left out: nothing in the
      // app lists it, so restoring it would store something no one can see.
      const keptExpenses = (json.expenses as RawRecord[]).filter((e) => reportIds.has(e.reportId))

      expect(byId(await db.listReports())).toEqual(byId(rawReports.map(storedReport)))
      expect(byId(await db.listAllExpenses())).toEqual(byId(keptExpenses.map(storedExpense)))

      // Every receipt page a restored expense points at comes back byte for
      // byte, and no page that only a left-out expense pointed at is stored.
      const wanted = new Set(
        keptExpenses.flatMap((e) => [e.imageId, ...((e.extraImageIds as string[] | undefined) ?? [])]).filter(Boolean),
      )
      const images = await db.listAllImages()
      expect(images.map((i) => i.id).sort()).toEqual([...wanted].sort())
      const fileImages = new Map((json.images as { id: string; dataUrl: string }[]).map((i) => [i.id, i.dataUrl]))
      for (const image of images) {
        const base64 = fileImages.get(image.id)!.split(',')[1]
        expect(Buffer.from(await image.blob.arrayBuffer()).toString('base64')).toBe(base64)
      }

      if (expected.profile) expect(getProfile()).toEqual(json.profile)
    })

    // The same records can still be sitting on someone's phone, entered by the
    // release that wrote this file. Backing them up today has to produce a
    // file today's restore takes.
    it('backs up again, once restored, to a file that restores', async () => {
      const db = await import('./db')
      const { validateBackup, commitBackup, exportBackup } = await import('./backup')
      const { text } = readFixture(name)
      await commitBackup(await validateBackup(new File([text], name, { type: 'application/json' })))
      const before = { reports: await db.listReports(), expenses: await db.listAllExpenses() }

      expect(await exportBackup()).toBe(true)
      const exported = shareOrDownloadFile.mock.calls[0][0] as File

      // Onto an empty device, as after losing the phone.
      resetFakeIndexedDB()
      const freshDb = await import('./db')
      const fresh = await import('./backup')
      const plan = await fresh.validateBackup(exported)
      expect(plan.counts).toMatchObject({ skippedExpenses: 0, unreadableAmounts: 0, missingImages: 0 })
      await fresh.commitBackup(plan)

      expect(byId(await freshDb.listReports())).toEqual(byId(before.reports))
      expect(byId(await freshDb.listAllExpenses())).toEqual(byId(before.expenses))
    })
  })
})

/**
 * A record with every field the app stores set. Typed `Required<...>`, so
 * adding a field to Report, Expense or Profile fails the type check until the
 * field is added here too. The tests below then fail until the field also
 * survives a backup and restore (that is, until backup.ts checks and picks
 * it), and until a new backup file in the fixtures folder carries it.
 */
const EVERY_REPORT_FIELD: Required<Report> = {
  id: 'every-r1',
  name: 'Sample report with every field',
  createdAt: 1795000000000,
  startDate: '2026-11-16',
  endDate: '2026-11-19',
  dailyMealAllowance: 60,
  projectNumber: 'PRJ-SAMPLE-4',
  exchangeRates: { GBP: 1.27 },
}

const EVERY_EXPENSE_FIELD: Required<Expense> = {
  id: 'every-e1',
  reportId: 'every-r1',
  position: 0,
  title: 'Breakfast',
  merchant: 'Example Kitchen',
  amount: 14.2,
  currency: 'GBP',
  date: '2026-11-17',
  category: 'Meals',
  notes: 'Made-up sample note',
  imageId: 'every-i1',
  extraImageIds: ['every-i2'],
  createdAt: 1795000000000,
  personalAmount: 2.5,
}

const EVERY_PROFILE_FIELD: Required<Profile> = {
  name: 'Sample Person',
  employeeId: 'E-0000',
  costCenter: 'CC-SAMPLE',
  projectNumber: 'PRJ-SAMPLE-4',
  projects: ['PRJ-SAMPLE-4'],
}

describe('a record with every field set', () => {
  it('comes back from a backup and restore unchanged', async () => {
    const db = await import('./db')
    const { exportBackup } = await import('./backup')
    const { saveProfile } = await import('./profile')
    await db.saveReport(EVERY_REPORT_FIELD)
    await db.saveExpense(EVERY_EXPENSE_FIELD)
    for (const id of ['every-i1', 'every-i2']) {
      await db.saveImage({ id, blob: new Blob([id], { type: 'image/jpeg' }) })
    }
    saveProfile(EVERY_PROFILE_FIELD)
    expect(await exportBackup()).toBe(true)
    const exported = shareOrDownloadFile.mock.calls[0][0] as File

    resetFakeIndexedDB()
    localStorage.clear()
    const freshDb = await import('./db')
    const { validateBackup, commitBackup } = await import('./backup')
    const { getProfile } = await import('./profile')
    await commitBackup(await validateBackup(exported))

    expect(await freshDb.getReport('every-r1')).toEqual(EVERY_REPORT_FIELD)
    expect(await freshDb.getExpense('every-e1')).toEqual(EVERY_EXPENSE_FIELD)
    expect((await freshDb.listAllImages()).map((i) => i.id).sort()).toEqual(['every-i1', 'every-i2'])
    expect(getProfile()).toEqual(EVERY_PROFILE_FIELD)
  })

  // A field added to the app needs a backup file that carries it, so that
  // every later release is tested against it.
  it('has all its fields in the newest backup file in the fixtures folder', () => {
    const versioned = Object.keys(FIXTURES)
      .map((name) => ({ name, version: /^v(\d+)\.(\d+)\.(\d+)\.json$/.exec(name)?.slice(1).map(Number) }))
      .filter((f): f is { name: string; version: number[] } => f.version !== undefined)
      .sort((a, b) => a.version[0] - b.version[0] || a.version[1] - b.version[1] || a.version[2] - b.version[2])
    const newest = readFixture(versioned[versioned.length - 1].name).json
    const keysOf = (records: unknown) => new Set((records as RawRecord[]).flatMap((r) => Object.keys(r)))

    expect([...keysOf(newest.reports)]).toEqual(expect.arrayContaining(Object.keys(EVERY_REPORT_FIELD)))
    expect([...keysOf(newest.expenses)]).toEqual(expect.arrayContaining(Object.keys(EVERY_EXPENSE_FIELD)))
    expect(Object.keys(newest.profile as RawRecord)).toEqual(expect.arrayContaining(Object.keys(EVERY_PROFILE_FIELD)))
  })
})
