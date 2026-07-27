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

const CSP =
  "default-src 'self'; connect-src 'self'; img-src 'self' blob: data:; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; worker-src 'self' blob:"

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

// The pilot slide deck (docs/pilot-deck.html) is linked from the app's About
// drawer, but Vite's build only ever outputs the app itself — docs/ and the
// repo-root assets/ screenshots it references aren't part of the bundle, so
// the link 404s once deployed. Copy just what the deck needs into dist/ so
// the link resolves the same in production as it does from the repo.
function copyPilotDeckPlugin(): Plugin {
  const root = fileURLToPath(new URL('.', import.meta.url))
  let outDir = ''
  return {
    name: 'copy-pilot-deck',
    apply: 'build',
    configResolved(config: ResolvedConfig) {
      // Respect whatever outDir this build actually resolved to (normally
      // dist/, but e.g. csp.test.ts points it at a temp directory instead).
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      mkdirSync(resolve(outDir, 'docs'), { recursive: true })
      copyFileSync(resolve(root, 'docs/pilot-deck.html'), resolve(outDir, 'docs/pilot-deck.html'))
      mkdirSync(resolve(outDir, 'assets'), { recursive: true })
      for (const file of readdirSync(resolve(root, 'assets'))) {
        if (file.endsWith('.jpg')) {
          copyFileSync(resolve(root, 'assets', file), resolve(outDir, 'assets', file))
        }
      }
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
    copyPilotDeckPlugin(),
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
        // below), and the pilot deck is a standalone static page —
        // precaching it would otherwise bump the service worker (forcing a
        // re-download for every app user) on every unrelated slide-deck edit.
        globIgnores: ['tesseract/**', 'pdfjs/**', 'docs/**'],
        // vite-plugin-pwa's generateSW registers an SPA navigation route that
        // serves index.html (the app shell) for every navigation request. The
        // pilot deck is a real, standalone page under docs/, so without this
        // the deck link keeps the URL bar at docs/pilot-deck.html but renders
        // the app instead. Exempt docs/ so the browser fetches the real page.
        // Matched against the full pathname, which includes the /<repo>/ base
        // on GitHub Pages, so this stays unanchored rather than /^\/docs\//.
        navigateFallbackDenylist: [/\/docs\//],
        runtimeCaching: [
          {
            urlPattern: /\/tesseract\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tesseract-engine',
              expiration: { maxEntries: 12 }
            }
          },
          {
            urlPattern: /\/pdfjs\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pdfjs-engine',
              expiration: { maxEntries: 40 }
            }
          }
        ]
      }
    })
  ]
})
