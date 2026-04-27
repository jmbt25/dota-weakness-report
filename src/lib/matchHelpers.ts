// Small helpers for pulling player-specific data out of OpenDota match details.

import type {
  ODMatchDetail,
  ODMatchPlayer,
  ODMatchSummary,
  Role,
  RoleDistribution,
} from '../types'
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
 * hardcoded `heroRoles.ts` table, then applies (per v5 spec):
 *   - support if support_pct >= 50%
 *     OR (support_pct + flex_pct >= 70% AND support_pct > core_pct)
 *   - core    if core_pct    >= 50%
 *     OR (core_pct    + flex_pct >= 70% AND core_pct    > support_pct)
 *   - else flex
 *
 * Falls back to a GPM/last-hit threshold from match details when no heroes
 * could be classified (e.g. all unknown IDs).
 */
export interface InferredRole {
  role: Role
  distribution: RoleDistribution
}

export function inferRole(
  matches: ODMatchSummary[],
  details: Record<number, ODMatchDetail>,
  accountId: number
): InferredRole {
  if (matches.length === 0) return { role: 'unknown', distribution: ZERO_DIST }

  let core = 0
  let support = 0
  let flex = 0
  const breakdown: Record<string, { games: number; role: string }> = {}
  for (const m of matches) {
    const style = heroPlaystyle(m.hero_id)
    if (style === 'core') core++
    else if (style === 'support') support++
    else flex++
    const key = String(m.hero_id)
    breakdown[key] ??= { games: 0, role: style }
    breakdown[key].games++
  }

  const total = core + support + flex
  if (total > 0) {
    const corePct = core / total
    const supportPct = support / total
    const flexPct = flex / total

    let result: Role
    if (supportPct >= 0.5) result = 'support'
    else if (corePct >= 0.5) result = 'core'
    else if (supportPct + flexPct >= 0.7 && supportPct > corePct) result = 'support'
    else if (corePct + flexPct >= 0.7 && corePct > supportPct) result = 'core'
    else result = 'flex'

    const distribution: RoleDistribution = {
      core: Number(corePct.toFixed(3)),
      support: Number(supportPct.toFixed(3)),
      flex: Number(flexPct.toFixed(3)),
    }
    // eslint-disable-next-line no-console
    console.debug('[role] classified', {
      result,
      counts: { core, support, flex, total },
      distribution,
      heroBreakdown: breakdown,
    })
    return { role: result, distribution }
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
  if (n === 0) return { role: 'unknown', distribution: ZERO_DIST }
  const avgGpm = gpmSum / n
  const avgLh = lhSum / n
  const role: Role = avgGpm < 320 && avgLh < 120 ? 'support' : 'core'
  return { role, distribution: ZERO_DIST }
}

const ZERO_DIST: RoleDistribution = { core: 0, support: 0, flex: 0 }

/**
 * Per-match role classification ('core' or 'support') for the role-split
 * view. Unlike `inferRole` (which picks ONE dominant role for the whole
 * window), this is called per-match so flex players can break their report
 * into "Core only" and "Support only" subsets.
 *
 * Resolution order:
 *   1. Hero is core in HERO_ROLES → 'core'
 *   2. Hero is support in HERO_ROLES → 'support'
 *   3. Hero is flex → use parsed lane_role / is_roaming / last_hits
 *      as tiebreakers. Without parsed details we fall back to a GPM/LH
 *      heuristic on the summary stats.
 */
export function classifyMatchRole(
  match: ODMatchSummary,
  detail: ODMatchDetail | undefined,
  accountId: number
): 'core' | 'support' {
  const playstyle = heroPlaystyle(match.hero_id)
  if (playstyle === 'core') return 'core'
  if (playstyle === 'support') return 'support'

  // Flex hero — disambiguate from the parsed match if we can.
  const player = detail ? findPlayerInMatch(detail, accountId) : undefined
  if (player) {
    if (player.is_roaming === true) return 'support'
    // lane_role: 1 = safe lane, 2 = mid, 3 = off, 4 = jungle (often pos 4 sup)
    if (player.lane_role === 4) return 'support'
    if (player.lane_role === 1 || player.lane_role === 2 || player.lane_role === 3) {
      // Even on a core lane, super-low LH + low GPM in a >25min game means
      // they probably played pos 4 with their carry. The lane_role field
      // doesn't distinguish between pos 1 and pos 5 on safe lane.
      const gpm = player.gold_per_min ?? 0
      const lhPerMin = (player.last_hits ?? 0) / Math.max(detail!.duration / 60, 1)
      if (gpm < 280 && lhPerMin < 2) return 'support'
      return 'core'
    }
  }

  // Last resort — summary GPM/LH proxy. Roughly: < 280 GPM and < 100 LH on
  // a flex hero usually means they were the support that game.
  const summaryDeaths = match.deaths ?? 0
  const summaryKA = (match.kills ?? 0) + (match.assists ?? 0)
  // Supports usually have higher A/K ratio + lower LH than cores. We don't
  // have LH on the summary, so KDA shape is the only signal.
  const aShare = summaryKA > 0 ? (match.assists ?? 0) / summaryKA : 0
  if (aShare > 0.7 && summaryDeaths >= 4) return 'support'
  return 'core'
}

export interface RoleSplit {
  /** match_id → per-match role. */
  byMatch: Record<number, 'core' | 'support'>
  coreCount: number
  supportCount: number
  /** True when both subsets have >= 10 games. */
  isEligible: boolean
}

/** Threshold for showing the role-split toggle. Both subsets must hit this. */
export const ROLE_SPLIT_MIN_GAMES = 10

export function computeRoleSplit(
  matches: ODMatchSummary[],
  details: Record<number, ODMatchDetail>,
  accountId: number
): RoleSplit {
  const byMatch: Record<number, 'core' | 'support'> = {}
  let coreCount = 0
  let supportCount = 0
  for (const m of matches) {
    const role = classifyMatchRole(m, details[m.match_id], accountId)
    byMatch[m.match_id] = role
    if (role === 'core') coreCount++
    else supportCount++
  }
  return {
    byMatch,
    coreCount,
    supportCount,
    isEligible: coreCount >= ROLE_SPLIT_MIN_GAMES && supportCount >= ROLE_SPLIT_MIN_GAMES,
  }
}
