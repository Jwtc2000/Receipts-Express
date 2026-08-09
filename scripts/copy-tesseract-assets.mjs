// Copies the Tesseract OCR engine (worker, WASM cores, English language
// data) and its license notices from node_modules into public/tesseract so
// the app is fully self-hosted — no CDN calls at runtime.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dest = path.join(root, 'public', 'tesseract')
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
// Every WASM core the package ships, discovered rather than listed.
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
const cores = fs.readdirSync(coreDir).filter((f) => /^tesseract-core.*\.wasm(\.js)?$/.test(f))
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
console.log(`Copied ${copies.length} Tesseract assets to public/tesseract/`)
