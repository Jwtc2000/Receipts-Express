import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin, type ResolvedConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// package.json's "version" is the single source of truth for the app's
// version — bump it there (semver) and it flows into the build and the
// in-app About menu automatically.
const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8'))

// The exact commit the build was cut from, shown as secondary text under the
// version in About so a stale deploy is identifiable at a glance. git may be
// absent (e.g. a source tarball or a CI checkout without history) — any failure
// falls back to "unknown" so it never breaks the build.
const commitHash = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    return 'unknown'
  }
})()

// frame-ancestors would be the real clickjacking defense, but it's ignored
// entirely when a CSP is delivered via <meta> rather than an HTTP header
// (per spec) — and GitHub Pages, this app's host, has no mechanism to send
// custom response headers. base-uri/form-action are included anyway since
// they *are* meta-compatible and cost nothing for a single-page app with no
// external forms; see SECURITY.md for the frame-ancestors gap itself.
const CSP =
  "default-src 'self'; connect-src 'self'; img-src 'self' blob: data:; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; worker-src 'self' blob:; base-uri 'self'; form-action 'self'"

// The same policy, adjusted for the standalone pages under docs/ — derived from
// CSP above rather than written out again, so the two cannot drift apart.
//
// Two adjustments, both forced by what those pages actually are:
//
// style-src gains 'unsafe-inline'. Every page under docs/ carries its CSS in a
// <style> block and the deck additionally uses inline style attributes, so
// style-src 'self' alone would serve the privacy policy and terms as unstyled
// text. Style attributes cannot be covered by a hash, so there is no stricter
// option that leaves the pages readable. What this gives up is small here:
// default-src, connect-src, img-src and form-action all stay at 'self', so the
// usual CSS exfiltration route — a url() pointing off-origin — is still shut,
// and none of these pages takes input worth stealing in the first place.
//
// script-src gains a hash per inline <script> the page actually contains,
// which is stricter than 'unsafe-inline' and does not need maintaining: the
// hash is recomputed from the file on every build, so editing the deck's
// scaling script keeps working, while a script that appears in the served page
// by any other route has no matching hash. Only pilot-deck.html has one; the
// three legal pages have none and so keep inline script blocked outright,
// which src/legalPages.test.ts independently holds them to.
function docsCsp(html: string): string {
  const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(
    ([, body]) => `'sha256-${createHash('sha256').update(body, 'utf-8').digest('base64')}'`,
  )
  return CSP.replace("style-src 'self'", () => "style-src 'self' 'unsafe-inline'").replace(
    "script-src 'self'",
    () => ["script-src 'self'", ...hashes].join(' '),
  )
}

// Build-only: Vite's dev server injects CSS via inline <style> tags for
// HMR, which style-src without 'unsafe-inline' blocks. The deployed app —
// what this CSP actually protects — always gets it; dev mode is
// unaffected, since the production build extracts CSS to a real file.
function cspPlugin(): Plugin {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}

// Standalone pages under docs/ — the pilot slide deck, and the privacy and
// terms pages — are linked from the app's About drawer, but Vite's build only
// ever outputs the app itself, so docs/ and the repo-root assets/ screenshots
// the deck references aren't part of the bundle and the links 404 once
// deployed. Copy just what those pages need into dist/ so they resolve the
// same in production as they do from the repo. Anything added here is already
// covered by the docs/ entries in globIgnores and navigateFallbackDenylist
// below.
const STATIC_DOC_PAGES = [
  'pilot-deck.html',
  'privacy.html',
  'terms.html',
  'consumer-health-data.html',
]

function copyStaticDocsPlugin(): Plugin {
  const root = fileURLToPath(new URL('.', import.meta.url))
  let outDir = ''
  return {
    name: 'copy-static-docs',
    apply: 'build',
    configResolved(config: ResolvedConfig) {
      // Respect whatever outDir this build actually resolved to (normally
      // dist/, but e.g. csp.test.ts points it at a temp directory instead).
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      mkdirSync(resolve(outDir, 'docs'), { recursive: true })
      for (const page of STATIC_DOC_PAGES) {
        // cspPlugin's transformIndexHtml only ever reaches index.html, so
        // these pages used to ship with no CSP at all — leaving the privacy
        // policy and the terms, the two documents a reader has the most reason
        // to trust, as the only unprotected pages in the deployment. Inject
        // the policy as each page is copied; see docsCsp for what it adjusts
        // and why, and note that it is derived from the same CSP constant the
        // app itself uses rather than being a second copy of the string.
        const html = readFileSync(resolve(root, 'docs', page), 'utf-8')
        const withCsp = html.replace(
          /<head>/i,
          (head) =>
            `${head}\n    <meta http-equiv="Content-Security-Policy" content="${docsCsp(html)}">`,
        )
        if (withCsp === html) {
          // If a page's <head> is ever reformatted past this pattern, the copy
          // would silently go back to shipping unprotected — which is the exact
          // state being fixed here, and is invisible in a green build.
          throw new Error(`docs/${page}: no <head> tag to inject the CSP into.`)
        }
        writeFileSync(resolve(outDir, 'docs', page), withCsp)
      }
      mkdirSync(resolve(outDir, 'assets'), { recursive: true })
      for (const file of readdirSync(resolve(root, 'assets'))) {
        if (file.endsWith('.jpg')) {
          copyFileSync(resolve(root, 'assets', file), resolve(outDir, 'assets', file))
        }
      }
      // Ship the license with the deployment, not just in the repo. Apache-2.0
      // §7 and §8 disclaim warranty and liability for anyone who receives the
      // Work — and a browser running this app has received it. Those
      // disclaimers attach by license, without depending on the user having
      // accepted the Terms, so they are the fallback if assent is ever
      // disputed. Costs one file.
      copyFileSync(resolve(root, 'LICENSE'), resolve(outDir, 'LICENSE.txt'))
      // Same reasoning, other direction: the third-party notices cover code
      // that is served to the browser, and MIT, ISC and Apache-2.0 all
      // condition the grant on the notice travelling with the copy. Keeping
      // the file only in the repository discharges nothing for someone who
      // received the app from the deployed site.
      copyFileSync(
        resolve(root, 'THIRD_PARTY_NOTICES.md'),
        resolve(outDir, 'THIRD_PARTY_NOTICES.md'),
      )
    },
  }
}

