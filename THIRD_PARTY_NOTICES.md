# Third-Party Notices — Receipts Express

Receipts Express 1.13.0. Compiled 2026-08-08 from the packages installed in `node_modules/`.

Receipts Express itself is licensed under the Apache License, Version 2.0, Copyright 2026
Jordan Campbell. That text ships to every user as `LICENSE.txt`. **This file is about other
people's code, not that.**

## 1. What this covers, and how it was checked

The app has no server, so the only software it distributes is the set of files a browser
downloads from the deployed site: the JavaScript under `assets/`, the OCR engine under
`tesseract/`, the PDF.js engine under `pdfjs/`, the webfonts under `fonts/`, and the service
worker.

Every version below is the version **as installed**, read from that package's own
`package.json`. Every copyright line is quoted **verbatim** from that package's own licence
file. Nothing here is written from memory. Where a package ships a licence file with no
copyright line in it, that is said plainly rather than filled in from the `author` field,
because the author field is metadata and a copyright notice is a legal artifact. Anything
that could not be settled from the installed package is marked
**UNDETERMINED — verify before publishing** and collected in §9.

Some of what ships has no installed package behind it at all: third-party code that a
dependency vendored into its own prebuilt bundle years ago (§2.6), or that arrives compiled
into a pre-minified worker (§5.1), or that is a binary copied out of another package's
directory (§6). For those there is no `package.json` to read and often no licence file either.
The rule there is the same one: quote whatever text actually ships, name the file it was read
out of, and mark what is genuinely missing rather than supplying it from a guess. A row with no
version is a row whose package is not installed, and it says so.

To re-check any row:

```bash
node -p "require('./node_modules/<pkg>/package.json').version"
grep -im1 copyright node_modules/<pkg>/LICEN[CS]E*
```

The bracket in that glob is not decoration. `idb-keyval` spells its file `LICENCE`, the British
way, and a check written against `LICENSE` reported the package as shipping no licence at all —
which is how a false **UNDETERMINED** got into an earlier draft of this file over a file sitting
in plain sight. Others put the notice in `LICENSE-MIT`, `LICENSE-MIT.txt`, `LICENSE.md` or
`license.txt`; the glob catches those too.

## 2. MIT License

Full text in §11.1. MIT conditions the grant on the copyright notice travelling with the
code, so the notices below — not just the licence body — are the operative part.

§2.6 is the exception to this heading. It collects third-party code vendored inside prebuilt
dependency bundles, which has no package of its own and is not all MIT; every row there names
its own terms.

### 2.1 Application runtime

| Component | Version | Copyright (verbatim) | Project |
|---|---|---|---|
| react | 19.2.8 | `Copyright (c) Facebook, Inc. and its affiliates.` | https://github.com/facebook/react |
| react-dom | 19.2.8 | `Copyright (c) Facebook, Inc. and its affiliates.` | https://github.com/facebook/react |
| scheduler | 0.27.0 | `Copyright (c) Facebook, Inc. and its affiliates.` | https://github.com/facebook/react |
| regenerator-runtime | 0.13.11 | `Copyright (c) 2014-present, Facebook, Inc.` | https://github.com/facebook/regenerator |

`regenerator-runtime` is here, and not in §2.3 with the unreachable `.html()` chunks, because
it is in the precached main application bundle. `tesseract.js` declares it as a runtime
dependency and publishes `src/index.js` as its npm `main`, so Vite compiles tesseract.js from
source and resolves `regenerator-runtime` out of `node_modules/`. The whole of `runtime.js`
lands in `assets/index-BugjxHvs.js` — findable by the `regeneratorRuntime` identifier and by the
`Function("r","regeneratorRuntime = r")` fallback that closes that module — and `sw.js`
precaches that file. **The copyright header at the top of `runtime.js` does not survive**: the
only comments left in that chunk are React's four. The row above is the only place that notice
exists for the main bundle.

A second and separate copy of `regenerator-runtime` is compiled into `tesseract/worker.min.js`.
That one has its own notice, in `tesseract/worker.min.js.LICENSE.txt` (§5.1).

### 2.2 jsPDF and the transitives bundled with it

`src/pdf.ts` dynamically imports `jspdf`, which pulls the first four rows below into the
export path. `fast-png` brings `iobuffer` and `pako`.

| Component | Version | Copyright (verbatim) | Project |
|---|---|---|---|
| jspdf | 4.2.1 | `Copyright` / `(c) 2010-2025 James Hall, https://github.com/MrRio/jsPDF` / `(c) 2015-2025 yWorks GmbH, https://www.yworks.com/` | https://github.com/parallax/jsPDF |
| @babel/runtime | 7.29.7 | `Copyright (c) 2014-present Sebastian McKenzie and other contributors` | https://github.com/babel/babel |
| fflate | 0.8.3 | `Copyright (c) 2026 Arjun Barrett` | https://github.com/101arrowz/fflate |
| fast-png | 6.4.0 | `Copyright (c) 2015 Michaël Zasso` | https://github.com/image-js/fast-png |
| iobuffer | 5.4.0 | `Copyright (c) 2015 Michaël Zasso` | https://github.com/image-js/iobuffer |
| pako | 2.2.0 | `Copyright (C) 2014-2017 by Vitaly Puzrin and Andrei Tuputcyn` | https://github.com/nodeca/pako |

`pako` declares `"(MIT AND Zlib)"` — conjunctive, not a choice. The MIT half is discharged by
the notice above and §11.1. The Zlib half covers the upstream C code pako derives from;
pako's own `LICENSE` contains only the MIT text, so there is no separate Zlib notice in the
package to reproduce.

