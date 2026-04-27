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
const MIN_FOR_CONFIDENT = 20

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

  // Build StackSynergyPartner records.
  const partners: StackSynergyPartner[] = []
  for (const p of activeMap.values()) {
    if (p.games < MIN_FOR_DISPLAY) continue

    // user WR in matches WITHOUT this partner. If 0 such matches exist, the
    // "vs solo" comparison is undefined — we surface as null rather than
    // defaulting to 0 (which would falsely make delta = wrTogether * 100).
    let withoutGames = 0
    let withoutWins = 0
    for (const [mid, won] of userOutcomes) {
      if (p.matchIds.has(mid)) continue
      withoutGames++
      if (won) withoutWins++
    }
    const wrTogether = p.wins / p.games
    const userWrWithoutPartner = withoutGames > 0 ? withoutWins / withoutGames : null
    const deltaPp = userWrWithoutPartner != null ? (wrTogether - userWrWithoutPartner) * 100 : null

    // Diagnostic — verify formula on real data.
    // eslint-disable-next-line no-console
    console.debug('[stack-synergy] partner', {
      partner: p.personaName,
      gamesTogether: p.games,
      winsTogether: p.wins,
      wrTogether: Number(wrTogether.toFixed(3)),
      withoutGames,
      withoutWins,
      userWrWithoutPartner: userWrWithoutPartner != null ? Number(userWrWithoutPartner.toFixed(3)) : null,
      deltaPp: deltaPp != null ? Number(deltaPp.toFixed(1)) : null,
    })

    // 95% CI for wrTogether.
    const se = Math.sqrt((wrTogether * (1 - wrTogether)) / p.games)
    const ciLow = Math.max(0, wrTogether - 1.96 * se)
    const ciHigh = Math.min(1, wrTogether + 1.96 * se)
    const isSignificant =
      userWrWithoutPartner != null &&
      (userWrWithoutPartner < ciLow || userWrWithoutPartner > ciHigh)

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

  const userOverallWr = computeWr(matches)
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

  // Significance + delta only meaningful for partners where we could compute
  // a comparison (have at least one without-partner match).
  const significant = partners.filter(
    (p) => p.isSignificant && p.gamesTogether >= MIN_FOR_PROSE && p.deltaPp != null
  )
  const best = significant.length > 0
    ? [...significant].sort((a, b) => (b.deltaPp ?? 0) - (a.deltaPp ?? 0))[0]
    : null
  const worstSig = significant.length > 0
    ? [...significant].sort((a, b) => (a.deltaPp ?? 0) - (b.deltaPp ?? 0))[0]
    : null
  const worst = worstSig && (worstSig.deltaPp ?? 0) < 0 ? worstSig : null

  // v7 severity rules:
  //   Healthy   — best with delta_pp >= +5 AND N >= 10 AND significant,
  //               AND no partner with delta_pp <= -10 AND N >= 10 AND significant
  //   Watch     — best is positive (>= +5, N >= 10) BUT at least one
  //               partner is significantly negative (<= -10, N >= 10)
  //   Concerning— best with N >= 10 has delta_pp < +5,
  //               OR all significant partners (N >= 10) trend negative
  //   (Unmeasured handled earlier when no partner with N >= MIN_FOR_PROSE)
  //
  // Partners with null delta (always-stacked) are not counted toward
  // severity — we can't make a comparison claim about them.
  const partnersN10 = partners.filter(
    (p) => p.gamesTogether >= MIN_FOR_NORMAL && p.deltaPp != null
  )
  const sigPositiveN10 = partnersN10.filter(
    (p) => p.isSignificant && (p.deltaPp ?? 0) >= 5
  )
  const sigNegativeN10 = partnersN10.filter(
    (p) => p.isSignificant && (p.deltaPp ?? 0) <= -10
  )
  const sigPartnersN10 = partnersN10.filter((p) => p.isSignificant)
  const bestN10 = partnersN10.length > 0
    ? [...partnersN10].sort((a, b) => (b.deltaPp ?? 0) - (a.deltaPp ?? 0))[0]
    : null
  const bestN10IsCarrying = bestN10 != null && (bestN10.deltaPp ?? 0) >= 5

  let severity: AnalysisResult['severity']
  if (bestN10IsCarrying && sigNegativeN10.length === 0) {
    severity = 'good'
  } else if (bestN10IsCarrying && sigNegativeN10.length > 0) {
    severity = 'ok'
  } else if (
    sigPartnersN10.length > 0 &&
    sigPartnersN10.every((p) => (p.deltaPp ?? 0) < 0)
  ) {
    severity = 'concerning'
  } else if (bestN10 != null && (bestN10.deltaPp ?? 0) < 5) {
    severity = 'concerning'
  } else {
    // No partner with N >= 10 has a computable delta. Don't cry wolf.
    severity = 'good'
  }
  void sigPositiveN10
  // eslint-disable-next-line no-console
  console.debug('[stack-synergy] severity', {
    severity,
    partnersN10Count: partnersN10.length,
    sigPositiveN10: sigPositiveN10.length,
    sigNegativeN10: sigNegativeN10.length,
    bestN10Delta: bestN10?.deltaPp ?? null,
  })

  let finding: string
  if (partnersForProse.length === 0) {
    finding = `${partners.length} stack partner${partners.length === 1 ? '' : 's'} detected with ${MIN_FOR_DISPLAY}–${MIN_FOR_PROSE - 1} games together — too small a sample for any individual to draw a conclusion from.`
  } else {
    finding = composeFinding(best, worst, partnersForProse)
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
  if (best && best.deltaPp != null) {
    roastFacts.best_partner = best.personaName
    roastFacts.best_wr = Math.round(best.wrTogether * 100)
    roastFacts.best_delta = Math.round(best.deltaPp)
  }
  if (worst && worst.deltaPp != null) {
    roastFacts.worst_partner = worst.personaName
    roastFacts.worst_wr = Math.round(worst.wrTogether * 100)
    roastFacts.worst_delta = Math.round(worst.deltaPp)
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

function composeFinding(
  best: StackSynergyPartner | null,
  worst: StackSynergyPartner | null,
  prose: StackSynergyPartner[]
): string {
  const lines: string[] = []
  if (best && best.deltaPp != null) {
    const sigQual = qualifier(best.gamesTogether)
    const sign = best.deltaPp >= 0 ? '+' : ''
    lines.push(
      `${sigQual}your best stack partner is ${best.personaName} — ${best.gamesTogether} games, ${(best.wrTogether * 100).toFixed(0)}% WR (${sign}${best.deltaPp.toFixed(0)}pp vs your solo WR).`
    )
  }
  if (worst && worst.deltaPp != null) {
    const sigQual = qualifier(worst.gamesTogether)
    lines.push(
      `${sigQual}${worst.personaName} trends below: ${worst.gamesTogether} games, ${(worst.wrTogether * 100).toFixed(0)}% WR (${worst.deltaPp.toFixed(0)}pp).`
    )
  }
  // Mention any partner where we couldn't compute the delta (always queues
  // with the user) so the "—" in the chart isn't a mystery.
  const alwaysWith = prose.filter((p) => p.deltaPp == null)
  if (alwaysWith.length > 0) {
    const names = alwaysWith.map((p) => p.personaName).join(', ')
    lines.push(
      `${names} ${alwaysWith.length === 1 ? 'queues' : 'queue'} with you in every match this window — can't compute a solo comparison.`
    )
  }
  if (lines.length === 0) {
    // No significant findings — neutral framing.
    const top = prose[0]
    if (top) {
      const deltaText =
        top.deltaPp != null
          ? `${top.deltaPp >= 0 ? '+' : ''}${top.deltaPp.toFixed(0)}pp`
          : '—'
      lines.push(
        `${prose.length} stack partner${prose.length === 1 ? '' : 's'} with ≥${MIN_FOR_PROSE} games. Most-frequent: ${top.personaName} (${top.gamesTogether} games, ${(top.wrTogether * 100).toFixed(0)}% WR, ${deltaText}) — within noise of your solo WR.`
      )
    }
  }
  return lines.join(' ')
}

function qualifier(games: number): string {
  if (games < MIN_FOR_NORMAL) return 'Small sample — '
  if (games < MIN_FOR_CONFIDENT) return ''
  return ''
}
