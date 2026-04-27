import type { AnalysisResult, ODMatchPlayer, ReportInput } from '../types'
import { findPlayerInMatch, isRadiantSlot } from '../lib/matchHelpers'
import { heroTraits, type HeroTrait } from '../lib/heroTraits'

// Items >= ~4000 gold. Used for "first major item time" reporting.
const MAJOR_ITEMS = new Set<string>([
  'black_king_bar',
  'monkey_king_bar',
  'bloodthorn',
  'heart',
  'assault',
  'lotus_orb',
  'manta',
  'butterfly',
  'daedalus',
  'satanic',
  'abyssal_blade',
  'octarine_core',
  'refresher',
  'shivas_guard',
  'radiance',
  'ultimate_scepter',
  'bfury',
  'crimson_guard',
  'pipe',
  'guardian_greaves',
  'aghanims_shard', // not 4k but most-purchased "major" milestone
  'mjollnir',
  'silver_edge',
  'skadi',
  'eye_of_skadi',
  'vladmir',
  'nullifier',
])

interface ThreatRule {
  trait: HeroTrait
  threshold: number
  /** Counter items by user role. 'core' OR 'support' must contain at least one entry. */
  counters: { core?: string[]; support?: string[] }
  /** Display label for the trait. */
  label: string
  /** Short description of the threat for prose. */
  noun: string
  /** Per-role what-to-do advice. */
  advice: { core: string; support: string }
}

const THREAT_RULES: ThreatRule[] = [
  {
    trait: 'stunlock',
    threshold: 2,
    label: 'stunlock',
    noun: 'stunlock heroes',
    counters: {
      core: ['black_king_bar'],
      support: ['glimmer_cape', 'lotus_orb'],
    },
    advice: {
      core: 'When 2+ stuns are on the enemy team, prioritize BKB over your standard build — even a 5th item BKB is better than no BKB.',
      support: 'Glimmer Cape on yourself, Lotus Orb on your carry — pick whichever the enemy stun targets most.',
    },
  },
  {
    trait: 'magic_burst',
    threshold: 2,
    label: 'magic burst',
    noun: 'magic-burst heroes',
    counters: {
      core: ['black_king_bar', 'pipe'],
      support: ['glimmer_cape', 'pipe', 'lotus_orb'],
    },
    advice: {
      core: 'BKB or Pipe should slot in before your damage items — magic burst kills you in < 2 seconds without it.',
      support: 'Pick up Pipe for the team or Glimmer for yourself before your team-fight item slot.',
    },
  },
  {
    trait: 'physical_carry',
    threshold: 1,
    label: 'enemy carry',
    noun: 'physical carry',
    counters: {
      core: ['crimson_guard', 'heart', 'assault', 'cyclone'],
      support: [], // supports don't itemize against carries directly
    },
    advice: {
      core: 'Crimson, AC, or Heart in your build — letting an enemy carry right-click you for 800/sec uncontested is a free win for them.',
      support: '',
    },
  },
  {
    trait: 'evasion_or_blur',
    threshold: 1,
    label: 'evasion',
    noun: 'evasion hero',
    counters: {
      core: ['monkey_king_bar', 'bloodthorn'],
      support: [],
    },
    advice: {
      core: 'MKB or Bloodthorn the moment they show evasion — your right-click damage is meaningless without true strike.',
      support: '',
    },
  },
  {
    trait: 'silence',
    threshold: 1,
    label: 'silence',
    noun: 'silence hero',
    counters: {
      core: ['lotus_orb', 'black_king_bar', 'cyclone'],
      support: ['cyclone', 'glimmer_cape'],
    },
    advice: {
      core: 'Reliable silence on the enemy = BKB or Lotus Orb non-negotiable. Eul\'s self-cyclone is the cheapest pre-BKB safety net.',
      support: 'Eul\'s self-cyclone breaks silences — cheap and slot-efficient before your big team-fight item.',
    },
  },
  {
    trait: 'blink_initiation',
    threshold: 1,
    label: 'blink initiator',
    noun: 'blink-initiator',
    counters: {
      core: [],
      support: ['force_staff'],
    },
    advice: {
      core: '',
      support: 'Force Staff first item — saving a teammate from a Magnus RP or Tide Ravage wins the game.',
    },
  },
]