jsPDF's own `@license` banner — the one naming James Hall and yWorks — does **not** survive into
`assets/jspdf.es.min-Cwr5uZnZ.js`. The chunk opens straight at Vite's `__vite__mapDeps`
preamble, and `grep -c "James Hall"` on it returns 0. The `jspdf` row above is therefore the
only place that notice exists for this build. Seven *other* licence headers, for code jsPDF
vendored into its own source, do survive into that chunk; they are in §2.6.

### 2.3 jsPDF's optional `.html()` renderer — served, but unreachable

jsPDF declares `canvg`, `html2canvas`, `dompurify` and `core-js` as optional dependencies of
its `.html()` method. **This app never calls `.html()`.** Rollup cannot prove that from
jsPDF's dynamic imports, so it emits them as separate chunks — `assets/index.es-*.js`,
`assets/html2canvas.esm-*.js`, `assets/purify.es-*.js` — which are excluded from the service
worker precache but are still served on request. They are attributed here because they are
served, not because any code path reaches them.

| Component | Version | Copyright (verbatim) | Project |
|---|---|---|---|
| canvg | 3.0.11 | `Copyright (c) 2010 - present Gabe Lerner (gabelerner@gmail.com) - https://github.com/canvg/canvg` | https://github.com/canvg/canvg |
| rgbcolor | 1.0.1 | `Copyright (c) 2016 Stoyan Stefanov, http://phpied.com/` | https://github.com/yetzt/node-rgbcolor |
| stackblur-canvas | 2.7.0 | `Copyright (c) 2010 Mario Klingemann` (from `LICENSE-MIT.txt`) | https://github.com/flozz/StackBlur |
| svg-pathdata | 6.0.3 | `Copyright © 2017 Nicolas Froidure` | https://github.com/nfroidure/svg-pathdata |
| raf | 3.4.1 | `Copyright 2013 Chris Dickinson <chris@neversaw.us>` | https://github.com/chrisdickinson/raf |
| performance-now | 2.1.0 | `Copyright (c) 2013 Braveg1rl` (from `license.txt`) | https://github.com/braveg1rl/performance-now |
| core-js | 3.50.0 | `Copyright (c) 2013–2025 Denis Pushkarev (zloirock.ru)` / `Copyright (c) 2025–2026 CoreJS Company (core-js.io)` | https://github.com/zloirock/core-js |
| html2canvas | 1.4.1 | `Copyright (c) 2012 Niklas von Hertzen` | https://html2canvas.hertzen.com |
| css-line-break | 2.1.0 | `Copyright (c) 2017 Niklas von Hertzen` | https://github.com/niklasvh/css-line-break |
| text-segmentation | 1.0.3 | `Copyright (c) 2021 Niklas von Hertzen` | https://github.com/niklasvh/text-segmentation |
| utrie | 1.0.2 | `Copyright (c) 2021 Niklas von Hertzen` | https://github.com/niklasvh/utrie |
| base64-arraybuffer | 1.0.2 | `Copyright (c) 2012 Niklas von Hertzen` | https://github.com/niklasvh/base64-arraybuffer |

**`rgbcolor` — a disjunctive licence, and the election made.** Its `package.json` declares
`"license": "MIT OR SEE LICENSE IN FEEL-FREE.md"`, and its `LICENSE.md` closes under a heading
`Exemptions` with the line `Please either apply this, the MIT license, or the license in
'./FEEL-FREE.md'`. That is a choice, the same shape as DOMPurify's in §4.2, so the recipient
elects. **Receipts Express elects MIT**, and recording that here is what puts the election on
the record.

The alternative, `node_modules/rgbcolor/FEEL-FREE.md`, is a URL line followed by three
sentences: `Feel free to use the code for your own color picker tool or whatever you feel like.
If you let me know how you use it, that would be even greater. Meanwhile any other comments are
highly appreciated.` It grants no warranty disclaimer, defines no scope for "use", and its
second sentence can be read as a condition rather than a wish. `LICENSE.md` — the MIT text
carrying the copyright line quoted in the table — is the determinate half of the choice, so it
is the half elected. On that election the notice above plus §11.1 discharge the whole
obligation, and no reader has to work out what "feel free" covered.

### 2.4 Bundled inside the Tesseract worker

These reach the build already compiled into `tesseract/worker.min.js`, which is shipped
pre-minified by tesseract.js.

What is inside that file is not inference. `node_modules/tesseract.js/dist/worker.min.js.map`
lists its `sources`, and the shipped `tesseract/worker.min.js` is byte-identical to the one in
`node_modules/` (same MD5), so the map describes what users get. Nine third-party modules are in
there — `base64-js`, `bmp-js`, `buffer`, `idb-keyval`, `ieee754`, `is-url`,
`regenerator-runtime`, `wasm-feature-detect` and `zlibjs` — plus tesseract.js's own `src/`. The
three rows below are the ones this section has to account for. (`is-electron` was a tenth until
tesseract.js 7 dropped it; re-read from the v7 source map, it is no longer in the worker and its
row has gone with it.) `buffer`, `ieee754`,
`regenerator-runtime` and `zlibjs` have their notices in
`tesseract/worker.min.js.LICENSE.txt` (§5.1); `idb-keyval` and `wasm-feature-detect` are
Apache-2.0 (§4); `base64-js` has no notice anywhere, which is dealt with in §5.1.

