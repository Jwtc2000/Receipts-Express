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
