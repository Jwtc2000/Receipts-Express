import { describe, expect, it } from 'vitest'
import { darkBandRows, enlargement, inkThreshold, joinDotsGray, lineHeightOf, median3, tiltOf } from './ocrPrep'

const W = 100
const H = 60

/** A light page, with `paint(x, y)` returning a grey level where it applies. */
function image(paint: (x: number, y: number) => number | undefined): Uint8ClampedArray {
  const g = new Uint8ClampedArray(W * H).fill(235)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = paint(x, y)
    if (v !== undefined) g[y * W + x] = v
  }
  return g
}

describe('darkBandRows', () => {
  it('finds a dark band with light text in it, with a margin for its edges', () => {
    // Rows 20-35 dark; one pixel in seven is text, as in a line of print.
    const g = image((x, y) => (y >= 20 && y < 36 ? (x % 7 === 0 ? 250 : 30) : undefined))
    expect(darkBandRows(g, W, H)).toEqual([[18, 38]])
  })

  it('keeps a band broken by a light row as one range, so no row is inverted twice', () => {
    // Rows 20-29 and 32-41 dark, rows 30-31 light: with their margins the
    // two runs overlap.
    const g = image((x, y) => ((y >= 20 && y < 30) || (y >= 32 && y < 42) ? (x % 7 === 0 ? 250 : 30) : undefined))
    expect(darkBandRows(g, W, H)).toEqual([[18, 44]])
  })

  it('leaves a white receipt on a dark table alone', () => {
    // The middle 40% of every row is paper: a quarter of each row is light.
    const g = image((x) => (x < 30 || x >= 70 ? 40 : undefined))
    expect(darkBandRows(g, W, H)).toEqual([])
  })

  it('ignores a dark rule too thin to hold text', () => {
    const g = image((_x, y) => (y >= 30 && y < 34 ? 20 : undefined))
    expect(darkBandRows(g, W, H)).toEqual([])
  })

  it('leaves a page that is dark nearly throughout to the engine', () => {
    const g = image((_x, y) => (y >= 4 ? 20 : undefined))
    expect(darkBandRows(g, W, H)).toEqual([])
  })
})

describe('joinDotsGray', () => {
  it('joins a row of separate dots into a solid stroke', () => {
    // Paper at 230, with a horizontal line printed as 1-pixel dots every 4 pixels.
    const g = new Uint8ClampedArray(W * H).fill(230)
    for (let x = 10; x < 90; x += 4) g[30 * W + x] = 40
    const out = joinDotsGray(g, W, H)
    // Every pixel along the line, including the gaps between dots, is now dark.
    for (let x = 12; x < 86; x++) expect(out[30 * W + x], `x=${x}`).toBeLessThan(128)
    // Paper away from the line stays light.
    expect(out[10 * W + 50]).toBeGreaterThan(200)
  })
})

describe('cleaning up a photo for a second reading', () => {
  // A 200x140 page with five "lines of text": dark bands 12 rows tall,
  // tilted by `degrees`.
  function page(degrees: number): Uint8ClampedArray {
    const w = 200
    const h = 140
    const g = new Uint8ClampedArray(w * h).fill(235)
    const slope = Math.tan((degrees * Math.PI) / 180)
    for (let line = 0; line < 5; line++) {
      for (let x = 10; x < 190; x++) {
        const top = Math.round(12 + line * 24 + x * slope)
        for (let y = top; y < top + 12; y++) if (y >= 0 && y < h) g[y * w + x] = 30
      }
    }
    return g
  }

  it('finds the threshold between ink and paper', () => {
    const t = inkThreshold(page(0))
    expect(t).toBeGreaterThanOrEqual(30)
    expect(t).toBeLessThan(235)
  })

  it('measures how far the text is tilted', () => {
    expect(tiltOf(page(3), 200, 140)).toBeCloseTo(3, 0)
    expect(tiltOf(page(-2), 200, 140)).toBeCloseTo(-2, 0)
    expect(tiltOf(page(0), 200, 140)).toBe(0)
  })

  it('measures the height of a line of text', () => {
    expect(lineHeightOf(page(0), 200, 140)).toBe(12)
  })

  it('takes out specks with the median filter and keeps strokes', () => {
    const g = new Uint8ClampedArray(W * H).fill(230)
    g[10 * W + 10] = 0 // a speck
    for (let y = 30; y < 33; y++) for (let x = 20; x < 80; x++) g[y * W + x] = 20 // a stroke 3 rows thick
    const out = median3(g, W, H)
    expect(out[10 * W + 10]).toBe(230)
    expect(out[31 * W + 50]).toBe(20)
  })

  it('enlarges small text to about 30 pixels a line, within its limits', () => {
    expect(enlargement(10, 500, 500)).toBe(3)
    expect(enlargement(30, 500, 500)).toBe(1)
    expect(enlargement(4, 500, 500)).toBe(4) // no more than 4x
    expect(enlargement(10, 2000, 3000)).toBe(1) // no larger than 6 megapixels
    expect(enlargement(0, 500, 500)).toBe(1) // line height unknown
  })
})
