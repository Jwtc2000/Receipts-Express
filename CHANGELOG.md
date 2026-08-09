# Changelog

All notable changes to this project are documented here.

Versioning follows [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`):
bump `MAJOR` for breaking changes to stored data or backup format, `MINOR` for new
user-facing features, and `PATCH` for fixes with no visible feature change. The
version lives in `package.json` and is shown in the app under Menu → About. Every
merge to `main` that changes app behavior gets a version bump and a tag.

## [1.13.0] - 2026-08-08

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

## [1.12.0] - 2026-08-06

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
  audit, `~/full-repo-audit.md`, not already covered by 1.10.1): added
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
- Confirmed bugs from a full repository audit (`~/full-repo-audit.md`), in
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
