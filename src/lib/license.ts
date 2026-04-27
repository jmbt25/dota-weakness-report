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

// Free tier is 20 matches — non-negotiable floor because hero-pool and
// tilt analyses are too noisy below ~15 games. Paid tier widens the
// window to 100 matches and unlocks the per-hero deep dive.
export const FREE_TIER_MATCH_LIMIT = 20
export const PAID_TIER_MATCH_LIMIT = 100

// We cap how many matches actually get detail-fetched + parse-requested.
// 100 fully-parsed matches would take 30+ minutes in the worst case;
// past ~30 the parsed-only analyses (lane/farm/item/death timing) hit
// diminishing returns anyway. Hero-pool and tilt analyses still see all
// 100 because they read summary fields only.
export const MAX_DETAIL_FETCH = 30
