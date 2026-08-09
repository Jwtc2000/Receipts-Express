// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Expense } from '../types'

// Scope note: this covers the specific gap the audit flagged — the
// three-way branch in save() that decides what (newImages, staleImageIds)
// gets passed to saveExpenseWithImage for an untouched / replaced / removed
// receipt image — not the whole component. OCR is mocked to resolve
// immediately; unmocked it would try to load a real tesseract.js worker.
const { getExpense, saveExpenseWithImage, getImage, nextPosition } = vi.hoisted(() => ({
  getExpense: vi.fn(),
  saveExpenseWithImage: vi.fn().mockResolvedValue(undefined),
  getImage: vi.fn((id: string) => Promise.resolve({ id, blob: new Blob(['x']) })),
  nextPosition: vi.fn().mockResolvedValue(0),
}))
vi.mock('../db', () => ({ getExpense, saveExpenseWithImage, getImage, nextPosition }))
vi.mock('../ocr', () => ({ extractReceipt: vi.fn().mockResolvedValue({}) }))
vi.mock('../image', () => ({ compressImage: vi.fn(() => Promise.resolve(new Blob(['compressed']))) }))

const { default: ExpenseEditor } = await import('./ExpenseEditor')

function baseExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'expense-1',
    reportId: 'report-1',
    position: 0,
    title: 'Lunch',
    merchant: 'Cafe',
    amount: 12.5,
    currency: 'USD',
    date: '2026-07-18',
    category: 'Meals',
    notes: '',
    createdAt: 1,
    ...overrides,
  }
}

function pickFileInput(container: HTMLElement): HTMLInputElement {
  // Both hidden <input type="file"> share no distinguishing attribute except
  // `accept` — the second one (accepting PDFs too) backs "Choose photo or PDF".
  const inputs = container.querySelectorAll<HTMLInputElement>('input[type="file"]')
  return inputs[1]
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:mock-url')
  URL.revokeObjectURL = vi.fn()
  getExpense.mockReset()
  saveExpenseWithImage.mockClear()
  getImage.mockClear()
})

afterEach(() => {
  cleanup()
  // @ts-expect-error -- removing the jsdom-absent methods added above
  delete URL.createObjectURL
  // @ts-expect-error -- same
  delete URL.revokeObjectURL
})

describe('ExpenseEditor save() image argument computation', () => {
  it('attaches a first photo on a brand-new expense: one new image, nothing stale', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    const { container } = render(<ExpenseEditor reportId="report-1" onDone={onDone} />)

    await user.type(screen.getByPlaceholderText('e.g. Team lunch'), 'Taxi')
    await user.type(screen.getByLabelText('Amount'), '20')
    await user.upload(pickFileInput(container), new File(['photo'], 'receipt.jpg', { type: 'image/jpeg' }))
    await screen.findByAltText('Receipt, page 1')

    await user.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(saveExpenseWithImage).toHaveBeenCalled())

    const [expense, newImages, staleImageIds] = saveExpenseWithImage.mock.calls[0]
    expect(newImages).toHaveLength(1)
    expect(staleImageIds).toEqual([])
    expect(expense.imageId).toBe(newImages[0].id)
    expect(expense.extraImageIds).toBeUndefined()
  })

  it('replacing the photo on an existing expense marks every old page stale and writes only the new one', async () => {
    getExpense.mockResolvedValue(baseExpense({ imageId: 'old-1', extraImageIds: ['old-2'] }))
    const user = userEvent.setup()
    const { container } = render(<ExpenseEditor reportId="report-1" expenseId="expense-1" onDone={vi.fn()} />)
    await screen.findByDisplayValue('Lunch')

    await user.upload(pickFileInput(container), new File(['photo'], 'receipt.jpg', { type: 'image/jpeg' }))
    await waitFor(() => expect(screen.getAllByAltText(/^Receipt/)).toHaveLength(1))

    await user.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(saveExpenseWithImage).toHaveBeenCalled())

    const [expense, newImages, staleImageIds] = saveExpenseWithImage.mock.calls[0]
    expect(staleImageIds.sort()).toEqual(['old-1', 'old-2'])
    expect(newImages).toHaveLength(1)
    expect(expense.imageId).toBe(newImages[0].id)
    expect(expense.extraImageIds).toBeUndefined()
  })

  it('removing the photo entirely clears imageId/extraImageIds and stales every old page, with no new images', async () => {
    getExpense.mockResolvedValue(baseExpense({ imageId: 'old-1' }))
    const user = userEvent.setup()
    render(<ExpenseEditor reportId="report-1" expenseId="expense-1" onDone={vi.fn()} />)
    await screen.findByDisplayValue('Lunch')
    await screen.findByAltText('Receipt, page 1')

    await user.click(screen.getByRole('button', { name: /remove/i }))
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(saveExpenseWithImage).toHaveBeenCalled())

    const [expense, newImages, staleImageIds] = saveExpenseWithImage.mock.calls[0]
    expect(newImages).toEqual([])
    expect(staleImageIds).toEqual(['old-1'])
    expect(expense.imageId).toBeUndefined()
    expect(expense.extraImageIds).toBeUndefined()
  })

  it('leaving the photo untouched writes nothing new/stale, keeps the same imageId, and refetches the latest record (cross-tab guard)', async () => {
    getExpense.mockResolvedValue(baseExpense({ imageId: 'old-1' }))
    const user = userEvent.setup()
    render(<ExpenseEditor reportId="report-1" expenseId="expense-1" onDone={vi.fn()} />)
    await screen.findByDisplayValue('Lunch')

    await user.type(screen.getByPlaceholderText('Optional details for the report'), 'edited notes')
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(saveExpenseWithImage).toHaveBeenCalled())

    const [expense, newImages, staleImageIds] = saveExpenseWithImage.mock.calls[0]
    expect(newImages).toEqual([])
    expect(staleImageIds).toEqual([])
    expect(expense.imageId).toBe('old-1')
    // Once for the initial mount fetch, once again in save() to guard
    // against a stale in-tab `existing` that another tab has since changed.
    expect(getExpense).toHaveBeenCalledTimes(2)
  })
})

