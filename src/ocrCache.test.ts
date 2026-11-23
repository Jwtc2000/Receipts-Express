import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetFakeIndexedDB } from './test/idb-reset'
import { TESSERACT_DIR } from './engineDirs'

vi.mock('tesseract.js', () => ({ createWorker: vi.fn() }))

/**
 * tesseract.js keeps the unpacked English model in idb-keyval's default
 * database. Before 1.17.0 its key was "./eng.traineddata" whatever the
 * version, which both kept a new model from ever being fetched and left the
 * old ~22 MB copy on the device for good.
 */
const CURRENT = `${TESSERACT_DIR}/eng.traineddata`

function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('keyval-store')
    req.onupgradeneeded = () => req.result.createObjectStore('keyval')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function seed(entries: Record<string, string>) {
  const db = await openStore()
  const tx = db.transaction('keyval', 'readwrite')
  for (const [k, v] of Object.entries(entries)) tx.objectStore('keyval').put(v, k)
  await new Promise((resolve) => (tx.oncomplete = resolve))
  db.close()
}

async function keys(): Promise<IDBValidKey[]> {
  const db = await openStore()
  const req = db.transaction('keyval').objectStore('keyval').getAllKeys()
  const result = await new Promise<IDBValidKey[]>((resolve) => (req.onsuccess = () => resolve(req.result)))
  db.close()
  return result.sort()
}

beforeEach(() => resetFakeIndexedDB())

describe('forgetOldModelCopies', () => {
  it('deletes the old unversioned copy and keeps the one in use and anything else', async () => {
    await seed({ './eng.traineddata': 'old model', [CURRENT]: 'new model', 'other-key': 'x' })
    const { forgetOldModelCopies } = await import('./ocr')
    await forgetOldModelCopies(CURRENT)
    expect(await keys()).toEqual([CURRENT, 'other-key'].sort())
  })

  it('deletes a copy left by an earlier versioned directory', async () => {
    await seed({ 'tesseract/1.0.0-1.0.0-1.0.0-int/eng.traineddata': 'older', [CURRENT]: 'new' })
    const { forgetOldModelCopies } = await import('./ocr')
    await forgetOldModelCopies(CURRENT)
    expect(await keys()).toEqual([CURRENT])
  })

  it('does not create the database on a device that has never scanned', async () => {
    const { forgetOldModelCopies } = await import('./ocr')
    await forgetOldModelCopies(CURRENT)
    expect((await indexedDB.databases()).map((d) => d.name)).not.toContain('keyval-store')
  })
})
