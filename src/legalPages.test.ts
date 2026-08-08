import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// The legal pages are standalone HTML under docs/ rather than app screens, so
// nothing in the React tree covers them. These tests guard the two properties
// that would quietly rot: that the pages keep making the claims the app sends
// users there to read, and that they stay self-contained.
const LEGAL_PAGES = ['privacy.html', 'terms.html', 'consumer-health-data.html'] as const

// The pilot deck isn't a legal page, but it is linked from inside the app and
// it used to load Google Fonts — the exact regression the self-hosting work
// removed. Held to the no-external-subresource rule for that reason alone.
const ALL_DOC_PAGES = [...LEGAL_PAGES, 'pilot-deck.html'] as const

function read(page: string): string {
  return readFileSync(fileURLToPath(new URL(`../docs/${page}`, import.meta.url)), 'utf-8')
}

/**
 * Same source, with runs of whitespace collapsed to a single space.
 *
 * Assertions about *wording* should use this. The raw text carries the source
 * line breaks and indentation, so a phrase that happens to straddle a wrap —
 * "cross-context behavioral\n        advertising" — fails a regex written with
 * a single space, and reflowing a paragraph then breaks a test that has
 * nothing to do with layout. Assertions about *markup* still use read().
 */
function readProse(page: string): string {
  return read(page).replace(/\s+/g, ' ')
}

