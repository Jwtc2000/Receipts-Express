# Changelog

All notable changes to this project are documented here.

Versioning follows [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`):
bump `MAJOR` for breaking changes to stored data or backup format, `MINOR` for new
user-facing features, and `PATCH` for fixes with no visible feature change. The
version lives in `package.json` and is shown in the app under Menu → About. Every
merge to `main` that changes app behavior gets a version bump and a tag.

## [1.23.1] - 2026-11-23

### Fixed
- Restore takes every backup an earlier version wrote. It used to refuse a
  whole file over one value that an earlier version had let someone save,
  and backups made today from records saved back then were refused the same
  way. Now restored:
  - a refund saved as a negative amount before 1.13.0, as it was saved;
  - an exchange rate for a currency typed as something other than three
    letters, such as "€", "EU" or "C$";
  - a date whose year was typed as two digits in Chrome, which stores it as
    0026, or with five or six digits;
  - text longer than 2,000 characters, typed before 1.13.0 capped it;
  - an amount typed as "1e999" before 1.13.0, which a backup holds as null
    and now restores as 0.
- An expense whose report is not in the backup is left out of a restore
  instead of making the whole file fail. Exports before 1.16.0 could carry
  one, saved by a second tab into a report the first had just deleted.
- The restore prompt says how many expenses will be left out and how many
  amounts come back as 0. Receipt pages no restored expense points at are no
  longer written.
- A date saved with a year typed as two digits was shown, and counted, as
  1926. A date with a year outside 1900 to 2099 is now shown as it is stored,
  so the mistake can be seen, and a trip start like that no longer labels the
  days "Day 36526": they are numbered in order instead, until it is corrected.
- A refund saved as a negative amount before 1.13.0 can be edited and saved
  again while its amount is left alone. Its personal amount stays between the
  refund and zero.

### Changed
- The currency field takes a three-letter code, such as USD, EUR or GBP.
- A date typed into an expense, a new report or the report menu needs a year
  between 1900 and 2099. Chrome's date field keeps a year typed as two digits
  as 0026, and takes years of up to six digits.
- On an expense saved earlier, a currency or date that would now be refused
  keeps saving while its field is left alone. In the report menu, such a trip
  date shows the message, and the meal allowance beside it still saves.
- A backup from each version that changed what a backup can hold is kept in
  `src/test/fixtures/backups/`, and the tests restore every one, so a later
  change cannot start refusing them again. A record with every field set is
  backed up and restored, and a new field fails the type check until it is
  added there and to a new backup file.
- The figures on one invented report are pinned exactly: totals, the USD
  conversion, personal amounts, meal allowance balances, day labels, the CSV
  and the PDF summary. A change that moves one has to update the pin.
- `CLAUDE.md` sets out the rules for changes that touch stored data, backups
  or report figures, and the code review follows them.

## [1.23.0] - 2026-11-23

### Added
- A holiday look, on by the device's date with no setting, and gone again
  after 6 January. From 15 to 30 November a harvest palette: rust and
  cranberry header, leaves, acorns and pumpkins drifting across it, and
  "Happy Thanksgiving" at the top of the reports screen. From 1 December to
  6 January a winter one: evergreen header, snow falling behind trees,
  gifts, stars and ornaments, and "Happy holidays". Both hang a string of
  lights along the header and recolour buttons, amounts, day banners and
  the background. All drawings are original. Every colour pairing is held
  to WCAG AA by a test that reads styles.css. Exported PDFs keep the
  everyday colours, and the decorations are hidden under reduced motion.

### Changed
- Wider than a phone, the header, the search bar and a report's summary
  bar run the full width of the window, with their contents in line with
  the column, instead of a 640px header floating on an empty page.
- Delete buttons are grey until pointed at or focused, when they turn red.
  Red trash cans beside every amount made the riskiest control the loudest
  thing on the screen; every delete still asks first.
- Receipt thumbnails have an edge, so a white receipt shows on a white
  card, and the search field's focus ring is rounded like the others.

## [1.22.0] - 2026-11-23

### Changed
- A page text recognition is unsure of, and that the dot-joined copy does
  not read clearly better, is read once more from a straightened, enlarged
  (text lines to about 30 pixels, at most 4 times and 6 megapixels) and
  de-grained copy, and that reading is used if it reads at least half as
  much again with confidence. A field the reading used leaves empty is
  filled from the first reading, so no field the scan used to find is lost.
- In Chrome, on 60 degraded synthetic receipts (blur, noise, small text,
  tilt), merchants went from 50 right to 58, dates from 51 to 58 and totals
  from 47 to 57; on 60 more generated after the rules were set, from 53 to
  57, 53 to 56 and 52 to 57. Clean, European, dot-matrix and real receipts
  gave the same results as before. The further reading costs about 2
  seconds more on desktop for a large photo the engine is unsure of (2 of
  14 real receipts), and much less for small images.
- The straightened copy is sized to the rotated image, so a tilted long
  receipt does not lose its corners.
- The Terms and privacy pages are fetched from the network whenever there is
  one, and from the offline copy only without a connection. Served from the
  offline copy first, someone returning after an amendment could open the
  earlier text from the acceptance prompt while "I Agree" recorded the new
  version. They stay in the same offline cache, so copies stored before the
  update are still there offline.
- The Privacy Policy lists the straightened copy alongside the other
  in-memory copies. It and the Terms are dated "23 November 2026 (revision
  4)", and existing users are asked to accept again once.

## [1.21.0] - 2026-11-23

### Changed
- The total is checked against subtotal plus tax and against the card
  payment line. A total that agrees is taken as read. When none agrees, the
  total line is also tried with the decimal point OCR lost restored ("TOTAL
  20238" for 202.38) and with a "$" read as a digit removed ("49.91" for
  $9.91), and a reading that agrees is used. Otherwise the printed total
  stands, so a tip or a fee that makes it larger than subtotal plus tax is
  kept, and a larger total printed after one that agrees ("Total 32.40",
  "Tip 6.00", "Grand Total 38.40") wins. Several tax lines are added up, or
  a "Total Tax" line is used when there is one; "Taxable amount" is not
  tax.
- A tax rate ("Tax 8.25%") is never read as money, and cash handed over or
  change given is never taken for the total. "TOTAL" misread as "T0TAL",
  "TOTAI" or "TOTAS" is still a total line. With no total line, subtotal
  plus tax is used, or the card payment when there is one.
- In Chrome, on receipts these rules were not written from: clean synthetic
  receipts went from 33 to 39 right totals of 40, degraded ones from 46 to
  52 of 60, and dot-matrix ones stayed at 33 of 40. No total that was right
  before became wrong on any of the eight test sets, and merchants and dates
  did not change.

## [1.20.0] - 2026-11-23

### Changed
- Dot-matrix receipts, and thermal print too faint to form solid strokes,
  are read much better. When text recognition is unsure of a page (average
  confidence under 70), the page is read a second time from a copy with the
  dots joined into strokes, and that reading is used if it reads at least
  half as much again with confidence. On 40 synthetic dot-matrix receipts in
  Chrome, the merchant went from 5 right to 17, the date from 4 to 19 and the
  total from 4 to 28. On 120 synthetic receipts with solid print nothing
  changed, and on 14 real receipts the one printed in dots gained its total
  and nothing else changed. A page read with confidence is not read twice;
  the rest take one more recognition, about a second.
- A line giving a chain's town and store number ("Millbrook | #4410"), a
  city line whose state and ZIP OCR has mangled, and a street line whose
  house number was trimmed off as noise are no longer taken for the
  merchant.
- The Privacy Policy describes the dot-joined copy alongside the dark-band
  one: both exist only in memory for the scan. It and the Terms are dated
  "23 November 2026 (revision 3)", and existing users are asked to accept
  again once.

## [1.19.0] - 2026-11-23

### Changed
- A PDF that carries its own text, such as an emailed or downloaded invoice,
  is read from that text instead of by text recognition of a picture of its
  first page. The merchant, date and total come out exactly as printed, from
  every page rather than only the first, in a fraction of a second, and
  without first downloading the recognition model. The banner says "Details
  read from the PDF" when this happens. Runs of text that touch are joined
  without a space, so a number the PDF draws in two pieces stays one number.
- A scanned PDF, which is only pictures of pages, a PDF with some pages that
  are only pictures, and a PDF whose text looks broken (fonts with no
  Unicode map) are still read with text recognition. Text recognition now
  goes on to the next page of a scanned PDF while it has not found a line
  labelled as the total, up to five pages, instead of reading only page 1.
- The merchant is picked with more care. A line the recognition engine is
  unsure of (a photo's table or background read as letters) is passed over,
  and so are addresses, phone numbers, dates, till fields ("Server:",
  "Check #6") and lines such as "Receipt" or "Order Summary". A name given as
  "receipt for ...", "Thank you for choosing ..." or an email's sender is
  used when there is one, and a footer name above the street address when
  the header has none. When no line looks like a name the field is left
  empty instead of filled with the wrong text. On 14 real receipts the
  merchant went from 1 right to 10 right; of the other four, one had a
  letter misread and three were left empty, their name being only a logo or
  not printed at all. On 120 synthetic receipts nothing changed.
- The date is the earliest one on the receipt, so a hotel folio or rental
  invoice gives the arrival or pickup day rather than the day it was
  printed. A date written "Mar14,2026" or "Mar 2nd, 2026" is read.
- Light text on a dark band, such as the date in a coffee app's receipt
  header, is inverted before recognition so it is read; a dark-mode
  screenshot, which the engine already handles, is left as it is.
- The Privacy Policy says that a PDF's own text is read, that the inverted
  copy of an image exists only in memory, and that the full text of a
  receipt is discarded however it was read. The Terms say that reading a
  PDF's text can also pick the wrong figure. Both are dated "23 November
  2026 (revision 2)", and existing users are asked to accept again once;
  `TERMS_VERSION` takes a ".N" suffix for a second change on the same day.

## [1.18.0] - 2026-11-23

### Changed
- The travel icons drifting across the header are redrawn as outline icons
  (plane, coffee, fuel pump, car, bed) in the same style as the app's
  buttons. They are moved with transforms, which is cheaper on phones, and
  fade in and out at the edges instead of being cut off.
- Icon buttons are at least 44 px square, and show a hover background on
  devices with a pointer.
- Keyboard focus shows a visible ring on every control, white on the header
  and the floating button.
- The New Report and Add Expense buttons use a plus icon instead of a typed
  "+".

### Fixed
- An expense dated before the trip's first day showed a negative day number
  (for example "Day -254") in the report and the PDF. It now reads
  "Pre-trip".

## [1.17.0] - 2026-11-23

### Changed
- The English text-recognition model is the integerised LSTM-only one:
  2.9 MB to download instead of 10.9 MB, and about 5 MB stored on the device
  instead of about 22 MB. The part removed is data for Tesseract's legacy
  engine, which the app's engine cannot use; on 40 test receipts both models
  read the same merchant, date and total.
- The stored model's key now includes the engine version, so a future model
  is fetched instead of the stored copy being reused, and old copies are
  deleted after the first scan.
- The Privacy Policy describes the smaller stored model, and its "Last
  updated" date moves to 23 November 2026, as its section 13 promises for
  any change in data handling. The Terms carry the same date, since both are
  accepted together. Existing users are asked to accept again once.

## [1.16.1] - 2026-11-23

### Changed
- The PDF.js worker is started from a `blob:` wrapper, so it runs under the
  app's Content-Security-Policy instead of with none; a request to another
  origin from inside it is now refused. If a browser cannot start it that
  way, the app falls back to starting it as before, without the policy.
  Nothing visible changes.
- The app's policy adds `object-src 'none'` and `frame-src 'none'`. The
  policy for the standalone pages under `docs/` drops the grants only the app
  needs: WebAssembly, workers, and `blob:`/`data:` images.

## [1.16.0] - 2026-11-23

The rest of the project audit's findings, in five pull requests (#81 to #85).

### Added
- A message with Reload and "Back up now" when a screen fails to render,
  instead of a blank page.
- The restore prompt says how many receipt pages the backup file is missing.

### Changed
- Only the three OCR engine builds the app can load are shipped, and the
  PDF engine's unused QuickJS is left out: about 33 MB less per deploy.
- Primary buttons are filled teal by default, so the consent gate's
  "I Agree" and the update banner's Refresh are visible on white. Form
  fields have visible borders and the installed app is no longer locked to
  portrait.
- The update banner checks for a new version every hour in a long-running
  session, and is announced to screen readers.
- Restore keeps only the fields the app knows, and refuses negative
  amounts, impossible dates, duplicate ids, files from a newer version and
  files too large to be a backup.
- Delete prompts say that receipts go too and cannot be recovered.
- SECURITY.md, the README, the pilot deck and the governance review now
  match what the code does.

### Fixed
- OCR: dotted phone and reference numbers, words containing a month name,
  impossible days and future dates are no longer taken as the receipt date;
  a "0.00" keyword line is no longer the total; accented and short merchant
  names (Café, H&M, BP) are kept.
- A failed second photo pick left the scan spinner stuck.
- A PDF reader that failed to load was reported as a corrupt PDF.
- An expense saved with amount 0 reopened with an empty amount.
- Transparent images were stored on black.
- Spending exactly the meal allowance could show as over.
- Restoring a backup could strand or, with shared page ids, remove receipt
  pages.
- A failed or dropped database connection broke every later save until a
  reload.
- If the share sheet refused a finished export, it failed instead of
  downloading.
- Long titles ran into the amount on PDF receipt pages, and notes were cut
  at three lines without a mark.
- Drawer edits were lost when the drawer was closed with Escape, and two
  report settings saved together could undo each other.
- Refresh in one tab reloaded other tabs past their unsaved-work check, and
  edits made after agreeing to reload could be lost without a prompt.
- The error message blamed storage for every failure.
- With the service worker installed, LICENSE.txt and the notices opened as
  the app instead of the file.

## [1.15.0] - 2026-11-22

Everything merged since 1.14.0, which went out over three months without a
version of its own. The dependency upgrades came first and the rest follows
from an audit of the whole project.

### Added
- A "Later" control on the update banner, which hides it for the session.
  The banner also sits clear of the "+ New Report" / "+ Add Expense" button
  now; on a phone it used to cover it completely.

### Changed
- React 19.2 → 19.3, pdfjs-dist 6.2 → 6.5 and idb 8.0.4, with Vitest 4 → 5,
  jsdom 30 → 31 and `vite-plugin-pwa` 1.3 → 2.0 on the development side, and
  the overrides that clear the advisories then open against the lockfile.
- The OCR and PDF engines are served from directories named for their
  package versions, and their caches no longer expire after 30 days. An
  upgrade is now a new URL, and scanning keeps working offline for as long
  as the files stay cached.
- The Liberation Sans fonts that PDF.js carries as its Helvetica fallback
  are no longer shipped. Their licence file upstream turned out to be GPL v2
  with exceptions. A PDF that uses Helvetica without embedding it, on a
  device with no similar font of its own, is drawn in the browser's
  sans-serif.
- Third-party licence headers are kept in the built JavaScript again. The
  Vite 8 build had been dropping all of them.
- `THIRD_PARTY_NOTICES.md` is recompiled against what is installed, and its
  list of unresolved items goes from ten to one. The texts for the libraries
  linked into the OCR engine are now reproduced, read from upstream at the
  versions that ship; three of those libraries had not been listed at all.
- The restore prompt says when the saved profile will be replaced.
- The storage warning is at the top of the page, where it can be seen
  without scrolling to the end.
- CI: the Jenkins pipeline scans a pull request's history for secrets,
  checks commit identities and has a timeout; the agent image's downloads
  are checksum-verified; the test job also runs daily.

### Fixed
- PDF import failed after the PDF.js upgrade for anyone whose device had
  cached the previous engine, and the app blamed the file. This is what the
  versioned engine directories are for.
- OCR dropped the leading digits of amounts of 1,000 or more printed
  without a thousands separator: 1234.56 was read as 234.56.
- A scan that finished late overwrote an amount, date or merchant typed
  while it ran, and replacing the photo on a saved expense overwrote its
  saved values.
- Moving an expense up within its own day gave it the previous day's date.
- The exported PDF corrupted any line containing a character outside
  Windows-1252, such as a rupee or won sign. Those currency symbols are now
  written as ISO codes; other characters the built-in font cannot draw show
  as "?".
- A day with meals in more than one currency had them added together as
  one number against the allowance.
- One expense left behind by a report deleted in another tab made every
  backup from that device impossible to restore. Backups also now leave out
  images that nothing references.
- A library too large for one backup file failed with "Backup failed". It
  is now refused with an explanation, and a file too large to read is no
  longer reported as invalid JSON.

## [1.14.0] - 2026-08-09

### Added
- A "Back to Receipts Express" control on all four standalone pages —
  the Privacy Policy, Terms of Use, Consumer Health Data Privacy Policy
  and the pilot deck. The legal pages carry it in the header and again
  at the foot, since a reader who has scrolled a long document should
  not have to scroll back to leave; the deck carries it in its fixed
  footer and as a corner button visible on every slide. These pages are
  reached from search and from direct links as well as from the app, and
  until now a reader landing on one had no path to the product. The link
  is relative (`../`), so it resolves on GitHub Pages and on a local
  preview alike.

### Changed
- The app icon and favicon are now the header logo: the same receipt
  glyph, path data reused rather than redrawn, on the same teal-to-violet
  gradient. Previously the icon was a flat teal tile with a different
  receipt drawing, so the browser tab, the home-screen icon and the
  in-app header showed two different marks. The glyph is sized to sit
  inside the maskable safe zone, since the manifest declares the 512px
  icon maskable and Android may crop it to a circle; the apple-touch
  icon is generated square-cornered and fully opaque, because iOS
  composites transparency onto black and applies its own mask.

## [1.13.0] - 2026-08-09

### Added
- Privacy Policy and Terms of Use, published as standalone pages
  (`docs/privacy.html`, `docs/terms.html`) and linked from the app under
  Menu → About. The Privacy Policy states only what the code actually
  does — the IndexedDB stores and the five `br.*` localStorage keys by
  name, on-device OCR and PDF rasterization, no accounts/analytics/
  cookies/ads/payments, that the full OCR transcript is discarded rather
  than saved, and that GitHub Pages is the sole third party (seeing
  standard web request logs when the app is loaded). It also states the
  limits plainly: storage is not separately encrypted, and there is no
  single "delete all data" button, so full erasure is via the browser's
  clear-site-data.
- A one-time acknowledgment on first launch. Terms reachable only from a
  menu are browsewrap, which generally fails — the Ninth Circuit wants
  conspicuous notice *and* an unambiguous act of assent, so a warranty
  disclaimer nobody agreed to protects nobody. The notice sits directly
  above the button at full contrast, both policies are linked so they can
  be read first, and the button says "I Agree". The acknowledgment is
  recorded in `br.termsAccepted` with the terms version, and reappears
  only when `TERMS_VERSION` is bumped for a material change
  (`src/terms.ts`, `src/components/FirstRunNotice.tsx`).
- A Consumer Health Data Privacy Policy (`docs/consumer-health-data.html`)
  as a separate, distinctly-linked page. Washington's My Health My Data
  Act treats that link as its own requirement, and a scanned pharmacy
  receipt is the kind of thing it contemplates — even though nothing here
  ever leaves the device.
- Protective clauses the Terms previously lacked: governing law and venue
  (Washington), a liability cap that survives if the blanket exclusion is
  struck, indemnification, eligibility, acceptable use, a disclaimer that
  exports are not warranted to satisfy Internal Revenue Service
  substantiation or any employer's reimbursement policy, and the standard
  machinery (severability, entire agreement, survival, assignment,
  notices, trademark reservation). The warranty and liability sections are
  now set off in bordered boxes with uppercase leads, since
  RCW 62A.1-201(b)(10) turns on whether a reasonable person ought to have
  noticed the term.
- Affirmative "does not sell, share, rent, or trade" and Global Privacy
  Control statements in the Privacy Policy. Both were true before and
  implied throughout, but the statutory words appeared nowhere.
- A precache assertion in `src/csp.test.ts` that reads the generated
  service worker instead of the config meant to produce it. Everything in
  the install-time precache is downloaded by every user before the app
  runs once, and the `globIgnores` drift below is exactly what a
  source-reading test cannot see: the build stayed green and so did every
  test. It now asserts that the app shell is precached and that the
  webfonts, OCR engine, PDF worker, docs pages and unreachable chunks are
  not.

### Changed
- Inter and Outfit are now self-hosted from the app's own origin, and the
  pilot deck no longer loads them from Google's font CDN. That deck is
  linked from inside the app, so opening it sent every reader's IP to
  Google — quietly contradicting the "no third-party requests of any
  kind" claim in `SECURITY.md` and in the new privacy policy. Vendored by
  `scripts/copy-font-assets.mjs` into `public/fonts/` alongside each
  family's OFL notice, following the existing Tesseract/PDF.js pattern.
  Variable fonts, so two files cover the whole weight axis and the deck's
  `font-weight: 900` is real rather than synthesized.
- The fonts are excluded from the install-time precache (`globIgnores`)
  and cached at runtime instead, so the service worker doesn't grow for
  the majority of users who never open a docs page.
- `copyPilotDeckPlugin` is now `copyStaticDocsPlugin`, driven by a list
  of pages, so every standalone page under `docs/` reaches `dist/`. The
  existing `docs/**` entries in `globIgnores` and
  `navigateFallbackDenylist` already cover the new pages.
- Drawer links to those pages share a `.drawer-link` class instead of the
  inline style the pilot-deck link carried. The class also moves them off
  teal-400, which sat at roughly 1.8:1 against the white drawer panel and
  failed WCAG AA, onto the brand `--teal` at 5.4:1.

- The repository's Content-Security-Policy claims were rewritten to say
  what the policy does: it restricts fetch, XMLHttpRequest, WebSocket,
  EventSource and beacon requests to the app's own origin, and blocks
  form submissions to other origins. It is delivered in a `<meta>` tag
  because GitHub Pages cannot send custom response headers, so it does
  not govern top-level navigation. A strong control, not an absolute
  one. `README.md`, `SECURITY.md`, both pilot decks, `docs/privacy.html`
  and `docs/governance/REVIEW.md` had variously described it as stopping
  everything outgoing, asserted that a compromised dependency could not
  get receipts off the device, and called the live site secure without
  qualification. The sweep was not complete: the HTML pilot deck kept
  absolute claims its Markdown twin had already lost, which a re-audit
  caught.
- A denylist test (`src/legalPages.test.ts`) now fails the build if any
  of seven specific overstatements reappears. Its scope is narrower than
  "the repository" — it is the files listed in `CLAIM_CHECKED_FILES`,
  covering the four pages under `docs/`, the pilot and governance
  markdown, `README.md` and `SECURITY.md`. It also matches fixed
  phrasings rather than judging whether a claim is supportable, so an
  overstatement the audit did not already name passes it even in a file
  it covers.
- The pilot decks no longer publish an employer's internal filing
  deadline or record-retention target, no longer rank named consumer
  cloud services as a destination for confidential receipts, and now
  open by saying to use synthetic or personal receipts unless the
  organization has approved the tool. "Governance Snapshot" is now
  "Governance Self-Assessment", because nothing in it has been reviewed
  by anyone — which the repo's own `docs/PILOT.md` already said.
- The brand gradient moves from `#660099 → #ff6600` to
  `#0f766e → #6d28d9`. White on the old orange end computed 2.94:1 and
  failed WCAG AA; the new sweep clears it end to end — 5.47:1 at the
  teal end, its worst point, rising to 7.1:1 at the violet end — and the
  endpoints are colours already in the design system (the app icon's
  teal and the existing `--purple-dark`). Day banners interpolate
  between them, so they and the PDF export change too.
- Third-party attribution now ships: `THIRD_PARTY_NOTICES.md` at the
  repository root and in the build, and the two Tesseract licence
  sidecars the shipped worker already referenced but which the copy
  script never copied — a live 404.
- React 18 → 19, Tesseract.js 5 → 7, TypeScript 5 → 7 and Vite 6 → 8,
  with `@vitejs/plugin-react` 4 → 6 and `vite-plugin-pwa` 0.21 → 1.3.
  Nothing in the app looks or behaves differently — scanning, PDF export,
  backup and restore, and offline use are unchanged. The entries below are
  what it took to keep that true.
- `scripts/copy-tesseract-assets.mjs` now reads the `tesseract.js-core`
  package directory and copies every WASM core it finds, instead of the
  four names it listed by hand. Version 5 shipped exactly those four;
  version 7 ships six — adding the two relaxed-SIMD builds, which it
  prefers on Chromium — so a hardcoded list leaves the app asking for a
  core that was never copied: a 404 inside the OCR worker, every scan
  falling through to manual entry behind the "Couldn't read the receipt"
  banner, and no crash or console error to say so. The script also throws
  when it finds no cores at all, so a package restructure stops the build
  rather than shipping an app whose scanning quietly does nothing.
- The `globIgnores` patterns for the unreachable jsPDF chunks no longer
  spell out the bundler's chunk naming. They named
  `assets/html2canvas.esm-*.js`, and Vite 8 emits `html2canvas-<hash>.js`
  with no `.esm` — an exact pattern that stops matching puts 195 KB of
  code this app never calls back into the install-time download every user
  pays before the app runs once. The patterns are now loose about the
  suffix, and the generated manifest is what is actually checked.
- `useModal` lets its return type be inferred rather than naming it.
  React 18 types `useRef<T>(null)` as `RefObject<T>` and React 19 as
  `RefObject<T | null>`; writing either one pins the hook to a single
  React major.
- `THIRD_PARTY_NOTICES.md` is re-derived against what is now installed —
  six versions corrected and `is-electron` dropped, read back off the v7
  worker's source map.

### Fixed
- The Terms' licence section pointed at the wrong two section numbers for
  its own warranty and liability clauses, and subordinated them to
  Apache-2.0. The licence covers the *code*; these terms cover use of the
  *hosted app* — now stated as such.
- The Terms' small-claims clause preserved access to small claims
  "instead of the courts named in section 13". Section 13 is Privacy;
  the courts are named in section 14.
- A non-numeric `br.lastBackupAt` made `backupIsStale()` return false
  forever, silently disabling the stale-backup warning — `Number(raw)`
  yields `NaN`, and `Date.now() - NaN > STALE_AFTER_MS` is false. Both
  timestamp parses are now guarded with `Number.isFinite`.
- Restoring a backup overwrote same-ID records with no confirmation,
  including newer local data replaced by older backup data. Restore now
  validates first and asks, showing the report and expense counts, how
  many records would be replaced, and when the backup was taken.
- The first-run gate could be tabbed straight out of into the app
  behind, so a keyboard user could use the whole product without ever
  accepting the Terms — which is the entire point of the gate. Focus is
  now trapped, and everything behind it is `inert`.
- Keyboard users could not open a report or an expense at all: the only
  reachable control on a card was Delete. Cards are real buttons now,
  with Delete kept separate rather than nested inside them.
- The exported PDF — the only thing this app puts in front of someone
  who never accepted the Terms — now carries a line saying the amounts
  and dates are user-entered or machine-extracted and are not
  independently verified.
- The standalone pages under `docs/` shipped with no Content-Security-
  Policy at all; the build only injected it into `index.html`. They also
  weren't cached by the service worker, so the Terms and Privacy links
  in the first-run gate were dead offline.
- The CSV formula-injection guard covered some columns but not the date
  or category columns.

## [1.12.0] - 2026-08-08

### Added
- Multiple project numbers: save a list of the projects you charge to
  (Menu → Project Numbers, with one marked as the default) and charge
  each report to its own — picked when creating the report or later from
  the report's menu. The report's project number is what prints on its
  PDF summary page; reports without one fall back to the default. Saved
  project numbers are per-device (localStorage) like the rest of the
  profile; a report's project number travels with it in backups.

### Security
- Cleared the six advisories `osv-scanner` flags on the dependency tree
  (all pre-existing, none introduced by the project-numbers work):
  `pdfjs-dist` 6.1.200 → 6.2.108 (GHSA-hq66-cqwq-w95j), and pinned
  `dompurify` ≥3.4.13, `nanoid` ≥3.3.17 and `postcss` ≥8.5.23 via
  `overrides`, alongside refreshed `brace-expansion` (≥5.0.9) and
  `fast-uri` (≥3.1.5) pins. Each package resolves to a single copy in
  the tree, so the overrides don't fork any dependency onto an
  incompatible major.

## [1.11.1] - 2026-07-27

### Changed
- Replaced the main page's plain-text title and separate receipt/express-arrow
  icons with a single responsive stacked SVG logo (`LogoTitle.tsx`) — "Receipts"
  over "EXPRESS" — that scales to fit any screen width.

## [1.11.0] - 2026-07-27

### Added
- A FOREIGN→USD total conversion, using manually-entered exchange rates (no
  network calls are made to fetch one — this app makes none beyond loading
  itself). Set a rate per foreign currency at the top of the Report Menu
  drawer ("Total (USD)"); the converted total shows there and, once a
  report has any non-USD expense, as a "TOTAL (USD)" line on the PDF
  export's first page. A currency with no rate set is excluded from the
  total and called out explicitly rather than silently treated as 1:1.
- Currency entry was already unrestricted (free text, not a fixed list) —
  confirmed and left as-is, no code change needed.

## [1.10.2] - 2026-07-27

### Changed
- jsPDF is now loaded on demand (like PDF.js already was) instead of being
  bundled into every app launch — the main JS chunk drops from ~617KB to
  ~223KB raw for anyone who never exports a PDF that session.
- The PWA's mandatory install-time precache no longer includes jsPDF's
  unused optional `.html()`-renderer dependencies (html2canvas, DOMPurify,
  canvg's polyfill chunk) — code that could never execute, since this app
  never calls jsPDF's `.html()` method.
- Added `base-uri 'self'; form-action 'self'` to the CSP (meta-compatible,
  costs nothing for a single-page app with no external forms).

### Fixed
- Test suite honesty pass (remaining findings from the full repository
  audit (internal notes, not published), not already covered by 1.10.1): added
  jsdom + React Testing Library infrastructure, and closed every previously
  zero-coverage gap it named — `share.ts`'s success/failure branches,
  `pdf.ts`'s multi-page export/pagination logic, the `ExpenseEditor`
  save-image-argument computation (attach/replace/remove), `pdfReceipt.ts`'s
  page loop and page cap, `saveExpenseWithImage`'s failure branch,
  `backup.test.ts`'s `extraImageIds` round-trip, and two `ocr.ts` messy-text
  parsing gaps (a promotional-header line stealing the merchant slot;
  European comma-decimal/currency-symbol totals).

### Documentation
- README.md, SECURITY.md, docs/PILOT.md, docs/PILOT_DECK.md,
  docs/pilot-deck.html, and docs/governance/REVIEW.md now all mention the
  PDF-upload input path (previously undocumented — only PDF *export* was
  described).
- SECURITY.md documents a known structural limitation: no clickjacking
  defense is possible on the current GitHub Pages host, since
  `frame-ancestors` is ignored when a CSP is delivered via `<meta>` rather
  than a header.
- Fixed the README's CI table wording, a stale "Restore from file" button
  label in the pilot deck, and the PDF-export feature bullet's description
  of where multi-page receipt details are drawn.
- Documented the multi-page receipt page-removal scope gap (whole-receipt
  Remove only, no per-page control) as an intentional decision, not an
  oversight.

## [1.10.1] - 2026-07-27

### Fixed
- Confirmed bugs from a full repository audit (internal notes, not published), in
  priority order:
  - Picking a receipt (photo or PDF) now shows a "Processing file…" banner
    and disables Retake/Replace/Remove/capture/Save while the file is being
    rendered/compressed — previously that stretch had no feedback and was
    a window a second, faster pick could race into and corrupt.
  - Save is now guarded against double-submit (e.g. a fast double-tap)
    with a synchronous lock.
  - Save now refetches the expense's current image IDs immediately before
    computing which images are stale, narrowing (not eliminating) the
    window where a save from a second tab could orphan an image that a
    concurrent edit in another tab had just attached.
  - PDF receipts are now capped at 25 pages, with a clear error instead of
    rendering an unbounded document one page at a time with no way to
    cancel.
  - CSV export now neutralizes leading `=`, `+`, `-`, `@` characters in
    text fields, closing a formula/DDE-injection path when a report is
    opened in Excel/Sheets.
  - CSV export now includes the "Personal Amount" column — present in the
    data model and in PDF export, but silently missing from CSV.
  - An app update no longer reloads out from under an in-progress,
    unsaved expense; the update banner now confirms before discarding it.
  - Reordering expenses in a report now shows an error and reverts the
    list if the new order fails to save, instead of leaving the UI out of
    sync with what's actually stored.
  - The cached OCR/PDF engine files (tesseract.js, PDF.js) now expire
    after 30 days instead of indefinitely, matching the fix already
    shipped for the icon/shell cache.
  - `todayIso()` — used to default a new expense's date — read UTC date
    components, so it could show tomorrow's or yesterday's date for
    anyone outside UTC once local time crossed the UTC day boundary while
    still the same calendar day locally. It's now local-time-correct.
  - The new-expense date field is now computed once, correctly, via a
    lazy initializer instead of at module load — closing a related stale-
    date gap for a session left open across a day boundary.

## [1.10.0] - 2026-07-27

### Added
- Receipts can now be attached as a PDF instead of a photo, from the same
  "Choose photo or PDF" picker. Both single-page and multi-page PDFs are
  supported: each page is rasterized on-device (via a self-hosted PDF.js,
  loaded only when a PDF is actually picked) and stored the same way a
  photographed receipt is, so OCR, thumbnails and backup/restore all work
  unchanged. On-device OCR runs against the PDF's first page.
- The expense editor shows a "N pages" badge and a thumbnail strip for
  every page of a multi-page receipt.
- PDF report export now gives a multi-page receipt one full PDF page per
  source page (labeled "page N of M"), each scaled to fit without cropping;
  the expense's title/amount/notes are shown once, under the last page.

## [1.9.4] - 2026-07-20

### Fixed
- PDF export now goes through the same hardened share/download path as CSV
  export instead of calling jsPDF's `doc.save()` directly. `doc.save()` was
  fire-and-forget internally, so a blocked or failed download wouldn't
  reject and the export would look like it succeeded when nothing was
  saved — the exact "failed export reported as success" bug the 1.9.3
  data-loss hardening pass fixed for CSV but missed for PDF.

## [1.9.3] - 2026-07-20

### Fixed
- Data-loss hardening (top findings from the data-loss audit):
  - Saving an expense that fails (e.g. `QuotaExceededError` on a full
    device) now keeps the editor open and shows an error instead of
    silently looking like success.
  - The in-progress expense draft is now guarded: a `beforeunload`
    warning fires while it's dirty (tab close, refresh, service-worker
    reload) and the Back button confirms before discarding typed details
    and the captured photo.
  - A receipt photo that fails to compress/decode now shows an error and
    can be re-picked, instead of vanishing silently.
  - Failed PDF/CSV exports surface an error rather than looking identical
    to success. The download path no longer revokes the blob URL before
    the browser reads it (which could abort the download) and reports
    failure instead of an unconditional success.
  - A global unhandled-rejection toast surfaces otherwise-silent write
    failures as a last-resort safety net.
- Pilot slide deck on mobile (Safari/iOS): the page now scrolls so
  content taller than the screen is reachable (was locked by
  `overflow:hidden` + `100vh`), and the cover-slide animation fills the
  screen and re-fits on layout/orientation changes instead of sticking
  in a strip at the top.

### Added
- Eviction-aware storage warning: on a non-installed browser where
  durable storage isn't granted and the user has data, a banner explains
  the risk and prompts installing to the Home Screen and backing up.

## [1.9.2] - 2026-07-20

### Fixed
- About version wiring hardened into a single source of truth. The
  version already flowed from `package.json` via `__APP_VERSION__`; a
  vitest test now builds the app and asserts the exact `package.json`
  version lands in the output, so any future severing of that wire fails
  CI. The build also injects `__COMMIT_HASH__` (`git rev-parse --short
  HEAD`, falling back to `unknown`), shown as secondary text under the
  version in About so a stale deploy is identifiable at a glance.

## [1.9.1] - 2026-07-19

### Added
- Jenkins security pipeline: secrets scanning (gitleaks) and SAST
  (semgrep) on zero-privilege agent infrastructure, gating merges to
  `main` alongside GitHub Actions.
- Every GitHub Action pinned to a full commit SHA instead of a mutable
  tag, with Dependabot on a 7-day cooldown before proposing updates —
  the first pin-update round (checkout, setup-node, configure-pages,
  deploy-pages, upload-pages-artifact) merged and deployed clean.
- `persist-credentials: false` on both `checkout` steps — neither CI
  job performs an authenticated git operation after checkout, so the
  token is no longer written to disk at all.
- Branch protection on `main` requiring both CI systems (GitHub
  Actions `test` and Jenkins `continuous-integration/jenkins/pr-merge`)
  to pass, strict mode, enforced for admins.
- Apache-2.0 [LICENSE](./LICENSE).
- A Content-Security-Policy (`connect-src 'self'`, no network access
  beyond this app's own origin), injected into every production build
  and asserted by a vitest test against the actual build output.
- [SECURITY.md](./SECURITY.md) with accurate data classification —
  receipts are real personal/financial data, not public data.
- Rebuilt [README.md](./README.md): purpose, the problem this app
  addresses, and a verifiable security-posture summary.
- [docs/PILOT.md](./docs/PILOT.md): a pilot proposal for standardizing
  receipt-to-PDF capture for travel expense filing.

## [1.9.0] - 2026-07-18

### Added
- Creating a report now also asks for a daily meal allowance (optional),
  editable later from the report's sandwich menu alongside the trip
  dates.
- Each day banner now shows a food balance ("Food $30.00 used ·
  $20.00 left"), based on that day's Meals-category spending against
  the daily allowance — with a warning when a day goes over.
- Expenses can now have a "personal amount" — a portion of the total
  the employee is covering themselves rather than the company. It's
  excluded from the food-balance calculation and summarized in a new
  "Employee pays credit card company" line on the report and PDF
  summary.
- The PDF summary table has a new "Pay Back" column showing each
  expense's personal amount, and Meals-category rows now show a small
  custom burger icon (drawn with jsPDF's vector primitives, matching
  the existing no-receipt icon's style) next to the item line.

## [1.8.0] - 2026-07-18

### Added
- The app header now uses a purple-to-orange gradient (`#660099` →
  `#ff6600`).
- Each "Day N" banner now gets its own distinct color sampled along that
  same gradient (cycling every 6 days), instead of one fixed purple —
  identical between the in-app timeline and the PDF export, since both
  now share the same color logic (`src/colors.ts`). Text color (white or
  black) is chosen per banner via a WCAG contrast check, since white
  reads well against the purple end of the gradient but poorly against
  the orange end.

## [1.7.0] - 2026-07-18

### Added
- The "DAY N" banner now appears on every per-receipt page of the PDF
  export, not just the summary table.
- A "Remove" option next to Retake/Replace lets you delete a receipt
  photo from an expense entirely, instead of only being able to replace
  it with another photo.
- Expenses with no receipt photo now show a custom crossed-out-circle
  icon in the PDF export — a large one in place of the photo on that
  expense's own page, and a small one next to its row on the summary
  page.

### Fixed
- Saving an expense after removing its photo previously left the old
  image attached (the save logic only handled replacing an image, not
  clearing one) — removal is now a distinct, correctly-handled case.

## [1.6.0] - 2026-07-18

### Added
- Creating a report now asks for a trip start/end date (calendar picker),
  which anchors "Day 1" for that report's timeline and PDF export — Day N
  stays correct even if a day in the middle of the trip has no expenses.
- A menu (sandwich icon) on the report screen lets you view and change a
  report's trip dates at any time; all Day N labels update immediately.
- Expenses are now sorted by their date rather than by manual add/reorder
  order.
- Moving an expense up or down past the edge of its day now reassigns its
  date to the adjacent day, so the timeline and its date stay in sync.

### Fixed
- `nextPosition` assumed the expense list was sorted by position; now that
  it's sorted by date, it computes the actual highest position instead —
  otherwise two new expenses in the same report could have collided on
  the same position.

## [1.5.0] - 2026-07-18

### Added
- Multi-day trips now show a "Day 1", "Day 2", … divider bar in the
  report timeline, grouping expenses by calendar date (ranked
  chronologically regardless of manual reorder order) for easier
  visual scanning. The same Day N grouping now appears in the PDF
  export's summary table.

## [1.4.0] - 2026-07-18

### Added
- CSV export, alongside PDF: the "Export" button in a report now opens a
  menu to choose PDF or CSV. The CSV is a plain Date/Title/Merchant/
  Category/Amount/Currency/Notes table, one row per expense, that opens
  directly in Excel/Sheets/accounting tools.

## [1.3.0] - 2026-07-18

### Added
- A search box on the main reports screen finds expenses across every
  report by title, merchant, or amount, and jumps straight into the
  matching expense when tapped.
- A search box within a report filters that report's expense list the
  same way (title, merchant, amount), without changing the report's
  totals.

## [1.2.0] - 2026-07-18

### Added
- A Profile section in the menu (Name, Employee ID, Cost Center, Project
  Number) — all optional. Whatever's filled in now appears on the summary
  page of every PDF export; the layout is unchanged if nothing is set.

## [1.1.0] - 2026-07-18

### Added
- The app now shows its version number (Menu → About), sourced from `package.json`
  at build time — this changelog starts tracking releases from here on.

### Fixed
- Report/expense totals across mixed currencies were summed as raw numbers and
  labeled with whichever currency happened to be first; totals are now shown
  per currency, and currency codes that only differ by case (e.g. `USD`/`usd`)
  are merged instead of shown separately.
- Replacing a receipt photo deleted the old image before saving the new one;
  a failed write could lose the original permanently. The swap is now atomic.
- Backup restore wrote reports, expenses, and images one at a time and accepted
  arbitrary `dataUrl` values (including fetchable URLs), so a corrupt or hostile
  backup file could leave a partial restore, overwrite existing data, trigger
  outbound requests, or carry unbounded/malformed data. Restores are now fully
  validated (shape, embedded-image format, size limits, cross-referenced
  `reportId`s) before being committed in a single transaction.
- GitHub Pages deploys were triggered by pushes to a feature branch, not just
  `main`. Deploys are now limited to `main` (or an explicit manual run), gated
  behind a CI job that runs the type checker and test suite.
- Upgraded `jspdf` (`2.5.2` → `4.2.1`), clearing a critical CVE bundle and a
  transitive `dompurify` advisory.

### Added (internal)
- First automated test suite (Vitest): currency totals, OCR parsing, backup
  validation/atomicity, and atomic image replacement.

## [1.0.0] - 2026-07-18

Initial release: camera/photo receipt capture with on-device OCR (Tesseract.js),
multi-report expense organization with drag-to-reorder, one-tap PDF export,
local backup/restore, and installable offline PWA support. All data stored
on-device in IndexedDB — nothing leaves the device.
