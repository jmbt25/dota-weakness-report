// Position 1-5 classifier for /watch prose.
//
// Mirrors the existing classifyPos in scripts/build-pro-vectors.mjs and
// src/lib/proComparison.ts. Pulled into its own module because Cat 1B
// templates need it independently of the playstyle-vector pipeline.
//
// Pos numbering (Dota community standard):
//   1 = safe-lane carry
//   2 = mid
//   3 = offlane
//   4 = soft support / roaming
//   5 = hard support
//
// When you change the algorithm here, also change build-pro-vectors.mjs
// + proComparison.ts so the corpus and the live read agree.

import type { ODMatchDetail, ODMatchPlayer } from '../../types'
import { classifyHeroById } from '../heroRoles'

export type Position = 1 | 2 | 3 | 4 | 5

export function classifyPosition(
  player: ODMatchPlayer,
  detail: ODMatchDetail
): Position {
  const heroRole = classifyHeroById(player.hero_id)
  const lane = player.lane_role
  const roaming = player.is_roaming === true
  const lhPerMin =
    (player.last_hits ?? 0) / Math.max(detail.duration / 60, 1)

  if (lane === 2) return 2
  if (lane === 4 || roaming) return 4
  if (lane === 1) {
    if (heroRole === 'support') return 5
    if (heroRole === 'core') return 1
    return lhPerMin >= 4.5 ? 1 : 5
  }
  if (lane === 3) {
    if (heroRole === 'support') return 4
    if (heroRole === 'core') return 3
    return lhPerMin >= 4.0 ? 3 : 4
  }
  if (heroRole === 'support') return lhPerMin < 2 ? 5 : 4
  return lhPerMin >= 5 ? 1 : 3
}

export function isCorePosition(pos: Position): boolean {
  return pos === 1 || pos === 2 || pos === 3
}

export function isSupportPosition(pos: Position): boolean {
  return pos === 4 || pos === 5
}

export function positionLabel(pos: Position): string {
  return `Pos ${pos}`
}
