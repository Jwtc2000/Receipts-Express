// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applySeason, bannerColor, currentSeason, seasonOn } from './season'
import { contrastText, dayColor } from './colors'

const day = (month: number, date: number) => new Date(2026, month - 1, date, 12)

describe('seasonOn', () => {
  it.each([
    [day(11, 14), null],
    [day(11, 15), 'harvest'],
    [day(11, 26), 'harvest'],
    [day(11, 30), 'harvest'],
    [day(12, 1), 'winter'],
    [day(12, 31), 'winter'],
    [new Date(2027, 0, 6, 23, 59), 'winter'],
    [new Date(2027, 0, 7, 0, 1), null],
    [day(7, 4), null],
  ])('%s is %s', (date, season) => {
    expect(seasonOn(date)).toBe(season)
  })
})

describe('applySeason', () => {
  function page(): Document {
    const doc = document.implementation.createHTMLDocument('')
    const meta = doc.createElement('meta')
    meta.name = 'theme-color'
    meta.content = '#0f766e'
    doc.head.append(meta)
    return doc
  }

  it('marks the page and colours the browser chrome for the season', () => {
    const doc = page()
    expect(applySeason(doc, day(12, 15))).toBe('winter')
    expect(doc.documentElement.dataset.season).toBe('winter')
    expect(currentSeason(doc)).toBe('winter')
    expect(doc.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#14532d')
  })

  it('takes the mark off again outside the season', () => {
    const doc = page()
    applySeason(doc, day(11, 20))
    expect(applySeason(doc, day(2, 1))).toBeNull()
    expect(doc.documentElement.dataset.season).toBeUndefined()
    expect(currentSeason(doc)).toBeNull()
    expect(doc.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#0f766e')
  })
})

/*
 * The season's colours, read from styles.css itself, against WCAG AA: 4.5:1
 * for text, 3:1 for the gold that is only ever drawn as a glyph or a border.
 * A colour changed there without checking fails here.
 */
describe('holiday colours are readable', () => {
  // From the project root: under jsdom, import.meta.url is not a file URL.
  const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf-8')
  function tokens(selector: string): Record<string, string> {
    const at = css.indexOf(`${selector} {`)
    expect(at, selector).toBeGreaterThan(-1)
    const block = css.slice(at, css.indexOf('}', at))
    return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]))
  }
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    const c = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b)
  }
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
  }
  const base = tokens(':root[data-season]')
  const muted = base.muted ?? tokens(':root').muted

  it.each(['harvest', 'winter'])('the %s header carries white text', (season) => {
    const t = tokens(`:root[data-season='${season}']`)
    expect(contrast('#ffffff', t['header-gradient-a'])).toBeGreaterThanOrEqual(4.5)
    expect(contrast('#ffffff', t['header-gradient-b'])).toBeGreaterThanOrEqual(4.5)
  })

  it('buttons, amounts, the summary bar and muted text stay readable', () => {
    expect(contrast('#ffffff', base.teal)).toBeGreaterThanOrEqual(4.5) // white on buttons
    expect(contrast('#ffffff', base['purple-dark'])).toBeGreaterThanOrEqual(4.5) // floating button
    expect(contrast(base.purple, '#ffffff')).toBeGreaterThanOrEqual(4.5) // amounts on cards
    expect(contrast(base.purple, base.bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(base['teal-dark'], base['teal-light'])).toBeGreaterThanOrEqual(4.5) // summary bar
    expect(contrast(base['teal-dark'], '#ffffff')).toBeGreaterThanOrEqual(4.5) // greeting
    expect(contrast(muted, base.bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(base.gold, '#ffffff')).toBeGreaterThanOrEqual(3) // glyphs and borders only
  })
})

describe('day banner colours', () => {
  const lum = ([r, g, b]: number[]) => {
    const c = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b)
  }
  const ratio = (a: number[], b: number[]) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
  }

  it('are the everyday ones outside the season, the same as the PDF', () => {
    for (let day = -2; day <= 8; day++) expect(bannerColor(day, null)).toEqual(dayColor(day))
  })

  it.each(['harvest', 'winter'] as const)('in %s, six distinct colours, each readable under its text', (season) => {
    const colors = Array.from({ length: 6 }, (_, i) => bannerColor(i + 1, season))
    expect(new Set(colors.map(String)).size).toBe(6)
    expect(bannerColor(7, season)).toEqual(colors[0]) // and they cycle
    expect(bannerColor(0, season)).toEqual(colors[5]) // pre-trip days too
    for (const c of colors) expect(ratio(contrastText(c), c), String(c)).toBeGreaterThanOrEqual(4.5)
  })
})
