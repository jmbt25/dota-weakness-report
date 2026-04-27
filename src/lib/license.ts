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

// Free tier is 50 matches. Hero-pool / tilt / stack-synergy analyses run on
// the full summary list (one cheap API call regardless of N), so widening
// from 20 → 50 is free in API-cost terms but tightens stack-synergy CIs
// enough that significant partners actually surface in honest mode.
// MIN_GAMES_FOR_ANALYSIS (15) is still the noise floor inside heroPool.
// Paid tier widens to 100 and unlocks the per-hero deep dive.
export const FREE_TIER_MATCH_LIMIT = 50
export const PAID_TIER_MATCH_LIMIT = 100

// We cap how many matches actually get detail-fetched + parse-requested.
// Set to match the free-tier match window (50) so every match in the
// summary window also gets parsed-data coverage. Worst case (all 50
// unparsed) is ~5 minutes; typical mostly-parsed accounts ~70s. Paid
// tier's 100-match summary window still benefits hero-pool / tilt /
// stack-synergy at no extra parse cost — the parsed cards just see the
// most-recent 50.
export const MAX_DETAIL_FETCH = 50
