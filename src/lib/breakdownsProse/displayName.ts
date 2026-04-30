// Display-name resolver for /breakdowns prose.
//
// Hard rule (per the Phase 2 PR + memory): NEVER use OpenDota's
// `personaname` field for user-facing display. Steam display names are
// unstable — pros set them to jokes, unicode, or other pros' handles.
// AMMAR_THE_F's personaname is "Collapse" (the name of an entirely
// different pro on PARIVISION). Surfacing personaname in /breakdowns prose
// would produce embarrassing-to-defamatory output.
//
// Resolution order:
//   1. Curated `name` from scripts/pro-baselines-list.json (account_id
//      lookup) — the recognized handle on broadcasts.
//   2. Position label fallback ("Pos 4") — when the player isn't in the
//      curated list (e.g. Open Qualifier rosters before 2026-06-01).
//
// `personaname` is read NOWHERE in this module by design.

import baselineList from '../../../scripts/pro-baselines-list.json'

const CURATED_NAME_BY_ACCOUNT_ID = new Map<number, string>()
for (const entry of baselineList.entries) {
  CURATED_NAME_BY_ACCOUNT_ID.set(entry.account_id, entry.name)
}

/**
 * Resolve a player's display name. Returns curated name if available,
 * otherwise falls back to a position label. Never returns personaname.
 */
export function resolveDisplayName(
  accountId: number | null | undefined,
  position: number
): string {
  if (typeof accountId === 'number') {
    const curated = CURATED_NAME_BY_ACCOUNT_ID.get(accountId)
    if (curated) return curated
  }
  return `Pos ${position}`
}

/**
 * True iff the player is in the curated list — useful for Phase 5 Cat 1A
 * gating (cross-match templates only fire for known pros).
 */
export function hasCuratedName(accountId: number | null | undefined): boolean {
  return typeof accountId === 'number' && CURATED_NAME_BY_ACCOUNT_ID.has(accountId)
}
