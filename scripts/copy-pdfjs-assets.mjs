// Copies the PDF.js engine (worker, WASM codecs, standard fonts, CMaps)
// from node_modules into public/pdfjs so PDF receipt uploads are fully
// self-hosted — no CDN calls at runtime, matching the Tesseract setup.
import fs from 'node:fs'
import path from 'node:path'
import { PDFJS_DIR, root } from './engine-dirs.mjs'

const pkgRoot = path.join(root, 'node_modules', 'pdfjs-dist')
// The destination can be given as an argument so that a test can run this
// exact copy into a scratch directory and read what comes out of it
// (src/pdfAssets.test.ts). The build never passes one.
//
// Without one, the files go into a directory named for the installed
// pdfjs-dist version (see scripts/engine-dirs.mjs for why), and everything
// already under public/pdfjs is removed first: a directory left over from the
// previous version would otherwise be copied into the build and served.
const dest = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'public', PDFJS_DIR)
if (!process.argv[2]) fs.rmSync(path.join(root, 'public', 'pdfjs'), { recursive: true, force: true })
fs.mkdirSync(dest, { recursive: true })

// pdfjs-dist carries four LiberationSans-*.ttf files as its fallback for
// Helvetica, with LICENSE_LIBERATION beside them: Red Hat's Liberation font
// licence, which is GPL v2 with two exceptions. Everything else copied from
// pdfjs-dist is under permissive terms or CC0, and what GPL v2 §3 asks of a
// site that serves those four files is not a question this project wants
// open, so they are left behind in node_modules.
//
// What that costs is narrow. PDF.js only reaches for them when a PDF names
// Helvetica without embedding it and the device has none of the local fonts
// it tries first (Helvetica, Arial, Liberation Sans, DejaVu Sans and others).
// On such a device the text is drawn in the browser's generic sans-serif.
const NOT_SHIPPED = /^(LiberationSans-.*\.ttf|LICENSE_LIBERATION)$/

function copyFile(from, to) {
  fs.copyFileSync(path.join(pkgRoot, from), path.join(dest, to))
}

function copyDir(from, to) {
  fs.cpSync(path.join(pkgRoot, from), path.join(dest, to), {
    recursive: true,
    filter: (source) => !NOT_SHIPPED.test(path.basename(source)),
  })
}

// cpSync adds and overwrites but never deletes, so a copy made before a file
// was excluded would stay in public/ and keep shipping from this machine.
fs.rmSync(path.join(dest, 'standard_fonts'), { recursive: true, force: true })

copyFile('build/pdf.worker.min.mjs', 'pdf.worker.min.mjs')
copyDir('standard_fonts', 'standard_fonts')
copyDir('cmaps', 'cmaps')
copyDir('wasm', 'wasm')
copyDir('iccs', 'iccs')

console.log(`Copied PDF.js worker + assets to ${path.relative(root, dest)}/`)
