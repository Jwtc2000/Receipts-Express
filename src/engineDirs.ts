import { version as pdfjs } from 'pdfjs-dist/package.json'
import { version as tesseract } from 'tesseract.js/package.json'
import { version as tesseractCore } from 'tesseract.js-core/package.json'
import { version as tesseractData } from '@tesseract.js-data/eng/package.json'

// The vendored engines are served from directories named for the installed
// package versions; scripts/engine-dirs.mjs computes the same names for the
// copy step, and src/engineDirs.test.ts holds the two together.
//
// The version is in the path because the service worker serves these files
// cache-first. At a fixed URL, an upgrade left returning devices running the
// new PDF.js API against the previous release's cached worker; PDF.js rejects
// that pair, so every PDF import failed for up to 30 days and the app blamed
// the user's file. A new version is now a new URL and so a cache miss.
export const PDFJS_DIR = `pdfjs/${pdfjs}`
// "-int": the integerised LSTM-only English model (scripts/engine-dirs.mjs).
export const TESSERACT_DIR = `tesseract/${tesseract}-${tesseractCore}-${tesseractData}-int`
