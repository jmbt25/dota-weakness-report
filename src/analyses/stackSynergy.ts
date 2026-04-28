import type {
  AnalysisResult,
  ODMatchSummary,
  ReportInput,
  StackSynergyData,
  StackSynergyPartner,
} from '../types'
import { didWin, findPlayerInMatch, isRadiantSlot } from '../lib/matchHelpers'

// Sample-size gates from the spec.
const MIN_FOR_DISPLAY = 3
const MIN_FOR_PROSE = 5
const MIN_FOR_NORMAL = 10

/**
 * Detect party teammates and compare WR with vs. without each one.
 *
 * Primary signal: OpenDota's `party_id` on player slots. Two players in a
 * match with the same non-null `party_id` queued together. We use the
 * user's `party_id` as the anchor and find any teammate sharing that id.
 *
 * Fallback (lower confidence): if `party_id` is missing across most
 * matches, look for teammates that co-occur on the user's side in 2+
 * matches AND those matches have `party_size >= 2`. Marked as
 * 'low' confidence in the footnote.
 */
export function analyzeStackSynergy(input: ReportInput): AnalysisResult {
  const { matches, details, accountId } = input

  // First pass: tally co-occurrences of teammates and detect party_id usage.
  interface RawPartner {
    accountId: number
    personaName: string
    games: number
    wins: number
    matchIds: Set<number>
  }
  const teammates = new Map<number, RawPartner>()

  let partyMatchesByPartyId = 0
  let totalParsedish = 0
  // userMatchOutcomes[matchId] = win|loss
  const userOutcomes = new Map<number, boolean>()

  // Cooccurrence-only tally (used by fallback)
  const cooccur = new Map<number, RawPartner>()

  for (const m of matches) {
    const detail = details[m.match_id]
    if (!detail) continue
    const player = findPlayerInMatch(detail, accountId)
    if (!player) continue

    totalParsedish++
    userOutcomes.set(m.match_id, didWin(m))

    const userIsRadiant = isRadiantSlot(player.player_slot)
    const myParty = player.party_id ?? null
    const myPartySize = player.party_size ?? null

    const teammates_ = detail.players.filter(
      (p) =>
        p.account_id != null &&
        p.account_id !== accountId &&
        isRadiantSlot(p.player_slot) === userIsRadiant
    )

    // party_id-based detection
    if (myParty != null) {
      let foundPartyTeammate = false
      for (const tm of teammates_) {
        if (tm.party_id != null && tm.party_id === myParty) {
          foundPartyTeammate = true
          recordPartner(teammates, tm.account_id!, tm.personaname ?? null, m, didWin(m))
        }
      }
      if (foundPartyTeammate) partyMatchesByPartyId++
    }

    // Co-occurrence tally — also collected unconditionally so we can use
    // it for the heuristic fallback if party_id is sparse. Only count
    // matches where party_size >= 2 (if available).
    const inAParty = myPartySize != null && myPartySize >= 2
    if (inAParty || myParty == null) {
      for (const tm of teammates_) {
        recordPartner(cooccur, tm.account_id!, tm.personaname ?? null, m, didWin(m))
      }
    }
  }

  // Pick which detection mode we're using.
  let usePartyId = partyMatchesByPartyId >= 3
  let confidence: 'high' | 'low' = usePartyId ? 'high' : 'low'

  let activeMap = usePartyId ? teammates : cooccur

  // Heuristic filter for the fallback: only keep teammates seen in 2+ matches.
  if (!usePartyId) {
    const filtered = new Map<number, RawPartner>()
    for (const [id, p] of activeMap) {
      if (p.games >= 2) filtered.set(id, p)
    }
    activeMap = filtered
  }

  // If we have nothing, return unmeasured/healthy depending on the cause.
  if (activeMap.size === 0) {
    return {
      id: 'stack-synergy',
      title: 'Stack synergy',
      metric: 0,
      metricLabel: '',
      baseline: 0,
      baselineLabel: '',
      severity: 'unmeasured',
      finding: 'No party teammates detected in this window — looks like a solo-queue stretch.',
      suggestion: 'This card lights up once you queue with the same friend(s) for 3+ games. Solo-queue isn\'t a problem.',
      note: `${totalParsedish}/${matches.length} matches scanned · 0 party matches detected.`,
      stackSynergy: {
        partners: [],
        userOverallWr: computeWr(matches),
        detectionConfidence: confidence,
        partyMatchCount: 0,
        totalMatches: matches.length,
      },
    }
  }

  const userOverallWr = computeWr(matches)

  // Build StackSynergyPartner records.
  const partners: StackSynergyPartner[] = []
  for (const p of activeMap.values()) {
    if (p.games < MIN_FOR_DISPLAY) continue

    // Track "without partner" sample for transparency in the diagnostic log,
    // but the delta + significance test now compare wrTogether against the
    // user's overall WR (the dashed reference line on the chart). Comparing
    // against userWrWithoutPartner produced runaway deltas when the partner
    // queued in most of the user's matches (tiny without-sample → 100% or
    // 0% comparison baseline → ±100pp deltas).
    let withoutGames = 0
    let withoutWins = 0
    for (const [mid, won] of userOutcomes) {
      if (p.matchIds.has(mid)) continue
      withoutGames++
      if (won) withoutWins++
    }
    const wrTogether = p.wins / p.games
    const userWrWithoutPartner = withoutGames > 0 ? withoutWins / withoutGames : null
    const deltaPp = (wrTogether - userOverallWr) * 100

    // Diagnostic — verify formula on real data.
    // eslint-disable-next-line no-console
    console.debug('[stack-synergy] partner', {
      partner: p.personaName,
      gamesTogether: p.games,
      winsTogether: p.wins,
      wrTogether: Number(wrTogether.toFixed(3)),
      userOverallWr: Number(userOverallWr.toFixed(3)),
      withoutGames,
      withoutWins,
      userWrWithoutPartner: userWrWithoutPartner != null ? Number(userWrWithoutPartner.toFixed(3)) : null,
      deltaPp: Number(deltaPp.toFixed(1)),
    })

    // 95% CI for wrTogether. Significant = the user's overall WR sits
    // outside the CI of the with-partner WR (i.e. the partner makes a
    // statistically detectable difference).
    const se = Math.sqrt((wrTogether * (1 - wrTogether)) / p.games)
    const ciLow = Math.max(0, wrTogether - 1.96 * se)
    const ciHigh = Math.min(1, wrTogether + 1.96 * se)
    const isSignificant = userOverallWr < ciLow || userOverallWr > ciHigh

    partners.push({
      id: p.accountId,
      personaName: p.personaName || `Player ${p.accountId}`,
      gamesTogether: p.games,
      winsTogether: p.wins,
      wrTogether,
      userWrWithoutPartner,
      deltaPp,
      ciLow,
      ciHigh,
      isSignificant,
      withoutGames,
    })
  }

  partners.sort((a, b) => b.gamesTogether - a.gamesTogether)

  const stackSynergy: StackSynergyData = {
    partners,
    userOverallWr,
    detectionConfidence: confidence,
    partyMatchCount: usePartyId ? partyMatchesByPartyId : countMatchesWithAnyPartner(partners),
    totalMatches: matches.length,
  }

  // We saw stack teammates but none played 3+ games with the user — not enough
  // sample to evaluate. Surface as 'unmeasured' rather than green-pilling it.
  if (partners.length === 0) {
    return {
      id: 'stack-synergy',
      title: 'Stack synergy',
      metric: 0,
      metricLabel: '',
      baseline: 0,
      baselineLabel: '',
      severity: 'unmeasured',
      finding: `Saw ${activeMap.size} stack teammate${activeMap.size === 1 ? '' : 's'} in this window, but none played ${MIN_FOR_DISPLAY}+ games with you — too small a sample to evaluate.`,
      suggestion: 'Once you stack with the same friend for 3+ games, this card will fill in.',
      note:
        confidence === 'low'
          ? `Lower-confidence detection · ${matches.length} matches scanned.`
          : `${matches.length} matches scanned · ${stackSynergy.partyMatchCount} stacked.`,
      stackSynergy,
    }
  }

  // Determine display partners (N >= 5 for the count headline).
  const partnersForHeadline = partners.filter((p) => p.gamesTogether >= MIN_FOR_PROSE)
  const partnersForProse = partners.filter((p) => p.gamesTogether >= MIN_FOR_PROSE)

  // "Best/worst stack partner" selection (per pre-launch spec):
  //   1. prefer N >= 10 + significant
  //   2. relax to N >= 5 + significant if (1) yields nothing
  //   3. otherwise no best/worst is named (small-sample fallthrough)
  // Ties broken by absolute deltaPp (bigger swing wins).
  const sigN10 = partners.filter((p) => p.isSignificant && p.gamesTogether >= MIN_FOR_NORMAL)
  const sigN5 = partners.filter((p) => p.isSignificant && p.gamesTogether >= MIN_FOR_PROSE)
  const sigPositiveN10 = sigN10.filter((p) => (p.deltaPp ?? 0) > 0)
  const sigNegativeN10 = sigN10.filter((p) => (p.deltaPp ?? 0) < 0)
  const sigPositiveN5 = sigN5.filter((p) => (p.deltaPp ?? 0) > 0)
  const sigNegativeN5 = sigN5.filter((p) => (p.deltaPp ?? 0) < 0)

  const bestPos = sigPositiveN10.length > 0 ? sigPositiveN10 : sigPositiveN5
  const worstNeg = sigNegativeN10.length > 0 ? sigNegativeN10 : sigNegativeN5
  const bestSampleSmall = sigPositiveN10.length === 0 && sigPositiveN5.length > 0
  const worstSampleSmall = sigNegativeN10.length === 0 && sigNegativeN5.length > 0

  const best = bestPos.length > 0
    ? [...bestPos].sort((a, b) => (b.deltaPp ?? 0) - (a.deltaPp ?? 0))[0]
    : null
  const worst = worstNeg.length > 0
    ? [...worstNeg].sort((a, b) => (a.deltaPp ?? 0) - (b.deltaPp ?? 0))[0]
    : null

  // Severity rules:
  //   Healthy   — best (N >= 10, significant) with delta_pp >= +5,
  //               AND no significant partner (N >= 10) with delta_pp <= -10
  //   Watch     — best (>= +5, N >= 10) AND at least one significant negative
  //               (<= -10, N >= 10)
  //   Concerning— significant negatives exist (N >= 10) but no significant
  //               positive carry, OR best with N >= 10 has delta < +5 and
  //               there is a significant negative
  //   Healthy   — fallback when no significant N>=10 partner exists
  //               (don't cry wolf on small samples; prose flags the small read)
  const bestN10 = sigPositiveN10.length > 0
    ? [...sigPositiveN10].sort((a, b) => (b.deltaPp ?? 0) - (a.deltaPp ?? 0))[0]
    : null
  const bestN10IsCarrying = bestN10 != null && (bestN10.deltaPp ?? 0) >= 5
  const heavyNegN10 = sigNegativeN10.filter((p) => (p.deltaPp ?? 0) <= -10)

  let severity: AnalysisResult['severity']
  if (bestN10IsCarrying && heavyNegN10.length === 0) {
    severity = 'good'
  } else if (bestN10IsCarrying && heavyNegN10.length > 0) {
    severity = 'ok'
  } else if (heavyNegN10.length > 0) {
    severity = 'concerning'
  } else {
    // No significant N>=10 partner is meaningfully carrying or dragging.
    // Default to Healthy and let the prose explain the small-sample read.
    severity = 'good'
  }
  // eslint-disable-next-line no-console
  console.debug('[stack-synergy] severity', {
    severity,
    sigN10Count: sigN10.length,
    sigPositiveN10: sigPositiveN10.length,
    sigNegativeN10: sigNegativeN10.length,
    heavyNegN10: heavyNegN10.length,
    bestN10Delta: bestN10?.deltaPp ?? null,
  })

  let finding: string
  if (partnersForProse.length === 0) {
    finding = `${partners.length} stack partner${partners.length === 1 ? '' : 's'} detected with ${MIN_FOR_DISPLAY}–${MIN_FOR_PROSE - 1} games together — too small a sample for any individual to draw a conclusion from.`
  } else if (best == null && worst == null) {
    finding = `No stack partner with enough games for a stable read. ${partnersForProse.length} partner${partnersForProse.length === 1 ? '' : 's'} cleared the ${MIN_FOR_PROSE}-game floor, but none differ from your ${(userOverallWr * 100).toFixed(0)}% overall WR by more than statistical noise.`
  } else {
    finding = composeFinding(best, worst, partnersForProse, userOverallWr, bestSampleSmall, worstSampleSmall)
  }
  const suggestion =
    'Stack patterns usually reflect role/style fit, not individual skill — a partner with negative delta might just be queued in the wrong role pair with you.'

  // Chart: horizontal bar per partner with N >= 3, sorted by gamesTogether.
  // Toggling anonymization is handled by the card component (StackSynergyCard).
  // Card component reads stackSynergy.partners directly and builds its own chart.
  const chartData = partners.map((p) => ({
    label: `${p.personaName} (${p.gamesTogether} games)`,
    value: Math.round(p.wrTogether * 100),
    baseline: Math.round(userOverallWr * 100),
  }))

  // Roast facts — derived from best/worst with significance for the
  // card-level Healthy/Watch/Concerning bookend roasts. Per-partner roasts
  // are produced inside StackSynergyCard so they honor the anonymization
  // toggle.
  const roastFacts: Record<string, string | number> = {}
  if (best) {
    roastFacts.best_partner = best.personaName
    roastFacts.best_wr = Math.round(best.wrTogether * 100)
    roastFacts.best_delta = Math.round(best.deltaPp ?? 0)
  }
  if (worst) {
    roastFacts.worst_partner = worst.personaName
    roastFacts.worst_wr = Math.round(worst.wrTogether * 100)
    roastFacts.worst_delta = Math.round(worst.deltaPp ?? 0)
    // Game / win / loss counts are surfaced so the severe-negative
    // honest-mode template ("0-7 across 7 games — that's not a trend")
    // can interpolate the actual record instead of just the WR %.
    roastFacts.worst_games = worst.gamesTogether
    roastFacts.worst_wins = worst.winsTogether
    roastFacts.worst_losses = worst.gamesTogether - worst.winsTogether
  }

  return {
    id: 'stack-synergy',
    title: 'Stack synergy',
    metric: partnersForHeadline.length,
    metricLabel: `partner${partnersForHeadline.length === 1 ? '' : 's'} (≥${MIN_FOR_PROSE} games)`,
    baseline: Math.round(userOverallWr * 100),
    baselineLabel: '% your overall WR',
    severity,
    finding,
    suggestion,
    note:
      confidence === 'low'
        ? `Lower-confidence party detection — used heuristic fallback (party_id field was sparse). ${stackSynergy.partyMatchCount}/${matches.length} matches involved a likely stack.`
        : `${stackSynergy.partyMatchCount}/${matches.length} matches were stacked (party_id-based detection).`,
    chart: { kind: 'bars', horizontal: true, valueName: 'WR %', data: chartData },
    stackSynergy,
    roastFacts,
  }
}

