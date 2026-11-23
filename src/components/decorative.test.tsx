// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { HeaderPlanes, SeasonGreeting } from './decorative'

afterEach(cleanup)

// Each flight's glyph name, after checking it is actually drawn: an <svg>
// with at least one shape in it. A flight that kept its name but lost its
// drawing would leave the header empty while the names still matched.
//
// The drawings must also follow the names: flights named alike draw the same
// svg, and flights named differently draw different ones. Otherwise every
// flight could draw, say, the plane while carrying the right names.
const glyphs = (container: HTMLElement) => {
  const drawingFor = new Map<string, string>()
  const names = [...container.querySelectorAll<HTMLElement>('.topbar-plane')].map((el) => {
    const name = el.dataset.glyph!
    const shapes = el.querySelectorAll('svg path, svg circle, svg rect, svg line')
    expect(shapes.length, `glyph "${name}" has no drawing`).toBeGreaterThan(0)
    const drawing = el.querySelector('svg')!.innerHTML
    if (drawingFor.has(name)) expect(drawing, `the two "${name}" flights draw differently`).toBe(drawingFor.get(name))
    drawingFor.set(name, drawing)
    return name
  })
  const drawings = [...drawingFor.values()]
  expect(new Set(drawings).size, 'two different glyph names draw the same thing').toBe(drawings.length)
  return names
}

describe('HeaderPlanes', () => {
  it('flies travel glyphs most of the year, with no snow', () => {
    const { container } = render(<HeaderPlanes season={null} />)
    expect(glyphs(container)).toEqual(['plane', 'coffee', 'fuel', 'car', 'bed', 'plane', 'coffee', 'car'])
    expect(container.querySelector('.topbar-snow')).toBeNull()
  })

  it('flies leaves, acorns and pumpkins around Thanksgiving', () => {
    const { container } = render(<HeaderPlanes season="harvest" />)
    expect(new Set(glyphs(container))).toEqual(new Set(['leaf', 'pumpkin', 'acorn', 'plane']))
    expect(container.querySelector('.topbar-snow')).toBeNull()
  })

  it('flies winter glyphs with snow behind them in December', () => {
    const { container } = render(<HeaderPlanes season="winter" />)
    expect(new Set(glyphs(container))).toEqual(new Set(['snowflake', 'tree', 'gift', 'star', 'ornament', 'plane']))
    expect(container.querySelector('.topbar-snow')).not.toBeNull()
  })

  it('puts only shapes that survive a quarter turn and a mirror on the turned and mirrored paths', () => {
    for (const season of ['harvest', 'winter'] as const) {
      const { container } = render(<HeaderPlanes season={season} />)
      for (const path of ['a', 'd']) {
        const glyph = container.querySelector<HTMLElement>(`.topbar-plane-${path}`)!.dataset.glyph
        expect(['leaf', 'snowflake', 'star'], `${season} path ${path}`).toContain(glyph)
      }
      cleanup()
    }
  })

  it('is hidden from assistive technology', () => {
    const { container } = render(<HeaderPlanes season="winter" />)
    expect(container.querySelector('.topbar-planes')!.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('SeasonGreeting', () => {
  it('says nothing outside the season', () => {
    const { container } = render(<SeasonGreeting season={null} />)
    expect(container.textContent).toBe('')
  })

  it('wishes a happy Thanksgiving, then happy holidays, each with its glyph drawn', () => {
    const harvest = render(<SeasonGreeting season="harvest" />).container
    expect(harvest.textContent).toMatch(/Happy Thanksgiving/)
    expect(harvest.querySelectorAll('.season-greeting-glyph svg path').length).toBeGreaterThan(0)
    cleanup()
    const winter = render(<SeasonGreeting season="winter" />).container
    expect(winter.textContent).toMatch(/Happy holidays/)
    expect(winter.querySelectorAll('.season-greeting-glyph svg path').length).toBeGreaterThan(0)
  })
})
