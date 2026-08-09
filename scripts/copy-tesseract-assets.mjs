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
for (const variant of ['', '-simd', '-lstm', '-simd-lstm']) {
  copies.push([
    `node_modules/tesseract.js-core/tesseract-core${variant}.wasm.js`,
    `tesseract-core${variant}.wasm.js`,
  ])
  copies.push([
    `node_modules/tesseract.js-core/tesseract-core${variant}.wasm`,
    `tesseract-core${variant}.wasm`,
  ])
}

for (const [from, to] of copies) {
  fs.copyFileSync(path.join(root, from), path.join(dest, to))
}
console.log(`Copied ${copies.length} Tesseract assets to public/tesseract/`)