function recordPartner(
  map: Map<number, {
    accountId: number
    personaName: string
    games: number
    wins: number
    matchIds: Set<number>
  }>,
  accountId: number,
  personaName: string | null,
  match: ODMatchSummary,
  userWon: boolean
) {
  const cur = map.get(accountId) ?? {
    accountId,
    personaName: personaName ?? '',
    games: 0,
    wins: 0,
    matchIds: new Set<number>(),
  }
  if (cur.matchIds.has(match.match_id)) return // dedupe (in case of multi-pass)
  cur.matchIds.add(match.match_id)
  cur.games++
  if (userWon) cur.wins++
  // Hold onto the first non-empty name we see.
  if (!cur.personaName && personaName) cur.personaName = personaName
  map.set(accountId, cur)
}

function computeWr(matches: ODMatchSummary[]): number {
  if (matches.length === 0) return 0
  let wins = 0
  for (const m of matches) if (didWin(m)) wins++
  return wins / matches.length
}

function countMatchesWithAnyPartner(partners: StackSynergyPartner[]): number {
  // Approximation: sum of unique match-ids across partners. We don't have
  // the match id sets here, so just return the max gamesTogether as a
  // conservative estimate of distinct stack matches.
  let max = 0
  for (const p of partners) if (p.gamesTogether > max) max = p.gamesTogether
  return max
}