describe('legal pages', () => {
  it.each(LEGAL_PAGES)('%s is a complete standalone document', (page) => {
    const html = read(page)
    expect(html).toMatch(/^<!DOCTYPE html>/)
    expect(html).toMatch(/<html lang="en">/)
    expect(html).toMatch(/<\/html>\s*$/)
    expect(html).toMatch(/<title>Receipts Express — /)
  })

  // A privacy policy that itself reaches out to a third party would
  // contradict its own central claim, and these pages are served outside the
  // app's <meta> CSP (which only covers index.html), so nothing else would
  // stop it. Fonts are same-origin under /fonts/, so they pass.
  it.each(ALL_DOC_PAGES)('%s loads no external subresource', (page) => {
    const html = read(page)

    // Any src=/href= pointing off-origin, minus plain <a> links, which are
    // navigation the user chooses rather than something the page fetches.
    const withoutAnchors = html.replace(/<a\b[^>]*>/g, '')
    expect(withoutAnchors).not.toMatch(/(?:src|href)\s*=\s*["'](?:https?:)?\/\//i)

    expect(html).not.toMatch(/@import/i)
    expect(html).not.toMatch(/fonts\.googleapis|fonts\.gstatic/i)
    // Every url() in CSS — @font-face included — must be a relative path.
    for (const [, url] of html.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)) {
      expect(url).not.toMatch(/^(?:https?:)?\/\//)
    }
  })

  it.each(LEGAL_PAGES)('%s carries no script tag', (page) => {
    expect(read(page)).not.toMatch(/<script/i)
  })

  it.each(LEGAL_PAGES)('%s points at the GitHub issues contact, not an email', (page) => {
    const html = read(page)
    expect(html).toContain('https://github.com/Jwtc2000/Receipts-Express/issues')
    expect(html).not.toMatch(/[\w.]+@[\w.]+\.\w+/)
  })

  it('the privacy policy and terms cross-link to each other', () => {
    expect(read('privacy.html')).toContain('./terms.html')
    expect(read('terms.html')).toContain('./privacy.html')
  })

  // Each claim below was verified against the source. If the app ever gains an
  // account, analytics, or a network call, the matching claim has to be
  // revisited rather than left standing — that is what this test is for.
  it('the privacy policy states what the app does and does not do', () => {
    const prose = readProse('privacy.html')
    expect(prose).toContain('best-receipts')
    expect(prose).toMatch(/no sign-up, sign-in, password, or email/i)
    expect(prose).toMatch(/no cookies/i)
    expect(prose).toMatch(/GitHub Pages/)
    expect(prose).toMatch(/connect-src 'self'/)
  })

  // The policy enumerates the localStorage keys by name, so a new key that
  // isn't documented makes the page inaccurate. Keep this list in step with
  // the app: br.termsAccepted is written by src/terms.ts.
  it.each([
    'br.profile',
    'br.lastBackupAt',
    'br.backupWarningDismissedAt',
    'br.storageWarningDismissedAt',
    'br.termsAccepted',
  ])('the privacy policy documents the %s localStorage key', (key) => {
    expect(read('privacy.html')).toContain(key)
  })

  // The policy must not promise protections the code doesn't implement:
  // there is no crypto layer over IndexedDB and no global erase control.
  it('the privacy policy claims neither encryption nor a delete-all button', () => {
    const html = read('privacy.html')
    expect(html).toMatch(/not<\/strong> separately encrypted|not\s+separately encrypted/i)
    expect(html).toMatch(/no<\/em> single "delete all data" button|no single "delete all data" button/i)
    expect(html).not.toMatch(/end-to-end encrypt/i)
  })

  it('the privacy policy makes the affirmative no-sale and tracking-signal statements', () => {
    const prose = readProse('privacy.html')
    expect(prose).toMatch(/does not sell, share, rent, trade/i)
    expect(prose).toMatch(/cross-context behavioral advertising/i)
    expect(prose).toMatch(/Global Privacy Control/i)
  })

  it('the terms carry the disclaimer, license, and as-is wording', () => {
    const prose = readProse('terms.html')
    expect(prose).toMatch(/no affiliation with, endorsement from, or approval by/i)
    expect(prose).toMatch(/Apache License 2\.0/)
    expect(prose).toMatch(/&quot;as is&quot;|"as is"/i)
    expect(prose).toMatch(/not liable for any damages/i)
  })

  // These are the clauses that make the terms protective rather than merely
  // descriptive. Each one was absent before and is easy to lose in an edit.
  it('the terms carry the protective clauses', () => {
    const prose = readProse('terms.html')
    expect(prose).toMatch(/laws of the (?:<strong>)?State of Washington/i)
    expect(prose).toMatch(/US\$100/)
    expect(prose).toMatch(/indemnify and hold harmless/i)
    expect(prose).toMatch(/small claims/i)
    expect(prose).toMatch(/Severability/i)
    // The CPA cannot be waived by contract, so the carve-out has to stay.
    expect(prose).toMatch(/Washington Consumer Protection Act, chapter 19\.86 RCW/)
    // Substantiation disclaimer — the app's whole output looks like an IRS
    // record package, so this is the claim most worth disclaiming.
    expect(prose).toMatch(/Internal Revenue Service/i)
  })

  // RCW 62A.1-201(b)(10) makes conspicuousness a question of whether a
  // reasonable person ought to have noticed the term. Bold alone in running
  // prose is the weak case these two sections used to be.
  it('the warranty and liability sections are set off conspicuously', () => {
    const html = read('terms.html')
    expect(html).toMatch(/class="legal-box"/)
    expect((html.match(/class="legal-box"/g) ?? []).length).toBeGreaterThanOrEqual(2)
    expect(html).toMatch(/class="caps"/)
  })

  // The Washington AG reads RCW 19.373.020(1)(b) to require a separate and
  // distinct link to a policy that carries only MHMD-required content.
  it('the consumer health data policy stands alone and answers the MHMD disclosures', () => {
    const prose = readProse('consumer-health-data.html')
    expect(prose).toMatch(/Consumer Health Data Privacy Policy/)
    expect(prose).toMatch(/Categories of consumer health data collected/i)
    expect(prose).toMatch(/Categories of sources/i)
    expect(prose).toMatch(/Third parties and affiliates/i)
    expect(prose).toMatch(/does not sell consumer health data/i)
    expect(prose).toMatch(/geofence/i)
    expect(prose).toMatch(/atg\.wa\.gov/)
    // Must not drift into general terms/privacy content.
    expect(prose).not.toMatch(/limitation of liability/i)
    expect(prose).not.toMatch(/governing law/i)
  })

  it('the app links to all three legal pages from the About drawer', () => {
    const list = readFileSync(
      fileURLToPath(new URL('./components/ReportList.tsx', import.meta.url)),
      'utf-8',
    )
    for (const page of LEGAL_PAGES) {
      expect(list).toContain(`./docs/${page}`)
    }
  })
})
