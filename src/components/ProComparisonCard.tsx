import { useMemo } from 'react'
import type { ODMatchDetail, ODMatchSummary } from '../types'
import {
  computeUserVector,
  compareUserToPros,
  computeStaleness,
  biggestDivergence,
  PRO_COMPARISON_MIN_MATCHES,
  type ProCorpus,
  type ProVector,
  type AxisName,
} from '../lib/proComparison'
import { CardSkeleton } from './CardSkeleton'
import type { ReportPhase } from './ProgressStrip'

interface ProComparisonCardProps {
  matches: ODMatchSummary[]
  details: Record<number, ODMatchDetail>
  accountId: number
  honestMode: boolean
  corpus: ProCorpus | null
  phase?: ReportPhase
}

// Cosine similarity threshold below which the headline twin gets a "loose
// match — caveat" framing. 0.3 is the spec's number.
const LOOSE_MATCH_THRESHOLD = 0.3

const PER_AXIS_INTRO: Record<AxisName, string> = {
  role: 'Your role mix most like',
  hero_archetype: 'Your hero pool overlaps with the heroes drafted onto',
  tempo: 'Your tempo most like',
  farm: 'Your farm shape most like',
  vision: 'Your vision most like',
  death: 'Your death pattern most like',
  spending: 'Your spending tempo most like',
  involvement: 'Your fight involvement most like',
}

interface DivergenceCopy {
  /** Sentence that fits "Where you diverge: vision. He {sentence}. Steal that." */
  axis: AxisName
  sentence: string
  /** Brief actionable suffix. */
  steal: string
}

