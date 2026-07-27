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

This last point is not just a policy promise — it's enforced by a
[Content-Security-Policy](./vite.config.ts) restricting `connect-src` to
`'self'`, injected into every production build, so the browser itself
blocks any script (including a compromised dependency) from making a
network request anywhere else.

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
