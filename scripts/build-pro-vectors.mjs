// Pro Comparison playstyle vector — feature extraction core.
//
// This module:
//   1. exports `computeVector` (pure) and `fetchPlayerData` (I/O), used by
//      the production refresh script `refresh-pro-corpus.mjs` to build
//      `src/data/pro-vectors.json` for ~60 hand-curated active pros.
//   2. provides a `--sample` CLI mode for ad-hoc inspection of a small
//      hand-picked set of accounts without rewriting the corpus.
//
// Mirror module: the user's own vector is computed in-browser via
// `src/lib/proComparison.ts`, which reimplements `computeVector` against
// the same field names. If you change the vector shape here, change it
// there too — and bump the corpus rebuild because old vectors won't
// align dimension-wise.
//
// Hard rules (mirrored from CLAUDE.md):
//   - Free-tier rate limit is 60/min, 2000/day per IP. We throttle at
//     1200ms/call (50/min sustained) to stay under the rolling per-minute
//     window. The corpus build (60 pros × 16 calls = 960) fits in one
//     day's quota with margin.
//   - No API key. Generating a key on OpenDota requires entering payment
//     info, which we're explicitly avoiding for this project.
//   - Parsed-data assumption: pro tournament matches are returned parsed
//     by OpenDota. The script still bails per-match on missing gold_t /
//     lh_t arrays so partial coverage doesn't poison the vector.

import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = resolve(__dirname, '..', 'src', 'data')

// Free-tier only — no API key. OpenDota allows 60 calls/min, 2000 calls/day
// per IP. We pace at 1800ms/call (~33/min sustained) — 1200ms (50/min) was
// theoretically safe but in practice 429'd inside a 10+ minute corpus build,
// so we run conservatively under the rate ceiling and rely on the
// per-fetch retry loop below to absorb any transient bursts.
// 64 pros × 16 calls × 1.8s ≈ 30 min wall time.
export const RATE_LIMIT_MS = 1800

// On 429 (minute-rate-limit), we sleep this many ms and retry the same
// call. 65s clears OpenDota's per-minute window with a 5s safety margin.
const MINUTE_BACKOFF_MS = 65_000
const MAX_RETRY = 2

// ---- HERO_ROLES mirror (kept in sync with src/lib/heroRoles.ts) ----
// 'core' / 'support' / 'flex'. Used for the support/core split that drives
// the per-match position classifier and the spending-tempo target items.
const HERO_ROLES = {
  1: 'core', 2: 'core', 3: 'support', 4: 'core', 5: 'support', 6: 'core',
  7: 'flex', 8: 'core', 9: 'flex', 10: 'core', 11: 'core', 12: 'core',
  13: 'core', 14: 'flex', 15: 'core', 16: 'flex', 17: 'core', 18: 'core',
  19: 'flex', 20: 'support', 21: 'flex', 22: 'flex', 23: 'flex', 25: 'flex',
  26: 'support', 27: 'support', 28: 'core', 29: 'core', 30: 'support',
  31: 'support', 32: 'flex', 33: 'core', 34: 'core', 35: 'core', 36: 'flex',
  37: 'support', 38: 'core', 39: 'core', 40: 'flex', 41: 'core', 42: 'core',
  43: 'core', 44: 'core', 45: 'flex', 46: 'core', 47: 'core', 48: 'core',
  49: 'core', 50: 'support', 51: 'flex', 52: 'core', 53: 'flex', 54: 'core',
  55: 'core', 56: 'core', 57: 'flex', 58: 'support', 59: 'core', 60: 'core',
  61: 'core', 62: 'support', 63: 'core', 64: 'support', 65: 'flex',
  66: 'support', 67: 'core', 68: 'support', 69: 'core', 70: 'core',
  71: 'flex', 72: 'core', 73: 'core', 74: 'core', 75: 'support', 76: 'core',
  77: 'core', 78: 'flex', 79: 'support', 80: 'core', 81: 'core', 82: 'core',
  83: 'support', 84: 'support', 85: 'flex', 86: 'support', 87: 'support',
  88: 'support', 89: 'core', 90: 'support', 91: 'support', 92: 'flex',
  93: 'core', 94: 'core', 95: 'core', 96: 'core', 97: 'flex', 98: 'core',
  99: 'core', 100: 'flex', 101: 'support', 102: 'flex', 103: 'support',
  104: 'core', 105: 'support', 106: 'core', 107: 'flex', 108: 'core',
  109: 'core', 110: 'support', 111: 'support', 112: 'support', 113: 'core',
  114: 'core', 119: 'support', 120: 'flex', 121: 'support', 123: 'support',
  126: 'core', 128: 'support', 129: 'core', 135: 'core', 136: 'flex',
  137: 'core', 138: 'flex',
}

