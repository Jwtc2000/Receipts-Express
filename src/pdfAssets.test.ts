import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * What scripts/copy-pdfjs-assets.mjs puts under pdfjs/, asserted against the
 * files it actually writes.
 *
 * The script is run for real, into a scratch directory, because the thing
 * being protected is a statement about the output: THIRD_PARTY_NOTICES.md
 * says the Liberation Sans fonts that pdfjs-dist carries are not distributed,
 * and it lists a licence file for everything under pdfjs/ that is. Those four
 * fonts are under GPL v2 with exceptions, so "not distributed" has to stay
 * true for the notices to be right.
 *
 * The copy is a recursive one with an exclusion pattern. A pattern like that
 * fails silently in both directions: upstream renames a file and it stops
 * matching, or upstream adds a font and it ships without anyone having read
 * its licence. The second test is for the second case.
 *
 * The destination is not empty when the script runs. `public/pdfjs` on a
 * machine that has built before still holds whatever an earlier copy put
 * there, and a recursive copy adds and overwrites but never deletes, so the
 * script clears `standard_fonts` first. Starting from an empty directory would
 * leave that step untested: the excluded files would be absent whether or not
 * anything removed them.
 */
describe('PDF.js asset copy', () => {
  const script = fileURLToPath(new URL('../scripts/copy-pdfjs-assets.mjs', import.meta.url))
  let dest = ''

  const LEFT_BY_AN_EARLIER_COPY = [
    'LiberationSans-Regular.ttf',
    'LiberationSans-Bold.ttf',
    'LiberationSans-Italic.ttf',
    'LiberationSans-BoldItalic.ttf',
    'LICENSE_LIBERATION',
  ]

  const allFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? allFiles(join(dir, entry.name)) : [join(dir, entry.name)],
    )

  beforeAll(() => {
    dest = mkdtempSync(join(tmpdir(), 'pdfjs-assets-'))
    mkdirSync(join(dest, 'standard_fonts'))
    for (const name of LEFT_BY_AN_EARLIER_COPY) {
      writeFileSync(join(dest, 'standard_fonts', name), 'left by an earlier copy')
    }
    execFileSync(process.execPath, [script, dest], { stdio: 'pipe' })
  })

  afterAll(() => {
    rmSync(dest, { recursive: true, force: true })
  })

  it('copies no Liberation font and no Liberation licence file', () => {
    const files = allFiles(dest)
    // Guards the scan itself: an empty or misdirected copy would pass the
    // assertion below without having looked at anything.
    expect(files.length).toBeGreaterThan(100)
    expect(files.filter((f) => /liberation/i.test(f))).toEqual([])
  })

  it('copies only the Foxit fonts and their licence into standard_fonts', () => {
    const fonts = readdirSync(join(dest, 'standard_fonts'))
    expect(fonts).toContain('LICENSE_FOXIT')
    // Symbol and ZapfDingbats are the two PDF.js fetches as font data even
    // when it is allowed to use the device's own fonts.
    expect(fonts).toContain('FoxitSymbol.pfb')
    expect(fonts).toContain('FoxitDingbats.pfb')
    for (const name of fonts) {
      expect(name, `${name} is not covered by LICENSE_FOXIT`).toMatch(/^(Foxit.+\.pfb|LICENSE_FOXIT)$/)
    }
  })

  it('still copies the worker and the other licence files', () => {
    for (const file of [
      'pdf.worker.min.mjs',
      'cmaps/LICENSE',
      'iccs/LICENSE',
      'wasm/LICENSE_JBIG2',
      'wasm/LICENSE_OPENJPEG',
      'wasm/LICENSE_QCMS',
      'wasm/LICENSE_QUICKJS',
    ]) {
      expect(existsSync(join(dest, file)), `${file} should be copied`).toBe(true)
    }
  })
})