| Component | Version | Copyright (verbatim) | Project |
|---|---|---|---|
| bmp-js | 0.1.0 | `Copyright (c) 2014 @丝刀口` | https://github.com/shaozilee/bmp-js |
| zlibjs | 0.3.1 | `Copyright (c) 2012 imaya` | https://github.com/imaya/zlib.js |
| is-url | 1.2.4 | `node_modules/is-url/LICENSE-MIT` opens `MIT LICENSE` and contains **no copyright line**. `package.json` declares MIT. There is no notice to reproduce. | https://github.com/segmentio/is-url |

### 2.5 Workbox — the service worker runtime

| Component | Version | Copyright (verbatim) | Project |
|---|---|---|---|
| workbox-core, workbox-expiration, workbox-precaching, workbox-routing, workbox-strategies, workbox-window | 7.4.1 | `Copyright 2018 Google LLC` | https://github.com/GoogleChrome/workbox |

Workbox reaches the build through `vite-plugin-pwa` 0.21.2, which generates `sw.js`,
`workbox-*.js` and `assets/workbox-window.prod.es5-*.js`. **None of those files carries a
copyright header** — the minified output begins straight at `define(["exports"],...)`. MIT
requires the notice to be included in all copies, so this table is the only place that
notice exists for this build.

Read the shipped bundle's internal marker as `workbox:core:7.4.0` rather than 7.4.1 and it
looks like a stale build. It is not: Workbox 7.4.1 bakes the literal string
`workbox:core:7.4.0` into its own published output, which is verifiable in the installed
`node_modules/workbox-core/build/`. The installed version is the one recorded above.

### 2.6 Vendored code with no package of its own

Some of what this app serves is not any package in `node_modules/`. It is third-party code that
a dependency copied into its own source at some point and now ships as part of its own build.
There is no `package.json` to read a version from and no `LICENSE` file to quote. What there is
is the licence header the vendoring author kept, and in every case below that header survives
minification into the deployed file, where anyone can read it. **Those headers are the
authoritative text; this section is a map to them.** They are not all MIT, so each row names its
own terms.

Seven of them survive in `assets/jspdf.es.min-Cwr5uZnZ.js`, which `sw.js` precaches — so unlike
§2.3 this code is downloaded on first visit whether or not it runs.

| Vendored code | Header, verbatim | Licence |
|---|---|---|
| `RGBColor` colour-string parser | `A class to parse color values` / `@author Stoyan Stefanov <sstoo@gmail.com>` / `{@link   http://www.phpied.com/rgb-color-parser-in-javascript/}` / `@license Use it if you like it` | Not a standard licence — see below |
| MD5 digest | `Joseph Myers does not specify a particular license for his work.` / `Author: Joseph Myers` / `Accessed from: http://www.myersdaily.org/joseph/javascript/md5.js` / `Modified by: Owen Leong` | None stated — see below |
| RC4 keystream helper | `FPDF is released under a permissive license: there is no usage restriction. You may embed it freely in your application (commercial or not), with or without modifications.` / `Reference: http://www.fpdf.org/en/script/script37.php` | FPDF permissive |
| PDF standard-security handler | `Licensed under the MIT License.` / `http://opensource.org/licenses/mit-license` / `Author: Owen Leong (@owenl131)` / `Date: 15 Oct 2020` | MIT — the header names an author but carries no copyright line |
| JPEG encoder | `Copyright (c) 2008, Adobe Systems Incorporated` / `All rights reserved.` | **BSD-3-Clause** — the header carries the full text; reproduced in §11.4 |
| jsPDF plugin code | `Copyright (c) 2017 Aras Abbasi` / `Licensed under the MIT License.` / `http://opensource.org/licenses/mit-license` | MIT |
| jsPDF XMP metadata plugin | `jsPDF XMP metadata plugin` / `Copyright (c) 2016 Jussi Utunen, u-jussi@suomi24.fi` | MIT — the header carries the full MIT text |

The Adobe row is why the earlier claim that `ieee754` was "the only BSD-3-Clause component in
the distribution" was wrong (§5.1). Adobe's JPEG encoder is BSD-3-Clause, it is in a precached
chunk, and its full licence text ships with it.

Two of the seven are not really third-party. Aras Abbasi is a jsPDF maintainer, and the two rows
naming him and Jussi Utunen head jsPDF plugin code, already covered by the `jspdf` row in §2.2.
They are listed anyway, because they are distinct licence headers in the shipped bytes and
anyone auditing that chunk should find all seven accounted for rather than six. The unminified
`node_modules/jspdf/dist/jspdf.es.js` carries more such headers than survive here; only the ones
that reach users are listed.

Three of the seven state terms that are not a standard licence, and that is how their authors
published them:

- **`RGBColor`** — "Use it if you like it" is the entire grant. It is permissive on its face and
  imposes no condition this distribution could breach. The same upstream code is separately on
  npm as `rgbcolor` (§2.3), where a later packager wrapped an MIT text around it. Both forms
  ship, from different chunks, which is why one author's name appears twice in this file.
- **MD5** — the header says outright that no licence was specified. No amount of reading files
  fixes that. jsPDF distributes it inside an MIT-licensed package and the header saying what it
  says travels with it verbatim, which is the whole of what can be done here.
- **FPDF** — "no usage restriction", embedding expressly permitted, commercial or not. No
  attribution condition attaches; the header ships anyway.

**tslib**, Microsoft's TypeScript helper library, is the eighth. It is not in `node_modules/`:
`html2canvas` and `svg-pathdata` each compiled it into their published bundles, and each bundle
carries its banner. It therefore ships twice — in `assets/html2canvas.esm-QH1iLAAe.js` and in
`assets/index.es-D6K0VeIz.js`, the canvg chunk, which is where `svg-pathdata` lands. Both copies
sit in the `.html()` chunks of §2.3: served, never precached, never reached. The two banners are
byte-identical:

