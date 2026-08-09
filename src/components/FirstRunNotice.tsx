import { useEffect, useRef, useState } from 'react'
import { needsAcceptance, recordAcceptance } from '../terms'

/**
 * Everything inside the dialog that Tab can reach. Written generally rather
 * than as a list of the three links and one button that are here today, so
 * that it keeps working if the copy gains another link.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface Props {
  /**
   * Called whenever the gate opens or closes. main.tsx uses it to mark the
   * rest of the app inert while the gate is up; the tests render this
   * component on its own, so it is optional.
   */
  onOpenChange?: (open: boolean) => void
}

/**
 * A one-time, blocking acknowledgment of the Terms of Use and Privacy Policy.
 *
 * Deliberately a modal rather than a footer link: terms merely linked from a
 * menu are browsewrap, and the 9th Circuit wants conspicuous notice *and* an
 * unambiguous act of assent (Berman v. Freedom Financial; Wilson v. Huuuge,
 * on an app much like this one). The details below are the ones those cases
 * turned on — the notice sits directly above the button, at body size and
 * full contrast; the links are underlined and colored so they read as links;
 * and the button says "I Agree" rather than "Continue" or "Got it", so that
 * pressing it is unambiguous.
 *
 * Blocking has to hold for the keyboard too, or the assent is only collected
 * from people who use a pointer: the dialog traps Tab, and main.tsx marks
 * everything behind it inert.
 *
 * It reappears only when TERMS_VERSION is bumped for a material change.
 */
export default function FirstRunNotice({ onOpenChange }: Props) {
  const [show, setShow] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (needsAcceptance()) setShow(true)
  }, [])

  useEffect(() => {
    if (show) buttonRef.current?.focus()
  }, [show])

  useEffect(() => {
    onOpenChange?.(show)
    // If this ever unmounts while open, release whatever the parent did on
    // its behalf rather than leaving the app behind it inert forever.
    return () => onOpenChange?.(false)
  }, [show, onOpenChange])

  // Tab and Shift+Tab cycle within the dialog instead of walking out into the
  // app behind it. Without this a keyboard user tabs straight past the gate
  // and uses the whole product without ever recording acceptance — which is
  // the browsewrap failure the dialog exists to avoid. The listener sits on
  // the document, in the capture phase, so it also catches the case where
  // focus has fallen back to <body> (clicking the backdrop does that).
  //
  // Escape is deliberately not handled, and must not be: a consent gate that
  // Escape dismisses is not a consent gate. The only way out is the button,
  // because pressing the button is the act being recorded. Please do not
  // "fix" this.
  useEffect(() => {
    if (!show) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const dialog = dialogRef.current
      if (!dialog) return

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      const active = document.activeElement
      const outside = !dialog.contains(active)
      if (event.shiftKey ? active === first || outside : active === last || outside) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [show])

  if (!show) return null

  const accept = () => {
    recordAcceptance()
    setShow(false)
  }

  return (
    <div className="first-run-backdrop" role="presentation">
      <div
        ref={dialogRef}
        className="first-run"
        role="dialog"
        aria-modal="true"
        aria-labelledby="first-run-title"
      >
        <h2 id="first-run-title">Before you start</h2>
        <p>
          Receipts Express keeps every receipt and report on your own device. There are no
          accounts and no servers, and nothing you scan is sent to anyone.
        </p>
        <p>
          It is a free, independent personal project, provided as is — not a system of record.
          Browser storage can be cleared without warning, so export your reports as you go.
        </p>
        {/* The consumer health data policy gets its own named link rather than
            being folded into "Privacy Policy": RCW 19.373.020(1)(b) and the
            Washington AG's guidance call for a separate and distinct link to
            it, and this dialog is the first place anyone sees the policies. */}
        <p className="first-run-assent">
          By tapping <strong>I Agree</strong>, you agree to the{' '}
          <a href="./docs/terms.html" target="_blank" rel="noopener noreferrer">
            Terms of Use
          </a>{' '}
          and the{' '}
          <a href="./docs/privacy.html" target="_blank" rel="noopener noreferrer">
            Privacy Policy
          </a>
          . If you scan a receipt from a pharmacy or a medical provider, the{' '}
          <a href="./docs/consumer-health-data.html" target="_blank" rel="noopener noreferrer">
            Consumer Health Data Privacy Policy
          </a>{' '}
          covers it.
        </p>
        <button ref={buttonRef} type="button" className="btn primary" onClick={accept}>
          I Agree
        </button>
      </div>
    </div>
  )
}
