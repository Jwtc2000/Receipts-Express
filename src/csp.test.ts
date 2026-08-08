import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { build } from 'vite'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// One production build shared by every assertion below — a Vite build is slow
// enough that a second one per test would dominate the suite's runtime.
describe('production build', () => {
  let outDir = ''

  beforeAll(async () => {
    outDir = mkdtempSync(join(tmpdir(), 'csp-build-'))
    await build({ logLevel: 'silent', build: { outDir, emptyOutDir: true } })
  }, 60_000)

  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true })
  })

  it('injects a CSP with connect-src \'self\'', () => {
    const html = readFileSync(join(outDir, 'index.html'), 'utf-8').replace(/&#39;/g, "'")
    expect(html).toMatch(/<meta\s+http-equiv="Content-Security-Policy"/)
    expect(html).toMatch(/connect-src 'self'/)
  })

  // The standalone pages under docs/ are linked from the app's About drawer
  // but aren't part of the app bundle, so only copyStaticDocsPlugin puts them
  // in the output. Without it the links 404 in production — and the privacy
  // policy is the one page that must never be unreachable.
  it.each(['pilot-deck.html', 'privacy.html', 'terms.html'])(
    'copies docs/%s into the build output',
    (page) => {
      expect(existsSync(join(outDir, 'docs', page))).toBe(true)
    },
  )
})
