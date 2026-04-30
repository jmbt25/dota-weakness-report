// sessionStorage cache for the /breakdowns feature.
//
// Two distinct cache shapes:
//   - /proMatches list: 5-min TTL (the list churns as new matches finish)
//   - /matches/{id} detail: indefinite (pro match data is immutable post-end)
//
// Both readers return null on miss, expiry, or any failure (privacy mode,
// quota exceeded, etc) — the caller falls back to a network fetch.
//
// Both writers no-op silently if sessionStorage is unavailable. We never
// throw out of the cache layer; it's a perf hint, not a contract.

import type { ODMatchDetail, ODProMatch } from '../types'

const PRO_MATCHES_KEY = 'dwr.breakdowns.proMatches'
const MATCH_KEY_PREFIX = 'dwr.breakdowns.match.'
const PRO_MATCHES_TTL_MS = 5 * 60 * 1000 // 5 minutes

interface CachedProMatches {
  storedAt: number
  data: ODProMatch[]
}

interface CachedMatch {
  storedAt: number
  data: ODMatchDetail
}

function safeGetItem(key: string): string | null {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return null
    return window.sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return
    window.sessionStorage.setItem(key, value)
  } catch {
    // QuotaExceeded, privacy mode, etc — fail silently.
  }
}

export function getCachedProMatches(): ODProMatch[] | null {
  const raw = safeGetItem(PRO_MATCHES_KEY)
  if (!raw) return null
  try {
    const parsed: CachedProMatches = JSON.parse(raw)
    if (!parsed || typeof parsed.storedAt !== 'number' || !Array.isArray(parsed.data)) return null
    if (Date.now() - parsed.storedAt > PRO_MATCHES_TTL_MS) return null
    return parsed.data
  } catch {
    return null
  }
}

export function setCachedProMatches(data: ODProMatch[]): void {
  const payload: CachedProMatches = { storedAt: Date.now(), data }
  safeSetItem(PRO_MATCHES_KEY, JSON.stringify(payload))
}

export function getCachedMatch(matchId: number): ODMatchDetail | null {
  const raw = safeGetItem(MATCH_KEY_PREFIX + matchId)
  if (!raw) return null
  try {
    const parsed: CachedMatch = JSON.parse(raw)
    if (!parsed || typeof parsed.storedAt !== 'number' || !parsed.data) return null
    return parsed.data
  } catch {
    return null
  }
}

export function setCachedMatch(matchId: number, data: ODMatchDetail): void {
  const payload: CachedMatch = { storedAt: Date.now(), data }
  safeSetItem(MATCH_KEY_PREFIX + matchId, JSON.stringify(payload))
}