/**
 * Validation happens when Save is pressed, not by greying Save out.
 *
 * A disabled button explains nothing: it gives a sighted user a control that
 * silently refuses to work and gives a screen-reader user no way at all to
 * find out which field is the problem. So Save stays pressable whatever the
 * draft looks like, and pressing it produces a message that names what is
 * wrong, marks the field it is about, and sends focus there.
 */
describe('ExpenseEditor submit-time validation', () => {
  const SAVE = { name: /^save$/i } as const

  it('leaves Save enabled on a completely empty draft', () => {
    render(<ExpenseEditor reportId="report-1" onDone={vi.fn()} />)
    expect(screen.getByRole('button', SAVE)).toBeEnabled()
  })

  it('rejects a missing amount with an alert, and marks the amount field', async () => {
    const user = userEvent.setup()
    render(<ExpenseEditor reportId="report-1" onDone={vi.fn()} />)

    await user.type(screen.getByPlaceholderText('e.g. Team lunch'), 'Taxi')
    await user.click(screen.getByRole('button', SAVE))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Enter the amount on the receipt before saving.')

    const amount = screen.getByLabelText('Amount')
    expect(amount).toHaveAttribute('aria-invalid', 'true')
    // The message is not merely near the field; it is the field's description,
    // so a screen reader reads it when focus lands there.
    expect(amount).toHaveAttribute('aria-describedby', alert.id)
    expect(amount).toHaveFocus()

    expect(saveExpenseWithImage).not.toHaveBeenCalled()
  })

  it('rejects a draft with neither a title nor a merchant, and marks the title field', async () => {
    const user = userEvent.setup()
    render(<ExpenseEditor reportId="report-1" onDone={vi.fn()} />)

    await user.type(screen.getByLabelText('Amount'), '20')
    await user.click(screen.getByRole('button', SAVE))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Enter a title or a merchant before saving.')

    const title = screen.getByPlaceholderText('e.g. Team lunch')
    expect(title).toHaveAttribute('aria-invalid', 'true')
    expect(title).toHaveAttribute('aria-describedby', alert.id)
    expect(saveExpenseWithImage).not.toHaveBeenCalled()
  })

  it('saves when a merchant stands in for the title', async () => {
    // The rule is "title or merchant", and the merchant is copied into the
    // title — so a draft with only a merchant has to go through.
    const user = userEvent.setup()
    render(<ExpenseEditor reportId="report-1" onDone={vi.fn()} />)

    await user.type(screen.getByPlaceholderText("e.g. Joe's Diner"), 'Cafe')
    await user.type(screen.getByLabelText('Amount'), '20')
    await user.click(screen.getByRole('button', SAVE))

    await waitFor(() => expect(saveExpenseWithImage).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).toBeNull()
    expect(saveExpenseWithImage.mock.calls[0][0]).toMatchObject({ title: 'Cafe', merchant: 'Cafe' })
  })

  /**
   * The personal amount used to be clamped into [0, amount] on the way to the
   * record: an 80 typed against a $50 receipt was saved as 50, and nothing
   * anywhere said so. One of the two figures is wrong and only the user knows
   * which, so the save is refused and they are told the total it was measured
   * against.
   */
  it('refuses a personal amount above the expense total instead of clamping it', async () => {
    const user = userEvent.setup()
    render(<ExpenseEditor reportId="report-1" onDone={vi.fn()} />)

    await user.type(screen.getByPlaceholderText('e.g. Team lunch'), 'Dinner')
    await user.type(screen.getByLabelText('Amount'), '50')
    await user.type(screen.getByLabelText('Personal amount (pay back to company)'), '80')
    await user.click(screen.getByRole('button', SAVE))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("The personal amount can't be more than the expense total of 50.00.")

    const personal = screen.getByLabelText('Personal amount (pay back to company)')
    expect(personal).toHaveAttribute('aria-invalid', 'true')
    expect(personal).toHaveAttribute('aria-describedby', alert.id)
    expect(personal).toHaveFocus()

    // Nothing was written, and in particular nothing was written with the
    // quietly-substituted 50.
    expect(saveExpenseWithImage).not.toHaveBeenCalled()
    // The typed figure is still on screen for the user to correct.
    expect(personal).toHaveValue(80)
  })

  it('refuses a negative personal amount', async () => {
    const user = userEvent.setup()
    render(<ExpenseEditor reportId="report-1" onDone={vi.fn()} />)

    await user.type(screen.getByPlaceholderText('e.g. Team lunch'), 'Dinner')
    await user.type(screen.getByLabelText('Amount'), '50')
    // Set directly rather than typed: a number input holds no value for the
    // lone "-" of a part-typed "-5", so typing it never produces a negative.
    fireEvent.change(screen.getByLabelText('Personal amount (pay back to company)'), {
      target: { value: '-5' },
    })
    await user.click(screen.getByRole('button', SAVE))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The personal amount has to be a number, and not less than zero.',
    )
    expect(saveExpenseWithImage).not.toHaveBeenCalled()
  })

  it('accepts a personal amount equal to the whole expense', async () => {
    const user = userEvent.setup()
    render(<ExpenseEditor reportId="report-1" onDone={vi.fn()} />)

    await user.type(screen.getByPlaceholderText('e.g. Team lunch'), 'Dinner')
    await user.type(screen.getByLabelText('Amount'), '50')
    await user.type(screen.getByLabelText('Personal amount (pay back to company)'), '50')
    await user.click(screen.getByRole('button', SAVE))

    await waitFor(() => expect(saveExpenseWithImage).toHaveBeenCalled())
    expect(saveExpenseWithImage.mock.calls[0][0]).toMatchObject({ amount: 50, personalAmount: 50 })
  })

  it('clears the message once the user answers it', async () => {
    // Typing is the user responding, so leaving a complaint on screen about a
    // value they have since changed would be stale rather than helpful.
    const user = userEvent.setup()
    render(<ExpenseEditor reportId="report-1" onDone={vi.fn()} />)

    await user.type(screen.getByPlaceholderText('e.g. Team lunch'), 'Taxi')
    await user.click(screen.getByRole('button', SAVE))
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Amount'), '20')

    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByLabelText('Amount')).not.toHaveAttribute('aria-invalid')
  })

  it('moves focus back to the field again when Save is pressed a second time with the same problem', async () => {
    // The rejection stores a fresh object every time, so a second press still
    // moves focus rather than looking like nothing happened.
    const user = userEvent.setup()
    render(<ExpenseEditor reportId="report-1" onDone={vi.fn()} />)

    await user.type(screen.getByPlaceholderText('e.g. Team lunch'), 'Taxi')
    await user.click(screen.getByRole('button', SAVE))
    await screen.findByRole('alert')

    screen.getByPlaceholderText("e.g. Joe's Diner").focus()
    await user.click(screen.getByRole('button', SAVE))

    await waitFor(() => expect(screen.getByLabelText('Amount')).toHaveFocus())
  })
})
