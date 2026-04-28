// Roast templates per card — English. (Taglish lives in
// `honest-mode/taglish-templates.ts` as a paid-tier feature, not yet
// wired to the UI.)
//
// Voice rules:
//   1. Roast the DECISION, never the person.
//   2. Every line cites a stat from the user's data — `validateRoastTemplate`
//      enforces this at module load (a template without any `{stat}`
//      placeholder is filtered out and warned in the console).
//   3. Allowed targets: hero pool spread, item choices, build patterns,
//      death timing, lane play, queue habits, stack composition,
//      post-loss requeue speed.
//   4. Forbidden: telling them to quit, attacks on intelligence/worth/
//      appearance/identity, attacks on friends as people, prescribing
//      fixes for behaviors we don't measure (TP scrolls, draft reading,
//      damage-vs-utility item splits, etc.).

import type { AnalysisId, AnalysisResult } from '../types'

export interface RoastTemplate {
  /** Returns true when this template is eligible for this card's data. */
  condition: (
    result: AnalysisResult,
    facts: Record<string, string | number>
  ) => boolean
  english: string
}

// Helper predicates so condition functions stay readable.
const isConcerning = (r: AnalysisResult) => r.severity === 'concerning'
const isWatch = (r: AnalysisResult) => r.severity === 'ok'
const isHealthy = (r: AnalysisResult) => r.severity === 'good'
const isStrong = (r: AnalysisResult) => r.severityLabel === 'Strong'

/**
 * Stack synergy — same threshold as `isSevereNegative` in stackSynergy.ts.
 * When a worst-partner record clears this gate, the dedicated severe
 * template owns the line; every other worst-partner-mentioning template
 * yields by including `!isSevereWorst(f)` in its condition.
 */
const isSevereWorst = (f: Record<string, string | number>): boolean =>
  f.worst_partner != null &&
  Number(f.worst_games ?? 0) >= 5 &&
  (Number(f.worst_wr ?? 100) <= 15 || Number(f.worst_delta ?? 0) <= -30)

