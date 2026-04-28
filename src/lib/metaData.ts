// Meta-stats reader. Live data is fetched weekly by `scripts/refresh-meta.mjs`
// (cron via `.github/workflows/refresh-meta.yml`) and committed into
// `src/data/meta-current.json` + `src/data/meta-previous.json`. Vite bundles
// the JSON statically, so the running site has zero network dependency on
// the meta page — everything is in-bundle.
//
// Position info (HERO_POSITIONS) is hand-maintained alongside HERO_ROLES
// because OpenDota's response doesn't carry position. Patch cadence here
// is ~1-2 hero adds per year.

import { classifyHeroById, type HeroRole } from './heroRoles'
import metaCurrent from '../data/meta-current.json'
import metaPrevious from '../data/meta-previous.json'

// ---------------------------------------------------------------------------
// Snapshot schema (must match scripts/refresh-meta.mjs output)
// ---------------------------------------------------------------------------
interface RawSnapshot {
  fetched_at: string
  source: string
  hero_count: number
  /** True when OpenDota's /heroStats returned no Immortal-bracket data
   *  and the refresh script aliased bracket 8 to bracket 7. UI uses
   *  this to footnote the Divine / Immortal views. */
  bracket8_aliased?: boolean
  heroes: RawSnapshotHero[]
}

interface RawSnapshotHero {
  id: number
  name: string
  wr: Record<string, number>
  pick: Record<string, number>
}

const CURRENT = metaCurrent as RawSnapshot
const PREVIOUS = metaPrevious as RawSnapshot

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------
export type MetaBracket = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
export type Position = 1 | 2 | 3 | 4 | 5
export type Tier = 'S' | 'A' | 'B' | 'C'

export const META_REFRESHED: string = (() => {
  // Display the date portion of the ISO timestamp, e.g. "2026-04-28".
  const ts = CURRENT.fetched_at ?? ''
  return ts ? ts.slice(0, 10) : 'unknown'
})()

// We don't carry an explicit patch tag in /heroStats — derive a "weekly
// snapshot" label instead. Bumping a real patch number requires manual
// curation, which the user explicitly wanted to avoid.
export const META_PATCH = 'live snapshot'

/** True when OpenDota's free /heroStats returned no separate Immortal
 *  data and we aliased bracket 8 to bracket 7. The Meta page surfaces a
 *  footnote when this is set and the user is viewing Divine / Immortal. */
export const META_BRACKET8_ALIASED: boolean = CURRENT.bracket8_aliased === true

export interface MetaHeroEntry {
  id: number
  name: string
  /** Win rate per bracket (0..1), this snapshot. */
  wr: Record<MetaBracket, number>
  /** Pick rate per bracket (0..1) — share of games featuring this hero. */
  pick: Record<MetaBracket, number>
  /** Win rate per bracket (0..1), previous-week snapshot. Equals current
   *  WR when no previous data exists (first run). */
  wrPrev: Record<MetaBracket, number>
  /** Hand-curated position(s) — see HERO_POSITIONS below. */
  positions: Position[]
}

export const BRACKETS: { id: MetaBracket; label: string }[] = [
  { id: 1, label: 'Herald' },
  { id: 2, label: 'Guardian' },
  { id: 3, label: 'Crusader' },
  { id: 4, label: 'Archon' },
  { id: 5, label: 'Legend' },
  { id: 6, label: 'Ancient' },
  { id: 7, label: 'Divine' },
  { id: 8, label: 'Immortal' },
]

