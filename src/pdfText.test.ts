import { describe, expect, it } from 'vitest'
import { pdfSafeText } from './pdfText'

describe('pdfSafeText', () => {
  it('leaves text the built-in font can draw exactly as it is', () => {
    const text = 'Café “Zürich” — €1,234.50 · £7.99 · $5'
    expect(pdfSafeText(text)).toBe(text)
  })

  it('writes a currency symbol the font lacks as its ISO code', () => {
    expect(pdfSafeText('₹1,234.50')).toBe('INR 1,234.50')
    expect(pdfSafeText('TOTAL ₩15,000')).toBe('TOTAL KRW 15,000')
    expect(pdfSafeText('1.234 ₫')).toBe('1.234 VND')
  })

  it('turns the narrow no-break space some locales group digits with into a plain space', () => {
    expect(pdfSafeText('1 234,50 €')).toBe('1 234,50 €')
  })

  it('shows a placeholder for a character it cannot draw, and nothing else changes', () => {
    expect(pdfSafeText('東京 lunch')).toBe('?? lunch')
  })

  it('never returns a character outside Windows-1252', () => {
    const out = pdfSafeText('₹ ₩ 東京 Привет  ​ zł Kč ✓')
    for (const ch of out) expect(ch.codePointAt(0)).toBeLessThanOrEqual(0x2122)
    expect(out).not.toMatch(/[Ā-ſЀ-ӿ　-鿿]/)
  })
})
