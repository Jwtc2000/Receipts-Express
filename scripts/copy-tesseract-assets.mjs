// Copies the Tesseract OCR engine (worker, WASM cores, English language
// data) and its license notices from node_modules into public/tesseract so
// the app is fully self-hosted — no CDN calls at runtime.
import fs from 'node:fs'
import path from 'node:path'
import { TESSERACT_DIR, root } from './engine-dirs.mjs'

// The files go into a directory named for the installed package versions (see
// scripts/engine-dirs.mjs for why). Everything already under public/tesseract
// is removed first: a directory left over from a previous version would
// otherwise be copied into the build and served, 60 MB at a time.
//
// A destination can be given as an argument, so a test can run this exact
// copy into a scratch directory (src/tesseractAssets.test.ts).
const dest = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'public', TESSERACT_DIR)
if (!process.argv[2]) fs.rmSync(path.join(root, 'public', 'tesseract'), { recursive: true, force: true })
fs.mkdirSync(dest, { recursive: true })

const copies = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  // worker.min.js opens with "For license information please see
  // worker.min.js.LICENSE.txt" — a reference that resolved to a 404 on the
  // live site while only the code was copied. The file it points at carries
  // the MIT and BSD-3-Clause notices for buffer, ieee754, regenerator-runtime
  // and zlib.js, which are bundled into the worker and have no other notice
  // anywhere in the deployment. Copying it both repairs the dangling
  // reference and discharges those four notices in the form their own authors
  // wrote them.
  [
    'node_modules/tesseract.js/dist/worker.min.js.LICENSE.txt',
    'worker.min.js.LICENSE.txt',
  ],
  // The four WASM cores below are the largest thing this app serves and, until
  // this line, shipped with no license text beside them at all. Named for the
  // core rather than left as bare LICENSE so it cannot be mistaken for a
  // license covering everything else in this directory.
  ['node_modules/tesseract.js-core/LICENSE', 'LICENSE-tesseract-core.txt'],
  ['node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz', 'eng.traineddata.gz'],
]
// The LSTM-only WASM cores the package ships, discovered rather than listed.
//
// tesseract.js picks a core at runtime from what the browser supports, and the
// set of variants grows between majors: v5 shipped four, v7 added the two
// relaxed-SIMD builds and prefers them on Chromium. A hardcoded list therefore
// fails in the worst possible way — the one core the app asks for is the one
// never copied, the request 404s inside the OCR worker, and every scan falls
// back to manual entry behind a soft "Couldn't read the receipt" banner. No
// crash, no console error, a green build and a green test suite.
//
// Globbing keeps this correct across upgrades. The guard below is the other
// half: if the package ever ships no cores under this name, that is a
// restructure, and it should stop the build rather than quietly ship an app
// whose scanning does nothing.
const coreDir = path.join(root, 'node_modules/tesseract.js-core')
//
// Only the LSTM-only builds, and only their .wasm.js scripts. src/ocr.ts asks
// for OEM 1 (LSTM only), so tesseract.js picks one of the three -lstm cores
// by what the browser supports and never asks for the others; and each
// .wasm.js carries its WebAssembly embedded, so the separate .wasm files are
// never fetched either. Copying everything shipped about 33 MB that nothing
// could load. src/tesseractAssets.test.ts reads the names tesseract.js can
// ask for out of its own source and checks each one is here.
const cores = fs.readdirSync(coreDir).filter((f) => /^tesseract-core.*-lstm\.wasm\.js$/.test(f))
if (cores.length === 0) {
  throw new Error(
    `No tesseract-core*.wasm files found in ${coreDir} — the package layout changed. ` +
      'OCR would silently fall back to manual entry; fix the copy before shipping.',
  )
}
for (const file of cores) {
  copies.push([`node_modules/tesseract.js-core/${file}`, file])
}

for (const [from, to] of copies) {
  fs.copyFileSync(path.join(root, from), path.join(dest, to))
}
console.log(`Copied ${copies.length} Tesseract assets to ${path.relative(root, dest)}/`)
