// Small helpers for pulling player-specific data out of OpenDota match details.

import type { ODMatchDetail, ODMatchPlayer, ODMatchSummary, Role } from '../types'

/** A player_slot < 128 means Radiant; >= 128 means Dire. */
export function isRadiantSlot(playerSlot: number): boolean {
  return playerSlot < 128
}

/** Did the player win this match? */
export function didWin(match: { radiant_win: boolean; player_slot: number }): boolean {
  return match.radiant_win === isRadiantSlot(match.player_slot)
}

/** Locate the player object inside a parsed match detail by account ID. */
export function findPlayerInMatch(
  detail: ODMatchDetail,
  accountId: number
): ODMatchPlayer | undefined {
  return detail.players.find((p) => p.account_id === accountId)
}

/** Whether this match has parsed (replay-analyzed) data. */
export function isParsed(detail: ODMatchDetail | undefined): boolean {
  if (!detail) return false
  // Parsed matches expose `version` (non-null) and rich per-minute arrays.
  if (detail.version != null) return true
  const anyPlayer = detail.players[0]
  return Array.isArray(anyPlayer?.gold_t) && (anyPlayer?.gold_t?.length ?? 0) > 0
}

/**
 * Best-effort role inference from the user's matches.
 *
 * Heuristic: average GPM + last_hits across the window. Supports tend to sit
 * well below cores on both, so a simple threshold catches most cases.
 *
 * TODO: replace with dynamic baseline (use OpenDota lane_role + is_roaming
 * fields when matches are parsed; falls back to GPM for unparsed games).
 */
export function inferRole(
  matches: ODMatchSummary[],
  details: Record<number, ODMatchDetail>,
  accountId: number
): Role {
  if (matches.length === 0) return 'unknown'

  let gpmSum = 0
  let lhSum = 0
  let n = 0
  for (const m of matches) {
    const detail = details[m.match_id]
    const player = detail ? findPlayerInMatch(detail, accountId) : undefined
    if (!player) continue
    gpmSum += player.gold_per_min ?? 0
    lhSum += player.last_hits ?? 0
    n++
  }
  if (n === 0) return 'unknown'

  const avgGpm = gpmSum / n
  const avgLh = lhSum / n
  // Cores typically clear ~400+ GPM and ~150+ last hits in mid-bracket pubs.
  if (avgGpm < 320 && avgLh < 120) return 'support'
  return 'core'
}
