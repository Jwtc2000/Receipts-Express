// Copies the two variable webfonts (Inter, Outfit) from node_modules into
// public/fonts so the standalone pages under docs/ are fully self-hosted —
// no Google Fonts, no CDN call at runtime.
//
// Why this exists: docs/pilot-deck.html used to pull both families from
// fonts.googleapis.com. That link is opened from inside the app, so it sent
// every reader's IP to Google — contradicting the "no third-party requests
// of any kind" claim in SECURITY.md and, worse, in the privacy policy
// itself. src/legalPages.test.ts now fails the build if any docs/ page
// reaches off-origin again.
//
// Variable rather than static weights: the deck styles text at weights 300
// through 900, which would be seven static files per family. One variable
// file per family covers the whole 100-900 axis in less space — and renders
// the 900 for real, which the old Google request never even asked for.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dest = path.join(root, 'public', 'fonts')
fs.mkdirSync(dest, { recursive: true })

// Latin only. The app's own UI ships no webfont at all, and these pages are
// English; shipping Cyrillic/Greek/Vietnamese subsets would multiply the
// payload for glyphs no page here renders.
const families = [
  { pkg: '@fontsource-variable/inter', file: 'inter-latin-wght-normal.woff2' },
  { pkg: '@fontsource-variable/outfit', file: 'outfit-latin-wght-normal.woff2' },
]

let copied = 0
for (const { pkg, file } of families) {
  const from = path.join(root, 'node_modules', pkg, 'files', file)
  if (!fs.existsSync(from)) {
    // A fontsource major bump can rename the subset files. Fail loudly here
    // rather than silently shipping pages that fall back to system fonts.
    throw new Error(`Expected font file missing: ${from}. Check ${pkg}'s files/ directory.`)
  }
  fs.copyFileSync(from, path.join(dest, file))
  copied++

  // OFL-1.1 requires the licence travel with the fonts it covers.
  const licence = path.join(root, 'node_modules', pkg, 'LICENSE')
  if (fs.existsSync(licence)) {
    fs.copyFileSync(licence, path.join(dest, `${file.split('-')[0]}-OFL.txt`))
    copied++
  }
}

console.log(`Copied ${copied} font assets to public/fonts/`)
