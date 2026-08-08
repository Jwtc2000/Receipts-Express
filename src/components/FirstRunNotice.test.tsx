// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
})