export default defineConfig({
  // GitHub Pages serves a project site from /<repo>/ — the deploy workflow
  // sets BASE_PATH from the repo name; local dev/build stays at the root.
  base: process.env.BASE_PATH ?? '/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __COMMIT_HASH__: JSON.stringify(commitHash),
  },
  plugins: [
    cspPlugin(),
    copyStaticDocsPlugin(),
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'Receipts Express',
        short_name: 'Receipts Express',
        description: 'Scan receipts, organize expense reports, export polished PDFs.',
        // The install identity, and the one field here that must never change.
        // A browser uses `id` to decide whether an install it is looking at is
        // the app it already has; edit it and every existing installation stops
        // matching, so an update lands as a second, separate app sitting beside
        // the first — with the original's IndexedDB data stranded in it, since
        // this app stores everything on the device and has no server copy to
        // restore from. It is resolved against the manifest's own URL, so this
        // is written as the GitHub Pages project path the app actually deploys
        // to. Renaming the repository would change that path; if that ever
        // happens, the right move is to accept the mismatch, not to "fix" this.
        id: '/Receipts-Express/',
        categories: ['finance', 'productivity', 'utilities'],
        theme_color: '#0f766e',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // OCR/PDF engine files are large, so they're cached on first use
        // instead of being precached (see runtimeCaching below)
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // None of these are part of the app bundle itself: the OCR and PDF
        // engines are cached on first use instead (see runtimeCaching
        // below), and everything under docs/ is a standalone static page —
        // precaching those would otherwise bump the service worker (forcing a
        // re-download for every app user) on every unrelated slide-deck or
        // policy-wording edit.
        // The last three exclude jsPDF's optional .html()-renderer deps
        // (canvg's polyfill chunk, html2canvas, dompurify) — this app never
        // calls .html(), but Rollup can't prove that from jsPDF's own dynamic
        // imports, so it emits them as separate chunks that would otherwise
        // sit in the mandatory install-time precache with no code path that
        // can ever execute them. Distinguished from the real `index-*.js`
        // entry chunk by the `.es` suffix, which only these carry.
        // fonts/ is here for the same reason as docs/: globPatterns above
        // matches woff2, but the webfonts exist only for the standalone
        // pages under docs/ — the app's own UI uses the system stack. Left
        // in, they would sit in every user's mandatory install-time
        // precache to style pages most users never open.
        globIgnores: ['tesseract/**', 'pdfjs/**', 'docs/**', 'fonts/**', 'assets/index.es-*.js', 'assets/html2canvas.esm-*.js', 'assets/purify.es-*.js'],
        // vite-plugin-pwa's generateSW registers an SPA navigation route that
        // serves index.html (the app shell) for every navigation request. The
        // pilot deck and the privacy/terms pages are real, standalone pages
        // under docs/, so without this their links keep the URL bar at e.g.
        // docs/privacy.html but render the app instead. Exempt docs/ so the
        // browser fetches the real page.
        // Matched against the full pathname, which includes the /<repo>/ base
        // on GitHub Pages, so this stays unanchored rather than /^\/docs\//.
        navigateFallbackDenylist: [/\/docs\//],
        runtimeCaching: [
          {
            urlPattern: /\/tesseract\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tesseract-engine',
              // Without maxAgeSeconds these entries never expire, so a
              // future security patch to tesseract.js/pdfjs-dist would
              // never reach an already-onboarded device short of manually
              // clearing site data.
              expiration: { maxEntries: 12, maxAgeSeconds: 30 * 24 * 60 * 60 }
            }
          },
          {
            urlPattern: /\/pdfjs\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pdfjs-engine',
              expiration: { maxEntries: 40, maxAgeSeconds: 30 * 24 * 60 * 60 }
            }
          },
          {
            // The pages under docs/ are kept out of the precache above on
            // purpose: precaching them would make every unrelated policy or
            // slide-deck edit re-download the whole install for every user.
            // But with no runtime rule either they were never cached at all,
            // so the Terms and Privacy links in the first-run gate simply
            // failed offline — in the one mode this app tells people it works
            // in. StaleWhileRevalidate is the fit: a reader gets the stored
            // copy immediately, and the background refresh means an amended
            // policy reaches them on the next visit without the page ever
            // being unavailable in between.
            urlPattern: /\/docs\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'docs-pages',
              expiration: { maxEntries: 8, maxAgeSeconds: 30 * 24 * 60 * 60 }
            }
          },
          {
            // Excluded from the precache above, so cache them the first time
            // someone actually opens a docs/ page. This rule covers the font
            // files only — the pages that use them are handled by the docs/
            // rule above.
            urlPattern: /\/fonts\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'webfonts',
              expiration: { maxEntries: 8, maxAgeSeconds: 365 * 24 * 60 * 60 }
            }
          }
        ]
      }
    })
  ]
})