/**
 * Returns true when a partner is in the "stack that doesn't work" zone:
 * 5+ games together AND either a flat-loss WR (≤15%) or a big negative
 * delta (≤ -30pp). At that point the data isn't a trend, it's a record —
 * the prose should call that out directly instead of using "trends below".
 */
function isSevereNegative(p: StackSynergyPartner): boolean {
  if (p.gamesTogether < 5) return false
  const wrPct = p.wrTogether * 100
  const delta = p.deltaPp ?? 0
  return wrPct <= 15 || delta <= -30
}

function composeFinding(
  best: StackSynergyPartner | null,
  worst: StackSynergyPartner | null,
  prose: StackSynergyPartner[],
  userOverallWr: number,
  bestSampleSmall: boolean,
  worstSampleSmall: boolean
): string {
  const overallPct = (userOverallWr * 100).toFixed(0)
  const lines: string[] = []
  if (best && best.deltaPp != null) {
    const sigQual = bestSampleSmall ? 'Small sample — ' : ''
    lines.push(
      `${sigQual}your best stack partner is ${best.personaName} — ${best.gamesTogether} games, ${(best.wrTogether * 100).toFixed(0)}% WR (+${best.deltaPp.toFixed(0)}pp vs your ${overallPct}% overall WR).`
    )
  }
  if (worst && worst.deltaPp != null) {
    if (isSevereNegative(worst)) {
      // Sharp framing for flat-loss / big-negative partners — see
      // isSevereNegative for the threshold. "Trends below" understates
      // a 0-7 record; calling it a stack that doesn't work is honest
      // about what the data actually is.
      const losses = worst.gamesTogether - worst.winsTogether
      lines.push(
        `${worst.personaName} across ${worst.gamesTogether} games: ${worst.winsTogether}-${losses}. That's not a trend, that's a stack that doesn't work — try a different role pair or sit it out.`
      )
    } else {
      const sigQual = worstSampleSmall ? 'Small sample — ' : ''
      lines.push(
        `${sigQual}${worst.personaName} trends below: ${worst.gamesTogether} games, ${(worst.wrTogether * 100).toFixed(0)}% WR (${worst.deltaPp.toFixed(0)}pp vs overall).`
      )
    }
  }
  if (lines.length === 0) {
    // No significant findings — neutral framing.
    const top = prose[0]
    if (top) {
      const deltaText = `${(top.deltaPp ?? 0) >= 0 ? '+' : ''}${(top.deltaPp ?? 0).toFixed(0)}pp`
      lines.push(
        `${prose.length} stack partner${prose.length === 1 ? '' : 's'} with ≥${MIN_FOR_PROSE} games. Most-frequent: ${top.personaName} (${top.gamesTogether} games, ${(top.wrTogether * 100).toFixed(0)}% WR, ${deltaText}) — within noise of your ${overallPct}% overall WR.`
      )
    }
  }
  return lines.join(' ')
}