function describeDivergence(
  diverge: ReturnType<typeof biggestDivergence>,
  _pro: ProVector
): DivergenceCopy | null {
  if (!diverge) return null
  const { name, userVal, proVal } = diverge
  const fmt = (n: number, places = 1) => n.toFixed(places)
  const ratioPretty = userVal === 0
    ? null
    : Math.max(proVal / userVal, userVal / proVal)
  const round = (x: number) => Math.round(x * 10) / 10
  switch (name) {
    case 'sen_per_game':
      return {
        axis: 'vision',
        sentence: `places ${ratioPretty ? round(ratioPretty) : '—'}× more sentries per game (${fmt(proVal)} vs ${fmt(userVal)})`,
        steal: 'Steal that.',
      }
    case 'obs_per_game':
      return {
        axis: 'vision',
        sentence: `places ${ratioPretty ? round(ratioPretty) : '—'}× more observers per game (${fmt(proVal)} vs ${fmt(userVal)})`,
        steal: 'Steal that.',
      }
    case 'dewards_per_game':
      return {
        axis: 'vision',
        sentence: `clears ${ratioPretty ? round(ratioPretty) : '—'}× more enemy wards per game (${fmt(proVal)} vs ${fmt(userVal)})`,
        steal: 'Steal that.',
      }
    case 'gpm':
      return {
        axis: 'farm',
        sentence: `earns ${Math.round(proVal)} GPM to your ${Math.round(userVal)}`,
        steal: 'Same role; he just isn’t losing the lane.',
      }
    case 'lh_per_min':
      return {
        axis: 'farm',
        sentence: `lasthits ${fmt(proVal)} creeps a minute, you average ${fmt(userVal)}`,
        steal: 'Tighten the creep wave; that’s the gap.',
      }
    case 'lh_at_10':
      return {
        axis: 'farm',
        sentence: `lands ${Math.round(proVal)} LH at 10 minutes, you land ${Math.round(userVal)}`,
        steal: 'Closer attention to the lane in the first 10 minutes.',
      }
    case 'lane_efficiency_pct':
      return {
        axis: 'farm',
        sentence: `runs his lane at ${Math.round(proVal)}% efficiency, yours sits at ${Math.round(userVal)}%`,
        steal: 'Lane setup, not late-game decisions.',
      }
    case 'kill_participation':
      return {
        axis: 'involvement',
        sentence: `is in ${Math.round(proVal * 100)}% of his team’s kills, you sit at ${Math.round(userVal * 100)}%`,
        steal: 'Show up to fights instead of farming through them.',
      }
    case 'deaths_per_match':
      return {
        axis: 'death',
        sentence: `dies ${fmt(proVal)} times a game, you die ${fmt(userVal)}`,
        steal: 'The gap is positioning, not skill.',
      }
    case 'deaths_per_min':
      return {
        axis: 'death',
        sentence: `dies once every ${Math.round(1 / Math.max(proVal, 0.0001))} minutes, you die every ${Math.round(1 / Math.max(userVal, 0.0001))}`,
        steal: 'Bigger map awareness window.',
      }
    case 'kda_ratio':
      return {
        axis: 'death',
        sentence: `runs a ${fmt(proVal, 2)} KDA, yours sits at ${fmt(userVal, 2)}`,
        steal: 'The wins-trades-loses-fights ratio is the lever.',
      }
    case 'core_spike_min':
      return {
        axis: 'spending',
        sentence: `hits his first big item at minute ${fmt(proVal)}, you hit it at minute ${fmt(userVal)}`,
        steal: 'Earlier farm priority, fewer detour items.',
      }
    case 'support_spike_min':
      return {
        axis: 'spending',
        sentence: `hits Force/Glimmer/Aghs at minute ${fmt(proVal)}, you hit it at minute ${fmt(userVal)}`,
        steal: 'Less hesitation on the support spike — buy it the moment you can.',
      }
    case 'pct_under_30min':
      return {
        axis: 'tempo',
        sentence: `closes ${Math.round(proVal * 100)}% of games under 30 min, you close ${Math.round(userVal * 100)}%`,
        steal: 'Fewer games dragged into late game means fewer chances for the enemy to scale past you.',
      }
    case 'pct_over_45min':
      return {
        axis: 'tempo',
        sentence: `lets ${Math.round(proVal * 100)}% of games run past 45 min, you let ${Math.round(userVal * 100)}%`,
        steal: 'Push timings instead of hoarding farm.',
      }
    case 'kda_per_min':
      return {
        axis: 'tempo',
        sentence: `runs ${fmt(proVal, 2)} KDA-events per minute, you run ${fmt(userVal, 2)}`,
        steal: 'Higher = more skirmishing; lower = more even-keeled. Whichever way, the tempo feel is different.',
      }
    case 'median_duration_min':
      return {
        axis: 'tempo',
        sentence: `runs a ${fmt(proVal)} min median game, you run ${fmt(userVal)}`,
        steal: '',
      }
    case 'unique_hero_ratio':
    case 'top3_concentration':
    case 'melee_carry':
    case 'ranged_carry':
    case 'caster_nuker':
    case 'initiator':
    case 'support':
    case 'durable_core':
      // Defensive: hero-pool features are also skipped in
      // biggestDivergence(). This branch shouldn't be reached, but if
      // someone changes the upstream filter it's a safe no-op rather than
      // a phrasing bug.
      return null
    case 'pos1':
    case 'pos2':
    case 'pos3':
    case 'pos4':
    case 'pos5':
      return {
        axis: 'role',
        sentence: `plays the matched role ${Math.round(proVal * 100)}% of the time, you play it ${Math.round(userVal * 100)}%`,
        steal: '',
      }
    default:
      return null
  }
}

function whyLine(user: ReturnType<typeof computeUserVector>, pro: ProVector): string {
  if (!user) return ''
  // Two-stat compact why: dominant role + median match length. Hero count
  // dropped because it's already in the per-axis breakdown ("hero archetype
  // most like..."), and a raw "11 unique vs 21 unique" comparison reads as
  // criticism of the user's pool size rather than a "you match" signal.
  const userTopRole = topRoleOf(user.role_dist)
  const proTopRole = topRoleOf(pro.raw.role_dist)
  const userDurMin = user.tempo.median_duration_min.toFixed(0)
  const proDurMin = pro.raw.tempo.median_duration_min.toFixed(0)
  return `${userTopRole.label} ${Math.round(userTopRole.share * 100)}%, ${userDurMin} min median. ${pro.name}: ${proTopRole.label} ${Math.round(proTopRole.share * 100)}%, ${proDurMin} min median.`
}

