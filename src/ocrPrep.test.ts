import { describe, expect, it } from 'vitest'
import { darkBandRows } from './ocrPrep'

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