```
/*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
```

That banner is a complete grant on its own: permission with no condition attached, not even
retention of the notice. Nothing was breached while tslib went unlisted. It is listed because
this file claims to cover what is distributed, and it was distributed. There is no version to
record — tslib is not installed here, and the sourcemaps that identify it
(`node_modules/html2canvas/dist/html2canvas.esm.js.map` and
`node_modules/svg-pathdata/lib/SVGPathData.module.js.map`, both listing
`../node_modules/tslib/tslib.es6.js` among their `sources`) give the path, not the version. The
two vendoring packages pin tslib differently in their own `devDependencies` — `^2.3.0` for
html2canvas, `2.1.0` for svg-pathdata — but those are their build-time ranges, not a reading of
an installed package, so they are not recorded above as versions.

## 3. ISC License

Full text in §11.2.

| Component | Version | Copyright (verbatim) | Project |
|---|---|---|---|
| idb | 8.0.3 | `Copyright (c) 2016, Jake Archibald <jaffathecake@gmail.com>` | https://github.com/jakearchibald/idb |

## 4. Apache License, Version 2.0

A copy of this licence already ships to every user as `LICENSE.txt`, which is what
Apache-2.0 §4(a) asks for. It is not reproduced again here.

| Component | Version | Copyright | Project |
|---|---|---|---|
| pdfjs-dist | 6.2.108 | `Copyright 2024 Mozilla Foundation` — from the `@licstart` header of `node_modules/pdfjs-dist/build/pdf.mjs`. The package's own `LICENSE` is the bare Apache-2.0 text with an unfilled appendix, so it names no holder. | https://mozilla.github.io/pdf.js/ |
| tesseract.js | 7.0.0 | **UNDETERMINED — verify before publishing.** `LICENSE.md` is the bare Apache-2.0 text; the appendix placeholder is unfilled and `package.json` has no author. | https://github.com/naptha/tesseract.js |
| tesseract.js-core | 7.0.0 | **UNDETERMINED — verify before publishing.** `LICENSE` is the bare Apache-2.0 text, appendix still reading `Copyright {yyyy} {name of copyright owner}`. `package.json` names `antimatter15`, which is metadata, not a notice. | https://github.com/naptha/tesseract.js-core |
| idb-keyval | 6.3.0 | `Copyright 2016, Jake Archibald` — verbatim from `node_modules/idb-keyval/LICENCE`, which is the Apache-2.0 short header form with the holder filled in. Reaches the build inside `tesseract/worker.min.js`. | https://github.com/jakearchibald/idb-keyval |
| wasm-feature-detect | 1.8.0 | `LICENSE` is the bare Apache-2.0 text with no filled copyright line. `package.json` names `Surma <surma@surma.link>`, repository `GoogleChromeLabs/wasm-feature-detect`. Imported by tesseract.js. | https://github.com/GoogleChromeLabs/wasm-feature-detect |

`idb-keyval` was marked **UNDETERMINED — ships no licence file at all** in an earlier draft.
That was false: the file is `LICENCE`, not `LICENSE`, and a check written against the American
spelling walked past it. It is the clearest reason this file's method now globs `LICEN[CS]E*`
(§1) — the promise at the top only means something if every row was actually opened.

### 4.1 The §4(d) NOTICE obligation does not attach

Apache-2.0 §4(d) requires a redistributor to reproduce any `NOTICE` file the Work carries. A
recursive search of `node_modules/` for `NOTICE`, `NOTICE.txt` and `NOTICE.md` returns
nothing. No Apache-2.0 dependency here ships one, so §4(d) has no content to reproduce.

Receipts Express itself also has no `NOTICE` file, which is deliberate — adding one would
create an ongoing §4(d) obligation for every downstream fork and buys nothing the `LICENSE`
does not already give.

### 4.2 DOMPurify — a dual licence, and the election made

| Component | Version | Copyright (verbatim from the shipped chunk header) | Project |
|---|---|---|---|
| dompurify | 3.4.13 | `@license DOMPurify 3.4.13 \| (c) Cure53 and other contributors \| Released under the Apache license 2.0 and Mozilla Public License 2.0` | https://github.com/cure53/DOMPurify |

DOMPurify declares `"(MPL-2.0 OR Apache-2.0)"` — disjunctive, so the recipient elects.
**Receipts Express elects Apache-2.0**, and recording that here is what puts the election on
the record. On that election MPL-2.0's file-level source-disclosure duty never attaches. It
arrives via jsPDF's `.html()` path and is unreachable dead code (§2.3); the header above
survives minification intact in `assets/purify.es-*.js`.

## 5. The Tesseract OCR engine

`tesseract/` is the largest thing the app serves, and it raises three separate questions that
"tesseract.js is Apache-2.0" does not answer.

### 5.1 The worker's own notice file, and the three things it leaves out

`tesseract/worker.min.js` opens with `/*! For license information please see
worker.min.js.LICENSE.txt */`. That file is now copied into the build by
`scripts/copy-tesseract-assets.mjs`, so the reference resolves and the four notices it
carries — for `buffer` (MIT, Feross Aboukhadijeh), `ieee754` (BSD-3-Clause, Feross
Aboukhadijeh), `regenerator-runtime` (MIT, Facebook, Inc.) and `zlib.js` (MIT, imaya) — reach
users in the form their own authors wrote them. **`tesseract/worker.min.js.LICENSE.txt` is
the authoritative text for those four; this paragraph is a map to it, not a substitute.**

