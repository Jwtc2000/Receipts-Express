import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetFakeIndexedDB } from './test/idb-reset'

/**
 * A real export of receipt images, read back by a real restore.
 *
 * No test used to export an image at all: every round trip carried none, and every
 * image the importer saw was a hand-written data URL. A change to how images
 * are encoded on one side or matched on the other would have left the suite
 * green and the backups unrestorable.
 */
const { shareOrDownloadFile } = vi.hoisted(() => ({ shareOrDownloadFile: vi.fn() }))
vi.mock('./share', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./share')>()),
  shareOrDownloadFile,
}))

// FileReader, which the real blobToDataURL uses, does not exist outside a
// browser, and under jsdom the fake IndexedDB cannot store a Blob at all. So
// the test runs in Node with this stand-in, which produces the same thing: a
// `data:<type>;base64,` URL of the blob's bytes and type. Everything else on
// both sides of the round trip is the real code.
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

describe('backup with receipt images', () => {
  it('restores every page of a multi-page receipt, byte for byte', async () => {
    const db = await import('./db')
    const { exportBackup } = await import('./backup')
    const pages = [
      { id: 'p1', blob: new Blob([new Uint8Array([0xff, 0xd8, 1, 2, 3])], { type: 'image/jpeg' }) },
      { id: 'p2', blob: new Blob([new Uint8Array([0xff, 0xd8, 4, 5, 6, 7])], { type: 'image/jpeg' }) },
    ]
    await db.saveReport({ id: 'r1', name: 'Trip', createdAt: 1 })
    await db.saveExpenseWithImage(
      {
        id: 'e1',
        reportId: 'r1',
        position: 0,
        title: 'Hotel',
        merchant: 'Inn',
        amount: 120,
        currency: 'USD',
        date: '2026-07-18',
        category: 'Lodging',
        notes: '',
        createdAt: 1,
        imageId: 'p1',
        extraImageIds: ['p2'],
      },
      pages,
      [],
    )

    expect(await exportBackup()).toBe(true)
    const file = shareOrDownloadFile.mock.calls[0][0] as File

    // A different device: empty storage, same file.
    resetFakeIndexedDB()
    const freshDb = await import('./db')
    const { validateBackup, commitBackup } = await import('./backup')
    const plan = await validateBackup(file)
    expect(plan.images).toHaveLength(2)
    await commitBackup(plan)

    for (const page of pages) {
      const restored = await freshDb.getImage(page.id)
      expect(restored, page.id).toBeDefined()
      expect(restored!.blob.type).toBe('image/jpeg')
      expect(new Uint8Array(await restored!.blob.arrayBuffer())).toEqual(new Uint8Array(await page.blob.arrayBuffer()))
    }
    expect(await freshDb.getExpense('e1')).toMatchObject({ imageId: 'p1', extraImageIds: ['p2'] })
  })
})
