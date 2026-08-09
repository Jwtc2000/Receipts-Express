import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  dayColor,
  contrastText,
  rgbToCss,
  HEADER_GRADIENT_A,
  HEADER_GRADIENT_B,
  type Rgb,
} from './colors'

describe('dayColor', () => {
  it('starts at the header gradient\'s first color for Day 1', () => {
    expect(dayColor(1)).toEqual(HEADER_GRADIENT_A)
  })

  it('reaches the header gradient\'s second color at the last step', () => {
    // The palette cycles every 6 days (see DAY_COLOR_STEPS in colors.ts).
    expect(dayColor(6)).toEqual(HEADER_GRADIENT_B)
  })

  it('gives every day in the cycle a distinct color', () => {
    const colors = [1, 2, 3, 4, 5, 6].map((d) => dayColor(d).join(','))
    expect(new Set(colors).size).toBe(6)
  })

  it('cycles back to Day 1\'s color after the palette length', () => {
    expect(dayColor(7)).toEqual(dayColor(1))
    expect(dayColor(12)).toEqual(dayColor(6))
  })
})

describe('contrastText', () => {
  it('picks white text for a dark background', () => {
    expect(contrastText([0, 0, 0])).toEqual([255, 255, 255])
  })

  it('picks black text for a light background', () => {
    expect(contrastText([255, 255, 255])).toEqual([0, 0, 0])
  })

  // Both endpoints are dark, so both take white. That is a property of the
  // palette, not an accident: the header, the day banners and the PDF all draw
  // their text with contrastText, and a light endpoint would flip half the
  // sweep to black text partway along the gradient.
  it('picks white for the teal gradient endpoint', () => {
    expect(contrastText(HEADER_GRADIENT_A)).toEqual([255, 255, 255])
  })

  it('picks white for the violet gradient endpoint', () => {
    expect(contrastText(HEADER_GRADIENT_B)).toEqual([255, 255, 255])
  })

  it('gives every color in the day cycle at least 4.5:1 contrast with its chosen text color', () => {
    function relativeLuminance([r, g, b]: [number, number, number]): number {
      const ch = (c: number) => {
        const s = c / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
    }
    function contrastRatio(a: number, b: number): number {
      const hi = Math.max(a, b)
      const lo = Math.min(a, b)
      return (hi + 0.05) / (lo + 0.05)
    }
    for (let day = 1; day <= 6; day++) {
      const bg = dayColor(day)
      const fg = contrastText(bg)
      const ratio = contrastRatio(relativeLuminance(bg), relativeLuminance(fg))
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('rgbToCss', () => {
  it('formats an RGB tuple as a CSS rgb() string', () => {
    expect(rgbToCss([102, 0, 153])).toBe('rgb(102, 0, 153)')
  })
})

/**
 * The two gradient endpoints are written out by hand in six places. Five of
 * them are stylesheets the bundler never looks at together — src/styles.css
 * and the inline <style> block in each of the four docs/ pages — so a change
 * made in one is invisible to every other, and the app header can drift out of
 * step with the header on the privacy policy without anything failing. The
 * sixth, the pilot deck, hides the pair inside a `--brand-gradient` shorthand
 * under a different variable name, which is how it was missed the last time
 * the palette moved.
 *
 * src/colors.ts is the source of truth because it is the copy the running app
 * actually computes from: the day-banner sequence and the PDF export are
 * interpolated between these two values. Everything below is checked against
 * it rather than against a literal, so this test cannot itself go stale when
 * the palette changes — it will simply demand that the other five follow.
 */
describe('brand gradient', () => {
  function toHex([r, g, b]: Rgb): string {
    return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`
  }

  const HEX_A = toHex(HEADER_GRADIENT_A)
  const HEX_B = toHex(HEADER_GRADIENT_B)

  function readRepo(path: string): string {
    return readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf-8')
  }

  // Every copy that names the endpoints with the same two custom properties.
  const NAMED_COPIES = [
    'src/styles.css',
    'docs/privacy.html',
    'docs/terms.html',
    'docs/consumer-health-data.html',
  ] as const

  it.each(NAMED_COPIES)('%s declares the endpoints src/colors.ts computes from', (path) => {
    const source = readRepo(path)
    expect(source).toMatch(new RegExp(`--header-gradient-a:\\s*${HEX_A}\\s*;`, 'i'))
    expect(source).toMatch(new RegExp(`--header-gradient-b:\\s*${HEX_B}\\s*;`, 'i'))
  })

  // The deck has no separate endpoint tokens — both hexes live inside one
  // linear-gradient() value — so it is matched on the declaration rather than
  // on a variable name.
  it('docs/pilot-deck.html carries the same endpoints in --brand-gradient', () => {
    const declaration = /--brand-gradient:\s*([^;]+);/i.exec(readRepo('docs/pilot-deck.html'))
    expect(declaration, 'docs/pilot-deck.html no longer declares --brand-gradient').not.toBeNull()
    const value = declaration![1].toLowerCase()
    expect(value).toContain(HEX_A)
    expect(value).toContain(HEX_B)
  })
})
