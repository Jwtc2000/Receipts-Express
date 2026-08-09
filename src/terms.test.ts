import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TERMS_VERSION, needsAcceptance, readAcceptance, recordAcceptance } from './terms'

// This module is the only evidence that the agreement ever formed, so the
// cases that matter are the ones where it must fail *open* — ask again —
// rather than silently assume the user agreed.
beforeEach(() => {
  localStorage.clear()
})

describe('terms acceptance', () => {
  it('asks on a fresh install', () => {
    expect(readAcceptance()).toBeNull()
    expect(needsAcceptance()).toBe(true)
  })

  it('records the current version and an ISO timestamp, then stops asking', () => {
    recordAcceptance(new Date('2026-08-08T12:00:00.000Z'))

    expect(readAcceptance()).toEqual({
      version: TERMS_VERSION,
      acceptedAt: '2026-08-08T12:00:00.000Z',
    })
    expect(needsAcceptance()).toBe(false)
  })

  it('asks again once TERMS_VERSION moves past what was accepted', () => {
    localStorage.setItem(
      'br.termsAccepted',
      JSON.stringify({ version: 'some-older-version', acceptedAt: '2026-01-01T00:00:00.000Z' }),
    )
    expect(needsAcceptance()).toBe(true)
  })

  // Each of these is a value that could plausibly be sitting in localStorage —
  // hand-edited, half-written, or left by an older build. None of them is
  // assent, so all of them must re-prompt rather than read as agreement.
  it.each([
    ['not JSON at all', 'yes'],
    ['a bare string', '"2026-08-08"'],
    ['null', 'null'],
    ['an array', '[]'],
    ['missing acceptedAt', '{"version":"2026-08-08"}'],
    ['missing version', '{"acceptedAt":"2026-08-08T12:00:00.000Z"}'],
    ['non-string version', '{"version":1,"acceptedAt":"2026-08-08T12:00:00.000Z"}'],
    ['empty', ''],
  ])('treats %s as never accepted', (_label, stored) => {
    localStorage.setItem('br.termsAccepted', stored)
    expect(readAcceptance()).toBeNull()
    expect(needsAcceptance()).toBe(true)
  })

  // Private-mode Safari throws on setItem once the quota is zero. The user
  // still agreed; refusing to let them past would be the worse failure.
  it('does not throw when storage refuses the write', () => {
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    try {
      expect(() => recordAcceptance()).not.toThrow()
    } finally {
      setItem.mockRestore()
    }
  })

  it('does not throw when storage refuses the read', () => {
    const getItem = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    try {
      expect(readAcceptance()).toBeNull()
      expect(needsAcceptance()).toBe(true)
    } finally {
      getItem.mockRestore()
    }
  })
})
