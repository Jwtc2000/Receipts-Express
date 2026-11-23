import Icon from './icons'
import { currentSeason, type Season } from '../season'

// A rightward-arrow section divider, built from the app's own express-arrow
// glyph — used to break up multi-section drawer menus.
export function ArrowDivider() {
  return (
    <div className="drawer-arrow-divider" aria-hidden="true">
      <span className="drawer-arrow-divider-line" />
      <span className="drawer-arrow-icon">
        <Icon name="express-arrow" size={16} />
      </span>
      <span className="drawer-arrow-divider-line" />
    </div>
  )
}

/*
 * The glyphs that drift across the header. They are drawn on the same terms as
 * the app's own icons (icons.tsx): a 24-unit grid, outlines in currentColor
 * with round caps and joins, so the header reads as one family with the
 * buttons it passes behind. The stroke is a little lighter than the buttons'
 * (1.75 against 2) because these sit at 12-16px rather than 20-24px.
 *
 * All five are original drawings for this app, not taken from an icon set.
 */
const TRAVEL_GLYPHS = {
  // An airliner seen from above, nose up.
  plane: (
    <path d="M12 2.5c.9 0 1.5.8 1.5 1.8V9l7 4.2v2.1l-7-2v4.6l2.3 1.8v1.8L12 20.6l-3.8.9v-1.8l2.3-1.8v-4.6l-7 2v-2.1l7-4.2V4.3c0-1 .6-1.8 1.5-1.8z" />
  ),
  // A cup with a handle and two lines of steam: meals.
  coffee: (
    <>
      <path d="M4 10h12v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" />
      <path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16" />
      <path d="M8 3.5c-.8.8-.8 1.7 0 2.5M12 3.5c-.8.8-.8 1.7 0 2.5" />
      <line x1="3" y1="21" x2="17" y2="21" />
    </>
  ),
  // A fuel pump with its hose: fuel.
  fuel: (
    <>
      <path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16" />
      <line x1="3" y1="21" x2="15" y2="21" />
      <rect x="6.5" y="6" width="5" height="4" rx="0.5" />
      <path d="M14 10h1.5a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 0 3 0V8.5L17.5 6" />
    </>
  ),
  // A car in profile: ground transport, mileage, parking.
  car: (
    <>
      <path d="M3 16.5V13l1.8-4.2A2 2 0 0 1 6.6 7.5h10.8a2 2 0 0 1 1.8 1.3L21 13v3.5" />
      <line x1="3.5" y1="13" x2="20.5" y2="13" />
      <circle cx="7.5" cy="16.5" r="2" />
      <circle cx="16.5" cy="16.5" r="2" />
      <line x1="9.5" y1="16.5" x2="14.5" y2="16.5" />
    </>
  ),
  // A bed with a pillow: lodging.
  bed: (
    <>
      <path d="M3 5v15" />
      <path d="M21 20v-5a3 3 0 0 0-3-3h-7.5v4" />
      <line x1="3" y1="16" x2="21" y2="16" />
      <circle cx="6.8" cy="12.5" r="1.8" />
    </>
  ),
}

/*
 * Holiday glyphs, drawn on the same terms as the travel ones, for the
 * seasons in src/season.ts. Also original drawings.
 */
const HOLIDAY_GLYPHS = {
  // A simple leaf on a short stem: autumn.
  leaf: (
    <>
      <path d="M5 19C5 10.5 10 5 19 5c0 9-5.5 14-14 14z" />
      <path d="M5 19l8-8" />
    </>
  ),
  // An acorn: a domed cap with a stalk over the nut.
  acorn: (
    <>
      <path d="M5.5 10.5c0-3.1 2.9-5 6.5-5s6.5 1.9 6.5 5z" />
      <path d="M12 5.5V3" />
      <path d="M7 10.5c0 4.6 2.2 8.5 5 9.5 2.8-1 5-4.9 5-9.5" />
    </>
  ),
  // A pumpkin with its ribs and a curled stalk.
  pumpkin: (
    <>
      <path d="M12 7.5c-4.4 0-7.5 2.8-7.5 6.3S7.6 20 12 20s7.5-2.7 7.5-6.2S16.4 7.5 12 7.5z" />
      <path d="M12 7.5c-1.8 1.4-2.6 3.7-2.6 6.3S10.2 18.6 12 20M12 7.5c1.8 1.4 2.6 3.7 2.6 6.3S13.8 18.6 12 20" />
      <path d="M12 7.5V5c0-.9.7-1.6 1.8-1.9" />
    </>
  ),
  // A six-armed snowflake.
  snowflake: (
    <>
      <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" />
      <path d="M9.8 4.4L12 6l2.2-1.6M9.8 19.6L12 18l2.2 1.6" />
      <path d="M4.3 10.2l2.5-.6.4-2.6M19.7 13.8l-2.5.6-.4 2.6M4.3 13.8l2.5.6.4 2.6M19.7 10.2l-2.5-.6-.4-2.6" />
    </>
  ),
  // A fir tree in three tiers, on a trunk.
  tree: (
    <>
      <path d="M12 3l4.5 5.5h-2.7l3.7 4.8h-2.8l4.3 5.2H5l4.3-5.2H6.5l3.7-4.8H7.5z" />
      <path d="M12 18.5V21" />
    </>
  ),
  // A wrapped box with a bow.
  gift: (
    <>
      <rect x="4" y="10" width="16" height="10" rx="1" />
      <rect x="3" y="7" width="18" height="3" rx="1" />
      <path d="M12 7v13" />
      <path d="M12 7c-1.4-2.8-4.8-3-4.4-.7.2 1 2.4.7 4.4.7zM12 7c1.4-2.8 4.8-3 4.4-.7-.2 1-2.4.7-4.4.7z" />
    </>
  ),
  // A five-pointed star.
  star: <path d="M12 3.2l2.6 5.5 6 .8-4.4 4.1 1.1 6L12 16.7l-5.3 2.9 1.1-6-4.4-4.1 6-.8z" />,
  // A bauble on its cap and hook.
  ornament: (
    <>
      <circle cx="12" cy="14.5" r="6" />
      <path d="M10.2 6h3.6v2.6h-3.6z" />
      <path d="M12 6V4.6c0-.8.6-1.4 1.4-1.4" />
      <path d="M6.3 13c3.6 1.4 7.8 1.4 11.4 0" />
    </>
  ),
}

