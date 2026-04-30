// Cat 2 — Draft sub-section.
//
// Three templates:
//   1. draft_archetype     — fires on heavily-skewed archetype distribution
//   2. draft_last_pick     — names each team's last-pick + draft shape
//   3. ban_priority        — heroes targeted in phase-1 bans, with
//                            cross-reference to current bracket meta
//
// SKIPPED for Phase 6 (TODO v1.1): draft_counter_pattern. Detecting
// counter-pick relationships would require a hero counter graph beyond
// what HERO_TRAITS currently models. The current trait set was built
// for the situational-items analysis, not draft theory.

import { archetypeFor, type HeroArchetype } from '../../heroArchetypes'
import { heroTraits } from '../../heroTraits'
import type { ODPicksBan } from '../../../types'
import { fire, type Cat2Template } from './types'

function picksByTeam(pb: ODPicksBan[], team: 0 | 1): ODPicksBan[] {
  return pb.filter((p) => p.is_pick && p.team === team).sort((a, b) => a.order - b.order)
}

function bansByTeam(pb: ODPicksBan[], team: 0 | 1): ODPicksBan[] {
  return pb.filter((p) => !p.is_pick && p.team === team).sort((a, b) => a.order - b.order)
}

function teamLabel(team: 0 | 1): string {
  return team === 0 ? 'Radiant' : 'Dire'
}

function listHeroes(picks: ODPicksBan[], heroName: (id: number) => string): string {
  return picks.map((p) => heroName(p.hero_id)).join(', ')
}

/** 1. Archetype skew — fire when one team has a clear stack pattern. */
const draftArchetype: Cat2Template = {
  id: 'draft_archetype',
  priority: 6,
  produce: (ctx) => {
    const pb = ctx.detail.picks_bans
    if (!Array.isArray(pb) || pb.length === 0) return null

    const findings: { team: 0 | 1; arch: HeroArchetype; picks: ODPicksBan[] }[] = []
    for (const team of [0, 1] as const) {
      const picks = picksByTeam(pb, team)
      if (picks.length < 5) continue
      const counts: Record<HeroArchetype, ODPicksBan[]> = {
        melee_carry: [], ranged_carry: [], caster_nuker: [],
        initiator: [], support: [], durable_core: [],
      }
      for (const p of picks) counts[archetypeFor(p.hero_id)].push(p)

      // Physical-damage stack: 3+ between melee_carry + ranged_carry
      const physical = [...counts.melee_carry, ...counts.ranged_carry]
      if (physical.length >= 3) {
        findings.push({ team, arch: 'ranged_carry', picks: physical })
        continue
      }
      // Magic-burst stack: 3+ caster_nuker
      if (counts.caster_nuker.length >= 3) {
        findings.push({ team, arch: 'caster_nuker', picks: counts.caster_nuker })
        continue
      }
      // Heavy initiation: 3+ initiators
      if (counts.initiator.length >= 3) {
        findings.push({ team, arch: 'initiator', picks: counts.initiator })
        continue
      }
    }
    if (findings.length === 0) return null

    // Pick the most-skewed team (most heroes in a single bucket); break ties by team 0 first
    findings.sort((a, b) => b.picks.length - a.picks.length)
    const top = findings[0]
    const archLabel: Record<HeroArchetype, string> = {
      melee_carry: 'physical-damage stack',
      ranged_carry: 'physical-damage stack',
      caster_nuker: 'magic-burst lineup',
      initiator: 'heavy-initiation draft',
      support: 'support-stacked',
      durable_core: 'durable-core lineup',
    }

    return {
      text: `${teamLabel(top.team)} drafted a ${archLabel[top.arch]}: ${listHeroes(top.picks, ctx.heroName)}.`,
      facts: {
        team: teamLabel(top.team),
        archetype: top.arch,
        archetype_label: archLabel[top.arch],
        hero_count: top.picks.length,
      },
    }
  },
}