`ieee754` is **not** the only BSD-3-Clause component in the distribution — the JPEG encoder
vendored into the precached jsPDF chunk is Adobe's, under the same licence, and its full text
ships in that chunk's own header (§2.6). What is true of `ieee754` is narrower: it is not
present in `node_modules/` — it arrives already bundled inside the pre-minified worker — so
there is no local `LICENSE` to quote, and *its* copy of the BSD-3-Clause text is
**UNDETERMINED — verify before publishing**: read
https://github.com/feross/ieee754/blob/master/LICENSE and paste it into §11.4 beside Adobe's.
The one-line notice its author publishes does ship, which is the part that does not depend on
getting that text right.

**Two things inside the worker have no notice anywhere in the distribution.** Neither is
visible in the shipped file — both were found by reading the `sources` and `sourcesContent` of
`node_modules/tesseract.js/dist/worker.min.js.map` (§2.4), which is exactly why the notice file
above does not catch them.

| Component | How it gets in | Copyright and licence |
|---|---|---|
| `base64-js` | `node_modules/base64-js/index.js` per the worker's sourcemap; `buffer/index.js` `require`s it and `buffer` is in there too. Not installed in this tree — it arrives already bundled. | **UNDETERMINED — verify before publishing.** The map's `sourcesContent` carries the whole module and it has no header comment of any kind; there is no installed package to read a `LICENSE`, a `license` field or a version from. Read `beatgammit/base64-js` upstream and record what it actually says. |
| `arrayBufferToBase64` | tesseract.js's own `src/worker-script/utils/arrayBufferToBase64.js` | `// Copied from https://gist.github.com/jonleighton/958841` / `// Copyright 2011 Jon Leighton, MIT LICENSE` — verbatim, the first two lines of that file. MIT text in §11.1. |

Jon Leighton's notice is lost because both lines are `//` comments, and the minifier that
produced `worker.min.js` extracts only block comments — every one of the four in
`worker.min.js.LICENSE.txt` is a `/*! */` or `@license` form. The code itself is there:
`grep -c 16515072` on `tesseract/worker.min.js` returns 1, matching the
`16515072 = (2^6 - 1) << 18` mask in tesseract.js's source, while `grep -ril leighton dist/`
returns nothing at all. MIT conditions the grant on the notice travelling with the code, so the
table row above is the only place it exists for this build.

### 5.2 The English trained data has a different lineage from the code

| Component | Version | Licence | Project |
|---|---|---|---|
| @tesseract.js-data/eng | 1.0.0 | **UNDETERMINED — verify before publishing.** | https://github.com/naptha/tessdata |

This is the single largest file the app serves — `tesseract/eng.traineddata.gz`, 10,923,060
bytes. What the installed package actually says is very little:

- `package.json` declares `"license": "MIT"` and `"author": "Balearica <admin@scribeocr.com>"`.
- The package holds five files: `README.md`, `package.json`, `index.js`, and one
  `eng.traineddata.gz` in each of two directories. Those two are **different models, not two
  copies of one.** `4.0.0/eng.traineddata.gz` is 10,923,060 bytes;
  `4.0.0_best_int/eng.traineddata.gz` is 2,952,873 bytes; their MD5s differ. `index.js` sets
  `langPath` to `4.0.0`, `scripts/copy-tesseract-assets.mjs` copies that one, and the shipped
  `tesseract/eng.traineddata.gz` has the same MD5 as `4.0.0/`. **The `_best_int` model is not
  distributed**, so whatever governs it is not this project's problem; the row above is about
  the `4.0.0` model only. There is **no `LICENSE`, `COPYING` or `NOTICE`** anywhere in the
  package.
- `README.md` says only "eng traineddata for tesseract.js" plus install and usage sections.
  It has no licence section and names no copyright holder.

So the npm `"MIT"` field is unbacked by any licence text and the package identifies no
copyright holder. The declared licence is also in tension with the model's likely
provenance: `naptha/tessdata` repackages the tesseract-ocr project's `tessdata`, and
tesseract-ocr is Apache-2.0. **Do not settle this by trusting the npm field.** Read the root
LICENSE of `tesseract-ocr/tessdata` and of `naptha/tessdata`, decide which governs, and
record the answer here. If Apache-2.0, the duty to supply the licence is already discharged
by `LICENSE.txt`. If MIT, the package supplies no notice, so there is none to reproduce.

### 5.3 The WASM cores statically link C libraries — TODO, read upstream

The four cores in `tesseract/` are compiled binaries with several permissively licensed C
libraries linked in, each carrying its own binary-redistribution condition.
`node_modules/tesseract.js-core/` holds exactly one licence artifact, the bare Apache-2.0
text, which covers the Tesseract code and says nothing about anything linked into it. That
text now ships as `tesseract/LICENSE-tesseract-core.txt`; the rows below are still open.

Evidence is from `strings -a` over the shipped `tesseract-core.wasm`.

| Library | Evidence in the shipped binary | Licence | Status |
|---|---|---|---|
| libjpeg (Independent JPEG Group) | `Copyright (C) 2014, Thomas G. Lane, Guido Vollbeding` | IJG License | **TODO — UNDETERMINED, verify before publishing.** The IJG licence requires an executable-only distribution to state that the software is based in part on the work of the Independent JPEG Group, in wording the licence itself prescribes. Read that wording upstream and paste it verbatim. |
| Leptonica | `leptonica-%d.%d.%d`, `# Raw PBM file written by leptonica (www.leptonica.com)` | BSD-2-Clause per upstream | **TODO — UNDETERMINED, verify before publishing.** Read `DanBloomberg/leptonica/leptonica-license.txt` and reproduce its copyright line and text. |
| libtiff | `libtiff does not allow writing more than 2147483647 bytes in a tag` | libtiff (Sam Leffler / Silicon Graphics) | **TODO — UNDETERMINED, verify before publishing.** |
| libpng | `Application built with libpng-`, `libpng error: %s` | PNG Reference Library License | **TODO — UNDETERMINED, verify before publishing.** |
| zlib | linked via libpng | zlib License | **TODO — UNDETERMINED, verify before publishing.** |

