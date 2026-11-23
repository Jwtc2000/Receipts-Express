import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * scripts/copy-tesseract-assets.mjs copies only the cores tesseract.js can
 * ask for with an LSTM-only worker. That is a narrowing, and the failure it
 * risks is the one the script's own comment describes: the one file the app
 * requests is the one not copied, and every scan silently falls back to
 * manual entry. So the names are read out of tesseract.js's own loader, not
 * written down here, and each must be in what the script produced.
 */
describe('Tesseract asset copy', () => {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const script = join(root, 'scripts/copy-tesseract-assets.mjs')
  let dest = ''

  beforeAll(() => {
    dest = mkdtempSync(join(tmpdir(), 'tesseract-assets-'))
    execFileSync(process.execPath, [script, dest], { stdio: 'pipe' })
  })

  afterAll(() => {
    rmSync(dest, { recursive: true, force: true })
  })

  it('copies every core an LSTM-only worker can request', () => {
    const loader = readFileSync(join(root, 'node_modules/tesseract.js/src/worker-script/browser/getCore.js'), 'utf8')
    // The file name each LSTM-only branch of the loader asks for, whatever it
    // is called: not only names ending in -lstm, which is the copy filter's
    // own assumption and so cannot be what checks it.
    const requested = [
      ...new Set(
        [...loader.matchAll(/lstmOnly\)\s*\{\s*corePathImportFile\s*=\s*`[^`]*\/([\w.-]+\.js)`/g)].map((m) => m[1]),
      ),
    ]
    // Guards the scan: the loader names three LSTM builds today.
    expect(requested.length).toBe(3)
    const copied = readdirSync(dest)
    for (const name of requested) expect(copied, name).toContain(name)
  })

  it('copies no core the app cannot load', () => {
    const cores = readdirSync(dest).filter((f) => f.startsWith('tesseract-core'))
    for (const name of cores) expect(name).toMatch(/-lstm\.wasm\.js$/)
  })

  it('still copies the worker, the language data and the licence files', () => {
    const copied = readdirSync(dest)
    for (const name of ['worker.min.js', 'worker.min.js.LICENSE.txt', 'eng.traineddata.gz', 'LICENSE-tesseract-core.txt']) {
      expect(copied, name).toContain(name)
    }
  })
})
