import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { build } from 'vite'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
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

  // With the worker installed, a navigation to one of the shipped licence
  // files was answered with the app shell. They must be left to the network.
  it('does not answer a navigation to the licence and notice files with the app', () => {
    const sw = readFileSync(join(outDir, 'sw.js'), 'utf-8')
    const denylist = /denylist:\s*\[([^\]]*)\]/.exec(sw)?.[1] ?? ''
    const patterns = [...denylist.matchAll(/\/((?:\\\/|[^/])+)\/[a-z]*/g)].map((m) => new RegExp(m[1]))
    expect(patterns.length).toBeGreaterThan(0)
    // Workbox matches the path and the query string together.
    for (const path of [
      '/Receipts-Express/LICENSE.txt',
      '/Receipts-Express/THIRD_PARTY_NOTICES.md',
      '/Receipts-Express/LICENSE.txt?v=2',
    ]) {
      expect(patterns.some((re) => re.test(path)), path).toBe(true)
    }
  })

  /*
   * What is in the install-time precache, asserted against the worker that was
   * actually generated rather than against the config that was meant to produce
   * it. Everything here is downloaded by every user before the app will run
   * once, so anything that lands in it by accident is paid for on every install
   * and every worker update.
   *
   * This exists because the config drifted and nothing noticed. `globIgnores`
   * named one chunk as `assets/html2canvas.esm-*.js`; a Vite major changed the
   * emitted name to `assets/html2canvas-<hash>.js`, the pattern quietly stopped
   * matching, and 195 KB of code with no reachable call path rejoined the
   * precache. The build stayed green and all 333 tests stayed green, because
   * every one of them tested the source and none of them read the artifact.
   *
   * The excluded set is not arbitrary. The OCR engine and language data are
   * ~22 MB and are fetched on first scan; the PDF worker likewise; the webfonts
   * style only the standalone docs pages; the docs pages themselves are read
   * rarely. All four are runtime-cached instead. The unreachable chunks are
   * jsPDF's optional .html() renderer and its dependencies, which this app
   * never calls.
   */
  it('precaches the app shell and nothing that should be fetched on demand', () => {
    const sw = readFileSync(join(outDir, 'sw.js'), 'utf-8')
    // Both key spellings: workbox emits `url:"x"` when the worker is minified
    // and `"url": "x"` when it is not, and which one you get depends on the
    // build. Matching only the minified form silently yields an empty list —
    // which is why the length assertion below is not redundant. A precache
    // test that scans nothing passes every time.
    const urls = [...sw.matchAll(/"?url"?\s*:\s*"([^"]+)"/g)].map((m) => m[1])
    expect(urls.length).toBeGreaterThan(0)

    for (const url of urls) {
      expect(url, `${url} must not be precached`).not.toMatch(
        /\.woff2$|^tesseract\/|^pdfjs\/|^docs\/|html2canvas|purify|index\.es-/i,
      )
    }

    // And the things that must be there, so this can't pass by precaching
    // nothing at all.
    expect(urls).toContain('index.html')
    expect(urls.some((u) => /^assets\/index-.*\.js$/.test(u))).toBe(true)
    expect(urls.some((u) => /^assets\/index-.*\.css$/.test(u))).toBe(true)
  })

  /*
   * Third-party licence headers, asserted against the chunks that were actually
   * emitted. THIRD_PARTY_NOTICES.md describes these headers as shipping inside
   * the chunks they cover, and MIT and BSD-3-Clause condition their grants on
   * the notice travelling with the code.
   *
   * This exists for the same reason as the precache test above. A Vite major
   * stopped keeping licence comments, every chunk shipped without one, and the
   * notices went on saying otherwise for three months while the build and the
   * suite stayed green. One option in vite.config.ts (`comments.legal`) keeps
   * them now, and reading the config would only prove the option is spelled
   * the way it is today. Reading the artifact proves the headers are there.
   *
   * The strings are the ones the notices file quotes. If a dependency update
   * changes one of them, this fails, and that is the prompt to recompile the
   * notices rather than a reason to loosen the assertion.
   */
  it('keeps third-party licence headers in the emitted chunks', () => {
    const assets = join(outDir, 'assets')
    const chunk = (pattern: RegExp) => {
      const names = readdirSync(assets).filter((f) => pattern.test(f))
      expect(names, `exactly one chunk matching ${pattern}`).toHaveLength(1)
      return readFileSync(join(assets, names[0]), 'utf-8')
    }

    // The precached main bundle: React's own headers.
    const main = chunk(/^index-.*\.js$/)
    expect(main).toContain('@license React')
    expect(main).toContain('Copyright (c) Meta Platforms, Inc. and affiliates.')

    // The precached jsPDF chunk: jsPDF's banner, and the BSD-3-Clause text of
    // the Adobe JPEG encoder it vendors, whose second clause is the one that
    // requires a binary redistribution to reproduce it.
    const jspdf = chunk(/^jspdf\.es\.min-.*\.js$/)
    expect(jspdf).toContain('James Hall')
    expect(jspdf).toContain('Copyright (c) 2008, Adobe Systems Incorporated')
    expect(jspdf).toContain('Redistributions in binary form must reproduce the above copyright')
    expect(jspdf).toContain('Joseph Myers does not specify a particular license for his work.')

    // The served-but-unreachable .html() chunks: DOMPurify's header, on which
    // the Apache-2.0 election in the notices rests, and tslib's banner in both
    // of the bundles that vendor it.
    expect(chunk(/^purify\.es-.*\.js$/)).toContain('(c) Cure53 and other contributors')
    expect(chunk(/^html2canvas-.*\.js$/)).toContain('Copyright (c) Microsoft Corporation.')
    expect(chunk(/^index\.es-.*\.js$/)).toContain('Copyright (c) Microsoft Corporation.')
  })
})
