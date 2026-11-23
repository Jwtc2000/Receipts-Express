// jsPDF's built-in Helvetica can only encode Windows-1252. A character
// outside it is not dropped or substituted: it goes into the page as raw
// UTF-16 bytes, which shows as a wrong glyph followed by gaps between every
// later character. A rupee amount came out as " ¹1 , 2 3 4 . 5 0".
//
// Embedding a Unicode font would fix every script, at the cost of shipping
// and licensing one. This is the smaller step: make amounts always legible,
// and make anything else that cannot be drawn visibly a placeholder instead
// of corrupting the text around it.

// Windows-1252 beyond Latin-1: the characters it places at 0x80-0x9F.
const CP1252_EXTRAS = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'

// Currency symbols Helvetica cannot draw, replaced by the ISO code so the
// amount still says what it is in.
const CURRENCY_CODES: Record<string, string> = {
  '₹': 'INR',
  '₩': 'KRW',
  '₱': 'PHP',
  '฿': 'THB',
  '₽': 'RUB',
  '₪': 'ILS',
  '₫': 'VND',
  '₺': 'TRY',
  '₴': 'UAH',
  '₦': 'NGN',
  '₡': 'CRC',
  '₲': 'PYG',
  '₸': 'KZT',
  '₮': 'MNT',
  '₭': 'LAK',
  '₼': 'AZN',
  '₾': 'GEL',
  '₵': 'GHS',
  '៛': 'KHR',
  '৳': 'BDT',
}

function encodable(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0
  if (code === 0x0a || code === 0x0d || code === 0x09) return true
  if (code >= 0x20 && code <= 0x7e) return true
  if (code >= 0xa0 && code <= 0xff) return true
  return CP1252_EXTRAS.includes(ch)
}

/** Make a string safe to draw in jsPDF's built-in fonts. */
export function pdfSafeText(text: string): string {
  let out = ''
  for (const ch of text) {
    if (encodable(ch)) {
      out += ch
      continue
    }
    const currency = CURRENCY_CODES[ch]
    if (currency) {
      // "₹1,234.50" -> "INR 1,234.50"; "1.234 ₫" -> "1.234 VND"
      const needsLeadingSpace = out.length > 0 && !/\s$/.test(out)
      out += `${needsLeadingSpace ? ' ' : ''}${currency} `
      continue
    }
    const code = ch.codePointAt(0) ?? 0
    // The spaces locales group digits with (fr-FR uses U+202F): a plain one.
    if (code === 0x202f || code === 0x2009 || code === 0x2007 || code === 0x2002 || code === 0x2003) {
      out += ' '
      continue
    }
    // Invisible direction and joining marks carry nothing to draw.
    if ((code >= 0x200b && code <= 0x200f) || (code >= 0x202a && code <= 0x202e) || code === 0xfeff) continue
    out += '?'
  }
  return out.replace(/ {2,}/g, ' ').replace(/ +$/gm, '')
}
