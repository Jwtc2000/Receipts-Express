# Changelog

All notable changes to this project are documented here.

Versioning follows [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`):
bump `MAJOR` for breaking changes to stored data or backup format, `MINOR` for new
user-facing features, and `PATCH` for fixes with no visible feature change. The
version lives in `package.json` and is shown in the app under Menu → About. Every
merge to `main` that changes app behavior gets a version bump and a tag.

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