// ---- HERO_ARCHETYPES — single-archetype tag per hero, by HERO DESIGN ----
//
// 6 buckets: melee_carry / ranged_carry / caster_nuker / initiator /
// support / durable_core. Each hero gets ONE tag based on their core
// ability kit and base attack type — NOT on what position they get drafted
// to. Pudge is an initiator regardless of whether he's pos 5 in pubs;
// Hoodwink is a caster_nuker regardless of being a soft support; Spirit
// Breaker is an initiator even when last-pick pos 4. The archetype dim
// captures playstyle preference (which kind of hero you reach for), not
// position-played (already covered by the role distribution dim).
//
// Tagging principles:
//  - melee_carry:   melee right-clicker whose late-game is auto-attack damage
//                   (Anti-Mage, Sven, Spectre, Lifestealer)
//  - ranged_carry:  ranged right-clicker whose late-game is auto-attack
//                   damage (Drow, Sniper, Luna, Medusa)
//  - caster_nuker:  primary damage from spells / spammable mana abilities
//                   (Storm, Lina, Invoker, Visage, Hoodwink, Techies)
//  - initiator:     primary contribution is engage / lockdown / fight
//                   opening (Pudge, Spirit Breaker, Earth Spirit, Tusk,
//                   Magnus, Tide-Ravage, ES, BH-Track-engage)
//  - support:       primary contribution is heals / buffs / utility
//                   (CM, Lich, Dazzle, Omni-heals, Abaddon-shield,
//                   Undying-Decay)
//  - durable_core:  designed-tanky core whose identity is sustain + HP
//                   (Tidehunter, Bristleback, Timbersaw, DK, Doom)
//
// Coverage: every ID in HERO_ROLES has exactly one tag. Unknown IDs
// (newer heroes not yet added) fall through to 'caster_nuker' as the
// least-biased default — most newer heroes have caster shape.
const HERO_ARCHETYPES = {
  // melee_carry — melee auto-attack carries
  1: 'melee_carry',   // Anti-Mage
  4: 'melee_carry',   // Bloodseeker (melee)
  8: 'melee_carry',   // Juggernaut
  12: 'melee_carry',  // Phantom Lancer
  18: 'melee_carry',  // Sven
  32: 'melee_carry',  // Riki
  41: 'melee_carry',  // Faceless Void
  42: 'melee_carry',  // Wraith King
  44: 'melee_carry',  // Phantom Assassin
  54: 'melee_carry',  // Lifestealer
  67: 'melee_carry',  // Spectre
  70: 'melee_carry',  // Ursa
  73: 'melee_carry',  // Alchemist (melee, late-game right-clicker)
  77: 'melee_carry',  // Lycan (melee, push-carry)
  80: 'melee_carry',  // Lone Druid
  81: 'melee_carry',  // Chaos Knight
  82: 'melee_carry',  // Meepo
  89: 'melee_carry',  // Naga Siren
  93: 'melee_carry',  // Slark
  95: 'melee_carry',  // Troll Warlord
  104: 'melee_carry', // Legion Commander (Duel late-game carry)
  109: 'melee_carry', // Terrorblade (base form melee)
  114: 'melee_carry', // Monkey King

  // ranged_carry — ranged auto-attack carries
  6: 'ranged_carry',  // Drow Ranger
  10: 'ranged_carry', // Morphling
  15: 'ranged_carry', // Razor
  35: 'ranged_carry', // Sniper
  46: 'ranged_carry', // Templar Assassin (modern build = right-clicker)
  47: 'ranged_carry', // Viper
  48: 'ranged_carry', // Luna
  56: 'ranged_carry', // Clinkz
  59: 'ranged_carry', // Huskar (ranged spear-thrower)
  61: 'ranged_carry', // Broodmother
  63: 'ranged_carry', // Weaver
  72: 'ranged_carry', // Gyrocopter
  94: 'ranged_carry', // Medusa
  113: 'ranged_carry',// Arc Warden

  // caster_nuker — primary damage from spells
  9: 'caster_nuker',  // Mirana (Arrow + Starstorm + Leap caster shape)
  11: 'caster_nuker', // Shadow Fiend
  13: 'caster_nuker', // Puck
  17: 'caster_nuker', // Storm Spirit
  21: 'caster_nuker', // Windranger (Focus Fire + Shackleshot caster utility)
  22: 'caster_nuker', // Zeus
  25: 'caster_nuker', // Lina
  34: 'caster_nuker', // Tinker
  36: 'caster_nuker', // Necrophos (Death Pulse + Reaper's Scythe)
  39: 'caster_nuker', // Queen of Pain
  40: 'caster_nuker', // Venomancer (Poison Sting + Plague Wards damage profile)
  43: 'caster_nuker', // Death Prophet
  45: 'caster_nuker', // Pugna
  52: 'caster_nuker', // Leshrac
  53: 'caster_nuker', // Nature's Prophet (Sprout + Wrath = caster shape)
  74: 'caster_nuker', // Invoker
  76: 'caster_nuker', // Outworld Destroyer
  92: 'caster_nuker', // Visage (familiars + Soul Assumption magic damage)
  105: 'caster_nuker',// Techies (post-rework caster)
  106: 'caster_nuker',// Ember Spirit
  119: 'caster_nuker',// Dark Willow
  123: 'caster_nuker',// Hoodwink (Sharpshooter + Acorn Shot caster shape)
  126: 'caster_nuker',// Void Spirit
  138: 'caster_nuker',// Muerta

  // initiator — primary contribution is engage / lockdown
  2: 'initiator',   // Axe (Berserker's Call)
  7: 'initiator',   // Earthshaker (Echo Slam)
  14: 'initiator',  // Pudge (Hook is THE engage tool)
  16: 'initiator',  // Sand King (Burrowstrike + Epicenter)
  19: 'initiator',  // Tiny (Toss + Avalanche)
  20: 'initiator',  // Vengeful Spirit (Swap + Magic Missile lockdown)
  23: 'initiator',  // Kunkka (X Mark + Torrent + Ghostship)
  33: 'initiator',  // Enigma (Black Hole)
  38: 'initiator',  // Beastmaster (Primal Roar)
  51: 'initiator',  // Clockwerk (Hookshot + Cogs)
  55: 'initiator',  // Dark Seer (Vacuum + Ion Shell)
  62: 'initiator',  // Bounty Hunter (Track + Shadow Walk engage)
  65: 'initiator',  // Batrider (Lasso)
  71: 'initiator',  // Spirit Breaker (Charge of Darkness + Nether Strike)
  78: 'initiator',  // Brewmaster (Primal Split engage)
  88: 'initiator',  // Nyx Assassin (Vendetta + Impale)
  96: 'initiator',  // Centaur Warrunner (Stampede + Hoof Stomp)
  97: 'initiator',  // Magnus (Reverse Polarity)
  100: 'initiator', // Tusk (Snowball + Walrus Punch)
  103: 'initiator', // Elder Titan (Echo Stomp + Earth Splitter)
  107: 'initiator', // Earth Spirit (Boulder Smash + Geomagnetic Grip)
  120: 'initiator', // Pangolier (Roll + Shield Crash)
  128: 'initiator', // Snapfire (Cookie + Mortimer Kisses)
  129: 'initiator', // Mars (Spear + Arena)
  136: 'initiator', // Marci (Dispose + Rebound)
  137: 'initiator', // Primal Beast (Pulverize + Onslaught)

  // support — primary contribution is heals / buffs / utility
  3: 'support',   // Bane
  5: 'support',   // Crystal Maiden
  26: 'support',  // Lion
  27: 'support',  // Shadow Shaman
  30: 'support',  // Witch Doctor
  31: 'support',  // Lich
  37: 'support',  // Warlock
  50: 'support',  // Dazzle
  57: 'support',  // Omniknight (heals + Repel + Guardian Angel)
  58: 'support',  // Enchantress
  64: 'support',  // Jakiro
  66: 'support',  // Chen
  68: 'support',  // Ancient Apparition
  75: 'support',  // Silencer
  79: 'support',  // Shadow Demon
  83: 'support',  // Treant Protector
  84: 'support',  // Ogre Magi
  85: 'support',  // Undying (Decay + Soul Rip + Tombstone aura support)
  86: 'support',  // Rubick
  87: 'support',  // Disruptor
  90: 'support',  // Keeper of the Light
  91: 'support',  // Io
  101: 'support', // Skywrath Mage (designed support caster)
  102: 'support', // Abaddon (Mist Coil + Aphotic Shield + Borrowed Time)
  110: 'support', // Phoenix
  111: 'support', // Oracle
  112: 'support', // Winter Wyvern
  121: 'support', // Grimstroke

  // durable_core — designed-tanky cores whose identity is sustain + HP
  28: 'durable_core',  // Slardar
  29: 'durable_core',  // Tidehunter
  49: 'durable_core',  // Dragon Knight
  60: 'durable_core',  // Night Stalker
  69: 'durable_core',  // Doom
  98: 'durable_core',  // Timbersaw
  99: 'durable_core',  // Bristleback
  108: 'durable_core', // Underlord
  135: 'durable_core', // Dawnbreaker
}