function topRoleOf(dist: { pos1: number; pos2: number; pos3: number; pos4: number; pos5: number }): { label: string; share: number } {
  const entries: { label: string; share: number }[] = [
    { label: 'pos 1', share: dist.pos1 },
    { label: 'pos 2', share: dist.pos2 },
    { label: 'pos 3', share: dist.pos3 },
    { label: 'pos 4', share: dist.pos4 },
    { label: 'pos 5', share: dist.pos5 },
  ]
  entries.sort((a, b) => b.share - a.share)
  // If two are within 5pp, render as "pos X/Y"
  if (entries[1].share > 0 && entries[0].share - entries[1].share < 0.05) {
    return { label: `${entries[0].label}/${entries[1].label.replace('pos ', '')}`, share: entries[0].share + entries[1].share }
  }
  return entries[0]
}

export function ProComparisonCard({
  matches: rawMatches,
  details,
  accountId,
  honestMode,
  corpus,
  phase,
}: ProComparisonCardProps) {
  // Dev-only `?pro_test_matches=N` URL param caps the match window for the
  // Pro Comparison vector calculation only. Lets us screenshot the <25
  // hidden state without needing a real <25-match account. Stripped at
  // build time only by virtue of being inside a component branch — for
  // now we trust nobody types this URL outside dev. Production users with
  // 50+ matches see no effect since the param defaults to no-op.
  const overrideLimit = useMemo(() => {
    if (typeof window === 'undefined') return null
    const param = new URLSearchParams(window.location.search).get('pro_test_matches')
    if (!param) return null
    const n = parseInt(param, 10)
    return Number.isFinite(n) && n > 0 ? n : null
  }, [])
  const matches = overrideLimit != null ? rawMatches.slice(0, overrideLimit) : rawMatches

  const userVector = useMemo(
    () => computeUserVector(matches, details, accountId),
    [matches, details, accountId]
  )

  const comparison = useMemo(() => {
    if (!userVector || !corpus || corpus.vectors.length === 0) return null
    return compareUserToPros(userVector, corpus.vectors)
  }, [userVector, corpus])

  const staleness = useMemo(() => {
    if (!corpus) return null
    return computeStaleness(corpus.last_updated)
  }, [corpus])

  // Skeleton while detail data is still streaming. Same hooks-ordering
  // discipline as the other cards: skeleton return AFTER hooks.
  const enoughMatches = matches.length >= PRO_COMPARISON_MIN_MATCHES
  const phaseDone = !phase || phase === 'done' || phase === 'parsing'

  if (!enoughMatches) {
    // Sample too small — don't render the card at all per spec.
    return null
  }
  if (!corpus || corpus.vectors.length === 0) {
    // Corpus not bundled yet (build day) or empty — render a minimal
    // placeholder so users in dev see something instead of a missing card.
    return (
      <article className="card sev-unmeasured">
        <div className="card-head">
          <h3 className="card-title">Pro Comparison</h3>
          <span className="pill unmeasured">Unmeasured</span>
        </div>
        <p className="prose">
          Pro corpus isn’t bundled in this build yet. Once
          {' '}<code>src/data/pro-vectors.json</code>{' '} ships, this card
          shows your closest pro twin.
        </p>
      </article>
    )
  }
  if (!userVector || !comparison) {
    return <CardSkeleton title="Pro Comparison" />
  }
  if (!phaseDone) {
    return <CardSkeleton title="Pro Comparison" />
  }

  const { closestOverall, closestOverallSimilarity, flexSuppression, perAxis } = comparison
  const isLooseMatch = closestOverallSimilarity != null && closestOverallSimilarity < LOOSE_MATCH_THRESHOLD

  const headlineDivergence = closestOverall
    ? describeDivergence(biggestDivergence(userVector, closestOverall, corpus.vectors), closestOverall)
    : null

  // Pill: 'Healthy' when there's a meaningful comparison, 'Watch' when
  // flex-suppressed (still useful per-axis), 'Unmeasured' shouldn't reach
  // here (we already guarded above).
  const pillClass = flexSuppression ? 'pill watch' : 'pill healthy'
  const pillText = flexSuppression ? 'Flex' : 'Healthy'

  return (
    <article className="card">
      <div className="card-head">
        <h3 className="card-title">Pro Comparison</h3>
        <span className={pillClass}>{pillText}</span>
      </div>

      {flexSuppression ? (
        <p className="prose">
          {honestMode
            ? 'Three roles, one body. No pro plays this spread, so no single pro twin. Per-axis breakdown below.'
            : 'You flex too many roles for a single pro twin to make sense. Here’s where your playstyle overlaps pros by axis.'}
        </p>
      ) : closestOverall ? (
        <>
          {honestMode ? (
            // v1.3.0 minimal honest-mode line. The fuller "what changes if
            // you steal one thing from him" counterfactual + per-hero WR
            // overlap are deferred to v1.3.1 — those need a vision-WR
            // bracket-correlation table we haven't designed yet, plus a
            // flex-fallback for the per-hero WR line.
            <p className="prose">
              Closest pro twin: <strong>{closestOverall.name}</strong> ({closestOverall.team}), by which we mean least-far among {corpus.pro_count} pros.
            </p>
          ) : (
            <div className="metric">
              <div className="metric-value" style={{ fontFamily: '"Bebas Neue", sans-serif' }}>{closestOverall.name}</div>
              <div className="baseline">{closestOverall.team}</div>
            </div>
          )}
          <p className="prose">
            <strong>Why:</strong> {whyLine(userVector, closestOverall)}
          </p>
          {headlineDivergence && (
            <p className="prose">
              <strong>Where you diverge:</strong> {headlineDivergence.axis}. {closestOverall.name.split(' ')[0]} {headlineDivergence.sentence}.{headlineDivergence.steal && ` ${headlineDivergence.steal}`}
            </p>
          )}
          {isLooseMatch && (
            <p className="prose" style={{ fontStyle: 'italic', opacity: 0.85 }}>
              No close pro twin in our data — your closest match is {closestOverall.name} but only loosely. This is normal at lower brackets where playstyles are more chaotic.
            </p>
          )}
        </>
      ) : null}

      {perAxis.length > 0 && (
        <div className="what" style={{ marginTop: 12 }}>
          <strong>Closest by axis</strong>
          <ul style={{ margin: '6px 0 0 0', padding: '0 0 0 18px' }}>
            {perAxis.map((m) => {
              if (m.unavailable) {
                return (
                  <li key={m.axis} style={{ opacity: 0.7 }}>
                    {m.axisLabel}: <em>not enough data — {m.unavailableReason}</em>
                  </li>
                )
              }
              return (
                <li key={m.axis}>
                  {PER_AXIS_INTRO[m.axis]}: <strong>{m.pro.name}</strong>
                  {m.axis === 'hero_archetype' && <> (drafted heroes overlap your queue picks)</>}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <p className="footnote">
        Pro corpus last updated {staleness?.lastUpdated.toISOString().slice(0, 10)}. Active TI cycle players only.
        {staleness?.isStale && (
          <>
            {' '}<span style={{ color: 'var(--severity-watch, #F5B142)' }}>
              ({staleness.ageDays} days old — refresh pending.)
            </span>
          </>
        )}
      </p>
    </article>
  )
}
