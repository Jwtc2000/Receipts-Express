import Icon from './icons'

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

type TravelGlyph = keyof typeof TRAVEL_GLYPHS

function Glyph({ name }: { name: TravelGlyph }) {
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
      {TRAVEL_GLYPHS[name]}
    </svg>
  )
}

// Which glyph flies on which of the eight paths in styles.css
// (.topbar-plane-a to -h). Same kind never shares a row with itself.
const FLIGHTS: [string, TravelGlyph][] = [
  ['a', 'plane'],
  ['b', 'coffee'],
  ['c', 'fuel'],
  ['d', 'car'],
  ['e', 'bed'],
  ['f', 'plane'],
  ['g', 'coffee'],
  ['h', 'car'],
]

// Travel-expense glyphs drifting across the gradient header, behind its
// title and buttons. Purely decorative, and hidden for reduced motion.
export function HeaderPlanes() {
  return (
    <div className="topbar-planes" aria-hidden="true">
      {FLIGHTS.map(([path, glyph]) => (
        <span key={path} className={`topbar-plane topbar-plane-${path}`}>
          <Glyph name={glyph} />
        </span>
      ))}
    </div>
  )
}
