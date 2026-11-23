import { dayColor, type Rgb } from './colors'

/**
 * The holiday look, switched on and off by the device's own date, so it
 * needs no setting and goes away by itself in January.
 *
 * - `harvest`: 15 to 30 November, around Thanksgiving: warm rust and
 *   cranberry, with leaves, acorns and pumpkins drifting across the header.
 * - `winter`: 1 December to 6 January: evergreen, with snow, trees, gifts,
 *   stars and ornaments.
 * - `null`: the everyday look.
 *
 * Only the app's own screens change. Exported PDFs keep the everyday colours:
 * they are documents people submit.
 */
export type Season = 'harvest' | 'winter' | null

export function seasonOn(now: Date = new Date()): Season {
  const month = now.getMonth()
  const day = now.getDate()
  if (month === 10 && day >= 15) return 'harvest'
  if (month === 11 || (month === 0 && day <= 6)) return 'winter'
  return null
}

// The browser's own chrome (the address bar on Android, the title bar of an
// installed app) follows the header: the everyday teal, or the season's.
const THEME_COLOR: Record<NonNullable<Season> | 'everyday', string> = {
  everyday: '#0f766e',
  harvest: '#7c2d12',
  winter: '#14532d',
}

/** Mark the page with the season, for styles.css, and colour the browser's chrome to match. */
export function applySeason(doc: Document = document, now: Date = new Date()): Season {
  const season = seasonOn(now)
  const root = doc.documentElement
  if (season) root.dataset.season = season
  else delete root.dataset.season
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[season ?? 'everyday'])
  return season
}

/*
 * Each day of a trip gets its own banner colour (colors.ts dayColor), taken
 * from the everyday teal-to-violet sweep, which a bright violet day banner
 * turns into a clash with the season's colours. In season the app's banners
 * cycle through these instead: six colours from the season's palette, far
 * enough apart to tell days apart, each dark enough for white text at 4.5:1
 * or more (season.test.ts). Exported PDFs keep the everyday sequence.
 */
const SEASON_DAY_COLORS: Record<NonNullable<Season>, Rgb[]> = {
  harvest: [
    [154, 52, 18], // burnt orange #9a3412
    [20, 83, 45], // evergreen #14532d
    [161, 98, 7], // mustard #a16207
    [136, 19, 55], // cranberry #881337
    [113, 63, 18], // chestnut #713f12
    [63, 98, 18], // olive #3f6212
  ],
  winter: [
    [20, 83, 45], // evergreen #14532d
    [159, 18, 57], // cranberry #9f1239
    [161, 98, 7], // gold #a16207
    [15, 118, 110], // pine #0f766e
    [124, 45, 18], // rust #7c2d12
    [30, 58, 138], // midnight #1e3a8a
  ],
}

/** The banner colour for a day of a trip: the season's when there is one, otherwise the everyday dayColor. */
export function bannerColor(dayNumber: number, season: Season): Rgb {
  if (!season) return dayColor(dayNumber)
  const colors = SEASON_DAY_COLORS[season]
  return colors[(((dayNumber - 1) % colors.length) + colors.length) % colors.length]
}

/** The season the page was marked with at start-up. */
export function currentSeason(doc: Document = document): Season {
  const s = doc.documentElement.dataset.season
  return s === 'harvest' || s === 'winter' ? s : null
}