interface PatternResult {
  rule: ThreatRule
  gamesWithThreat: number
  gamesWithCounter: number
  missRate: number
  /** Median time of first 4000+ gold item in matches with the threat (parsed only). Null if none. */
  medianFirstMajorSec: number | null
  /** Score for ranking: gamesWithThreat * missRate. */
  score: number
}

export function analyzeSituationalItems(input: ReportInput): AnalysisResult {
  const { matches, details, accountId, inferredRole } = input
  const userIsSupport = inferredRole === 'support'

  let parsedWithPurchases = 0
  const patternStats = new Map<HeroTrait, {
    gamesWithThreat: number
    gamesWithCounter: number
    firstMajorTimes: number[]
  }>()
  for (const rule of THREAT_RULES) {
    patternStats.set(rule.trait, {
      gamesWithThreat: 0,
      gamesWithCounter: 0,
      firstMajorTimes: [],
    })
  }

  for (const m of matches) {
    const detail = details[m.match_id]
    if (!detail) continue
    const player = findPlayerInMatch(detail, accountId)
    if (!player) continue

    const userIsRadiant = isRadiantSlot(player.player_slot)
    const enemies = detail.players.filter(
      (p) => isRadiantSlot(p.player_slot) !== userIsRadiant
    )
    const enemyTraitCounts = countTraitsAcross(enemies)

    const userItemKeys = new Set<string>()
    let firstMajorSec: number | null = null
    if (player.purchase_log?.length) {
      parsedWithPurchases++
      for (const entry of player.purchase_log) {
        userItemKeys.add(entry.key)
        if (MAJOR_ITEMS.has(entry.key)) {
          if (firstMajorSec == null || entry.time < firstMajorSec) {
            firstMajorSec = entry.time
          }
        }
      }
    }

    for (const rule of THREAT_RULES) {
      const counters = userIsSupport ? rule.counters.support : rule.counters.core
      if (!counters || counters.length === 0) continue
      const present = (enemyTraitCounts.get(rule.trait) ?? 0) >= rule.threshold
      if (!present) continue

      const stats = patternStats.get(rule.trait)!
      stats.gamesWithThreat++

      if (player.purchase_log?.length) {
        const built = counters.some((key) => userItemKeys.has(key))
        if (built) stats.gamesWithCounter++
        if (firstMajorSec != null) stats.firstMajorTimes.push(firstMajorSec)
      }
    }
  }

  const patterns: PatternResult[] = []
  for (const rule of THREAT_RULES) {
    const stats = patternStats.get(rule.trait)!
    if (stats.gamesWithThreat === 0) continue
    const missRate = 1 - stats.gamesWithCounter / stats.gamesWithThreat
    let median: number | null = null
    if (stats.firstMajorTimes.length > 0) {
      const sorted = [...stats.firstMajorTimes].sort((a, b) => a - b)
      median = sorted[Math.floor(sorted.length / 2)]
    }
    patterns.push({
      rule,
      gamesWithThreat: stats.gamesWithThreat,
      gamesWithCounter: stats.gamesWithCounter,
      missRate,
      medianFirstMajorSec: median,
      score: stats.gamesWithThreat * missRate,
    })
  }

  // Drop "already adapting" patterns — if the user builds the counter
  // 75%+ of the time, it's not a problem worth flagging.
  const flagged = patterns
    .filter((p) => p.gamesWithThreat >= 3 && 1 - p.missRate < 0.75)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)

  const note = `${parsedWithPurchases}/${matches.length} matches had purchase logs for precise build analysis.`

  if (parsedWithPurchases === 0) {
    return {
      id: 'situational-items',
      title: 'Situational items',
      metric: 0,
      metricLabel: '',
      baseline: 0,
      baselineLabel: '',
      severity: 'unmeasured',
      finding: 'No parsed matches with purchase logs found yet — situational item analysis needs replay parsing.',
      suggestion: 'Once your matches finish parsing, re-run the report — this card will fill in.',
      note,
    }
  }

  if (flagged.length === 0) {
    return {
      id: 'situational-items',
      title: 'Situational items',
      metric: 0,
      metricLabel: 'recurring miss',
      baseline: 0,
      baselineLabel: 'misses',
      severity: 'good',
      finding: `Your build adapts to enemy lineups — across ${parsedWithPurchases} parsed matches, no recurring missed counters detected.`,
      suggestion: 'Keep reading the draft. The next bottleneck is probably *timing* — slotting the situational item earlier in your build.',
      note,
      roastFacts: {
        pattern: 'all',
        miss_rate: 0,
        n: parsedWithPurchases,
        counter_item: 'situational',
        parsed_count: parsedWithPurchases,
      },
    }
  }

  const top = flagged[0]
  const severity =
    top.missRate >= 0.7 && top.gamesWithThreat >= 5 ? 'concerning'
    : top.missRate >= 0.5 ? 'ok'
    : 'good'

  const findingLines = flagged.map((p) => describePattern(p, matches.length))
  const finding = findingLines.join(' ')
  const suggestion = userIsSupport ? top.rule.advice.support : top.rule.advice.core

  // Chart: per pattern, show "Built / Missed" stacked-style via two bars.
  const chartData = flagged.map((p) => ({
    label: p.rule.label,
    value: p.gamesWithThreat - p.gamesWithCounter, // missed
    baseline: p.gamesWithCounter, // built
  }))

  return {
    id: 'situational-items',
    title: 'Situational items',
    metric: Math.round(top.missRate * 100),
    metricLabel: `% missed · ${top.rule.label}`,
    baseline: 0,
    baselineLabel: '% target',
    severity,
    finding,
    suggestion: suggestion || 'Read the enemy draft on the loading screen — adjust your build slot order before you start farming, not after the first team fight.',
    note,
    roastFacts: {
      pattern: top.rule.trait,
      miss_rate: Math.round(top.missRate * 100),
      n: top.gamesWithThreat,
      counter_item: pickPrimaryCounterName(top.rule),
      parsed_count: parsedWithPurchases,
    },
    chart: {
      kind: 'bars',
      valueName: 'Missed',
      baselineName: 'Built',
      data: chartData,
    },
  }
}