// ---------------------------------------------------------------------------
// Position table — see HERO_POSITIONS doc-comment for cadence/notes.
// ---------------------------------------------------------------------------
const HERO_POSITIONS: Record<number, Position[]> = {
  1: [1],            // Anti-Mage
  2: [3],            // Axe — offlane
  3: [5],            // Bane
  4: [1, 2],         // Bloodseeker
  5: [5],            // Crystal Maiden
  6: [1],            // Drow Ranger
  7: [3, 4],         // Earthshaker
  8: [1],            // Juggernaut
  9: [1, 4],         // Mirana
  10: [1, 2],        // Morphling
  11: [2],           // Shadow Fiend
  12: [1],           // Phantom Lancer
  13: [2],           // Puck
  14: [3, 4, 5],     // Pudge
  15: [1, 3],        // Razor
  16: [3, 4],        // Sand King
  17: [2],           // Storm Spirit
  18: [1],           // Sven
  19: [2, 4],        // Tiny
  20: [4, 5],        // Vengeful Spirit
  21: [2, 4, 3],     // Windranger
  22: [2, 5],        // Zeus
  23: [2, 3],        // Kunkka
  25: [2, 4],        // Lina
  26: [5],           // Lion
  27: [4, 5],        // Shadow Shaman
  28: [3],           // Slardar
  29: [3],           // Tidehunter
  30: [5],           // Witch Doctor
  31: [5],           // Lich
  32: [1, 4],        // Riki
  33: [3, 4],        // Enigma
  34: [2],           // Tinker
  35: [1, 2],        // Sniper
  36: [2, 5],        // Necrophos
  37: [4, 5],        // Warlock
  38: [3],           // Beastmaster
  39: [2],           // Queen of Pain
  40: [3, 4],        // Venomancer
  41: [1],           // Faceless Void
  42: [1],           // Wraith King
  43: [2, 3],        // Death Prophet
  44: [1],           // Phantom Assassin
  45: [2, 5],        // Pugna
  46: [2],           // Templar Assassin
  47: [2, 3],        // Viper
  48: [1],           // Luna
  49: [2, 3],        // Dragon Knight
  50: [5],           // Dazzle
  51: [3, 4],        // Clockwerk
  52: [2, 3],        // Leshrac
  53: [3, 4],        // Nature's Prophet
  54: [1],           // Lifestealer
  55: [3],           // Dark Seer
  56: [1],           // Clinkz
  57: [3, 5],        // Omniknight
  58: [5],           // Enchantress
  59: [1, 2],        // Huskar
  60: [3],           // Night Stalker
  61: [1, 3],        // Broodmother
  62: [4],           // Bounty Hunter
  63: [1, 2, 4],     // Weaver
  64: [5],           // Jakiro
  65: [3, 4],        // Batrider
  66: [5],           // Chen
  67: [1],           // Spectre
  68: [5],           // Ancient Apparition
  69: [3],           // Doom
  70: [1],           // Ursa
  71: [4],           // Spirit Breaker
  72: [1],           // Gyrocopter
  73: [1, 2],        // Alchemist
  74: [2],           // Invoker
  75: [4, 5],        // Silencer
  76: [2],           // Outworld Destroyer
  77: [1, 3],        // Lycan
  78: [3, 4],        // Brewmaster
  79: [4, 5],        // Shadow Demon
  80: [1],           // Lone Druid
  81: [1],           // Chaos Knight
  82: [2],           // Meepo
  83: [5],           // Treant Protector
  84: [4, 5],        // Ogre Magi
  85: [3, 5],        // Undying
  86: [4, 5],        // Rubick
  87: [4, 5],        // Disruptor
  88: [4],           // Nyx Assassin
  89: [1],           // Naga Siren
  90: [4, 5],        // Keeper of the Light
  91: [5],           // Io
  92: [2, 3],        // Visage
  93: [1],           // Slark
  94: [1],           // Medusa
  95: [1],           // Troll Warlord
  96: [3],           // Centaur Warrunner
  97: [3, 4],        // Magnus
  98: [3],           // Timbersaw
  99: [3],           // Bristleback
  100: [4],          // Tusk
  101: [4, 5],       // Skywrath Mage
  102: [3, 5],       // Abaddon
  103: [4, 5],       // Elder Titan
  104: [3],          // Legion Commander
  105: [4, 5],       // Techies
  106: [2],          // Ember Spirit
  107: [4],          // Earth Spirit
  108: [3],          // Underlord
  109: [1],          // Terrorblade
  110: [4, 5],       // Phoenix
  111: [5],          // Oracle
  112: [4, 5],       // Winter Wyvern
  113: [2],          // Arc Warden
  114: [1, 3],       // Monkey King
  119: [4, 5],       // Dark Willow
  120: [3, 4],       // Pangolier
  121: [4, 5],       // Grimstroke
  123: [4],          // Hoodwink
  126: [2],          // Void Spirit
  128: [4, 5],       // Snapfire
  129: [3],          // Mars
  135: [3],          // Dawnbreaker
  136: [4],          // Marci
  137: [3],          // Primal Beast
  138: [2, 5],       // Muerta
}

