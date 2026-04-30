// Cat 2 — Teamfights sub-section.
//
// 1. teamfight_count_outcome — N fights, win/loss split per team
// 2. longest_fight           — longest by duration, deaths total
// 3. decisive_fight          — fight followed by raxx / Roshan / >5k swing
// 4. fight_distribution      — early/mid/late phase regime change

import type { ODObjective, ODTeamfight } from '../../../types'
import type { MatchContext } from '../cat1b'
import type { Cat2Template } from './types'

function fmtMmSs(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

interface FightResult {
  fight: ODTeamfight
  radiantDeaths: number
  direDeaths: number
  /** Negative = Radiant won (fewer deaths), positive = Dire won. */
  netDeaths: number
  totalDeaths: number
}

function classifyFights(ctx: MatchContext): FightResult[] {
  const tfs = ctx.detail.teamfights ?? []
  const out: FightResult[] = []
  for (const f of tfs) {
    let radiantDeaths = 0
    let direDeaths = 0
    const players = f.players ?? []
    for (let i = 0; i < players.length; i++) {
      const p = players[i]
      const deaths = p.deaths ?? 0
      // Teamfight players[] is in match.players[] order — first 5 are Radiant.
      if (i < 5) radiantDeaths += deaths
      else direDeaths += deaths
    }
    out.push({
      fight: f,
      radiantDeaths,
      direDeaths,
      netDeaths: direDeaths - radiantDeaths,
      totalDeaths: radiantDeaths + direDeaths,
    })
  }
  return out
}

/** 1. Teamfight count + outcome split. */
const teamfightCountOutcome: Cat2Template = {
  id: 'teamfight_count_outcome',
  priority: 5,
  produce: (ctx) => {
    const fights = classifyFights(ctx)
    if (fights.length < 2) return null

    let radiantWon = 0
    let direWon = 0
    let traded = 0
    for (const f of fights) {
      if (f.netDeaths > 0) radiantWon++
      else if (f.netDeaths < 0) direWon++
      else traded++
    }
    if (radiantWon === direWon && traded > 0) {
      return {
        text: `${fights.length} teamfights logged — split ${radiantWon}-${direWon}, with ${traded} traded.`,
        facts: { total: fights.length, radiant_won: radiantWon, dire_won: direWon, traded },
      }
    }
    if (radiantWon === direWon) return null  // 50/50 with no traded line — boring
    const leader = radiantWon > direWon ? 'Radiant' : 'Dire'
    const leaderCount = Math.max(radiantWon, direWon)
    return {
      text: `${fights.length} teamfights logged. ${leader} won ${leaderCount} of them.`,
      facts: { total: fights.length, radiant_won: radiantWon, dire_won: direWon, traded },
    }
  },
}

/** 2. Longest fight. */
const longestFight: Cat2Template = {
  id: 'longest_fight',
  priority: 4,
  produce: (ctx) => {
    const tfs = ctx.detail.teamfights ?? []
    if (tfs.length === 0) return null
    let longest: ODTeamfight | null = null
    let maxDur = 0
    for (const f of tfs) {
      const dur = f.end - f.start
      if (dur > maxDur) {
        maxDur = dur
        longest = f
      }
    }
    if (!longest || maxDur < 30) return null  // skip when nothing was particularly long
    const deaths = longest.deaths ?? 0
    return {
      text: `Longest fight: ${maxDur}s at ${fmtMmSs(longest.start)} — ${deaths} total deaths.`,
      facts: {
        duration_sec: maxDur,
        start: fmtMmSs(longest.start),
        end: fmtMmSs(longest.end),
        deaths,
      },
    }
  },
}

/** 3. Decisive fight — followed by raxx / Roshan / >5k gold swing within 90s. */
const decisiveFight: Cat2Template = {
  id: 'decisive_fight',
  priority: 8,
  produce: (ctx) => {
    const fights = classifyFights(ctx)
    if (fights.length === 0) return null

    const objectives = ctx.detail.objectives ?? []
    const goldAdv = ctx.detail.radiant_gold_adv ?? []

    interface DecisiveFire {
      fight: FightResult
      consequence: string
      side: 'Radiant' | 'Dire'
    }
    const fires: DecisiveFire[] = []
    for (const f of fights) {
      const winner: 'Radiant' | 'Dire' | null =
        f.netDeaths > 1 ? 'Radiant' : f.netDeaths < -1 ? 'Dire' : null
      if (!winner) continue  // close fights aren't decisive

      // Check for raxx fall within 90s of fight end
      const raxxEvent = objectives.find(
        (o) =>
          o.type === 'building_kill' &&
          typeof o.key === 'string' &&
          /(melee|range)_rax/.test(o.key as string) &&
          typeof o.time === 'number' &&
          (o.time as number) >= f.fight.end &&
          (o.time as number) <= f.fight.end + 90
      ) as ODObjective | undefined

      if (raxxEvent && typeof raxxEvent.key === 'string') {
        // Side that LOST the raxx
        const fellSide = raxxEvent.key.includes('goodguys_') ? 'Radiant' : 'Dire'
        const tookSide = fellSide === 'Radiant' ? 'Dire' : 'Radiant'
        if (tookSide === winner) {
          fires.push({
            fight: f,
            consequence: `${winner} took raxx within 90 seconds`,
            side: winner,
          })
          continue
        }
      }

      // Check for gold lead swing within 60s of fight end
      const fightEndMin = Math.floor(f.fight.end / 60)
      const swingEndMin = Math.min(goldAdv.length - 1, fightEndMin + 1)
      if (fightEndMin > 0 && fightEndMin < goldAdv.length && swingEndMin < goldAdv.length) {
        const before = goldAdv[fightEndMin - 1]
        const after = goldAdv[swingEndMin]
        const swing = after - before
        if (Math.abs(swing) >= 5000 && Math.sign(swing) === (winner === 'Radiant' ? 1 : -1)) {
          fires.push({
            fight: f,
            consequence: `gold lead swung ${Math.abs(swing) >= 8000 ? 'dramatically' : 'sharply'} toward ${winner}`,
            side: winner,
          })
          continue
        }
      }
    }

    if (fires.length === 0) return null

    // Pick the most decisive (latest in game; later fights are usually
    // more game-ending). Could tie-break by total deaths but late > deaths.
    fires.sort((a, b) => b.fight.fight.start - a.fight.fight.start)
    const top = fires[0]
    const f = top.fight
    const opposingDeaths = top.side === 'Radiant' ? f.direDeaths : f.radiantDeaths
    const opposingTeam = top.side === 'Radiant' ? 'Dire' : 'Radiant'

    return {
      text: `Decisive fight: ${fmtMmSs(f.fight.start)} — ${opposingDeaths} ${opposingTeam} cores down, ${top.consequence}.`,
      facts: {
        fight_start: fmtMmSs(f.fight.start),
        winner: top.side,
        opposing_deaths: opposingDeaths,
        consequence: top.consequence,
      },
    }
  },
}

/** 4. Fight distribution — regime change between early/mid/late phases. */
const fightDistribution: Cat2Template = {
  id: 'fight_distribution',
  priority: 5,
  produce: (ctx) => {
    const fights = classifyFights(ctx)
    if (fights.length < 4) return null  // need enough fights for "distribution" to mean something

    const buckets: Record<'early' | 'late', { radiant: number; dire: number; total: number }> = {
      early: { radiant: 0, dire: 0, total: 0 },
      late: { radiant: 0, dire: 0, total: 0 },
    }
    const cutoff = 23 * 60 // 23 minutes — late game roughly starts here in pro Dota
    for (const f of fights) {
      const bucket = f.fight.start < cutoff ? 'early' : 'late'
      buckets[bucket].total++
      if (f.netDeaths > 0) buckets[bucket].radiant++
      else if (f.netDeaths < 0) buckets[bucket].dire++
    }

    // Look for a regime change: team A dominated early, team B dominated late
    function dominator(b: { radiant: number; dire: number; total: number }): 'Radiant' | 'Dire' | null {
      if (b.total < 2) return null
      if (b.radiant >= b.total * 0.66) return 'Radiant'
      if (b.dire >= b.total * 0.66) return 'Dire'
      return null
    }
    const earlyDom = dominator(buckets.early)
    const lateDom = dominator(buckets.late)
    if (!earlyDom || !lateDom || earlyDom === lateDom) return null

    return {
      text: `${earlyDom} dominated early-game fights (${buckets.early[earlyDom.toLowerCase() as 'radiant' | 'dire']} of ${buckets.early.total} before 23:00); ${lateDom} took over the late game (${buckets.late[lateDom.toLowerCase() as 'radiant' | 'dire']} of ${buckets.late.total} after).`,
      facts: {
        early_dominator: earlyDom,
        late_dominator: lateDom,
        early_total: buckets.early.total,
        late_total: buckets.late.total,
      },
    }
  },
}

export const TEAMFIGHTS_TEMPLATES: Cat2Template[] = [
  teamfightCountOutcome,
  longestFight,
  decisiveFight,
  fightDistribution,
]
