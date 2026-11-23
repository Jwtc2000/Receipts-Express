/**
 * A tiny cross-component signal, not React context — ExpenseEditor and
 * UpdateBanner are unrelated siblings rendered directly by main.tsx, with
 * no shared parent to carry state between them. This lets the update
 * banner check, at the moment its Refresh button is clicked, whether
 * reloading right now would discard in-progress work.
 */
let unsaved = false

export function setHasUnsavedWork(value: boolean): void {
  unsaved = value
}

export function hasUnsavedWork(): boolean {
  return unsaved
}

/**
 * The user has already said, in the app's own prompt, that the unsaved work
 * may go. The editor's beforeunload guard reads this so the browser does not
 * ask the same question a second time while the page reloads.
 */
let discardConfirmed = false

export function confirmDiscard(): void {
  discardConfirmed = true
}

export function isDiscardConfirmed(): boolean {
  return discardConfirmed
}
