// Where the two vendored engines live under public/, shared by the copy
// scripts. Each directory is named for the installed package versions, and
// src/engineDirs.ts computes the same names for the app. The reason is the
// service worker: engine files are cached cache-first, so a file that keeps
// its URL across an upgrade keeps being served from the old copy. The PDF.js
// API in the app bundle then meets a worker from the previous release,
// refuses the mismatch, and every PDF import fails until the cache entry is
// dropped. A version in the path makes every upgrade a new URL.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function version(pkg) {
  return JSON.parse(fs.readFileSync(path.join(root, 'node_modules', pkg, 'package.json'), 'utf8')).version
}

export const PDFJS_DIR = `pdfjs/${version('pdfjs-dist')}`
// Three packages land in one directory, and any of them can move alone. The
// "-int" names which of the data package's two English models is shipped
// (see TESSERACT_MODEL), so changing model is a new URL as well.
export const TESSERACT_MODEL = '4.0.0_best_int'
export const TESSERACT_DIR = `tesseract/${version('tesseract.js')}-${version('tesseract.js-core')}-${version('@tesseract.js-data/eng')}-int`
