# Security Policy

## Data classification

Receipts scanned into this app contain **real personal and financial data**
(merchant names, purchase dates, itemized amounts, and the receipt images
themselves). This is not public or synthetic data, and it is treated
accordingly:

- **All processing happens in-browser.** OCR runs against a self-hosted
  copy of Tesseract.js — the engine, WASM core, and language data are
  served from this app's own origin, never a CDN. PDF receipts (single- or
  multi-page) are rasterized the same way, against a self-hosted copy of
  PDF.js — worker, WASM codecs, standard fonts, and color profiles are all
  served from this app's own origin as well.
- **Storage is exclusively on-device IndexedDB.** Nothing is written to
  a server or a third-party service.
- **Export is exclusively a local PDF** (or CSV), generated in-browser and
  handed to the browser's own download/share mechanism. There is no
  upload step.
- **The sole network access this app makes is loading the app itself**
  from GitHub Pages. No analytics, no telemetry, no third-party requests
  of any kind.

That last point is backed by more than a policy promise. The deployed app
carries a [Content-Security-Policy](./vite.config.ts) that restricts
fetch, XMLHttpRequest, WebSocket, EventSource and beacon requests to the
app's own origin, and blocks form submissions to other origins. It is
delivered in a `<meta>` tag, because GitHub Pages cannot send custom
response headers, so it does not govern top-level navigation — a
compromised dependency could still navigate the page elsewhere. It is a
strong control, not an absolute one.
[`src/csp.test.ts`](./src/csp.test.ts) runs a real production build and
asserts the policy is present in the output, so it cannot quietly go
missing without the test suite failing.

**Known limitation: no clickjacking defense.** The CSP is delivered via a
`<meta>` tag, since GitHub Pages (this app's static host) has no mechanism
to send custom HTTP response headers. Per spec, `frame-ancestors` is
ignored entirely when a CSP arrives via `<meta>` rather than a header — so
this app cannot embed a working clickjacking defense as currently hosted,
and nothing in `vite.config.ts` claims otherwise. Practical impact is low:
the app has no login, session, or server-side action to trick a user into
triggering from within an iframe — all data is local to the device. Closing
this gap for real would require moving to a host that can set response
headers (e.g. Cloudflare Pages, an edge proxy in front of GitHub Pages).

**Known limitation: the service worker is outside the CSP.** A worker gets
its policy from the HTTP response headers of its own script, not from the
document that registered it — and GitHub Pages sends no such headers. The
`<meta>` CSP therefore covers the document and nothing else: the generated
service worker (`sw.js`, from `vite-plugin-pwa`) runs with no CSP at all,
and so do the self-hosted OCR and PDF workers, which are loaded the same
way. What that code does is precache the app shell and cache the OCR/PDF
engines from this app's own origin — but that is a property of the code
as written, not something the browser is enforcing on it. The `<meta>` CSP
does still decide whether those workers may be created (`worker-src 'self'
blob:`); it just has no say over what they do afterwards. The fix is the
same as for `frame-ancestors`: a host that can set response headers.

**Disclosure: two unused CDN URLs inside the vendored OCR worker.** The
"never a CDN" claim above is about what the app does, not about every
string in the shipped bytes. `public/tesseract/worker.min.js` contains two
`https://cdn.jsdelivr.net/...` URLs — tesseract.js's own built-in defaults
for where to fetch its WASM core and its language data — and a third of
the same kind, the default worker script URL, is compiled into the app
bundle from tesseract.js's entry point. All three are overridden at
`src/ocr.ts:20-22`, which passes explicit `workerPath`, `corePath` and
`langPath` pointing at this app's own origin; the library spreads the
caller's options over its defaults, and the two inside the worker are read
as `corePath || <default>` and `langPath || <default>`, so with values
supplied the defaults are never evaluated and the URLs are never
requested. They are dead strings rather than live endpoints. They are
recorded here because they are in the deployed files, and anyone grepping
the build for `jsdelivr` deserves to find this note rather than a
surprise.

## Durability note

Receipts Express is a **capture-and-export tool, not an archive**. Data
lives in your browser's IndexedDB, which the browser (or you) can clear —
there is no cloud backup. Export your PDF/CSV promptly once a report is
complete rather than relying on the app as long-term storage. On iOS in
particular, installing the app to your home screen (rather than using it
as a regular Safari tab) gives the browser a stronger signal to treat its
storage as persistent and less likely to be evicted under storage
pressure — use the in-app "Back up now" export as a second line of
defense regardless.

## Reporting a vulnerability

If you find a security issue, please report it privately via
[GitHub Security Advisories](https://github.com/Jwtc2000/Receipts-Express/security/advisories/new)
for this repository rather than opening a public issue. I'll acknowledge
reports as promptly as I can and credit you in the fix, if you'd like.
