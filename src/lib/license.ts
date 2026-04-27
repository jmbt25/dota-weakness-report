// Stub license validation. Replace with a real Gumroad license verification
// later — likely a small Cloudflare Worker that proxies to Gumroad's
// license-check endpoint, since calling Gumroad directly from the browser
// would require exposing the seller token.
//
// For now: any 16-character key counts as "paid".

export function validateLicenseKey(key: string): boolean {
  const trimmed = key.trim()
  if (trimmed.length !== 16) return false
  return /^[A-Za-z0-9-]+$/.test(trimmed)
}

// We give the full 20-match window to free users so the report has enough
// signal for the hero-pool / tilt analyses (those need ~15+ games to be
// meaningful). The license input is kept for a future actually-paywalled
// feature (deeper pattern matching, hero-specific drilldowns, history).
export const FREE_TIER_MATCH_LIMIT = 20
export const PAID_TIER_MATCH_LIMIT = 20
