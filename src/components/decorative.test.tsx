// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { HeaderPlanes, SeasonGreeting } from './decorative'

afterEach(cleanup)

const glyphs = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>('.topbar-plane')].map((el) => el.dataset.glyph)

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

  it('wishes a happy Thanksgiving, then happy holidays', () => {
    expect(render(<SeasonGreeting season="harvest" />).container.textContent).toMatch(/Happy Thanksgiving/)
    cleanup()
    expect(render(<SeasonGreeting season="winter" />).container.textContent).toMatch(/Happy holidays/)
  })
})