export const ARCHETYPES = ['melee_carry', 'ranged_carry', 'caster_nuker', 'initiator', 'support', 'durable_core']

const SUPPORT_TARGET_ITEMS = ['force_staff', 'glimmer_cape', 'aghanims_shard', 'ultimate_scepter', 'aether_lens']
const CORE_TARGET_ITEMS = ['black_king_bar', 'ultimate_scepter', 'aghanims_shard']

// ----- HTTP -----

let lastCallAt = 0
export async function fetchJson(path, retryCount = 0) {
  const wait = Math.max(0, lastCallAt + RATE_LIMIT_MS - Date.now())
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastCallAt = Date.now()
  const url = new URL(`https://api.opendota.com/api/${path.replace(/^\//, '')}`)
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    // 429 with "minute" in the body → sleep through the rolling window
    // and retry from scratch. Daily-cap 429s (body contains "daily")
    // bubble up — those need human action, not auto-retry.
    if (res.status === 429 && /minute/i.test(body) && retryCount < MAX_RETRY) {
      console.log(`    [retry ${retryCount + 1}/${MAX_RETRY}] minute-rate-limit on ${path}, sleeping ${Math.round(MINUTE_BACKOFF_MS / 1000)}s...`)
      await new Promise((r) => setTimeout(r, MINUTE_BACKOFF_MS))
      return fetchJson(path, retryCount + 1)
    }
    throw new Error(`HTTP ${res.status} on ${path} :: ${body.slice(0, 120)}`)
  }
  return res.json()
}

