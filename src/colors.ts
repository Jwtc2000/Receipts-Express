export type Rgb = [number, number, number]

/** The app's brand gradient endpoints, used for the header background and
 * as the basis for the day-banner color sequence. Teal-700 (#0f766e, also
 * the app icon and the manifest theme_color) to violet-700 (#6d28d9, the
 * --purple-dark token in styles.css) — far enough apart in hue that six
 * distinguishable day colors fall out of the interpolation below, and both
 * dark enough that white text clears WCAG AA across the whole sweep. */
export const HEADER_GRADIENT_A: Rgb = [15, 118, 110]
export const HEADER_GRADIENT_B: Rgb = [109, 40, 217]

const DAY_COLOR_STEPS = 6

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t)
}

/**
 * A distinct color for each day of a trip, so Day 1, Day 2, … are visually
 * distinguishable at a glance. Colors are sampled along the same A→B
 * gradient as the header (Day 1 = A, Day `DAY_COLOR_STEPS` = B), so the
 * palette reads as one consistent brand — and cycle for longer trips.
 * Used identically by the in-app timeline and the PDF export, so the two
 * always agree on which color a given day gets.
 */
export function dayColor(dayNumber: number): Rgb {
  const step = (((dayNumber - 1) % DAY_COLOR_STEPS) + DAY_COLOR_STEPS) % DAY_COLOR_STEPS
  const t = step / (DAY_COLOR_STEPS - 1)
  return [
    lerp(HEADER_GRADIENT_A[0], HEADER_GRADIENT_B[0], t),
    lerp(HEADER_GRADIENT_A[1], HEADER_GRADIENT_B[1], t),
    lerp(HEADER_GRADIENT_A[2], HEADER_GRADIENT_B[2], t),
  ]
}

function relativeLuminance([r, g, b]: Rgb): number {
  const channel = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/**
 * Black or white, whichever gives better WCAG contrast against the given
 * background — so every color in the day-banner sequence (and the header
 * gradient) stays readable, not just the two brand-color endpoints.
 */
export function contrastText(background: Rgb): Rgb {
  const bgLuminance = relativeLuminance(background)
  const whiteContrast = 1.05 / (bgLuminance + 0.05)
  const blackContrast = (bgLuminance + 0.05) / 0.05
  return whiteContrast >= blackContrast ? [255, 255, 255] : [0, 0, 0]
}

export function rgbToCss([r, g, b]: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`
}
