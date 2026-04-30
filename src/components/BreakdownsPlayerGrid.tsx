import { useMemo } from 'react'
import type { ODMatchDetail } from '../types'
import { getHeroName } from '../lib/heroes'
import {
  buildMatchContext,
  runCat1B,
  type PlayerContext,
  type ProseFire,
} from '../lib/breakdownsProse/cat1b'
import type { Position } from '../lib/breakdownsProse/positionFromMatch'
import { runCat1A } from '../lib/breakdownsProse/cat1a'
import { resolveDisplayName } from '../lib/breakdownsProse/displayName'
import type { UserCompareData } from '../lib/userCompareData'
import { BreakdownsPlayerCard } from './BreakdownsPlayerCard'

interface BreakdownsPlayerGridProps {
  detail: ODMatchDetail
  userCompareData: UserCompareData | null
  honestMode: boolean
}

/**
 * A team's position assignment is "valid" when each of pos 1-5 appears
 * exactly once across the 5 players. The classifier in
 * `positionFromMatch.ts` was last seen producing 1-3-1 distributions
 * (one team has two pos 3s + missing pos 4 or 5) on certain matches —
 * the underlying bug is tracked for v1.9.1. For v1.9.0 we surface a
 * disclaimer when this happens so users know the pos-N user-comparison
 * may be matching a player who isn't actually pos N.
 *
 * Returns true when ANY team's distribution is invalid.
 */
function hasAmbiguousPositionDistribution(players: PlayerContext[]): boolean {
  const radiantPositions = players.filter((p) => p.isRadiant).map((p) => p.position)
  const direPositions = players.filter((p) => !p.isRadiant).map((p) => p.position)
  return !isValidDistribution(radiantPositions) || !isValidDistribution(direPositions)
}

function isValidDistribution(positions: Position[]): boolean {
  if (positions.length !== 5) return false
  const seen = new Set(positions)
  if (seen.size !== 5) return false
  for (const p of [1, 2, 3, 4, 5] as const) {
    if (!seen.has(p)) return false
  }
  return true
}

/**
 * Renders the 10 per-player cards for /breakdowns/{match_id}, grouped by
 * team. Phase 4 wiring: Cat 1B (within-match) prose only. Cat 1A
 * (cross-match) joins in Phase 5.
 *
 * Display-name resolution: curated `name` from pro-baselines-list.json
 * via account_id, position-label fallback otherwise. Personaname is
 * never read.
 */
export function BreakdownsPlayerGrid({
  detail,
  userCompareData,
  honestMode,
}: BreakdownsPlayerGridProps) {
  const { ctx, cat1a, cat1b } = useMemo(() => {
    const ctx = buildMatchContext(detail, getHeroName)
    const cat1a = runCat1A(ctx)
    const cat1b = runCat1B(ctx)
    return { ctx, cat1a, cat1b }
  }, [detail])

  const radiantSorted = sortByPosition(ctx.players.filter((p) => p.isRadiant))
  const direSorted = sortByPosition(ctx.players.filter((p) => !p.isRadiant))

  if (ctx.players.length === 0) {
    return null
  }

  const ambiguousPositions = hasAmbiguousPositionDistribution(ctx.players)

  return (
    <div className="dwr-breakdowns-players">
      {ambiguousPositions && (
        <div className="dwr-breakdowns-position-warning" role="note">
          Note: position assignment for this match was ambiguous. Stat
          comparisons may not perfectly align with intended roles.
        </div>
      )}
      <TeamSection
        label={`Radiant${detail.radiant_win ? ' — winner' : ''}`}
        players={radiantSorted}
        cat1a={cat1a}
        cat1b={cat1b}
        userCompareData={userCompareData}
        honestMode={honestMode}
      />
      <TeamSection
        label={`Dire${!detail.radiant_win ? ' — winner' : ''}`}
        players={direSorted}
        cat1a={cat1a}
        cat1b={cat1b}
        userCompareData={userCompareData}
        honestMode={honestMode}
      />
    </div>
  )
}

function TeamSection({
  label,
  players,
  cat1a,
  cat1b,
  userCompareData,
  honestMode,
}: {
  label: string
  players: PlayerContext[]
  cat1a: Map<number, ProseFire[]>
  cat1b: Map<number, ProseFire[]>
  userCompareData: UserCompareData | null
  honestMode: boolean
}) {
  return (
    <section className="dwr-breakdowns-team">
      <h2 className="dwr-breakdowns-team-label">{label}</h2>
      <div className="dwr-breakdowns-player-grid">
        {players.map((ctx) => (
          <BreakdownsPlayerCard
            key={ctx.player.player_slot}
            ctx={ctx}
            cat1aFires={cat1a.get(ctx.player.player_slot) ?? []}
            cat1bFires={cat1b.get(ctx.player.player_slot) ?? []}
            displayName={resolveDisplayName(ctx.player.account_id, ctx.position)}
            userCompareData={userCompareData}
            honestMode={honestMode}
          />
        ))}
      </div>
    </section>
  )
}

function sortByPosition(players: PlayerContext[]): PlayerContext[] {
  return [...players].sort((a, b) => a.position - b.position)
}