**These five licence texts are deliberately not reproduced in §11.** Writing them from memory
would be worse than the current gap: a wrong licence text is an affirmative misstatement,
where a missing one is an omission. Each must be read from its own upstream repository and
pasted in.

## 6. PDF.js bundled sub-components

`scripts/copy-pdfjs-assets.mjs` copies the `standard_fonts`, `cmaps`, `wasm` and `iccs`
directories recursively, so **PDF.js's own licence files travel with the assets they cover** —
with one exception, the last row below. Ten licence files ship under `pdfjs/`. For the first ten
rows this table is a map and the shipped file is authoritative.

| Sub-component | Copyright (verbatim from the shipped file) | Shipped licence file |
|---|---|---|
| Adobe CMap resources | `%%Copyright: Copyright 1990-2009 Adobe Systems Incorporated.` | `pdfjs/cmaps/LICENSE` |
| ICC colour profiles | `CC0 1.0 Universal` — public-domain dedication, no attribution duty | `pdfjs/iccs/LICENSE` |
| Foxit standard fonts | `// Copyright 2014 PDFium Authors. All rights reserved.` | `pdfjs/standard_fonts/LICENSE_FOXIT` |
| Liberation fonts | `Digitized data copyright (c) 2010 Google Corporation` / `Copyright (c) 2012 Red Hat, Inc.` | `pdfjs/standard_fonts/LICENSE_LIBERATION` |
| JBIG2 (PDFium) | `// Copyright 2014 The PDFium Authors` | `pdfjs/wasm/LICENSE_JBIG2` |
| OpenJPEG | `Copyright (c) 2002-2014, Universite catholique de Louvain (UCL), Belgium` and others | `pdfjs/wasm/LICENSE_OPENJPEG` |
| QCMS | `Copyright (C) 2009-2024 Mozilla Corporation` | `pdfjs/wasm/LICENSE_QCMS` |
| PDF.js JBIG2 wrapper | `Copyright 2026 Mozilla Foundation` | `pdfjs/wasm/LICENSE_PDFJS_JBIG2` |
| PDF.js OpenJPEG wrapper | `Copyright (c) 2024, Mozilla Foundation` | `pdfjs/wasm/LICENSE_PDFJS_OPENJPEG` |
| PDF.js QCMS wrapper | `Copyright (c) 2025, Mozilla Foundation` | `pdfjs/wasm/LICENSE_PDFJS_QCMS` |
| QuickJS engine — `pdfjs/wasm/quickjs-eval.wasm` (469,105 bytes) and `quickjs-eval.js` | **UNDETERMINED — verify before publishing.** | **none** |

That last row is the one hole in an otherwise complete set, and its shape is what makes it
worth stating. `pdfjs-dist` ships a `LICENSE_*` file beside every other binary it vendors —
JBIG2, OpenJPEG and QCMS, each with a Mozilla wrapper licence as well — and none beside QuickJS,
which is the largest of the four. `strings -a` over `quickjs-eval.wasm` returns no occurrence of
`copyright` at all; the one identifying string it carries is
`QuickJS memory usage -- 1.0.0 version, %d-bit, malloc limit: %lld`, which gives an engine
version of 1.0.0 and nothing more. `quickjs-eval.js` opens
`/* THIS FILE IS GENERATED - DO NOT EDIT */` and carries no notice either. Nothing in the
installed package settles this, so: establish which QuickJS this is — Bellard's original and the
`quickjs-ng` fork both exist and the shipped bytes do not say which built this — then read that
project's licence and record the holder and text here. `pdfjs-dist`'s own
`"license": "Apache-2.0"` is a declaration about Mozilla's package, and the JBIG2/OpenJPEG/QCMS
files prove Mozilla does not treat it as covering the binaries it vendors.

QuickJS ships because `scripts/copy-pdfjs-assets.mjs` copies `wasm/` recursively, and it is
reached by nothing. Its only loader inside `pdfjs-dist` is `build/pdf.sandbox.mjs`, the PDF
form-field JavaScript sandbox; that file is not copied into the build, and `grep -c quickjs`
returns 0 on both the shipped `pdfjs/pdf.worker.min.mjs` and `assets/pdfReceipt-*.js`. Like the
`.html()` chunks in §2.3, it is attributed here because it is served, not because any code path
reaches it.

PDF.js carries its Mozilla copyright in an `@licstart` comment, a LibreJS convention esbuild
does not treat as a legal comment, so the notice is stripped from `assets/pdfReceipt-*.js`.
Apache-2.0 has no clause requiring notices to survive into object code, so no condition is
breached — but the Mozilla Foundation row in §4 is the only place that notice now exists for
the main bundle.

## 7. Webfonts — SIL Open Font License 1.1

| Font | Package | Version | Copyright (verbatim) | Project |
|---|---|---|---|---|
| Inter | @fontsource-variable/inter | 5.3.0 | `Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter) Inter-Italic[opsz,wght].ttf: Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter)` | https://github.com/rsms/inter |
| Outfit | @fontsource-variable/outfit | 5.3.0 | `Copyright 2021 The Outfit Project Authors (https://github.com/Outfitio/Outfit-Fonts)` | https://github.com/Outfitio/Outfit-Fonts |

