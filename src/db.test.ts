import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBObjectStore } from 'fake-indexeddb'
import { resetFakeIndexedDB } from './test/idb-reset'
import type { Expense } from './types'

beforeEach(() => {
  resetFakeIndexedDB()
})

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'expense-1',
    reportId: 'report-1',
    position: 0,
    title: 'Lunch',
    merchant: 'Cafe',
    amount: 12.5,
    currency: 'USD',
    date: '2026-07-18',
    category: 'Meals',
    notes: '',
    createdAt: Date.now(),
    ...overrides,
  }
}

describe('saveExpenseWithImage', () => {
  it('replaces the image and drops the old one only after the new one is written', async () => {
    const db = await import('./db')
    const oldImage = { id: 'image-old', blob: new Blob(['old']) }
    await db.saveImage(oldImage)
    await db.saveExpense(makeExpense({ imageId: oldImage.id }))

    const newImage = { id: 'image-new', blob: new Blob(['new']) }
    const updated = makeExpense({ imageId: newImage.id })
    await db.saveExpenseWithImage(updated, [newImage], [oldImage.id])

    expect(await db.getImage(oldImage.id)).toBeUndefined()
    const stored = await db.getImage(newImage.id)
    expect(stored).toBeDefined()
    expect(await db.getExpense(updated.id)).toMatchObject({ imageId: newImage.id })
  })

  it('leaves the existing image untouched when the image is not changed', async () => {
    const db = await import('./db')
    const image = { id: 'image-1', blob: new Blob(['data']) }
    await db.saveImage(image)
    await db.saveExpense(makeExpense({ imageId: image.id }))

    const renamed = makeExpense({ imageId: image.id, title: 'Dinner' })
    await db.saveExpenseWithImage(renamed, [], [])

    expect(await db.getImage(image.id)).toBeDefined()
    expect(await db.getExpense(renamed.id)).toMatchObject({ imageId: image.id, title: 'Dinner' })
  })

  it('adds a first image without needing anything to delete', async () => {
    const db = await import('./db')
    const image = { id: 'image-1', blob: new Blob(['data']) }
    const expense = makeExpense({ imageId: image.id })
    await db.saveExpenseWithImage(expense, [image], [])

    expect(await db.getImage(image.id)).toBeDefined()
    expect(await db.getExpense(expense.id)).toMatchObject({ imageId: image.id })
  })

  it('removes the image entirely when no replacement is given (regression)', async () => {
    const db = await import('./db')
    const image = { id: 'image-1', blob: new Blob(['data']) }
    await db.saveImage(image)
    await db.saveExpense(makeExpense({ imageId: image.id }))

    const withoutImage = makeExpense({ imageId: undefined })
    await db.saveExpenseWithImage(withoutImage, [], [image.id])

    expect(await db.getImage(image.id)).toBeUndefined()
    expect(await db.getExpense(withoutImage.id)).toMatchObject({ imageId: undefined })
  })

  it('replaces every page of a multi-page receipt and drops all of the old pages', async () => {
    const db = await import('./db')
    const oldPages = [
      { id: 'old-1', blob: new Blob(['old1']) },
      { id: 'old-2', blob: new Blob(['old2']) },
    ]
    for (const img of oldPages) await db.saveImage(img)
    await db.saveExpense(makeExpense({ imageId: 'old-1', extraImageIds: ['old-2'] }))

    const newPages = [
      { id: 'new-1', blob: new Blob(['new1']) },
      { id: 'new-2', blob: new Blob(['new2']) },
      { id: 'new-3', blob: new Blob(['new3']) },
    ]
    const updated = makeExpense({ imageId: 'new-1', extraImageIds: ['new-2', 'new-3'] })
    await db.saveExpenseWithImage(updated, newPages, ['old-1', 'old-2'])

    for (const img of oldPages) expect(await db.getImage(img.id)).toBeUndefined()
    for (const img of newPages) expect(await db.getImage(img.id)).toBeDefined()
    expect(await db.getExpense(updated.id)).toMatchObject({ imageId: 'new-1', extraImageIds: ['new-2', 'new-3'] })
  })

  it('leaves the old image and expense untouched when a mid-transaction put throws (regression)', async () => {
    const db = await import('./db')
    const oldImage = { id: 'image-old', blob: new Blob(['old']) }
    await db.saveImage(oldImage)
    await db.saveExpense(makeExpense({ imageId: oldImage.id }))

    // Simulates e.g. a QuotaExceededError on the first write in the
    // transaction (the new image put) — asserts the doc comment's atomicity
    // claim: nothing downstream (the expense update, the old-image delete)
    // takes effect, and the pre-existing state survives untouched.
    const putSpy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
      throw new Error('simulated write failure')
    })
    try {
      const newImage = { id: 'image-new', blob: new Blob(['new']) }
      const updated = makeExpense({ imageId: newImage.id })
      await expect(db.saveExpenseWithImage(updated, [newImage], [oldImage.id])).rejects.toThrow()

      expect(await db.getImage('image-new')).toBeUndefined()
      expect(await db.getImage(oldImage.id)).toBeDefined()
      expect(await db.getExpense('expense-1')).toMatchObject({ imageId: oldImage.id })
    } finally {
      putSpy.mockRestore()
    }
  })
})

describe('deleteExpense', () => {
  it('deletes every page of a multi-page receipt, not just the first', async () => {
    const db = await import('./db')
    const pages = [
      { id: 'page-1', blob: new Blob(['p1']) },
      { id: 'page-2', blob: new Blob(['p2']) },
      { id: 'page-3', blob: new Blob(['p3']) },
    ]
    for (const img of pages) await db.saveImage(img)
    await db.saveExpense(makeExpense({ imageId: 'page-1', extraImageIds: ['page-2', 'page-3'] }))

    await db.deleteExpense('expense-1')

    for (const img of pages) expect(await db.getImage(img.id)).toBeUndefined()
  })
})

describe('deleteReport', () => {
  it('deletes every page of every expense receipt in the report', async () => {
    const db = await import('./db')
    const pages = [
      { id: 'r-page-1', blob: new Blob(['p1']) },
      { id: 'r-page-2', blob: new Blob(['p2']) },
    ]
    for (const img of pages) await db.saveImage(img)
    await db.saveReport({ id: 'report-1', name: 'Trip', createdAt: Date.now() })
    await db.saveExpense(makeExpense({ imageId: 'r-page-1', extraImageIds: ['r-page-2'] }))

    await db.deleteReport('report-1')

    for (const img of pages) expect(await db.getImage(img.id)).toBeUndefined()
    expect(await db.getExpense('expense-1')).toBeUndefined()
  })
})

describe('listExpenses', () => {
  it('sorts by date rather than position', async () => {
    const db = await import('./db')
    await db.saveExpense(makeExpense({ id: 'later', date: '2026-07-20', position: 0 }))
    await db.saveExpense(makeExpense({ id: 'earlier', date: '2026-07-18', position: 1 }))
    const list = await db.listExpenses('report-1')
    expect(list.map((e) => e.id)).toEqual(['earlier', 'later'])
  })
})

describe('nextPosition', () => {
  it('returns one past the highest position even when date-sort reorders the list (regression)', async () => {
    const db = await import('./db')
    // Position 5 sorts first here because its date is earlier, so a naive
    // "last item in the sorted list" read would wrongly return 1 (0 + 1).
    await db.saveExpense(makeExpense({ id: 'a', date: '2026-07-20', position: 0 }))
    await db.saveExpense(makeExpense({ id: 'b', date: '2026-07-18', position: 5 }))
    expect(await db.nextPosition('report-1')).toBe(6)
  })
})
