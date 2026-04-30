import { useMemo } from 'react'
import type { ODMatchDetail } from '../types'
import { getHeroName } from '../lib/heroes'
import {
  buildMatchContext,
  runCat1B,
  type PlayerContext,
  type ProseFire,
} from '../lib/watchProse/cat1b'
import { runCat1A } from '../lib/watchProse/cat1a'
import { resolveDisplayName } from '../lib/watchProse/displayName'
import { WatchPlayerCard } from './WatchPlayerCard'

interface WatchPlayerGridProps {
  detail: ODMatchDetail
}

/**
 * Renders the 10 per-player cards for /watch/{match_id}, grouped by
 * team. Phase 4 wiring: Cat 1B (within-match) prose only. Cat 1A
 * (cross-match) joins in Phase 5.
 *
 * Display-name resolution: curated `name` from pro-baselines-list.json
 * via account_id, position-label fallback otherwise. Personaname is
 * never read.
 */
export function WatchPlayerGrid({ detail }: WatchPlayerGridProps) {
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

  return (
    <div className="dwr-watch-players">
      <TeamSection
        label={`Radiant${detail.radiant_win ? ' — winner' : ''}`}
        players={radiantSorted}
        cat1a={cat1a}
        cat1b={cat1b}
      />
      <TeamSection
        label={`Dire${!detail.radiant_win ? ' — winner' : ''}`}
        players={direSorted}
        cat1a={cat1a}
        cat1b={cat1b}
      />
    </div>
  )
}

function TeamSection({
  label,
  players,
  cat1a,
  cat1b,
}: {
  label: string
  players: PlayerContext[]
  cat1a: Map<number, ProseFire[]>
  cat1b: Map<number, ProseFire[]>
}) {
  return (
    <section className="dwr-watch-team">
      <h2 className="dwr-watch-team-label">{label}</h2>
      <div className="dwr-watch-player-grid">
        {players.map((ctx) => (
          <WatchPlayerCard
            key={ctx.player.player_slot}
            ctx={ctx}
            cat1aFires={cat1a.get(ctx.player.player_slot) ?? []}
            cat1bFires={cat1b.get(ctx.player.player_slot) ?? []}
            displayName={resolveDisplayName(ctx.player.account_id, ctx.position)}
          />
        ))}
      </div>
    </section>
  )
}

function sortByPosition(players: PlayerContext[]): PlayerContext[] {
  return [...players].sort((a, b) => a.position - b.position)
}
