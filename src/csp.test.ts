import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { build } from 'vite'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// The four standalone pages copied out of docs/ by copyStaticDocsPlugin.
const DOC_PAGES = [
  'pilot-deck.html',
  'privacy.html',
  'terms.html',
  'consumer-health-data.html',
] as const

/**
 * The content of a page's Content-Security-Policy <meta> tag, or null.
 *
 * Assertions must go through this rather than searching the whole page. The
 * privacy policy quotes `connect-src 'self'` in its own prose, explaining to
 * the reader what the app does — so a page-wide match for that directive
 * passes whether or not the tag was ever injected, which is the exact failure
 * this test exists to catch.
 */
function cspMeta(html: string): string | null {
  const tag = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"\s*\/?>/i.exec(html)
  return tag ? tag[1].replace(/&#39;/g, "'") : null
}

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
  it.each(DOC_PAGES)('copies docs/%s into the build output', (page) => {
    expect(existsSync(join(outDir, 'docs', page))).toBe(true)
  })

  /*
   * cspPlugin's transformIndexHtml only reaches index.html, so until
   * copyStaticDocsPlugin started injecting one, these four shipped with no
   * policy at all — leaving the privacy policy and the terms, the two
   * documents a reader has the most reason to trust, as the only unprotected
   * pages in the deployment. Nothing about that was visible: the pages
   * rendered correctly and the build was green.
   *
   * The docs policy is derived from the app's CSP rather than copied, and it
   * is deliberately not identical — style-src gains 'unsafe-inline' because
   * every one of these pages carries its stylesheet in a <style> block, and
   * the deck's inline script is admitted by a sha256 hash recomputed each
   * build. So this asserts the directives that must never be relaxed, not
   * byte-equality with the app's policy, which would fail the moment either
   * side legitimately moves.
   */
  it.each(DOC_PAGES)('injects a CSP into the copy of docs/%s', (page) => {
    const csp = cspMeta(readFileSync(join(outDir, 'docs', page), 'utf-8'))
    expect(csp, `docs/${page} shipped without a Content-Security-Policy`).not.toBeNull()
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("connect-src 'self'")
    expect(csp).toContain("form-action 'self'")
    expect(csp).toContain("base-uri 'self'")
  })

  // The docs/ pages are excluded from the install-time precache, so without a
  // runtime rule they were never cached at all and the Terms and Privacy links
  // in the first-run gate simply failed offline — in the one mode the app tells
  // people it works in. The route is what makes them readable there, and it is
  // invisible in the source: it only exists in the generated worker.
  it('registers a runtime cache route for the docs/ pages', () => {
    const sw = readFileSync(join(outDir, 'sw.js'), 'utf-8')
    expect(sw).toContain('registerRoute(/\\/docs\\//')
    expect(sw).toContain('docs-pages')
  })
})