// ----- per-match feature extraction -----

function classifyPos(detail, player) {
  const heroId = player.hero_id
  const heroRole = HERO_ROLES[heroId] ?? 'flex'
  const lane = player.lane_role
  const roaming = player.is_roaming === true
  const lhPerMin = (player.last_hits ?? 0) / Math.max(detail.duration / 60, 1)

  if (lane === 2) return 2 // mid → pos 2 (1-indexed: 1..5)
  if (lane === 4 || roaming) return 4 // jungle/roaming → pos 4
  // Safe lane (1) or off lane (3) — disambiguate by farm.
  // Pure heroes by role table win when lane is ambiguous.
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
  // No lane data — fall back on hero role + farm shape
  if (heroRole === 'support') return lhPerMin < 2 ? 5 : 4
  return lhPerMin >= 5 ? 1 : 3
}

function archetypeFor(heroId) {
  // Newer heroes not yet in the table fall through to caster_nuker —
  // most heroes shipped 2022+ have caster shape (Marci is the exception
  // and is already tagged). 'support' would be wrong because newer
  // heroes are core-leaning by design.
  return HERO_ARCHETYPES[heroId] ?? 'caster_nuker'
}

function firstMajorItemSec(player, heroRole) {
  const log = player.purchase_log ?? []
  const targets = heroRole === 'support' ? SUPPORT_TARGET_ITEMS : CORE_TARGET_ITEMS
  let earliest = Infinity
  for (const entry of log) {
    if (targets.includes(entry.key) && typeof entry.time === 'number' && entry.time < earliest) {
      earliest = entry.time
    }
  }
  return earliest === Infinity ? null : earliest
}

function killParticipation(detail, player) {
  // KP = (player kills + assists) / sum of team kills.
  // Captures fight involvement — separates rat-farmers (low KP) from
  // playmakers (high KP) within the same role.
  const isRadiant = (player.player_slot ?? 0) < 128
  let teamKills = 0
  for (const p of detail.players ?? []) {
    const pIsRadiant = (p.player_slot ?? 0) < 128
    if (pIsRadiant === isRadiant) teamKills += p.kills ?? 0
  }
  if (teamKills === 0) return 0
  return ((player.kills ?? 0) + (player.assists ?? 0)) / teamKills
}

// ----- vector aggregation -----

