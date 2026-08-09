import { useEffect, useRef, type RefObject } from 'react'

/**
 * Everything inside the surface that Tab can reach. Written as a selector
 * rather than a list of the controls each surface happens to hold today, so
 * that a drawer gaining another field keeps working. This is the same list
 * FirstRunNotice uses; it is repeated rather than shared because that gate is
 * deliberately a bespoke trap with different rules (see below).
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Controls that answer Escape with something of their own: the date/time
 * family opens a picker the browser draws, and so does a <select>. Both are
 * browser UI the page cannot see, so there is no way to ask whether one is
 * open — the only safe reading of Escape typed into one of these is that it
 * was meant for the picker.
 */
const NATIVE_POPUP_CONTROLS =
  'select, input[type="date"], input[type="datetime-local"], input[type="month"], input[type="time"], input[type="week"]'

// How many surfaces are currently holding the page-scroll lock. Without the
// count, two overlapping surfaces would each record "hidden" as the value to
// put back, and the page would stay unscrollable after both had closed.
let scrollLocks = 0
let scrollLockRestore = ''

export interface ModalOptions {
  /**
   * Whether the surface takes the page over. True for the drawers: they cover
   * the app, so focus is contained inside them and the page behind is stopped
   * from scrolling.
   *
   * False for a popover anchored to its own trigger — the export menu. It is
   * two buttons in a box, and it was getting the full treatment: Tab could not
   * leave it, which is worse than a menu Tab walks straight out of, and the
   * scroll lock made the page jump as the scrollbar came and went. Escape,
   * the focus move and the focus return still apply; outside clicks are the
   * caller's backdrop either way.
   */
  modal?: boolean
}

/**
 * Escape-to-close and focus handling for a surface layered over the app — the
 * two menu drawers and the export popover. Drawers additionally contain focus
 * and lock the page scroll; see ModalOptions.modal.
 *
 * Attach the returned ref to the panel itself, not to the backdrop: the trap
 * cycles focus within that element, and a backdrop would wrongly include
 * whatever sits behind it.
 *
 * Not for FirstRunNotice. That is a consent gate: Escape must not dismiss it
 * and neither must a click outside, because pressing the button is the act
 * being recorded. It has its own trap, and this hook would weaken it.
 */
export function useModal<T extends HTMLElement = HTMLElement>(
  open: boolean,
  onClose: () => void,
  { modal = true }: ModalOptions = {},
): RefObject<T> {
  const ref = useRef<T>(null)
  // Read through a ref so an inline arrow passed as `onClose` — which is a new
  // function on every render — doesn't tear down and re-add the key listener
  // on every render, and with it re-run the focus move below.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // Move focus into the surface when it opens, and back to whatever opened it
  // when it closes. Without the second half, closing a drawer drops focus onto
  // <body> and Tab resumes from the top of the page rather than from the
  // button the user was just on.
  useEffect(() => {
    if (!open) return
    const returnFocusTo = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    return () => returnFocusTo?.focus?.()
  }, [open])

  // Escape closes the surface, in the bubble phase and without preventDefault.
  // Both of those are deliberate. This used to run in the capture phase and
  // cancel the key: Escape pressed on the trip-date field inside the drawer was
  // taken before the date input saw it, so the browser's calendar stayed on
  // screen and the drawer closed out from under it — the one thing the user was
  // not trying to close. Bubbling last, and leaving the default action alone,
  // gives whatever is focused first refusal on the key.
  useEffect(() => {
    if (!open) return

    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // Escape during IME composition cancels the composition, nothing else.
      if (event.isComposing) return
      // Something inside already acted on it.
      if (event.defaultPrevented) return
      // The picker case above. This costs the user Escape-to-close while a
      // date field or a <select> holds focus, which is the right side to err
      // on: the close button, the backdrop, and Escape from anywhere else in
      // the drawer all still work, whereas a dismissed drawer cannot be got
      // back without reopening it.
      const target = event.target
      if (target instanceof Element && target.closest(NATIVE_POPUP_CONTROLS)) return
      onCloseRef.current()
    }

    document.addEventListener('keydown', onEscape)
    return () => document.removeEventListener('keydown', onEscape)
  }, [open])

  useEffect(() => {
    if (!open || !modal) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const surface = ref.current
      if (!surface) return

      const focusable = Array.from(surface.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      const active = document.activeElement
      // `outside` covers the case where focus has fallen back to <body> —
      // clicking the backdrop does that — in which case Tab would otherwise
      // walk into the app behind the surface.
      const outside = !surface.contains(active)
      if (event.shiftKey ? active === first || outside : active === last || outside) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      }
    }

    // Capture phase, so the surface's own controls can't swallow the key first.
    // Safe for Tab in a way it was not for Escape: nothing inside a drawer has
    // its own meaning for Tab, and containment fails open if one ever does.
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [open, modal])

  useEffect(() => {
    if (!open || !modal) return
    if (scrollLocks === 0) {
      scrollLockRestore = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    scrollLocks++
    return () => {
      scrollLocks--
      if (scrollLocks === 0) document.body.style.overflow = scrollLockRestore
    }
  }, [open, modal])

  return ref
}
