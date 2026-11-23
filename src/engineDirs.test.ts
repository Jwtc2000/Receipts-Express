import { describe, expect, it } from 'vitest'
import { PDFJS_DIR, TESSERACT_DIR } from './engineDirs'
// @ts-expect-error -- plain .mjs build script, no type declarations
import * as copySide from '../scripts/engine-dirs.mjs'

/**
 * The app asks for the engines at a versioned path and the copy scripts put
 * them at one. They compute the path separately, because one side is bundled
 * and the other is a Node script, so nothing but this test stops them from
 * drifting. If they disagree the engines are copied to a directory the app
 * never requests: OCR falls back to manual entry and PDF import fails.
 */
describe('engine directories', () => {
  it('are the same for the app and for the copy scripts', () => {
    expect(PDFJS_DIR).toBe(copySide.PDFJS_DIR)
    expect(TESSERACT_DIR).toBe(copySide.TESSERACT_DIR)
  })

  it('carry the installed package versions', () => {
    expect(PDFJS_DIR).toMatch(/^pdfjs\/\d+\.\d+\.\d+/)
    expect(TESSERACT_DIR).toMatch(/^tesseract\/\d+\.\d+\.\d+-\d+\.\d+\.\d+-\d+\.\d+\.\d+/)
  })
})
