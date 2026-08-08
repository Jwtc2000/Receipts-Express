import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// The privacy policy and terms pages are standalone HTML under docs/ rather
// than app screens, so nothing in the React tree covers them. These tests
// guard the two properties that would quietly rot: that the pages keep making
// the claims the app's About drawer sends users there to read, and that they
// stay self-contained.
const PAGES = ['privacy.html', 'terms.html'] as const

function read(page: string): string {
  return readFileSync(fileURLToPath(new URL(`../docs/${page}`, import.meta.url)), 'utf-8')
}

describe('legal pages', () => {
  it.each(PAGES)('%s is a complete standalone document', (page) => {
    const html = read(page)
    expect(html).toMatch(/^<!DOCTYPE html>/)
    expect(html).toMatch(/<html lang="en">/)
    expect(html).toMatch(/<\/html>\s*$/)
    expect(html).toMatch(/<title>Receipts Express — /)
  })

  // A privacy policy that itself reaches out to a third-party CDN would
  // contradict its own central claim, and the pages are served outside the
  // app's <meta> CSP (which only covers index.html), so nothing else would
  // stop it. docs/pilot-deck.html does load Google Fonts — these must not.
  it.each(PAGES)('%s loads no external subresource', (page) => {
    const html = read(page)

    // Any src=/href= pointing off-origin, minus plain <a> links, which are
    // navigation the user chooses rather than something the page fetches.
    const withoutAnchors = html.replace(/<a\b[^>]*>/g, '')
    expect(withoutAnchors).not.toMatch(/(?:src|href)\s*=\s*["'](?:https?:)?\/\//i)

    expect(html).not.toMatch(/@import/i)
    expect(html).not.toMatch(/fonts\.googleapis|fonts\.gstatic|cdn\./i)
    // No <script> at all: these pages are prose and need none.
    expect(html).not.toMatch(/<script/i)
  })

  it.each(PAGES)('%s points at the GitHub issues contact, not an email', (page) => {
    const html = read(page)
    expect(html).toContain('https://github.com/Jwtc2000/Receipts-Express/issues')
    expect(html).not.toMatch(/[\w.]+@[\w.]+\.\w+/)
  })

  it.each(PAGES)('%s cross-links to the other policy', (page) => {
    const other = page === 'privacy.html' ? 'terms.html' : 'privacy.html'
    expect(read(page)).toContain(`./${other}`)
  })

  // Each bullet below is a claim the audit of the source verified. If the app
  // ever gains an account, analytics, or a network call, the matching claim
  // has to be revisited rather than left standing.
  it('the privacy policy states what the app does and does not do', () => {
    const html = read('privacy.html')
    expect(html).toContain('best-receipts')
    for (const key of [
      'br.profile',
      'br.lastBackupAt',
      'br.backupWarningDismissedAt',
      'br.storageWarningDismissedAt',
    ]) {
      expect(html).toContain(key)
    }
    expect(html).toMatch(/no sign-up, sign-in, password, or email/i)
    expect(html).toMatch(/no cookies/i)
    expect(html).toMatch(/GitHub Pages/)
    expect(html).toMatch(/connect-src 'self'/)
  })

  // The policy must not promise protections the code doesn't implement:
  // there is no crypto layer over IndexedDB and no global erase control.
  it('the privacy policy claims neither encryption nor a delete-all button', () => {
    const html = read('privacy.html')
    expect(html).toMatch(/not<\/strong> separately encrypted|not\s+separately encrypted/i)
    expect(html).toMatch(/no<\/em> single "delete all data" button|no single "delete all data" button/i)
    expect(html).not.toMatch(/end-to-end encrypt/i)
  })

  it('the terms carry the disclaimer, licence, and as-is wording', () => {
    const html = read('terms.html')
    expect(html).toMatch(/no affiliation with, endorsement from, or approval by/i)
    expect(html).toMatch(/Apache License 2\.0/)
    expect(html).toMatch(/&quot;as is&quot;|"as is"/i)
    expect(html).toMatch(/not liable for any damages/i)
  })
})
