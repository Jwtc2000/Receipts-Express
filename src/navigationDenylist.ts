/**
 * Navigations the service worker leaves to the network instead of answering
 * with the app shell. Kept in its own module so vite.config.ts and the test
 * that checks the generated worker use the same expressions.
 *
 * - docs/: the pilot deck and the privacy and terms pages are standalone
 *   pages. Matched against the full pathname, which includes the /<repo>/
 *   base on GitHub Pages, so it stays unanchored.
 * - .txt and .md files: with the worker installed, opening LICENSE.txt or
 *   THIRD_PARTY_NOTICES.md by URL showed the app instead of the file. Workbox
 *   matches the path and query together, so the extension is matched in the
 *   path only: the app with a query ending in ".txt" still gets the app.
 */
export const NAVIGATION_DENYLIST: RegExp[] = [/\/docs\//, /^[^?]*\.(?:txt|md)(?:\?|$)/]