Inter's line really does say the same thing twice, once generally and once for the italic TTF,
on a single line. That is how it reads in `node_modules/@fontsource-variable/inter/LICENSE` and
in the shipped `fonts/inter-OFL.txt`, and it is quoted whole here because this file promises
verbatim quotation and a tidier-looking line would be a different line. An earlier draft cut it
at the first closing parenthesis.

OFL-1.1 requires the licence to travel with the fonts it covers, and it does:
`scripts/copy-font-assets.mjs` writes `fonts/inter-OFL.txt` and `fonts/outfit-OFL.txt` beside
the two `.woff2` files. **Those two files are the authoritative OFL text for this
distribution**, which is why the 90-line licence body is not duplicated here. Neither
copyright line declares a Reserved Font Name, so the OFL's RFN restriction binds neither
family.

The fonts exist only for the standalone pages under `docs/`; the app's own UI ships no
webfont and uses the system stack.

## 8. Feather Icons — vendored path data, not an npm dependency

| Component | Copyright | Project |
|---|---|---|
| Feather Icons | **UNDETERMINED — verify before publishing.** `Copyright (c) 2013-2023 Cole Bemis` — MIT. See the note below on how this line was obtained. | https://github.com/feathericons/feather |

Feather is not installed, so there is no local `LICENSE` to quote and the line above was
taken from the upstream repository rather than read out of `node_modules/`. It should be
confirmed against https://github.com/feathericons/feather/blob/main/LICENSE before this file
is published.

The derivation is real and was checked glyph by glyph, and the record of that check is the
header comment in `src/components/icons.tsx`. In that file, these reproduce Feather path data:
`camera` (Feather `camera`), `trash` (`trash`), `swap` (`repeat`) and `search` (`search`) are
identical; `image` (`image`) is identical but for a dropped `ry` on the rect; `warning`
(`alert-triangle`) is identical, with the `L` after the moveto left implicit; `backup`
(`download`) keeps Feather's arrow and redraws the tray; `file` (`file-text`) keeps the frame
and fold, runs the two body lines in the opposite direction and drops the short `10 9 9 9 8 9`
polyline; and `edit` (`edit`) is identical with the closing `9.5-9.5` segment replaced by `z`.
The wrapper `<svg>` uses Feather's own convention — `viewBox="0 0 24 24"`, `fill="none"`,
`stroke="currentColor"`, stroke width 2, round caps and joins. In the repository,
`assets/camera.svg` is Feather `camera`, `assets/lock.svg` is Feather `lock` and
`assets/pdf.svg` is Feather `file-text`, each byte-identical; `assets/reports.svg` is Feather
`clipboard` with three lines added. Those SVGs are used by `README.md` and are not part of
the deployed build.

Every comparison in that paragraph is against upstream Feather, which is not installed here, so
none of it could be re-checked while this file was written; it stands as
`src/components/icons.tsx` records it. The copyright line above has the same status. Settling
both is one job, and it is item 9 in §9.

The rest of `icons.tsx` is not Feather's, and it splits two ways — a distinction an earlier
draft blurred by filing all of it under "generic marks":

- **`receipt` and `express-arrow` are original.** Neither corresponds to a Feather glyph.
  `receipt` is a scalloped-bottom slip with two ruled lines; `express-arrow` is a
  chevron-tipped arrow with two trailing speed lines. Nothing was derived from anything, so
  nothing is owed.
- **`menu`, `close` and the three chevrons do share coordinates with Feather's `menu`, `x` and
  chevrons**, and calling them original would be false. Two or three straight strokes on a
  24-unit grid is geometry rather than expression — at this size there is no meaningfully
  different way to draw them — so there is nothing there for anyone to own and no attribution
  is claimed. That is a different reason from "original", and it is the accurate one for these
  five.

`assets/reorder.svg`, the fifth repository SVG and the one not listed above, is the same second
case: two chevrons and a vertical line.

## 9. Unresolved — verify before publishing

**This file is not a completed compliance record until each of these is either resolved or
consciously accepted.**

| # | Component | What is missing | Where to look |
|---|---|---|---|
| 1 | @tesseract.js-data/eng 1.0.0 | Operative licence and copyright holder; ships no licence file (§5.2) | `tesseract-ocr/tessdata`, `naptha/tessdata` |
| 2 | libjpeg (in WASM) | The IJG acknowledgement wording, which the licence prescribes | libjpeg-turbo upstream |
| 3 | Leptonica (in WASM) | Copyright line and BSD-2-Clause text | `DanBloomberg/leptonica` |
| 4 | libtiff (in WASM) | Copyright line and licence text | libtiff upstream |
| 5 | libpng (in WASM) | Copyright line and licence text | libpng upstream |
| 6 | zlib (in WASM, via libpng) | Copyright line and licence text | zlib upstream |
| 7 | tesseract.js 5.1.1, tesseract.js-core 5.1.1 | Copyright holder; both licence files are bare Apache-2.0 with an unfilled appendix | Upstream repository headers |
| 8 | ieee754 | Its own BSD-3-Clause text for §11.4; not in `node_modules/` (§5.1) | `feross/ieee754` |
| 9 | Feather Icons | The copyright line, and the glyph comparisons in §8; Feather is not installed | `feathericons/feather` |
| 10 | base64-js | Licence and copyright holder; bundled into `tesseract/worker.min.js`, not installed, no header in its source (§5.1) | `beatgammit/base64-js` |
| 11 | QuickJS 1.0.0 (in `pdfjs/wasm/`) | Which QuickJS, then its licence and copyright holder; `pdfjs-dist` ships no licence file for it and the binary carries none (§6) | QuickJS upstream, `mozilla/pdf.js` `external/quickjs` |

