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
 * Role inference from the user's hero pool.
 *
 * Heuristic: classify each of the user's top 5 most-played heroes via the
 * OpenDota /heroes role tags (Support-and-not-Carry → support, otherwise
 * core), then take the majority vote.
 *
 * Falls back to a GPM/last-hit threshold when the heroes index isn't loaded
 * (e.g. /heroes fetch failed) or when no parsed details are available.
 */
export function inferRole(
  matches: ODMatchSummary[],
  details: Record<number, ODMatchDetail>,
  accountId: number
): Role {
  if (matches.length === 0) return 'unknown'

  // Hero-pool majority vote, weighted by games played.
  const heroGames = new Map<number, number>()
  for (const m of matches) heroGames.set(m.hero_id, (heroGames.get(m.hero_id) ?? 0) + 1)
  const top5 = [...heroGames.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)

  let supportWeight = 0
  let coreWeight = 0
  let knownWeight = 0
  for (const [heroId, games] of top5) {
    const style = heroPlaystyle(heroId)
    if (style === 'unknown') continue
    knownWeight += games
    if (style === 'support') supportWeight += games
    else coreWeight += games
  }
  if (knownWeight > 0) {
    return supportWeight > coreWeight ? 'support' : 'core'
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
