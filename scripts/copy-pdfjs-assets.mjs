// Copies the PDF.js engine (worker, WASM codecs, standard fonts, CMaps)
// from node_modules into public/pdfjs so PDF receipt uploads are fully
// self-hosted — no CDN calls at runtime, matching the Tesseract setup.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkgRoot = path.join(root, 'node_modules', 'pdfjs-dist')
const dest = path.join(root, 'public', 'pdfjs')
fs.mkdirSync(dest, { recursive: true })

function copyFile(from, to) {
  fs.copyFileSync(path.join(pkgRoot, from), path.join(dest, to))
}

function copyDir(from, to) {
  fs.cpSync(path.join(pkgRoot, from), path.join(dest, to), { recursive: true })
}

copyFile('build/pdf.worker.min.mjs', 'pdf.worker.min.mjs')
copyDir('standard_fonts', 'standard_fonts')
copyDir('cmaps', 'cmaps')
copyDir('wasm', 'wasm')
copyDir('iccs', 'iccs')

console.log('Copied PDF.js worker + assets to public/pdfjs/')
