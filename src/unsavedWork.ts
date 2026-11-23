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
 * A count of edits to the draft, and the count at which the user last agreed
 * to lose it. Agreement covers the draft as it was when they agreed and no
 * later: the editor stays usable while an update loads, and something typed
 * after saying "reload anyway" was not part of what they agreed to lose.
 */
let edits = 0
let discardConfirmedAt = -1

export function noteEdit(): void {
  edits++
}

/** The user agreed, in the app's own prompt, that the draft as it is now may go. */
export function confirmDiscard(): void {
  discardConfirmedAt = edits
}

/**
 * True when that agreement still covers the draft. The editor's beforeunload
 * guard reads this so the browser does not ask a second time.
 */
export function isDiscardConfirmed(): boolean {
  return discardConfirmedAt === edits
}