function median(arr) {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function pctWhere(arr, predicate) {
  if (arr.length === 0) return 0
  return arr.filter(predicate).length / arr.length
}

/**
 * Hybrid feature extraction.
 *
 * Cheap features (computed from the full /players/{id}/matches summary list
 * — 1 call total per pro): tempo, hero pool / archetype, deaths, KDA shape.
 * These survive on summary-only fields (hero_id, kills, deaths, assists,
 * duration).
 *
 * Detail features (computed from a sampled subset of /matches/{id} —
 * SAMPLE_DETAIL_COUNT calls per pro): per-position role distribution
 * (needs lane_role), farm shape (GPM, LH/min, lh_t[10], lane_eff_pct),
 * vision (obs_placed, sen_placed, observer_kills, sentry_kills), spending
 * tempo (purchase_log), kill participation (needs all teammates' kills).
 *
 * The split keeps the corpus build under the 2,000 calls/day free-tier
 * quota: ~16 calls/pro × 60 pros = ~960 calls.
 */
export function computeVector(profile, summaryMatches, details, accountId) {
  const summary = summaryMatches.filter((m) => typeof m.hero_id === 'number')
  if (summary.length === 0) {
    return { error: 'no matches', match_count: 0 }
  }

  // Detail records (subset of summary matches we have full detail for).
  const detailRecords = []
  for (const m of summary) {
    const detail = details[m.match_id]
    if (!detail) continue
    const player = (detail.players ?? []).find((p) => p.account_id === accountId)
    if (!player) continue
    if (!Array.isArray(player.gold_t) || player.gold_t.length === 0) continue
    detailRecords.push({ summary: m, detail, player })
  }

  // ---- CHEAP FEATURES (from summary list, N up to 50) ----

  // Hero archetype overlap (8 features)
  const heroCounts = {}
  const archCounts = Object.fromEntries(ARCHETYPES.map((a) => [a, 0]))
  for (const m of summary) {
    heroCounts[m.hero_id] = (heroCounts[m.hero_id] ?? 0) + 1
    archCounts[archetypeFor(m.hero_id)]++
  }
  const uniqueHeroes = Object.keys(heroCounts).length
  const sortedHeroCounts = Object.values(heroCounts).sort((a, b) => b - a)
  const top3Sum = (sortedHeroCounts[0] ?? 0) + (sortedHeroCounts[1] ?? 0) + (sortedHeroCounts[2] ?? 0)
  const archDist = ARCHETYPES.map((a) => archCounts[a] / summary.length)

  // Tempo (4 features)
  const durations = summary.map((m) => m.duration)
  const medianDur = median(durations)
  const pctUnder30 = pctWhere(durations, (d) => d < 30 * 60)
  const pctOver45 = pctWhere(durations, (d) => d > 45 * 60)
  let kdaSum = 0
  let durMinSum = 0
  for (const m of summary) {
    kdaSum += (m.kills ?? 0) + (m.deaths ?? 0) + (m.assists ?? 0)
    durMinSum += m.duration / 60
  }
  const kdaPerMin = durMinSum > 0 ? kdaSum / durMinSum : 0

  // Death pattern (3 features) — summary fields are sufficient
  let dSum = 0, kSum = 0, aSum = 0
  for (const m of summary) {
    dSum += m.deaths ?? 0
    kSum += m.kills ?? 0
    aSum += m.assists ?? 0
  }
  const deathsPerMatch = dSum / summary.length
  const deathsPerMin = durMinSum > 0 ? dSum / durMinSum : 0
  const kdaRatio = dSum > 0 ? (kSum + aSum) / dSum : kSum + aSum

  // ---- DETAIL-DEPENDENT FEATURES (require sampled /matches/{id}) ----

  let roleDist = [0, 0, 0, 0, 0]
  let lhPerMin = 0, gpmAvg = 0, lhAt10Avg = 0, laneEffAvg = 0
  let obsPerGame = 0, senPerGame = 0, dewardsPerGame = 0
  let coreSpikeMin = null, supportSpikeMin = null
  let coreSpikeN = 0, supportSpikeN = 0
  let killParticipationAvg = 0

  if (detailRecords.length > 0) {
    // Role distribution (5 features)
    const posCounts = [0, 0, 0, 0, 0]
    for (const r of detailRecords) {
      const pos = classifyPos(r.detail, r.player)
      if (pos >= 1 && pos <= 5) posCounts[pos - 1]++
    }
    const totalPos = posCounts.reduce((a, b) => a + b, 0)
    roleDist = posCounts.map((c) => (totalPos > 0 ? c / totalPos : 0))

    // Farm (4 features) — averages within the detail subset
    let lhSum = 0, gpmSum = 0, lhAt10Sum = 0, lhAt10N = 0
    let laneEffSum = 0, laneEffN = 0, detailDurMin = 0
    for (const r of detailRecords) {
      lhSum += r.player.last_hits ?? 0
      detailDurMin += r.detail.duration / 60
      gpmSum += r.player.gold_per_min ?? 0
      if (Array.isArray(r.player.lh_t) && r.player.lh_t.length > 10) {
        lhAt10Sum += r.player.lh_t[10]
        lhAt10N++
      }
      if (typeof r.player.lane_efficiency_pct === 'number') {
        laneEffSum += r.player.lane_efficiency_pct
        laneEffN++
      }
    }
    lhPerMin = detailDurMin > 0 ? lhSum / detailDurMin : 0
    gpmAvg = gpmSum / detailRecords.length
    lhAt10Avg = lhAt10N > 0 ? lhAt10Sum / lhAt10N : 0
    laneEffAvg = laneEffN > 0 ? laneEffSum / laneEffN : 0

    // Vision (3 features)
    let obsSum = 0, senSum = 0, dewardSum = 0
    for (const r of detailRecords) {
      obsSum += r.player.obs_placed ?? r.player.observers_placed ?? 0
      senSum += r.player.sen_placed ?? 0
      dewardSum += (r.player.observer_kills ?? 0) + (r.player.sentry_kills ?? 0)
    }
    obsPerGame = obsSum / detailRecords.length
    senPerGame = senSum / detailRecords.length
    dewardsPerGame = dewardSum / detailRecords.length

    // Spending tempo — split by per-match role.
    // core_spike_min uses CORE_TARGET_ITEMS (BKB/Aghs/Shard) on core games.
    // support_spike_min uses SUPPORT_TARGET_ITEMS (Force/Glimmer/Shard/Aghs/
    // Aether) on support games. Reported separately so similarity can null-
    // skip the bucket the user/pro doesn't fill.
    const coreSpikes = []
    const supportSpikes = []
    for (const r of detailRecords) {
      const heroRole = HERO_ROLES[r.player.hero_id] ?? 'flex'
      const firstSec = firstMajorItemSec(r.player, heroRole)
      if (firstSec == null) continue
      // Use heroRole as the bucket; flex heroes go into the bucket matching
      // the items they actually bought (cores → core, supports → support).
      if (heroRole === 'support') supportSpikes.push(firstSec)
      else coreSpikes.push(firstSec)
    }
    coreSpikeN = coreSpikes.length
    supportSpikeN = supportSpikes.length
    coreSpikeMin = coreSpikes.length >= 3 ? median(coreSpikes) / 60 : null
    supportSpikeMin = supportSpikes.length >= 3 ? median(supportSpikes) / 60 : null

    // Kill participation (1 feature) — replaces TP/min from the previous draft
    let kpSum = 0
    for (const r of detailRecords) {
      kpSum += killParticipation(r.detail, r.player)
    }
    killParticipationAvg = kpSum / detailRecords.length
  }

  return {
    match_count: summary.length,
    detail_count: detailRecords.length,
    profile: {
      account_id: accountId,
      personaname: profile?.profile?.personaname ?? null,
      rank_tier: profile?.rank_tier ?? null,
      leaderboard_rank: profile?.leaderboard_rank ?? null,
    },
    raw: {
      role_dist: { pos1: round(roleDist[0]), pos2: round(roleDist[1]), pos3: round(roleDist[2]), pos4: round(roleDist[3]), pos5: round(roleDist[4]) },
      hero_archetype: {
        unique_hero_ratio: round(uniqueHeroes / summary.length),
        top3_concentration: round(top3Sum / summary.length),
        ...Object.fromEntries(ARCHETYPES.map((a, i) => [a, round(archDist[i])])),
      },
      tempo: {
        median_duration_min: round(medianDur / 60, 1),
        pct_under_30min: round(pctUnder30),
        pct_over_45min: round(pctOver45),
        kda_per_min: round(kdaPerMin, 2),
      },
      farm: {
        lh_per_min: round(lhPerMin, 1),
        gpm: Math.round(gpmAvg),
        lh_at_10: Math.round(lhAt10Avg),
        lane_efficiency_pct: Math.round(laneEffAvg),
      },
      vision: {
        obs_per_game: round(obsPerGame, 1),
        sen_per_game: round(senPerGame, 1),
        dewards_per_game: round(dewardsPerGame, 1),
      },
      death: {
        deaths_per_match: round(deathsPerMatch, 1),
        deaths_per_min: round(deathsPerMin, 3),
        kda_ratio: round(kdaRatio, 2),
      },
      spending: {
        core_spike_min: coreSpikeMin != null ? round(coreSpikeMin, 1) : null,
        core_spike_n: coreSpikeN,
        support_spike_min: supportSpikeMin != null ? round(supportSpikeMin, 1) : null,
        support_spike_n: supportSpikeN,
      },
      involvement: {
        kill_participation: round(killParticipationAvg, 2),
      },
    },
  }
}

function round(n, places = 3) {
  if (n == null) return n
  const m = Math.pow(10, places)
  return Math.round(n * m) / m
}

// ----- orchestration -----

// Number of /matches/{id} detail calls per pro. With 60 pros × 16 calls
// (1 list + 15 details) = 960 calls, fits under the 2,000/day free-tier
// quota. Sampled as the most recent N matches from the 50-match window
// so the same input produces the same vector across runs.
export const SAMPLE_DETAIL_COUNT = 15

export async function fetchPlayerData(label, accountId, matchLimit = 50) {
  console.log(`\n=== ${label} (${accountId}) ===`)
  console.log('  fetching match list...')
  const matches = await fetchJson(`players/${accountId}/matches?limit=${matchLimit}`)
  // The summary list provides a profile-name-free path, so we skip the
  // dedicated /players/{id} call. Personaname lookup happens off the
  // proPlayers roster at corpus build time.
  const profile = null
  const sampledIds = matches.slice(0, SAMPLE_DETAIL_COUNT).map((m) => m.match_id)
  console.log(`  pulling ${sampledIds.length}/${matches.length} sampled details (rate-limited)...`)
  const details = {}
  for (let i = 0; i < sampledIds.length; i++) {
    const id = sampledIds[i]
    try {
      const d = await fetchJson(`matches/${id}`)
      details[id] = d
    } catch (e) {
      console.warn(`    skipped ${id}: ${e.message}`)
    }
    if ((i + 1) % 5 === 0) console.log(`    ${i + 1}/${sampledIds.length}`)
  }
  return { profile, matches, details }
}

const SAMPLE_PLAYERS = [
  // magsasaka — test pub account, support-leaning Herald (per CLAUDE.md)
  { label: 'magsasaka', accountId: 253678333, region: 'pub', position: 'flex' },
  // pos 1, SEA (Talon)
  { label: '23savage', accountId: 375507918, region: 'SEA', position: 'pos1' },
  // pos 2 mid, EU/CIS (Team Spirit)
  { label: 'Larl', accountId: 106305042, region: 'EU/CIS', position: 'pos2' },
  // pos 4 support, EU/CIS (Team Yandex)
  { label: 'Saksa', accountId: 103735745, region: 'EU/CIS', position: 'pos4' },
  // pos 5 hard support, SEA-origin (Tundra Esports)
  { label: 'Whitemon', accountId: 136829091, region: 'SEA', position: 'pos5' },
]

async function sampleRun() {
  const callsPerPlayer = 1 + SAMPLE_DETAIL_COUNT
  console.log(`Rate limit: ${RATE_LIMIT_MS}ms/call (free tier, no key)`)
  console.log(`Sampling ${SAMPLE_PLAYERS.length} players × ${callsPerPlayer} calls = ~${SAMPLE_PLAYERS.length * callsPerPlayer} calls`)
  console.log(`Estimated wall time: ~${Math.ceil((SAMPLE_PLAYERS.length * callsPerPlayer * RATE_LIMIT_MS) / 1000)}s`)

  const vectors = []
  for (const p of SAMPLE_PLAYERS) {
    try {
      const data = await fetchPlayerData(p.label, p.accountId)
      const v = computeVector(data.profile, data.matches, data.details, p.accountId)
      v.label = p.label
      v.expectedRole = p.expectedRole
      vectors.push(v)
      console.log(`  ✓ vector built (${v.match_count} matches)`)
    } catch (e) {
      console.error(`  ✗ ${p.label}: ${e.message}`)
    }
  }

  // Persist for inspection
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
  const outPath = resolve(DATA_DIR, 'pro-vectors-sample.json')
  writeFileSync(outPath, JSON.stringify(vectors, null, 2) + '\n')
  console.log(`\nWrote ${outPath}`)

  printComparison(vectors)
}

function printComparison(vectors) {
  console.log('\n' + '='.repeat(80))
  console.log('PHASE 1 SANITY CHECK — per-feature values, side-by-side')
  console.log('='.repeat(80))

  const labels = vectors.map((v) => v.label.split(' ')[0]) // short
  const headerCol = (s) => s.padStart(11).slice(0, 11)
  const labelCol = (s) => s.padEnd(28).slice(0, 28)

  function row(label, values) {
    console.log(labelCol(label) + values.map((v) => headerCol(String(v))).join(' '))
  }

  const sections = [
    ['ROLE DISTRIBUTION', [
      ['  pos1 share', (v) => v.raw.role_dist.pos1],
      ['  pos2 share', (v) => v.raw.role_dist.pos2],
      ['  pos3 share', (v) => v.raw.role_dist.pos3],
      ['  pos4 share', (v) => v.raw.role_dist.pos4],
      ['  pos5 share', (v) => v.raw.role_dist.pos5],
    ]],
    ['HERO ARCHETYPE', [
      ['  unique/match', (v) => v.raw.hero_archetype.unique_hero_ratio],
      ['  top3 concentration', (v) => v.raw.hero_archetype.top3_concentration],
      ['  melee_carry%', (v) => v.raw.hero_archetype.melee_carry],
      ['  ranged_carry%', (v) => v.raw.hero_archetype.ranged_carry],
      ['  caster_nuker%', (v) => v.raw.hero_archetype.caster_nuker],
      ['  initiator%', (v) => v.raw.hero_archetype.initiator],
      ['  support%', (v) => v.raw.hero_archetype.support],
      ['  durable_core%', (v) => v.raw.hero_archetype.durable_core],
    ]],
    ['TEMPO', [
      ['  median dur (min)', (v) => v.raw.tempo.median_duration_min],
      ['  % under 30min', (v) => v.raw.tempo.pct_under_30min],
      ['  % over 45min', (v) => v.raw.tempo.pct_over_45min],
      ['  KDA/min', (v) => v.raw.tempo.kda_per_min],
    ]],
    ['FARM', [
      ['  LH/min', (v) => v.raw.farm.lh_per_min],
      ['  GPM', (v) => v.raw.farm.gpm],
      ['  LH @10', (v) => v.raw.farm.lh_at_10],
      ['  lane eff %', (v) => v.raw.farm.lane_efficiency_pct],
    ]],
    ['VISION', [
      ['  obs/game', (v) => v.raw.vision.obs_per_game],
      ['  sen/game', (v) => v.raw.vision.sen_per_game],
      ['  dewards/game', (v) => v.raw.vision.dewards_per_game],
    ]],
    ['DEATH', [
      ['  deaths/match', (v) => v.raw.death.deaths_per_match],
      ['  deaths/min', (v) => v.raw.death.deaths_per_min],
      ['  KDA ratio', (v) => v.raw.death.kda_ratio],
    ]],
    ['SPENDING (role-conditional)', [
      ['  core spike (min)', (v) => v.raw.spending.core_spike_min ?? '—'],
      ['  core spike N', (v) => v.raw.spending.core_spike_n],
      ['  support spike (min)', (v) => v.raw.spending.support_spike_min ?? '—'],
      ['  support spike N', (v) => v.raw.spending.support_spike_n],
    ]],
    ['INVOLVEMENT', [
      ['  kill participation', (v) => v.raw.involvement.kill_participation],
    ]],
  ]

  console.log()
  console.log(labelCol('') + labels.map(headerCol).join(' '))
  console.log(labelCol('summary matches') + vectors.map((v) => headerCol(String(v.match_count))).join(' '))
  console.log(labelCol('detail matches') + vectors.map((v) => headerCol(String(v.detail_count))).join(' '))
  for (const [section, rows] of sections) {
    console.log('\n' + section)
    for (const [name, fn] of rows) {
      row(name, vectors.map(fn))
    }
  }

  // Pairwise variance check: do the pros differ on the high-variance axes?
  console.log('\n' + '='.repeat(80))
  console.log('PAIRWISE DIFFERENTIATION — pro-only (excluding magsasaka)')
  console.log('='.repeat(80))
  const proVecs = vectors.filter((v) => v.label !== 'magsasaka')
  const featurePicks = [
    ['pos1 share', (v) => v.raw.role_dist.pos1],
    ['pos5 share', (v) => v.raw.role_dist.pos5],
    ['LH/min', (v) => v.raw.farm.lh_per_min],
    ['GPM', (v) => v.raw.farm.gpm],
    ['sen/game', (v) => v.raw.vision.sen_per_game],
    ['obs/game', (v) => v.raw.vision.obs_per_game],
    ['deaths/match', (v) => v.raw.death.deaths_per_match],
    ['kill participation', (v) => v.raw.involvement.kill_participation],
    ['top3 concentration', (v) => v.raw.hero_archetype.top3_concentration],
    ['median dur', (v) => v.raw.tempo.median_duration_min],
  ]
  for (const [name, fn] of featurePicks) {
    const vals = proVecs.map(fn).filter((v) => typeof v === 'number')
    if (vals.length === 0) continue
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const range = max - min
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length
    const cv = mean !== 0 ? range / Math.abs(mean) : 0
    console.log(`  ${name.padEnd(22)} min=${String(min).padStart(7)}  max=${String(max).padStart(7)}  range=${String(round(range, 2)).padStart(7)}  range/mean=${round(cv, 2)}`)
  }
}

// Only dispatch the CLI when invoked directly (not when imported by
// scripts/refresh-pro-corpus.mjs). pathToFileURL() and import.meta.url
// both normalize to file:/// URLs so direct comparison works.
const isDirectRun = import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
  const mode = process.argv[2] ?? '--sample'
  if (mode === '--sample') {
    sampleRun().catch((e) => {
      console.error('FATAL:', e)
      process.exit(1)
    })
  } else {
    console.log('Usage: node scripts/build-pro-vectors.mjs [--sample]')
    console.log('  --sample (default): run on hand-picked sanity-check set')
    console.log('For full corpus build, run: node scripts/refresh-pro-corpus.mjs')
  }
}
