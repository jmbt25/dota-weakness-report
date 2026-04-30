// localStorage cache for the v1.9.0 user-comparison feature.
//
// Spec: docs/breakdowns-user-comparison-v1-spec.md §D.3 + Q1.
//
// Single-account cache (one Steam ID at a time, latest analyze run wins).
// Defensive read/write — silently no-ops in any context where
// localStorage is unavailable (embed iframes with strict CSP, Firefox
// private mode with strict tracking protection, quota exceeded, etc).
// Mirrors the safe* shape of src/lib/breakdownsCache.ts.
//
// Why localStorage instead of sessionStorage like breakdownsCache:
//   localStorage: survives tab close + new session — required so the
//                 user gets personalization on /breakdowns days after
//                 running /report.
//   sessionStorage: scoped to the tab — would force the user to re-run
//                   /report on every fresh tab.
//
// CLAUDE.md's "no localStorage unless explicitly requested" rule is
// satisfied: this is the explicit request, captured in the v1.9.0 spec.

import type { UserCompareData } from './userCompareData'

const CACHE_KEY = 'dwr.userCompare.v1'

function safeGetItem(key: string): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    window.localStorage.setItem(key, value)
  } catch {
    // QuotaExceeded, privacy mode, etc — fail silently.
  }
}

function safeRemoveItem(key: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    window.localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

/**
 * Read the cached UserCompareData, or null if missing / corrupt /
 * unavailable. A corrupt entry is removed as a side-effect so the next
 * read returns cleanly.
 */
export function getCachedUserCompareData(): UserCompareData | null {
  const raw = safeGetItem(CACHE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as UserCompareData
    if (!parsed || parsed.version !== 1) {
      safeRemoveItem(CACHE_KEY)
      return null
    }
    if (typeof parsed.account_id !== 'number') {
      safeRemoveItem(CACHE_KEY)
      return null
    }
    if (!parsed.user_per_position || !parsed.bracket_per_position) {
      safeRemoveItem(CACHE_KEY)
      return null
    }
    return parsed
  } catch {
    safeRemoveItem(CACHE_KEY)
    return null
  }
}

/**
 * Persist the latest UserCompareData. Idempotent — overwrites any
 * prior entry. Payload is small (~2 KB) so quota concerns are
 * unrealistic in practice.
 */
export function setCachedUserCompareData(data: UserCompareData): void {
  safeSetItem(CACHE_KEY, JSON.stringify(data))
}

/**
 * Wipe the cache. Used by Phase C if the user navigates away from a
 * stale entry, and reachable for tests. Not currently invoked from
 * the analyze pipeline — overwriting via setCachedUserCompareData is
 * the normal path.
 */
export function clearCachedUserCompareData(): void {
  safeRemoveItem(CACHE_KEY)
}

export const __test__ = { CACHE_KEY }
