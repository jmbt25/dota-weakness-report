// Cat 2 — Lane phase sub-section.
//
// 1. first_blood              — time + actor (handles negative time per
//                                Phase 0.5 spec adjustment)
// 2. t1_timing_extreme        — first/last T1 falls; only names heroes
//                                when slot is present (creep-finished
//                                towers are anonymous)
// 3. lane_outcomes_aggregate  — N of 3 lanes won by each team via cores'
//                                lane_efficiency_pct

import { resolveDisplayName } from '../displayName'
import type { ODObjective } from '../../../types'
import type { MatchContext, PlayerContext } from '../cat1b'
import { isCorePosition, type Position } from '../positionFromMatch'
import { fire, type Cat2Template } from './types'

function fmtMmSs(seconds: number): string {
  if (seconds < 0) {
    const s = Math.abs(Math.round(seconds))
    return `-0:${String(s).padStart(2, '0')}`
  }
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function objectivesOfType(ctx: MatchContext, type: string): ODObjective[] {
  return (ctx.detail.objectives ?? []).filter((o) => o.type === type)
}

function findPlayerByTeamSlot(ctx: MatchContext, teamSlot: number | undefined): PlayerContext | null {
  if (typeof teamSlot !== 'number') return null
  // FIRSTBLOOD's `slot` field is the team_slot (0-9 across both teams).
  // 0-4 = Radiant, 5-9 = Dire. The actual player_slot encoding for Dire
  // is 128 + team_slot - 5.
  const isRadiant = teamSlot < 5
  const playerSlot = isRadiant ? teamSlot : 128 + (teamSlot - 5)
  return ctx.players.find((p) => p.player.player_slot === playerSlot) ?? null
}

function findPlayerByPlayerSlot(ctx: MatchContext, playerSlot: number | undefined): PlayerContext | null {
  if (typeof playerSlot !== 'number') return null
  return ctx.players.find((p) => p.player.player_slot === playerSlot) ?? null
}

/** 1. First blood — time + actor + pre-creep framing when time < 0. */
const firstBlood: Cat2Template = {
  id: 'first_blood',
  priority: 6,
  produce: (ctx) => {
    const events = objectivesOfType(ctx, 'CHAT_MESSAGE_FIRSTBLOOD')
    const fb = events[0]
    if (!fb) return null
    const time = fb.time
    if (typeof time !== 'number') return null

    // Killer resolution — `slot` is team_slot (0-9), `player_slot` is
    // the encoded slot. Some matches have one but not the other; try slot first.
    let killer: PlayerContext | null = null
    if (typeof fb.slot === 'number') killer = findPlayerByTeamSlot(ctx, fb.slot)
    if (!killer) killer = findPlayerByPlayerSlot(ctx, fb.player_slot)
    if (!killer) return null

    const killerName = resolveDisplayName(killer.player.account_id ?? null, killer.position)
    const heroName = killer.heroName

    if (time < 0) {
      return fire(
        `First blood landed before the creep wave — ${killerName} (${heroName}) on a pre-creep gank.`,
        {
          time_sec: time,
          killer_hero: heroName,
          killer_position: killer.position,
          pre_creep: 'true',
        }
      )
    }
    return fire(
      `First blood at ${fmtMmSs(time)} — ${killerName} (${heroName}).`,
      {
        time_sec: time,
        time_mmss: fmtMmSs(time),
        killer_hero: heroName,
        killer_position: killer.position,
      }
    )
  },
}

/** 2. T1 timing extreme — first/last T1 fall, with hero credit when slot is present. */
const t1TimingExtreme: Cat2Template = {
  id: 't1_timing_extreme',
  priority: 5,
  produce: (ctx) => {
    const t1s = (ctx.detail.objectives ?? []).filter(
      (o) => o.type === 'building_kill' &&
        typeof o.key === 'string' &&
        /tower1_(top|mid|bot)$/.test(o.key)
    )
    if (t1s.length < 2) return null

    const sorted = [...t1s].sort((a, b) => (a.time ?? 0) - (b.time ?? 0))
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    if (typeof first.time !== 'number' || typeof last.time !== 'number') return null

    // Map building_kill.key → which team's T1 fell.
    // npc_dota_goodguys_tower1_*  = Radiant T1 (Dire took it)
    // npc_dota_badguys_tower1_*   = Dire T1    (Radiant took it)
    function fellSide(key: string | number | undefined): 'radiant' | 'dire' | null {
      if (typeof key !== 'string') return null
      if (key.includes('goodguys_tower1_')) return 'radiant'
      if (key.includes('badguys_tower1_')) return 'dire'
      return null
    }
    function laneOf(key: string | number | undefined): string | null {
      if (typeof key !== 'string') return null
      if (key.endsWith('top')) return 'top'
      if (key.endsWith('mid')) return 'mid'
      if (key.endsWith('bot')) return 'bot'
      return null
    }

    const firstFell = fellSide(first.key)
    const firstLane = laneOf(first.key)
    if (!firstFell || !firstLane) return null

    // First T1 — name the hero only when slot is present and unit is a
    // hero (creep-finished towers are anonymous per Phase 0.5 spec).
    let firstHeroLabel = ''
    if (typeof first.slot === 'number' && typeof first.unit === 'string' && first.unit.startsWith('npc_dota_hero_')) {
      // Resolve via the killer's player record — gets the localized name
      // from the heroName resolver passed into MatchContext, regardless
      // of whether getHeroName's singleton has been bootstrapped.
      const killer = ctx.players[first.slot]
      if (killer) firstHeroLabel = ` to ${killer.heroName}`
    }

    const lastFell = fellSide(last.key)
    const lastLane = laneOf(last.key)
    if (!lastFell || !lastLane) return null

    const sideLabel = (s: 'radiant' | 'dire') => (s === 'radiant' ? 'Radiant' : 'Dire')

    const text = `${sideLabel(firstFell)} ${firstLane} T1 fell at ${fmtMmSs(first.time)}${firstHeroLabel} — earliest of the ${t1s.length} T1s. ${sideLabel(lastFell)} ${lastLane} T1 stood until ${fmtMmSs(last.time)}.`

    return {
      text,
      facts: {
        first_t1_time: fmtMmSs(first.time),
        first_t1_lane: firstLane,
        first_t1_side: firstFell,
        last_t1_time: fmtMmSs(last.time),
        last_t1_lane: lastLane,
        last_t1_side: lastFell,
        t1_count: t1s.length,
      },
    }
  },
}

/** 3. Lane outcomes aggregate — count lanes won by each team. */
const laneOutcomesAggregate: Cat2Template = {
  id: 'lane_outcomes_aggregate',
  priority: 5,
  produce: (ctx) => {
    // Group cores by (team, lane_role). For each lane bucket, take the
    // higher of the two teams' core lane_efficiency_pct.
    type Lane = 1 | 2 | 3
    const lanes: Lane[] = [1, 2, 3]
    const bucket = (team: 0 | 1, lane: Lane): PlayerContext[] =>
      ctx.players.filter((p) =>
        ((p.player.player_slot ?? 0) < 128 ? 0 : 1) === team &&
        p.player.lane_role === lane &&
        isCorePosition(p.position as Position)
      )
    const maxEff = (players: PlayerContext[]): number | null => {
      const effs = players
        .map((p) => p.player.lane_efficiency_pct)
        .filter((x): x is number => typeof x === 'number')
      return effs.length === 0 ? null : Math.max(...effs)
    }

    let radiantWins = 0
    let direWins = 0
    let ties = 0
    const detail: { lane: Lane; radiant: number | null; dire: number | null; winner: 'r' | 'd' | 'tie' | null }[] = []
    for (const lane of lanes) {
      const r = maxEff(bucket(0, lane))
      const d = maxEff(bucket(1, lane))
      let winner: 'r' | 'd' | 'tie' | null = null
      if (r != null && d != null) {
        if (r > d + 5) { radiantWins++; winner = 'r' }
        else if (d > r + 5) { direWins++; winner = 'd' }
        else { ties++; winner = 'tie' }
      }
      detail.push({ lane, radiant: r, dire: d, winner })
    }
    const totalDecided = radiantWins + direWins
    if (totalDecided === 0) return null

    // Find a dramatic lane callout (≥ 30pp gap) — required when teams are
    // tied or close. "Lanes split 1-1" with no specifics doesn't earn a
    // line.
    const laneNames: Record<Lane, string> = { 1: 'safe', 2: 'mid', 3: 'off' }
    const dramatic = detail.find((d) =>
      d.radiant != null && d.dire != null && Math.abs(d.radiant - d.dire) >= 30
    )

    let lead: string
    if (radiantWins > direWins) lead = `Radiant won ${radiantWins} of 3 lanes`
    else if (direWins > radiantWins) lead = `Dire won ${direWins} of 3 lanes`
    else if (dramatic) {
      // Tied wins but at least one lane was lopsided
      const winnerName = dramatic.winner === 'r' ? 'Radiant' : 'Dire'
      lead = `Lanes traded ${radiantWins}-${direWins}, with ${winnerName} dominating the ${laneNames[dramatic.lane]}`
    } else {
      // Tied AND no dramatic callout → not narrative-worthy
      return null
    }

    let detailClause = '.'
    if (dramatic && (radiantWins !== direWins)) {
      const winnerName = dramatic.winner === 'r' ? 'Radiant' : 'Dire'
      const winEff = dramatic.winner === 'r' ? dramatic.radiant : dramatic.dire
      const loseEff = dramatic.winner === 'r' ? dramatic.dire : dramatic.radiant
      detailClause = ` — ${laneNames[dramatic.lane]} lane was decisive (${winnerName} ${winEff}% vs ${loseEff}%).`
    } else if (dramatic) {
      const winEff = dramatic.winner === 'r' ? dramatic.radiant : dramatic.dire
      const loseEff = dramatic.winner === 'r' ? dramatic.dire : dramatic.radiant
      detailClause = ` (${winEff}% vs ${loseEff}%).`
    }

    return fire(`${lead}${detailClause}`, {
      radiant_wins: radiantWins,
      dire_wins: direWins,
      ties,
      total_decided: totalDecided,
    })
  },
}

export const LANE_TEMPLATES: Cat2Template[] = [
  firstBlood,
  t1TimingExtreme,
  laneOutcomesAggregate,
]