export const POSITION_LABELS: Record<Position, string> = {
  1: 'Pos 1 (Safe lane)',
  2: 'Pos 2 (Mid)',
  3: 'Pos 3 (Offlane)',
  4: 'Pos 4 (Support)',
  5: 'Pos 5 (Hard support)',
}

export const POSITION_LABELS_SHORT: Record<Position, string> = {
  1: 'Pos 1',
  2: 'Pos 2',
  3: 'Pos 3',
  4: 'Pos 4',
  5: 'Pos 5',
}

export function positionsForHero(id: number): Position[] {
  return HERO_POSITIONS[id] ?? [1, 2, 3, 4, 5]
}

// ---------------------------------------------------------------------------
// Build META_HEROES from the snapshots
// ---------------------------------------------------------------------------
const previousById = new Map<number, RawSnapshotHero>(
  PREVIOUS.heroes.map((h) => [h.id, h])
)

function readBracket(map: Record<string, number>, b: MetaBracket): number {
  const v = map[String(b)]
  return typeof v === 'number' ? v : 0
}

function buildTable(): MetaHeroEntry[] {
  return CURRENT.heroes.map((h) => {
    const wr = {} as Record<MetaBracket, number>
    const pick = {} as Record<MetaBracket, number>
    const wrPrev = {} as Record<MetaBracket, number>
    const prev = previousById.get(h.id)
    for (let bb = 1; bb <= 8; bb++) {
      const b = bb as MetaBracket
      wr[b] = readBracket(h.wr, b)
      pick[b] = readBracket(h.pick, b)
      // Fall back to current WR when there's no previous-week record
      // (new hero, first run after a fresh deploy, etc.) — that yields
      // momentum = 0 instead of NaN.
      wrPrev[b] = prev ? readBracket(prev.wr, b) : wr[b]
    }
    return {
      id: h.id,
      name: h.name,
      wr,
      pick,
      wrPrev,
      positions: positionsForHero(h.id),
    }
  })
}

export const META_HEROES: MetaHeroEntry[] = buildTable()

// ---------------------------------------------------------------------------
// Tier scoring
// ---------------------------------------------------------------------------
//
// Tier formula (this is the canonical definition — keep this comment block
// in sync with any code changes):
//
//   tierScore =  wrLiftPp           ← absolute strength vs. bracket median
//             +  pickBonus          ← actually-picked filter
//             +  momentumBonus      ← week-over-week WR delta = "patch consequence"
//
// Components:
//
//   wrLiftPp     = (hero.wr − bracketMedianWr) × 100
//                  Spread is typically -3pp to +5pp at any bracket.
//
//   pickBonus    = +1.0 if hero.pick ≥ bracketMedianPick, else 0
//                  Filters out "53% WR but nobody picks them" mains —
//                  those numbers are a self-selection bias, not a
//                  meta signal.
//
//   momentumBonus = clamp((hero.wr − hero.wrPrev) × 100, −2.0, +2.0)
//                  Captures whatever moved this hero's WR last week —
//                  hero buffs/nerfs, item buffs/nerfs the hero relies
//                  on, neutral changes, or matchup shifts. We don't
//                  parse patch notes; we measure the consequence.
//                  Clamped so a single noisy week can't dominate.
//
// Tier cuts (hand-tuned against current OpenDota distributions):
//
//   S: tierScore ≥  3.0     "carry the patch"
//   A: tierScore ≥  1.5     "above the curve"
//   B: tierScore ≥ −1.0     "fine pick, balanced"
//   C: tierScore <  −1.0    "skip unless you main"
//
// Why not pure WR? Two reasons. First, two heroes at +2pp WR aren't
// equally "S-tier" — one might be picked 3× more (real meta) and the
// other might be a 1% pick rate signature pick. Second, patch context
// matters: a hero at 51% WR who jumped from 48% last week is way more
// "S-tier" than a hero stable at 51% for months. Skill buffs and item
// buffs both manifest as WR momentum; we lean on that signal rather
// than trying to parse Valve's patch notes.

