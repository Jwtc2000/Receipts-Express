// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

// The service-worker registration is replaced with a recorder, so a test can
// play the part of the browser: say a new version is waiting, or that it has
// taken control.
type Options = { onNeedRefresh?: () => void; onNeedReload?: () => void }
const { registerSW, update } = vi.hoisted(() => ({
  registerSW: vi.fn(),
  update: vi.fn(() => Promise.resolve()),
}))
let options: Options = {}
vi.mock('virtual:pwa-register', () => ({ registerSW }))
vi.mock('../backup', () => ({ exportBackup: vi.fn(() => Promise.resolve(true)) }))

const { default: UpdateBanner } = await import('./UpdateBanner')
const { default: GlobalErrorToast } = await import('./GlobalErrorToast')
const { default: ErrorBoundary } = await import('./ErrorBoundary')
const unsaved = await import('../unsavedWork')

const reload = vi.fn()

beforeEach(() => {
  options = {}
  registerSW.mockImplementation((o: Options) => {
    options = o
    return update
  })
  Object.defineProperty(window, 'location', { value: { ...window.location, reload }, configurable: true })
  reload.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  unsaved.setHasUnsavedWork(false)
  vi.restoreAllMocks()
})

describe('UpdateBanner', () => {
  it('reloads this tab when the new version takes over and nothing is unsaved', () => {
    render(<UpdateBanner />)
    act(() => options.onNeedReload?.())
    expect(reload).toHaveBeenCalled()
  })

  // The new version took over because Refresh was pressed in another tab.
  // This tab has an expense open; it must not be reloaded under the user.
  it('asks instead of reloading when this tab has unsaved work', () => {
    unsaved.setHasUnsavedWork(true)
    render(<UpdateBanner />)
    act(() => options.onNeedReload?.())
    expect(reload).not.toHaveBeenCalled()
    expect(screen.getByText(/Reload when you have saved/)).toBeInTheDocument()
  })

  // The user agreed to lose the draft, then kept typing while the update
  // loaded. The reload must ask again rather than take the new edits too.
  it('asks again before reloading when the draft changed after the user agreed', () => {
    unsaved.setHasUnsavedWork(true)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<UpdateBanner />)
    act(() => options.onNeedRefresh?.())
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(confirm).toHaveBeenCalledTimes(1)

    unsaved.noteEdit()
    confirm.mockReturnValue(false)
    act(() => options.onNeedReload?.())
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(reload).not.toHaveBeenCalled()
  })

  it('can be put off with Later', () => {
    render(<UpdateBanner />)
    act(() => options.onNeedRefresh?.())
    fireEvent.click(screen.getByRole('button', { name: 'Later' }))
    expect(screen.queryByText(/new version is ready/)).toBeNull()
  })
})

describe('GlobalErrorToast', () => {
  function reject(reason: unknown) {
    const event = new Event('unhandledrejection') as PromiseRejectionEvent
    Object.defineProperty(event, 'reason', { value: reason })
    act(() => {
      window.dispatchEvent(event)
    })
  }

  it('mentions storage only for an error that storage raised', () => {
    render(<GlobalErrorToast />)
    reject(new DOMException('full', 'QuotaExceededError'))
    expect(screen.getByRole('alert')).toHaveTextContent(/running out of storage room/)
  })

  it('does not blame storage for an unrelated failure', () => {
    render(<GlobalErrorToast />)
    reject(new TypeError('x is undefined'))
    expect(screen.getByRole('alert')).not.toHaveTextContent(/storage/)
  })
})

describe('ErrorBoundary', () => {
  function Broken(): never {
    throw new Error('render failed')
  }

  it('shows a way to reload and to back up instead of a blank page', () => {
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back up now' })).toBeInTheDocument()
  })
})
