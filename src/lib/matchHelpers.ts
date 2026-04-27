// Small helpers for pulling player-specific data out of OpenDota match details.

import type { ODMatchDetail, ODMatchPlayer, ODMatchSummary, Role } from '../types'
import { heroPlaystyle } from './heroes'

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
  if (detail.version != null) return true
  const anyPlayer = detail.players[0]
  return Array.isArray(anyPlayer?.gold_t) && (anyPlayer?.gold_t?.length ?? 0) > 0
}

/**
 * Role inference from the user's full hero pool.
 *
 * Counts each match's hero as 'core', 'support', or 'flex' via the
 * /heroes role tags + override table in `heroRoles.ts`. Weighted by games:
 *   - core if core-share > 60%
 *   - support if support-share > 60%
 *   - else 'flex' (with a tiebreak: lean toward whichever side has more
 *     games when the two are far apart but neither hits 60%)
 *
 * Falls back to a GPM/last-hit threshold from match details when the
 * heroes index hasn't loaded.
 */
export function inferRole(
  matches: ODMatchSummary[],
  details: Record<number, ODMatchDetail>,
  accountId: number
): Role {
  if (matches.length === 0) return 'unknown'

  // Weighted count by games played across the entire window.
  let core = 0
  let support = 0
  let flex = 0
  for (const m of matches) {
    const style = heroPlaystyle(m.hero_id)
    if (style === 'core') core++
    else if (style === 'support') support++
    else flex++
  }

  const total = core + support + flex
  if (total > 0) {
    const corePct = core / total
    const supportPct = support / total
    if (corePct > 0.6) return 'core'
    if (supportPct > 0.6) return 'support'
    // Tiebreaker: if one side clearly outweighs the other and flex is the
    // bridge, lean to that side. Avoids "everyone is flex" for users with
    // a meaningful tilt but lots of flex picks.
    if (support > core && supportPct >= 0.4) return 'support'
    if (core > support && corePct >= 0.4) return 'core'
    return 'flex'
  }

  // Fallback: GPM/last-hit heuristic from match details.
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
  if (avgGpm < 320 && avgLh < 120) return 'support'
  return 'core'
}