type TravelGlyph = keyof typeof TRAVEL_GLYPHS
type GlyphName = TravelGlyph | keyof typeof HOLIDAY_GLYPHS

const GLYPHS: Record<GlyphName, React.ReactNode> = { ...TRAVEL_GLYPHS, ...HOLIDAY_GLYPHS }

function Glyph({ name }: { name: GlyphName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {GLYPHS[name]}
    </svg>
  )
}

// Which glyph flies on which of the eight paths in styles.css
// (.topbar-plane-a to -h). Same kind never shares a row with itself.
const FLIGHTS: [string, GlyphName][] = [
  ['a', 'plane'],
  ['b', 'coffee'],
  ['c', 'fuel'],
  ['d', 'car'],
  ['e', 'bed'],
  ['f', 'plane'],
  ['g', 'coffee'],
  ['h', 'car'],
]

// In season, the same eight paths carry the season's glyphs, with a plane or
// two still among them: it is a travel app. Path a turns its glyph a quarter
// turn (it was drawn for a nose-up plane) and path d mirrors it, so those two
// carry shapes that look right either way: a leaf, a snowflake, a star.
const SEASON_FLIGHTS: Record<NonNullable<Season>, [string, GlyphName][]> = {
  harvest: [
    ['a', 'leaf'],
    ['b', 'pumpkin'],
    ['c', 'plane'],
    ['d', 'leaf'],
    ['e', 'acorn'],
    ['f', 'leaf'],
    ['g', 'pumpkin'],
    ['h', 'acorn'],
  ],
  winter: [
    ['a', 'snowflake'],
    ['b', 'tree'],
    ['c', 'gift'],
    ['d', 'star'],
    ['e', 'ornament'],
    ['f', 'plane'],
    ['g', 'snowflake'],
    ['h', 'tree'],
  ],
}

// Glyphs drifting across the gradient header, behind its title and buttons:
// travel expenses most of the year, the season's own around the holidays,
// with snow falling behind them in winter. Purely decorative, and hidden for
// reduced motion.
export function HeaderPlanes({ season = currentSeason() }: { season?: Season }) {
  const flights = season ? SEASON_FLIGHTS[season] : FLIGHTS
  return (
    <div className="topbar-planes" aria-hidden="true">
      {season === 'winter' && <span className="topbar-snow" />}
      {flights.map(([path, glyph]) => (
        <span key={path} className={`topbar-plane topbar-plane-${path}`} data-glyph={glyph}>
          <Glyph name={glyph} />
        </span>
      ))}
    </div>
  )
}

const GREETINGS: Record<NonNullable<Season>, { glyph: GlyphName; text: string }> = {
  harvest: { glyph: 'leaf', text: 'Happy Thanksgiving, and safe travels this holiday.' },
  winter: { glyph: 'star', text: 'Happy holidays, and safe travels into the new year.' },
}

// A one-line seasonal note at the top of the reports screen. Nothing outside
// the season.
export function SeasonGreeting({ season = currentSeason() }: { season?: Season }) {
  if (!season) return null
  const { glyph, text } = GREETINGS[season]
  return (
    <p className="season-greeting">
      <span className="season-greeting-glyph" aria-hidden="true">
        <Glyph name={glyph} />
      </span>
      {text}
    </p>
  )
}
