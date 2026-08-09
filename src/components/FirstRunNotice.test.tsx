// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useEffect, useRef, useState } from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FirstRunNotice from './FirstRunNotice'
import { TERMS_VERSION, readAcceptance } from '../terms'

// The disclaimers and the liability cap in the Terms are only worth anything
// if the agreement actually formed. That makes this gate load-bearing in a way
// a dismissible banner isn't, so what's asserted here is the shape the 9th
// Circuit's browsewrap cases turn on: notice the user cannot miss, links they
// can follow first, and a button whose label is an unambiguous act of assent.
beforeEach(() => {
  localStorage.clear()
})

afterEach(cleanup)

describe('FirstRunNotice', () => {
  it('blocks on first run with an accessible modal dialog', () => {
    render(<FirstRunNotice />)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    // Labelled by its own heading, so a screen reader announces what it is.
    expect(dialog).toHaveAccessibleName('Before you start')
  })

  it('puts the assent notice and both policy links above the button', () => {
    render(<FirstRunNotice />)

    const terms = screen.getByRole('link', { name: 'Terms of Use' })
    const privacy = screen.getByRole('link', { name: 'Privacy Policy' })
    expect(terms).toHaveAttribute('href', './docs/terms.html')
    expect(privacy).toHaveAttribute('href', './docs/privacy.html')

    // Reachable before agreeing — a user must be able to read what they are
    // agreeing to without first agreeing to it.
    const button = screen.getByRole('button', { name: 'I Agree' })
    expect(button.compareDocumentPosition(terms)).toBe(Node.DOCUMENT_POSITION_PRECEDING)
    expect(button.compareDocumentPosition(privacy)).toBe(Node.DOCUMENT_POSITION_PRECEDING)
  })

  it('focuses the button so the dialog is reachable by keyboard alone', () => {
    render(<FirstRunNotice />)
    expect(screen.getByRole('button', { name: 'I Agree' })).toHaveFocus()
  })

  it('records acceptance and dismisses itself when the button is pressed', async () => {
    const user = userEvent.setup()
    render(<FirstRunNotice />)

    await user.click(screen.getByRole('button', { name: 'I Agree' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    const acceptance = readAcceptance()
    expect(acceptance?.version).toBe(TERMS_VERSION)
    expect(Number.isNaN(Date.parse(acceptance!.acceptedAt))).toBe(false)
  })

  it('stays out of the way once the current version has been accepted', () => {
    localStorage.setItem(
      'br.termsAccepted',
      JSON.stringify({ version: TERMS_VERSION, acceptedAt: new Date().toISOString() }),
    )

    render(<FirstRunNotice />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  // A material change bumps TERMS_VERSION, and everyone is asked again —
  // otherwise the record would say people agreed to terms they never saw.
  it('asks again when the accepted version is stale', () => {
    localStorage.setItem(
      'br.termsAccepted',
      JSON.stringify({ version: 'an-older-version', acceptedAt: new Date().toISOString() }),
    )

    render(<FirstRunNotice />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  // RCW 19.373.020(1)(b), as the Washington AG reads it, wants a separate and
  // distinct link to the consumer health data policy rather than that policy
  // being folded into "Privacy Policy". A receipt from a pharmacy is consumer
  // health data, and this dialog is the first place anyone sees any of the
  // three policies, so this is where "separate and distinct" has to hold.
  it('links the consumer health data policy separately, by its own name', () => {
    render(<FirstRunNotice />)

    const health = screen.getByRole('link', { name: 'Consumer Health Data Privacy Policy' })
    expect(health).toHaveAttribute('href', './docs/consumer-health-data.html')

    // All three, and the button after all three.
    expect(screen.getAllByRole('link')).toHaveLength(3)
    const button = screen.getByRole('button', { name: 'I Agree' })
    expect(button.compareDocumentPosition(health)).toBe(Node.DOCUMENT_POSITION_PRECEDING)
  })
})

/**
 * Painting over the app is not blocking it. A backdrop stops a pointer and
 * nothing else: Tab walks straight underneath it, and a screen reader reads
 * through it. If that is possible then the app can be used in full without the
 * acceptance ever being recorded, which is precisely the browsewrap failure
 * this dialog exists to avoid — and it would fail for exactly the users who
 * navigate by keyboard.
 *
 * Two mechanisms hold it, and they are independent: the dialog traps Tab
 * itself, and main.tsx marks the wrapper around everything else `inert`.
 */
describe('FirstRunNotice keyboard containment', () => {
  it('cycles Tab from the last control back to the first instead of leaving the dialog', async () => {
    const user = userEvent.setup()
    render(
      <>
        <button type="button">A control in the app behind</button>
        <FirstRunNotice />
      </>,
    )

    const button = screen.getByRole('button', { name: 'I Agree' })
    expect(button).toHaveFocus()

    await user.tab()

    expect(screen.getByRole('link', { name: 'Terms of Use' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'A control in the app behind' })).not.toHaveFocus()
  })

  it('cycles Shift+Tab from the first control back to the last', async () => {
    const user = userEvent.setup()
    render(
      <>
        <button type="button">A control in the app behind</button>
        <FirstRunNotice />
      </>,
    )

    screen.getByRole('link', { name: 'Terms of Use' }).focus()
    await user.tab({ shift: true })

    expect(screen.getByRole('button', { name: 'I Agree' })).toHaveFocus()
  })

  it('pulls focus back in when it has fallen outside the dialog', async () => {
    // Clicking the backdrop leaves focus on <body>, which belongs to no
    // element in the trap's list — without the outside case the next Tab
    // would start walking the app from the top.
    const user = userEvent.setup()
    render(
      <>
        <button type="button">A control in the app behind</button>
        <FirstRunNotice />
      </>,
    )

    ;(document.activeElement as HTMLElement | null)?.blur()
    expect(document.body).toHaveFocus()

    await user.tab()

    const dialog = screen.getByRole('dialog')
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('does not let Escape dismiss the gate', async () => {
    // Deliberate, and load-bearing: pressing the button is the act of assent
    // being recorded, so it has to be the only way out. A gate Escape closes
    // records nothing and is not a gate.
    const user = userEvent.setup()
    render(<FirstRunNotice />)

    await user.keyboard('{Escape}')

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(readAcceptance()).toBeNull()
  })
})

/**
 * main.tsx wraps everything except the gate in one element and toggles `inert`
 * on it, because the three overlays mount and unmount on their own schedule so
 * no pre-existing node means "everything but the gate".
 *
 * main.tsx creates a React root on import and so cannot be rendered here. What
 * is exercised instead is the contract it depends on — FirstRunNotice
 * reporting open/closed through onOpenChange — in a harness built the same way,
 * plus a check that main.tsx is still wired to it. jsdom does not implement
 * inert, so the attribute is what is asserted; the behaviour it buys is the
 * browser's.
 */
describe('the app behind the gate', () => {
  function AppBehindGate() {
    const [gateOpen, setGateOpen] = useState(false)
    const behindRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
      behindRef.current?.toggleAttribute('inert', gateOpen)
    }, [gateOpen])
    return (
      <>
        <div ref={behindRef} data-testid="behind" style={{ display: 'contents' }}>
          <button type="button">A control in the app behind</button>
        </div>
        <FirstRunNotice onOpenChange={setGateOpen} />
      </>
    )
  }

  it('is inert while the gate is open and reachable again once it is accepted', async () => {
    const user = userEvent.setup()
    render(<AppBehindGate />)

    expect(screen.getByTestId('behind')).toHaveAttribute('inert')

    await user.click(screen.getByRole('button', { name: 'I Agree' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByTestId('behind')).not.toHaveAttribute('inert')
  })

  it('is never made inert when the gate does not open at all', () => {
    localStorage.setItem(
      'br.termsAccepted',
      JSON.stringify({ version: TERMS_VERSION, acceptedAt: new Date().toISOString() }),
    )

    render(<AppBehindGate />)

    expect(screen.getByTestId('behind')).not.toHaveAttribute('inert')
  })

  it('main.tsx still wires the gate to the inert wrapper', () => {
    // Read from the project root rather than relative to import.meta.url:
    // this file runs under jsdom, where import.meta.url is an http URL that
    // fileURLToPath refuses.
    const main = readFileSync(resolve(process.cwd(), 'src/main.tsx'), 'utf-8')
    expect(main).toContain('onOpenChange')
    expect(main).toContain("toggleAttribute('inert'")
  })
})
