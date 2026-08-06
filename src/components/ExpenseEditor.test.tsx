// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
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