/** 2. Last-pick framing — what each team closed the draft with. */
const draftLastPick: Cat2Template = {
  id: 'draft_last_pick',
  priority: 5,
  produce: (ctx) => {
    const pb = ctx.detail.picks_bans
    if (!Array.isArray(pb) || pb.length === 0) return null
    const t0 = picksByTeam(pb, 0)
    const t1 = picksByTeam(pb, 1)
    if (t0.length === 0 || t1.length === 0) return null
    const last0 = t0[t0.length - 1]
    const last1 = t1[t1.length - 1]

    const archLabel = (heroId: number): string => {
      const a = archetypeFor(heroId)
      switch (a) {
        case 'melee_carry':
        case 'ranged_carry':
          return 'a 4-protect-1 close'
        case 'caster_nuker':
          return 'a playmaker close'
        case 'initiator':
          return 'an initiator-flex close'
        case 'support':
          return 'a utility close'
        case 'durable_core':
          return 'a durable-core close'
      }
    }

    const radiantLabel = archLabel(last0.hero_id)
    const direLabel = archLabel(last1.hero_id)

    // Only fire when the close framing differs OR is itself a notable
    // shape — both teams closing with a generic 4-protect-1 carry isn't
    // narrative.
    //
    // TODO (v1.1 calibration): expand the redundancy gate to suppress
    // ANY same-label close when neither label is dramatic. The Phase 6
    // dump on PGL Wallachia 2026 BetBoom vs Aurora produced "Radiant
    // closed... a playmaker close. Dire closed... a playmaker close."
    // Same-label produces low-information lines for "playmaker close"
    // and "an initiator-flex close" too — only the asymmetric pairings
    // earn the slot. Currently only generic 4-protect-1 is filtered.
    if (radiantLabel === direLabel && radiantLabel === 'a 4-protect-1 close') {
      return null
    }

    return {
      text: `Radiant closed the draft with ${ctx.heroName(last0.hero_id)} — ${radiantLabel}. Dire closed with ${ctx.heroName(last1.hero_id)} — ${direLabel}.`,
      facts: {
        radiant_last: ctx.heroName(last0.hero_id),
        radiant_close: radiantLabel,
        dire_last: ctx.heroName(last1.hero_id),
        dire_close: direLabel,
      },
    }
  },
}

/** 3. Phase-1 ban priority — identify heavily-targeted heroes.
 *
 *  Captain's Mode phase-1 bans are typically orders 0-7 (4 bans per team
 *  alternating), but order numbering is sequential across the whole
 *  draft. We treat the first 8 orders as phase 1 since that's the first
 *  ban round in the standard captains' mode flow. */
const banPriority: Cat2Template = {
  id: 'ban_priority',
  priority: 4,
  produce: (ctx) => {
    const pb = ctx.detail.picks_bans
    if (!Array.isArray(pb) || pb.length === 0) return null
    const phase1Bans = pb.filter((p) => !p.is_pick && p.order < 8)
    if (phase1Bans.length === 0) return null

    // Look for traits — initiator-heavy phase-1 bans means both teams
    // were targeting the same threat archetype.
    const traitCounts: Record<string, ODPicksBan[]> = {}
    for (const b of phase1Bans) {
      const t = heroTraits(b.hero_id)
      for (const trait of t) {
        if (!traitCounts[trait]) traitCounts[trait] = []
        traitCounts[trait].push(b)
      }
    }

    // Find the dominant trait among phase-1 bans (≥ 3 of same trait)
    const dominantEntry = Object.entries(traitCounts).find(([, bans]) => bans.length >= 3)
    if (dominantEntry) {
      const [trait, bans] = dominantEntry
      const traitLabel: Record<string, string> = {
        stunlock: 'lockdown threats',
        magic_burst: 'magic-burst threats',
        physical_carry: 'physical carries',
        evasion_or_blur: 'evasion / blur heroes',
        silence: 'silence threats',
        dispellable_buffs: 'dispellable-buff carries',
        blink_initiation: 'blink initiators',
      }
      const label = traitLabel[trait] ?? trait
      return fire(
        `Phase-1 bans hammered ${label}: ${listHeroes(bans, ctx.heroName)}.`,
        { trait, ban_count: bans.length, banned_heroes: listHeroes(bans, ctx.heroName) }
      )
    }

    // Fallback: per-team phase-1 ban listing.
    const radiantBans = bansByTeam(phase1Bans, 0)
    const direBans = bansByTeam(phase1Bans, 1)
    if (radiantBans.length === 0 || direBans.length === 0) return null

    return fire(
      `Phase-1 bans: Radiant took ${listHeroes(radiantBans.slice(0, 3), ctx.heroName)}; Dire took ${listHeroes(direBans.slice(0, 3), ctx.heroName)}.`,
      {
        radiant_phase1_bans: listHeroes(radiantBans, ctx.heroName),
        dire_phase1_bans: listHeroes(direBans, ctx.heroName),
      }
    )
  },
}

export const DRAFT_TEMPLATES: Cat2Template[] = [
  draftArchetype,
  draftLastPick,
  banPriority,
]
