import { readFileSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
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
        copyFileSync(resolve(root, 'docs', page), resolve(outDir, 'docs', page))
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
            // Excluded from the precache above, so cache them the first time
            // someone actually opens a docs/ page — after which the privacy
            // policy and terms read identically offline.
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