function countTraitsAcross(players: ODMatchPlayer[]): Map<HeroTrait, number> {
  const counts = new Map<HeroTrait, number>()
  for (const p of players) {
    for (const t of heroTraits(p.hero_id)) {
      counts.set(t, (counts.get(t) ?? 0) + 1)
    }
  }
  return counts
}

function describePattern(p: PatternResult, totalMatches: number): string {
  void totalMatches
  const built = p.gamesWithCounter
  const games = p.gamesWithThreat
  const counterName = pickPrimaryCounterName(p.rule)
  const timing = p.medianFirstMajorSec != null
    ? ` Median first major item: ${fmtMin(p.medianFirstMajorSec)}.`
    : ''
  return `Enemy lineup had ${p.rule.threshold}+ ${p.rule.noun} in ${games} of your last matches. You built ${counterName} in ${built} of those ${games}.${timing}`
}

function pickPrimaryCounterName(rule: ThreatRule): string {
  // Use first-listed counter for the role that has counters (prefer core list).
  const list = rule.counters.core?.length ? rule.counters.core : rule.counters.support ?? []
  return list.length > 0 ? itemDisplay(list[0]) : 'a counter item'
}

function itemDisplay(key: string): string {
  // Consistent display name: replace underscores, title-case each word.
  if (key === 'black_king_bar') return 'BKB'
  if (key === 'monkey_king_bar') return 'MKB'
  if (key === 'aghanims_shard') return 'Aghanim\'s Shard'
  if (key === 'ultimate_scepter') return 'Aghanim\'s Scepter'
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function fmtMin(sec: number): string {
  return `${Math.round(sec / 60)} min`
}
