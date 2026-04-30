// Cat 2 — Mid game / Roshan sub-section.
//
// 1. first_roshan       — time + killer team + Aegis recipient (with
//                          AEGIS_STOLEN handling per Phase 0.5 spec)
// 2. roshan_count       — total + per-team breakdown when ≥ 2 (skip
//                          gracefully when 0 — no apologetic placeholder)
// 3. gold_lead_swing    — peak / trough / final, dramatic-swing detection
//
// Cheese-usage tracking DROPPED for Phase 6 (data not in purchase_log).
// Aegis-usage tracking DEFERRED to v1.1 (recipient-only here).
//
// TODO (v1.1): Aegis usage detection — correlate AEGIS time with the
// recipient's subsequent kills_log entries. If they died within their
// Aegis window (~5 min) the Aegis was "saved." Otherwise wasted.
// TODO (v1.1): Tormentor / Aghanim's Shard timing — CHAT_MESSAGE_MINIBOSS_KILL
// events show up reliably in 3/5 sample matches; broadcast-tier signal.

import { resolveDisplayName } from '../displayName'
import type { ODObjective } from '../../../types'
import type { MatchContext, PlayerContext } from '../cat1b'
import { fire, type Cat2Template } from './types'

function fmtMmSs(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// Roshan team encoding: team=2 = Radiant killed it, team=3 = Dire killed it.
function roshanKillerLabel(team: number | undefined): 'Radiant' | 'Dire' | null {
  if (team === 2) return 'Radiant'
  if (team === 3) return 'Dire'
  return null
}

function findPlayerByPlayerSlot(ctx: MatchContext, playerSlot: number | undefined): PlayerContext | null {
  if (typeof playerSlot !== 'number') return null
  return ctx.players.find((p) => p.player.player_slot === playerSlot) ?? null
}

function findPlayerByTeamSlot(ctx: MatchContext, teamSlot: number | undefined): PlayerContext | null {
  if (typeof teamSlot !== 'number') return null
  const isRadiant = teamSlot < 5
  const playerSlot = isRadiant ? teamSlot : 128 + (teamSlot - 5)
  return ctx.players.find((p) => p.player.player_slot === playerSlot) ?? null
}

/** 1. First Roshan — time + killer team + Aegis recipient + STOLEN handling. */
const firstRoshan: Cat2Template = {
  id: 'first_roshan',
  priority: 7,
  produce: (ctx) => {
    const events = ctx.detail.objectives ?? []
    const roshKills = events.filter((o) => o.type === 'CHAT_MESSAGE_ROSHAN_KILL')
    if (roshKills.length === 0) return null
    const first = roshKills[0]
    if (typeof first.time !== 'number') return null

    const killer = roshanKillerLabel(first.team)
    if (!killer) return null

    // Pair with the AEGIS / AEGIS_STOLEN event near the same time.
    const aegisEvent = events.find(
      (o) =>
        (o.type === 'CHAT_MESSAGE_AEGIS' || o.type === 'CHAT_MESSAGE_AEGIS_STOLEN') &&
        typeof o.time === 'number' &&
        Math.abs((o.time as number) - (first.time as number)) <= 10
    ) as ODObjective | undefined

    if (!aegisEvent) {
      return fire(
        `First Roshan at ${fmtMmSs(first.time)} — ${killer} took it.`,
        { time: fmtMmSs(first.time), killer_team: killer }
      )
    }

    // Recipient resolution. CHAT_MESSAGE_AEGIS.slot is team_slot 0-9; the
    // STOLEN event marks the OPPOSITE team grabbed it.
    let recipient: PlayerContext | null = null
    if (typeof aegisEvent.slot === 'number') {
      recipient = findPlayerByTeamSlot(ctx, aegisEvent.slot)
    }
    if (!recipient && typeof aegisEvent.player_slot === 'number') {
      recipient = findPlayerByPlayerSlot(ctx, aegisEvent.player_slot)
    }

    if (aegisEvent.type === 'CHAT_MESSAGE_AEGIS_STOLEN') {
      const stealer = killer === 'Radiant' ? 'Dire' : 'Radiant'
      return fire(
        `Roshan at ${fmtMmSs(first.time)} — ${killer} killed but ${stealer} snatched the Aegis.`,
        { time: fmtMmSs(first.time), killer_team: killer, aegis_team: stealer, stolen: 'true' }
      )
    }

    if (!recipient) {
      return fire(
        `First Roshan at ${fmtMmSs(first.time)} — ${killer} took it.`,
        { time: fmtMmSs(first.time), killer_team: killer }
      )
    }

    const recipName = resolveDisplayName(recipient.player.account_id ?? null, recipient.position)
    return fire(
      `First Roshan at ${fmtMmSs(first.time)} — ${killer} took it. Aegis on ${recipName} (${recipient.heroName}).`,
      {
        time: fmtMmSs(first.time),
        killer_team: killer,
        aegis_recipient_hero: recipient.heroName,
        aegis_recipient_position: recipient.position,
      }
    )
  },
}

/** 2. Roshan count — fires only when ≥ 2 Roshans happened. */
const roshanCount: Cat2Template = {
  id: 'roshan_count',
  priority: 5,
  produce: (ctx) => {
    const roshKills = (ctx.detail.objectives ?? []).filter(
      (o) => o.type === 'CHAT_MESSAGE_ROSHAN_KILL'
    )
    if (roshKills.length < 2) return null

    const byTeam: Record<string, number[]> = { Radiant: [], Dire: [] }
    for (const r of roshKills) {
      const team = roshanKillerLabel(r.team)
      if (team && typeof r.time === 'number') byTeam[team].push(r.time)
    }
    const radiantCount = byTeam.Radiant.length
    const direCount = byTeam.Dire.length
    const parts: string[] = []
    if (radiantCount > 0) {
      parts.push(`Radiant ${byTeam.Radiant.map(fmtMmSs).join(', ')}`)
    }
    if (direCount > 0) {
      parts.push(`Dire ${byTeam.Dire.map(fmtMmSs).join(', ')}`)
    }
    return {
      text: `${roshKills.length} Roshans this match — ${parts.join('; ')}.`,
      facts: {
        total: roshKills.length,
        radiant_count: radiantCount,
        dire_count: direCount,
      },
    }
  },
}

/** 3. Gold lead swing — peak, trough, final. */
const goldLeadSwing: Cat2Template = {
  id: 'gold_lead_swing',
  priority: 6,
  produce: (ctx) => {
    const adv = ctx.detail.radiant_gold_adv
    if (!Array.isArray(adv) || adv.length < 5) return null

    let peakIdx = 0
    let troughIdx = 0
    for (let i = 1; i < adv.length; i++) {
      if (adv[i] > adv[peakIdx]) peakIdx = i
      if (adv[i] < adv[troughIdx]) troughIdx = i
    }
    const peak = adv[peakIdx]
    const trough = adv[troughIdx]
    const final = adv[adv.length - 1]
    const fmtK = (g: number): string => {
      const sign = g >= 0 ? '+' : '-'
      const k = Math.abs(g) / 1000
      return `${sign}${k < 10 ? k.toFixed(1) : Math.round(k)}k`
    }

    // Detect dramatic swing: both peaks and troughs at meaningful magnitudes
    // AND on opposite sides of zero.
    const swung = peak > 5000 && trough < -5000

    if (swung) {
      const peakSide = 'Radiant'
      const troughSide = 'Dire'
      const finalSide = final >= 0 ? 'Radiant' : 'Dire'
      const peakFirst = peakIdx < troughIdx
      if (peakFirst) {
        return fire(
          `${peakSide} led ${fmtK(peak)} at ${peakIdx} minutes; ${troughSide} flipped it to ${fmtK(trough)} by ${troughIdx}, ${finalSide} ended ${fmtK(final)} ahead.`,
          {
            peak_min: peakIdx, peak_gold: peak,
            trough_min: troughIdx, trough_gold: trough,
            final_gold: final, final_side: finalSide,
            comeback: 'true',
          }
        )
      }
      return fire(
        `${troughSide} led ${fmtK(-trough)} at ${troughIdx} minutes; ${peakSide} flipped it to ${fmtK(peak)} by ${peakIdx}, ${finalSide} ended ${fmtK(final)} ahead.`,
        {
          peak_min: peakIdx, peak_gold: peak,
          trough_min: troughIdx, trough_gold: trough,
          final_gold: final, final_side: finalSide,
          comeback: 'true',
        }
      )
    }

    // One-sided dominance: peak high (or trough low) and same-sign at end.
    // Find the FIRST minute where the lead crossed 5k toward the
    // dominant side — that's when they "took control," not the peak
    // (which for monotonic growth lives at the end of the array).
    const advSeries: number[] = adv
    function firstCrossMin(threshold: number): number | null {
      for (let i = 0; i < advSeries.length; i++) {
        if (threshold > 0 ? advSeries[i] >= threshold : advSeries[i] <= threshold) return i
      }
      return null
    }

    if (Math.abs(peak) >= 8000 && Math.sign(peak) === Math.sign(final) && final !== 0) {
      const side = peak > 0 ? 'Radiant' : 'Dire'
      const tookControl = firstCrossMin(peak > 0 ? 5000 : -5000)
      const absVal = Math.abs(peak)
      const fromClause = tookControl != null && tookControl < adv.length - 3
        ? `${side} pulled ahead by minute ${tookControl}, peaking at ${fmtK(absVal)} and closing at ${fmtK(Math.abs(final))}.`
        : `${side} led at peak ${fmtK(absVal)} and closed ${fmtK(Math.abs(final))} ahead.`
      return fire(fromClause, { peak_min: peakIdx, peak_gold: peak, final_gold: final, side })
    }
    if (Math.abs(trough) >= 8000 && Math.sign(trough) === Math.sign(final) && final !== 0) {
      const side = 'Dire'
      const tookControl = firstCrossMin(-5000)
      const fromClause = tookControl != null && tookControl < adv.length - 3
        ? `${side} pulled ahead by minute ${tookControl}, peaking at ${fmtK(Math.abs(trough))} and closing at ${fmtK(Math.abs(final))}.`
        : `${side} led at peak ${fmtK(Math.abs(trough))} and closed ${fmtK(Math.abs(final))} ahead.`
      return fire(fromClause, { trough_min: troughIdx, trough_gold: trough, final_gold: final, side })
    }
    return null
  },
}

export const MIDGAME_TEMPLATES: Cat2Template[] = [
  firstRoshan,
  roshanCount,
  goldLeadSwing,
]
