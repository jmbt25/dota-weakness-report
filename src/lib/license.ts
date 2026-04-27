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

export const FREE_TIER_MATCH_LIMIT = 5
export const PAID_TIER_MATCH_LIMIT = 20
