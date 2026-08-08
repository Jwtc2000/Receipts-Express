const ACCEPTED_KEY = 'br.termsAccepted'

/**
 * Bump this only when the Terms or Privacy Policy change in a way that
 * materially affects the user's rights — a typo fix or a reworded paragraph
 * should not re-prompt everyone. The stored value is compared against it, so
 * a bump asks every existing user to acknowledge again.
 */
export const TERMS_VERSION = '2026-08-08'

interface Acceptance {
  version: string
  acceptedAt: string
}

/**
 * Terms linked from a menu drawer are browsewrap, and browsewrap generally
 * fails: the 9th Circuit requires both conspicuous notice and an unambiguous
 * act of assent. The warranty disclaimer and liability cap are only worth
 * anything if the agreement formed, so the app asks once, up front, with a
 * button that says what it means. What's recorded here is the only evidence
 * that it happened.
 */
export function readAcceptance(): Acceptance | null {
  try {
    const raw = localStorage.getItem(ACCEPTED_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as Acceptance).version === 'string' &&
      typeof (parsed as Acceptance).acceptedAt === 'string'
    ) {
      return parsed as Acceptance
    }
    return null
  } catch {
    // Corrupt or unreadable (private-mode quota, hand-edited value) — treat
    // as never accepted and ask again rather than silently assuming assent.
    return null
  }
}

/** True when the current terms version has not been acknowledged yet. */
export function needsAcceptance(): boolean {
  return readAcceptance()?.version !== TERMS_VERSION
}

export function recordAcceptance(now: Date = new Date()): void {
  const value: Acceptance = { version: TERMS_VERSION, acceptedAt: now.toISOString() }
  try {
    localStorage.setItem(ACCEPTED_KEY, JSON.stringify(value))
  } catch {
    // Storage full or blocked. The user still agreed; failing to persist it
    // must not block them from using the app — they'll simply be asked again.
  }
}