Two items that were on this list are off it, both because the answer was sitting in
`node_modules/` the whole time. `idb-keyval` 6.3.0 was recorded as shipping no licence file; it
ships `LICENCE`, and it names Jake Archibald (§4). `regenerator-runtime` was filed as
unreachable `.html()` code; it is in the precached main bundle (§2.1). Neither was a hard
question. Both were answered by opening the file.

`is-url` 1.2.4 is a milder twelfth case: its `LICENSE-MIT` genuinely contains no copyright
line, so there is nothing to reproduce and nothing to fix. It is recorded in §2.4 instead. The
three non-standard headers in §2.6 — "Use it if you like it", the MD5 header stating that no
licence was specified, and FPDF's — are likewise not listed here: each ships verbatim in the
form its author published, and no further reading resolves them.

## 10. Not distributed, and deliberately omitted

`devDependencies` — TypeScript, Vite, Vitest, jsdom, the Testing Library packages, `@types/*`
and everything beneath them — are not listed, because none of their code is distributed. They
run on the developer's machine to produce the build and no byte of them reaches a user, so no
distribution-triggered condition ever fires. The clearest example is `caniuse-lite`, the only
CC-BY-4.0 package in the tree: CC-BY-4.0 does carry a real attribution condition, but it
triggers on distributing the work or an adaptation, and the browser-support data is consumed
at build time to compute compilation targets without any of it being emitted.

Being a `devDependency` is not the test; reaching the build output is. Two are therefore
listed above despite the label: the two `@fontsource-variable` packages (§7), whose `.woff2`
files are served to every reader, and `vite-plugin-pwa`, whose generated Workbox runtime
ships as the service worker (§2.5).

Two more that the dependency graph lists but that do not reach users:

- **`loose-envify` and `js-tokens`.** `loose-envify` is a dependency of `react`, `react-dom`
  and `scheduler`, but it is a browserify source transform. React's published files reference
  `process.env.NODE_ENV` directly and never `require` it, so Rollup never pulls it in.
- **`@napi-rs/canvas`**, an optional dependency of `pdfjs-dist`. The browser bundle contains
  only the module specifier inside a Node-only code path; the native module is never bundled
  or served.

## 11. Full licence texts

### 11.1 MIT License

Applies to every component in §2 except the non-MIT rows in §2.6, which name their own terms;
to the MIT half of `pako`; and to Jon Leighton's `arrayBufferToBase64` inside the Tesseract
worker (§5.1). Each component's own copyright notice is in its entry above; MIT conditions the
grant on that notice, together with the permission text below, being included in all copies.

```
MIT License

Copyright (c) <see the copyright notice for each component in §2 and §5.1 above>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### 11.2 ISC License

Applies to `idb` (§3). Reproduced verbatim from `node_modules/idb/LICENSE`.

```
ISC License (ISC)
Copyright (c) 2016, Jake Archibald <jaffathecake@gmail.com>

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

### 11.3 Apache License, Version 2.0

Applies to every component in §4 and, by election, to `dompurify`. The text is not repeated
here: the identical text already ships to every user as `LICENSE.txt`, which is what
Apache-2.0 §4(a) requires.

### 11.4 BSD-3-Clause License

Applies to two components: the Adobe JPEG encoder vendored into the jsPDF chunk (§2.6) and
`ieee754` (§5.1).

Adobe's text ships verbatim inside `assets/jspdf.es.min-Cwr5uZnZ.js` and is reproduced from
that file here — the opening `/**` and ` * @license` lines and the closing `*/` dropped, every
other byte, line break and indent as found:

```
  Copyright (c) 2008, Adobe Systems Incorporated
  All rights reserved.

  Redistribution and use in source and binary forms, with or without 
  modification, are permitted provided that the following conditions are
  met:

  * Redistributions of source code must retain the above copyright notice, 
    this list of conditions and the following disclaimer.
  
  * Redistributions in binary form must reproduce the above copyright
    notice, this list of conditions and the following disclaimer in the 
    documentation and/or other materials provided with the distribution.
  
  * Neither the name of Adobe Systems Incorporated nor the names of its 
    contributors may be used to endorse or promote products derived from 
    this software without specific prior written permission.

  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS
  IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO,
  THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
  PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR 
  CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
  EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
  PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
  PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
  LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
  NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
  SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

Its second clause is the operative one here: a binary redistribution must reproduce that
notice, and the app does — the header travels inside the chunk it covers, and it is repeated
above.

`ieee754`'s own text is **UNDETERMINED — verify before publishing**: it is not present in
`node_modules/`, there is no local file to copy from, and one package's licence text is not
pasted under another package's name here even when the template is the same. Read
https://github.com/feross/ieee754/blob/master/LICENSE and add it beside Adobe's. The one-line
notice its author publishes already ships verbatim in
`tesseract/worker.min.js.LICENSE.txt`.

### 11.5 SIL Open Font License 1.1

Applies to Inter and Outfit (§7). Not reproduced here: the full text already ships beside the
fonts it covers, as `fonts/inter-OFL.txt` and `fonts/outfit-OFL.txt`.

### 11.6 Texts that live elsewhere in this file

Three grants are short enough to be quoted where they belong rather than collected here, and
are not repeated: **tslib**'s banner and the **FPDF** and `RGBColor` **"use it if you like it"**
headers, all in §2.6. §11 is not a complete inventory on its own; §2.6 is part of it.

---

*Eleven items in §9 remain unresolved. Do not describe this file as a finished attribution
record until each is resolved or consciously accepted.*