export const ROAST_TEMPLATES: Partial<Record<AnalysisId, RoastTemplate[]>> = {
  // ─── Death timing ─────────────────────────────────────────────────────
  'death-timing': [
    {
      condition: (r) => isConcerning(r),
      english:
        "You die {deaths_per_game}x per game. At this point your hero is just farming the enemy team's gold for them.",
    },
    {
      condition: (r, f) => isConcerning(r) && Number(f.late_dpg ?? 0) >= 1.4,
      english:
        "Your 40-50min death rate is {late_dpg}x baseline. The hero pool of dead heroes is bigger than your actual hero pool.",
    },
    {
      condition: (r) => isConcerning(r),
      english:
        "{deaths_per_game} deaths/game vs {baseline_dpg} baseline, worst window {worst_window} min. Your hero is a fountain regular.",
    },
    {
      condition: (r) => isWatch(r),
      english:
        "{deaths_per_game} deaths/game, baseline {baseline_dpg}. Slightly leaky — your hero spends more time at fountain than at Roshan.",
    },
    {
      condition: (r) => isHealthy(r) && !isStrong(r),
      english:
        "{deaths_per_game} deaths/game, baseline {baseline_dpg}. Surviving is half the gameplay loop and you've got it down.",
    },
    {
      condition: (r) => isStrong(r),
      english:
        "{deaths_per_game} deaths/game vs {baseline_dpg} baseline. You almost respect your own buyback timer.",
    },
  ],

  // ─── Farm efficiency ──────────────────────────────────────────────────
  'farm-efficiency': [
    {
      condition: (r) => isConcerning(r),
      english:
        "GPM @20 is {gpm}, baseline is {baseline_gpm}. You're not farming, you're foraging.",
    },
    {
      condition: (r, f) => isConcerning(r) && Number(f.lh_at_10 ?? 99) < 35,
      english:
        "{lh_at_10} last hits at 10 min. The creeps die of old age before you can right-click them.",
    },
    {
      condition: (r) => isWatch(r),
      english:
        "GPM @20 is {gpm}, baseline {baseline_gpm}. {lh_at_10} LH @10 — the lane stage is where the deficit compounds.",
    },
    {
      condition: (r) => isHealthy(r) && !isStrong(r),
      english:
        "{gpm} GPM @20 vs {baseline_gpm} baseline. Farm hits the bar — that {lh_at_10} LH @10 is the foundation.",
    },
    {
      condition: (r) => isStrong(r),
      english:
        "{gpm} GPM @20 vs {baseline_gpm} baseline. You farm like the enemy team is a paid sparring partner.",
    },
  ],

  // ─── Item timing ──────────────────────────────────────────────────────
  'item-timing': [
    {
      condition: (r) => isConcerning(r),
      english:
        "{item} at {actual_min} min vs {target_min} target. By the time you finish it, the meta has changed.",
    },
    {
      condition: (r) => isConcerning(r),
      english:
        "On {hero}, your {item} lands at minute {actual_min} ({target_min} is the target). The window for that spike already closed two patches ago.",
    },
    {
      condition: (r) => isWatch(r),
      english:
        "{hero} → {item} median {actual_min} min, target {target_min}. That's the build hitting late, not on schedule.",
    },
    {
      condition: (r) => isHealthy(r),
      english:
        "{hero}: {item} on time at {actual_min} min (target {target_min}). The spike landed — the next thing to grade is whether you used it.",
    },
  ],

  // ─── Situational items ────────────────────────────────────────────────
  'situational-items': [
    {
      condition: (r, f) => isConcerning(r) && String(f.pattern ?? '') === 'stunlock',
      english:
        "BKB miss rate {miss_rate}% across {n} stunlock games. You skipped BKB so many times Valve thinks you're testing a new build.",
    },
    {
      condition: (r, f) => isConcerning(r) && String(f.pattern ?? '').startsWith('magic'),
      english:
        "{miss_rate}% miss rate on Pipe/BKB across {n} magic-burst games. The enemy nukers know your build before you do.",
    },
    {
      condition: (r) => isConcerning(r),
      english:
        "Your {pattern} counter miss rate is {miss_rate}% across {n} games. That's not a build, that's a coin flip.",
    },
    {
      condition: (r) => isWatch(r),
      english:
        "{miss_rate}% miss rate on the {pattern} counter ({n} games). You see the threat, you just don't itemize for it.",
    },
    {
      condition: (r) => isHealthy(r),
      english:
        "Build adapts to enemy lineups across {parsed_count} parsed matches. No recurring missed counters — the rare W in the situational-build column.",
    },
  ],

  // ─── Lane outcome ─────────────────────────────────────────────────────
  // Divergence templates fire when WR claims healthy but lane efficiency
  // is below the EFF_DIVERGENCE_THRESHOLD set in laneOutcome.ts — i.e.
  // you're winning lanes you should be losing on the scoreboard. The
  // `diverged` fact is set to 1 by the analysis when this happens.
  'lane-outcome': [
    {
      condition: (r) => isConcerning(r),
      english:
        "Won lane in {wins}/{total_lanes} games ({wr_pct}%). The 6-min mark hits and you've already filed for unemployment.",
    },
    {
      condition: (r) => isConcerning(r),
      english:
        "{wr_pct}% lane WR ({wins}/{total_lanes}). Most of those losses are pre-decided in the first wave equilibrium.",
    },
    {
      // Divergence variant — only fires when the analysis flagged it
      // (diverged == 1). The Watch and Healthy templates below explicitly
      // exclude this case (`diverged === 0`), so when divergence is
      // active this is the only eligible template — pickTemplate has
      // exactly one to choose from. That guarantees the honest mode
      // line is at least as sharp as the default mode prose.
      condition: (_r, f) => Number(f.diverged ?? 0) === 1,
      english:
        "{wr_pct}% lane WR off {efficiency}% efficiency. The W column is a lagging indicator — your farm side is still losing, the scoreboard just hasn't caught up.",
    },
    {
      // Generic Watch — explicitly does NOT fire on divergence (the
      // dedicated divergence template above owns that case).
      condition: (r, f) => isWatch(r) && Number(f.diverged ?? 0) === 0,
      english:
        "Lane WR {wr_pct}% ({wins}/{total_lanes}). One pull cycle every 53 seconds and this card flips next week.",
    },
    {
      condition: (r) => isHealthy(r) && !isStrong(r),
      english:
        "{wins}/{total_lanes} fixed lanes won ({wr_pct}%). The first 10 minutes already pay for themselves.",
    },
    {
      condition: (r) => isStrong(r),
      english:
        "{wr_pct}% lane WR ({wins}/{total_lanes}). The offlaner reports you for matchmaking abuse before the 5-min mark.",
    },
  ],

  // ─── Hero pool ────────────────────────────────────────────────────────
  // Templates lean on hero_count, games, top_hero, top_wr — all four are
  // role-split-sensitive (the top hero in the support subset isn't the
  // same as in all-games), so each view produces visibly different copy.
  'hero-pool': [
    {
      // Concerning + top hero is actively losing — name names.
      condition: (r, f) => isConcerning(r) && Number(f.top_wr ?? 100) < 45,
      english:
        "{top_hero} is your most-played at {top_wr}% WR across {games} games. {hero_count}-hero spread; the pool is the symptom, that one matchup is the disease.",
    },
    {
      // Concerning generic.
      condition: (r) => isConcerning(r),
      english:
        "{hero_count} heroes / {games} games. {top_hero} leads at {top_wr}% — the rest of the spread is what's dragging the WR.",
    },
    {
      condition: (r) => isWatch(r),
      english:
        "{hero_count} heroes across {games} games; {top_hero} is the anchor at {top_wr}%. Tighten the pool around them — the long tail is noise.",
    },
    {
      condition: (r) => isHealthy(r),
      english:
        "{hero_count} heroes / {games} games — pool is tight. {top_hero} at {top_wr}% is doing the lifting.",
    },
  ],

  // ─── Tilt / loss streak ───────────────────────────────────────────────
  // Templates weave streak length and the WR pair through the full line —
  // no generic "two losses, ten-min break" tail that reads identically
  // across role-split views. Streak length and post-loss WR shift per
  // subset, so each view produces a distinct line.
  tilt: [
    {
      // Queue-addiction: long streak AND meaningfully worse post-loss WR.
      condition: (r, f) =>
        isConcerning(r) &&
        Number(f.streak ?? 0) >= 4 &&
        Number(f.post_loss ?? 100) <= Number(f.overall ?? 0) - 10,
      english:
        "{streak}-streak in this window; post-loss WR drops to {post_loss}% from your {overall}% overall. Cap at two losses, not {streak}.",
    },
    {
      // Free-fall: post-loss WR is far below overall, regardless of streak.
      condition: (_r, f) =>
        Number(f.post_loss ?? 100) <= Number(f.overall ?? 0) - 15,
      english:
        "Post-loss WR {post_loss}% vs {overall}% overall — you don't tilt, you free-fall the moment you re-queue. Longest streak {streak}.",
    },
    {
      // Generic concerning fallback.
      condition: (r) => isConcerning(r),
      english:
        "{streak}-streak through {overall}% overall WR; post-loss bounces to {post_loss}%. The streak length is the warning sign.",
    },
    {
      // Borderline / Watch — keep mild.
      condition: (r) => isWatch(r),
      english:
        "{streak}-streak in this window. Bounce-back is intact ({post_loss}% post-loss vs {overall}% overall) — the streak length is the only soft spot.",
    },
    {
      // Healthy.
      condition: (r) => isHealthy(r),
      english:
        "Longest streak {streak} games; post-loss WR {post_loss}% sits with overall {overall}%. Queue discipline is rare — you have it.",
    },
  ],

  // ─── Stack synergy ────────────────────────────────────────────────────
  // Templates use {best_partner} / {worst_partner} which are filled with
  // the (possibly anonymized) display name in StackSynergyCard. Worst is
  // ALWAYS anonymized (Friend N) regardless of the toggle — see
  // StackSynergyCard.tsx for the rationale.
  //
  // Severe-negative carve-out: when worst_partner has 5+ games AND either
  // <=15% WR or <=-30pp delta, we route to the dedicated severe template
  // below. Every other worst-partner-mentioning template explicitly
  // excludes that case so the severe one is the only eligible match.
  'stack-synergy': [
    {
      // Severe-negative — flat-loss or big-negative partner. Mirrors
      // the default-mode "stack that doesn't work" prose. Threshold
      // matches isSevereNegative() in stackSynergy.ts.
      condition: (_r, f) =>
        f.worst_partner != null &&
        Number(f.worst_games ?? 0) >= 5 &&
        (Number(f.worst_wr ?? 100) <= 15 || Number(f.worst_delta ?? 0) <= -30),
      english:
        "{worst_partner} across {worst_games} games: {worst_wins}-{worst_losses}. That's not a trend, that's a stack that doesn't work — try a different role pair or sit it out.",
    },
    {
      // Concerning + has a significant negative partner — name them.
      // Yields to the severe template above when the data is that bad.
      condition: (r, f) =>
        isConcerning(r) &&
        f.worst_partner != null &&
        !isSevereWorst(f),
      english:
        "{worst_partner}: {worst_wr}% WR ({worst_delta}pp vs solo). The friendship is real, the synergy is fictional.",
    },
    {
      // Concerning + best partner exists but underperforms.
      condition: (r, f) => isConcerning(r) && f.best_partner != null,
      english:
        "Best stack partner is {best_partner} at +{best_delta}pp. Solid in isolation; not enough to carry a window of mixed pickings.",
    },
    {
      // Watch — both best and worst named. Yields to severe.
      condition: (r, f) =>
        isWatch(r) &&
        f.best_partner != null &&
        f.worst_partner != null &&
        !isSevereWorst(f),
      english:
        "{best_partner} carries the synergy ({best_delta}pp), {worst_partner} drags it ({worst_delta}pp). Reshuffle the role pairs.",
    },
    {
      // Watch — only best is sig.
      condition: (r, f) => isWatch(r) && f.best_partner != null,
      english:
        "{best_partner} pulls the stack up ({best_delta}pp). The rest are within noise — keep the duo, fill around it.",
    },
    {
      // Healthy — name the carry. Yields to severe so the disaster
      // doesn't get drowned out by a "lock this person in" mention
      // when the same window also has a 0-7 partner.
      condition: (r, f) =>
        isHealthy(r) && f.best_partner != null && !isSevereWorst(f),
      english:
        "{best_partner}: {best_wr}% WR (+{best_delta}pp). Lock this person in, ignore everyone else in your friends list.",
    },
  ],

  // ─── Vision ────────────────────────────────────────────────────────────
  // Headline metric is role-specific: support/flex graded on obs/game,
  // core graded on dewards/game. Templates lean on whichever stat is
  // role-relevant PLUS lifetime, so each view produces a different line
  // even at identical severity (the support subset's headline is obs,
  // the core subset's is dewards — visibly different copy).
  vision: [
    {
      // Support / flex placing fewer obs than baseline.
      condition: (r, f) =>
        isConcerning(r) && String(f.role ?? '') !== 'core',
      english:
        "{obs} obs/game vs {obs_baseline} baseline; wards live {seconds}s. As a {role}, vision is the lever you're not pulling.",
    },
    {
      // Core neglecting dewards.
      condition: (r, f) => isConcerning(r) && String(f.role ?? '') === 'core',
      english:
        "{dewards} dewards/game vs {dewards_baseline} target. Farm matters less when the enemy support reads your stack rotation 60s before you do.",
    },
    {
      // High vision-death mismatch — only fires when the mismatch was
      // actually computed and is meaningfully high.
      condition: (_r, f) => Number(f.mismatch ?? 0) >= 30,
      english:
        "{mismatch}% of deaths happen in unwarded regions, with wards living {seconds}s on average — placement is reading dewards instead of avoiding them.",
    },
    {
      // Wards die fast — surfaces when avg lifetime trails baseline by 60s+.
      condition: (_r, f) =>
        Number(f.seconds ?? 0) > 0 &&
        Number(f.seconds ?? 999) <= Number(f.lifetime_baseline_sec ?? 0) - 60,
      english:
        "Wards live {seconds}s vs {lifetime_baseline_sec}s baseline. Placement is reading dewards instead of avoiding them.",
    },
    {
      // Watch — role-aware copy with both lifetime and headline.
      condition: (r, f) => isWatch(r) && String(f.role ?? '') === 'core',
      english:
        "{dewards} dewards/game vs {dewards_baseline}; wards live {seconds}s. Closing enemy vision is the highest-ROI lever for cores at your bracket.",
    },
    {
      condition: (r) => isWatch(r),
      english:
        "{obs} obs/game vs {obs_baseline}; wards live {seconds}s. The cadence is the soft spot, not the count.",
    },
    {
      // Healthy core.
      condition: (r, f) => isHealthy(r) && String(f.role ?? '') === 'core',
      english:
        "{dewards} dewards/game vs {dewards_baseline}. Closing enemy vision faster than they close yours — the rare core W on this card.",
    },
    {
      // Healthy support / flex.
      condition: (r) => isHealthy(r),
      english:
        "{obs} obs/game vs {obs_baseline}; wards live {seconds}s. The vision input is doing the work — next thing to grade is what they actually see.",
    },
  ],
}
