import { useEffect, useRef, useState } from 'react'
import { needsAcceptance, recordAcceptance } from '../terms'

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
 * It reappears only when TERMS_VERSION is bumped for a material change.
 */
export default function FirstRunNotice() {
  const [show, setShow] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (needsAcceptance()) setShow(true)
  }, [])

  useEffect(() => {
    if (show) buttonRef.current?.focus()
  }, [show])

  if (!show) return null

  const accept = () => {
    recordAcceptance()
    setShow(false)
  }

  return (
    <div className="first-run-backdrop" role="presentation">
      <div
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
        <p className="first-run-assent">
          By tapping <strong>I Agree</strong>, you agree to the{' '}
          <a href="./docs/terms.html" target="_blank" rel="noopener noreferrer">
            Terms of Use
          </a>{' '}
          and the{' '}
          <a href="./docs/privacy.html" target="_blank" rel="noopener noreferrer">
            Privacy Policy
          </a>
          .
        </p>
        <button ref={buttonRef} type="button" className="btn primary" onClick={accept}>
          I Agree
        </button>
      </div>
    </div>
  )
}
