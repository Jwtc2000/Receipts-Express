import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { TERMS_VERSION } from './terms'

// The legal pages are standalone HTML under docs/ rather than app screens, so
// nothing in the React tree covers them. These tests guard the two properties
// that would quietly rot: that the pages keep making the claims the app sends
// users there to read, and that they stay self-contained.
const LEGAL_PAGES = ['privacy.html', 'terms.html', 'consumer-health-data.html'] as const

// The pilot deck isn't a legal page, but it is linked from inside the app and
// it used to load Google Fonts — the exact regression the self-hosting work
// removed. Held to the no-external-subresource rule for that reason alone.
const ALL_DOC_PAGES = [...LEGAL_PAGES, 'pilot-deck.html'] as const

function readRepo(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf-8')
}

function read(page: string): string {
  return readRepo(`docs/${page}`)
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
  return readRepo(`docs/${page}`).replace(/\s+/g, ' ')
}

function readRepoProse(path: string): string {
  return readRepo(path).replace(/\s+/g, ' ')
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
  // contradict its own central claim. copyStaticDocsPlugin now injects a
  // derived CSP as each page is copied, so the deployed copies would refuse
  // the request — but that turns the mistake into a page that renders wrong in
  // production, which is a worse way to find out than a failing test, and the
  // source files are what a reader inspects when deciding whether to believe
  // the policy. Fonts are same-origin under /fonts/, so they pass.
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

  // Applies to the deck as well as the three legal pages. A published address
  // that nobody reads is worse than no address: it invites a notice, a rights
  // request, or a security report that then goes unanswered, and the pages
  // themselves promise a response. The issues tracker is the one channel that
  // actually reaches the author, so it has to be the only one offered.
  it.each(ALL_DOC_PAGES)('%s points at the GitHub issues contact, not an email', (page) => {
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
  //
  // Read through readProse, not read(). Both sentences below sit in wrapped
  // paragraphs, so on the raw source they pass or fail on where the author's
  // editor happened to break the line — reflowing the paragraph would have
  // failed a test that has nothing to do with layout. The tag-inclusive
  // alternatives are kept because the emphasis is doing real work here: it is
  // the negation that is emphasised, and losing it inverts the sentence at a
  // glance.
  it('the privacy policy claims neither encryption nor a delete-all button', () => {
    const prose = readProse('privacy.html')
    expect(prose).toMatch(/not<\/strong> separately encrypted|not\s+separately encrypted/i)
    expect(prose).toMatch(
      /no<\/em> single "delete all data" button|no single "delete all data" button/i,
    )
    expect(prose).not.toMatch(/end-to-end encrypt/i)
  })

  /*
   * A published page must not describe behaviour the code does not have. That
   * is the whole rule, and it is worth a test because the failure is silent:
   * the code changes, the prose does not, and a page that was accurate when it
   * was written quietly becomes a false description of the product.
   *
   * These files are the ones that make claims to a reader deciding whether to
   * trust the app and have no other test coverage: the four docs/ pages are
   * static HTML outside the React tree, and the markdown is read straight off
   * GitHub by people who never run the app at all. Each phrase below was
   * actually present in one of them and had to be removed. This test is what
   * stops one coming back.
   *
   * The three markdown files under docs/ were added after a second audit found
   * them unguarded, which is how they came to disagree with the pages they
   * duplicate: PILOT_DECK.md is the text twin of pilot-deck.html, PILOT.md is
   * what a reader is handed with it, and governance/REVIEW.md is the
   * self-assessment the deck cites. All three make the same claims as the
   * pages above, to the same audience, with the same consequences if wrong.
   */
  const CLAIM_CHECKED_FILES = [
    ...ALL_DOC_PAGES.map((page) => `docs/${page}`),
    'docs/PILOT.md',
    'docs/PILOT_DECK.md',
    'docs/governance/REVIEW.md',
    'README.md',
    'SECURITY.md',
  ]

  const UNSUPPORTABLE_CLAIMS: readonly RegExp[] = [
    /completely secure/i,
    /100% secure/i,
    // Was said of the CSP. It blocks a specific set of request types; it does
    // not block navigation, and it is not delivered as a header here at all.
    /blocks all/i,
    /cannot exfiltrate/i,
    // Bounded rather than `.*`: these files are matched with whitespace
    // collapsed, so an unbounded gap would span the whole document and fail on
    // an "ensures" in one paragraph and a "compliance" in another. A real
    // claim of this shape fits well inside a sentence.
    /ensures .{0,120}compliance/i,
    /fully compliant/i,
    /prevents any network exfiltration/i,
  ]

  it.each(CLAIM_CHECKED_FILES)('%s makes no unsupportable claim about the app', (path) => {
    // Whitespace-collapsed, so a claim that happens to straddle a line wrap is
    // caught. Nothing here should ever need a wrap-tolerant spelling.
    const prose = readRepoProse(path)
    for (const claim of UNSUPPORTABLE_CLAIMS) {
      expect(prose).not.toMatch(claim)
    }
  })

  /*
   * docs/pilot-deck.html and docs/PILOT_DECK.md are the same deck kept twice —
   * one to present, one to read on GitHub — and nothing has ever held the two
   * together. The last correction pass fixed the storage card, the offline
   * badge and the restore claim in one of them and left the other still saying
   * the old thing, and that single fact is where most of the second audit's
   * findings came from. Not a claim anyone was defending: a claim nobody
   * noticed was still there.
   *
   * So the twins are checked as a pair, on the claims that actually cost
   * something if they are wrong. Each phrase banned below was on one of these
   * slides and had to come off; each sentence required below is the correction
   * that replaced it. A deck carrying one half of that trade is the failure
   * this test exists to catch.
   */
  describe('the pilot deck twins', () => {
    const DECK_TWINS = ['docs/pilot-deck.html', 'docs/PILOT_DECK.md']

    /**
     * Deck text with HTML comments removed, then whitespace collapsed.
     *
     * The deck keeps the reason for each correction in a comment beside it —
     * the storage card still carries "Was a padlock beside the words 'Secure
     * Storage'", which is the record of a claim being withdrawn, not the claim.
     * What a reader is told is the visible text, so that is what these
     * assertions read. The banned-phrase test above still reads the raw file,
     * so nothing is hidden by commenting it out.
     */
    function deckClaims(path: string): string {
      return readRepo(path)
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/\s+/g, ' ')
    }

    // "Secure Storage", under a padlock, implied encryption that does not
    // exist — IndexedDB is written in the clear. "Seamlessly merge" described a
    // restore that overwrites by ID and can destroy newer edits. Both were
    // removed from one deck first and the other second.
    it.each(DECK_TWINS)('%s makes no withdrawn storage or restore claim', (path) => {
      const claims = deckClaims(path)
      expect(claims).not.toMatch(/secure storage/i)
      expect(claims).not.toMatch(/seamlessly merge/i)
      for (const claim of UNSUPPORTABLE_CLAIMS) {
        expect(claims).not.toMatch(claim)
      }
    })

    // "Offline-First" alone reads as "works offline", which is not true of a
    // first run: the OCR and PDF engines are not in the install-time precache
    // and are fetched from the app's own origin the first time they are used.
    // The badge is allowed only on a slide that says so.
    it.each(DECK_TWINS)('%s does not leave its offline-first badge unqualified', (path) => {
      const claims = deckClaims(path)
      if (!/offline.first/i.test(claims)) return
      expect(claims).toMatch(
        /OCR and PDF engines are fetched from the app.s own origin the first time you use them/i,
      )
    })

    // The one limitation a pilot user will actually meet, and the one most
    // easily dropped from a slide for being inconvenient. Both halves matter:
    // what the browser does, and that installing the app does not settle it.
    it.each(DECK_TWINS)('%s carries the Safari eviction sentence', (path) => {
      const claims = deckClaims(path)
      expect(claims).toMatch(
        /Safari clears a site.s data after about a week without a visit, unless the browser has granted the app durable storage/i,
      )
      expect(claims).toMatch(
        /Installing the app to the Home Screen makes that grant likelier but does not assure it/i,
      )
    })

    // The deck is shown to colleagues at an employer the project is not
    // connected to. The disclaimer is the whole reason that is safe to do, and
    // it has to be on the deck itself, not only in the README it links to.
    it.each(DECK_TWINS)('%s carries the non-affiliation disclaimer', (path) => {
      expect(deckClaims(path)).toMatch(/no affiliation with, endorsement from, or approval by/i)
    })

    // The replacement for "seamlessly merge". Banning the old wording without
    // requiring the new one would be satisfied by a deck that says nothing
    // about what restore does to existing data, which is how the claim got
    // overstated in the first place.
    it.each(DECK_TWINS)('%s says restore overwrites rather than merges', (path) => {
      expect(deckClaims(path)).toMatch(/Restore is not a merge/i)
    })
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

  // The small-claims carve-out used to name section 13, which is Privacy. The
  // sentence read as if it were preserving a right while pointing at the wrong
  // clause, and nothing caught it, because 13 and 14 are both plausible
  // numbers to a reader skimming. Inserting or removing a section anywhere
  // above 14 reintroduces the same bug silently.
  //
  // So the number is not written down here. It is read out of the heading that
  // actually carries "Governing law and venue" and compared with the number the
  // clause cites — the test knows the relationship, not the value.
  it('the small-claims clause cites the governing-law section by its real number', () => {
    const pattern = /<h2><span class="num">(\d+)\.<\/span>\s*Governing law and venue<\/h2>/
    const heading = pattern.exec(read('terms.html'))
    expect(heading, 'terms.html has no "Governing law and venue" heading').not.toBeNull()

    const prose = readProse('terms.html')
    expect(prose).toContain('Small claims stay available.')
    const cited = /small claims court[^.]*?section (\d+)\./i.exec(prose)
    expect(cited, 'the small-claims clause no longer cites a section by number').not.toBeNull()
    expect(cited![1]).toBe(heading![1])
  })

  // The single most consequential thing the terms say, because it is the one
  // limitation a user will actually meet: the browser can throw their receipts
  // away. Both statements are load-bearing and each sits in a different
  // section, so an edit to one leaves the other looking authoritative on its
  // own. Section 5 sets the expectation, section 8 disclaims the warranty.
  it('the terms disclaim data loss in both places', () => {
    const prose = readProse('terms.html')
    expect(prose).toContain(
      'Data loss from browser storage being cleared or evicted is an expected limitation, not a defect.',
    )
    expect(prose).toContain('your browser or device can delete them permanently, without warning')
  })

  // The one concrete, checkable number in either page. It is the sentence that
  // turns "browser storage is not permanent" from a lawyerly hedge into
  // something a user can act on, and it is also the claim most likely to be
  // dropped as an inconvenient detail.
  it('the privacy policy names the iOS eviction window', () => {
    const prose = readProse('privacy.html')
    expect(prose).toContain('Safari may clear it after roughly seven days without a visit')
    expect(prose).toMatch(/no server copy\s+to restore from|no server copy to restore from/i)
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

  // The Terms fold the Privacy Policy in by reference, so §13 is where a reader
  // goes looking for what happens to their data. The My Health My Data notice
  // has to be reachable from there too — it is published separately because the
  // Act requires it to stand alone, which makes it easy to orphan.
  it('the terms link the consumer health data notice', () => {
    expect(read('terms.html')).toContain('./consumer-health-data.html')
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

  // The About drawer is browsewrap — the user has to go looking. The first-run
  // gate is the only place assent is actually taken, so it is the only place
  // the agreement can form, and a document that isn't linked from it was never
  // presented. All three have to be reachable at that moment, not later.
  it('the first-run gate links all three legal pages', () => {
    const gate = readRepo('src/components/FirstRunNotice.tsx')
    for (const page of LEGAL_PAGES) {
      expect(gate).toContain(`href="./docs/${page}"`)
    }
  })

  /*
   * src/terms.ts records the version the user accepted and re-prompts when it
   * stops matching TERMS_VERSION. The pages carry their own "Last updated"
   * date. Nothing connected the two, so the failure mode was silent in the
   * worst direction: amend a page, update the date at the top of it, leave
   * TERMS_VERSION alone, and every existing user goes on holding an acceptance
   * of text they were never shown — which is exactly the evidentiary record
   * the gate exists to produce.
   *
   * Tying them means a material edit cannot be published without either moving
   * TERMS_VERSION (which re-prompts everyone) or deliberately failing this
   * test. The date is derived from TERMS_VERSION rather than written out, so
   * there is one value to change and this test follows it.
   */
  it.each(['terms.html', 'privacy.html'])(
    '%s is dated to match TERMS_VERSION',
    (page) => {
      const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December',
      ]
      const [year, month, day] = TERMS_VERSION.split('-').map(Number)
      expect(months[month - 1], `TERMS_VERSION is not an ISO date: ${TERMS_VERSION}`).toBeDefined()
      const written = `${day} ${months[month - 1]} ${year}`

      expect(readProse(page)).toContain(`Last updated ${written}`)
    },
  )
})