const MEDIAN_CACHE = new Map<MetaBracket, { wr: number; pick: number }>()

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b)
  const n = sorted.length
  if (n === 0) return 0
  return n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[(n - 1) / 2]
}

export function computeBracketMedians(bracket: MetaBracket): { wr: number; pick: number } {
  const cached = MEDIAN_CACHE.get(bracket)
  if (cached) return cached
  // Filter out heroes with zero pick rate at this bracket (e.g. unplayed
  // newcomers or heroes broken by a hotfix) — they'd drag the median
  // toward zero artificially.
  const wrs = META_HEROES
    .filter((h) => h.pick[bracket] > 0)
    .map((h) => h.wr[bracket])
  const picks = META_HEROES.map((h) => h.pick[bracket]).filter((p) => p > 0)
  const result = { wr: median(wrs), pick: median(picks) }
  MEDIAN_CACHE.set(bracket, result)
  return result
}

export interface TierBreakdown {
  tier: Tier
  score: number
  wrLiftPp: number
  pickBonus: number
  momentumBonus: number
  /** Raw week-over-week WR change in points (unclamped). */
  wrDeltaPp: number
}

export function tierBreakdownFor(
  hero: MetaHeroEntry,
  bracket: MetaBracket
): TierBreakdown {
  const { wr: medWr, pick: medPick } = computeBracketMedians(bracket)
  const wrLiftPp = (hero.wr[bracket] - medWr) * 100
  const pickBonus = hero.pick[bracket] >= medPick ? 1.0 : 0
  const wrDeltaPp = (hero.wr[bracket] - hero.wrPrev[bracket]) * 100
  const momentumBonus = Math.max(-2.0, Math.min(2.0, wrDeltaPp))
  const score = wrLiftPp + pickBonus + momentumBonus
  let tier: Tier
  if (score >= 3.0) tier = 'S'
  else if (score >= 1.5) tier = 'A'
  else if (score >= -1.0) tier = 'B'
  else tier = 'C'
  return { tier, score, wrLiftPp, pickBonus, momentumBonus, wrDeltaPp }
}

export function tierFor(hero: MetaHeroEntry, bracket: MetaBracket): Tier {
  return tierBreakdownFor(hero, bracket).tier
}

export function heroRoleOf(id: number): HeroRole {
  return classifyHeroById(id)
}

/**
 * OpenDota's CDN serves hero portraits at a stable URL keyed off the
 * internal hero name (e.g. "antimage"). We slugify the display name
 * with a small override table for heroes whose internal name doesn't
 * match the naive slug (Outworld Destroyer → obsidian_destroyer, etc.).
 */
export function heroPortraitUrl(_id: number, name: string): string {
  const key =
    NAME_KEY_OVERRIDES[name] ??
    name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${key}.png`
}

const NAME_KEY_OVERRIDES: Record<string, string> = {
  'Anti-Mage': 'antimage',
  'Centaur Warrunner': 'centaur',
  Doom: 'doom_bringer',
  Io: 'wisp',
  Magnus: 'magnataur',
  "Nature's Prophet": 'furion',
  'Outworld Destroyer': 'obsidian_destroyer',
  'Queen of Pain': 'queenofpain',
  'Shadow Fiend': 'nevermore',
  Timbersaw: 'shredder',
  'Treant Protector': 'treant',
  'Vengeful Spirit': 'vengefulspirit',
  Windranger: 'windrunner',
  'Wraith King': 'skeleton_king',
  Zeus: 'zuus',
  Underlord: 'abyssal_underlord',
}

export function bracketFromRankBucket(bucket: 'low' | 'mid' | 'high' | 'top'): MetaBracket {
  if (bucket === 'low') return 3 // Crusader as middle of low bucket
  if (bucket === 'mid') return 5 // Legend
  if (bucket === 'high') return 7 // Divine
  return 8 // Immortal
}
